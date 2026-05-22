import { useState, useRef, useEffect, Fragment } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Upload, Loader2, CheckCircle2, AlertTriangle, Camera, FileText, Save, ScanLine, X, ImagePlus,
  Plus, Search, SearchCheck, Box
} from "lucide-react";

interface LineItem {
  product_name: string;
  batch_number?: string | null;
  expiry_date?: string | null;
  manufacturing_date?: string | null;
  quantity: number;
  free_quantity?: number | null;
  purchase_price: number;
  mrp: number;
  gst_percentage: number;
  discount_percentage?: number | null;
  hsn_code?: string | null;
  total_price: number;
  matched_product_id?: string | null;
  matched_product_name?: string | null;
  matching_confidence?: number | null;
  matching_method?: string | null;
  extraction_confidence?: number | null;
  raw_text?: string | null;
  needs_review?: boolean;
  matching_details?: {
    method: string;
    confidence: number;
    auto_accepted: boolean;
    raw_confidence?: number;
    capped_confidence?: number;
  } | null;
  _is_resolved?: boolean; // track if user handled it inline
}

interface FormatAnalysis {
  format_type: "standard_table" | "compact_grid" | "multi_section" | "gst_compliant" | "pharma_specific" | "unstructured";
  format_confidence: number;
  page_layout?: string;
  field_positions?: {
    supplier_info?: string;
    invoice_details?: string;
    line_items_table?: string;
    totals_section?: string;
    tax_breakdown?: string | null;
  };
  table_structure?: {
    has_header_row?: boolean;
    column_order?: string[];
    row_pattern?: string;
    multi_line_items?: boolean;
  };
  special_features?: string[];
}

interface Product {
  id: string;
  name: string;
}

interface ExtractedInvoice {
  supplier_name: string;
  supplier_gst?: string | null;
  supplier_dl_number?: string | null;
  supplier_address?: string | null;
  supplier_phone?: string | null;
  supplier_email?: string | null;
  invoice_number: string;
  invoice_date: string;
  challan_number?: string | null;
  line_items: LineItem[];
  freight_charges?: number | null;
  handling_charges?: number | null;
  other_charges?: number | null;
  discount_amount?: number | null;
  gst_amount?: number | null;
  total_amount: number;
  matched_supplier_id?: string | null;
  format_analysis?: FormatAnalysis;
  learned_formats?: { format_type: string; format_confidence: number; column_mappings?: Record<string, string[]> }[];
}

interface SelectedFile {
  file: File;
  preview: string | null;
  id: string;
}

export default function ScanInvoice() {
  const { user, loading: authLoading } = useAuth();
  const { companyId } = useBusiness();
  const { toast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [scanning, setScanning] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingChallans, setPendingChallans] = useState<any[]>([]);
  const [selectedChallanIds, setSelectedChallanIds] = useState<string[]>([]);
  const [loadingChallans, setLoadingChallans] = useState(false);

  // Inline resolution state
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [resolving, setResolving] = useState(false);

  // Fetch products for manual mapping
  useEffect(() => {
    if (!companyId) return;
    const fetchProducts = async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (data) setProducts(data);
    };
    fetchProducts();
  }, [companyId]);

  // Restore extracted invoice from localStorage on mount
  const STORAGE_KEY = `scan_invoice_draft_${companyId}`;
  const [extracted, setExtracted] = useState<ExtractedInvoice | null>(() => {
    try {
      const saved = localStorage.getItem(`scan_invoice_draft_${companyId}`);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  // Persist to localStorage whenever extracted changes
  useEffect(() => {
    if (!companyId) return;
    if (extracted) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(extracted));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [extracted, STORAGE_KEY]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const handleFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    setExtracted(null);
    setSaved(false);

    const newFiles: SelectedFile[] = selectedFiles.map((f) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let preview: string | null = null;
      if (f.type.startsWith("image/")) {
        preview = URL.createObjectURL(f);
      }
      return { file: f, preview, id };
    });

    setFiles((prev) => [...prev, ...newFiles]);
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f?.preview) URL.revokeObjectURL(f.preview);
      return prev.filter((x) => x.id !== id);
    });
  };

  const handleScan = async () => {
    if (files.length === 0 || !companyId) return;
    setScanning(true);
    setExtracted(null);
    setUploadProgress(0);

    try {
      // Upload all files to storage
      const filePaths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i].file;
        const filePath = `${companyId}/${Date.now()}_${i}_${f.name}`;
        const { error: uploadError } = await supabase.storage
          .from("invoices")
          .upload(filePath, f);
        if (uploadError) throw uploadError;
        filePaths.push(filePath);
        setUploadProgress(Math.round(((i + 1) / files.length) * 50));
      }

      setUploadProgress(60);

      // Call scan edge function with all file paths
      const { data, error } = await supabase.functions.invoke("scan-invoice", {
        body: { file_paths: filePaths, company_id: companyId },
      });

      setUploadProgress(90);

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setExtracted(data as ExtractedInvoice);
      setUploadProgress(100);
      toast({
        title: "Invoice Scanned",
        description: `Found ${data.line_items?.length || 0} items from ${files.length} image(s)`,
      });

      // Fetch pending challans with product overlap
      const matchedSupplierId = (data as any).matched_supplier_id;
      if (matchedSupplierId) {
        fetchPendingChallans(matchedSupplierId, (data as ExtractedInvoice).line_items);
      }
    } catch (err: any) {
      console.error("Scan error:", err);
      let message = err.message || "Unknown error";
      try {
        if (err.context) {
          const text = await err.context.text();
          const body = JSON.parse(text);
          if (body?.detail) message = `[Stage ${body.stage}] ${body.detail}`;
          else if (body?.error) message = body.error;
        }
      } catch { /* use default message */ }
      toast({ title: "Scan Failed", description: message, variant: "destructive" });
    } finally {
      setScanning(false);
      setUploadProgress(0);
    }
  };

  const fetchPendingChallans = async (supplierId: string, lineItems: LineItem[]) => {
    if (!companyId) return;
    setLoadingChallans(true);
    try {
      const { data: challans } = await supabase
        .from("purchase_orders")
        .select("id, order_number, challan_number, order_date, total_amount")
        .eq("supplier_id", supplierId)
        .eq("is_challan", true)
        .is("converted_from_challan_id", null)
        .eq("company_id", companyId)
        .order("order_date", { ascending: false });

      if (!challans?.length) { setPendingChallans([]); return; }

      const { data: items } = await supabase
        .from("purchase_order_items")
        .select("purchase_order_id, product_id, quantity, unit_price")
        .in("purchase_order_id", challans.map(c => c.id));

      const invoiceProductIds = new Set(
        lineItems.filter(item => item.matched_product_id).map(item => item.matched_product_id!)
      );

      const itemsByChallan = new Map<string, any[]>();
      (items || []).forEach(item => {
        if (!itemsByChallan.has(item.purchase_order_id)) itemsByChallan.set(item.purchase_order_id, []);
        itemsByChallan.get(item.purchase_order_id)!.push(item);
      });

      const relevantChallans = challans.filter(c => {
        const challanItems = itemsByChallan.get(c.id) || [];
        return challanItems.some(i => invoiceProductIds.has(i.product_id));
      });

      setPendingChallans(relevantChallans.map(c => ({
        ...c,
        _items: itemsByChallan.get(c.id) || [],
        _overlapCount: (itemsByChallan.get(c.id) || []).filter(i => invoiceProductIds.has(i.product_id)).length,
      })));
    } catch (err) {
      console.error("Failed to fetch pending challans:", err);
    } finally {
      setLoadingChallans(false);
    }
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    if (!extracted) return;
    const items = [...extracted.line_items];
    items[index] = { ...items[index], [field]: value };
    setExtracted({ ...extracted, line_items: items });
  };

  const handleSave = async () => {
    if (!extracted || !companyId || !user) return;
    setSaving(true);

    try {
      // Validate batch + expiry: batch number is optional (MRP_xxx fallback allowed),
      // but if batch is provided, expiry must also be present (never auto-generate)
      const missingExpiry: number[] = [];
      extracted.line_items.forEach((item, i) => {
        if (item.batch_number && item.batch_number.trim() && !item.expiry_date) {
          missingExpiry.push(i + 1);
        }
      });
      if (missingExpiry.length > 0) {
        toast({
          title: "Expiry Date Required",
          description: `Lines ${missingExpiry.slice(0, 5).join(", ")}${missingExpiry.length > 5 ? "…" : ""} have batch numbers but no expiry date. Expiry must be manually entered or extracted from the invoice.`,
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // 1. Supplier: match or create with full details
      let supplierId = extracted.matched_supplier_id;
      if (!supplierId) {
        const { data: newSupplier, error: sErr } = await supabase
          .from("suppliers")
          .insert({
            name: extracted.supplier_name,
            gst_number: extracted.supplier_gst || null,
            drug_license_number: extracted.supplier_dl_number || null,
            address: extracted.supplier_address || null,
            phone: extracted.supplier_phone || null,
            email: extracted.supplier_email || null,
            company_id: companyId,
          })
          .select("id")
          .single();
        if (sErr) throw sErr;
        supplierId = newSupplier.id;
      }

      // 2. Create Purchase Order
      const orderNumber = `PO-SCAN-${Date.now().toString(36).toUpperCase()}`;
      const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          order_number: orderNumber,
          supplier_id: supplierId,
          company_id: companyId,
          invoice_number: extracted.invoice_number,
          challan_number: extracted.challan_number || null,
          order_date: extracted.invoice_date,
          total_amount: extracted.total_amount,
          gst_amount: extracted.gst_amount || 0,
          discount_amount: extracted.discount_amount || 0,
          freight_charges: extracted.freight_charges || 0,
          handling_charges: extracted.handling_charges || 0,
          other_charges: extracted.other_charges || 0,
          status: "pending",
          is_challan: false,
          created_by: user.id,
          notes: "Created via AI Invoice Scanner",
        })
        .select("id")
        .single();
      if (poErr) throw poErr;

      // Mark selected challans as converted
      if (selectedChallanIds.length > 0) {
        await supabase
          .from("purchase_orders")
          .update({ converted_from_challan_id: po.id, is_challan: false })
          .in("id", selectedChallanIds);
      }

      // 3. Process each line item — create products if needed, insert PO items, prepare batch data
      const batchPayload: any[] = [];
      for (const item of extracted.line_items) {
        let productId = item.matched_product_id;
        if (!productId) {
          const { data: newProd, error: pErr } = await supabase
            .from("products")
            .insert({
              name: item.product_name,
              manufacturer: extracted.supplier_name,
              mrp: item.mrp,
              purchase_price: item.purchase_price,
              gst_percentage: item.gst_percentage,
              hsn_code: item.hsn_code || null,
              company_id: companyId,
            })
            .select("id")
            .single();
          if (pErr) throw pErr;
          productId = newProd.id;
        }

        // Insert PO item with separate quantity and free_quantity
        await supabase.from("purchase_order_items").insert({
          purchase_order_id: po.id,
          product_id: productId,
          quantity: item.quantity,
          free_quantity: item.free_quantity || 0,
          unit_price: item.purchase_price,
          gst_percentage: item.gst_percentage,
          discount_percentage: item.discount_percentage || 0,
          total_price: item.total_price,
          company_id: companyId,
        });

        // Prepare batch for RPC — includes batch_number and expiry
        batchPayload.push({
          product_id: productId,
          batch_number: item.batch_number || null,
          quantity: item.quantity + (item.free_quantity || 0),
          purchase_price: item.purchase_price,
          mrp: item.mrp,
          expiry_date: item.expiry_date || null,
          manufacturing_date: item.manufacturing_date || null,
          supplier_id: supplierId,
          company_id: companyId,
        });
      }

      // 4. Use the proper RPC to receive inventory batches (handles merge/create logic)
      const { error: rpcError } = await supabase.rpc("receive_purchase_batches", {
        _batches: batchPayload,
        _purchase_order_id: po.id,
      });
      if (rpcError) throw rpcError;

      // 5. Create payment record so it appears in accounts
      const supplierName = extracted.supplier_name;
      await supabase.from("payments").insert({
        payment_type: "debit",
        reference_type: "purchase_order",
        reference_id: po.id,
        reference_number: orderNumber,
        party_type: "supplier",
        party_name: supplierName,
        amount: extracted.total_amount,
        payment_method: "credit",
        payment_date: extracted.invoice_date,
        company_id: companyId,
        created_by: user.id,
        notes: `AI Scanned Invoice: ${extracted.invoice_number}`,
      });

      setSaved(true);
      localStorage.removeItem(STORAGE_KEY);
      toast({ title: "Invoice Saved!", description: `PO ${orderNumber} created with ${extracted.line_items.length} items, inventory received & payment recorded.` });
    } catch (err: any) {
      console.error("Save error:", err);
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleInlineMap = async (index: number, productId: string, productName: string) => {
    if (!extracted || !companyId || !user) return;
    setResolving(true);
    try {
      const item = extracted.line_items[index];
      
      // Update local state
      updateLineItem(index, "matched_product_id", productId);
      updateLineItem(index, "matched_product_name", productName);
      updateLineItem(index, "matching_confidence", 100);
      updateLineItem(index, "matching_method", "manual");
      updateLineItem(index, "_is_resolved", true);

      // Immediately create alias for future
      let supplierId = extracted.matched_supplier_id;
      if (supplierId) {
        // Normalize name
        const { data: norm } = await supabase.rpc('normalize_product_text', { input_text: item.product_name });
        const normalized = (norm as string) || item.product_name;
        
        await supabase.from("vendor_product_aliases").upsert({
          supplier_id: supplierId,
          vendor_product_name: item.product_name,
          normalized_name: normalized,
          product_id: productId,
          confidence_score: 100,
          is_approved: true,
          approved_by: user.id,
        }, { onConflict: "supplier_id,vendor_product_name", ignoreDuplicates: false });
      }

      toast({ title: "Resolved", description: "Product mapped successfully." });
      setExpandedRow(null);
      setProductSearch("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setResolving(false);
    }
  };

  const handleInlineCreate = async (index: number, newProdData: any) => {
    if (!extracted || !companyId || !user) return;
    setResolving(true);
    try {
      const item = extracted.line_items[index];

      // 1. Create product in DB immediately
      const { data: prod, error: prodErr } = await supabase
        .from("products")
        .insert({
          company_id: companyId,
          name: newProdData.name.trim(),
          generic_name: newProdData.generic_name || "",
          manufacturer: newProdData.manufacturer || "",
          strength: newProdData.strength || "",
          category: newProdData.category || "",
          mrp: newProdData.mrp ? parseFloat(newProdData.mrp) : 0,
          purchase_price: newProdData.purchase_price ? parseFloat(newProdData.purchase_price) : 0,
          gst_percentage: parseFloat(newProdData.gst_percentage) || 12,
          is_active: true,
        })
        .select("id, name")
        .single();
      if (prodErr) throw prodErr;

      // Update local state
      updateLineItem(index, "matched_product_id", prod.id);
      updateLineItem(index, "matched_product_name", prod.name);
      updateLineItem(index, "matching_confidence", 100);
      updateLineItem(index, "matching_method", "manual");
      updateLineItem(index, "_is_resolved", true);

      // Create alias
      let supplierId = extracted.matched_supplier_id;
      if (supplierId) {
        const { data: norm } = await supabase.rpc('normalize_product_text', { input_text: item.product_name });
        const normalized = (norm as string) || item.product_name;
        
        await supabase.from("vendor_product_aliases").upsert({
          supplier_id: supplierId,
          vendor_product_name: item.product_name,
          normalized_name: normalized,
          product_id: prod.id,
          confidence_score: 100,
          is_approved: true,
          approved_by: user.id,
        }, { onConflict: "supplier_id,vendor_product_name", ignoreDuplicates: false });
      }

      // Generate and store semantic embedding (non-blocking)
      try {
        const { data: embedData, error: embedError } = await supabase.functions.invoke("embed-text", {
          body: { texts: [prod.name] },
        });
        if (!embedError && embedData?.embeddings?.[0]) {
          await supabase.from("product_embeddings").upsert({
            product_id: prod.id,
            company_id: companyId,
            embedding: JSON.stringify(embedData.embeddings[0]),
            model: "nomic-ai/nomic-embed-text-v1.5",
            generated_at: new Date().toISOString(),
          }, { onConflict: "product_id" });
          await supabase.from("products").update({ embedding_needs_update: false }).eq("id", prod.id);
        }
      } catch (embedErr) {
        console.error("Failed to generate product embedding:", embedErr);
      }

      toast({ title: "Product Created", description: `"${prod.name}" has been added.` });
      setExpandedRow(null);

      // Refresh products list
      const { data: newProducts } = await supabase
        .from("products")
        .select("id, name")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (newProducts) setProducts(newProducts);
      
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="AI Invoice Scanner" description="Upload purchase invoice images to auto-extract and import data" />

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ScanLine className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Upload Invoice Images</CardTitle>
              <CardDescription>Upload one or more images (JPEG, PNG, WebP) of the same invoice. Multi-page invoices? Add each page as a separate image.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label>Select Image(s)</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handleFilesSelect}
                className="mt-1"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={scanning}
              >
                <ImagePlus className="h-4 w-4 mr-2" /> Add More
              </Button>
              <Button onClick={handleScan} disabled={files.length === 0 || scanning || !companyId} size="lg">
                {scanning ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning...</>
                ) : (
                  <><Camera className="h-4 w-4 mr-2" /> Scan {files.length > 0 ? `${files.length} Image${files.length > 1 ? "s" : ""}` : "Invoice"}</>
                )}
              </Button>
            </div>
          </div>

          {scanning && uploadProgress > 0 && (
            <div className="space-y-1">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {uploadProgress < 50 ? "Uploading images..." : uploadProgress < 90 ? "AI is extracting data..." : "Almost done..."}
              </p>
            </div>
          )}

          {/* Image Previews */}
          {files.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{files.length} image{files.length > 1 ? "s" : ""} selected</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {files.map((sf, idx) => (
                  <div key={sf.id} className="relative group border rounded-lg overflow-hidden bg-muted">
                    {sf.preview ? (
                      <img src={sf.preview} alt={`Page ${idx + 1}`} className="w-full h-32 object-cover" />
                    ) : (
                      <div className="w-full h-32 flex items-center justify-center">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute top-1 left-1">
                      <Badge variant="secondary" className="text-[10px]">Page {idx + 1}</Badge>
                    </div>
                    <button
                      onClick={() => removeFile(sf.id)}
                      className="absolute top-1 right-1 rounded-full bg-destructive text-destructive-foreground p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="px-2 py-1 text-[10px] text-muted-foreground truncate">{sf.file.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extracted Data Review */}
      {extracted && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" /> Extracted Invoice Data
                </CardTitle>
                {extracted.format_analysis && (
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={extracted.format_analysis.format_confidence >= 80 ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {extracted.format_analysis.format_type.replace("_", " ").toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(extracted.format_analysis.format_confidence)}% confidence
                    </span>
                  </div>
                )}
              </div>
              {extracted.format_analysis?.table_structure && (
                <div className="mt-2 text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Layout:</span> 
                    {extracted.format_analysis.page_layout?.replace(/_/g, " ")}
                  </div>
                  {extracted.format_analysis.table_structure.column_order && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Columns:</span> 
                      {extracted.format_analysis.table_structure.column_order.join(" → ")}
                    </div>
                  )}
                  {extracted.format_analysis.special_features && extracted.format_analysis.special_features.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Features:</span> 
                      {extracted.format_analysis.special_features.join(", ")}
                    </div>
                  )}
                  {extracted.learned_formats && extracted.learned_formats.length > 0 && (
                    <div className="flex items-center gap-2 text-green-600">
                      <span className="font-medium">Learned:</span> 
                      {extracted.learned_formats.length} previous format{extracted.learned_formats.length > 1 ? "s" : ""} stored for this supplier
                    </div>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Supplier Details */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Supplier</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={extracted.supplier_name}
                      onChange={(e) => setExtracted({ ...extracted, supplier_name: e.target.value })}
                    />
                    {extracted.matched_supplier_id && <Badge variant="secondary" className="text-xs whitespace-nowrap">Matched</Badge>}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Supplier GST</Label>
                  <Input
                    value={extracted.supplier_gst || ""}
                    onChange={(e) => setExtracted({ ...extracted, supplier_gst: e.target.value })}
                    placeholder="GST Number"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">DL Number</Label>
                  <Input
                    value={extracted.supplier_dl_number || ""}
                    onChange={(e) => setExtracted({ ...extracted, supplier_dl_number: e.target.value })}
                    placeholder="Drug License"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <Input
                    value={extracted.supplier_phone || ""}
                    onChange={(e) => setExtracted({ ...extracted, supplier_phone: e.target.value })}
                    placeholder="Phone"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input
                    value={extracted.supplier_email || ""}
                    onChange={(e) => setExtracted({ ...extracted, supplier_email: e.target.value })}
                    placeholder="Email"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Address</Label>
                  <Input
                    value={extracted.supplier_address || ""}
                    onChange={(e) => setExtracted({ ...extracted, supplier_address: e.target.value })}
                    placeholder="Address"
                  />
                </div>
              </div>

              {/* Invoice Details */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Invoice #</Label>
                  <Input
                    value={extracted.invoice_number}
                    onChange={(e) => setExtracted({ ...extracted, invoice_number: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Date</Label>
                  <Input
                    type="date"
                    value={extracted.invoice_date}
                    onChange={(e) => setExtracted({ ...extracted, invoice_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Challan #</Label>
                  <Input
                    value={extracted.challan_number || ""}
                    onChange={(e) => setExtracted({ ...extracted, challan_number: e.target.value })}
                    placeholder="Challan Number"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Total Amount</Label>
                  <Input
                    type="number"
                    value={extracted.total_amount}
                    onChange={(e) => setExtracted({ ...extracted, total_amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">GST Amount</Label>
                  <Input type="number" value={extracted.gst_amount || 0} onChange={(e) => setExtracted({ ...extracted, gst_amount: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Discount</Label>
                  <Input type="number" value={extracted.discount_amount || 0} onChange={(e) => setExtracted({ ...extracted, discount_amount: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Freight</Label>
                  <Input type="number" value={extracted.freight_charges || 0} onChange={(e) => setExtracted({ ...extracted, freight_charges: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Handling</Label>
                  <Input type="number" value={extracted.handling_charges || 0} onChange={(e) => setExtracted({ ...extracted, handling_charges: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Other</Label>
                  <Input type="number" value={extracted.other_charges || 0} onChange={(e) => setExtracted({ ...extracted, other_charges: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Challan Picking */}
          {pendingChallans.length > 0 && (
            <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-950/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Box className="h-4 w-4 text-blue-500" />
                  Pending Challans with Matching Products
                </CardTitle>
                <CardDescription>
                  Select challans to link with this invoice. Selected challans will be marked as converted on save.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pendingChallans.map(challan => (
                    <label key={challan.id} className="flex items-center gap-3 p-3 border rounded-lg bg-background hover:bg-accent/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedChallanIds.includes(challan.id)}
                        onChange={() => {
                          setSelectedChallanIds(prev =>
                            prev.includes(challan.id)
                              ? prev.filter(id => id !== challan.id)
                              : [...prev, challan.id]
                          );
                        }}
                        className="h-4 w-4"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{challan.challan_number || challan.order_number}</span>
                          <Badge variant="outline" className="text-[10px]">{challan.order_date}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {challan._overlapCount} matching product(s) · ₹{Number(challan.total_amount).toLocaleString("en-IN")}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Line Items ({extracted.line_items.length})</CardTitle>
              <CardDescription>Review and edit extracted items before saving</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Product</TableHead>
                      <TableHead className="min-w-[100px]">Batch</TableHead>
                      <TableHead className="min-w-[120px]">Expiry</TableHead>
                      <TableHead className="w-20">Qty</TableHead>
                      <TableHead className="w-20">Free</TableHead>
                      <TableHead className="w-24">Rate</TableHead>
                      <TableHead className="w-24">MRP</TableHead>
                      <TableHead className="w-20">GST%</TableHead>
                      <TableHead className="w-24">Total</TableHead>
                      <TableHead className="w-20">Match</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {extracted.line_items.map((item, i) => {
                      const needsResolution = !item._is_resolved && (item.needs_review === true || !item.matched_product_id);
                      const isExpanded = expandedRow === i;

                      return (
                        <Fragment key={i}>
                          <TableRow className={needsResolution ? "bg-orange-50/50 dark:bg-orange-950/20" : ""}>
                            <TableCell>
                              <Input value={item.product_name} onChange={(e) => updateLineItem(i, "product_name", e.target.value)} className="text-xs h-8" />
                            </TableCell>
                            <TableCell>
                              <Input value={item.batch_number || ""} onChange={(e) => updateLineItem(i, "batch_number", e.target.value)} className="text-xs h-8" />
                            </TableCell>
                            <TableCell>
                              <Input type="date" value={item.expiry_date || ""} onChange={(e) => updateLineItem(i, "expiry_date", e.target.value)} className="text-xs h-8" />
                            </TableCell>
                            <TableCell>
                              <Input type="number" value={item.quantity} onChange={(e) => updateLineItem(i, "quantity", parseInt(e.target.value) || 0)} className="text-xs h-8" />
                            </TableCell>
                            <TableCell>
                              <Input type="number" value={item.free_quantity || 0} onChange={(e) => updateLineItem(i, "free_quantity", parseInt(e.target.value) || 0)} className="text-xs h-8" />
                            </TableCell>
                            <TableCell>
                              <Input type="number" value={item.purchase_price} onChange={(e) => updateLineItem(i, "purchase_price", parseFloat(e.target.value) || 0)} className="text-xs h-8" />
                            </TableCell>
                            <TableCell>
                              <Input type="number" value={item.mrp} onChange={(e) => updateLineItem(i, "mrp", parseFloat(e.target.value) || 0)} className="text-xs h-8" />
                            </TableCell>
                            <TableCell>
                              <Input type="number" value={item.gst_percentage} onChange={(e) => updateLineItem(i, "gst_percentage", parseFloat(e.target.value) || 0)} className="text-xs h-8" />
                            </TableCell>
                            <TableCell>
                              <Input type="number" value={item.total_price} onChange={(e) => updateLineItem(i, "total_price", parseFloat(e.target.value) || 0)} className="text-xs h-8" />
                            </TableCell>
                            <TableCell>
                              {item.matched_product_id && (!needsResolution || item._is_resolved) ? (
                                <div className="flex flex-col gap-0.5">
                                  <Badge className="text-[10px] bg-green-500 hover:bg-green-600 cursor-default w-fit">✓ {Math.round(item.matching_confidence || 100)}%</Badge>
                                  {item.matching_method && item.matching_method !== 'exact' && (
                                    <span className="text-[9px] text-muted-foreground capitalize">{item.matching_method}</span>
                                  )}
                                  {item.matching_details && !item.matching_details.auto_accepted && (
                                    <span className="text-[9px] text-amber-600">reviewed</span>
                                  )}
                                  {item.extraction_confidence != null && item.extraction_confidence < 90 && (
                                    <span className="text-[9px] text-amber-600">extract: {Math.round(item.extraction_confidence)}%</span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  {item.matched_product_id && (
                                    <Badge className="text-[10px] bg-yellow-500 w-fit">~ {Math.round(item.matching_confidence || 0)}%</Badge>
                                  )}
                                  {!item.matched_product_id && (
                                    <Badge variant="outline" className="text-[10px] border-orange-400 text-orange-500 w-fit">New</Badge>
                                  )}
                                  {item.needs_review && item.matched_product_id && (
                                    <span className="text-[9px] text-amber-600">needs review</span>
                                  )}
                                  {item.extraction_confidence != null && (
                                    <span className="text-[9px] text-muted-foreground">
                                      extract: {Math.round(item.extraction_confidence)}%
                                    </span>
                                  )}
                                  <Button 
                                    size="sm" 
                                    variant={isExpanded ? "default" : "outline"}
                                    className="h-6 text-[10px] px-2 w-fit"
                                    onClick={() => setExpandedRow(isExpanded ? null : i)}
                                  >
                                    Resolve
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={10} className="bg-muted/30 p-0 border-b">
                                <div className="p-4 flex flex-col gap-3">
                                  <div className="font-semibold text-sm flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                                    Resolve Product Mapping for: <span className="text-primary">{item.product_name}</span>
                                  </div>
                                  {item.raw_text && (
                                    <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded border">
                                      <span className="font-medium">Raw OCR:</span> {item.raw_text}
                                    </div>
                                  )}
                                  <div className="grid grid-cols-2 gap-6">
                                    {/* Column 1: Map to Existing */}
                                    <div className="space-y-3 border rounded-lg p-3 bg-background shadow-sm">
                                      <h4 className="font-medium text-sm flex items-center gap-2"><SearchCheck className="h-4 w-4 text-blue-500" /> Map to Existing Product</h4>
                                      <div className="space-y-2">
                                        <Input 
                                          placeholder="Search existing products..." 
                                          value={productSearch}
                                          onChange={(e) => setProductSearch(e.target.value)}
                                          className="h-8 text-xs"
                                        />
                                        <div className="max-h-[140px] overflow-y-auto border rounded divide-y">
                                          {products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 20).map(p => (
                                            <div key={p.id} className="flex items-center justify-between p-2 text-xs hover:bg-accent group">
                                              <span className="truncate pr-2">{p.name}</span>
                                              <Button 
                                                size="sm" 
                                                variant="outline" 
                                                className="h-6 text-[10px] px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => handleInlineMap(i, p.id, p.name)}
                                                disabled={resolving}
                                              >
                                                Map to this
                                              </Button>
                                            </div>
                                          ))}
                                          {products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                                            <div className="p-4 text-xs text-muted-foreground text-center">No products found</div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Column 2: Create New */}
                                    <div className="space-y-3 border rounded-lg p-3 bg-background shadow-sm">
                                      <h4 className="font-medium text-sm flex items-center gap-2"><Box className="h-4 w-4 text-emerald-500" /> Create New Product</h4>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div className="col-span-2">
                                          <Label className="text-[10px]">Product Name *</Label>
                                          <Input id={`new-name-${i}`} defaultValue={item.product_name} className="h-7 text-xs" />
                                        </div>
                                        <div className="col-span-2">
                                          <Label className="text-[10px]">Manufacturer</Label>
                                          <Input id={`new-mfg-${i}`} defaultValue={extracted.supplier_name} className="h-7 text-xs" />
                                        </div>
                                        <div>
                                          <Label className="text-[10px]">Generic Name</Label>
                                          <Input id={`new-generic-${i}`} placeholder="e.g. Paracetamol" className="h-7 text-xs" />
                                        </div>
                                        <div>
                                          <Label className="text-[10px]">Strength</Label>
                                          <Input id={`new-strength-${i}`} placeholder="e.g. 500mg" className="h-7 text-xs" />
                                        </div>
                                        <div>
                                          <Label className="text-[10px]">Category</Label>
                                          <Input id={`new-cat-${i}`} placeholder="e.g. Tablets" className="h-7 text-xs" />
                                        </div>
                                        <div>
                                          <Label className="text-[10px]">MRP (₹)</Label>
                                          <Input id={`new-mrp-${i}`} defaultValue={item.mrp} type="number" className="h-7 text-xs" />
                                        </div>
                                        <div>
                                          <Label className="text-[10px]">Purchase Price (₹)</Label>
                                          <Input id={`new-price-${i}`} defaultValue={item.purchase_price} type="number" className="h-7 text-xs" />
                                        </div>
                                        <div>
                                          <Label className="text-[10px]">GST %</Label>
                                          <Input id={`new-gst-${i}`} defaultValue={item.gst_percentage} type="number" className="h-7 text-xs" />
                                        </div>
                                        <div className="col-span-2 flex items-end">
                                          <Button 
                                            className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white mt-1" 
                                            disabled={resolving}
                                            onClick={() => {
                                              const name = (document.getElementById(`new-name-${i}`) as HTMLInputElement).value;
                                              const manufacturer = (document.getElementById(`new-mfg-${i}`) as HTMLInputElement).value;
                                              const generic_name = (document.getElementById(`new-generic-${i}`) as HTMLInputElement).value;
                                              const strength = (document.getElementById(`new-strength-${i}`) as HTMLInputElement).value;
                                              const category = (document.getElementById(`new-cat-${i}`) as HTMLInputElement).value;
                                              const mrp = (document.getElementById(`new-mrp-${i}`) as HTMLInputElement).value;
                                              const purchase_price = (document.getElementById(`new-price-${i}`) as HTMLInputElement).value;
                                              const gst = (document.getElementById(`new-gst-${i}`) as HTMLInputElement).value;
                                              
                                              handleInlineCreate(i, {
                                                name, manufacturer, generic_name, strength, category, mrp, 
                                                gst_percentage: gst || item.gst_percentage,
                                                purchase_price: purchase_price || item.purchase_price
                                              });
                                            }}
                                          >
                                            {resolving ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <Plus className="h-3 w-3 mr-1" />}
                                            Save & Map
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  Unmatched products will be created automatically. Review carefully before saving.
                </div>
                <Button onClick={handleSave} disabled={saving || saved} size="lg">
                  {saving ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                  ) : saved ? (
                    <><CheckCircle2 className="h-4 w-4 mr-2" /> Saved!</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" /> Create PO & Inventory</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

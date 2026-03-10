import { useState, useRef } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Upload, Loader2, CheckCircle2, AlertTriangle, Camera, FileText, Save, ScanLine, X, ImagePlus,
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
}

interface ExtractedInvoice {
  supplier_name: string;
  supplier_gst?: string | null;
  supplier_dl_number?: string | null;
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
  const [extracted, setExtracted] = useState<ExtractedInvoice | null>(null);
  const [saved, setSaved] = useState(false);

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
      toast({ title: "Invoice Scanned", description: `Found ${data.line_items?.length || 0} items from ${files.length} image(s)` });
    } catch (err: any) {
      console.error("Scan error:", err);
      toast({ title: "Scan Failed", description: err.message, variant: "destructive" });
    } finally {
      setScanning(false);
      setUploadProgress(0);
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
      let supplierId = extracted.matched_supplier_id;
      if (!supplierId) {
        const { data: newSupplier, error: sErr } = await supabase
          .from("suppliers")
          .insert({
            name: extracted.supplier_name,
            gst_number: extracted.supplier_gst || null,
            drug_license_number: extracted.supplier_dl_number || null,
            company_id: companyId,
          })
          .select("id")
          .single();
        if (sErr) throw sErr;
        supplierId = newSupplier.id;
      }

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
          status: "delivered",
          is_challan: false,
          created_by: user.id,
          notes: "Created via AI Invoice Scanner",
        })
        .select("id")
        .single();
      if (poErr) throw poErr;

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

        await supabase.from("purchase_order_items").insert({
          purchase_order_id: po.id,
          product_id: productId,
          quantity: item.quantity + (item.free_quantity || 0),
          unit_price: item.purchase_price,
          gst_percentage: item.gst_percentage,
          discount_percentage: item.discount_percentage || 0,
          total_price: item.total_price,
          company_id: companyId,
        });

        const batchNum = item.batch_number || `BATCH-SCAN-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        await supabase.from("inventory_batches").insert({
          product_id: productId,
          batch_number: batchNum,
          quantity: item.quantity + (item.free_quantity || 0),
          purchase_price: item.purchase_price,
          mrp: item.mrp,
          expiry_date: item.expiry_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          manufacturing_date: item.manufacturing_date || null,
          supplier_id: supplierId,
          company_id: companyId,
        });
      }

      setSaved(true);
      toast({ title: "Invoice Saved!", description: `PO ${orderNumber} created with ${extracted.line_items.length} items & inventory batches.` });
    } catch (err: any) {
      console.error("Save error:", err);
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
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
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" /> Extracted Invoice Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                    {extracted.line_items.map((item, i) => (
                      <TableRow key={i}>
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
                          {item.matched_product_id ? (
                            <Badge variant="secondary" className="text-[10px]">✓</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">New</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
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

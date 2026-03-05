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
import {
  Upload, Loader2, CheckCircle2, AlertTriangle, Camera, FileText, Save, ScanLine,
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

export default function ScanInvoice() {
  const { user, loading: authLoading } = useAuth();
  const { companyId } = useBusiness();
  const { toast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedInvoice | null>(null);
  const [saved, setSaved] = useState(false);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setExtracted(null);
    setSaved(false);

    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  };

  const handleScan = async () => {
    if (!file || !companyId) return;
    setScanning(true);
    setExtracted(null);

    try {
      // Upload to storage
      const filePath = `${companyId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      // Call scan edge function
      const { data, error } = await supabase.functions.invoke("scan-invoice", {
        body: { file_path: filePath, company_id: companyId },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setExtracted(data as ExtractedInvoice);
      toast({ title: "Invoice Scanned", description: `Found ${data.line_items?.length || 0} items` });
    } catch (err: any) {
      console.error("Scan error:", err);
      toast({ title: "Scan Failed", description: err.message, variant: "destructive" });
    } finally {
      setScanning(false);
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
      // 1. Ensure supplier exists
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

      // 2. Generate order number
      const orderNumber = `PO-SCAN-${Date.now().toString(36).toUpperCase()}`;

      // 3. Create purchase order
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

      // 4. Process each line item
      for (const item of extracted.line_items) {
        // Ensure product exists
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

        // Create PO item
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

        // Create inventory batch
        if (item.batch_number) {
          await supabase.from("inventory_batches").insert({
            product_id: productId,
            batch_number: item.batch_number,
            quantity: item.quantity + (item.free_quantity || 0),
            purchase_price: item.purchase_price,
            mrp: item.mrp,
            expiry_date: item.expiry_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            manufacturing_date: item.manufacturing_date || null,
            supplier_id: supplierId,
            company_id: companyId,
          });
        }
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
      <PageHeader title="AI Invoice Scanner" description="Upload a purchase invoice image or PDF to auto-extract and import data" />

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ScanLine className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Upload Invoice</CardTitle>
              <CardDescription>Supports JPEG, PNG, WebP images and PDF files (max 10MB)</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label>Select Invoice File</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileSelect}
                className="mt-1"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleScan} disabled={!file || scanning || !companyId} size="lg">
                {scanning ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning...</>
                ) : (
                  <><Camera className="h-4 w-4 mr-2" /> Scan Invoice</>
                )}
              </Button>
            </div>
          </div>

          {preview && (
            <div className="border rounded-lg overflow-hidden max-h-80">
              <img src={preview} alt="Invoice preview" className="w-full object-contain max-h-80" />
            </div>
          )}

          {file && !preview && (
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>PDF file selected: <strong>{file.name}</strong> ({(file.size / 1024 / 1024).toFixed(2)} MB)</AlertDescription>
            </Alert>
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
              {/* Supplier Info */}
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

              {/* Charges */}
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

          {/* Line Items */}
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
                          <Input
                            value={item.product_name}
                            onChange={(e) => updateLineItem(i, "product_name", e.target.value)}
                            className="text-xs h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.batch_number || ""}
                            onChange={(e) => updateLineItem(i, "batch_number", e.target.value)}
                            className="text-xs h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={item.expiry_date || ""}
                            onChange={(e) => updateLineItem(i, "expiry_date", e.target.value)}
                            className="text-xs h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(i, "quantity", parseInt(e.target.value) || 0)}
                            className="text-xs h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.free_quantity || 0}
                            onChange={(e) => updateLineItem(i, "free_quantity", parseInt(e.target.value) || 0)}
                            className="text-xs h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.purchase_price}
                            onChange={(e) => updateLineItem(i, "purchase_price", parseFloat(e.target.value) || 0)}
                            className="text-xs h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.mrp}
                            onChange={(e) => updateLineItem(i, "mrp", parseFloat(e.target.value) || 0)}
                            className="text-xs h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.gst_percentage}
                            onChange={(e) => updateLineItem(i, "gst_percentage", parseFloat(e.target.value) || 0)}
                            className="text-xs h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.total_price}
                            onChange={(e) => updateLineItem(i, "total_price", parseFloat(e.target.value) || 0)}
                            className="text-xs h-8"
                          />
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

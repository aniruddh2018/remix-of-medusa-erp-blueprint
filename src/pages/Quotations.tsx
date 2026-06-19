import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useInvoiceSettings } from "@/hooks/useInvoiceSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, Trash2, Send, Search, Loader2, ArrowRightLeft, Pencil, Printer, Download } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { PageHeader } from "@/components/layout/PageHeader";
import { DrugBrandSearch, type DrugBrandSearchHandle } from "@/components/DrugBrandSearch";
import { PartySearchInput, type PartyRecord, type PartySearchHandle } from "@/components/PartySearchInput";
import { SalesItemsTable, type CartItem } from "@/components/billing/SalesItemsTable";
import { BillingTotals } from "@/components/billing/BillingTotals";
import { CustomerFormDialog } from "@/components/forms/CustomerFormDialog";
import { printConfigurableInvoice, downloadConfigurableInvoiceHTML, type InvoiceTemplateData } from "@/utils/invoiceTemplate";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;
type Quotation = Tables<"quotations">;

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  accepted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  converted: "bg-primary/15 text-primary",
  expired: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  rejected: "bg-destructive/15 text-destructive",
};

export default function Quotations() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, gstInclusive } = useBusiness();
  const { settings, maxDiscountAllowed } = useInvoiceSettings();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Form state
  const [quotationNumber, setQuotationNumber] = useState("");
  const [quotationDate, setQuotationDate] = useState(todayISO());
  const [validTill, setValidTill] = useState(addDaysISO(15));
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerGstin, setCustomerGstin] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState(settings.terms_and_conditions || "");
  const [cart, setCart] = useState<CartItem[]>([]);

  const [freightCharges, setFreightCharges] = useState(0);
  const [handlingCharges, setHandlingCharges] = useState(0);
  const [deliveryCharges, setDeliveryCharges] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [billDiscountPercent, setBillDiscountPercent] = useState(0);
  const [billDiscountFlat, setBillDiscountFlat] = useState(0);

  // Add-item working row
  const [selectedProduct, setSelectedProduct] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [itemRate, setItemRate] = useState(0);
  const [itemGst, setItemGst] = useState(0);
  const [itemDisc, setItemDisc] = useState(0);

  const productSearchRef = useRef<DrugBrandSearchHandle>(null);
  const customerSearchRef = useRef<PartySearchHandle>(null);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [customerSeed, setCustomerSeed] = useState<{ name?: string; phone?: string }>({});

  // Queries
  const { data: products } = useQuery({
    queryKey: ["products-for-quote", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products").select("*").eq("company_id", companyId!).order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!companyId,
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-for-quote", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers").select("id, name, phone, address, gst_number")
        .eq("company_id", companyId!).order("name");
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        id: c.id, name: c.name, phone: c.phone, gst_number: c.gst_number,
        address: c.address?.line1 ?? c.address ?? null,
      })) as PartyRecord[];
    },
    enabled: !!companyId,
  });

  const { data: quotations, isLoading: loadingList } = useQuery({
    queryKey: ["quotations", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotations").select("*").eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Quotation[];
    },
    enabled: !!companyId,
  });

  // ── Totals (mirrors Sales.tsx) ──
  const itemsGross = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const totalItemDisc = cart.reduce((s, i) => s + (i.unit_price * i.quantity * i.discount_percentage / 100) + i.discount_flat, 0);
  const itemsSubtotal = cart.reduce((s, i) => s + Math.max(0, i.unit_price * i.quantity * (1 - i.discount_percentage / 100) - i.discount_flat), 0);
  const totalGst = gstInclusive
    ? cart.reduce((s, i) => { const a = Math.max(0, i.unit_price * i.quantity * (1 - i.discount_percentage / 100) - i.discount_flat); return s + (a - a / (1 + i.gst_percentage / 100)); }, 0)
    : cart.reduce((s, i) => { const a = Math.max(0, i.unit_price * i.quantity * (1 - i.discount_percentage / 100) - i.discount_flat); return s + (a * i.gst_percentage / 100); }, 0);
  const totalCharges = freightCharges + handlingCharges + deliveryCharges + otherCharges;
  const subBeforeBillDisc = gstInclusive ? itemsSubtotal + totalCharges : itemsSubtotal + totalGst + totalCharges;
  const billDiscountAmount = (subBeforeBillDisc * billDiscountPercent / 100) + billDiscountFlat;
  const grandTotal = Math.max(0, subBeforeBillDisc - billDiscountAmount);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setQuotationNumber("");
    setQuotationDate(todayISO());
    setValidTill(addDaysISO(15));
    setCustomerName(""); setCustomerPhone(""); setCustomerAddress(""); setCustomerGstin(""); setCustomerId(null);
    setNotes(""); setTerms(settings.terms_and_conditions || "");
    setCart([]);
    setFreightCharges(0); setHandlingCharges(0); setDeliveryCharges(0); setOtherCharges(0);
    setBillDiscountPercent(0); setBillDiscountFlat(0);
    setSelectedProduct(""); setItemQty(1); setItemRate(0); setItemGst(0); setItemDisc(0);
  }, [settings.terms_and_conditions]);

  const loadQuotation = useCallback((q: Quotation) => {
    setEditingId(q.id);
    setQuotationNumber(q.quotation_number);
    setQuotationDate(q.quotation_date);
    setValidTill(q.valid_till || addDaysISO(15));
    setCustomerName(q.customer_name);
    setCustomerPhone(q.customer_phone || "");
    setCustomerAddress(q.customer_address || "");
    setCustomerGstin(q.customer_gstin || "");
    setCustomerId(q.customer_id);
    setNotes(q.notes || "");
    setTerms(q.terms || "");
    setCart(Array.isArray(q.items) ? (q.items as unknown as CartItem[]) : []);
    setFreightCharges(Number(q.freight_charges) || 0);
    setHandlingCharges(Number(q.handling_charges) || 0);
    setDeliveryCharges(Number(q.delivery_charges) || 0);
    setOtherCharges(Number(q.other_charges) || 0);
    setBillDiscountPercent(Number(q.bill_discount_percent) || 0);
    setBillDiscountFlat(Number(q.bill_discount_flat) || 0);
    setActiveTab("create");
  }, []);

  // When product picked, seed rate/gst from product
  useEffect(() => {
    if (!selectedProduct) return;
    const p = products?.find(x => x.id === selectedProduct);
    if (!p) return;
    const price = Number(p.sale_price) || Number(p.mrp) || 0;
    setItemRate(price);
    setItemGst(Number(p.gst_percentage) || 0);
  }, [selectedProduct, products]);

  const addItem = useCallback(() => {
    if (!selectedProduct) { toast({ title: "Pick a product first", variant: "destructive" }); return; }
    const p = products?.find(x => x.id === selectedProduct);
    if (!p) return;
    if (itemQty <= 0) { toast({ title: "Quantity must be > 0", variant: "destructive" }); return; }
    const line: CartItem = {
      product_id: p.id,
      batch_id: "",
      product_name: p.name,
      batch_number: "",
      hsn_code: p.hsn_code || "",
      quantity: itemQty,
      free_quantity: 0,
      unit_price: itemRate,
      gst_percentage: itemGst,
      discount_percentage: itemDisc,
      discount_flat: 0,
      total_price: 0,
      max_quantity: 999999,
      expiry_date: "",
      sold_unit: p.base_unit || "",
      base_quantity: itemQty,
      base_unit: p.base_unit || "",
    };
    const after = Math.max(0, line.unit_price * line.quantity * (1 - line.discount_percentage / 100) - line.discount_flat);
    line.total_price = gstInclusive ? after : after * (1 + line.gst_percentage / 100);
    setCart(c => [...c, line]);
    setSelectedProduct(""); setItemQty(1); setItemRate(0); setItemGst(0); setItemDisc(0);
    setTimeout(() => productSearchRef.current?.focus(), 30);
  }, [selectedProduct, products, itemQty, itemRate, itemGst, itemDisc, gstInclusive, toast]);

  const updateCartItem = useCallback((index: number, field: keyof CartItem, value: string | number) => {
    setCart(c => {
      const next = [...c];
      (next[index] as any)[field] = value;
      const i = next[index];
      const after = Math.max(0, i.unit_price * i.quantity * (1 - i.discount_percentage / 100) - i.discount_flat);
      i.total_price = gstInclusive ? after : after * (1 + i.gst_percentage / 100);
      return next;
    });
  }, [gstInclusive]);

  const removeCartItem = useCallback((idx: number) => setCart(c => c.filter((_, i) => i !== idx)), []);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company");
      if (!customerName.trim()) throw new Error("Customer name is required");
      if (cart.length === 0) throw new Error("Add at least one item");
      let quoteNum = quotationNumber.trim();
      if (!quoteNum) {
        const rawPrefix = (settings.quotation_prefix || "QT").replace(/[-\s]+$/g, "") || "QT";
        const { data: seq, error: sErr } = await supabase.rpc("get_next_invoice_number", { _company_id: companyId, _prefix: rawPrefix });
        if (sErr) throw sErr;
        quoteNum = seq as string;
      }
      const payload = {
        company_id: companyId,
        quotation_number: quoteNum,
        quotation_date: quotationDate,
        valid_till: validTill || null,
        customer_id: customerId,
        customer_name: customerName,
        customer_phone: customerPhone || null,
        customer_address: customerAddress || null,
        customer_gstin: customerGstin || null,
        items: cart as unknown as any,
        subtotal: itemsSubtotal,
        gst_amount: totalGst,
        discount_amount: totalItemDisc + billDiscountAmount,
        freight_charges: freightCharges,
        handling_charges: handlingCharges,
        delivery_charges: deliveryCharges,
        other_charges: otherCharges,
        bill_discount_percent: billDiscountPercent,
        bill_discount_flat: billDiscountFlat,
        total_amount: grandTotal,
        notes: notes || null,
        terms: terms || null,
        created_by: user?.id,
      };
      if (editingId) {
        const { data, error } = await supabase.from("quotations").update(payload).eq("id", editingId).select().single();
        if (error) throw error;
        return data as Quotation;
      } else {
        const { data, error } = await supabase.from("quotations").insert(payload).select().single();
        if (error) throw error;
        return data as Quotation;
      }
    },
    onSuccess: (q) => {
      toast({ title: editingId ? "Quotation updated" : "Quotation created", description: q.quotation_number });
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      resetForm();
      setActiveTab("list");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Quotation deleted" });
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const setStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("quotations").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotations"] }),
  });

  // Convert to invoice — stash payload in sessionStorage, navigate to /sales
  const convertToInvoice = useCallback((q: Quotation) => {
    const items = Array.isArray(q.items) ? (q.items as unknown as CartItem[]) : [];
    if (items.length === 0) {
      toast({ title: "Nothing to convert", description: "This quotation has no items.", variant: "destructive" });
      return;
    }
    const payload = {
      quotation_id: q.id,
      quotation_number: q.quotation_number,
      cart: items,
      customer_id: q.customer_id,
      customer_name: q.customer_name,
      customer_phone: q.customer_phone,
      customer_address: q.customer_address,
      customer_gstin: q.customer_gstin,
      notes: q.notes,
      freight_charges: Number(q.freight_charges) || 0,
      handling_charges: Number(q.handling_charges) || 0,
      delivery_charges: Number(q.delivery_charges) || 0,
      other_charges: Number(q.other_charges) || 0,
      bill_discount_percent: Number(q.bill_discount_percent) || 0,
      bill_discount_flat: Number(q.bill_discount_flat) || 0,
    };
    sessionStorage.setItem("quotation_prefill", JSON.stringify(payload));
    navigate("/sales");
  }, [navigate, toast]);

  // Map a Quotation row → InvoiceTemplateData shared with the invoice renderer
  const buildTemplateData = useCallback((q: Quotation): InvoiceTemplateData => {
    const items = (Array.isArray(q.items) ? (q.items as unknown as CartItem[]) : []).map(i => ({
      product_name: i.product_name,
      batch_number: i.batch_number,
      hsn_code: i.hsn_code,
      quantity: i.quantity,
      free_quantity: i.free_quantity,
      unit: i.sold_unit || i.base_unit,
      unit_price: i.unit_price,
      gst_percentage: i.gst_percentage,
      discount_percentage: i.discount_percentage,
      total_price: i.total_price,
      expiry_date: i.expiry_date,
    }));
    return {
      type: "quotation",
      invoice_number: q.quotation_number,
      date: q.quotation_date,
      valid_till: q.valid_till || undefined,
      customer_name: q.customer_name,
      customer_phone: q.customer_phone || undefined,
      customer_address: q.customer_address || undefined,
      customer_gstin: q.customer_gstin || undefined,
      items,
      subtotal: Number(q.subtotal),
      gst_amount: Number(q.gst_amount),
      discount_amount: Number(q.discount_amount),
      freight_charges: Number(q.freight_charges),
      handling_charges: Number(q.handling_charges),
      delivery_charges: Number(q.delivery_charges),
      other_charges: Number(q.other_charges),
      total_amount: Number(q.total_amount),
      notes: q.notes || undefined,
      terms: q.terms || undefined,
      gstInclusive,
    };
  }, [gstInclusive]);

  const printQuotation = useCallback((q: Quotation) => {
    printConfigurableInvoice(buildTemplateData(q), settings);
  }, [buildTemplateData, settings]);

  const downloadQuotationHtml = useCallback((q: Quotation) => {
    downloadConfigurableInvoiceHTML(buildTemplateData(q), settings);
  }, [buildTemplateData, settings]);



  const filtered = useMemo(() => {
    if (!quotations) return [];
    const q = search.trim().toLowerCase();
    if (!q) return quotations;
    return quotations.filter(x =>
      x.quotation_number.toLowerCase().includes(q) ||
      x.customer_name.toLowerCase().includes(q) ||
      (x.customer_phone || "").toLowerCase().includes(q)
    );
  }, [quotations, search]);

  return (
    <div className="space-y-4">
      <PageHeader title="Quotations" description="Create quotes and convert them into sales invoices" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="create">{editingId ? "Edit" : "New Quotation"}</TabsTrigger>
          <TabsTrigger value="list">All Quotations</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>{editingId ? `Editing ${quotationNumber}` : "New Quotation"}</span>
                {editingId && <Button size="sm" variant="ghost" onClick={resetForm}>Start fresh</Button>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Quotation #</Label>
                  <Input value={quotationNumber} onChange={e => setQuotationNumber(e.target.value)} placeholder="Auto-generate" />
                </div>
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={quotationDate} onChange={e => setQuotationDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Valid Till</Label>
                  <Input type="date" value={validTill} onChange={e => setValidTill(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Customer GSTIN</Label>
                  <Input value={customerGstin} onChange={e => setCustomerGstin(e.target.value)} placeholder="Optional" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <Label className="text-xs">Customer</Label>
                  <PartySearchInput
                    ref={customerSearchRef}
                    parties={customers}
                    selectedId={customerId}
                    selectedName={customerName}
                    onSelect={(p) => {
                      setCustomerId(p.id); setCustomerName(p.name);
                      setCustomerPhone(p.phone || ""); setCustomerAddress(p.address || "");
                      setCustomerGstin(p.gst_number || "");
                    }}
                    onClear={() => { setCustomerId(null); setCustomerName(""); setCustomerPhone(""); setCustomerAddress(""); setCustomerGstin(""); }}
                    onCreateNew={(seed) => { setCustomerSeed(seed); setShowCustomerDialog(true); }}
                    entityLabel="customer"
                  />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Address</Label>
                  <Input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} />
                </div>
              </div>

              {/* Add item row */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Add Item</Label>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 md:col-span-5">
                    <DrugBrandSearch
                      ref={productSearchRef}
                      products={products}
                      selectedProductId={selectedProduct}
                      onSelect={setSelectedProduct}
                      placeholder="Search product..."
                    />
                  </div>
                  <div className="col-span-3 md:col-span-1" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}>
                    <Input type="number" min={1} value={itemQty || ""} onChange={e => setItemQty(Number(e.target.value) || 0)} placeholder="Qty" />
                  </div>
                  <div className="col-span-3 md:col-span-2" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}>
                    <Input type="number" min={0} step={0.01} value={itemRate || ""} onChange={e => setItemRate(Number(e.target.value) || 0)} placeholder="Rate" />
                  </div>
                  <div className="col-span-3 md:col-span-1" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}>
                    <Input type="number" min={0} max={28} value={itemGst || ""} onChange={e => setItemGst(Number(e.target.value) || 0)} placeholder="GST%" />
                  </div>
                  <div className="col-span-3 md:col-span-1" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}>
                    <Input type="number" min={0} max={100} value={itemDisc || ""} onChange={e => setItemDisc(Number(e.target.value) || 0)} placeholder="Disc%" />
                  </div>
                  <div className="col-span-12 md:col-span-2">
                    <Button type="button" onClick={addItem} className="w-full"><Plus className="h-4 w-4 mr-1" />Add</Button>
                  </div>
                </div>
              </div>

              {cart.length > 0 && (
                <SalesItemsTable
                  cart={cart}
                  settings={settings}
                  maxDiscountAllowed={maxDiscountAllowed}
                  gstInclusive={gstInclusive}
                  onUpdateItem={updateCartItem}
                  onRemoveItem={removeCartItem}
                />
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2 space-y-3">
                  <div>
                    <Label className="text-xs">Notes</Label>
                    <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Terms &amp; Conditions</Label>
                    <Textarea rows={2} value={terms} onChange={e => setTerms(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div><Label className="text-xs">Freight</Label><Input type="number" min={0} value={freightCharges || ""} onChange={e => setFreightCharges(Number(e.target.value) || 0)} /></div>
                    <div><Label className="text-xs">Handling</Label><Input type="number" min={0} value={handlingCharges || ""} onChange={e => setHandlingCharges(Number(e.target.value) || 0)} /></div>
                    <div><Label className="text-xs">Delivery</Label><Input type="number" min={0} value={deliveryCharges || ""} onChange={e => setDeliveryCharges(Number(e.target.value) || 0)} /></div>
                    <div><Label className="text-xs">Other</Label><Input type="number" min={0} value={otherCharges || ""} onChange={e => setOtherCharges(Number(e.target.value) || 0)} /></div>
                  </div>
                </div>
                <div>
                  <BillingTotals
                    grossTotal={itemsGross}
                    itemDiscount={totalItemDisc}
                    subtotal={itemsSubtotal}
                    gstAmount={totalGst}
                    totalCharges={totalCharges}
                    billDiscountAmount={billDiscountAmount}
                    grandTotal={grandTotal}
                    gstInclusive={gstInclusive}
                    settings={settings}
                    maxDiscountAllowed={maxDiscountAllowed}
                    billDiscountPercent={billDiscountPercent}
                    billDiscountFlat={billDiscountFlat}
                    onBillDiscountPercentChange={setBillDiscountPercent}
                    onBillDiscountFlatChange={setBillDiscountFlat}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>Clear</Button>
                {editingId && (() => {
                  const current = quotations?.find(x => x.id === editingId);
                  if (!current) return null;
                  return (
                    <>
                      <Button variant="outline" onClick={() => printQuotation(current)}>
                        <Printer className="h-4 w-4 mr-1" />Print
                      </Button>
                      <Button variant="outline" onClick={() => downloadQuotationHtml(current)}>
                        <Download className="h-4 w-4 mr-1" />Download
                      </Button>
                    </>
                  );
                })()}
                <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {editingId ? "Update Quotation" : "Save Quotation"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="list" className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search by number, customer, phone..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button type="button" variant="outline" onClick={() => { resetForm(); setActiveTab("create"); }}>
              <Plus className="h-4 w-4 mr-1" />New
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quote #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Valid Till</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingList && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Loading...</TableCell></TableRow>}
                  {!loadingList && filtered.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No quotations yet</TableCell></TableRow>
                  )}
                  {filtered.map(q => {
                    const isExpired = q.valid_till && q.status !== "converted" && differenceInDays(parseISO(q.valid_till), new Date()) < 0;
                    const effectiveStatus = isExpired && q.status !== "converted" ? "expired" : q.status;
                    return (
                      <TableRow key={q.id}>
                        <TableCell className="font-medium">{q.quotation_number}</TableCell>
                        <TableCell>{format(parseISO(q.quotation_date), "dd MMM yyyy")}</TableCell>
                        <TableCell>
                          <div className="font-medium">{q.customer_name}</div>
                          {q.customer_phone && <div className="text-xs text-muted-foreground">{q.customer_phone}</div>}
                        </TableCell>
                        <TableCell>{q.valid_till ? format(parseISO(q.valid_till), "dd MMM yyyy") : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_COLORS[effectiveStatus] || ""}>{effectiveStatus}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">₹{Number(q.total_amount).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {q.status !== "converted" && (
                              <Button size="sm" variant="default" onClick={() => convertToInvoice(q)} title="Convert to Invoice">
                                <ArrowRightLeft className="h-4 w-4 mr-1" />Convert
                              </Button>
                            )}
                            {q.status === "draft" && (
                              <Button size="sm" variant="ghost" onClick={() => setStatusMutation.mutate({ id: q.id, status: "sent" })} title="Mark as Sent">
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => printQuotation(q)} title="Print / Save as PDF">
                              <Printer className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => downloadQuotationHtml(q)} title="Download HTML">
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => loadQuotation(q)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => {
                              if (window.confirm(`Delete quotation ${q.quotation_number}?`)) deleteMutation.mutate(q.id);
                            }} title="Delete">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showCustomerDialog && (
        <CustomerFormDialog
          open={showCustomerDialog}
          onOpenChange={setShowCustomerDialog}
          initialData={customerSeed as any}
          onSuccess={(id) => {
            queryClient.invalidateQueries({ queryKey: ["customers-for-quote"] });
            setShowCustomerDialog(false);
            if (id) setCustomerId(id);
          }}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useEnterNavigation, advanceToNextField } from "@/hooks/useEnterNavigation";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Search, Loader2, PackagePlus } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type PurchaseOrder = Tables<"purchase_orders">;
type PurchaseOrderItem = Tables<"purchase_order_items"> & {
  products?: { name: string; strength?: string | null; hsn_code?: string | null; gst_percentage: number };
};
type Product = Tables<"products">;

interface ReturnItem {
  product_id: string;
  batch_id: string | null;
  product_name: string;
  batch_number: string;
  original_qty: number;
  quantity: number;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  total_price: number;
}

interface DebitNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingNote?: Tables<"debit_notes"> | null;
}

const RETURN_REASONS = [
  "Damaged / Expired on Arrival",
  "Wrong Product Supplied",
  "Short Expiry",
  "Quality Issue",
  "Excess Quantity Supplied",
  "Price Discrepancy",
  "Other",
];

export function DebitNoteDialog({ open, onOpenChange, editingNote }: DebitNoteDialogProps) {
  const isEditing = !!editingNote;
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId } = useBusiness();
  const queryClient = useQueryClient();

  const [orderSearch, setOrderSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [notes, setNotes] = useState("");
  const [debitNoteNumber, setDebitNoteNumber] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);

  // Manual product addition state
  const [manualProductOpen, setManualProductOpen] = useState(false);
  const [manualProductSearch, setManualProductSearch] = useState("");
  const [manualSelectedProduct, setManualSelectedProduct] = useState<Product | null>(null);
  const [manualQty, setManualQty] = useState(1);
  const [manualPrice, setManualPrice] = useState(0);
  const [manualGst, setManualGst] = useState(0);
  const [manualDiscount, setManualDiscount] = useState(0);

  const orderSearchRef = useRef<HTMLInputElement>(null);
  const manualQtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      if (editingNote) {
        setDebitNoteNumber(editingNote.debit_note_number);
        setSupplierName(editingNote.supplier_name || "");
        setOrderSearch(editingNote.original_order_number || "");
        setReason(RETURN_REASONS.includes(editingNote.reason as string) ? editingNote.reason as string : "Other");
        if (!RETURN_REASONS.includes(editingNote.reason as string)) setCustomReason(editingNote.reason as string || "");
        setNotes(editingNote.notes || "");
        supabase.from("debit_note_items").select("*").eq("debit_note_id", editingNote.id).then(({ data }) => {
          if (data) {
            setReturnItems(data.map((it) => ({
              product_id: it.product_id,
              batch_id: it.batch_id ?? null,
              product_name: it.product_name,
              batch_number: it.batch_number || "-",
              original_qty: it.quantity,
              quantity: it.quantity,
              unit_price: Number(it.unit_price),
              gst_percentage: Number(it.gst_percentage),
              discount_percentage: Number(it.discount_percentage),
              total_price: Number(it.total_price),
            })));
          }
        });
      } else {
        setDebitNoteNumber(`DN-${Date.now()}`);
      }
      setTimeout(() => orderSearchRef.current?.focus(), 100);
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingNote?.id]);

  // Ctrl+Enter to submit
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        if (returnItems.length > 0 && reason) createDebitNoteMutation.mutate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, returnItems, reason]);

  const reset = () => {
    setOrderSearch(""); setSelectedOrder(null); setReturnItems([]);
    setReason(""); setCustomReason(""); setNotes(""); setDebitNoteNumber("");
    setSupplierName(""); setFocusedRowIndex(-1);
    setManualSelectedProduct(null); setManualQty(1); setManualPrice(0); setManualGst(0); setManualDiscount(0);
  };

  // All products for manual addition
  const { data: allProducts } = useQuery({
    queryKey: ["products-for-dn"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: open,
  });

  // Search purchase orders
  const { data: matchedOrders, isLoading: searchLoading } = useQuery({
    queryKey: ["po-search-dn", orderSearch],
    queryFn: async () => {
      if (orderSearch.length < 2) return [];
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(`*, suppliers(name)`)
        .or(`supplier_invoice_number.ilike.%${orderSearch}%,invoice_number.ilike.%${orderSearch}%,challan_number.ilike.%${orderSearch}%,order_number.ilike.%${orderSearch}%`)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: orderSearch.length >= 2,
  });

  // Fetch items for selected order
  const { data: orderItems, isLoading: itemsLoading } = useQuery({
    queryKey: ["po-items-dn", selectedOrder?.id],
    queryFn: async () => {
      if (!selectedOrder) return [];
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select(`*, products(name, strength, hsn_code, gst_percentage)`)
        .eq("purchase_order_id", selectedOrder.id);
      if (error) throw error;
      return data as PurchaseOrderItem[];
    },
    enabled: !!selectedOrder,
  });

  const handleSelectOrder = (order: any) => {
    setSelectedOrder(order);
    const displayNum = order.supplier_invoice_number || order.invoice_number || order.challan_number || order.order_number;
    setOrderSearch(displayNum);
    setSupplierName(order.suppliers?.name || "");
    setReturnItems([]);
  };

  const handleAddReturnItem = (item: PurchaseOrderItem) => {
    const product = item.products as any;
    const existing = returnItems.find((r) => r.product_id === item.product_id);
    if (existing) return;
    setReturnItems((prev) => [...prev, {
      product_id: item.product_id,
      batch_id: null,
      product_name: `${product?.name || ""}${product?.strength ? ` ${product.strength}` : ""}`,
      batch_number: "-",
      original_qty: item.quantity,
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      gst_percentage: Number(item.gst_percentage),
      discount_percentage: Number(item.discount_percentage),
      total_price: Number(item.total_price),
    }]);
  };

  const handleAddAllItems = () => {
    if (!orderItems) return;
    orderItems.forEach(handleAddReturnItem);
  };

  const handleAddManualProduct = () => {
    if (!manualSelectedProduct || manualQty <= 0 || manualPrice <= 0) {
      toast({ title: "Please select a product and enter price & quantity", variant: "destructive" });
      return;
    }
    const base = manualPrice * manualQty * (1 - manualDiscount / 100);
    const gstAmt = base * (manualGst / 100);
    const total = base + gstAmt;
    setReturnItems((prev) => [...prev, {
      product_id: manualSelectedProduct.id,
      batch_id: null,
      product_name: `${manualSelectedProduct.name}${manualSelectedProduct.strength ? ` ${manualSelectedProduct.strength}` : ""}`,
      batch_number: "-",
      original_qty: manualQty,
      quantity: manualQty,
      unit_price: manualPrice,
      gst_percentage: manualGst,
      discount_percentage: manualDiscount,
      total_price: total,
    }]);
    setManualSelectedProduct(null);
    setManualQty(1); setManualPrice(0); setManualGst(0); setManualDiscount(0); setManualProductSearch("");
  };

  const updateQty = (index: number, qty: number) => {
    setReturnItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const clamped = Math.max(1, Math.min(qty, item.original_qty || 9999));
        const base = item.unit_price * clamped * (1 - item.discount_percentage / 100);
        const gst = base * (item.gst_percentage / 100);
        return { ...item, quantity: clamped, total_price: base + gst };
      })
    );
  };

  const removeReturnItem = (index: number) => {
    setReturnItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totalAmount = returnItems.reduce((sum, i) => sum + i.total_price, 0);
  const totalGst = returnItems.reduce((sum, i) => {
    const base = i.unit_price * i.quantity * (1 - i.discount_percentage / 100);
    return sum + base * (i.gst_percentage / 100);
  }, 0);

  const createDebitNoteMutation = useMutation({
    mutationFn: async () => {
      const finalReason = reason === "Other" ? customReason : reason;
      if (!finalReason) throw new Error("Please select a reason for the return.");
      if (returnItems.length === 0) throw new Error("Please add at least one item to return.");
      if (!debitNoteNumber.trim()) throw new Error("Debit note number is required.");
      const suppName = supplierName.trim() || (selectedOrder as any)?.suppliers?.name || "Unknown Supplier";

      const { data: dn, error: dnError } = await supabase
        .from("debit_notes")
        .insert({
          debit_note_number: debitNoteNumber.trim(),
          original_order_id: selectedOrder?.id || null,
          original_order_number: selectedOrder?.invoice_number || selectedOrder?.challan_number || selectedOrder?.order_number || "MANUAL",
          supplier_id: selectedOrder?.supplier_id || null,
          supplier_name: suppName,
          reason: finalReason,
          notes: notes || null,
          total_amount: totalAmount,
          gst_amount: totalGst,
          status: "issued",
          created_by: user?.id || null,
          company_id: companyId,
        })
        .select().single();
      if (dnError) throw dnError;

      const items = returnItems.map((item) => ({
        debit_note_id: dn.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        product_name: item.product_name,
        batch_number: item.batch_number,
        quantity: item.quantity,
        unit_price: item.unit_price,
        gst_percentage: item.gst_percentage,
        discount_percentage: item.discount_percentage,
        total_price: item.total_price,
        company_id: companyId,
      }));
      const { error: itemsError } = await supabase.from("debit_note_items").insert(items);
      if (itemsError) throw itemsError;
      return dn;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debit-notes"] });
      toast({ title: "Debit Note Issued", description: `${debitNoteNumber} created successfully.` });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleTableKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusedRowIndex(Math.min(index + 1, returnItems.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setFocusedRowIndex(Math.max(index - 1, 0)); }
    if (e.key === "Delete" || e.key === "Backspace") { removeReturnItem(index); }
  };

  const filteredProducts = allProducts?.filter(p =>
    p.name.toLowerCase().includes(manualProductSearch.toLowerCase()) ||
    p.generic_name?.toLowerCase().includes(manualProductSearch.toLowerCase())
  ).slice(0, 20) ?? [];

  const enterNav = useEnterNavigation({
    onLastField: () => {
      if (returnItems.length > 0 && reason) createDebitNoteMutation.mutate();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-warning font-bold">DN</span> Issue Debit Note
          </DialogTitle>
          <DialogDescription>
            Pharmacy returns goods to supplier → debit note issued
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5" data-enter-nav onKeyDown={enterNav}>
          {/* Step 1: Debit note number + supplier + Order search */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="dn-number">Debit Note # *</Label>
              <Input id="dn-number" value={debitNoteNumber} onChange={(e) => setDebitNoteNumber(e.target.value)} placeholder="DN-XXXXXX" autoComplete="off" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="supplier-name">Supplier Name</Label>
              <Input id="supplier-name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Enter supplier name..." autoComplete="off" />
            </div>
            <div className="space-y-1 relative">
              <Label htmlFor="order-search">Search Purchase Order (optional)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="order-search"
                  ref={orderSearchRef}
                  value={orderSearch}
                  onChange={(e) => { setOrderSearch(e.target.value); setSelectedOrder(null); setReturnItems([]); }}
                  placeholder="Order / challan / invoice number..."
                  className="pl-9"
                  autoComplete="off"
                />
              </div>
              {orderSearch.length >= 2 && !selectedOrder && (
                <div className="absolute z-50 left-0 right-0 bg-popover border rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {searchLoading && <div className="p-3 text-sm text-muted-foreground">Searching...</div>}
                  {!searchLoading && matchedOrders?.length === 0 && <div className="p-3 text-sm text-muted-foreground">No orders found</div>}
                  {matchedOrders?.map((order: any) => (
                    <button key={order.id} className="w-full text-left px-3 py-2 hover:bg-accent text-sm focus:bg-accent outline-none" onClick={() => handleSelectOrder(order)}>
                      <span className="font-medium">{order.supplier_invoice_number || order.invoice_number || order.challan_number || order.order_number}</span>
                      <span className="text-muted-foreground ml-2">— {order.suppliers?.name || "Unknown"}</span>
                      <span className="text-muted-foreground ml-2">₹{Number(order.total_amount).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Selected order info */}
          {selectedOrder && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm flex flex-wrap gap-4">
              <span><strong>Bill #:</strong> {(selectedOrder as { supplier_invoice_number?: string }).supplier_invoice_number || selectedOrder.invoice_number || selectedOrder.challan_number || selectedOrder.order_number}</span>
              <span><strong>Supplier:</strong> {(selectedOrder as any).suppliers?.name || "-"}</span>
              <Badge variant="outline">₹{Number(selectedOrder.total_amount).toFixed(2)}</Badge>
            </div>
          )}

          {/* Order items picker */}
          {selectedOrder && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Original Order Items — click + to add to return</Label>
                <Button variant="outline" size="sm" onClick={handleAddAllItems} className="h-7 text-xs">Return All</Button>
              </div>
              {itemsLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderItems?.map((item) => {
                        const product = item.products as any;
                        const alreadyAdded = returnItems.some((r) => r.product_id === item.product_id);
                        return (
                          <TableRow key={item.id} className={alreadyAdded ? "opacity-40" : ""}>
                            <TableCell className="text-sm">{product?.name}{product?.strength && ` ${product.strength}`}</TableCell>
                            <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                            <TableCell className="text-right text-sm">₹{Number(item.unit_price).toFixed(2)}</TableCell>
                            <TableCell>
                              <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={alreadyAdded} onClick={() => handleAddReturnItem(item)}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* ── Manual product addition ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <PackagePlus className="h-4 w-4 text-primary" />
              <Label className="text-sm font-semibold">Add Product Manually</Label>
            </div>
            <div className="grid grid-cols-12 gap-2 items-end border rounded-lg p-3 bg-muted/20">
              <div className="col-span-4 space-y-1">
                <Label className="text-xs">Product</Label>
                <Popover open={manualProductOpen} onOpenChange={setManualProductOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between font-normal h-9 text-left">
                      <span className="truncate text-sm">
                        {manualSelectedProduct ? `${manualSelectedProduct.name}${manualSelectedProduct.strength ? ` ${manualSelectedProduct.strength}` : ""}` : <span className="text-muted-foreground">Search product...</span>}
                      </span>
                      <Search className="h-3.5 w-3.5 shrink-0 opacity-50 ml-1" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Type product name..." value={manualProductSearch} onValueChange={setManualProductSearch} />
                      <CommandList>
                        <CommandEmpty>No products found.</CommandEmpty>
                        <CommandGroup className="max-h-56 overflow-auto">
                          {filteredProducts.map((p) => (
                            <CommandItem key={p.id} value={p.id} onSelect={() => {
                              setManualSelectedProduct(p);
                              setManualPrice(Number(p.purchase_price));
                              setManualGst(Number(p.gst_percentage));
                              setManualProductOpen(false);
                              setManualProductSearch("");
                              setTimeout(() => manualQtyRef.current?.focus(), 50);
                            }}>
                              <span>{p.name}{p.strength && ` (${p.strength})`}</span>
                              <span className="ml-auto text-xs text-muted-foreground">₹{p.purchase_price}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input ref={manualQtyRef} type="number" min={1} value={manualQty} onChange={(e) => setManualQty(Number(e.target.value))} className="h-9" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Unit Price ₹</Label>
                <Input type="number" min={0} value={manualPrice || ""} onChange={(e) => setManualPrice(Number(e.target.value))} className="h-9" placeholder="0" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">GST %</Label>
                <Input type="number" min={0} max={100} value={manualGst || ""} onChange={(e) => setManualGst(Number(e.target.value))} className="h-9" placeholder="0" />
              </div>
              <div className="col-span-1 space-y-1">
                <Label className="text-xs">Disc%</Label>
                <Input type="number" min={0} max={100} value={manualDiscount || ""} onChange={(e) => setManualDiscount(Number(e.target.value))} className="h-9" placeholder="0" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddManualProduct(); }}} />
              </div>
              <div className="col-span-1">
                <Button size="sm" className="w-full h-9" onClick={handleAddManualProduct} disabled={!manualSelectedProduct}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Return items */}
          {returnItems.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Items Being Returned to Supplier ({returnItems.length})</Label>
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="w-28">Return Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">GST%</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnItems.map((item, index) => (
                      <TableRow
                        key={index}
                        tabIndex={0}
                        data-kb-row
                        className={`cursor-pointer focus:bg-accent outline-none ${focusedRowIndex === index ? "bg-accent" : ""}`}
                        onFocus={() => setFocusedRowIndex(index)}
                        onKeyDown={(e) => handleTableKeyDown(e, index)}
                      >
                        <TableCell className="text-sm font-medium">{item.product_name}</TableCell>
                        <TableCell>
                          <Input
                            type="number" min={1} max={item.original_qty || 9999}
                            value={item.quantity}
                            onChange={(e) => updateQty(index, e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                            className="h-7 w-20 text-center"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm">₹{item.unit_price.toFixed(2)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{item.gst_percentage}%</TableCell>
                        <TableCell className="text-right font-medium">₹{item.total_price.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => removeReturnItem(index)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Reason + Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Return Reason *</Label>
              <Select value={reason} onValueChange={(value) => { setReason(value); setTimeout(() => advanceToNextField(document.activeElement as HTMLElement), 50); }}>
                <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
                <SelectContent>
                  {RETURN_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              {reason === "Other" && (
                <Input placeholder="Describe the reason..." value={customReason} onChange={(e) => setCustomReason(e.target.value)} className="mt-2" autoFocus />
              )}
            </div>
            <div className="space-y-1">
              <Label>Internal Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." className="h-[70px] resize-none" />
            </div>
          </div>

          {/* Totals */}
          {returnItems.length > 0 && (
            <>
              <Separator />
              <div className="flex justify-end">
                <div className="space-y-1 text-sm min-w-52">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal:</span><span>₹{(totalAmount - totalGst).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">GST Adjustment:</span><span>₹{totalGst.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-base border-t pt-1">
                    <span>Debit Amount:</span>
                    <span className="text-primary">₹{totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel (Esc)</Button>
          <Button
            onClick={() => createDebitNoteMutation.mutate()}
            disabled={createDebitNoteMutation.isPending || returnItems.length === 0 || !reason}
            className="gap-2"
            data-enter-nav-include="true"
          >
            {createDebitNoteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Issue Debit Note (Ctrl+Enter)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

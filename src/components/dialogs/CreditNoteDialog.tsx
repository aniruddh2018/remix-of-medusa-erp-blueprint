import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useEnterNavigation } from "@/hooks/useEnterNavigation";
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

type SalesOrder = Tables<"sales_orders">;
type SalesOrderItem = Tables<"sales_order_items"> & {
  products?: { name: string; strength?: string | null; hsn_code?: string | null; gst_percentage: number };
  inventory_batches?: { batch_number: string };
};
type Product = Tables<"products">;

interface ReturnItem {
  product_id: string;
  batch_id: string;
  product_name: string;
  batch_number: string;
  original_qty: number;
  quantity: number;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  total_price: number;
}

interface CreditNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RETURN_REASONS = [
  "Damaged / Expired Product",
  "Wrong Product Delivered",
  "Customer Refused Delivery",
  "Excess Quantity Delivered",
  "Quality Issue",
  "Doctor Changed Prescription",
  "Other",
];

export function CreditNoteDialog({ open, onOpenChange }: CreditNoteDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId } = useBusiness();
  const queryClient = useQueryClient();

  const handleEnterNav = useEnterNavigation();
  const invoiceSearchRef = useRef<HTMLInputElement>(null);
  const focusTrapRef = useFocusTrap(open, invoiceSearchRef);
  const creditNoteRef = useRef<HTMLInputElement>(null);
  const manualQtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCreditNoteNumber(`CN-${Date.now()}`);
      setTimeout(() => invoiceSearchRef.current?.focus(), 100);
    } else {
      reset();
    }
  }, [open]);

  // Ctrl+Enter to submit
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        if (returnItems.length > 0 && reason) createCreditNoteMutation.mutate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, returnItems, reason]);

  const reset = () => {
    setInvoiceSearch(""); setSelectedInvoice(null); setReturnItems([]);
    setReason(""); setCustomReason(""); setNotes(""); setCreditNoteNumber("");
    setFocusedRowIndex(-1); setCustomerName(""); setManualSelectedProduct(null);
    setManualQty(1); setManualPrice(0); setManualGst(0); setManualDiscount(0);
  };

  // All products for manual addition
  const { data: allProducts } = useQuery({
    queryKey: ["products-for-cn"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: open,
  });

  // Search sales orders
  const { data: matchedInvoices, isLoading: searchLoading } = useQuery({
    queryKey: ["sales-search-cn", invoiceSearch],
    queryFn: async () => {
      if (invoiceSearch.length < 2) return [];
      const { data, error } = await supabase
        .from("sales_orders")
        .select("*")
        .or(`invoice_number.ilike.%${invoiceSearch}%,customer_name.ilike.%${invoiceSearch}%`)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as SalesOrder[];
    },
    enabled: invoiceSearch.length >= 2,
  });

  // Fetch items for selected invoice
  const { data: invoiceItems, isLoading: itemsLoading } = useQuery({
    queryKey: ["sale-items-cn", selectedInvoice?.id],
    queryFn: async () => {
      if (!selectedInvoice) return [];
      const { data, error } = await supabase
        .from("sales_order_items")
        .select(`*, products(name, strength, hsn_code, gst_percentage), inventory_batches(batch_number)`)
        .eq("sales_order_id", selectedInvoice.id);
      if (error) throw error;
      return data as SalesOrderItem[];
    },
    enabled: !!selectedInvoice,
  });

  const handleSelectInvoice = (invoice: SalesOrder) => {
    setSelectedInvoice(invoice);
    setInvoiceSearch(invoice.invoice_number);
    setCustomerName(invoice.customer_name);
    setReturnItems([]);
  };

  const handleAddReturnItem = (item: SalesOrderItem) => {
    const product = item.products as any;
    const batch = item.inventory_batches as any;
    const existing = returnItems.find((r) => r.batch_id === item.batch_id);
    if (existing) return;
    const newItem: ReturnItem = {
      product_id: item.product_id,
      batch_id: item.batch_id,
      product_name: `${product?.name || ""}${product?.strength ? ` ${product.strength}` : ""}`,
      batch_number: batch?.batch_number || "-",
      original_qty: item.quantity,
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      gst_percentage: Number(item.gst_percentage),
      discount_percentage: Number(item.discount_percentage),
      total_price: Number(item.total_price),
    };
    setReturnItems((prev) => [...prev, newItem]);
  };

  const handleAddAllItems = () => {
    if (!invoiceItems) return;
    invoiceItems.forEach(handleAddReturnItem);
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
      batch_id: "",
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
    setManualQty(1); setManualPrice(0); setManualGst(0); setManualDiscount(0);
    setManualProductSearch("");
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

  const createCreditNoteMutation = useMutation({
    mutationFn: async () => {
      const finalReason = reason === "Other" ? customReason : reason;
      if (!finalReason) throw new Error("Please select a reason for the return.");
      if (returnItems.length === 0) throw new Error("Please add at least one item to return.");
      if (!creditNoteNumber.trim()) throw new Error("Credit note number is required.");
      const custName = customerName.trim() || selectedInvoice?.customer_name || "Unknown";

      const { data: cn, error: cnError } = await supabase
        .from("credit_notes")
        .insert({
          credit_note_number: creditNoteNumber.trim(),
          original_invoice_id: selectedInvoice?.id || null,
          original_invoice_number: selectedInvoice?.invoice_number || "MANUAL",
          customer_name: custName,
          customer_phone: selectedInvoice?.customer_phone || null,
          reason: finalReason,
          notes: notes || null,
          total_amount: totalAmount,
          gst_amount: totalGst,
          status: "issued",
          created_by: user?.id || null,
          company_id: companyId,
        })
        .select().single();
      if (cnError) throw cnError;

      const items = returnItems.map((item) => ({
        credit_note_id: cn.id,
        product_id: item.product_id,
        batch_id: item.batch_id || null,
        product_name: item.product_name,
        batch_number: item.batch_number,
        quantity: item.quantity,
        unit_price: item.unit_price,
        gst_percentage: item.gst_percentage,
        discount_percentage: item.discount_percentage,
        total_price: item.total_price,
        company_id: companyId,
      }));
      const { error: itemsError } = await supabase.from("credit_note_items").insert(items);
      if (itemsError) throw itemsError;

      // Restore inventory for returned items that have a batch
      for (const item of returnItems) {
        if (item.batch_id) {
          const { data: batch } = await supabase.from("inventory_batches").select("quantity").eq("id", item.batch_id).single();
          if (batch) {
            await supabase.from("inventory_batches").update({ quantity: batch.quantity + item.quantity }).eq("id", item.batch_id);
          }
        }
      }
      return cn;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
      toast({ title: "Credit Note Issued", description: `${creditNoteNumber} created. Inventory restored.` });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={focusTrapRef} className="max-w-4xl max-h-[90vh] overflow-y-auto" data-enter-nav onKeyDown={handleEnterNav}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-destructive font-bold">CN</span> Issue Credit Note
          </DialogTitle>
          <DialogDescription>
            Customer returns goods → inventory restored → credit issued
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Step 1: Credit note number + customer + Invoice search */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="cn-number">Credit Note # *</Label>
              <Input id="cn-number" ref={creditNoteRef} value={creditNoteNumber} onChange={(e) => setCreditNoteNumber(e.target.value)} placeholder="CN-XXXXXX" autoComplete="off" data-field-required="true" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-name">Customer Name</Label>
              <Input id="customer-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Enter customer name..." autoComplete="off" />
            </div>
            <div className="space-y-1 relative">
              <Label htmlFor="invoice-search">Search Original Invoice (optional)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="invoice-search"
                  ref={invoiceSearchRef}
                  value={invoiceSearch}
                  onChange={(e) => { setInvoiceSearch(e.target.value); setSelectedInvoice(null); setReturnItems([]); }}
                  placeholder="Invoice number or customer..."
                  className="pl-9"
                  autoComplete="off"
                />
              </div>
              {invoiceSearch.length >= 2 && !selectedInvoice && (
                <div className="absolute z-50 left-0 right-0 bg-popover border rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {searchLoading && <div className="p-3 text-sm text-muted-foreground">Searching...</div>}
                  {!searchLoading && matchedInvoices?.length === 0 && <div className="p-3 text-sm text-muted-foreground">No invoices found</div>}
                  {matchedInvoices?.map((inv) => (
                    <button key={inv.id} className="w-full text-left px-3 py-2 hover:bg-accent text-sm focus:bg-accent outline-none" onClick={() => handleSelectInvoice(inv)}>
                      <span className="font-medium">{inv.invoice_number}</span>
                      <span className="text-muted-foreground ml-2">— {inv.customer_name}</span>
                      <span className="text-muted-foreground ml-2">₹{Number(inv.total_amount).toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Selected invoice info */}
          {selectedInvoice && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm flex flex-wrap gap-4">
              <span><strong>Invoice:</strong> {selectedInvoice.invoice_number}</span>
              <span><strong>Customer:</strong> {selectedInvoice.customer_name}</span>
              {selectedInvoice.customer_phone && <span><strong>Phone:</strong> {selectedInvoice.customer_phone}</span>}
              <Badge variant="outline">₹{Number(selectedInvoice.total_amount).toFixed(2)}</Badge>
            </div>
          )}

          {/* Invoice items picker */}
          {selectedInvoice && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Original Invoice Items — click + to add to return</Label>
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
                        <TableHead>Batch</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceItems?.map((item) => {
                        const product = item.products as any;
                        const batch = item.inventory_batches as any;
                        const alreadyAdded = returnItems.some((r) => r.batch_id === item.batch_id);
                        return (
                          <TableRow key={item.id} className={alreadyAdded ? "opacity-40" : ""}>
                            <TableCell className="text-sm">{product?.name}{product?.strength && ` ${product.strength}`}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{batch?.batch_number || "-"}</TableCell>
                            <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                            <TableCell className="text-right text-sm">₹{Number(item.total_price).toFixed(2)}</TableCell>
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
              {/* Product search */}
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
                              setManualPrice(Number(p.mrp));
                              setManualGst(Number(p.gst_percentage));
                              setManualProductOpen(false);
                              setManualProductSearch("");
                              setTimeout(() => manualQtyRef.current?.focus(), 50);
                            }}>
                              <span>{p.name}{p.strength && ` (${p.strength})`}</span>
                              <span className="ml-auto text-xs text-muted-foreground">₹{p.mrp}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              {/* Qty */}
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input ref={manualQtyRef} type="number" min={1} value={manualQty} onChange={(e) => setManualQty(Number(e.target.value))} className="h-9" />
              </div>
              {/* Unit Price */}
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Unit Price ₹</Label>
                <Input type="number" min={0} value={manualPrice || ""} onChange={(e) => setManualPrice(Number(e.target.value))} className="h-9" placeholder="0" />
              </div>
              {/* GST % */}
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">GST %</Label>
                <Input type="number" min={0} max={100} value={manualGst || ""} onChange={(e) => setManualGst(Number(e.target.value))} className="h-9" placeholder="0" />
              </div>
              {/* Discount % */}
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

          {/* Return items cart */}
          {returnItems.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Items Being Returned ({returnItems.length})</Label>
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Batch</TableHead>
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
                        <TableCell className="text-xs text-muted-foreground">{item.batch_number}</TableCell>
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
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger data-field-required="true"><SelectValue placeholder="Select reason..." /></SelectTrigger>
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
                  <div className="flex justify-between"><span className="text-muted-foreground">GST Refund:</span><span>₹{totalGst.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-base border-t pt-1">
                    <span>Credit Amount:</span>
                    <span className="text-destructive">₹{totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel (Esc)</Button>
          <Button
            onClick={() => createCreditNoteMutation.mutate()}
            disabled={createCreditNoteMutation.isPending || returnItems.length === 0 || !reason}
            className="gap-2"
            data-enter-nav-include="true"
          >
            {createCreditNoteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Issue Credit Note (Ctrl+Enter)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

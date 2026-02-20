import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { Trash2, Plus, Search, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type SalesOrder = Tables<"sales_orders">;
type SalesOrderItem = Tables<"sales_order_items"> & {
  products?: { name: string; strength?: string | null; hsn_code?: string | null; gst_percentage: number };
  inventory_batches?: { batch_number: string };
};

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
  const queryClient = useQueryClient();

  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<SalesOrder | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [notes, setNotes] = useState("");
  const [creditNoteNumber, setCreditNoteNumber] = useState("");
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);

  const invoiceSearchRef = useRef<HTMLInputElement>(null);
  const creditNoteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCreditNoteNumber(`CN-${Date.now()}`);
      setTimeout(() => invoiceSearchRef.current?.focus(), 100);
    } else {
      reset();
    }
  }, [open]);

  const reset = () => {
    setInvoiceSearch("");
    setSelectedInvoice(null);
    setReturnItems([]);
    setReason("");
    setCustomReason("");
    setNotes("");
    setCreditNoteNumber("");
    setFocusedRowIndex(-1);
  };

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

  const updateQty = (index: number, qty: number) => {
    setReturnItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const clamped = Math.max(1, Math.min(qty, item.original_qty));
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

      const { data: cn, error: cnError } = await supabase
        .from("credit_notes")
        .insert({
          credit_note_number: creditNoteNumber.trim(),
          original_invoice_id: selectedInvoice?.id || null,
          original_invoice_number: selectedInvoice?.invoice_number || "MANUAL",
          customer_name: selectedInvoice?.customer_name || "Unknown",
          customer_phone: selectedInvoice?.customer_phone || null,
          reason: finalReason,
          notes: notes || null,
          total_amount: totalAmount,
          gst_amount: totalGst,
          status: "issued",
          created_by: user?.id || null,
        })
        .select()
        .single();

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
      }));

      const { error: itemsError } = await supabase.from("credit_note_items").insert(items);
      if (itemsError) throw itemsError;

      // Restore inventory for returned items
      for (const item of returnItems) {
        if (item.batch_id) {
          const { data: batch } = await supabase
            .from("inventory_batches")
            .select("quantity")
            .eq("id", item.batch_id)
            .single();
          if (batch) {
            await supabase
              .from("inventory_batches")
              .update({ quantity: batch.quantity + item.quantity })
              .eq("id", item.batch_id);
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

  // Keyboard navigation for return items table
  const handleTableKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusedRowIndex(Math.min(index + 1, returnItems.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setFocusedRowIndex(Math.max(index - 1, 0)); }
    if (e.key === "Delete" || e.key === "Backspace") { removeReturnItem(index); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-destructive font-bold">CN</span> Issue Credit Note
          </DialogTitle>
          <DialogDescription>
            Customer returns goods → inventory restored → credit issued against original invoice
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Step 1: Credit note number + Invoice search */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="cn-number">Credit Note Number *</Label>
              <Input
                id="cn-number"
                ref={creditNoteRef}
                value={creditNoteNumber}
                onChange={(e) => setCreditNoteNumber(e.target.value)}
                placeholder="CN-XXXXXX"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1 relative">
              <Label htmlFor="invoice-search">Search Original Invoice</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="invoice-search"
                  ref={invoiceSearchRef}
                  value={invoiceSearch}
                  onChange={(e) => { setInvoiceSearch(e.target.value); setSelectedInvoice(null); setReturnItems([]); }}
                  placeholder="Invoice number or customer name..."
                  className="pl-9"
                  autoComplete="off"
                />
              </div>
              {/* Dropdown results */}
              {invoiceSearch.length >= 2 && !selectedInvoice && (
                <div className="absolute z-50 left-0 right-0 bg-popover border rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {searchLoading && <div className="p-3 text-sm text-muted-foreground">Searching...</div>}
                  {!searchLoading && matchedInvoices?.length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground">No invoices found</div>
                  )}
                  {matchedInvoices?.map((inv) => (
                    <button
                      key={inv.id}
                      className="w-full text-left px-3 py-2 hover:bg-accent text-sm focus:bg-accent outline-none"
                      onClick={() => handleSelectInvoice(inv)}
                    >
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

          {/* Step 2: Original invoice items to select from */}
          {selectedInvoice && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Original Invoice Items — select items to return</Label>
                <Button variant="outline" size="sm" onClick={handleAddAllItems} className="h-7 text-xs">
                  Return All
                </Button>
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
                            <TableCell className="text-sm">
                              {product?.name}{product?.strength && ` ${product.strength}`}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{batch?.batch_number || "-"}</TableCell>
                            <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                            <TableCell className="text-right text-sm">₹{Number(item.total_price).toFixed(2)}</TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0"
                                disabled={alreadyAdded}
                                onClick={() => handleAddReturnItem(item)}
                              >
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

          {/* Step 3: Return items cart */}
          {returnItems.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Items Being Returned</Label>
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead className="w-28">Return Qty</TableHead>
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
                            type="number"
                            min={1}
                            max={item.original_qty}
                            value={item.quantity}
                            onChange={(e) => updateQty(index, parseInt(e.target.value) || 1)}
                            className="h-7 w-20 text-center"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="text-xs text-muted-foreground ml-1">/ {item.original_qty}</span>
                        </TableCell>
                        <TableCell className="text-right font-medium">₹{item.total_price.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => removeReturnItem(index)}
                          >
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

          {/* Step 4: Reason + Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Return Reason *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  {RETURN_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reason === "Other" && (
                <Input
                  placeholder="Describe the reason..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="mt-2"
                  autoFocus
                />
              )}
            </div>
            <div className="space-y-1">
              <Label>Internal Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
                className="h-[70px] resize-none"
              />
            </div>
          </div>

          {/* Totals */}
          {returnItems.length > 0 && (
            <>
              <Separator />
              <div className="flex justify-end">
                <div className="space-y-1 text-sm min-w-52">
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
          >
            {createCreditNoteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Issue Credit Note (Ctrl+Enter)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

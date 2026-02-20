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

type PurchaseOrder = Tables<"purchase_orders">;
type PurchaseOrderItem = Tables<"purchase_order_items"> & {
  products?: { name: string; strength?: string | null; hsn_code?: string | null; gst_percentage: number };
};

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

export function DebitNoteDialog({ open, onOpenChange }: DebitNoteDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [orderSearch, setOrderSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [notes, setNotes] = useState("");
  const [debitNoteNumber, setDebitNoteNumber] = useState("");
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);

  const orderSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDebitNoteNumber(`DN-${Date.now()}`);
      setTimeout(() => orderSearchRef.current?.focus(), 100);
    } else {
      reset();
    }
  }, [open]);

  const reset = () => {
    setOrderSearch("");
    setSelectedOrder(null);
    setReturnItems([]);
    setReason("");
    setCustomReason("");
    setNotes("");
    setDebitNoteNumber("");
    setFocusedRowIndex(-1);
  };

  // Search purchase orders
  const { data: matchedOrders, isLoading: searchLoading } = useQuery({
    queryKey: ["po-search-dn", orderSearch],
    queryFn: async () => {
      if (orderSearch.length < 2) return [];
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(`*, suppliers(name)`)
        .or(`order_number.ilike.%${orderSearch}%,challan_number.ilike.%${orderSearch}%,invoice_number.ilike.%${orderSearch}%`)
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
    const displayNum = order.invoice_number || order.challan_number || order.order_number;
    setOrderSearch(displayNum);
    setReturnItems([]);
  };

  const handleAddReturnItem = (item: PurchaseOrderItem) => {
    const product = item.products as any;
    const existing = returnItems.find((r) => r.product_id === item.product_id);
    if (existing) return;
    const newItem: ReturnItem = {
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
    };
    setReturnItems((prev) => [...prev, newItem]);
  };

  const handleAddAllItems = () => {
    if (!orderItems) return;
    orderItems.forEach(handleAddReturnItem);
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

  const createDebitNoteMutation = useMutation({
    mutationFn: async () => {
      const finalReason = reason === "Other" ? customReason : reason;
      if (!finalReason) throw new Error("Please select a reason for the return.");
      if (returnItems.length === 0) throw new Error("Please add at least one item to return.");
      if (!debitNoteNumber.trim()) throw new Error("Debit note number is required.");

      const supplierName = (selectedOrder as any)?.suppliers?.name || "Unknown Supplier";

      const { data: dn, error: dnError } = await supabase
        .from("debit_notes")
        .insert({
          debit_note_number: debitNoteNumber.trim(),
          original_order_id: selectedOrder?.id || null,
          original_order_number:
            selectedOrder?.invoice_number || selectedOrder?.challan_number || selectedOrder?.order_number || "MANUAL",
          supplier_id: selectedOrder?.supplier_id || null,
          supplier_name: supplierName,
          reason: finalReason,
          notes: notes || null,
          total_amount: totalAmount,
          gst_amount: totalGst,
          status: "issued",
          created_by: user?.id || null,
        })
        .select()
        .single();

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

  // Keyboard navigation
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
            <span className="text-warning font-bold">DN</span> Issue Debit Note
          </DialogTitle>
          <DialogDescription>
            Pharmacy returns goods to supplier → debit note issued against original purchase order
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Step 1: Debit note number + Order search */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="dn-number">Debit Note Number *</Label>
              <Input
                id="dn-number"
                value={debitNoteNumber}
                onChange={(e) => setDebitNoteNumber(e.target.value)}
                placeholder="DN-XXXXXX"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1 relative">
              <Label htmlFor="order-search">Search Purchase Order / Invoice</Label>
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
                  {!searchLoading && matchedOrders?.length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground">No orders found</div>
                  )}
                  {matchedOrders?.map((order: any) => (
                    <button
                      key={order.id}
                      className="w-full text-left px-3 py-2 hover:bg-accent text-sm focus:bg-accent outline-none"
                      onClick={() => handleSelectOrder(order)}
                    >
                      <span className="font-medium">{order.invoice_number || order.challan_number || order.order_number}</span>
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
              <span><strong>Order:</strong> {selectedOrder.invoice_number || selectedOrder.challan_number || selectedOrder.order_number}</span>
              <span><strong>Supplier:</strong> {(selectedOrder as any).suppliers?.name || "-"}</span>
              <Badge variant="outline">₹{Number(selectedOrder.total_amount).toFixed(2)}</Badge>
            </div>
          )}

          {/* Step 2: Order items to select from */}
          {selectedOrder && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Original Order Items — select items to return</Label>
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
                            <TableCell className="text-sm">
                              {product?.name}{product?.strength && ` ${product.strength}`}
                            </TableCell>
                            <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                            <TableCell className="text-right text-sm">₹{Number(item.unit_price).toFixed(2)}</TableCell>
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

          {/* Step 3: Return items */}
          {returnItems.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Items Being Returned to Supplier</Label>
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
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
          >
            {createDebitNoteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Issue Debit Note (Ctrl+Enter)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

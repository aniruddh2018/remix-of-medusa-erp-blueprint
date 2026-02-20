import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, AlertTriangle, Package } from "lucide-react";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type PurchaseOrder = Tables<"purchase_orders">;
type PurchaseOrderItem = Tables<"purchase_order_items"> & {
  products?: { name: string; strength?: string | null; hsn_code?: string | null };
};

interface EditPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
}

export function EditPurchaseOrderDialog({ open, onOpenChange, orderId }: EditPurchaseOrderDialogProps) {
  const { toast } = useToast();
  const { isAdmin, isPharmacist } = useAuth();
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState("");
  const [challanNumber, setChallanNumber] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [freightCharges, setFreightCharges] = useState(0);
  const [handlingCharges, setHandlingCharges] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);

  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["purchase-order-for-edit", orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(`*, suppliers(name)`)
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId && open,
  });

  const { data: orderItems, isLoading: itemsLoading } = useQuery({
    queryKey: ["purchase-order-items-for-edit", orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select(`*, products(name, strength, hsn_code)`)
        .eq("purchase_order_id", orderId);
      if (error) throw error;
      return data as PurchaseOrderItem[];
    },
    enabled: !!orderId && open,
  });

  // Populate form when order data loads
  useEffect(() => {
    if (order) {
      setNotes(order.notes || "");
      setChallanNumber(order.challan_number || "");
      setInvoiceNumber(order.invoice_number || "");
      setFreightCharges(Number(order.freight_charges) || 0);
      setHandlingCharges(Number(order.handling_charges) || 0);
      setOtherCharges(Number(order.other_charges) || 0);
      setDiscountAmount(Number(order.discount_amount) || 0);
    }
  }, [order]);

  const itemsSubtotal = useMemo(() => {
    if (!orderItems) return 0;
    return orderItems.reduce((sum, item) => {
      const base = Number(item.unit_price) * item.quantity * (1 - Number(item.discount_percentage) / 100);
      return sum + base;
    }, 0);
  }, [orderItems]);

  const gstAmount = useMemo(() => {
    if (!orderItems) return 0;
    return orderItems.reduce((sum, item) => {
      const base = Number(item.unit_price) * item.quantity * (1 - Number(item.discount_percentage) / 100);
      return sum + (base * Number(item.gst_percentage) / 100);
    }, 0);
  }, [orderItems]);

  const totalCharges = freightCharges + handlingCharges + otherCharges;
  const grandTotal = itemsSubtotal + gstAmount + totalCharges - discountAmount;

  const updateOrderMutation = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error("No order ID");

      const { error } = await supabase
        .from("purchase_orders")
        .update({
          notes: notes || null,
          challan_number: challanNumber || null,
          invoice_number: invoiceNumber || null,
          freight_charges: freightCharges,
          handling_charges: handlingCharges,
          other_charges: otherCharges,
          discount_amount: discountAmount,
          total_amount: grandTotal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order-for-edit", orderId] });
      toast({ title: "Order Updated", description: "Purchase order bill has been modified successfully." });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (!isAdmin && !isPharmacist) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <p className="text-center text-muted-foreground">
              Only administrators and pharmacists can modify purchase orders.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isLoading = orderLoading || itemsLoading;
  const isChallan = order?.is_challan;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Edit {isChallan ? "Challan" : "Invoice"} — {order?.order_number}
          </DialogTitle>
          <DialogDescription>
            Modify billing details. Item quantities cannot be changed after order creation.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Order Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Order Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Supplier</Label>
                    <p className="font-medium">{(order?.suppliers as any)?.name || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Order Date</Label>
                    <p className="font-medium">
                      {order?.order_date ? format(new Date(order.order_date), "dd/MM/yyyy") : "-"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">
                      {isChallan ? "Challan Number" : "Invoice Number"}
                    </Label>
                    <Input
                      value={isChallan ? challanNumber : invoiceNumber}
                      onChange={(e) => isChallan ? setChallanNumber(e.target.value) : setInvoiceNumber(e.target.value)}
                      placeholder={`Enter ${isChallan ? "challan" : "invoice"} number`}
                    />
                  </div>
                  <div className="space-y-1 flex items-center gap-2 pt-4">
                    <Badge variant={isChallan ? "secondary" : "default"}>
                      {isChallan ? "Challan" : "Invoice"}
                    </Badge>
                    <Badge variant={order?.status === "delivered" ? "default" : "outline"}>
                      {order?.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Items (Read-only) */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Order Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>HSN</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">GST</TableHead>
                      <TableHead className="text-right">Disc%</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderItems?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.products?.name}
                          {item.products?.strength && ` ${item.products.strength}`}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.products?.hsn_code || "-"}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">₹{Number(item.unit_price).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{item.gst_percentage}%</TableCell>
                        <TableCell className="text-right">{item.discount_percentage}%</TableCell>
                        <TableCell className="text-right font-mono">₹{Number(item.total_price).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    {(!orderItems || orderItems.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-4">
                          No items found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Charges & Discounts */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Charges & Discounts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Freight (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={freightCharges || ""}
                      onChange={(e) => setFreightCharges(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Handling (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={handlingCharges || ""}
                      onChange={(e) => setHandlingCharges(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Other (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={otherCharges || ""}
                      onChange={(e) => setOtherCharges(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Discount (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={discountAmount || ""}
                      onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for this order"
                rows={2}
              />
            </div>

            {/* Totals */}
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>₹{itemsSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST (CGST + SGST):</span>
                    <span>₹{gstAmount.toFixed(2)}</span>
                  </div>
                  {totalCharges > 0 && (
                    <div className="flex justify-between">
                      <span>Charges:</span>
                      <span>₹{totalCharges.toFixed(2)}</span>
                    </div>
                  )}
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-primary">
                      <span>Discount:</span>
                      <span>-₹{discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Grand Total:</span>
                    <span>₹{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => updateOrderMutation.mutate()}
            disabled={updateOrderMutation.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {updateOrderMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

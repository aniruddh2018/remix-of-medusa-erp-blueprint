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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Trash2, AlertTriangle, Receipt } from "lucide-react";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type SalesOrder = Tables<"sales_orders">;
type SalesOrderItem = Tables<"sales_order_items"> & {
  products?: { name: string; strength?: string };
  inventory_batches?: { batch_number: string };
};

interface EditSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string | null;
}

export function EditSaleDialog({ open, onOpenChange, saleId }: EditSaleDialogProps) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [prescriptionNumber, setPrescriptionNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<string>("confirmed");
  const [freightCharges, setFreightCharges] = useState(0);
  const [handlingCharges, setHandlingCharges] = useState(0);
  const [deliveryCharges, setDeliveryCharges] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);

  const { data: sale, isLoading: saleLoading } = useQuery({
    queryKey: ["sale-for-edit", saleId],
    queryFn: async () => {
      if (!saleId) return null;
      const { data, error } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("id", saleId)
        .single();
      if (error) throw error;
      return data as SalesOrder;
    },
    enabled: !!saleId && open,
  });

  const { data: saleItems, isLoading: itemsLoading } = useQuery({
    queryKey: ["sale-items-for-edit", saleId],
    queryFn: async () => {
      if (!saleId) return [];
      const { data, error } = await supabase
        .from("sales_order_items")
        .select(`
          *,
          products(name, strength),
          inventory_batches(batch_number)
        `)
        .eq("sales_order_id", saleId);
      if (error) throw error;
      return data as SalesOrderItem[];
    },
    enabled: !!saleId && open,
  });

  // Populate form when sale data loads
  useEffect(() => {
    if (sale) {
      setCustomerName(sale.customer_name || "");
      setCustomerPhone(sale.customer_phone || "");
      setCustomerAddress(sale.customer_address || "");
      setPrescriptionNumber(sale.prescription_number || "");
      setPaymentMethod(sale.payment_method || "cash");
      setNotes(sale.notes || "");
      setStatus(sale.status);
      setFreightCharges(Number(sale.freight_charges) || 0);
      setHandlingCharges(Number(sale.handling_charges) || 0);
      setDeliveryCharges(Number(sale.delivery_charges) || 0);
      setOtherCharges(Number(sale.other_charges) || 0);
      setDiscountAmount(Number(sale.discount_amount) || 0);
    }
  }, [sale]);

  // Calculate totals
  const itemsSubtotal = useMemo(() => {
    if (!saleItems) return 0;
    return saleItems.reduce((sum, item) => {
      const basePrice = Number(item.unit_price) * item.quantity * (1 - Number(item.discount_percentage) / 100);
      return sum + basePrice;
    }, 0);
  }, [saleItems]);

  const gstAmount = useMemo(() => {
    if (!saleItems) return 0;
    return saleItems.reduce((sum, item) => {
      const basePrice = Number(item.unit_price) * item.quantity * (1 - Number(item.discount_percentage) / 100);
      return sum + (basePrice * Number(item.gst_percentage) / 100);
    }, 0);
  }, [saleItems]);

  const totalCharges = freightCharges + handlingCharges + deliveryCharges + otherCharges;
  const grandTotal = itemsSubtotal + gstAmount + totalCharges - discountAmount;

  const updateSaleMutation = useMutation({
    mutationFn: async () => {
      if (!saleId) throw new Error("No sale ID");

      const { error } = await supabase
        .from("sales_orders")
        .update({
          customer_name: customerName,
          customer_phone: customerPhone || null,
          customer_address: customerAddress || null,
          prescription_number: prescriptionNumber || null,
          payment_method: paymentMethod,
          notes: notes || null,
          status: status as SalesOrder["status"],
          freight_charges: freightCharges,
          handling_charges: handlingCharges,
          delivery_charges: deliveryCharges,
          other_charges: otherCharges,
          discount_amount: discountAmount,
          total_amount: grandTotal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", saleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sale-for-edit", saleId] });
      toast({ title: "Sale Updated", description: "Bill has been modified successfully" });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (!isAdmin) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <p className="text-center text-muted-foreground">
              Only administrators can modify bills.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isLoading = saleLoading || itemsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Edit Sale - {sale?.invoice_number}
          </DialogTitle>
          <DialogDescription>
            Modify sale details (Admin only). Item quantities cannot be changed after sale.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Customer Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Customer Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Customer Name *</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Prescription #</Label>
                    <Input
                      value={prescriptionNumber}
                      onChange={(e) => setPrescriptionNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Items (Read-only) */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Sale Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">GST</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saleItems?.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.products?.name}
                          {item.products?.strength && ` ${item.products.strength}`}
                        </TableCell>
                        <TableCell>{item.inventory_batches?.batch_number}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">₹{Number(item.unit_price).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{item.gst_percentage}%</TableCell>
                        <TableCell className="text-right font-mono">₹{Number(item.total_price).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Charges */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Charges & Discounts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-4">
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
                    <Label className="text-xs">Delivery (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={deliveryCharges || ""}
                      onChange={(e) => setDeliveryCharges(Number(e.target.value) || 0)}
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

            {/* Payment & Notes */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes"
                />
              </div>
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
                    <span>GST:</span>
                    <span>₹{gstAmount.toFixed(2)}</span>
                  </div>
                  {totalCharges > 0 && (
                    <div className="flex justify-between">
                      <span>Charges:</span>
                      <span>₹{totalCharges.toFixed(2)}</span>
                    </div>
                  )}
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-green-600">
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
            onClick={() => updateSaleMutation.mutate()}
            disabled={!customerName || updateSaleMutation.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {updateSaleMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
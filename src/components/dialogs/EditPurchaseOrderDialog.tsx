import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Trash2, AlertTriangle, Package, Plus, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type PurchaseOrder = Tables<"purchase_orders">;
type PurchaseOrderItem = Tables<"purchase_order_items"> & {
  products?: { name: string; strength?: string | null; hsn_code?: string | null };
};

interface EditableItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  free_quantity: number;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  total_price: number;
  isNew?: boolean;
}

interface EditPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
}

export function EditPurchaseOrderDialog({ open, onOpenChange, orderId }: EditPurchaseOrderDialogProps) {
  const { toast } = useToast();
  const { isAdmin, isPharmacist } = useAuth();
  const { companyId } = useBusiness();
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState("");
  const [challanNumber, setChallanNumber] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [freightCharges, setFreightCharges] = useState(0);
  const [handlingCharges, setHandlingCharges] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([]);

  // Add new item
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addProductSearch, setAddProductSearch] = useState("");
  const [selectedNewProduct, setSelectedNewProduct] = useState<any>(null);
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);

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

  const { data: allProducts } = useQuery({
    queryKey: ["products-for-edit-po"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, generic_name, manufacturer, purchase_price, gst_percentage")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: open,
  });

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

  useEffect(() => {
    if (orderItems) {
      setEditableItems(
        orderItems.map(item => ({
          id: item.id,
          product_id: item.product_id,
          product_name: `${item.products?.name || ""}${item.products?.strength ? ` ${item.products.strength}` : ""}`,
          quantity: item.quantity,
          unit_price: Number(item.unit_price),
          gst_percentage: Number(item.gst_percentage),
          discount_percentage: Number(item.discount_percentage),
          total_price: Number(item.total_price),
        }))
      );
      setDeletedItemIds([]);
    }
  }, [orderItems]);

  const recalcItem = (item: EditableItem): EditableItem => {
    const base = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
    const gst = base * item.gst_percentage / 100;
    return { ...item, total_price: base + gst };
  };

  const updateItem = (index: number, field: string, value: number) => {
    setEditableItems(prev => {
      const updated = [...prev];
      updated[index] = recalcItem({ ...updated[index], [field]: value });
      return updated;
    });
  };

  const removeItem = (index: number) => {
    const item = editableItems[index];
    if (!item.isNew) setDeletedItemIds(prev => [...prev, item.id]);
    setEditableItems(prev => prev.filter((_, i) => i !== index));
  };

  const addNewItem = () => {
    if (!selectedNewProduct || newItemQty <= 0) return;
    const newItem: EditableItem = {
      id: crypto.randomUUID(),
      product_id: selectedNewProduct.id,
      product_name: selectedNewProduct.name,
      quantity: newItemQty,
      unit_price: newItemPrice || Number(selectedNewProduct.purchase_price),
      gst_percentage: Number(selectedNewProduct.gst_percentage),
      discount_percentage: 0,
      total_price: 0,
      isNew: true,
    };
    setEditableItems(prev => [...prev, recalcItem(newItem)]);
    setSelectedNewProduct(null);
    setNewItemQty(1);
    setNewItemPrice(0);
    setAddProductSearch("");
  };

  const itemsSubtotal = useMemo(() => {
    return editableItems.reduce((sum, item) => {
      return sum + item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
    }, 0);
  }, [editableItems]);

  const gstAmount = useMemo(() => {
    return editableItems.reduce((sum, item) => {
      const base = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
      return sum + (base * item.gst_percentage / 100);
    }, 0);
  }, [editableItems]);

  const totalCharges = freightCharges + handlingCharges + otherCharges;
  const grandTotal = itemsSubtotal + gstAmount + totalCharges - discountAmount;

  const updateOrderMutation = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error("No order ID");

      // Delete removed items
      for (const itemId of deletedItemIds) {
        await supabase.from("purchase_order_items").delete().eq("id", itemId);
      }

      // Update existing items
      for (const item of editableItems.filter(i => !i.isNew)) {
        await supabase.from("purchase_order_items").update({
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percentage: item.discount_percentage,
          total_price: item.total_price,
        }).eq("id", item.id);
      }

      // Insert new items
      for (const item of editableItems.filter(i => i.isNew)) {
        await supabase.from("purchase_order_items").insert({
          purchase_order_id: orderId,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          gst_percentage: item.gst_percentage,
          discount_percentage: item.discount_percentage,
          total_price: item.total_price,
          company_id: companyId,
        });
      }

      // Update order header
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
          gst_amount: gstAmount,
          total_amount: grandTotal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order-for-edit", orderId] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order-items-for-edit", orderId] });
      toast({ title: "Order Updated", description: "Purchase order has been modified successfully." });
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Edit {isChallan ? "Challan" : "Invoice"} — {order?.order_number}
          </DialogTitle>
          <DialogDescription>
            Modify billing details, edit items, or add new products.
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
                    <p className="font-medium">{order?.order_date ? format(new Date(order.order_date), "dd/MM/yyyy") : "-"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">{isChallan ? "Challan Number" : "Invoice Number"}</Label>
                    <Input
                      value={isChallan ? challanNumber : invoiceNumber}
                      onChange={(e) => isChallan ? setChallanNumber(e.target.value) : setInvoiceNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 flex items-center gap-2 pt-4">
                    <Badge variant={isChallan ? "secondary" : "default"}>{isChallan ? "Challan" : "Invoice"}</Badge>
                    <Badge variant={order?.status === "delivered" ? "default" : "outline"}>{order?.status}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Editable Items */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Order Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right w-20">Qty</TableHead>
                      <TableHead className="text-right w-24">Price</TableHead>
                      <TableHead className="text-right w-16">Disc%</TableHead>
                      <TableHead className="text-right w-16">GST%</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editableItems.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium text-sm">
                          {item.product_name}
                          {item.isNew && <Badge variant="outline" className="ml-1 text-xs">New</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" min={1} value={item.quantity}
                            onChange={(e) => updateItem(index, "quantity", e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                            className="w-16 h-7 text-center" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" step="0.01" min={0} value={item.unit_price}
                            onChange={(e) => updateItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                            className="w-20 h-7 text-right" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" step="0.1" min={0} max={100} value={item.discount_percentage}
                            onChange={(e) => updateItem(index, "discount_percentage", parseFloat(e.target.value) || 0)}
                            className="w-14 h-7 text-center" />
                        </TableCell>
                        <TableCell className="text-right text-sm">{item.gst_percentage}%</TableCell>
                        <TableCell className="text-right font-mono text-sm">₹{item.total_price.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(index)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Add New Product */}
                <div className="p-3 border-t">
                  <p className="text-sm font-medium mb-2">Add Product</p>
                  <div className="flex gap-2 items-end flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <Popover open={addProductOpen} onOpenChange={setAddProductOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full justify-between text-sm">
                            {selectedNewProduct ? selectedNewProduct.name : "Select product..."}
                            <ChevronsUpDown className="h-3 w-3 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0">
                          <Command>
                            <CommandInput placeholder="Search..." value={addProductSearch} onValueChange={setAddProductSearch} />
                            <CommandList>
                              <CommandEmpty>No products found</CommandEmpty>
                              <CommandGroup>
                                {allProducts?.filter(p =>
                                  p.name.toLowerCase().includes(addProductSearch.toLowerCase()) ||
                                  p.generic_name?.toLowerCase().includes(addProductSearch.toLowerCase())
                                ).slice(0, 20).map(p => (
                                  <CommandItem key={p.id} value={p.name} onSelect={() => {
                                    setSelectedNewProduct(p);
                                    setNewItemPrice(Number(p.purchase_price));
                                    setAddProductOpen(false);
                                  }}>
                                    {p.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    {selectedNewProduct && (
                      <>
                        <Input type="number" min={1} value={newItemQty}
                          onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)}
                          className="w-16 h-8" placeholder="Qty" />
                        <Input type="number" step="0.01" value={newItemPrice}
                          onChange={(e) => setNewItemPrice(parseFloat(e.target.value) || 0)}
                          className="w-24 h-8" placeholder="Price" />
                        <Button size="sm" onClick={addNewItem} className="gap-1">
                          <Plus className="h-3 w-3" /> Add
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Charges */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Charges & Discounts</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Freight (₹)</Label>
                    <Input type="number" min={0} value={freightCharges || ""} onChange={(e) => setFreightCharges(Number(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Handling (₹)</Label>
                    <Input type="number" min={0} value={handlingCharges || ""} onChange={(e) => setHandlingCharges(Number(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Other (₹)</Label>
                    <Input type="number" min={0} value={otherCharges || ""} onChange={(e) => setOtherCharges(Number(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Discount (₹)</Label>
                    <Input type="number" min={0} value={discountAmount || ""} onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" rows={2} />
            </div>

            {/* Totals */}
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Subtotal:</span><span>₹{itemsSubtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>GST:</span><span>₹{gstAmount.toFixed(2)}</span></div>
                  {totalCharges > 0 && <div className="flex justify-between"><span>Charges:</span><span>₹{totalCharges.toFixed(2)}</span></div>}
                  {discountAmount > 0 && <div className="flex justify-between text-primary"><span>Discount:</span><span>-₹{discountAmount.toFixed(2)}</span></div>}
                  <Separator />
                  <div className="flex justify-between font-bold text-lg"><span>Grand Total:</span><span>₹{grandTotal.toFixed(2)}</span></div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => updateOrderMutation.mutate()}
            disabled={editableItems.length === 0 || updateOrderMutation.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {updateOrderMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, Package, PlusCircle } from "lucide-react";
import { format } from "date-fns";
import { ProductFormDialog } from "@/components/forms/ProductFormDialog";
import { SupplierFormDialog } from "@/components/forms/SupplierFormDialog";
import type { Tables } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";

type PurchaseOrder = Tables<"purchase_orders">;
type Supplier = Tables<"suppliers">;
type Product = Tables<"products">;
type OrderStatus = Database["public"]["Enums"]["order_status"];

interface OrderItem {
  product_id: string;
  product_name: string;
  hsn_code: string;
  quantity: number;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  total_price: number;
}

export default function PurchaseOrders() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemPrice, setItemPrice] = useState<number>(0);
  const [itemDiscount, setItemDiscount] = useState<number>(0);
  
  // Other charges state
  const [freightCharges, setFreightCharges] = useState<number>(0);
  const [handlingCharges, setHandlingCharges] = useState<number>(0);
  const [otherCharges, setOtherCharges] = useState<number>(0);
  
  // Inline add dialogs
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);

  const { data: purchaseOrders, isLoading } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(`
          *,
          suppliers (name)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: suppliers, refetch: refetchSuppliers } = useQuery({
    queryKey: ["suppliers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Supplier[];
    },
  });

  const { data: products, refetch: refetchProducts } = useQuery({
    queryKey: ["products-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const orderNumber = `PO-${Date.now()}`;

      // Calculate item totals
      const itemsSubtotal = orderItems.reduce((sum, item) => {
        const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
        return sum + basePrice;
      }, 0);
      
      const gstAmount = orderItems.reduce((sum, item) => {
        const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
        return sum + (basePrice * item.gst_percentage / 100);
      }, 0);
      
      const discountAmount = orderItems.reduce((sum, item) => {
        return sum + (item.unit_price * item.quantity * item.discount_percentage / 100);
      }, 0);

      const totalCharges = freightCharges + handlingCharges + otherCharges;
      const totalAmount = itemsSubtotal + gstAmount + totalCharges;

      const { data: order, error: orderError } = await supabase
        .from("purchase_orders")
        .insert({
          order_number: orderNumber,
          supplier_id: selectedSupplier,
          expected_delivery_date: expectedDeliveryDate || null,
          notes: notes || null,
          total_amount: totalAmount,
          gst_amount: gstAmount,
          discount_amount: discountAmount,
          freight_charges: freightCharges,
          handling_charges: handlingCharges,
          other_charges: otherCharges,
          created_by: user?.id,
          status: "pending",
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const items = orderItems.map((item) => ({
        purchase_order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        gst_percentage: item.gst_percentage,
        discount_percentage: item.discount_percentage,
        total_price: item.total_price,
      }));

      const { error: itemsError } = await supabase
        .from("purchase_order_items")
        .insert(items);

      if (itemsError) throw itemsError;

      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Order created", description: "Purchase order has been created successfully." });
      handleCloseDialog();
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const { error } = await supabase
        .from("purchase_orders")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Status updated" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setOrderItems([]);
    setSelectedSupplier("");
    setExpectedDeliveryDate("");
    setNotes("");
    setSelectedProduct("");
    setItemQuantity(1);
    setItemPrice(0);
    setItemDiscount(0);
    setFreightCharges(0);
    setHandlingCharges(0);
    setOtherCharges(0);
  };

  const handleProductSelect = (productId: string) => {
    setSelectedProduct(productId);
    const product = products?.find((p) => p.id === productId);
    if (product) {
      setItemPrice(Number(product.purchase_price));
    }
  };

  const handleAddItem = () => {
    if (!selectedProduct || itemQuantity <= 0 || itemPrice <= 0) return;

    const product = products?.find((p) => p.id === selectedProduct);
    if (!product) return;

    const gstPercentage = Number(product.gst_percentage);
    const totalPrice = calculateItemTotal(itemPrice, itemQuantity, gstPercentage, itemDiscount);

    const existingIndex = orderItems.findIndex((item) => item.product_id === selectedProduct);

    if (existingIndex >= 0) {
      const newItems = [...orderItems];
      newItems[existingIndex].quantity += itemQuantity;
      newItems[existingIndex].total_price = calculateItemTotal(
        itemPrice,
        newItems[existingIndex].quantity,
        gstPercentage,
        itemDiscount
      );
      setOrderItems(newItems);
    } else {
      setOrderItems([
        ...orderItems,
        {
          product_id: product.id,
          product_name: `${product.name}${product.strength ? ` ${product.strength}` : ""}`,
          hsn_code: product.hsn_code || "",
          quantity: itemQuantity,
          unit_price: itemPrice,
          gst_percentage: gstPercentage,
          discount_percentage: itemDiscount,
          total_price: totalPrice,
        },
      ]);
    }

    setSelectedProduct("");
    setItemQuantity(1);
    setItemPrice(0);
    setItemDiscount(0);
  };

  const calculateItemTotal = (price: number, qty: number, gst: number, discount: number) => {
    const basePrice = price * qty;
    const discountedPrice = basePrice * (1 - discount / 100);
    const gstAmount = discountedPrice * (gst / 100);
    return discountedPrice + gstAmount;
  };

  const removeItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  // Calculate totals
  const itemsSubtotal = orderItems.reduce((sum, item) => {
    const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
    return sum + basePrice;
  }, 0);
  
  const totalGst = orderItems.reduce((sum, item) => {
    const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
    return sum + (basePrice * item.gst_percentage / 100);
  }, 0);
  
  const totalCharges = freightCharges + handlingCharges + otherCharges;
  const grandTotal = itemsSubtotal + totalGst + totalCharges;

  const filteredOrders = purchaseOrders?.filter(
    (order) =>
      order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.suppliers as any)?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "default";
      case "pending": return "secondary";
      case "shipped": return "outline";
      case "delivered": return "default";
      case "cancelled": return "destructive";
      default: return "outline";
    }
  };

  const handleProductCreated = (productId: string) => {
    refetchProducts();
    setSelectedProduct(productId);
    const product = products?.find((p) => p.id === productId);
    if (product) {
      setItemPrice(Number(product.purchase_price));
    }
  };

  const handleSupplierCreated = (supplierId: string) => {
    refetchSuppliers();
    setSelectedSupplier(supplierId);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Purchase Orders</h1>
          <p className="text-muted-foreground">Manage orders from suppliers</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Purchase Order</DialogTitle>
              <DialogDescription>Order products from a supplier</DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              {/* Supplier Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Supplier *</Label>
                  <div className="flex gap-2">
                    <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers?.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setShowSupplierDialog(true)}
                      title="Add new supplier"
                    >
                      <PlusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Expected Delivery Date</Label>
                  <Input
                    type="date"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Add Product */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Add Products</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <div className="md:col-span-2">
                      <Label>Product</Label>
                      <div className="flex gap-2">
                        <Select value={selectedProduct} onValueChange={handleProductSelect}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products?.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}{product.strength ? ` ${product.strength}` : ""} ({product.gst_percentage}% GST)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setShowProductDialog(true)}
                          title="Add new product"
                        >
                          <PlusCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label>Unit Price (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={itemPrice || ""}
                        onChange={(e) => setItemPrice(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        min={1}
                        value={itemQuantity}
                        onChange={(e) => setItemQuantity(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div>
                      <Label>Disc %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={itemDiscount || ""}
                        onChange={(e) => setItemDiscount(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button onClick={handleAddItem} className="w-full" disabled={!selectedProduct || itemPrice <= 0}>
                        Add
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Order Items */}
              {orderItems.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Order Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>HSN</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">GST</TableHead>
                          <TableHead className="text-right">Disc %</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderItems.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{item.product_name}</TableCell>
                            <TableCell className="text-muted-foreground">{item.hsn_code || "-"}</TableCell>
                            <TableCell className="text-right">₹{item.unit_price.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right">{item.gst_percentage}%</TableCell>
                            <TableCell className="text-right">{item.discount_percentage}%</TableCell>
                            <TableCell className="text-right font-medium">₹{item.total_price.toFixed(2)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => removeItem(index)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Other Charges */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Other Charges</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Freight Charges (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={freightCharges || ""}
                        onChange={(e) => setFreightCharges(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Handling Charges (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={handlingCharges || ""}
                        onChange={(e) => setHandlingCharges(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Other Charges (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={otherCharges || ""}
                        onChange={(e) => setOtherCharges(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Totals Summary */}
              {orderItems.length > 0 && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>₹{itemsSubtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>GST (CGST + SGST):</span>
                        <span>₹{totalGst.toFixed(2)}</span>
                      </div>
                      {totalCharges > 0 && (
                        <div className="flex justify-between">
                          <span>Other Charges:</span>
                          <span>₹{totalCharges.toFixed(2)}</span>
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
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes for this order"
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleCloseDialog}>Cancel</Button>
                <Button
                  onClick={() => createOrderMutation.mutate()}
                  disabled={orderItems.length === 0 || !selectedSupplier || createOrderMutation.isPending}
                >
                  Create Order (₹{grandTotal.toFixed(2)})
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
          ) : filteredOrders?.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No purchase orders found.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders?.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.order_number}</TableCell>
                      <TableCell>{(order.suppliers as any)?.name || "-"}</TableCell>
                      <TableCell>{format(new Date(order.order_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        {order.expected_delivery_date
                          ? format(new Date(order.expected_delivery_date), "dd/MM/yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(order.status)}>{order.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">₹{Number(order.total_amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <Select
                          value={order.status}
                          onValueChange={(status: OrderStatus) =>
                            updateStatusMutation.mutate({ id: order.id, status })
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="confirmed">Confirmed</SelectItem>
                            <SelectItem value="shipped">Shipped</SelectItem>
                            <SelectItem value="delivered">Delivered</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inline Add Dialogs */}
      <ProductFormDialog
        open={showProductDialog}
        onOpenChange={setShowProductDialog}
        onSuccess={handleProductCreated}
      />
      <SupplierFormDialog
        open={showSupplierDialog}
        onOpenChange={setShowSupplierDialog}
        onSuccess={handleSupplierCreated}
      />
    </div>
  );
}

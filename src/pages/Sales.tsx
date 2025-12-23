import { useState, useMemo } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, Receipt, CreditCard, Banknote, PlusCircle, AlertTriangle, Clock } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { ProductFormDialog } from "@/components/forms/ProductFormDialog";
import { allocateBatchesFIFO, getTotalAvailableStock } from "@/utils/fifoAllocation";
import type { Tables } from "@/integrations/supabase/types";

type SalesOrder = Tables<"sales_orders">;
type Product = Tables<"products">;
type InventoryBatch = Tables<"inventory_batches">;

interface CartItem {
  product_id: string;
  batch_id: string;
  product_name: string;
  batch_number: string;
  hsn_code: string;
  quantity: number;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  total_price: number;
  max_quantity: number;
  expiry_date: string;
}

export default function Sales() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [prescriptionNumber, setPrescriptionNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [notes, setNotes] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemDiscount, setItemDiscount] = useState<number>(0);
  
  // Other charges
  const [freightCharges, setFreightCharges] = useState<number>(0);
  const [handlingCharges, setHandlingCharges] = useState<number>(0);
  const [deliveryCharges, setDeliveryCharges] = useState<number>(0);
  const [otherCharges, setOtherCharges] = useState<number>(0);
  
  // Inline add product
  const [showProductDialog, setShowProductDialog] = useState(false);

  const { data: salesOrders, isLoading } = useQuery({
    queryKey: ["sales-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SalesOrder[];
    },
  });

  const { data: products, refetch: refetchProducts } = useQuery({
    queryKey: ["products-for-sale"],
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

  const { data: batches } = useQuery({
    queryKey: ["batches-for-product", selectedProduct],
    queryFn: async () => {
      if (!selectedProduct) return [];
      const { data, error } = await supabase
        .from("inventory_batches")
        .select("*")
        .eq("product_id", selectedProduct)
        .gt("quantity", 0)
        .gt("expiry_date", new Date().toISOString().split("T")[0])
        .order("expiry_date", { ascending: true }); // FEFO
      if (error) throw error;
      return data as InventoryBatch[];
    },
    enabled: !!selectedProduct,
  });

  const createSaleMutation = useMutation({
    mutationFn: async () => {
      const finalInvoiceNumber = invoiceNumber.trim() || `INV-${Date.now()}`;
      
      // Validate duplicate invoice number
      if (invoiceNumber.trim()) {
        const { data: existing, error: checkError } = await supabase
          .from("sales_orders")
          .select("id")
          .eq("invoice_number", invoiceNumber.trim())
          .limit(1);
        
        if (checkError) throw checkError;
        if (existing && existing.length > 0) {
          throw new Error(`Invoice number "${invoiceNumber}" already exists. Please use a unique invoice number.`);
        }
      }
      
      // Calculate item totals
      const itemsSubtotal = cart.reduce((sum, item) => {
        const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
        return sum + basePrice;
      }, 0);
      
      const gstAmount = cart.reduce((sum, item) => {
        const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
        return sum + (basePrice * item.gst_percentage / 100);
      }, 0);
      
      const discountAmount = cart.reduce((sum, item) => {
        return sum + (item.unit_price * item.quantity * item.discount_percentage / 100);
      }, 0);

      const totalCharges = freightCharges + handlingCharges + deliveryCharges + otherCharges;
      const totalAmount = itemsSubtotal + gstAmount + totalCharges;

      const { data: order, error: orderError } = await supabase
        .from("sales_orders")
        .insert({
          invoice_number: finalInvoiceNumber,
          customer_name: customerName,
          customer_phone: customerPhone || null,
          customer_address: customerAddress || null,
          prescription_number: prescriptionNumber || null,
          payment_method: paymentMethod,
          notes: notes || null,
          total_amount: totalAmount,
          gst_amount: gstAmount,
          discount_amount: discountAmount,
          freight_charges: freightCharges,
          handling_charges: handlingCharges,
          delivery_charges: deliveryCharges,
          other_charges: otherCharges,
          created_by: user?.id,
          status: "confirmed",
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = cart.map((item) => ({
        sales_order_id: order.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        gst_percentage: item.gst_percentage,
        discount_percentage: item.discount_percentage,
        total_price: item.total_price,
      }));

      const { error: itemsError } = await supabase
        .from("sales_order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Update batch quantities
      for (const item of cart) {
        const { error: batchError } = await supabase
          .from("inventory_batches")
          .update({ quantity: item.max_quantity - item.quantity })
          .eq("id", item.batch_id);
        if (batchError) throw batchError;
      }

      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["batches-for-product"] });
      toast({ title: "Sale completed", description: "Invoice has been generated successfully." });
      handleCloseDialog();
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setCart([]);
    setInvoiceNumber("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setPrescriptionNumber("");
    setPaymentMethod("cash");
    setNotes("");
    setSelectedProduct("");
    setItemQuantity(1);
    setItemDiscount(0);
    setFreightCharges(0);
    setHandlingCharges(0);
    setDeliveryCharges(0);
    setOtherCharges(0);
  };

  // Get existing cart quantities for the selected product to account for already allocated stock
  const existingCartQuantities = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach(item => {
      if (item.product_id === selectedProduct) {
        map.set(item.batch_id, (map.get(item.batch_id) || 0) + item.quantity);
      }
    });
    return map;
  }, [cart, selectedProduct]);

  // Calculate available stock for selected product
  const availableStock = useMemo(() => {
    if (!batches) return 0;
    return getTotalAvailableStock(batches, existingCartQuantities);
  }, [batches, existingCartQuantities]);

  const handleAddToCart = () => {
    if (!selectedProduct || itemQuantity <= 0) return;

    const product = products?.find((p) => p.id === selectedProduct);
    if (!product || !batches || batches.length === 0) {
      toast({ title: "No stock available", description: "This product has no available batches.", variant: "destructive" });
      return;
    }

    // Use FIFO allocation to distribute quantity across batches
    const allocationResult = allocateBatchesFIFO(batches, itemQuantity, existingCartQuantities);

    if (!allocationResult.success) {
      toast({ 
        title: "Insufficient stock", 
        description: allocationResult.message, 
        variant: "destructive" 
      });
      return;
    }

    const gstPercentage = Number(product.gst_percentage);
    const productName = `${product.name}${product.strength ? ` ${product.strength}` : ""}`;
    const hsnCode = product.hsn_code || "";

    // Add each allocated batch to cart
    let newCart = [...cart];
    
    for (const allocation of allocationResult.allocations) {
      const existingIndex = newCart.findIndex((item) => item.batch_id === allocation.batch_id);
      
      if (existingIndex >= 0) {
        // Update existing cart item
        const newQuantity = newCart[existingIndex].quantity + allocation.quantity;
        newCart[existingIndex].quantity = newQuantity;
        newCart[existingIndex].total_price = calculateItemTotal(
          allocation.mrp,
          newQuantity,
          gstPercentage,
          newCart[existingIndex].discount_percentage
        );
        newCart[existingIndex].max_quantity = allocation.available_quantity;
      } else {
        // Add new cart item
        const totalPrice = calculateItemTotal(allocation.mrp, allocation.quantity, gstPercentage, itemDiscount);
        newCart.push({
          product_id: product.id,
          batch_id: allocation.batch_id,
          product_name: productName,
          batch_number: allocation.batch_number,
          hsn_code: hsnCode,
          quantity: allocation.quantity,
          unit_price: allocation.mrp,
          gst_percentage: gstPercentage,
          discount_percentage: itemDiscount,
          total_price: totalPrice,
          max_quantity: allocation.available_quantity,
          expiry_date: allocation.expiry_date,
        });
      }
    }

    setCart(newCart);
    setSelectedProduct("");
    setItemQuantity(1);
    setItemDiscount(0);

    // Show info if quantity was split across batches
    if (allocationResult.allocations.length > 1) {
      toast({ 
        title: "FIFO Applied", 
        description: `Quantity split across ${allocationResult.allocations.length} batches (nearest expiry first)` 
      });
    }
  };

  const calculateItemTotal = (price: number, qty: number, gst: number, discount: number) => {
    const basePrice = price * qty;
    const discountedPrice = basePrice * (1 - discount / 100);
    const gstAmount = discountedPrice * (gst / 100);
    return discountedPrice + gstAmount;
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  // Calculate totals
  const itemsSubtotal = cart.reduce((sum, item) => {
    const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
    return sum + basePrice;
  }, 0);
  
  const totalGst = cart.reduce((sum, item) => {
    const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
    return sum + (basePrice * item.gst_percentage / 100);
  }, 0);
  
  const totalCharges = freightCharges + handlingCharges + deliveryCharges + otherCharges;
  const grandTotal = itemsSubtotal + totalGst + totalCharges;

  const filteredOrders = salesOrders?.filter(
    (order) =>
      order.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "default";
      case "pending": return "secondary";
      case "cancelled": return "destructive";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sales & Billing</h1>
          <p className="text-muted-foreground">Create invoices and manage sales</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Sale
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Sale</DialogTitle>
              <DialogDescription>Add products and complete the sale</DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              {/* Invoice & Customer Info */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invoice_number">Invoice # (Optional)</Label>
                  <Input
                    id="invoice_number"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Auto-generated if empty"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer_name">Customer Name *</Label>
                  <Input
                    id="customer_name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer_phone">Phone</Label>
                  <Input
                    id="customer_phone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prescription">Prescription #</Label>
                  <Input
                    id="prescription"
                    value={prescriptionNumber}
                    onChange={(e) => setPrescriptionNumber(e.target.value)}
                  />
                </div>
              </div>

              {/* Add Product to Cart */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Add Products</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <div className="md:col-span-2">
                      <Label>Product</Label>
                      <div className="flex gap-2">
                        <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products?.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}{product.strength ? ` ${product.strength}` : ""} - ₹{product.mrp}
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
                      <Label>Available Stock</Label>
                      <div className="h-10 px-3 py-2 bg-muted rounded-md flex items-center gap-2 text-sm">
                        {selectedProduct ? (
                          <>
                            <span className={availableStock > 0 ? "text-green-600 font-medium" : "text-destructive font-medium"}>
                              {availableStock} units
                            </span>
                            {availableStock === 0 && (
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Select product</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label>Qty</Label>
                      <Input
                        type="number"
                        min={1}
                        max={availableStock || undefined}
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
                      <Button 
                        onClick={handleAddToCart} 
                        className="w-full" 
                        disabled={!selectedProduct || availableStock === 0 || itemQuantity <= 0}
                      >
                        Add (FIFO)
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cart */}
              {cart.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Cart Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Batch</TableHead>
                          <TableHead>Expiry</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">GST</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cart.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{item.product_name}</TableCell>
                            <TableCell>{item.batch_number}</TableCell>
                            <TableCell>
                              {(() => {
                                const daysUntilExpiry = differenceInDays(new Date(item.expiry_date), new Date());
                                const isNearExpiry = daysUntilExpiry <= 60;
                                const isVeryNearExpiry = daysUntilExpiry <= 30;
                                return (
                                  <Badge 
                                    variant={isVeryNearExpiry ? "destructive" : isNearExpiry ? "secondary" : "outline"} 
                                    className={`text-xs gap-1 ${isNearExpiry ? "animate-pulse" : ""}`}
                                  >
                                    {isNearExpiry && <Clock className="h-3 w-3" />}
                                    {format(new Date(item.expiry_date), "MMM yy")}
                                    {isVeryNearExpiry && ` (${daysUntilExpiry}d)`}
                                  </Badge>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-right">₹{item.unit_price.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right">{item.gst_percentage}%</TableCell>
                            <TableCell className="text-right font-medium">₹{item.total_price.toFixed(2)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => removeFromCart(index)}>
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
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Freight (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={freightCharges || ""}
                        onChange={(e) => setFreightCharges(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Handling (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={handlingCharges || ""}
                        onChange={(e) => setHandlingCharges(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Delivery (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={deliveryCharges || ""}
                        onChange={(e) => setDeliveryCharges(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Other (₹)</Label>
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
              {cart.length > 0 && (
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

              {/* Payment */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">
                        <span className="flex items-center gap-2"><Banknote className="h-4 w-4" /> Cash</span>
                      </SelectItem>
                      <SelectItem value="card">
                        <span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Card</span>
                      </SelectItem>
                      <SelectItem value="upi">
                        <span className="flex items-center gap-2"><Receipt className="h-4 w-4" /> UPI</span>
                      </SelectItem>
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

              <DialogFooter>
                <Button variant="outline" onClick={handleCloseDialog}>Cancel</Button>
                <Button
                  onClick={() => createSaleMutation.mutate()}
                  disabled={cart.length === 0 || !customerName || createSaleMutation.isPending}
                >
                  Complete Sale (₹{grandTotal.toFixed(2)})
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
                placeholder="Search invoices..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading sales...</div>
          ) : filteredOrders?.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No sales found.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders?.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.invoice_number}</TableCell>
                      <TableCell>
                        <div>
                          <div>{order.customer_name}</div>
                          {order.customer_phone && (
                            <div className="text-sm text-muted-foreground">{order.customer_phone}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{format(new Date(order.sale_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="capitalize">{order.payment_method}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(order.status)}>{order.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">₹{Number(order.total_amount).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ProductFormDialog
        open={showProductDialog}
        onOpenChange={setShowProductDialog}
        onSuccess={() => refetchProducts()}
      />
    </div>
  );
}

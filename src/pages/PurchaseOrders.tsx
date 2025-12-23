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
import { Plus, Search, Trash2, Package, PlusCircle, FileText, ArrowRight, Lock, Link2 } from "lucide-react";
import { format } from "date-fns";
import { ProductFormDialog } from "@/components/forms/ProductFormDialog";
import { SupplierFormDialog } from "@/components/forms/SupplierFormDialog";
import { ReceiveInventoryDialog } from "@/components/dialogs/ReceiveInventoryDialog";
import { LinkedChallansDialog } from "@/components/dialogs/LinkedChallansDialog";
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
  fromChallan?: boolean; // Track if item was imported from challan
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
  
  // Challan/Invoice state
  const [challanNumber, setChallanNumber] = useState("");
  const [isChallan, setIsChallan] = useState(true);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [selectedChallanId, setSelectedChallanId] = useState<string | null>(null);
  const [newInvoiceNumber, setNewInvoiceNumber] = useState("");
  
  // Multi-challan invoice state
  const [pendingChallans, setPendingChallans] = useState<any[]>([]);
  const [selectedChallanIds, setSelectedChallanIds] = useState<string[]>([]);
  const [showChallanSelector, setShowChallanSelector] = useState(false);
  
  // Inline add dialogs
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  
  // Receive inventory dialog
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [selectedOrderForReceive, setSelectedOrderForReceive] = useState<{ id: string; supplierId: string } | null>(null);
  
  // Linked challans dialog
  const [linkedChallansDialogOpen, setLinkedChallansDialogOpen] = useState(false);
  const [selectedInvoiceForChallans, setSelectedInvoiceForChallans] = useState<string | null>(null);

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
      // Validate duplicate challan/invoice number
      if (challanNumber) {
        const { data: existing, error: checkError } = await supabase
          .from("purchase_orders")
          .select("id")
          .eq("supplier_id", selectedSupplier)
          .or(
            isChallan 
              ? `challan_number.eq.${challanNumber}` 
              : `invoice_number.eq.${challanNumber}`
          )
          .limit(1);
        
        if (checkError) throw checkError;
        if (existing && existing.length > 0) {
          throw new Error(`${isChallan ? "Challan" : "Invoice"} number "${challanNumber}" already exists for this supplier.`);
        }
      }

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
          challan_number: isChallan ? (challanNumber || null) : null,
          is_challan: isChallan,
          invoice_number: !isChallan ? (challanNumber || `INV-${Date.now()}`) : null,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // If invoice is merging challans, mark those challans as converted
      if (!isChallan && selectedChallanIds.length > 0) {
        const { error: updateError } = await supabase
          .from("purchase_orders")
          .update({ 
            converted_from_challan_id: order.id,
            is_challan: false 
          })
          .in("id", selectedChallanIds);
        
        if (updateError) {
          console.error("Error marking challans as converted:", updateError);
        }
      }

      // Only insert items that are NOT from challans (challan items already exist in purchase_order_items)
      const newItems = orderItems.filter(item => !item.fromChallan);
      if (newItems.length > 0) {
        const items = newItems.map((item) => ({
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
      }

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
    mutationFn: async ({ id, status, skipReceive }: { id: string; status: OrderStatus; skipReceive?: boolean }) => {
      const { error } = await supabase
        .from("purchase_orders")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
      return { id, status, skipReceive };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
      toast({ title: "Status updated" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Open receive dialog for manual receive
  const handleReceiveInventory = (orderId: string, supplierId: string) => {
    setSelectedOrderForReceive({ id: orderId, supplierId });
    setReceiveDialogOpen(true);
  };
  
  // Show linked challans for invoice
  const handleShowLinkedChallans = (invoiceId: string) => {
    setSelectedInvoiceForChallans(invoiceId);
    setLinkedChallansDialogOpen(true);
  };

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
    setChallanNumber("");
    setIsChallan(true);
    setPendingChallans([]);
    setSelectedChallanIds([]);
    setShowChallanSelector(false);
  };

  // Fetch pending challans for a supplier (only those not yet converted)
  const fetchPendingChallans = async (supplierId: string) => {
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("*")
      .eq("supplier_id", supplierId)
      .eq("is_challan", true)
      .is("converted_from_challan_id", null) // Only unconverted challans
      .order("order_date", { ascending: false });
    
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    
    setPendingChallans(data || []);
  };

  // Import items from selected challans
  const importChallanItems = async () => {
    if (selectedChallanIds.length === 0) return;

    try {
      const { data: items, error } = await supabase
        .from("purchase_order_items")
        .select(`
          *,
          products (name, strength, hsn_code, gst_percentage)
        `)
        .in("purchase_order_id", selectedChallanIds);

      if (error) throw error;

      const newItems: OrderItem[] = items.map((item) => ({
        product_id: item.product_id,
        product_name: `${(item.products as any).name}${(item.products as any).strength ? ` ${(item.products as any).strength}` : ""}`,
        hsn_code: (item.products as any).hsn_code || "",
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        gst_percentage: Number(item.gst_percentage),
        discount_percentage: Number(item.discount_percentage),
        total_price: Number(item.total_price),
        fromChallan: true, // Mark as imported from challan
      }));

      // Add challan items to the list (don't merge - keep separate)
      setOrderItems((prev) => [...prev, ...newItems]);
      toast({ 
        title: "Items Imported", 
        description: `${newItems.length} items imported from ${selectedChallanIds.length} challan(s). These items are locked and cannot be modified.` 
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Convert challan to invoice mutation
  const convertToInvoiceMutation = useMutation({
    mutationFn: async ({ challanId, invoiceNumber }: { challanId: string; invoiceNumber: string }) => {
      const { error } = await supabase
        .from("purchase_orders")
        .update({
          is_challan: false,
          invoice_number: invoiceNumber,
        })
        .eq("id", challanId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Converted to Invoice", description: "Challan has been converted to an invoice successfully." });
      setConvertDialogOpen(false);
      setSelectedChallanId(null);
      setNewInvoiceNumber("");
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleConvertToInvoice = (orderId: string) => {
    setSelectedChallanId(orderId);
    setNewInvoiceNumber(`INV-${Date.now()}`);
    setConvertDialogOpen(true);
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

    // Find existing non-challan item with same product to merge quantities
    const existingIndex = orderItems.findIndex(
      (item) => item.product_id === selectedProduct && !item.fromChallan
    );

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
      // Always add as new line (don't merge with challan items)
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
          fromChallan: false,
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
    const item = orderItems[index];
    if (item.fromChallan) {
      toast({ 
        title: "Cannot Remove", 
        description: "Items imported from challans cannot be removed.", 
        variant: "destructive" 
      });
      return;
    }
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

              {/* Challan/Invoice Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Document Type</Label>
                  <Select 
                    value={isChallan ? "challan" : "invoice"} 
                    onValueChange={(v) => {
                      const isNowChallan = v === "challan";
                      setIsChallan(isNowChallan);
                      if (!isNowChallan && selectedSupplier) {
                        fetchPendingChallans(selectedSupplier);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="challan">Challan (Temporary)</SelectItem>
                      <SelectItem value="invoice">Invoice (Final)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isChallan ? "Challan Number" : "Invoice Number"}</Label>
                  <Input
                    placeholder={isChallan ? "Supplier challan no." : "Supplier invoice no."}
                    value={challanNumber}
                    onChange={(e) => setChallanNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs block">
                    {isChallan 
                      ? "Challan is a temporary goods receipt. Convert to invoice when bill arrives."
                      : "Invoice is the final billing document from supplier."}
                  </Label>
                </div>
              </div>
              
              {/* Pending Challans Selection for Invoice */}
              {!isChallan && selectedSupplier && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Merge Pending Challans
                    </CardTitle>
                    <CardDescription>Select challans to include in this invoice</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!showChallanSelector ? (
                      <Button 
                        type="button"
                        variant="outline" 
                        className="w-full"
                        onClick={() => {
                          fetchPendingChallans(selectedSupplier);
                          setShowChallanSelector(true);
                        }}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        View Pending Challans from this Supplier
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        {pendingChallans.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No pending challans from this supplier
                          </p>
                        ) : (
                          <>
                            {pendingChallans.map((challan) => (
                              <div key={challan.id} className="flex items-center gap-3 p-2 rounded border bg-background">
                                <input
                                  type="checkbox"
                                  checked={selectedChallanIds.includes(challan.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedChallanIds([...selectedChallanIds, challan.id]);
                                    } else {
                                      setSelectedChallanIds(selectedChallanIds.filter(id => id !== challan.id));
                                    }
                                  }}
                                  className="h-4 w-4 rounded border-muted-foreground"
                                />
                                <div className="flex-1">
                                  <p className="text-sm font-medium">
                                    {challan.challan_number || challan.order_number}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {format(new Date(challan.order_date), "dd/MM/yyyy")} • ₹{Number(challan.total_amount).toFixed(2)}
                                  </p>
                                </div>
                              </div>
                            ))}
                            {selectedChallanIds.length > 0 && (
                              <Button 
                                type="button"
                                variant="secondary" 
                                className="w-full mt-2"
                                onClick={importChallanItems}
                              >
                                Import Items from {selectedChallanIds.length} Challan(s)
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

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
                          <TableRow key={index} className={item.fromChallan ? "bg-muted/30" : ""}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {item.fromChallan && <Lock className="h-3 w-3 text-muted-foreground" />}
                                {item.product_name}
                                {item.fromChallan && (
                                  <Badge variant="outline" className="text-xs">From Challan</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{item.hsn_code || "-"}</TableCell>
                            <TableCell className="text-right">₹{item.unit_price.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right">{item.gst_percentage}%</TableCell>
                            <TableCell className="text-right">{item.discount_percentage}%</TableCell>
                            <TableCell className="text-right font-medium">₹{item.total_price.toFixed(2)}</TableCell>
                            <TableCell>
                              {!item.fromChallan && (
                                <Button variant="ghost" size="icon" onClick={() => removeItem(index)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
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
                    <TableHead>Type</TableHead>
                    <TableHead>Challan/Invoice #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders?.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.order_number}</TableCell>
                      <TableCell>
                        <Badge variant={(order as any).is_challan ? "secondary" : "default"}>
                          {(order as any).is_challan ? "Challan" : "Invoice"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(order as any).is_challan 
                          ? (order as any).challan_number || "-"
                          : (order as any).invoice_number || "-"}
                      </TableCell>
                      <TableCell>{(order.suppliers as any)?.name || "-"}</TableCell>
                      <TableCell>{format(new Date(order.order_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(order.status)}>{order.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">₹{Number(order.total_amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={order.status}
                            onValueChange={(status: OrderStatus) =>
                              updateStatusMutation.mutate({ id: order.id, status, skipReceive: true })
                            }
                          >
                            <SelectTrigger className="w-28">
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
                          {order.status !== "delivered" && order.status !== "cancelled" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReceiveInventory(order.id, order.supplier_id)}
                              title="Receive to Inventory"
                            >
                              <Package className="h-4 w-4" />
                            </Button>
                          )}
                          {(order as any).is_challan && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConvertToInvoice(order.id)}
                              title="Convert to Invoice"
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          )}
                          {!(order as any).is_challan && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleShowLinkedChallans(order.id)}
                              title="View Linked Challans"
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
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

      {/* Convert Challan to Invoice Dialog */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert Challan to Invoice</DialogTitle>
            <DialogDescription>
              Enter the invoice number from the supplier's bill
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Invoice Number *</Label>
              <Input
                value={newInvoiceNumber}
                onChange={(e) => setNewInvoiceNumber(e.target.value)}
                placeholder="Enter supplier invoice number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selectedChallanId && convertToInvoiceMutation.mutate({
                challanId: selectedChallanId,
                invoiceNumber: newInvoiceNumber
              })}
              disabled={!newInvoiceNumber || convertToInvoiceMutation.isPending}
            >
              <FileText className="h-4 w-4 mr-2" />
              Convert to Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Receive Inventory Dialog */}
      <ReceiveInventoryDialog
        open={receiveDialogOpen}
        onOpenChange={setReceiveDialogOpen}
        orderId={selectedOrderForReceive?.id || null}
        supplierId={selectedOrderForReceive?.supplierId || null}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
          queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
        }}
      />
      
      {/* Linked Challans Dialog */}
      <LinkedChallansDialog
        open={linkedChallansDialogOpen}
        onOpenChange={setLinkedChallansDialogOpen}
        invoiceId={selectedInvoiceForChallans}
      />
    </div>
  );
}

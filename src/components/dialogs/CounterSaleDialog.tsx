import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trash2, AlertTriangle, Printer, FileText, FileSpreadsheet, Code, Zap, Search, Keyboard } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { allocateBatchesFIFO, getTotalAvailableStock } from "@/utils/fifoAllocation";
import { printBill, downloadBillHTML, downloadBillCSV, downloadBillPDF, type BillData } from "@/utils/billGenerator";
import type { Tables } from "@/integrations/supabase/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  drug_schedule: string;
}

interface NarcoticInfo {
  prescription_number: string;
  doctor_name: string;
  doctor_registration_number: string;
  patient_name: string;
}

interface CounterSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CounterSaleDialog({ open, onOpenChange }: CounterSaleDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const productSearchRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [productSearch, setProductSearch] = useState("");
  const [productPopoverOpen, setProductPopoverOpen] = useState(false);
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemDiscount, setItemDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  
  // Narcotic info for scheduled drugs
  const [narcoticInfo, setNarcoticInfo] = useState<NarcoticInfo>({
    prescription_number: "",
    doctor_name: "",
    doctor_registration_number: "",
    patient_name: "",
  });
  const [showNarcoticForm, setShowNarcoticForm] = useState(false);
  const [pendingNarcoticProduct, setPendingNarcoticProduct] = useState<string | null>(null);

  // Auto-focus product search when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => productSearchRef.current?.focus(), 100);
    }
  }, [open]);

  const { data: products } = useQuery({
    queryKey: ["products-for-counter-sale"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: open,
  });

  const { data: batches } = useQuery({
    queryKey: ["batches-for-counter-product", selectedProduct],
    queryFn: async () => {
      if (!selectedProduct) return [];
      const { data, error } = await supabase
        .from("inventory_batches")
        .select("*")
        .eq("product_id", selectedProduct)
        .gt("quantity", 0)
        .gt("expiry_date", new Date().toISOString().split("T")[0])
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return data as InventoryBatch[];
    },
    enabled: !!selectedProduct && open,
  });

  // Check if cart has any scheduled drugs
  const hasScheduledDrugs = useMemo(() => {
    return cart.some(item => item.drug_schedule !== "none");
  }, [cart]);

  const createCounterSaleMutation = useMutation({
    mutationFn: async () => {
      const invoiceNumber = `CS-${Date.now()}`;
      
      // Calculate totals
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

      const totalAmount = itemsSubtotal + gstAmount;

      // Create sales order with "Counter Sale" as customer
      const { data: order, error: orderError } = await supabase
        .from("sales_orders")
        .insert({
          invoice_number: invoiceNumber,
          customer_name: "Counter Sale",
          payment_method: paymentMethod,
          total_amount: totalAmount,
          gst_amount: gstAmount,
          discount_amount: discountAmount,
          created_by: user?.id,
          status: "confirmed",
          prescription_number: hasScheduledDrugs ? narcoticInfo.prescription_number : null,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
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

      // Record scheduled drug transactions
      const scheduledItems = cart.filter(item => item.drug_schedule !== "none");
      if (scheduledItems.length > 0) {
        for (const item of scheduledItems) {
          // Get current balance for this batch
          const { data: batchData } = await supabase
            .from("inventory_batches")
            .select("quantity")
            .eq("id", item.batch_id)
            .single();

          const { error: drugRegError } = await supabase
            .from("scheduled_drug_register")
            .insert({
              product_id: item.product_id,
              batch_id: item.batch_id,
              transaction_type: "sale",
              quantity: item.quantity,
              balance_quantity: batchData?.quantity || 0,
              prescription_number: narcoticInfo.prescription_number,
              doctor_name: narcoticInfo.doctor_name,
              doctor_registration_number: narcoticInfo.doctor_registration_number,
              patient_name: narcoticInfo.patient_name,
              recorded_by: user?.id,
            });

          if (drugRegError) throw drugRegError;
        }
      }

      return { order, invoiceNumber, totalAmount, gstAmount, discountAmount, itemsSubtotal };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["batches-for-counter-product"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-drug-register"] });
      
      // Prepare bill data
      const billData: BillData = {
        type: "sale",
        invoice_number: data.invoiceNumber,
        date: new Date().toISOString(),
        customer_name: "Counter Sale",
        items: cart.map(item => ({
          product_name: item.product_name,
          batch_number: item.batch_number,
          hsn_code: item.hsn_code,
          quantity: item.quantity,
          unit_price: item.unit_price,
          gst_percentage: item.gst_percentage,
          discount_percentage: item.discount_percentage,
          total_price: item.total_price,
          expiry_date: item.expiry_date,
        })),
        subtotal: data.itemsSubtotal,
        gst_amount: data.gstAmount,
        discount_amount: data.discountAmount,
        freight_charges: 0,
        handling_charges: 0,
        delivery_charges: 0,
        other_charges: 0,
        total_amount: data.totalAmount,
        payment_method: paymentMethod,
      };

      // Auto-print on completion
      printBill(billData);
      
      toast({ title: "Counter Sale Complete", description: `Invoice ${data.invoiceNumber} - ₹${data.totalAmount.toFixed(2)}` });
      handleClose();
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleClose = () => {
    setCart([]);
    setSelectedProduct("");
    setProductSearch("");
    setProductPopoverOpen(false);
    setItemQuantity(1);
    setItemDiscount(0);
    setPaymentMethod("cash");
    setNarcoticInfo({
      prescription_number: "",
      doctor_name: "",
      doctor_registration_number: "",
      patient_name: "",
    });
    setShowNarcoticForm(false);
    setPendingNarcoticProduct(null);
    onOpenChange(false);
  };

  const existingCartQuantities = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach(item => {
      if (item.product_id === selectedProduct) {
        map.set(item.batch_id, (map.get(item.batch_id) || 0) + item.quantity);
      }
    });
    return map;
  }, [cart, selectedProduct]);

  const availableStock = useMemo(() => {
    if (!batches) return 0;
    return getTotalAvailableStock(batches, existingCartQuantities);
  }, [batches, existingCartQuantities]);

  const handleAddToCart = (bypassNarcoticCheck = false) => {
    if (!selectedProduct || itemQuantity <= 0) return;

    const product = products?.find((p) => p.id === selectedProduct);
    if (!product || !batches || batches.length === 0) {
      toast({ title: "No stock available", variant: "destructive" });
      return;
    }

    // Check if it's a scheduled drug and needs prescription info
    if (product.drug_schedule !== "none" && !bypassNarcoticCheck) {
      // For narcotics, require prescription info
      if (!narcoticInfo.prescription_number || !narcoticInfo.doctor_name || !narcoticInfo.patient_name) {
        setPendingNarcoticProduct(selectedProduct);
        setShowNarcoticForm(true);
        return;
      }
    }

    const allocationResult = allocateBatchesFIFO(batches, itemQuantity, existingCartQuantities);

    if (!allocationResult.success) {
      toast({ title: "Insufficient stock", description: allocationResult.message, variant: "destructive" });
      return;
    }

    const gstPercentage = Number(product.gst_percentage);
    const productName = `${product.name}${product.strength ? ` ${product.strength}` : ""}`;
    const hsnCode = product.hsn_code || "";

    let newCart = [...cart];
    
    for (const allocation of allocationResult.allocations) {
      const existingIndex = newCart.findIndex((item) => item.batch_id === allocation.batch_id);
      
      if (existingIndex >= 0) {
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
          drug_schedule: product.drug_schedule,
        });
      }
    }

    setCart(newCart);
    setSelectedProduct("");
    setItemQuantity(1);
    setItemDiscount(0);

    if (allocationResult.allocations.length > 1) {
      toast({ title: "FIFO Applied", description: `Split across ${allocationResult.allocations.length} batches` });
    }
  };

  const handleNarcoticConfirm = () => {
    if (!narcoticInfo.prescription_number || !narcoticInfo.doctor_name || !narcoticInfo.patient_name) {
      toast({ title: "Required fields", description: "Please fill prescription, doctor and patient details", variant: "destructive" });
      return;
    }
    setShowNarcoticForm(false);
    if (pendingNarcoticProduct) {
      setSelectedProduct(pendingNarcoticProduct);
      setPendingNarcoticProduct(null);
      // Add with bypass since we now have the info
      setTimeout(() => handleAddToCart(true), 100);
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

  // Totals
  const itemsSubtotal = cart.reduce((sum, item) => {
    const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
    return sum + basePrice;
  }, 0);
  
  const totalGst = cart.reduce((sum, item) => {
    const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
    return sum + (basePrice * item.gst_percentage / 100);
  }, 0);
  
  const grandTotal = itemsSubtotal + totalGst;

  const getExpiryBadge = (expiryDate: string) => {
    const daysToExpiry = differenceInDays(new Date(expiryDate), new Date());
    if (daysToExpiry <= 30) {
      return <Badge variant="destructive" className="text-xs">Exp: {format(new Date(expiryDate), "MMM yy")}</Badge>;
    } else if (daysToExpiry <= 90) {
      return <Badge variant="secondary" className="text-xs bg-warning/20 text-warning">Exp: {format(new Date(expiryDate), "MMM yy")}</Badge>;
    }
    return <Badge variant="outline" className="text-xs">{format(new Date(expiryDate), "MMM yy")}</Badge>;
  };

  const getScheduleBadge = (schedule: string) => {
    if (schedule === "none") return null;
    const colors: Record<string, string> = {
      schedule_h: "bg-schedule-h text-white",
      schedule_h1: "bg-schedule-h1 text-white",
      schedule_x: "bg-schedule-x text-white",
      narcotic: "bg-schedule-narcotic text-white",
    };
    const labels: Record<string, string> = {
      schedule_h: "H",
      schedule_h1: "H1",
      schedule_x: "X",
      narcotic: "N",
    };
    return <Badge className={`${colors[schedule]} text-xs`}>{labels[schedule]}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Quick Counter Sale
            <Badge variant="outline" className="ml-2">Alt+A</Badge>
          </DialogTitle>
          <DialogDescription>Fast billing without customer details</DialogDescription>
        </DialogHeader>

        {/* Narcotic Form Modal */}
        {showNarcoticForm && (
          <Card className="border-warning bg-warning/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Scheduled Drug - Prescription Required
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Prescription # *</Label>
                  <Input
                    value={narcoticInfo.prescription_number}
                    onChange={(e) => setNarcoticInfo(prev => ({ ...prev, prescription_number: e.target.value }))}
                    placeholder="RX123456"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Patient Name *</Label>
                  <Input
                    value={narcoticInfo.patient_name}
                    onChange={(e) => setNarcoticInfo(prev => ({ ...prev, patient_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Doctor Name *</Label>
                  <Input
                    value={narcoticInfo.doctor_name}
                    onChange={(e) => setNarcoticInfo(prev => ({ ...prev, doctor_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Doctor Reg. #</Label>
                  <Input
                    value={narcoticInfo.doctor_registration_number}
                    onChange={(e) => setNarcoticInfo(prev => ({ ...prev, doctor_registration_number: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleNarcoticConfirm}>Confirm & Add</Button>
                <Button size="sm" variant="outline" onClick={() => { setShowNarcoticForm(false); setPendingNarcoticProduct(null); }}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {/* Fast Product Search */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-6">
              <Label className="text-xs flex items-center gap-1">
                Product
                <Badge variant="outline" className="text-xs px-1 py-0 ml-1">Type to search</Badge>
              </Label>
              <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={productPopoverOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedProduct ? (
                      <span className="truncate">
                        {products?.find(p => p.id === selectedProduct)?.name}
                        {products?.find(p => p.id === selectedProduct)?.strength && 
                          ` ${products?.find(p => p.id === selectedProduct)?.strength}`}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Search products...</span>
                    )}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput 
                      ref={productSearchRef}
                      placeholder="Type product name..." 
                      value={productSearch}
                      onValueChange={setProductSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No product found.</CommandEmpty>
                      <CommandGroup className="max-h-64 overflow-auto">
                        {products
                          ?.filter(product => 
                            product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                            product.generic_name?.toLowerCase().includes(productSearch.toLowerCase()) ||
                            product.manufacturer?.toLowerCase().includes(productSearch.toLowerCase())
                          )
                          .slice(0, 20) // Limit for performance
                          .map((product) => (
                            <CommandItem
                              key={product.id}
                              value={product.id}
                              onSelect={(value) => {
                                setSelectedProduct(value);
                                setProductPopoverOpen(false);
                                setProductSearch("");
                                setTimeout(() => quantityInputRef.current?.focus(), 50);
                              }}
                              className="flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <span>{product.name}</span>
                                {product.strength && <span className="text-muted-foreground text-xs">({product.strength})</span>}
                                {product.drug_schedule !== "none" && getScheduleBadge(product.drug_schedule)}
                              </div>
                              <span className="text-sm font-mono text-muted-foreground">₹{product.mrp}</span>
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Stock</Label>
              <div className="h-9 px-3 py-2 bg-muted rounded-md flex items-center justify-center text-sm font-medium">
                {selectedProduct ? (
                  <span className={availableStock > 0 ? "text-green-600" : "text-destructive"}>
                    {availableStock}
                  </span>
                ) : "-"}
              </div>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Qty</Label>
              <Input
                ref={quantityInputRef}
                type="number"
                min={1}
                max={availableStock}
                value={itemQuantity}
                onChange={(e) => setItemQuantity(Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && selectedProduct && itemQuantity > 0) {
                    e.preventDefault();
                    handleAddToCart();
                  }
                }}
              />
            </div>
            <div className="col-span-2 flex items-end">
              <Button 
                onClick={() => handleAddToCart()} 
                disabled={!selectedProduct || itemQuantity <= 0}
                className="w-full gap-1"
              >
                Add
                <Badge variant="secondary" className="text-xs px-1 py-0">↵</Badge>
              </Button>
            </div>
          </div>

          {/* Cart */}
          {cart.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="w-20">Qty</TableHead>
                      <TableHead className="text-right w-24">Price</TableHead>
                      <TableHead className="text-right w-24">Total</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.map((item, index) => (
                      <TableRow key={`${item.batch_id}-${index}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.product_name}</span>
                            {getScheduleBadge(item.drug_schedule)}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{item.batch_number}</span>
                            {getExpiryBadge(item.expiry_date)}
                          </div>
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell className="text-right font-mono">₹{item.unit_price.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono font-medium">₹{item.total_price.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeFromCart(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Totals & Payment */}
          {cart.length > 0 && (
            <div className="flex justify-between items-end">
              <div className="space-y-2">
                <Label className="text-xs">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-right space-y-1">
                <div className="text-sm text-muted-foreground">Subtotal: ₹{itemsSubtotal.toFixed(2)}</div>
                <div className="text-sm text-muted-foreground">GST: ₹{totalGst.toFixed(2)}</div>
                <div className="text-xl font-bold text-primary">Total: ₹{grandTotal.toFixed(2)}</div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={() => createCounterSaleMutation.mutate()}
            disabled={cart.length === 0 || createCounterSaleMutation.isPending}
            className="gap-2"
          >
            <Printer className="h-4 w-4" />
            {createCounterSaleMutation.isPending ? "Processing..." : "Complete & Print"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

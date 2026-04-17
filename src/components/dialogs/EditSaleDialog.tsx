import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useEnterNavigation, advanceToNextField } from "@/hooks/useEnterNavigation";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { usePlatformShortcut } from "@/hooks/usePlatformShortcut";
import { SHORTCUTS } from "@/lib/platform";
import { useInvoiceSettings } from "@/hooks/useInvoiceSettings";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, AlertTriangle, Receipt, Plus, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import { SalesItemsTable, type CartItem } from "@/components/billing/SalesItemsTable";
import { BillingTotals } from "@/components/billing/BillingTotals";
import type { Tables } from "@/integrations/supabase/types";

type SalesOrder = Tables<"sales_orders">;
type SalesOrderItem = Tables<"sales_order_items"> & {
  products?: { name: string; strength?: string };
  inventory_batches?: { batch_number: string };
};

interface EditableItem {
  id: string;
  product_id: string;
  product_name: string;
  batch_id: string;
  batch_label: string;
  quantity: number;
  free_quantity: number;
  max_quantity: number;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  total_price: number;
  isNew?: boolean;
}

interface EditSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string | null;
}

export function EditSaleDialog({ open, onOpenChange, saleId }: EditSaleDialogProps) {
  const { toast } = useToast();
  const { isAdmin, isPharmacist } = useAuth();
  const { companyId, gstInclusive } = useBusiness();
  const { settings, maxDiscountAllowed } = useInvoiceSettings();
  const queryClient = useQueryClient();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [prescriptionNumber, setPrescriptionNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [status, setStatus] = useState<string>("confirmed");
  const [freightCharges, setFreightCharges] = useState(0);
  const [handlingCharges, setHandlingCharges] = useState(0);
  const [deliveryCharges, setDeliveryCharges] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([]);

  // Add new item state
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addProductSearch, setAddProductSearch] = useState("");
  const [selectedNewProduct, setSelectedNewProduct] = useState<any>(null);
  const [selectedNewBatch, setSelectedNewBatch] = useState<any>(null);
  const [newItemQty, setNewItemQty] = useState(1);

  // Invoice number confirmation dialog
  const [showInvoiceConfirm, setShowInvoiceConfirm] = useState(false);
  const [pendingInvoiceNumber, setPendingInvoiceNumber] = useState("");
  const [invoicePopoverOpen, setInvoicePopoverOpen] = useState(false);

  const handleEnterNav = useEnterNavigation();
  const invoiceNumberRef = useRef<HTMLButtonElement>(null);
  const focusTrapRef = useFocusTrap<HTMLDivElement>(open, invoiceNumberRef);

  // Payment type cycling shortcut
  const paymentMethods = ["cash", "card", "upi"];
  usePlatformShortcut({
    shortcut: SHORTCUTS.CHANGE_PAYMENT_TYPE,
    callback: () => {
      const currentIndex = paymentMethods.indexOf(paymentMethod);
      const nextIndex = (currentIndex + 1) % paymentMethods.length;
      setPaymentMethod(paymentMethods[nextIndex]);
      toast({
        title: "Payment Method Changed",
        description: `Changed to ${paymentMethods[nextIndex].toUpperCase()}`,
      });
    },
    enabled: open
  });

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

  // Initialize invoice number when sale data loads
  useEffect(() => {
    if (sale?.invoice_number) {
      setInvoiceNumber(sale.invoice_number);
    }
  }, [sale?.invoice_number]);

  const { data: saleItems, isLoading: itemsLoading } = useQuery({
    queryKey: ["sale-items-for-edit", saleId],
    queryFn: async () => {
      if (!saleId) return [];
      const { data, error } = await supabase
        .from("sales_order_items")
        .select(`*, products(name, strength), inventory_batches(batch_number, quantity)`)
        .eq("sales_order_id", saleId);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!saleId && open,
  });

  // Fetch products for adding new items
  const { data: allProducts } = useQuery({
    queryKey: ["products-for-edit-sale"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, generic_name, manufacturer, mrp, sale_price, gst_percentage")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: open,
  });

  // Fetch batches for selected new product
  const { data: newProductBatches } = useQuery({
    queryKey: ["batches-for-new-product", selectedNewProduct?.id],
    queryFn: async () => {
      if (!selectedNewProduct) return [];
      const { data } = await supabase
        .from("inventory_batches")
        .select("id, batch_number, quantity, mrp, expiry_date")
        .eq("product_id", selectedNewProduct.id)
        .gt("quantity", 0)
        .order("expiry_date", { ascending: true });
      return data || [];
    },
    enabled: !!selectedNewProduct?.id,
  });

  // Populate form when sale data loads
  // Note: discount_amount in DB = item-level discounts + bill-level discount combined.
  // We must subtract item-level discounts to get only the bill-level discount.
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
      // Don't set discountAmount here - calculate after items load
    }
  }, [sale]);

  // Calculate bill-level discount by subtracting item-level discounts from total discount_amount
  useEffect(() => {
    if (sale && saleItems && saleItems.length > 0) {
      const itemLevelDiscount = saleItems.reduce((sum: number, item: any) => {
        const itemDisc = Number(item.unit_price) * item.quantity * (Number(item.discount_percentage) / 100);
        return sum + itemDisc;
      }, 0);
      const totalDiscount = Number(sale.discount_amount) || 0;
      const billOnly = Math.max(0, totalDiscount - itemLevelDiscount);
      setDiscountAmount(Math.round(billOnly * 100) / 100);
    } else if (sale && (!saleItems || saleItems.length === 0)) {
      setDiscountAmount(0);
    }
  }, [sale, saleItems]);

  useEffect(() => {
    if (saleItems) {
      setEditableItems(
        saleItems.map((item: any) => ({
          id: item.id,
          product_id: item.product_id,
          product_name: `${item.products?.name || ""}${item.products?.strength ? ` ${item.products.strength}` : ""}`,
          batch_id: item.batch_id,
          batch_label: item.inventory_batches?.batch_number || "",
          quantity: item.quantity,
          free_quantity: item.free_quantity || 0,
          max_quantity: item.quantity + (item.free_quantity || 0) + (item.inventory_batches?.quantity || 0),
          unit_price: Number(item.unit_price),
          gst_percentage: Number(item.gst_percentage),
          discount_percentage: Number(item.discount_percentage),
          total_price: Number(item.total_price),
        }))
      );
      setDeletedItemIds([]);
    }
  }, [saleItems]);

  const recalcItem = (item: EditableItem): EditableItem => {
    const base = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
    if (gstInclusive) {
      // Price already includes GST, total_price = base (inclusive)
      return { ...item, total_price: base };
    }
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
    if (!item.isNew) {
      setDeletedItemIds(prev => [...prev, item.id]);
    }
    setEditableItems(prev => prev.filter((_, i) => i !== index));
  };

  const addNewItem = () => {
    if (!selectedNewProduct || !selectedNewBatch) return;
    const price = selectedNewProduct.sale_price && Number(selectedNewProduct.sale_price) > 0
      ? Number(selectedNewProduct.sale_price)
      : Number(selectedNewProduct.mrp);
    const newItem: EditableItem = {
      id: crypto.randomUUID(),
      product_id: selectedNewProduct.id,
      product_name: selectedNewProduct.name,
      batch_id: selectedNewBatch.id,
      batch_label: selectedNewBatch.batch_number,
      quantity: newItemQty,
      free_quantity: 0,
      max_quantity: selectedNewBatch.quantity,
      unit_price: price,
      gst_percentage: Number(selectedNewProduct.gst_percentage),
      discount_percentage: 0,
      total_price: 0,
      isNew: true,
    };
    setEditableItems(prev => [...prev, recalcItem(newItem)]);
    setSelectedNewProduct(null);
    setSelectedNewBatch(null);
    setNewItemQty(1);
    setAddProductSearch("");
  };

  const itemsSubtotal = useMemo(() => {
    return editableItems.reduce((sum, item) => {
      return sum + item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
    }, 0);
  }, [editableItems]);

  const gstAmount = useMemo(() => {
    return editableItems.reduce((sum, item) => {
      const afterDiscount = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
      if (gstInclusive) {
        // Back-calculate GST from inclusive price
        return sum + (afterDiscount - afterDiscount / (1 + item.gst_percentage / 100));
      }
      return sum + (afterDiscount * item.gst_percentage / 100);
    }, 0);
  }, [editableItems, gstInclusive]);

  const totalCharges = freightCharges + handlingCharges + deliveryCharges + otherCharges;
  const grandTotal = gstInclusive
    ? itemsSubtotal + totalCharges - discountAmount
    : itemsSubtotal + gstAmount + totalCharges - discountAmount;

  const updateSaleMutation = useMutation({
    mutationFn: async () => {
      if (!saleId) throw new Error("No sale ID");

      // Delete removed items and restore inventory
      for (const itemId of deletedItemIds) {
        const orig = saleItems?.find((i: any) => i.id === itemId);
        if (orig) {
          const { data: currentBatch } = await supabase
            .from("inventory_batches")
            .select("quantity")
            .eq("id", orig.batch_id)
            .single();
          if (currentBatch) {
            const { error: batchErr } = await supabase.from("inventory_batches")
              .update({ quantity: currentBatch.quantity + orig.quantity })
              .eq("id", orig.batch_id)
              .select();
            if (batchErr) throw new Error(`Failed to restore inventory: ${batchErr.message}`);
          }
        }
        const { data: delResult, error: delErr } = await supabase
          .from("sales_order_items")
          .delete()
          .eq("id", itemId)
          .select();
        if (delErr) throw new Error(`Failed to remove item: ${delErr.message}`);
        if (!delResult || delResult.length === 0) throw new Error("Failed to remove item. Check permissions.");
      }

      // Update existing items
      for (const item of editableItems) {
        if (item.isNew) continue;
        const orig = saleItems?.find((i: any) => i.id === item.id);
        if (orig) {
          const origTotal = orig.quantity;
          const newTotal = item.quantity + item.free_quantity;
          const qtyDiff = origTotal - newTotal;
          if (qtyDiff !== 0) {
            const { data: currentBatch } = await supabase
              .from("inventory_batches")
              .select("quantity")
              .eq("id", item.batch_id)
              .single();
            if (currentBatch) {
              const { error: batchErr } = await supabase.from("inventory_batches")
                .update({ quantity: currentBatch.quantity + qtyDiff })
                .eq("id", item.batch_id)
                .select();
              if (batchErr) throw new Error(`Failed to update inventory: ${batchErr.message}`);
            }
          }
        }
        const { data: updResult, error: updateErr } = await supabase.from("sales_order_items").update({
          quantity: item.quantity,
          free_quantity: item.free_quantity,
          unit_price: item.unit_price,
          discount_percentage: item.discount_percentage,
          total_price: item.total_price,
          gst_percentage: item.gst_percentage,
        }).eq("id", item.id).select();
        if (updateErr) throw new Error(`Failed to update item: ${updateErr.message}`);
        if (!updResult || updResult.length === 0) throw new Error("Failed to update item. Check permissions.");
      }

      // Insert new items
      for (const item of editableItems.filter(i => i.isNew)) {
        const { error: insertErr } = await supabase.from("sales_order_items").insert({
          sales_order_id: saleId,
          product_id: item.product_id,
          batch_id: item.batch_id,
          quantity: item.quantity,
          free_quantity: item.free_quantity,
          unit_price: item.unit_price,
          gst_percentage: item.gst_percentage,
          discount_percentage: item.discount_percentage,
          total_price: item.total_price,
          company_id: companyId,
        });
        if (insertErr) throw new Error(`Failed to add item: ${insertErr.message}`);

        // Deduct inventory (quantity + free)
        const totalDeduct = item.quantity + item.free_quantity;
        const { data: batch } = await supabase.from("inventory_batches")
          .select("quantity").eq("id", item.batch_id).single();
        if (batch) {
          const { error: batchErr } = await supabase.from("inventory_batches")
            .update({ quantity: batch.quantity - totalDeduct })
            .eq("id", item.batch_id)
            .select();
          if (batchErr) throw new Error(`Failed to deduct inventory: ${batchErr.message}`);
        }
      }

      // Calculate combined discount (item-level + bill-level) to match creation format
      const itemLevelDiscount = editableItems.reduce((sum, item) => {
        return sum + item.unit_price * item.quantity * (item.discount_percentage / 100);
      }, 0);
      const combinedDiscount = itemLevelDiscount + discountAmount;

      // Update order header
      const { data: updOrder, error } = await supabase
        .from("sales_orders")
        .update({
          invoice_number: invoiceNumber,
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
          discount_amount: combinedDiscount,
          gst_amount: gstAmount,
          total_amount: grandTotal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", saleId)
        .select();

      if (error) throw error;
      if (!updOrder || updOrder.length === 0) throw new Error("Failed to update invoice. Check permissions.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sale-for-edit", saleId] });
      queryClient.invalidateQueries({ queryKey: ["sale-items-for-edit", saleId] });
      toast({ title: "Sale Updated", description: "Bill has been modified successfully" });
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
              Only administrators and pharmacists can modify bills.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isLoading = saleLoading || itemsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={focusTrapRef} className="max-w-4xl max-h-[90vh] overflow-y-auto" data-enter-nav onKeyDown={handleEnterNav}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Edit Sale - {sale?.invoice_number}
          </DialogTitle>
          <DialogDescription>
            Modify sale details, edit items, or add new products.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Invoice Number */}
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <Label>Invoice Number</Label>
                  {isAdmin ? (
                    <Popover open={invoicePopoverOpen} onOpenChange={setInvoicePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button ref={invoiceNumberRef} variant="outline" className="w-full justify-between font-mono" data-enter-nav-include="true">
                          {invoiceNumber || "Loading..."}
                          <ChevronsUpDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0">
                        <Command>
                          <CommandInput
                            placeholder="Enter invoice number..."
                            value={invoiceNumber}
                            onValueChange={setInvoiceNumber}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <div className="p-2 text-sm text-muted-foreground">
                                Enter a unique invoice number
                              </div>
                            </CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                onSelect={() => {
                                  // Check for duplicates
                                  if (invoiceNumber && invoiceNumber !== sale?.invoice_number) {
                                    setPendingInvoiceNumber(invoiceNumber);
                                    setShowInvoiceConfirm(true);
                                  } else {
                                    // No change needed, just advance to next field
                                    setTimeout(() => advanceToNextField(invoiceNumberRef.current), 50);
                                  }
                                  setInvoicePopoverOpen(false);
                                }}
                              >
                                Confirm: {invoiceNumber}
                              </CommandItem>
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <div className="font-mono text-sm p-2 bg-muted rounded border">
                      {invoiceNumber || "Loading..."}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Customer Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Customer Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Customer Name *</Label>
                    <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Prescription #</Label>
                    <Input value={prescriptionNumber} onChange={(e) => setPrescriptionNumber(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                     <Select value={status} onValueChange={(value) => { setStatus(value); setTimeout(() => advanceToNextField(document.activeElement as HTMLElement), 50); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
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

            {/* Editable Items */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Sale Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead className="text-right w-20">Qty</TableHead>
                      <TableHead className="text-right w-16">Free</TableHead>
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
                        <TableCell className="text-sm">{item.batch_label}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" min={1} max={item.max_quantity}
                            value={item.quantity}
                            onChange={(e) => updateItem(index, "quantity", e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                            className="w-16 h-7 text-center"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" min={0}
                            value={item.free_quantity}
                            onChange={(e) => updateItem(index, "free_quantity", e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                            className="w-14 h-7 text-center"
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" step="0.01" min={0}
                            value={item.unit_price}
                            onChange={(e) => updateItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                            className="w-20 h-7 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" step="0.1" min={0} max={100}
                            value={item.discount_percentage}
                            onChange={(e) => updateItem(index, "discount_percentage", parseFloat(e.target.value) || 0)}
                            className="w-14 h-7 text-center"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" step="1" min={0} max={28}
                            value={item.gst_percentage}
                            onChange={(e) => updateItem(index, "gst_percentage", parseFloat(e.target.value) || 0)}
                            className="w-14 h-7 text-center"
                          />
                        </TableCell>
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
                            <CommandInput placeholder="Search products..." value={addProductSearch} onValueChange={setAddProductSearch} />
                            <CommandList>
                              <CommandEmpty>No products found</CommandEmpty>
                              <CommandGroup>
                                {allProducts?.filter(p =>
                                  p.name.toLowerCase().includes(addProductSearch.toLowerCase()) ||
                                  p.generic_name?.toLowerCase().includes(addProductSearch.toLowerCase())
                                ).slice(0, 20).map(p => (
                                  <CommandItem key={p.id} value={p.name} onSelect={() => {
                                    setSelectedNewProduct(p);
                                    setSelectedNewBatch(null);
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
                      <div className="min-w-[140px]">
                        <Select value={selectedNewBatch?.id || ""} onValueChange={(v) => {
                          const b = newProductBatches?.find(b => b.id === v);
                          setSelectedNewBatch(b || null);
                          setTimeout(() => advanceToNextField(document.activeElement as HTMLElement), 50);
                        }}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Batch" />
                          </SelectTrigger>
                          <SelectContent>
                            {newProductBatches?.map(b => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.batch_number} (Qty: {b.quantity})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {selectedNewBatch && (
                      <>
                        <Input
                          type="number" min={1} max={selectedNewBatch.quantity}
                          value={newItemQty}
                          onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)}
                          className="w-16 h-8"
                          placeholder="Qty"
                        />
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
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Charges & Discounts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Freight (₹)</Label>
                    <Input type="number" min={0} value={freightCharges || ""} onChange={(e) => setFreightCharges(Number(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Handling (₹)</Label>
                    <Input type="number" min={0} value={handlingCharges || ""} onChange={(e) => setHandlingCharges(Number(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Delivery (₹)</Label>
                    <Input type="number" min={0} value={deliveryCharges || ""} onChange={(e) => setDeliveryCharges(Number(e.target.value) || 0)} />
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

            {/* Payment & Notes */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Method</Label>
                 <Select value={paymentMethod} onValueChange={(value) => { setPaymentMethod(value); setTimeout(() => advanceToNextField(document.activeElement as HTMLElement), 50); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
              </div>
            </div>

            {/* Totals */}
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>{gstInclusive ? "Net (GST Incl.):" : "Subtotal:"}</span><span>₹{itemsSubtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between text-muted-foreground text-xs"><span>{gstInclusive ? "Incl. GST:" : "GST:"}</span><span>₹{gstAmount.toFixed(2)}</span></div>
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
          <Button
            onClick={() => updateSaleMutation.mutate()}
            disabled={!customerName || editableItems.length === 0 || updateSaleMutation.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {updateSaleMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Invoice Number Confirmation Dialog */}
      <Dialog open={showInvoiceConfirm} onOpenChange={setShowInvoiceConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Invoice Number Change</DialogTitle>
            <DialogDescription>
              Changing the invoice number to "{pendingInvoiceNumber}" may affect record keeping and compliance.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded">
              <p className="text-sm text-amber-800">
                <strong>Current:</strong> {sale?.invoice_number}
              </p>
              <p className="text-sm text-amber-800">
                <strong>New:</strong> {pendingInvoiceNumber}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowInvoiceConfirm(false);
                  setPendingInvoiceNumber("");
                  setInvoiceNumber(sale?.invoice_number || "");
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  // Check for duplicates
                  const { data: existing } = await supabase
                    .from("sales_orders")
                    .select("id")
                    .eq("invoice_number", pendingInvoiceNumber)
                    .eq("company_id", companyId)
                    .neq("id", saleId)
                    .single();

                  if (existing) {
                    toast({
                      title: "Duplicate Invoice Number",
                      description: "This invoice number already exists for your company.",
                      variant: "destructive"
                    });
                    return;
                  }

                  setInvoiceNumber(pendingInvoiceNumber);
                  setShowInvoiceConfirm(false);
                  setPendingInvoiceNumber("");
                  toast({
                    title: "Invoice Number Updated",
                    description: "The invoice number has been changed successfully."
                  });
                }}
                className="flex-1"
              >
                Confirm Change
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

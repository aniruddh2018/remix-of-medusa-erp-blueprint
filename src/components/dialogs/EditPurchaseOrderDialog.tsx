import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useEnterNavigation, advanceToNextField } from "@/hooks/useEnterNavigation";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useInvoiceSettings } from "@/hooks/useInvoiceSettings";
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
import { PartySearchInput, type PartyRecord } from "@/components/PartySearchInput";
import { SupplierFormDialog } from "@/components/forms/SupplierFormDialog";
import { ProductFormDialog } from "@/components/forms/ProductFormDialog";
import { PurchaseItemsTable, type PurchaseItem } from "@/components/billing/PurchaseItemsTable";
import { BillingTotals } from "@/components/billing/BillingTotals";
import type { Tables } from "@/integrations/supabase/types";

type PurchaseOrder = Tables<"purchase_orders">;
type Supplier = Tables<"suppliers">;
type PurchaseOrderItem = Tables<"purchase_order_items"> & {
  products?: { name: string; strength?: string | null; hsn_code?: string | null; mrp?: number | null; base_unit?: string | null; unit?: string | null };
};

interface EditableItem {
  id: string;
  product_id: string;
  product_name: string;
  hsn_code: string;
  batch_number: string;
  quantity: number;
  free_quantity: number;
  purchased_unit?: string | null;
  base_unit?: string | null;
  base_quantity?: number | null;
  unit_price: number;
  mrp: number;
  gst_percentage: number;
  discount_percentage: number;
  discount_flat: number;
  total_price: number;
  expiry_date: string;
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
  const { companyId, config, gstInclusive } = useBusiness();
  const { settings, maxDiscountAllowed } = useInvoiceSettings();
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState("");
  const [challanNumber, setChallanNumber] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [status, setStatus] = useState<string>("pending");
  const [documentIsChallan, setDocumentIsChallan] = useState(true);
  const [freightCharges, setFreightCharges] = useState(0);
  const [handlingCharges, setHandlingCharges] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [billDiscountPercent, setBillDiscountPercent] = useState(0);
  const [billDiscountFlat, setBillDiscountFlat] = useState(0);
  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([]);

  // Supplier selection / inline edit-create
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierFormSeed, setSupplierFormSeed] = useState<Record<string, any>>({});

  // Invoice number confirmation dialog
  const [showInvoiceConfirm, setShowInvoiceConfirm] = useState(false);
  const [pendingInvoiceNumber, setPendingInvoiceNumber] = useState("");
  const [invoicePopoverOpen, setInvoicePopoverOpen] = useState(false);

  const handleEnterNav = useEnterNavigation();
  const invoiceNumberRef = useRef<HTMLButtonElement>(null);
  const focusTrapRef = useFocusTrap<HTMLDivElement>(open, invoiceNumberRef);

  // Add new item
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addProductSearch, setAddProductSearch] = useState("");
  const [selectedNewProduct, setSelectedNewProduct] = useState<any>(null);
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemFreeQty, setNewItemFreeQty] = useState(0);
  const [newItemPrice, setNewItemPrice] = useState(0);
  const [newItemMrp, setNewItemMrp] = useState(0);
  const [newItemBatch, setNewItemBatch] = useState("");
  const [newItemExpiry, setNewItemExpiry] = useState("");
  const [newItemDiscount, setNewItemDiscount] = useState(0);
  const [newItemDiscountFlat, setNewItemDiscountFlat] = useState(0);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Tables<"products"> | null>(null);

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
        .select(`*, products(name, strength, hsn_code, mrp, base_unit, unit)`)
        .eq("purchase_order_id", orderId);
      if (error) throw error;
      return data as PurchaseOrderItem[];
    },
    enabled: !!orderId && open,
  });

  // Initialize invoice number when order data loads
  useEffect(() => {
    if (order?.invoice_number) {
      setInvoiceNumber(order.invoice_number);
    }
  }, [order?.invoice_number]);

  const { data: allProducts } = useQuery({
    queryKey: ["products-for-edit-po"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!companyId && open,
  });

  // Suppliers list for the inline search
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("suppliers")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      return (data || []) as Supplier[];
    },
    enabled: !!companyId && open,
  });

  useEffect(() => {
    if (order) {
      setNotes(order.notes || "");
      setChallanNumber(order.challan_number || "");
      setInvoiceNumber(order.invoice_number || "");
      setExpectedDeliveryDate(order.expected_delivery_date || "");
      setStatus(order.status || "pending");
      setDocumentIsChallan(order.is_challan ?? true);
      setFreightCharges(Number(order.freight_charges) || 0);
      setHandlingCharges(Number(order.handling_charges) || 0);
      setOtherCharges(Number(order.other_charges) || 0);
      setSupplierId(order.supplier_id || null);
      setSupplierName(((order as any).suppliers?.name) || "");
      // Don't set discountAmount here - calculate after items load
    }
  }, [order]);

  // Store original quantities for inventory delta calculations
  const [originalQuantities, setOriginalQuantities] = useState<Record<string, { quantity: number; free_quantity: number; base_quantity: number; product_id: string }>>({});

  useEffect(() => {
    if (orderItems) {
      const origMap: Record<string, { quantity: number; free_quantity: number; base_quantity: number; product_id: string }> = {};
      const items = orderItems.map(item => {
        const baseUnit = item.products?.base_unit || item.products?.unit || "pcs";
        const baseQuantity = Number(item.base_quantity ?? (item.quantity + (item.free_quantity ?? 0)));
        origMap[item.id] = {
          quantity: item.quantity,
          free_quantity: item.free_quantity ?? 0,
          base_quantity: baseQuantity,
          product_id: item.product_id,
        };
        return {
          id: item.id,
          product_id: item.product_id,
          product_name: `${item.products?.name || ""}${item.products?.strength ? ` ${item.products.strength}` : ""}`,
          hsn_code: item.products?.hsn_code || "",
          batch_number: "",
          quantity: item.quantity,
          free_quantity: item.free_quantity ?? 0,
          purchased_unit: item.purchased_unit || baseUnit,
          base_unit: baseUnit,
          base_quantity: baseQuantity,
          unit_price: Number(item.unit_price),
          mrp: Number((item.products as any)?.mrp) || Number(item.unit_price) * 1.2,
          gst_percentage: Number(item.gst_percentage),
          discount_percentage: Number(item.discount_percentage),
          discount_flat: 0,
          total_price: Number(item.total_price),
          expiry_date: "",
        };
      });
      setEditableItems(items);
      setOriginalQuantities(origMap);
      setDeletedItemIds([]);

      // Calculate bill-level discount = total discount - item-level discounts
      if (order) {
        const itemLevelDiscount = orderItems.reduce((sum, item) => {
          return sum + Number(item.unit_price) * item.quantity * (Number(item.discount_percentage) / 100);
        }, 0);
        const totalDiscount = Number(order.discount_amount) || 0;
        setDiscountAmount(Math.max(0, Math.round((totalDiscount - itemLevelDiscount) * 100) / 100));
      }
    }
  }, [orderItems, order]);

  const recalcItem = (item: EditableItem): EditableItem => {
    const base = item.unit_price * item.quantity;
    const discounted = Math.max(0, base * (1 - item.discount_percentage / 100) - item.discount_flat);
    if (gstInclusive) return { ...item, total_price: discounted };
    const gst = discounted * item.gst_percentage / 100;
    return { ...item, total_price: discounted + gst };
  };

  const updateItem = (index: number, field: string, value: number) => {
    setEditableItems(prev => {
      const updated = [...prev];
      const current = updated[index];
      const oldTotal = current.quantity + (current.free_quantity || 0);
      const oldBase = current.base_quantity ?? oldTotal;
      const next = { ...current, [field]: value };
      const newTotal = next.quantity + (next.free_quantity || 0);
      if ((field === "quantity" || field === "free_quantity") && oldTotal > 0) {
        next.base_quantity = Number(((oldBase / oldTotal) * newTotal).toFixed(6));
      }
      updated[index] = recalcItem(next);
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
      hsn_code: selectedNewProduct.hsn_code || "",
      batch_number: newItemBatch,
      quantity: newItemQty,
      free_quantity: newItemFreeQty,
      purchased_unit: (selectedNewProduct.base_unit || selectedNewProduct.unit || "pcs").toLowerCase(),
      base_unit: (selectedNewProduct.base_unit || selectedNewProduct.unit || "pcs").toLowerCase(),
      base_quantity: newItemQty + (newItemFreeQty || 0),
      unit_price: newItemPrice || Number(selectedNewProduct.purchase_price),
      mrp: newItemMrp || Number(selectedNewProduct.mrp) || Number(selectedNewProduct.purchase_price) * 1.2,
      gst_percentage: Number(selectedNewProduct.gst_percentage),
      discount_percentage: newItemDiscount,
      discount_flat: newItemDiscountFlat,
      total_price: 0,
      expiry_date: newItemExpiry,
      isNew: true,
    };
    setEditableItems(prev => [...prev, recalcItem(newItem)]);
    setSelectedNewProduct(null);
    setNewItemQty(1);
    setNewItemFreeQty(0);
    setNewItemPrice(0);
    setNewItemMrp(0);
    setNewItemBatch("");
    setNewItemExpiry("");
    setNewItemDiscount(0);
    setNewItemDiscountFlat(0);
    setAddProductSearch("");
  };

  const itemsSubtotal = useMemo(() => {
    return editableItems.reduce((sum, item) => {
      const base = item.unit_price * item.quantity;
      return sum + Math.max(0, base * (1 - item.discount_percentage / 100) - item.discount_flat);
    }, 0);
  }, [editableItems]);

  const gstAmount = useMemo(() => {
    return editableItems.reduce((sum, item) => {
      const base = item.unit_price * item.quantity;
      const discounted = Math.max(0, base * (1 - item.discount_percentage / 100) - item.discount_flat);
      if (gstInclusive) return sum + (discounted - discounted / (1 + item.gst_percentage / 100));
      return sum + (discounted * item.gst_percentage / 100);
    }, 0);
  }, [editableItems, gstInclusive]);

  const totalCharges = freightCharges + handlingCharges + otherCharges;
  const grossTotal = editableItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const totalItemDiscount = editableItems.reduce((sum, item) => {
    const base = item.unit_price * item.quantity;
    return sum + (base * item.discount_percentage / 100) + item.discount_flat;
  }, 0);
  const grossSubtotal = gstInclusive ? itemsSubtotal + totalCharges : itemsSubtotal + gstAmount + totalCharges;
  const syncedBillDiscountAmount = discountAmount;
  const grandTotal = Math.max(0, grossSubtotal - syncedBillDiscountAmount);

  useEffect(() => {
    if (billDiscountPercent > 0) {
      setDiscountAmount(Math.round(grossSubtotal * (billDiscountPercent / 100) * 100) / 100);
    } else if (billDiscountFlat > 0) {
      setDiscountAmount(billDiscountFlat);
    }
  }, [billDiscountPercent, billDiscountFlat, grossSubtotal]);

  const purchaseItems: PurchaseItem[] = useMemo(() => editableItems.map((item) => ({
    product_id: item.product_id,
    product_name: item.product_name,
    hsn_code: item.hsn_code,
    batch_number: item.batch_number,
    quantity: item.quantity,
    free_quantity: item.free_quantity,
    purchased_unit: item.purchased_unit,
    base_unit: item.base_unit,
    base_quantity: item.base_quantity,
    unit_price: item.unit_price,
    gst_percentage: item.gst_percentage,
    discount_percentage: item.discount_percentage,
    discount_flat: item.discount_flat,
    total_price: item.total_price,
    expiry_date: item.expiry_date,
    mrp: item.mrp,
  })), [editableItems]);

  const handlePurchaseItemUpdate = (index: number, field: keyof PurchaseItem, value: string | number) => {
    setEditableItems((prev) => {
      const updated = [...prev];
      const current = updated[index];
      const oldTotal = current.quantity + (current.free_quantity || 0);
      const oldBase = current.base_quantity ?? oldTotal;
      const next = { ...current, [field]: value };
      const newTotal = next.quantity + (next.free_quantity || 0);
      if ((field === "quantity" || field === "free_quantity") && oldTotal > 0) {
        next.base_quantity = Number(((oldBase / oldTotal) * newTotal).toFixed(6));
      }
      updated[index] = recalcItem(next);
      return updated;
    });
  };

  const updateOrderMutation = useMutation({
    mutationFn: async () => {
      if (!orderId || !order) throw new Error("No order ID");
      // Use chosen supplierId (may differ from original) for new batches; original lookups
      // for existing items still match against the original supplier_id stored at receive time.
      const originalSupplierId = order.supplier_id;
      const effectiveSupplierId = supplierId || originalSupplierId;

      // --- 1. Handle DELETED items: restore inventory ---
      for (const itemId of deletedItemIds) {
        const orig = originalQuantities[itemId];
        if (orig) {
          const totalOrigQty = orig.base_quantity ?? (orig.quantity + orig.free_quantity);
          if (totalOrigQty > 0) {
            // Find matching batch by product_id + supplier_id
            const { data: batch } = await supabase
              .from("inventory_batches")
              .select("id, quantity")
              .eq("product_id", orig.product_id)
              .eq("supplier_id", originalSupplierId)
              .eq("company_id", companyId)
              .order("created_at", { ascending: false })
              .limit(1)
              .single();

            if (batch) {
              const newQty = Math.max(0, batch.quantity - totalOrigQty);
              await supabase.from("inventory_batches").update({ quantity: newQty }).eq("id", batch.id);
            }
          }
        }
        await supabase.from("purchase_order_items").delete().eq("id", itemId);
      }

      // --- 2. Handle EXISTING items: apply quantity delta to inventory ---
      for (const item of editableItems.filter(i => !i.isNew)) {
        const orig = originalQuantities[item.id];
        const oldTotal = orig ? orig.base_quantity : 0;
        const newTotal = item.base_quantity ?? (item.quantity + item.free_quantity);
        const delta = newTotal - oldTotal;

        // Update PO item
        await supabase.from("purchase_order_items").update({
          quantity: item.quantity,
          free_quantity: item.free_quantity,
          purchased_unit: item.purchased_unit || item.base_unit || null,
          base_quantity: item.base_quantity ?? (item.quantity + item.free_quantity),
          unit_price: item.unit_price,
          gst_percentage: item.gst_percentage,
          discount_percentage: item.discount_percentage,
          total_price: item.total_price,
        }).eq("id", item.id);

        // Adjust inventory batch if quantity changed
        if (delta !== 0) {
          const { data: batch } = await supabase
            .from("inventory_batches")
            .select("id, quantity")
            .eq("product_id", item.product_id)
            .eq("supplier_id", originalSupplierId)
            .eq("company_id", companyId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (batch) {
            const newQty = Math.max(0, batch.quantity + delta);
            await supabase.from("inventory_batches").update({ quantity: newQty }).eq("id", batch.id);
          }
        }
      }

      // --- 3. Handle NEW items: insert PO item + create inventory batch ---
      for (const item of editableItems.filter(i => i.isNew)) {
        await supabase.from("purchase_order_items").insert({
          purchase_order_id: orderId,
          product_id: item.product_id,
          quantity: item.quantity,
          free_quantity: item.free_quantity,
          purchased_unit: item.purchased_unit || item.base_unit || null,
          base_quantity: item.base_quantity ?? (item.quantity + item.free_quantity),
          unit_price: item.unit_price,
          gst_percentage: item.gst_percentage,
          discount_percentage: item.discount_percentage,
          total_price: item.total_price,
          company_id: companyId,
        });

        // Create inventory batch for new item
        const totalQty = item.base_quantity ?? (item.quantity + item.free_quantity);
        if (totalQty > 0) {
          const today = new Date().toISOString().split("T")[0];
          const defaultExpiry = new Date();
          defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 2);

          await supabase.from("inventory_batches").insert({
            product_id: item.product_id,
            batch_number: item.batch_number || `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            quantity: totalQty,
            purchase_price: item.unit_price,
            mrp: item.mrp || item.unit_price * 1.2,
            expiry_date: item.expiry_date || defaultExpiry.toISOString().split("T")[0],
            received_date: today,
            supplier_id: effectiveSupplierId,
            company_id: companyId,
          });
        }
      }

      // --- 4. Update order header ---
      const { error } = await supabase
        .from("purchase_orders")
        .update({
          notes: notes || null,
          challan_number: documentIsChallan ? (challanNumber || null) : null,
          invoice_number: documentIsChallan ? null : (invoiceNumber || challanNumber || null),
          is_challan: documentIsChallan,
          expected_delivery_date: expectedDeliveryDate || null,
          status: status as PurchaseOrder["status"],
          supplier_id: effectiveSupplierId,
          freight_charges: freightCharges,
          handling_charges: handlingCharges,
          other_charges: otherCharges,
          discount_amount: totalItemDiscount + discountAmount,
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
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast({ title: "Order Updated", description: "Purchase order and inventory have been updated." });
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
  const isChallan = documentIsChallan;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={focusTrapRef} className="max-w-4xl max-h-[90vh] overflow-y-auto" data-enter-nav onKeyDown={handleEnterNav}>
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
                                  if (invoiceNumber && invoiceNumber !== order?.invoice_number) {
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

            {/* Order Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Order Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Supplier *</Label>
                    <PartySearchInput
                      parties={suppliers as PartyRecord[] | undefined}
                      selectedId={supplierId}
                      selectedName={supplierName}
                      entityLabel="supplier"
                      enterNavInclude
                      required
                      placeholder="Type supplier name or phone…"
                      onSelect={(p) => { setSupplierId(p.id); setSupplierName(p.name); }}
                      onClear={() => { setSupplierId(null); setSupplierName(""); }}
                      onCreateNew={(seed) => {
                        setEditingSupplier(null);
                        setSupplierFormSeed(seed);
                        setSupplierFormOpen(true);
                      }}
                      onEditSelected={(p) => {
                        const s = suppliers?.find((x) => x.id === p.id);
                        if (s) {
                          setEditingSupplier(s);
                          setSupplierFormSeed({});
                          setSupplierFormOpen(true);
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Doc Type</Label>
                    <Select value={documentIsChallan ? "challan" : "invoice"} onValueChange={(value) => setDocumentIsChallan(value === "challan")}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="challan">Challan</SelectItem>
                        <SelectItem value="invoice">Invoice</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">{isChallan ? "Challan Number" : "Invoice Number"}</Label>
                    <Input
                      value={isChallan ? challanNumber : invoiceNumber}
                      onChange={(e) => isChallan ? setChallanNumber(e.target.value) : setInvoiceNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Invoice Date</Label>
                    <Input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Order Date</Label>
                    <p className="font-medium">{order?.order_date ? format(new Date(order.order_date), "dd/MM/yyyy") : "-"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add Products</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1"
                  onClick={() => { setEditingProduct(null); setProductFormOpen(true); }}
                >
                  <Plus className="h-3 w-3" /> New Product
                </Button>
              </div>
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <Popover open={addProductOpen} onOpenChange={setAddProductOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full justify-between text-sm">
                        {selectedNewProduct ? selectedNewProduct.name : "Select product..."}
                        <ChevronsUpDown className="h-3 w-3 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-0">
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
                                setNewItemMrp(Number(p.mrp));
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
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => { setEditingProduct(selectedNewProduct); setProductFormOpen(true); }}
                  >
                    Edit Product
                  </Button>
                )}
                {selectedNewProduct && (
                  <div className="w-full grid grid-cols-2 md:grid-cols-8 gap-2 mt-2">
                    <Input type="number" min={0} value={newItemQty === 0 ? '' : newItemQty}
                      onChange={(e) => setNewItemQty(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                      className="h-8" placeholder="Qty" />
                    <Input type="number" min={0} value={newItemFreeQty || ""}
                      onChange={(e) => setNewItemFreeQty(parseInt(e.target.value) || 0)}
                      className="h-8" placeholder="Free" />
                    <Input type="number" step="0.01" value={newItemPrice || ""}
                      onChange={(e) => setNewItemPrice(parseFloat(e.target.value) || 0)}
                      className="h-8" placeholder="Rate" />
                    <Input type="number" step="0.01" value={newItemMrp || ""}
                      onChange={(e) => setNewItemMrp(parseFloat(e.target.value) || 0)}
                      className="h-8" placeholder="MRP" />
                    <Input type="number" step="0.1" max={maxDiscountAllowed} value={newItemDiscount || ""}
                      onChange={(e) => setNewItemDiscount(Math.min(parseFloat(e.target.value) || 0, maxDiscountAllowed))}
                      className="h-8" placeholder="Disc%" />
                    <Input type="number" step="0.5" value={newItemDiscountFlat || ""}
                      onChange={(e) => setNewItemDiscountFlat(parseFloat(e.target.value) || 0)}
                      className="h-8" placeholder="Disc Rs" />
                    <Input value={newItemBatch}
                      onChange={(e) => setNewItemBatch(e.target.value)}
                      className="h-8" placeholder="Batch" />
                    <div className="flex gap-2">
                      <Input type="date" value={newItemExpiry}
                        onChange={(e) => setNewItemExpiry(e.target.value)}
                        className="h-8 text-xs" />
                      <Button size="sm" onClick={addNewItem} className="gap-1 h-8">
                        <Plus className="h-3 w-3" /> Add
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <PurchaseItemsTable
              items={purchaseItems}
              discountMode={settings.discount_mode}
              maxDiscountAllowed={maxDiscountAllowed}
              hasBatchTracking={config.hasBatchTracking || settings.enable_batch_tracking}
              onUpdateItem={handlePurchaseItemUpdate}
              onRemoveItem={removeItem}
              onDiscountExceeded={(max) => toast({ title: "Limit exceeded", description: `Max discount: ${max}%`, variant: "destructive" })}
            />

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" rows={2} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" min={0} value={freightCharges || ""} onChange={(e) => setFreightCharges(Number(e.target.value) || 0)} className="h-8 text-xs" placeholder="Freight Rs" />
                  <Input type="number" min={0} value={handlingCharges || ""} onChange={(e) => setHandlingCharges(Number(e.target.value) || 0)} className="h-8 text-xs" placeholder="Handling Rs" />
                  <Input type="number" min={0} value={otherCharges || ""} onChange={(e) => setOtherCharges(Number(e.target.value) || 0)} className="h-8 text-xs" placeholder="Other Rs" />
                </div>
              </div>
              <BillingTotals
                grossTotal={grossTotal}
                itemDiscount={totalItemDiscount}
                subtotal={itemsSubtotal}
                gstAmount={gstAmount}
                totalCharges={totalCharges}
                billDiscountAmount={discountAmount}
                grandTotal={grandTotal}
                gstInclusive={gstInclusive}
                settings={settings}
                maxDiscountAllowed={maxDiscountAllowed}
                billDiscountPercent={billDiscountPercent}
                billDiscountFlat={billDiscountFlat}
                onBillDiscountPercentChange={(v) => { setBillDiscountPercent(v); setBillDiscountFlat(0); }}
                onBillDiscountFlatChange={(v) => { setBillDiscountFlat(v); setBillDiscountPercent(0); }}
              />
            </div>
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
                <strong>Current:</strong> {order?.invoice_number}
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
                  setInvoiceNumber(order?.invoice_number || "");
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  // Check for duplicates
                  const { data: existing } = await supabase
                    .from("purchase_orders")
                    .select("id")
                    .eq("invoice_number", pendingInvoiceNumber)
                    .eq("company_id", companyId)
                    .neq("id", orderId)
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

      <SupplierFormDialog
        open={supplierFormOpen}
        onOpenChange={setSupplierFormOpen}
        editingSupplier={editingSupplier}
        initialData={supplierFormSeed}
        onSuccess={(newId) => {
          queryClient.invalidateQueries({ queryKey: ["suppliers", companyId] }).then(async () => {
            const { data } = await supabase.from("suppliers").select("*").eq("id", newId).single();
            if (data) {
              setSupplierId(data.id);
              setSupplierName(data.name);
            }
          });
        }}
      />
      <ProductFormDialog
        open={productFormOpen}
        onOpenChange={(open) => { setProductFormOpen(open); if (!open) setEditingProduct(null); }}
        editingProduct={editingProduct}
        onSuccess={(productId) => {
          queryClient.invalidateQueries({ queryKey: ["products-for-edit-po"] }).then(async () => {
            const { data } = await supabase.from("products").select("*").eq("id", productId).single();
            if (data) {
              setSelectedNewProduct(data);
              setNewItemPrice(Number(data.purchase_price));
              setNewItemMrp(Number(data.mrp));
            }
          });
        }}
      />
    </Dialog>
  );
}

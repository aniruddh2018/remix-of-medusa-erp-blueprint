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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, AlertTriangle, Receipt, Plus, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import { SalesItemsTable, type CartItem } from "@/components/billing/SalesItemsTable";
import { BillingTotals } from "@/components/billing/BillingTotals";
import { PartySearchInput, type PartyRecord } from "@/components/PartySearchInput";
import { CustomerFormDialog } from "@/components/forms/CustomerFormDialog";
import { DoctorSelector } from "@/components/DoctorSelector";
import type { Tables } from "@/integrations/supabase/types";

type Customer = Tables<"customers">;

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
  const { companyId, gstInclusive, config } = useBusiness();
  const { settings, maxDiscountAllowed } = useInvoiceSettings();
  const queryClient = useQueryClient();

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerGstin, setCustomerGstin] = useState("");
  const [prescriptionNumber, setPrescriptionNumber] = useState("");
  const [prescriptionDate, setPrescriptionDate] = useState("");
  const [prescriptionDurationDays, setPrescriptionDurationDays] = useState("");
  const [doctor, setDoctor] = useState<{ id: string | null; name: string; registration_number: string }>({ id: null, name: "", registration_number: "" });
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [noGstBill, setNoGstBill] = useState(false);

  // Customer create/edit form
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerFormSeed, setCustomerFormSeed] = useState<Record<string, any>>({});
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [status, setStatus] = useState<string>("confirmed");
  const [freightCharges, setFreightCharges] = useState(0);
  const [handlingCharges, setHandlingCharges] = useState(0);
  const [deliveryCharges, setDeliveryCharges] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [billDiscountPercent, setBillDiscountPercent] = useState(0);
  const [billDiscountFlat, setBillDiscountFlat] = useState(0);
  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([]);

  // Add new item state
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addProductSearch, setAddProductSearch] = useState("");
  const [selectedNewProduct, setSelectedNewProduct] = useState<any>(null);
  const [selectedNewBatch, setSelectedNewBatch] = useState<any>(null);
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemFreeQty, setNewItemFreeQty] = useState(0);
  const [newItemRate, setNewItemRate] = useState(0);
  const [newItemDiscount, setNewItemDiscount] = useState(0);

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
        .select("id, name, generic_name, manufacturer, mrp, sale_price, gst_percentage, hsn_code, drug_schedule, unit, base_unit")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!companyId && open,
  });

  // Customers list for the inline search
  const { data: customers } = useQuery({
    queryKey: ["customers", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("company_id", companyId)
        .order("name");
      return (data || []) as Customer[];
    },
    enabled: !!companyId && open,
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
      setCustomerId(sale.customer_id || null);
      setCustomerName(sale.customer_name || "");
      setCustomerPhone(sale.customer_phone || "");
      setCustomerAddress(sale.customer_address || "");
      setCustomerGstin(sale.customer_gstin || "");
      setPrescriptionNumber(sale.prescription_number || "");
      setPrescriptionDate(sale.prescription_date || "");
      setPrescriptionDurationDays(sale.prescription_duration_days ? String(sale.prescription_duration_days) : "");
      setDoctor({
        id: sale.doctor_id || null,
        name: sale.doctor_name || "",
        registration_number: sale.doctor_registration_number || "",
      });
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
      free_quantity: newItemFreeQty,
      max_quantity: selectedNewBatch.quantity,
      unit_price: newItemRate || price,
      gst_percentage: noGstBill ? 0 : Number(selectedNewProduct.gst_percentage),
      discount_percentage: newItemDiscount,
      total_price: 0,
      isNew: true,
    };
    setEditableItems(prev => [...prev, recalcItem(newItem)]);
    setSelectedNewProduct(null);
    setSelectedNewBatch(null);
    setNewItemQty(1);
    setNewItemFreeQty(0);
    setNewItemRate(0);
    setNewItemDiscount(0);
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
      if (rxRequired) {
        const missing: string[] = [];
        if (!doctor.name.trim()) missing.push("Doctor");
        if (!prescriptionDate) missing.push("Prescription Date");
        if (!prescriptionDurationDays || parseInt(prescriptionDurationDays, 10) <= 0) missing.push("Prescription Duration");
        if (missing.length > 0) throw new Error(`${missing.join(", ")} required for scheduled drug sale.`);
      }

      // Delete removed items and restore inventory (in BASE units via RPC, preserves sold-unit conversion)
      const restoreOnDelete: any[] = [];
      for (const itemId of deletedItemIds) {
        const orig = saleItems?.find((i: any) => i.id === itemId);
        if (orig) {
          // Use the stored base_quantity (already in product base units) so
          // inventory_batches.loose/quantity is restored in the correct unit.
          // Falls back to qty+free for legacy rows that predate base_quantity.
          const origTotal = (orig.quantity || 0) + (orig.free_quantity || 0);
          const baseQty = orig.base_quantity ?? origTotal;
          if (baseQty > 0) {
            restoreOnDelete.push({
              batch_id: orig.batch_id,
              quantity: orig.quantity || 0,
              free_quantity: orig.free_quantity || 0,
              base_quantity: baseQty,
              reference_id: saleId,
            });
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
      if (restoreOnDelete.length > 0) {
        const { error: restErr } = await supabase.rpc("restore_sale_inventory", { _items: restoreOnDelete });
        if (restErr) throw new Error(`Failed to restore inventory: ${restErr.message}`);
      }

      // Update existing items — adjust inventory by BASE-unit delta via RPC.
      // Preserves the original sold-unit factor so changing qty on a sale that
      // was made in strips still deducts strips worth of base units.
      const restoreFromUpdate: any[] = [];
      const deductFromUpdate: any[] = [];
      for (const item of editableItems) {
        if (item.isNew) continue;
        const orig = saleItems?.find((i: any) => i.id === item.id);
        let newBaseQty = item.quantity + item.free_quantity;
        if (orig) {
          const origTotal = (orig.quantity || 0) + (orig.free_quantity || 0);
          const origBase = orig.base_quantity ?? origTotal;
          const factor = origTotal > 0 ? origBase / origTotal : 1;
          newBaseQty = Math.round((item.quantity + item.free_quantity) * factor);
          const baseDiff = origBase - newBaseQty;
          if (baseDiff > 0) {
            restoreFromUpdate.push({
              batch_id: item.batch_id,
              quantity: 0,
              free_quantity: 0,
              base_quantity: baseDiff,
              reference_id: saleId,
            });
          } else if (baseDiff < 0) {
            deductFromUpdate.push({
              batch_id: item.batch_id,
              quantity: 0,
              free_quantity: 0,
              base_quantity: Math.abs(baseDiff),
              reference_id: saleId,
              unit_price: item.unit_price,
            });
          }
        }
        const { data: updResult, error: updateErr } = await supabase.from("sales_order_items").update({
          quantity: item.quantity,
          free_quantity: item.free_quantity,
          unit_price: item.unit_price,
          discount_percentage: item.discount_percentage,
          total_price: item.total_price,
          gst_percentage: item.gst_percentage,
          base_quantity: newBaseQty,
        }).eq("id", item.id).select();
        if (updateErr) throw new Error(`Failed to update item: ${updateErr.message}`);
        if (!updResult || updResult.length === 0) throw new Error("Failed to update item. Check permissions.");
      }
      if (restoreFromUpdate.length > 0) {
        const { error: rErr } = await supabase.rpc("restore_sale_inventory", { _items: restoreFromUpdate });
        if (rErr) throw new Error(`Failed to restore inventory: ${rErr.message}`);
      }
      if (deductFromUpdate.length > 0) {
        const { error: dErr } = await supabase.rpc("deduct_sale_inventory", { _items: deductFromUpdate });
        if (dErr) throw new Error(`Failed to deduct inventory: ${dErr.message}`);
      }

      // Insert new items (added in product's base unit) and deduct via RPC
      const newDeducts: any[] = [];
      for (const item of editableItems.filter(i => i.isNew)) {
        const baseQty = item.quantity + item.free_quantity;
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
          base_quantity: baseQty,
        });
        if (insertErr) throw new Error(`Failed to add item: ${insertErr.message}`);

        if (baseQty > 0) {
          newDeducts.push({
            batch_id: item.batch_id,
            quantity: item.quantity,
            free_quantity: item.free_quantity,
            base_quantity: baseQty,
            reference_id: saleId,
            unit_price: item.unit_price,
          });
        }
      }
      if (newDeducts.length > 0) {
        const { error: ndErr } = await supabase.rpc("deduct_sale_inventory", { _items: newDeducts });
        if (ndErr) throw new Error(`Failed to deduct inventory: ${ndErr.message}`);
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
          customer_id: customerId,
          customer_name: customerName,
          customer_phone: customerPhone || null,
          customer_address: customerAddress || null,
          customer_gstin: customerGstin || null,
          prescription_number: prescriptionNumber || null,
          prescription_date: prescriptionDate || null,
          prescription_duration_days: prescriptionDurationDays ? parseInt(prescriptionDurationDays, 10) : null,
          doctor_id: doctor.id,
          doctor_name: doctor.name || null,
          doctor_registration_number: doctor.registration_number || null,
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

  // Map editableItems → CartItem[] shape for SalesItemsTable (must be before any early return)
  const cartItems: CartItem[] = useMemo(() => editableItems.map((it) => {
    return {
      product_id: it.product_id,
      batch_id: it.batch_id,
      product_name: it.product_name,
      batch_number: it.batch_label,
      hsn_code: allProducts?.find((p) => p.id === it.product_id)?.hsn_code || "",
      quantity: it.quantity,
      free_quantity: it.free_quantity,
      unit_price: it.unit_price,
      gst_percentage: it.gst_percentage,
      discount_percentage: it.discount_percentage,
      discount_flat: 0,
      total_price: it.total_price,
      max_quantity: it.max_quantity,
      expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      base_unit: allProducts?.find((p) => p.id === it.product_id)?.base_unit || allProducts?.find((p) => p.id === it.product_id)?.unit || undefined,
    };
  }), [editableItems, allProducts]);

  // Sync bill discount inputs → discountAmount
  const grossSubtotal = itemsSubtotal + (gstInclusive ? 0 : gstAmount) + totalCharges;
  useEffect(() => {
    if (billDiscountPercent > 0) {
      setDiscountAmount(Math.round(grossSubtotal * (billDiscountPercent / 100) * 100) / 100);
    } else if (billDiscountFlat > 0) {
      setDiscountAmount(billDiscountFlat);
    }
  }, [billDiscountPercent, billDiscountFlat, grossSubtotal]);

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

  const handleCartUpdate = (index: number, field: keyof CartItem, value: string | number) => {
    if (field === "quantity" || field === "free_quantity" || field === "unit_price" || field === "discount_percentage") {
      updateItem(index, field as string, Number(value));
    } else if (field === "discount_flat") {
      const it = editableItems[index];
      const flat = Number(value);
      const base = it.unit_price * it.quantity;
      const pct = base > 0 ? Math.min((flat / base) * 100, 100) : 0;
      updateItem(index, "discount_percentage", pct);
    }
  };

  const itemDiscountTotal = editableItems.reduce((s, it) => s + it.unit_price * it.quantity * (it.discount_percentage / 100), 0);
  const rxCheck = (settings.prescription_check || {}) as Record<string, boolean>;
  const rxRequired = config.hasDrugSchedule && editableItems.some((item) => {
    const product = allProducts?.find((p) => p.id === item.product_id);
    return product?.drug_schedule && product.drug_schedule !== "none" && rxCheck[product.drug_schedule];
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={focusTrapRef}
        className="w-screen h-[100dvh] max-w-none max-h-none overflow-y-auto rounded-none p-4 sm:p-6"
        data-enter-nav
        onKeyDown={handleEnterNav}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Edit Sale — {sale?.invoice_number}
          </DialogTitle>
          <DialogDescription>Modify sale details, edit items, or add new products.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header row: Invoice / Customer / Payment / Status */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Invoice #</Label>
                {isAdmin ? (
                  <Popover open={invoicePopoverOpen} onOpenChange={setInvoicePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button ref={invoiceNumberRef} variant="outline" className="w-full justify-between font-mono h-10" data-enter-nav-include="true">
                        {invoiceNumber || "Loading..."}
                        <ChevronsUpDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Enter invoice number..." value={invoiceNumber} onValueChange={setInvoiceNumber} />
                        <CommandList>
                          <CommandEmpty><div className="p-2 text-sm text-muted-foreground">Enter a unique invoice number</div></CommandEmpty>
                          <CommandGroup>
                            <CommandItem onSelect={() => {
                              if (invoiceNumber && invoiceNumber !== sale?.invoice_number) {
                                setPendingInvoiceNumber(invoiceNumber);
                                setShowInvoiceConfirm(true);
                              } else {
                                setTimeout(() => advanceToNextField(invoiceNumberRef.current), 50);
                              }
                              setInvoicePopoverOpen(false);
                            }}>Confirm: {invoiceNumber}</CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div className="font-mono text-sm p-2 bg-muted rounded border h-10 flex items-center">{invoiceNumber || "Loading..."}</div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Customer *</Label>
                <PartySearchInput
                  parties={customers as PartyRecord[] | undefined}
                  selectedId={customerId}
                  selectedName={customerName}
                  entityLabel="customer"
                  enterNavInclude
                  required
                  placeholder="Type customer name or phone…"
                  onSelect={(p) => {
                    const c = customers?.find((x) => x.id === p.id);
                    setCustomerId(p.id);
                    setCustomerName(p.name);
                    setCustomerPhone(c?.phone || "");
                    setCustomerAddress(c?.address || "");
                    setCustomerGstin(c?.gst_number || "");
                  }}
                  onClear={() => {
                    setCustomerId(null);
                    setCustomerName("");
                    setCustomerPhone("");
                    setCustomerAddress("");
                    setCustomerGstin("");
                  }}
                  onCreateNew={(seed) => {
                    setEditingCustomer(null);
                    setCustomerFormSeed(seed);
                    setCustomerFormOpen(true);
                  }}
                  onEditSelected={(p) => {
                    const c = customers?.find((x) => x.id === p.id);
                    if (c) {
                      setEditingCustomer(c);
                      setCustomerFormSeed({});
                      setCustomerFormOpen(true);
                    }
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Payment</Label>
                <Select value={paymentMethod} onValueChange={(value) => { setPaymentMethod(value); setTimeout(() => advanceToNextField(document.activeElement as HTMLElement), 50); }}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={status} onValueChange={(value) => { setStatus(value); setTimeout(() => advanceToNextField(document.activeElement as HTMLElement), 50); }}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs text-muted-foreground">Phone</Label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs text-muted-foreground">Address</Label>
                <Input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs text-muted-foreground">GSTIN</Label>
                <Input value={customerGstin} onChange={(e) => setCustomerGstin(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs text-muted-foreground">Prescription #</Label>
                <Input value={prescriptionNumber} onChange={(e) => setPrescriptionNumber(e.target.value)} className="h-10" />
              </div>
              {config.hasDrugSchedule && (
                <>
                  <div className="space-y-1 md:col-span-2">
                    <DoctorSelector value={doctor} onChange={setDoctor} required={rxRequired} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Rx Date {rxRequired && <span className="text-destructive">*</span>}
                    </Label>
                    <Input
                      type="date"
                      value={prescriptionDate}
                      onChange={(e) => setPrescriptionDate(e.target.value)}
                      max={new Date().toISOString().slice(0, 10)}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Duration Days {rxRequired && <span className="text-destructive">*</span>}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={prescriptionDurationDays}
                      onChange={(e) => setPrescriptionDurationDays(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </>
              )}
              <div className="flex items-end gap-2">
                <div className="flex h-10 items-center gap-2">
                  <Switch
                    id="edit-sale-no-gst"
                    checked={noGstBill}
                    onCheckedChange={(checked) => {
                      setNoGstBill(checked);
                      setEditableItems((items) => items.map((item) => {
                        const product = allProducts?.find((p) => p.id === item.product_id);
                        return recalcItem({ ...item, gst_percentage: checked ? 0 : Number(product?.gst_percentage ?? item.gst_percentage) });
                      }));
                    }}
                  />
                  <Label htmlFor="edit-sale-no-gst" className="text-xs text-muted-foreground">No GST</Label>
                </div>
              </div>
            </div>

            {/* Add Product strip — same shape as new billing screen */}
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add Products</Label>
              </div>
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <Popover open={addProductOpen} onOpenChange={setAddProductOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between h-9 text-sm">
                        {selectedNewProduct ? selectedNewProduct.name : "Search product..."}
                        <ChevronsUpDown className="h-3 w-3 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-0">
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
                              }}>{p.name}</CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                {selectedNewProduct && (
                  <div className="min-w-[160px]">
                    <Select value={selectedNewBatch?.id || ""} onValueChange={(v) => {
                      const b = newProductBatches?.find(b => b.id === v);
                      setSelectedNewBatch(b || null);
                      setTimeout(() => advanceToNextField(document.activeElement as HTMLElement), 50);
                    }}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Batch" /></SelectTrigger>
                      <SelectContent>
                        {newProductBatches?.map(b => (
                          <SelectItem key={b.id} value={b.id}>{b.batch_number} (Qty: {b.quantity})</SelectItem>
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
                      className="w-20 h-9" placeholder="Qty"
                    />
                    <Input
                      type="number" min={0}
                      value={newItemFreeQty || ""}
                      onChange={(e) => setNewItemFreeQty(parseInt(e.target.value) || 0)}
                      className="w-20 h-9" placeholder="Free"
                    />
                    <Input
                      type="number" min={0} step={0.01}
                      value={newItemRate || ""}
                      onChange={(e) => setNewItemRate(parseFloat(e.target.value) || 0)}
                      className="w-24 h-9" placeholder="Rate"
                    />
                    <Input
                      type="number" min={0} max={maxDiscountAllowed} step={0.1}
                      value={newItemDiscount || ""}
                      onChange={(e) => setNewItemDiscount(Math.min(parseFloat(e.target.value) || 0, maxDiscountAllowed))}
                      className="w-24 h-9" placeholder="Disc%"
                    />
                    <Button size="sm" onClick={addNewItem} className="gap-1 h-9">
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Items table — same component used by new billing screen */}
            <SalesItemsTable
              cart={cartItems}
              settings={settings}
              maxDiscountAllowed={maxDiscountAllowed}
              gstInclusive={gstInclusive}
              onUpdateItem={handleCartUpdate}
              onRemoveItem={removeItem}
            />

            {/* Bottom: notes + charges (left) | totals (right) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" rows={2} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Freight ₹</Label>
                    <Input type="number" min={0} value={freightCharges || ""} onChange={(e) => setFreightCharges(Number(e.target.value) || 0)} className="h-9" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Handling ₹</Label>
                    <Input type="number" min={0} value={handlingCharges || ""} onChange={(e) => setHandlingCharges(Number(e.target.value) || 0)} className="h-9" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Delivery ₹</Label>
                    <Input type="number" min={0} value={deliveryCharges || ""} onChange={(e) => setDeliveryCharges(Number(e.target.value) || 0)} className="h-9" />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Other ₹</Label>
                    <Input type="number" min={0} value={otherCharges || ""} onChange={(e) => setOtherCharges(Number(e.target.value) || 0)} className="h-9" />
                  </div>
                </div>
              </div>
              <div>
                <BillingTotals
                  grossTotal={itemsSubtotal + itemDiscountTotal}
                  itemDiscount={itemDiscountTotal}
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

      <CustomerFormDialog
        open={customerFormOpen}
        onOpenChange={setCustomerFormOpen}
        editingCustomer={editingCustomer}
        initialData={customerFormSeed}
        onSuccess={(newId) => {
          queryClient.invalidateQueries({ queryKey: ["customers", companyId] }).then(async () => {
            const { data } = await supabase.from("customers").select("*").eq("id", newId).single();
            if (data) {
              setCustomerId(data.id);
              setCustomerName(data.name);
              setCustomerPhone(data.phone || "");
              setCustomerAddress(data.address || "");
              setCustomerGstin(data.gst_number || "");
            }
          });
        }}
      />
    </Dialog>
  );
}

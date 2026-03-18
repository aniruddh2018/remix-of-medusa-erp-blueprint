import { useState, useRef, useMemo, useCallback } from "react";
import { useDraftSave } from "@/hooks/useDraftSave";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useInvoiceSettings } from "@/hooks/useInvoiceSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, Package, PlusCircle, FileText, ArrowRight, Lock, Link2, Printer, FileSpreadsheet, Download, ChevronDown, Loader2, Pencil, RotateCcw, Banknote, AlertTriangle, Receipt } from "lucide-react";
import { RecordPaymentDialog } from "@/components/dialogs/RecordPaymentDialog";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { printBill, downloadBillHTML, downloadBillCSV, downloadBillPDF, type BillData } from "@/utils/billGenerator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { ProductFormDialog } from "@/components/forms/ProductFormDialog";
import { DrugBrandSearch } from "@/components/DrugBrandSearch";
import { QuickTextEntry } from "@/components/QuickTextEntry";
import { SupplierFormDialog } from "@/components/forms/SupplierFormDialog";
import { ReceiveInventoryDialog } from "@/components/dialogs/ReceiveInventoryDialog";
import { LinkedChallansDialog } from "@/components/dialogs/LinkedChallansDialog";
import { EditPurchaseOrderDialog } from "@/components/dialogs/EditPurchaseOrderDialog";
import { DebitNoteDialog } from "@/components/dialogs/DebitNoteDialog";
import { PurchaseItemsTable, type PurchaseItem } from "@/components/billing/PurchaseItemsTable";
import { BillingTotals } from "@/components/billing/BillingTotals";
import type { Tables } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";

type PurchaseOrder = Tables<"purchase_orders">;
type Supplier = Tables<"suppliers">;
type Product = Tables<"products">;
type OrderStatus = Database["public"]["Enums"]["order_status"];

export default function PurchaseOrders() {
  const { toast } = useToast();
  const { user, isAdmin, isPharmacist } = useAuth();
  const { companyId, config, gstInclusive } = useBusiness();
  const { settings, maxDiscountAllowed } = useInvoiceSettings();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState("billing");
  const [searchQuery, setSearchQuery] = useState("");
  const [orderItems, setOrderItems] = useState<PurchaseItem[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemFreeQty, setItemFreeQty] = useState<number>(0);
  const [itemPrice, setItemPrice] = useState<number>(0);
  const [itemMrp, setItemMrp] = useState<number>(0);
  const [itemDiscount, setItemDiscount] = useState<number>(0);
  const [itemDiscountFlat, setItemDiscountFlat] = useState<number>(0);
  const [itemBatchNumber, setItemBatchNumber] = useState<string>("");
  const [itemExpiryDate, setItemExpiryDate] = useState<string>("");
  const [draftRestored, setDraftRestored] = useState(false);

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

  // Bill-level discount
  const [billDiscountPercent, setBillDiscountPercent] = useState<number>(0);
  const [billDiscountFlat, setBillDiscountFlat] = useState<number>(0);

  // Receive inventory dialog
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [selectedOrderForReceive, setSelectedOrderForReceive] = useState<{ id: string; supplierId: string } | null>(null);

  // Linked challans dialog
  const [linkedChallansDialogOpen, setLinkedChallansDialogOpen] = useState(false);
  const [selectedInvoiceForChallans, setSelectedInvoiceForChallans] = useState<string | null>(null);

  // Bill loading state
  const [billLoadingId, setBillLoadingId] = useState<string | null>(null);

  // Edit order dialog state
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [editOrderDialogOpen, setEditOrderDialogOpen] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Debit note dialog
  const [debitNoteOpen, setDebitNoteOpen] = useState(false);
  // Payment dialog
  const [paymentDialog, setPaymentDialog] = useState<null | {
    referenceId: string; referenceNumber: string; partyName: string;
    totalAmount: number; paidAmount: number;
  }>(null);

  // ── Draft auto-save ─────────────────────────────────────────────────────
  const poDraft = useMemo(() => ({
    orderItems, selectedSupplier, expectedDeliveryDate, notes,
    freightCharges, handlingCharges, otherCharges,
    challanNumber, isChallan,
  }), [orderItems, selectedSupplier, expectedDeliveryDate, notes,
      freightCharges, handlingCharges, otherCharges, challanNumber, isChallan]);

  const { clearDraft: clearPODraft } = useDraftSave("draft_purchase_order", poDraft, (draft) => {
    if (draft.orderItems?.length > 0 || draft.selectedSupplier || draft.challanNumber) {
      setOrderItems(draft.orderItems || []);
      setSelectedSupplier(draft.selectedSupplier || "");
      setExpectedDeliveryDate(draft.expectedDeliveryDate || "");
      setNotes(draft.notes || "");
      setFreightCharges(draft.freightCharges || 0);
      setHandlingCharges(draft.handlingCharges || 0);
      setOtherCharges(draft.otherCharges || 0);
      setChallanNumber(draft.challanNumber || "");
      setIsChallan(draft.isChallan ?? true);
      setDraftRestored(true);
    }
  });

  // ── Focus helper ──
  const focusProductSearch = useCallback(() => {
    setTimeout(() => {
      const el = document.querySelector('[data-po-product-search] input') as HTMLInputElement;
      el?.focus();
    }, 50);
  }, []);

  // ── Queries ──
  const { data: purchaseOrders, isLoading } = useQuery({
    queryKey: ["purchase-orders", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, suppliers (name)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: poPayments } = useQuery({
    queryKey: ["payments-purchase", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("reference_id, amount")
        .eq("company_id", companyId!)
        .eq("reference_type", "purchase_order");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const paidByPoId = useMemo(() => {
    const map: Record<string, number> = {};
    poPayments?.forEach(p => { map[p.reference_id] = (map[p.reference_id] || 0) + Number(p.amount); });
    return map;
  }, [poPayments]);

  const { data: suppliers, refetch: refetchSuppliers } = useQuery({
    queryKey: ["suppliers-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").eq("is_active", true).eq("company_id", companyId!).order("name");
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!companyId,
  });

  const { data: products, refetch: refetchProducts } = useQuery({
    queryKey: ["products-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("is_active", true).eq("company_id", companyId!).order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!companyId,
  });

  // ── Calculation helpers ──
  const calculateItemTotal = useCallback((price: number, qty: number, gst: number, discount: number, discountFlat: number = 0) => {
    const basePrice = price * qty;
    const afterPctDiscount = basePrice * (1 - discount / 100);
    const discountedPrice = Math.max(0, afterPctDiscount - discountFlat);
    if (gstInclusive) return discountedPrice;
    return discountedPrice + discountedPrice * (gst / 100);
  }, [gstInclusive]);

  const handleProductSelect = useCallback((productId: string) => {
    setSelectedProduct(productId);
    const product = products?.find((p) => p.id === productId);
    if (product) {
      setItemPrice(Number(product.purchase_price));
      setItemMrp(Number(product.mrp));
    }
    setTimeout(() => (document.getElementById("po-price-input") as HTMLInputElement)?.focus(), 30);
  }, [products]);

  const handleAddItem = useCallback(() => {
    if (!selectedProduct || itemQuantity <= 0 || itemPrice <= 0) return;
    const product = products?.find((p) => p.id === selectedProduct);
    if (!product) return;

    const gstPercentage = Number(product.gst_percentage);
    const totalPrice = calculateItemTotal(itemPrice, itemQuantity, gstPercentage, itemDiscount, itemDiscountFlat);

    const defaultExpiry = new Date();
    defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 2);

    setOrderItems(prev => [...prev, {
      product_id: product.id,
      product_name: `${product.name}${product.strength ? ` ${product.strength}` : ""}`,
      hsn_code: product.hsn_code || "",
      batch_number: itemBatchNumber,
      quantity: itemQuantity,
      free_quantity: itemFreeQty,
      unit_price: itemPrice,
      mrp: itemMrp || Number(product.mrp),
      gst_percentage: gstPercentage,
      discount_percentage: itemDiscount,
      discount_flat: itemDiscountFlat,
      total_price: totalPrice,
      expiry_date: itemExpiryDate || defaultExpiry.toISOString().split("T")[0],
      fromChallan: false,
    }]);

    setSelectedProduct("");
    setItemQuantity(1);
    setItemFreeQty(0);
    setItemPrice(0);
    setItemMrp(0);
    setItemDiscount(0);
    setItemDiscountFlat(0);
    setItemBatchNumber("");
    setItemExpiryDate("");

    // Auto-focus back to product search (MARG-style)
    focusProductSearch();
  }, [selectedProduct, itemQuantity, itemFreeQty, itemPrice, itemMrp, itemDiscount, itemDiscountFlat, itemBatchNumber, itemExpiryDate, products, calculateItemTotal, focusProductSearch]);

  const updateOrderItem = useCallback((index: number, field: keyof PurchaseItem, value: string | number) => {
    const updated = [...orderItems];
    (updated[index] as any)[field] = value;
    const item = updated[index];
    item.total_price = calculateItemTotal(item.unit_price, item.quantity, item.gst_percentage, item.discount_percentage, item.discount_flat);
    setOrderItems(updated);
  }, [orderItems, calculateItemTotal]);

  const removeItem = useCallback((index: number) => {
    const item = orderItems[index];
    if (item.fromChallan) {
      toast({ title: "Cannot Remove", description: "Items from challans cannot be removed.", variant: "destructive" });
      return;
    }
    setOrderItems(prev => prev.filter((_, i) => i !== index));
  }, [orderItems, toast]);

  // ── Totals ──
  const grossTotal = orderItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const totalItemDiscount = orderItems.reduce((sum, item) => {
    const base = item.unit_price * item.quantity;
    return sum + (base * item.discount_percentage / 100) + item.discount_flat;
  }, 0);
  const itemsSubtotal = orderItems.reduce((sum, item) => {
    const base = item.unit_price * item.quantity;
    return sum + Math.max(0, base * (1 - item.discount_percentage / 100) - item.discount_flat);
  }, 0);
  const totalGst = gstInclusive
    ? orderItems.reduce((sum, item) => { const base = item.unit_price * item.quantity; const after = Math.max(0, base * (1 - item.discount_percentage / 100) - item.discount_flat); return sum + (after - after / (1 + item.gst_percentage / 100)); }, 0)
    : orderItems.reduce((sum, item) => { const base = item.unit_price * item.quantity; const after = Math.max(0, base * (1 - item.discount_percentage / 100) - item.discount_flat); return sum + (after * item.gst_percentage / 100); }, 0);
  const totalCharges = freightCharges + handlingCharges + otherCharges;
  const subtotalBeforeBillDiscount = gstInclusive ? itemsSubtotal + totalCharges : itemsSubtotal + totalGst + totalCharges;
  const billDiscountAmount = (subtotalBeforeBillDiscount * billDiscountPercent / 100) + billDiscountFlat;
  const totalDiscountAmount = totalItemDiscount + billDiscountAmount;
  const grandTotal = Math.max(0, subtotalBeforeBillDiscount - billDiscountAmount);

  // ── Reset ──
  const handleReset = useCallback(() => {
    clearPODraft();
    setOrderItems([]);
    setSelectedSupplier("");
    setExpectedDeliveryDate("");
    setNotes("");
    setSelectedProduct("");
    setItemQuantity(1);
    setItemFreeQty(0);
    setItemPrice(0);
    setItemMrp(0);
    setItemDiscount(0);
    setItemDiscountFlat(0);
    setItemBatchNumber("");
    setItemExpiryDate("");
    setFreightCharges(0);
    setHandlingCharges(0);
    setOtherCharges(0);
    setChallanNumber("");
    setIsChallan(true);
    setPendingChallans([]);
    setSelectedChallanIds([]);
    setShowChallanSelector(false);
    setBillDiscountPercent(0);
    setBillDiscountFlat(0);
    setDraftRestored(false);
    focusProductSearch();
  }, [clearPODraft, focusProductSearch]);

  // ── Create order mutation ──
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSupplier) throw new Error("Please select a supplier");
      if (orderItems.length === 0) throw new Error("Add at least one item");

      if (challanNumber) {
        const { data: existing } = await supabase
          .from("purchase_orders")
          .select("id")
          .eq("supplier_id", selectedSupplier)
          .or(isChallan ? `challan_number.eq.${challanNumber}` : `invoice_number.eq.${challanNumber}`)
          .limit(1);
        if (existing && existing.length > 0) throw new Error(`${isChallan ? "Challan" : "Invoice"} "${challanNumber}" already exists for this supplier.`);
      }

      const orderNumber = `PO-${Date.now()}`;
      const gstAmount = totalGst;
      const discountAmount = totalDiscountAmount;
      const totalAmount = grandTotal;

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
          company_id: companyId,
        })
        .select()
        .single();
      if (orderError) throw orderError;

      // Mark merged challans
      if (!isChallan && selectedChallanIds.length > 0) {
        await supabase.from("purchase_orders").update({ converted_from_challan_id: order.id, is_challan: false }).in("id", selectedChallanIds);
      }

      // Insert items
      const newItems = orderItems.filter(item => !item.fromChallan);
      if (newItems.length > 0) {
        const items = newItems.map((item) => ({
          purchase_order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          free_quantity: item.free_quantity || 0,
          unit_price: item.unit_price,
          gst_percentage: item.gst_percentage,
          discount_percentage: item.discount_percentage,
          total_price: item.total_price,
          company_id: companyId,
        }));
        const { error: itemsError } = await supabase.from("purchase_order_items").insert(items);
        if (itemsError) throw itemsError;
      }

      // Auto-receive: create inventory batches
      const allItemsToReceive = orderItems.filter(item => !item.fromChallan);
      if (allItemsToReceive.length > 0) {
        const today = new Date().toISOString().split("T")[0];
        const batches = allItemsToReceive.map((item) => ({
          product_id: item.product_id,
          batch_number: item.batch_number || `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          quantity: item.quantity + (item.free_quantity || 0),
          purchase_price: item.unit_price,
          mrp: item.mrp || item.unit_price * 1.2,
          expiry_date: item.expiry_date,
          manufacturing_date: null,
          received_date: today,
          supplier_id: selectedSupplier || null,
          company_id: companyId,
        }));
        const { error: batchError } = await supabase.from("inventory_batches").insert(batches);
        if (batchError) throw batchError;
        await supabase.from("purchase_orders").update({ status: "delivered" }).eq("id", order.id);
      }

      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
      toast({ title: "Order created", description: "Purchase order saved & inventory received." });
      handleReset();
    },
    onError: (error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  // ── Delete PO ──
  const deletePOMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { data: poItems, error: fetchErr } = await supabase.from("purchase_order_items").select("id, product_id, quantity").eq("purchase_order_id", orderId);
      if (fetchErr) throw fetchErr;
      for (const item of (poItems || [])) {
        const { data: batches } = await supabase.from("inventory_batches").select("id, quantity").eq("product_id", item.product_id).eq("company_id", companyId!).order("created_at", { ascending: false }).limit(5);
        let remaining = item.quantity;
        for (const batch of (batches || [])) {
          if (remaining <= 0) break;
          const newQty = Math.max(0, batch.quantity - remaining);
          remaining -= batch.quantity;
          await supabase.from("inventory_batches").update({ quantity: newQty }).eq("id", batch.id);
        }
      }
      await supabase.from("debit_notes").update({ original_order_id: null }).eq("original_order_id", orderId);
      for (const item of (poItems || [])) { await supabase.from("purchase_order_items").delete().eq("id", item.id); }
      await supabase.from("payments").delete().eq("reference_id", orderId).eq("reference_type", "purchase_order");
      const { data: deleted, error: orderErr } = await supabase.from("purchase_orders").delete().eq("id", orderId).select();
      if (orderErr) throw new Error(orderErr.message);
      if (!deleted || deleted.length === 0) throw new Error("PO could not be deleted.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["payments-purchase"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
      toast({ title: "Purchase order deleted" });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setDeleteConfirmText("");
    },
    onError: (error) => toast({ title: "Delete failed", description: error.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const { error } = await supabase.from("purchase_orders").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Status updated" });
    },
    onError: (error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const convertToInvoiceMutation = useMutation({
    mutationFn: async ({ challanId, invoiceNumber }: { challanId: string; invoiceNumber: string }) => {
      const { error } = await supabase.from("purchase_orders").update({ is_challan: false, invoice_number: invoiceNumber }).eq("id", challanId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Converted to Invoice" });
      setConvertDialogOpen(false);
      setSelectedChallanId(null);
      setNewInvoiceNumber("");
    },
    onError: (error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  // ── Helpers ──
  const handleReceiveInventory = (orderId: string, supplierId: string) => {
    setSelectedOrderForReceive({ id: orderId, supplierId });
    setReceiveDialogOpen(true);
  };

  const handleConvertToInvoice = (orderId: string) => {
    setSelectedChallanId(orderId);
    setNewInvoiceNumber(`INV-${Date.now()}`);
    setConvertDialogOpen(true);
  };

  const fetchPendingChallans = async (supplierId: string) => {
    const { data } = await supabase.from("purchase_orders").select("*").eq("supplier_id", supplierId).eq("is_challan", true).is("converted_from_challan_id", null).order("order_date", { ascending: false });
    setPendingChallans(data || []);
  };

  const importChallanItems = async () => {
    if (selectedChallanIds.length === 0) return;
    const { data: items, error } = await supabase.from("purchase_order_items").select("*, products (name, strength, hsn_code, gst_percentage, mrp)").in("purchase_order_id", selectedChallanIds);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    const newItems: PurchaseItem[] = (items || []).map((item: any) => ({
      product_id: item.product_id,
      product_name: `${item.products.name}${item.products.strength ? ` ${item.products.strength}` : ""}`,
      hsn_code: item.products.hsn_code || "",
      batch_number: "",
      quantity: item.quantity,
      free_quantity: 0,
      unit_price: Number(item.unit_price),
      mrp: Number(item.products.mrp) || 0,
      gst_percentage: Number(item.gst_percentage),
      discount_percentage: Number(item.discount_percentage),
      discount_flat: 0,
      total_price: Number(item.total_price),
      expiry_date: "",
      fromChallan: true,
    }));
    setOrderItems(prev => [...prev, ...newItems]);
    toast({ title: "Items Imported", description: `${newItems.length} items from ${selectedChallanIds.length} challan(s).` });
  };

  const handleBillAction = async (order: any, action: "print" | "pdf" | "html" | "csv") => {
    setBillLoadingId(order.id);
    try {
      const { data: items, error } = await supabase.from("purchase_order_items").select("*, products (name, strength, hsn_code, gst_percentage)").eq("purchase_order_id", order.id);
      if (error) throw error;
      const billItems = (items || []).map((item: any) => ({
        product_name: `${item.products?.name || ""}${item.products?.strength ? ` ${item.products.strength}` : ""}`,
        batch_number: "-", hsn_code: item.products?.hsn_code || "",
        quantity: item.quantity, unit_price: Number(item.unit_price),
        gst_percentage: Number(item.gst_percentage), discount_percentage: Number(item.discount_percentage),
        total_price: Number(item.total_price),
      }));
      const subtotal = billItems.reduce((sum: number, i: any) => sum + i.unit_price * i.quantity * (1 - i.discount_percentage / 100), 0);
      const billData: BillData = {
        type: "purchase", invoice_number: order.invoice_number || order.challan_number || order.order_number,
        date: order.order_date, supplier_name: order.suppliers?.name || "-", items: billItems, subtotal,
        gst_amount: Number(order.gst_amount), discount_amount: Number(order.discount_amount),
        freight_charges: Number(order.freight_charges), handling_charges: Number(order.handling_charges),
        other_charges: Number(order.other_charges), total_amount: Number(order.total_amount),
      };
      if (action === "print") printBill(billData);
      else if (action === "pdf") downloadBillPDF(billData);
      else if (action === "html") downloadBillHTML(billData);
      else downloadBillCSV(billData);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBillLoadingId(null);
    }
  };

  // ── Quick text handler ──
  const handleQuickTextItems = useCallback((items: any[]) => {
    const newItems = items.filter(i => i.product_id).map(item => {
      const product = products?.find(p => p.id === item.product_id);
      if (!product) return null;
      const price = item.rate || Number(product.purchase_price);
      const gst = Number(product.gst_percentage);
      const total = gstInclusive ? price * item.quantity : price * item.quantity * (1 + gst / 100);
      const defaultExpiry = new Date();
      defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 2);
      return {
        product_id: product.id,
        product_name: `${product.name}${product.strength ? ` ${product.strength}` : ""}`,
        hsn_code: product.hsn_code || "",
        batch_number: "",
        quantity: item.quantity,
        free_quantity: item.free_quantity || 0,
        unit_price: price,
        mrp: Number(product.mrp),
        gst_percentage: gst,
        discount_percentage: 0,
        discount_flat: 0,
        total_price: total,
        expiry_date: defaultExpiry.toISOString().split("T")[0],
        fromChallan: false,
      } as PurchaseItem;
    }).filter(Boolean) as PurchaseItem[];
    setOrderItems(prev => [...prev, ...newItems]);
    if (newItems.length > 0) toast({ title: "Items added", description: `${newItems.length} items from text entry.` });
    focusProductSearch();
  }, [products, gstInclusive, toast, focusProductSearch]);

  // ── Keyboard shortcuts ──
  useKeyboardShortcut({ key: "/", callback: () => { searchRef.current?.focus(); searchRef.current?.select(); }, enabled: activeTab === "history" });
  useKeyboardShortcut({
    key: "Enter", modifiers: ["ctrl"],
    callback: () => { if (orderItems.length > 0 && selectedSupplier && !createOrderMutation.isPending) createOrderMutation.mutate(); },
    enabled: activeTab === "billing", allowInInput: true,
  });
  useKeyboardShortcut({
    key: "n",
    callback: () => { handleReset(); setActiveTab("billing"); },
    enabled: activeTab === "history" && !editOrderDialogOpen && !receiveDialogOpen && !convertDialogOpen && !debitNoteOpen && !deleteDialogOpen,
  });

  const filteredOrders = purchaseOrders?.filter(order =>
    order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (order.suppliers as any)?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "default" as const;
      case "pending": return "secondary" as const;
      case "delivered": return "default" as const;
      case "cancelled": return "destructive" as const;
      default: return "outline" as const;
    }
  };

  const enterToAdd = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && selectedProduct && itemPrice > 0) { e.preventDefault(); handleAddItem(); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Purchase Orders</h1>
          <p className="text-muted-foreground text-sm">
            <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px]">Ctrl+Enter</kbd> save
            <span className="mx-1">·</span>
            <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px]">N</kbd> new
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setDebitNoteOpen(true)}>
            <RotateCcw className="h-3 w-3" /> Debit Note
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full max-w-xs">
          <TabsTrigger value="billing" className="flex-1 gap-1">
            <Package className="h-3.5 w-3.5" /> New Purchase
            {orderItems.length > 0 && <Badge variant="secondary" className="ml-1 h-5 text-[10px]">{orderItems.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 gap-1">
            <FileText className="h-3.5 w-3.5" /> History
          </TabsTrigger>
        </TabsList>

        {/* ═══ BILLING TAB ═══ */}
        <TabsContent value="billing" className="mt-4 space-y-4">
          {draftRestored && (
            <div className="flex items-center gap-3 rounded-md border bg-muted px-4 py-2 text-sm">
              <span>💾</span>
              <span className="flex-1 font-medium">Draft restored</span>
              <button onClick={handleReset} className="text-xs underline opacity-70 hover:opacity-100">Discard</button>
            </div>
          )}

          {/* Supplier & Invoice info — compact bar */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Supplier *</Label>
              <div className="flex gap-1">
                <Select value={selectedSupplier} onValueChange={(v) => { setSelectedSupplier(v); if (!isChallan) fetchPendingChallans(v); }}>
                  <SelectTrigger className="h-8 text-sm flex-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {suppliers?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setShowSupplierDialog(true)}><PlusCircle className="h-3 w-3" /></Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Doc Type</Label>
              <Select value={isChallan ? "challan" : "invoice"} onValueChange={(v) => { const c = v === "challan"; setIsChallan(c); if (!c && selectedSupplier) fetchPendingChallans(selectedSupplier); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="challan">Challan</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">{isChallan ? "Challan #" : "Invoice #"}</Label>
              <Input value={challanNumber} onChange={e => setChallanNumber(e.target.value)} className="h-8 text-sm" placeholder={isChallan ? "Challan no." : "Invoice no."} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Delivery Date</Label>
              <Input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          {/* Pending challans merge */}
          {!isChallan && selectedSupplier && pendingChallans.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <p className="text-xs font-medium flex items-center gap-1"><FileText className="h-3 w-3" /> Merge Pending Challans</p>
              <div className="flex flex-wrap gap-2">
                {pendingChallans.map(challan => (
                  <label key={challan.id} className="flex items-center gap-1.5 text-xs border rounded px-2 py-1 bg-background cursor-pointer">
                    <input type="checkbox" checked={selectedChallanIds.includes(challan.id)}
                      onChange={e => setSelectedChallanIds(prev => e.target.checked ? [...prev, challan.id] : prev.filter(id => id !== challan.id))}
                      className="h-3 w-3" />
                    {challan.challan_number || challan.order_number} • ₹{Number(challan.total_amount).toFixed(0)}
                  </label>
                ))}
              </div>
              {selectedChallanIds.length > 0 && (
                <Button size="sm" variant="secondary" onClick={importChallanItems} className="h-7 text-xs">
                  Import from {selectedChallanIds.length} challan(s)
                </Button>
              )}
            </div>
          )}

          {/* Product entry bar */}
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Add Products</span>
              <QuickTextEntry type="purchase" products={products} onItemsConfirmed={handleQuickTextItems} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-9 gap-2">
              <div className="md:col-span-2" data-po-product-search>
                <DrugBrandSearch products={products} selectedProductId={selectedProduct} onSelect={handleProductSelect}
                  showPrice priceType="purchase" placeholder="Search product..." />
              </div>
              {config.hasBatchTracking && (
                <div>
                  <Input value={itemBatchNumber} onChange={e => setItemBatchNumber(e.target.value)} onKeyDown={enterToAdd}
                    className="h-9" placeholder="Batch" />
                </div>
              )}
              <div>
                <Input type="date" value={itemExpiryDate} onChange={e => setItemExpiryDate(e.target.value)} onKeyDown={enterToAdd}
                  className="h-9 text-xs" />
              </div>
              <div>
                <Input type="number" min={0} step={0.01} value={itemMrp || ""} onChange={e => setItemMrp(parseFloat(e.target.value) || 0)}
                  onKeyDown={enterToAdd} className="h-9" placeholder="MRP" />
              </div>
              <div>
                <Input id="po-price-input" type="number" min={0} step={0.01} value={itemPrice || ""}
                  onChange={e => setItemPrice(parseFloat(e.target.value) || 0)}
                  onKeyDown={enterToAdd} className="h-9" placeholder="Rate" />
              </div>
              <div>
                <Input type="number" min={1} value={itemQuantity}
                  onChange={e => setItemQuantity(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                  onKeyDown={enterToAdd} className="h-9" placeholder="Qty" />
              </div>
              <div>
                <Input type="number" min={0} value={itemFreeQty || ""}
                  onChange={e => setItemFreeQty(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                  onKeyDown={enterToAdd} className="h-9" placeholder="Free" />
              </div>
              <div>
                <Button onClick={handleAddItem} className="h-9 w-full" disabled={!selectedProduct || itemPrice <= 0} size="sm">
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
            </div>
          </div>

          {/* Items table + totals */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            <PurchaseItemsTable
              items={orderItems}
              discountMode={settings.discount_mode}
              maxDiscountAllowed={maxDiscountAllowed}
              hasBatchTracking={config.hasBatchTracking}
              onUpdateItem={updateOrderItem}
              onRemoveItem={removeItem}
              onDiscountExceeded={(max) => toast({ title: "Limit exceeded", description: `Max discount: ${max}%`, variant: "destructive" })}
            />
            {orderItems.length > 0 && (
              <div className="space-y-3">
                <BillingTotals
                  grossTotal={grossTotal}
                  itemDiscount={totalItemDiscount}
                  subtotal={itemsSubtotal}
                  gstAmount={totalGst}
                  totalCharges={totalCharges}
                  billDiscountAmount={billDiscountAmount}
                  grandTotal={grandTotal}
                  gstInclusive={gstInclusive}
                  settings={settings}
                  maxDiscountAllowed={maxDiscountAllowed}
                  billDiscountPercent={billDiscountPercent}
                  billDiscountFlat={billDiscountFlat}
                  onBillDiscountPercentChange={setBillDiscountPercent}
                  onBillDiscountFlatChange={setBillDiscountFlat}
                />
                <div className="space-y-2">
                  <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes..." className="h-8 text-sm" />
                  <div className="grid grid-cols-3 gap-1">
                    <Input type="number" min={0} step={0.01} value={freightCharges || ""} onChange={e => setFreightCharges(parseFloat(e.target.value) || 0)} className="h-7 text-xs" placeholder="Freight ₹" />
                    <Input type="number" min={0} step={0.01} value={handlingCharges || ""} onChange={e => setHandlingCharges(parseFloat(e.target.value) || 0)} className="h-7 text-xs" placeholder="Handling ₹" />
                    <Input type="number" min={0} step={0.01} value={otherCharges || ""} onChange={e => setOtherCharges(parseFloat(e.target.value) || 0)} className="h-7 text-xs" placeholder="Other ₹" />
                  </div>
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={() => createOrderMutation.mutate()}
                  disabled={orderItems.length === 0 || !selectedSupplier || createOrderMutation.isPending}
                >
                  {createOrderMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Order (₹{grandTotal.toFixed(2)})
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══ HISTORY TAB ═══ */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input ref={searchRef} placeholder="Search orders... ( / )" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
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
                        <TableHead>Doc #</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders?.map(order => {
                        const paid = paidByPoId[order.id] || 0;
                        const balance = Number(order.total_amount) - paid;
                        const isPaid = balance <= 0.01;
                        const isPartial = paid > 0 && !isPaid;
                        const supplierName = (order.suppliers as any)?.name || "-";
                        return (
                          <TableRow key={order.id} tabIndex={0} data-kb-row
                            onKeyDown={e => {
                              const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-kb-row]"));
                              const pos = rows.indexOf(e.currentTarget);
                              if (e.key === "ArrowDown") { e.preventDefault(); rows[pos + 1]?.focus(); }
                              else if (e.key === "ArrowUp") { e.preventDefault(); rows[pos - 1]?.focus(); }
                              else if (e.key === "p" || e.key === "P") { e.preventDefault(); handleBillAction(order, "print"); }
                              else if (e.key === "r" || e.key === "R") {
                                if (order.status !== "delivered" && order.status !== "cancelled") {
                                  e.preventDefault(); handleReceiveInventory(order.id, order.supplier_id);
                                }
                              }
                              else if (e.key === "e" || e.key === "E") { e.preventDefault(); setEditOrderId(order.id); setEditOrderDialogOpen(true); }
                              else if (e.key === "$") { e.preventDefault(); setPaymentDialog({ referenceId: order.id, referenceNumber: order.invoice_number || order.order_number, partyName: supplierName, totalAmount: Number(order.total_amount), paidAmount: paid }); }
                            }}
                            className="cursor-pointer"
                          >
                            <TableCell className="font-medium">{order.order_number}</TableCell>
                            <TableCell><Badge variant={(order as any).is_challan ? "secondary" : "default"}>{(order as any).is_challan ? "Challan" : "Invoice"}</Badge></TableCell>
                            <TableCell>{(order as any).is_challan ? ((order as any).challan_number || "-") : ((order as any).invoice_number || "-")}</TableCell>
                            <TableCell>{supplierName}</TableCell>
                            <TableCell>{format(new Date(order.order_date), "dd/MM/yy")}</TableCell>
                            <TableCell><Badge variant={getStatusColor(order.status)}>{order.status}</Badge></TableCell>
                            <TableCell className="text-right font-mono">₹{Number(order.total_amount).toFixed(2)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm"
                                className={`h-6 text-xs gap-1 px-1.5 ${isPaid ? "text-green-600" : isPartial ? "text-amber-600" : "text-destructive"}`}
                                onClick={() => setPaymentDialog({ referenceId: order.id, referenceNumber: order.invoice_number || order.order_number, partyName: supplierName, totalAmount: Number(order.total_amount), paidAmount: paid })}
                              >
                                <Banknote className="h-3 w-3" />
                                {isPaid ? "Paid" : isPartial ? `₹${paid.toFixed(0)}` : "Unpaid"}
                              </Button>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="gap-1 h-7" disabled={billLoadingId === order.id}>
                                      {billLoadingId === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                                      <ChevronDown className="h-3 w-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-popover z-50">
                                    <DropdownMenuItem onClick={() => handleBillAction(order, "print")}><Printer className="h-4 w-4 mr-2" /> Print</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleBillAction(order, "pdf")}><Download className="h-4 w-4 mr-2" /> PDF</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleBillAction(order, "html")}><FileText className="h-4 w-4 mr-2" /> HTML</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleBillAction(order, "csv")}><FileSpreadsheet className="h-4 w-4 mr-2" /> CSV</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditOrderId(order.id); setEditOrderDialogOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                                {order.status !== "delivered" && order.status !== "cancelled" && (
                                  <>
                                    <Button variant="default" size="sm" className="h-7 gap-1 text-xs" onClick={() => handleReceiveInventory(order.id, order.supplier_id)}>
                                      <Package className="h-3 w-3" /> Receive
                                    </Button>
                                    {(order as any).is_challan && (
                                      <Button variant="outline" size="sm" className="h-7" onClick={() => handleConvertToInvoice(order.id)} title="Convert to Invoice">
                                        <ArrowRight className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </>
                                )}
                                {!(order as any).is_challan && (
                                  <Button variant="ghost" size="sm" className="h-7" onClick={() => { setSelectedInvoiceForChallans(order.id); setLinkedChallansDialogOpen(true); }}>
                                    <Link2 className="h-3 w-3" />
                                  </Button>
                                )}
                                {isAdmin && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { setDeleteTarget(order); setDeleteConfirmText(""); setDeleteDialogOpen(true); }}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={deleteDialogOpen} onOpenChange={open => { if (!open) { setDeleteDialogOpen(false); setDeleteTarget(null); setDeleteConfirmText(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> Delete Purchase Order</DialogTitle>
            <DialogDescription>This will restore inventory. Type "{deleteTarget?.order_number}" to confirm.</DialogDescription>
          </DialogHeader>
          <Input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="Type order number" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteConfirmText !== deleteTarget?.order_number || deletePOMutation.isPending}
              onClick={() => deleteTarget && deletePOMutation.mutate(deleteTarget.id)}>
              {deletePOMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert Challan to Invoice</DialogTitle>
            <DialogDescription>Enter the invoice number from the supplier's bill</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Invoice Number *</Label>
            <Input value={newInvoiceNumber} onChange={e => setNewInvoiceNumber(e.target.value)} placeholder="Supplier invoice number" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => selectedChallanId && convertToInvoiceMutation.mutate({ challanId: selectedChallanId, invoiceNumber: newInvoiceNumber })}
              disabled={!newInvoiceNumber || convertToInvoiceMutation.isPending}>
              Convert to Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductFormDialog open={showProductDialog} onOpenChange={setShowProductDialog} onSuccess={(id) => { refetchProducts(); if (id) setSelectedProduct(id); setShowProductDialog(false); }} />
      <SupplierFormDialog open={showSupplierDialog} onOpenChange={setShowSupplierDialog} onSuccess={(id) => { refetchSuppliers(); if (id) setSelectedSupplier(id); }} />
      <ReceiveInventoryDialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen} orderId={selectedOrderForReceive?.id || null} supplierId={selectedOrderForReceive?.supplierId || null}
        onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }); queryClient.invalidateQueries({ queryKey: ["inventory-batches"] }); }} />
      <LinkedChallansDialog open={linkedChallansDialogOpen} onOpenChange={setLinkedChallansDialogOpen} invoiceId={selectedInvoiceForChallans} />
      <EditPurchaseOrderDialog open={editOrderDialogOpen} onOpenChange={setEditOrderDialogOpen} orderId={editOrderId} />
      <DebitNoteDialog open={debitNoteOpen} onOpenChange={setDebitNoteOpen} />
      {paymentDialog && (
        <RecordPaymentDialog open={!!paymentDialog} onOpenChange={open => { if (!open) { queryClient.invalidateQueries({ queryKey: ["payments-purchase"] }); setPaymentDialog(null); } }}
          referenceType="purchase_order" referenceId={paymentDialog.referenceId} referenceNumber={paymentDialog.referenceNumber}
          partyName={paymentDialog.partyName} partyType="supplier" totalAmount={paymentDialog.totalAmount} paidAmount={paymentDialog.paidAmount} paymentType="made" />
      )}

      <AlertDialog open={false}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle /></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel /><AlertDialogAction /></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

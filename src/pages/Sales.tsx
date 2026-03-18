import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useDraftSave } from "@/hooks/useDraftSave";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useInvoiceSettings } from "@/hooks/useInvoiceSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, Receipt, CreditCard, Banknote, PlusCircle, AlertTriangle, Pencil, Printer, FileText, FileSpreadsheet, Download, ChevronDown, Loader2, RotateCcw, UserPlus, Check, ChevronsUpDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RecordPaymentDialog } from "@/components/dialogs/RecordPaymentDialog";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { format, differenceInDays } from "date-fns";
import { ProductFormDialog } from "@/components/forms/ProductFormDialog";
import { EditSaleDialog } from "@/components/dialogs/EditSaleDialog";
import { CreditNoteDialog } from "@/components/dialogs/CreditNoteDialog";
import { allocateBatchesFIFO, getTotalAvailableStock } from "@/utils/fifoAllocation";
import { DrugBrandSearch, type DrugBrandSearchHandle } from "@/components/DrugBrandSearch";
import { QuickTextEntry } from "@/components/QuickTextEntry";
import { printConfigurableInvoice, downloadConfigurableInvoiceHTML, downloadConfigurableInvoicePDF, type InvoiceTemplateData } from "@/utils/invoiceTemplate";
import { downloadBillCSV, type BillData } from "@/utils/billGenerator";
import { SalesItemsTable, type CartItem } from "@/components/billing/SalesItemsTable";
import { BillingTotals } from "@/components/billing/BillingTotals";
import type { Tables } from "@/integrations/supabase/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type SalesOrder = Tables<"sales_orders">;
type Product = Tables<"products">;
type InventoryBatch = Tables<"inventory_batches">;

export default function Sales() {
  const { toast } = useToast();
  const { user, isAdmin, isPharmacist } = useAuth();
  const { config, companyId, gstInclusive } = useBusiness();
  const { settings, maxDiscountAllowed } = useInvoiceSettings();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const productSearchRef = useRef<DrugBrandSearchHandle>(null);

  const focusProductSearch = useCallback(() => {
    setTimeout(() => productSearchRef.current?.focus(), 30);
  }, []);

  const [activeTab, setActiveTab] = useState("billing");
  const [searchQuery, setSearchQuery] = useState("");
  const [editSaleId, setEditSaleId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [customerName, setCustomerName] = useState(settings.default_customer_name || "");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [prescriptionNumber, setPrescriptionNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>(settings.default_payment_method || "cash");
  const [notes, setNotes] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemDiscount, setItemDiscount] = useState<number>(0);
  const [itemDiscountFlat, setItemDiscountFlat] = useState<number>(0);
  const [itemFreeQty, setItemFreeQty] = useState<number>(0);
  const [itemRate, setItemRate] = useState<number>(0);
  const [noGstBill, setNoGstBill] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [freightCharges, setFreightCharges] = useState<number>(0);
  const [handlingCharges, setHandlingCharges] = useState<number>(0);
  const [deliveryCharges, setDeliveryCharges] = useState<number>(0);
  const [otherCharges, setOtherCharges] = useState<number>(0);
  const [billDiscountPercent, setBillDiscountPercent] = useState<number>(0);
  const [billDiscountFlat, setBillDiscountFlat] = useState<number>(0);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [isAddingNewCustomer, setIsAddingNewCustomer] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({ name: "", phone: "", address: "", gst_number: "" });
  const [billLoadingId, setBillLoadingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SalesOrder | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [paymentDialog, setPaymentDialog] = useState<null | { referenceId: string; referenceNumber: string; partyName: string; totalAmount: number; paidAmount: number }>(null);

  // ── Queries ──
  const { data: customers } = useQuery({
    queryKey: ["customers-for-sale", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name, phone, email, address, gst_number").eq("company_id", companyId!).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const createCustomerMutation = useMutation({
    mutationFn: async (cust: typeof newCustomerData) => {
      const { data, error } = await supabase.from("customers").insert({ name: cust.name, phone: cust.phone || null, address: cust.address || null, gst_number: cust.gst_number || null, company_id: companyId }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["customers-for-sale"] });
      setSelectedCustomerId(data.id);
      setCustomerName(data.name);
      setCustomerPhone(data.phone || "");
      setCustomerAddress(data.address || "");
      setIsAddingNewCustomer(false);
      setNewCustomerData({ name: "", phone: "", address: "", gst_number: "" });
    },
  });

  const saleDraft = useMemo(() => ({ cart, invoiceNumber, customerName, customerPhone, customerAddress, prescriptionNumber, paymentMethod, notes, freightCharges, handlingCharges, deliveryCharges, otherCharges }), [cart, invoiceNumber, customerName, customerPhone, customerAddress, prescriptionNumber, paymentMethod, notes, freightCharges, handlingCharges, deliveryCharges, otherCharges]);

  const { clearDraft } = useDraftSave("draft_sale", saleDraft, (draft) => {
    if (draft.cart?.length > 0 || draft.customerName || draft.invoiceNumber) {
      setCart(draft.cart || []);
      setInvoiceNumber(draft.invoiceNumber || "");
      setCustomerName(draft.customerName || "");
      setCustomerPhone(draft.customerPhone || "");
      setCustomerAddress(draft.customerAddress || "");
      setPrescriptionNumber(draft.prescriptionNumber || "");
      setPaymentMethod(draft.paymentMethod || "cash");
      setNotes(draft.notes || "");
      setFreightCharges(draft.freightCharges || 0);
      setHandlingCharges(draft.handlingCharges || 0);
      setDeliveryCharges(draft.deliveryCharges || 0);
      setOtherCharges(draft.otherCharges || 0);
      setDraftRestored(true);
    }
  });

  const { data: salesOrders, isLoading } = useQuery({
    queryKey: ["sales-orders", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_orders").select("*").eq("company_id", companyId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as SalesOrder[];
    },
    enabled: !!companyId,
  });

  const { data: salesPayments } = useQuery({
    queryKey: ["payments-sales", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("reference_id, amount").eq("company_id", companyId!).eq("reference_type", "sales_order");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const paidBySalesId = useMemo(() => {
    const map: Record<string, number> = {};
    salesPayments?.forEach(p => { map[p.reference_id] = (map[p.reference_id] || 0) + Number(p.amount); });
    return map;
  }, [salesPayments]);

  const { data: products, refetch: refetchProducts } = useQuery({
    queryKey: ["products-for-sale", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("is_active", true).eq("company_id", companyId!).order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!companyId,
  });

  // Preload ALL batches for instant search (MARG-style speed)
  const { data: allBatches } = useQuery({
    queryKey: ["all-batches-for-sale", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_batches").select("*").eq("company_id", companyId!).gt("quantity", 0).gt("expiry_date", new Date().toISOString().split("T")[0]).order("expiry_date", { ascending: true });
      if (error) throw error;
      return data as InventoryBatch[];
    },
    enabled: !!companyId,
    staleTime: 30000,
  });

  const batchesForProduct = useMemo(() => {
    if (!allBatches || !selectedProduct) return [];
    return allBatches.filter(b => b.product_id === selectedProduct);
  }, [allBatches, selectedProduct]);

  const existingCartQuantities = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach(item => {
      if (item.product_id === selectedProduct) {
        map.set(item.batch_id, (map.get(item.batch_id) || 0) + item.quantity + (item.free_quantity || 0));
      }
    });
    return map;
  }, [cart, selectedProduct]);

  const availableStock = useMemo(() => {
    return getTotalAvailableStock(batchesForProduct, existingCartQuantities);
  }, [batchesForProduct, existingCartQuantities]);

  // ── Calculation helpers ──
  const calculateItemTotal = useCallback((price: number, qty: number, gst: number, discountPct: number, discountFlat: number = 0) => {
    const basePrice = price * qty;
    const afterPctDiscount = basePrice * (1 - discountPct / 100);
    const discountedPrice = Math.max(0, afterPctDiscount - discountFlat);
    if (gstInclusive) return discountedPrice;
    return discountedPrice + discountedPrice * (gst / 100);
  }, [gstInclusive]);

  const handleAddToCart = useCallback(() => {
    if (!selectedProduct || itemQuantity <= 0) return;
    const product = products?.find(p => p.id === selectedProduct);
    if (!product || batchesForProduct.length === 0) {
      toast({ title: "No stock", description: "No available batches.", variant: "destructive" });
      return;
    }

    const totalNeeded = itemQuantity + itemFreeQty;
    const allocationResult = allocateBatchesFIFO(batchesForProduct, totalNeeded, existingCartQuantities);
    if (!allocationResult.success) {
      toast({ title: "Insufficient stock", description: allocationResult.message, variant: "destructive" });
      return;
    }

    const gstPercentage = noGstBill ? 0 : Number(product.gst_percentage);
    const productName = `${product.name}${product.strength ? ` ${product.strength}` : ""}`;
    const hsnCode = product.hsn_code || "";
    const effectiveRate = itemRate > 0 ? itemRate : 0;

    let newCart = [...cart];
    for (const allocation of allocationResult.allocations) {
      const unitPrice = effectiveRate > 0 ? effectiveRate : allocation.mrp;
      const existingIndex = newCart.findIndex(i => i.batch_id === allocation.batch_id);
      if (existingIndex >= 0) {
        const newQty = newCart[existingIndex].quantity + allocation.quantity;
        newCart[existingIndex].quantity = newQty;
        newCart[existingIndex].total_price = calculateItemTotal(newCart[existingIndex].unit_price, newQty, gstPercentage, newCart[existingIndex].discount_percentage);
        newCart[existingIndex].max_quantity = allocation.available_quantity;
      } else {
        newCart.push({
          product_id: product.id,
          batch_id: allocation.batch_id,
          product_name: productName,
          batch_number: allocation.batch_number,
          hsn_code: hsnCode,
          quantity: allocation.quantity,
          free_quantity: itemFreeQty,
          unit_price: unitPrice,
          gst_percentage: gstPercentage,
          discount_percentage: itemDiscount,
          discount_flat: itemDiscountFlat,
          total_price: calculateItemTotal(unitPrice, allocation.quantity, gstPercentage, itemDiscount, itemDiscountFlat),
          max_quantity: allocation.available_quantity,
          expiry_date: allocation.expiry_date,
        });
      }
    }

    setCart(newCart);
    setSelectedProduct("");
    setItemQuantity(1);
    setItemFreeQty(0);
    setItemDiscount(0);
    setItemDiscountFlat(0);
    setItemRate(0);

    if (allocationResult.allocations.length > 1) {
      toast({ title: "FIFO Applied", description: `Split across ${allocationResult.allocations.length} batches` });
    }

    // Auto-focus back to product search (MARG-style)
    focusProductSearch();
  }, [selectedProduct, itemQuantity, itemFreeQty, itemRate, itemDiscount, itemDiscountFlat, products, batchesForProduct, existingCartQuantities, cart, noGstBill, calculateItemTotal, toast]);

  const updateCartItem = useCallback((index: number, field: keyof CartItem, value: string | number) => {
    const updated = [...cart];
    (updated[index] as any)[field] = value;
    const item = updated[index];
    item.total_price = calculateItemTotal(item.unit_price, item.quantity, item.gst_percentage, item.discount_percentage, item.discount_flat);
    setCart(updated);
  }, [cart, calculateItemTotal]);

  const removeFromCart = useCallback((index: number) => setCart(c => c.filter((_, i) => i !== index)), []);

  // ── Totals ──
  const itemsGrossTotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const totalItemDiscount = cart.reduce((s, i) => s + (i.unit_price * i.quantity * i.discount_percentage / 100) + i.discount_flat, 0);
  const itemsSubtotal = cart.reduce((s, i) => s + Math.max(0, i.unit_price * i.quantity * (1 - i.discount_percentage / 100) - i.discount_flat), 0);
  const totalGst = gstInclusive
    ? cart.reduce((s, i) => { const after = Math.max(0, i.unit_price * i.quantity * (1 - i.discount_percentage / 100) - i.discount_flat); return s + (after - after / (1 + i.gst_percentage / 100)); }, 0)
    : cart.reduce((s, i) => { const after = Math.max(0, i.unit_price * i.quantity * (1 - i.discount_percentage / 100) - i.discount_flat); return s + (after * i.gst_percentage / 100); }, 0);
  const totalCharges = freightCharges + handlingCharges + deliveryCharges + otherCharges;
  const subtotalBeforeBillDiscount = gstInclusive ? itemsSubtotal + totalCharges : itemsSubtotal + totalGst + totalCharges;
  const billDiscountAmount = (subtotalBeforeBillDiscount * billDiscountPercent / 100) + billDiscountFlat;
  const grandTotal = Math.max(0, subtotalBeforeBillDiscount - billDiscountAmount);
  const totalDiscountAmount = totalItemDiscount + billDiscountAmount;

  // ── Save mutation ──
  const createSaleMutation = useMutation({
    mutationFn: async () => {
      const finalInvoiceNumber = invoiceNumber.trim() || `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const invalidItems = cart.filter(i => !i.batch_id);
      if (invalidItems.length > 0) throw new Error(`${invalidItems.length} item(s) have no batch assigned.`);

      const { data: existing } = await supabase.from("sales_orders").select("id").eq("invoice_number", finalInvoiceNumber).eq("company_id", companyId).limit(1);
      if (existing && existing.length > 0) throw new Error(`Invoice "${finalInvoiceNumber}" already exists.`);

      const gstAmount = totalGst;
      const totalAmount = grandTotal;

      const { data: order, error: orderError } = await supabase.from("sales_orders").insert({
        invoice_number: finalInvoiceNumber, customer_name: customerName, customer_phone: customerPhone || null,
        customer_address: customerAddress || null, customer_id: selectedCustomerId || null,
        prescription_number: prescriptionNumber || null, payment_method: paymentMethod, notes: notes || null,
        total_amount: totalAmount, gst_amount: gstAmount, discount_amount: totalDiscountAmount,
        freight_charges: freightCharges, handling_charges: handlingCharges, delivery_charges: deliveryCharges,
        other_charges: otherCharges, created_by: user?.id, status: "confirmed", company_id: companyId,
      }).select().single();
      if (orderError) throw orderError;

      const orderItems = cart.map(i => ({
        sales_order_id: order.id, product_id: i.product_id, batch_id: i.batch_id,
        quantity: i.quantity, free_quantity: i.free_quantity || 0, unit_price: i.unit_price,
        gst_percentage: i.gst_percentage, discount_percentage: i.discount_percentage,
        total_price: i.total_price, company_id: companyId,
      }));
      const { error: itemsError } = await supabase.from("sales_order_items").insert(orderItems);
      if (itemsError) throw itemsError;

      const deductItems = cart.map(i => ({ batch_id: i.batch_id, quantity: i.quantity, free_quantity: i.free_quantity || 0 }));
      const { error: deductError } = await supabase.rpc("deduct_sale_inventory", { _items: deductItems });
      if (deductError) throw new Error(deductError.message);

      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["all-batches-for-sale"] });
      toast({ title: "Sale completed", description: "Invoice generated successfully." });
      handleReset();
    },
    onError: (error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteSaleMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { data: saleItems, error: fetchErr } = await supabase.from("sales_order_items").select("id, product_id, batch_id, quantity, free_quantity").eq("sales_order_id", orderId);
      if (fetchErr) throw fetchErr;
      const restoreItems = (saleItems || []).map(i => ({ batch_id: i.batch_id, quantity: i.quantity, free_quantity: i.free_quantity || 0 }));
      if (restoreItems.length > 0) {
        const { error } = await supabase.rpc("restore_sale_inventory", { _items: restoreItems });
        if (error) throw new Error(error.message);
      }
      await supabase.from("credit_notes").update({ original_invoice_id: null }).eq("original_invoice_id", orderId);
      for (const item of (saleItems || [])) { await supabase.from("sales_order_items").delete().eq("id", item.id); }
      await supabase.from("payments").delete().eq("reference_id", orderId).eq("reference_type", "sales_order");
      const { data: deleted, error: orderErr } = await supabase.from("sales_orders").delete().eq("id", orderId).select();
      if (orderErr) throw new Error(orderErr.message);
      if (!deleted || deleted.length === 0) throw new Error("Could not delete invoice.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["payments-sales"] });
      queryClient.invalidateQueries({ queryKey: ["all-batches-for-sale"] });
      toast({ title: "Invoice deleted" });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    },
    onError: (error) => toast({ title: "Delete failed", description: error.message, variant: "destructive" }),
  });

  const handleReset = useCallback(() => {
    clearDraft();
    setCart([]);
    setInvoiceNumber("");
    setCustomerName(settings.default_customer_name || "");
    setCustomerPhone("");
    setCustomerAddress("");
    setPrescriptionNumber("");
    setPaymentMethod(settings.default_payment_method || "cash");
    setNotes("");
    setSelectedProduct("");
    setItemQuantity(1);
    setItemDiscount(0);
    setItemDiscountFlat(0);
    setItemFreeQty(0);
    setItemRate(0);
    setNoGstBill(false);
    setBillDiscountPercent(0);
    setBillDiscountFlat(0);
    setFreightCharges(0);
    setHandlingCharges(0);
    setDeliveryCharges(0);
    setOtherCharges(0);
    setDraftRestored(false);
    setSelectedCustomerId(null);
    setNewCustomerData({ name: "", phone: "", address: "", gst_number: "" });
    setIsAddingNewCustomer(false);
    // Re-focus product search
    focusProductSearch();
  }, [clearDraft, settings]);

  // ── Bill action ──
  const handleBillAction = async (order: SalesOrder, action: "print" | "pdf" | "html" | "csv") => {
    setBillLoadingId(order.id);
    try {
      const { data: items, error } = await supabase.from("sales_order_items").select("*, products (name, strength, hsn_code, gst_percentage, unit), inventory_batches (batch_number, expiry_date)").eq("sales_order_id", order.id);
      if (error) throw error;

      const billItems = (items || []).map(item => {
        const product = item.products as any;
        const batch = item.inventory_batches as any;
        return {
          product_name: `${product?.name || ""}${product?.strength ? ` ${product.strength}` : ""}`,
          batch_number: batch?.batch_number || "-",
          hsn_code: product?.hsn_code || "",
          quantity: item.quantity,
          free_quantity: item.free_quantity || 0,
          unit: product?.unit || "pcs",
          unit_price: Number(item.unit_price),
          gst_percentage: Number(item.gst_percentage),
          discount_percentage: Number(item.discount_percentage),
          total_price: Number(item.total_price),
          expiry_date: batch?.expiry_date,
        };
      });

      const subtotal = billItems.reduce((s, i) => s + i.unit_price * i.quantity * (1 - i.discount_percentage / 100), 0);

      if (action === "csv") {
        const billData: BillData = {
          type: "sale", invoice_number: order.invoice_number, date: order.sale_date,
          customer_name: order.customer_name, items: billItems, subtotal,
          gst_amount: Number(order.gst_amount), discount_amount: Number(order.discount_amount),
          freight_charges: Number(order.freight_charges), handling_charges: Number(order.handling_charges),
          delivery_charges: Number(order.delivery_charges), other_charges: Number(order.other_charges),
          total_amount: Number(order.total_amount),
        };
        downloadBillCSV(billData);
      } else {
        const tplData: InvoiceTemplateData = {
          type: "sale", invoice_number: order.invoice_number, date: order.sale_date,
          customer_name: order.customer_name, customer_phone: order.customer_phone || undefined,
          customer_address: order.customer_address || undefined,
          items: billItems, subtotal,
          gst_amount: Number(order.gst_amount), discount_amount: Number(order.discount_amount),
          freight_charges: Number(order.freight_charges), handling_charges: Number(order.handling_charges),
          delivery_charges: Number(order.delivery_charges), other_charges: Number(order.other_charges),
          total_amount: Number(order.total_amount), payment_method: order.payment_method || "cash",
          notes: order.notes || undefined,
        };
        if (action === "print") printConfigurableInvoice(tplData, settings);
        else if (action === "pdf") downloadConfigurableInvoicePDF(tplData, settings);
        else downloadConfigurableInvoiceHTML(tplData, settings);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBillLoadingId(null);
    }
  };

  // ── Keyboard shortcuts ──
  const paymentMethods = ["cash", "card", "upi"];
  useKeyboardShortcut({ key: "/", callback: () => { searchRef.current?.focus(); searchRef.current?.select(); }, enabled: activeTab === "history" });
  useKeyboardShortcut({
    key: "Enter", modifiers: ["ctrl"],
    callback: () => { if (cart.length > 0 && customerName && !createSaleMutation.isPending) createSaleMutation.mutate(); },
    enabled: activeTab === "billing", allowInInput: true,
  });
  useKeyboardShortcut({
    key: "c", modifiers: ["alt"],
    callback: () => setPaymentMethod(prev => paymentMethods[(paymentMethods.indexOf(prev) + 1) % paymentMethods.length]),
    enabled: activeTab === "billing", allowInInput: true,
  });
  useKeyboardShortcut({
    key: "n",
    callback: () => { handleReset(); setActiveTab("billing"); },
    enabled: activeTab === "history" && !editDialogOpen && !creditNoteOpen && !deleteDialogOpen,
  });

  // Auto-focus product search on billing tab mount
  useEffect(() => {
    if (activeTab === "billing") focusProductSearch();
  }, [activeTab, focusProductSearch]);

  // Quick text entry handler
  const handleQuickTextItems = useCallback((items: any[]) => {
    if (!allBatches || !products) return;
    const batchRemainingMap = new Map<string, number>();
    allBatches.forEach(b => batchRemainingMap.set(b.id, b.quantity));
    cart.forEach(ci => {
      const cur = batchRemainingMap.get(ci.batch_id) ?? 0;
      batchRemainingMap.set(ci.batch_id, cur - ci.quantity - (ci.free_quantity || 0));
    });

    const newCartItems: CartItem[] = [];
    const skippedItems: string[] = [];
    for (const item of items) {
      if (!item.product_id) continue;
      const product = products.find(p => p.id === item.product_id);
      if (!product) continue;
      const productBatches = allBatches.filter(b => b.product_id === product.id).sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());
      const gst = noGstBill ? 0 : Number(product.gst_percentage);
      const rate = item.rate || (product.sale_price && Number(product.sale_price) > 0 ? Number(product.sale_price) : Number(product.mrp));
      const totalNeeded = item.quantity + (item.free_quantity || 0);
      let remaining = totalNeeded;
      let mainQtyLeft = item.quantity;
      let freeQtyLeft = item.free_quantity || 0;
      let allocated = false;
      const productName = `${product.name}${product.strength ? ` ${product.strength}` : ""}`;

      for (const batch of productBatches) {
        if (remaining <= 0) break;
        const available = batchRemainingMap.get(batch.id) ?? 0;
        if (available <= 0) continue;
        const take = Math.min(remaining, available);
        const takeMain = Math.min(mainQtyLeft, take);
        const takeFree = Math.min(freeQtyLeft, take - takeMain);
        const totalTake = takeMain + takeFree;
        newCartItems.push({
          product_id: product.id, batch_id: batch.id, product_name: productName,
          batch_number: batch.batch_number, hsn_code: product.hsn_code || "",
          quantity: takeMain, free_quantity: takeFree, unit_price: rate,
          gst_percentage: gst, discount_percentage: 0, discount_flat: 0,
          total_price: gstInclusive ? rate * takeMain : rate * takeMain * (1 + gst / 100),
          max_quantity: available, expiry_date: batch.expiry_date,
        });
        batchRemainingMap.set(batch.id, available - totalTake);
        mainQtyLeft -= takeMain;
        freeQtyLeft -= takeFree;
        remaining -= totalTake;
        allocated = true;
      }
      if (!allocated) skippedItems.push(productName);
    }
    if (skippedItems.length > 0) toast({ title: "No stock", description: `Skipped: ${skippedItems.join(", ")}`, variant: "destructive" });
    if (newCartItems.length > 0) {
      setCart(prev => [...prev, ...newCartItems]);
      toast({ title: "Items added", description: `${newCartItems.length} line(s) added.` });
    }
    focusProductSearch();
  }, [allBatches, products, cart, noGstBill, gstInclusive, toast]);

  const filteredOrders = salesOrders?.filter(o => o.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) || o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales & Billing</h1>
          <p className="text-muted-foreground text-sm">
            <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px]">Ctrl+Enter</kbd> save
            <span className="mx-1">·</span>
            <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px]">Alt+C</kbd> payment
            <span className="mx-1">·</span>
            <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px]">N</kbd> new
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setCreditNoteOpen(true)}>
            <RotateCcw className="h-3 w-3" /> Credit Note
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full max-w-xs">
          <TabsTrigger value="billing" className="flex-1 gap-1">
            <Receipt className="h-3.5 w-3.5" /> New Sale
            {cart.length > 0 && <Badge variant="secondary" className="ml-1 h-5 text-[10px]">{cart.length}</Badge>}
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

          {/* Customer & Invoice info — compact bar */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Invoice #</Label>
              <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Auto" className="h-8 text-sm" />
            </div>
            {(config.type === "b2b_electronics" || config.type === "pharmacy_b2b") ? (
              <div className="md:col-span-2 space-y-1">
                <Label className="text-[11px]">Customer *</Label>
                {isAddingNewCustomer ? (
                  <div className="flex gap-1">
                    <Input placeholder="Name *" value={newCustomerData.name} onChange={e => setNewCustomerData(d => ({ ...d, name: e.target.value }))} className="h-8 text-sm" />
                    <Input placeholder="GSTIN" value={newCustomerData.gst_number} onChange={e => setNewCustomerData(d => ({ ...d, gst_number: e.target.value }))} className="h-8 text-sm w-32" />
                    <Button size="sm" className="h-8" onClick={() => { if (newCustomerData.name) createCustomerMutation.mutate(newCustomerData); }}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setIsAddingNewCustomer(false)}>✕</Button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="flex-1 justify-between h-8 text-sm font-normal">
                          {selectedCustomerId ? customers?.find(c => c.id === selectedCustomerId)?.name || customerName : "Select..."}
                          <ChevronsUpDown className="ml-1 h-3 w-3 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search..." value={customerSearchQuery} onValueChange={setCustomerSearchQuery} />
                          <CommandList>
                            <CommandEmpty>Not found.</CommandEmpty>
                            <CommandGroup>
                              {customers?.filter(c => c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) || (c.phone && c.phone.includes(customerSearchQuery))).map(c => (
                                <CommandItem key={c.id} value={c.name} onSelect={() => { setSelectedCustomerId(c.id); setCustomerName(c.name); setCustomerPhone(c.phone || ""); setCustomerAddress(c.address || ""); setCustomerPopoverOpen(false); }}>
                                  <Check className={`mr-2 h-3 w-3 ${selectedCustomerId === c.id ? "opacity-100" : "opacity-0"}`} />
                                  <div><div className="text-sm">{c.name}</div><div className="text-[10px] text-muted-foreground">{c.phone || ""}{c.gst_number ? ` • ${c.gst_number}` : ""}</div></div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setIsAddingNewCustomer(true)}><UserPlus className="h-3 w-3" /></Button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label className="text-[11px]">Customer *</Label>
                  <Input value={customerName} onChange={e => setCustomerName(e.target.value)} className="h-8 text-sm" placeholder="Name" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Phone</Label>
                  <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="h-8 text-sm" />
                </div>
              </>
            )}
            {config.hasPrescription && (
              <div className="space-y-1">
                <Label className="text-[11px]">Rx #</Label>
                <Input value={prescriptionNumber} onChange={e => setPrescriptionNumber(e.target.value)} className="h-8 text-sm" />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-[11px]">Payment</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash"><span className="flex items-center gap-1"><Banknote className="h-3 w-3" /> Cash</span></SelectItem>
                  <SelectItem value="card"><span className="flex items-center gap-1"><CreditCard className="h-3 w-3" /> Card</span></SelectItem>
                  <SelectItem value="upi"><span className="flex items-center gap-1"><Receipt className="h-3 w-3" /> UPI</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-1.5">
                <Switch id="no-gst" checked={noGstBill} onCheckedChange={(v) => {
                  setNoGstBill(v);
                  if (cart.length > 0) {
                    setCart(prev => prev.map(item => {
                      const newGst = v ? 0 : (products?.find(p => p.id === item.product_id)?.gst_percentage || item.gst_percentage);
                      const gstPct = Number(newGst);
                      const after = Math.max(0, item.unit_price * item.quantity * (1 - item.discount_percentage / 100) - item.discount_flat);
                      return { ...item, gst_percentage: gstPct, total_price: gstInclusive ? after : after + after * gstPct / 100 };
                    }));
                  }
                }} className="h-4 w-7" />
                <Label htmlFor="no-gst" className="text-[11px] cursor-pointer whitespace-nowrap">No GST</Label>
              </div>
            </div>
          </div>

          {/* Product entry bar — MARG-style inline */}
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Products</span>
              <QuickTextEntry type="sale" products={products} onItemsConfirmed={handleQuickTextItems} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2">
              <div className="col-span-2 sm:col-span-3 md:col-span-2 lg:col-span-2">
                <Label className="text-[10px] text-muted-foreground mb-0.5 block">Product</Label>
                <DrugBrandSearch
                  ref={productSearchRef}
                  products={products}
                  selectedProductId={selectedProduct}
                  onSelect={(v) => {
                    setSelectedProduct(v);
                    const p = products?.find(pp => pp.id === v);
                    if (p) setItemRate(p.sale_price && Number(p.sale_price) > 0 ? Number(p.sale_price) : Number(p.mrp));
                    // After product selected, move to Qty for speed
                    setTimeout(() => (document.getElementById("sale-qty") as HTMLInputElement)?.focus(), 30);
                  }}
                  showPrice priceType="sale"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground mb-0.5 block">Qty</Label>
                <Input type="number" id="sale-qty" min={1} value={itemQuantity}
                  onChange={e => setItemQuantity(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddToCart(); } }}
                  className="h-9" placeholder="1"
                />
              </div>
              {settings.show_free_qty_column && (
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block">Free</Label>
                  <Input type="number" min={0} value={itemFreeQty || ""}
                    onChange={e => setItemFreeQty(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddToCart(); } }}
                    className="h-9" placeholder="0"
                  />
                </div>
              )}
              <div>
                <Label className="text-[10px] text-muted-foreground mb-0.5 block">Rate ₹</Label>
                <Input type="number" min={0} step={0.01} value={itemRate || ""}
                  onChange={e => setItemRate(parseFloat(e.target.value) || 0)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddToCart(); } }}
                  className="h-9" placeholder="0.00"
                />
              </div>
              {(settings.discount_mode === "percentage" || settings.discount_mode === "both") && (
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block">Disc%</Label>
                  <Input type="number" min={0} max={maxDiscountAllowed} step={0.1} value={itemDiscount || ""}
                    onChange={e => setItemDiscount(Math.min(parseFloat(e.target.value) || 0, maxDiscountAllowed))}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddToCart(); } }}
                    className="h-9" placeholder="0"
                  />
                </div>
              )}
              <div className="flex flex-col justify-end">
                <Label className="text-[10px] text-muted-foreground mb-0.5 block invisible">Action</Label>
                <div className="flex gap-1">
                  {selectedProduct && (
                    <Badge variant={availableStock > 0 ? "outline" : "destructive"} className="self-center text-[10px] whitespace-nowrap px-1.5">
                      {availableStock > 0 ? `${availableStock}` : "0"}
                    </Badge>
                  )}
                  <Button onClick={handleAddToCart} className="h-9 flex-1" disabled={!selectedProduct || availableStock === 0 || itemQuantity <= 0} size="sm">
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Items table — full width for product visibility */}
          <SalesItemsTable
            cart={cart}
            settings={settings}
            maxDiscountAllowed={maxDiscountAllowed}
            gstInclusive={gstInclusive}
            onUpdateItem={updateCartItem}
            onRemoveItem={removeFromCart}
          />

          {/* Totals below table */}
          {cart.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4">
              <div className="space-y-2">
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes..." className="h-8 text-sm" />
                <div className="grid grid-cols-2 gap-1">
                  <Input type="number" min={0} step={0.01} value={freightCharges || ""} onChange={e => setFreightCharges(parseFloat(e.target.value) || 0)} className="h-7 text-xs" placeholder="Freight ₹" />
                  <Input type="number" min={0} step={0.01} value={otherCharges || ""} onChange={e => setOtherCharges(parseFloat(e.target.value) || 0)} className="h-7 text-xs" placeholder="Other ₹" />
                </div>
              </div>
              <div className="space-y-3">
                <BillingTotals
                  grossTotal={itemsGrossTotal}
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
                <Button
                  className="w-full gap-2"
                  onClick={() => createSaleMutation.mutate()}
                  disabled={cart.length === 0 || !customerName || createSaleMutation.isPending}
                >
                  {createSaleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Complete Sale (₹{grandTotal.toFixed(2)})
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══ HISTORY TAB ═══ */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input ref={searchRef} placeholder="Search invoices... ( / )" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
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
                        <TableHead>Invoice</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders?.map(order => {
                        const paid = paidBySalesId[order.id] || 0;
                        const balance = Number(order.total_amount) - paid;
                        const isPaid = balance <= 0.01;
                        const isPartial = paid > 0 && !isPaid;
                        return (
                          <TableRow key={order.id} tabIndex={0} data-kb-row
                            onKeyDown={e => {
                              const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-kb-row]"));
                              const pos = rows.indexOf(e.currentTarget);
                              if (e.key === "ArrowDown") { e.preventDefault(); rows[pos + 1]?.focus(); }
                              else if (e.key === "ArrowUp") { e.preventDefault(); rows[pos - 1]?.focus(); }
                              else if (e.key === "p" || e.key === "P") { e.preventDefault(); handleBillAction(order, "print"); }
                              else if ((e.key === "e" || e.key === "E") && (isAdmin || isPharmacist)) { e.preventDefault(); setEditSaleId(order.id); setEditDialogOpen(true); }
                              else if ((e.key === "d" || e.key === "D") && isAdmin) { e.preventDefault(); setDeleteTarget(order); setDeleteConfirmText(""); setDeleteDialogOpen(true); }
                              else if (e.key === "$") { e.preventDefault(); setPaymentDialog({ referenceId: order.id, referenceNumber: order.invoice_number, partyName: order.customer_name, totalAmount: Number(order.total_amount), paidAmount: paid }); }
                            }}
                            className="cursor-pointer"
                          >
                            <TableCell className="font-medium">{order.invoice_number}</TableCell>
                            <TableCell>
                              <div>{order.customer_name}</div>
                              {order.customer_phone && <div className="text-xs text-muted-foreground">{order.customer_phone}</div>}
                            </TableCell>
                            <TableCell>{format(new Date(order.sale_date), "dd/MM/yy")}</TableCell>
                            <TableCell className="capitalize text-xs">{order.payment_method}</TableCell>
                            <TableCell><Badge variant={order.status === "confirmed" ? "default" : order.status === "cancelled" ? "destructive" : "secondary"}>{order.status}</Badge></TableCell>
                            <TableCell className="text-right font-mono">₹{Number(order.total_amount).toFixed(2)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm"
                                className={`h-6 text-xs gap-1 px-1.5 ${isPaid ? "text-green-600" : isPartial ? "text-amber-600" : "text-destructive"}`}
                                onClick={() => setPaymentDialog({ referenceId: order.id, referenceNumber: order.invoice_number, partyName: order.customer_name, totalAmount: Number(order.total_amount), paidAmount: paid })}
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
                                {(isAdmin || isPharmacist) && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditSaleId(order.id); setEditDialogOpen(true); }}><Pencil className="h-3 w-3" /></Button>}
                                {isAdmin && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { setDeleteTarget(order); setDeleteConfirmText(""); setDeleteDialogOpen(true); }}><Trash2 className="h-3 w-3" /></Button>}
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
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> Delete Invoice</DialogTitle>
            <DialogDescription>This will restore inventory. Type "{deleteTarget?.invoice_number}" to confirm.</DialogDescription>
          </DialogHeader>
          <Input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="Type invoice number" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteConfirmText !== deleteTarget?.invoice_number || deleteSaleMutation.isPending}
              onClick={() => deleteTarget && deleteSaleMutation.mutate(deleteTarget.id)}>
              {deleteSaleMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {editDialogOpen && editSaleId && <EditSaleDialog open={editDialogOpen} onOpenChange={(open) => { if (!open) { queryClient.invalidateQueries({ queryKey: ["sales-orders"] }); queryClient.invalidateQueries({ queryKey: ["all-batches-for-sale"] }); } setEditDialogOpen(open); }} saleId={editSaleId} />}
      {creditNoteOpen && <CreditNoteDialog open={creditNoteOpen} onOpenChange={setCreditNoteOpen} />}
      {paymentDialog && <RecordPaymentDialog open={!!paymentDialog} onOpenChange={open => { if (!open) { queryClient.invalidateQueries({ queryKey: ["payments-sales"] }); setPaymentDialog(null); } }} referenceId={paymentDialog.referenceId} referenceType="sales_order" referenceNumber={paymentDialog.referenceNumber} partyName={paymentDialog.partyName} partyType="customer" totalAmount={paymentDialog.totalAmount} paidAmount={paymentDialog.paidAmount} paymentType="received" />}
      {showProductDialog && <ProductFormDialog open={showProductDialog} onOpenChange={setShowProductDialog} onSuccess={(id) => { refetchProducts(); if (id) setSelectedProduct(id); setShowProductDialog(false); }} />}
    </div>
  );
}

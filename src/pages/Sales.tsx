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
import { PostSalePaymentDialog } from "@/components/dialogs/PostSalePaymentDialog";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { format, differenceInDays } from "date-fns";
import { ProductFormDialog } from "@/components/forms/ProductFormDialog";
import { EditSaleDialog } from "@/components/dialogs/EditSaleDialog";
import { CreditNoteDialog } from "@/components/dialogs/CreditNoteDialog";
import { allocateBatchesFIFO, getTotalAvailableStock } from "@/utils/fifoAllocation";
import { DrugBrandSearch, type DrugBrandSearchHandle } from "@/components/DrugBrandSearch";
import { useEnterNavigation, advanceToNextField } from "@/hooks/useEnterNavigation";
import { useModuleFocus } from "@/contexts/FocusContext";
import { CustomerFormDialog } from "@/components/forms/CustomerFormDialog";
import { QuickTextEntry } from "@/components/QuickTextEntry";
import { printConfigurableInvoice, downloadConfigurableInvoiceHTML, downloadConfigurableInvoicePDF, type InvoiceTemplateData } from "@/utils/invoiceTemplate";
import { downloadBillCSV, type BillData } from "@/utils/billGenerator";
import { SalesItemsTable, type CartItem } from "@/components/billing/SalesItemsTable";
import { BillingTotals } from "@/components/billing/BillingTotals";
import { BatchSelector } from "@/components/billing/BatchSelector";
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
  const invoiceNumberRef = useRef<HTMLInputElement>(null);
  const customerButtonRef = useRef<HTMLButtonElement>(null);

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
  const [customerGstin, setCustomerGstin] = useState("");
  const [prescriptionNumber, setPrescriptionNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>(settings.default_payment_method || "cash");
  const [notes, setNotes] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
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
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  
  const [billLoadingId, setBillLoadingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SalesOrder | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [paymentDialog, setPaymentDialog] = useState<null | { referenceId: string; referenceNumber: string; partyName: string; totalAmount: number; paidAmount: number }>(null);
  const [postSaleDialog, setPostSaleDialog] = useState<null | { id: string; invoice_number: string; customer_name: string; total_amount: number }>(null);

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


  const saleDraft = useMemo(() => ({ cart, invoiceNumber, customerName, customerPhone, customerAddress, customerGstin, prescriptionNumber, paymentMethod, notes, freightCharges, handlingCharges, deliveryCharges, otherCharges }), [cart, invoiceNumber, customerName, customerPhone, customerAddress, customerGstin, prescriptionNumber, paymentMethod, notes, freightCharges, handlingCharges, deliveryCharges, otherCharges]);

  const { clearDraft } = useDraftSave("draft_sale", saleDraft, (draft) => {
    if (draft.cart?.length > 0 || draft.customerName || draft.invoiceNumber) {
      setCart(draft.cart || []);
      setInvoiceNumber(draft.invoiceNumber || "");
      setCustomerName(draft.customerName || "");
      setCustomerPhone(draft.customerPhone || "");
      setCustomerAddress(draft.customerAddress || "");
      setCustomerGstin(draft.customerGstin || "");
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

  // Focus first empty actionable field when billing tab is active or draft restored
  const focusFirstEmptyField = useCallback(() => {
    setTimeout(() => {
      const hasCustomer = !!selectedCustomerId || !!customerName.trim();
      if (!hasCustomer) {
        customerButtonRef.current?.focus();
      } else {
        productSearchRef.current?.focus();
      }
    }, 80);
  }, [selectedCustomerId, customerName]);

  useEffect(() => {
    if (activeTab !== "billing") return;
    focusFirstEmptyField();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, draftRestored]);

  // Register Sales module with global focus tracker (intelligent recovery via `)
  useModuleFocus({
    module: "sales",
    getEntryPoint: () => customerButtonRef.current,
    getFallback: () => (productSearchRef.current as unknown as HTMLElement) || null,
    flowStartedWhen: !!selectedCustomerId || cart.length > 0,
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
      const { data, error } = await supabase.from("inventory_batches").select("*").eq("company_id", companyId!).gt("quantity", 0).or(`expiry_date.gt.${new Date().toISOString().split("T")[0]},expiry_date.is.null`).order("expiry_date", { ascending: true, nullsFirst: false });
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
    // Guard 1: must have a product selected
    if (!selectedProduct) {
      toast({ title: "Select a product", description: "Pick a product before adding it to the bill.", variant: "destructive" });
      productSearchRef.current?.focus();
      return;
    }
    const product = products?.find(p => p.id === selectedProduct);
    if (!product) {
      toast({ title: "Invalid product", description: "Please re-select the product.", variant: "destructive" });
      productSearchRef.current?.focus();
      return;
    }

    // Guard 2: quantity must be > 0 — refocus Product per spec
    if (itemQuantity <= 0) {
      toast({ title: "Quantity required", description: "Enter a quantity greater than 0.", variant: "destructive" });
      productSearchRef.current?.focus();
      return;
    }

    // Block when no stock and negative stock is not allowed
    if (batchesForProduct.length === 0 || availableStock <= 0) {
      if (!settings.allow_negative_stock) {
        toast({ title: "Out of stock", description: "This product has 0 available stock. Choose another or enable negative stock in Settings.", variant: "destructive" });
        productSearchRef.current?.focus();
        return;
      }
    }

    const totalNeeded = itemQuantity + itemFreeQty;

    // Guard 3: requested qty exceeds available — refocus Quantity field per spec
    if (totalNeeded > availableStock && !settings.allow_negative_stock) {
      toast({ title: "Quantity exceeds stock", description: `Only ${availableStock} units available.`, variant: "destructive" });
      const qtyEl = document.getElementById("sale-qty") as HTMLInputElement | null;
      qtyEl?.focus();
      qtyEl?.select();
      return;
    }

    // Manual batch override: build a single-batch allocation if user picked one
    let allocationResult;
    if (selectedBatchId) {
      const chosen = batchesForProduct.find(b => b.id === selectedBatchId);
      if (!chosen) {
        toast({ title: "Batch unavailable", description: "Selected batch is no longer available.", variant: "destructive" });
        setSelectedBatchId(null);
        return;
      }
      const cartQty = existingCartQuantities.get(chosen.id) || 0;
      const availInBatch = Math.max(0, chosen.quantity - cartQty);
      if (totalNeeded > availInBatch && !settings.allow_negative_stock) {
        toast({ title: "Batch quantity exceeded", description: `Only ${availInBatch} in batch ${chosen.batch_number}.`, variant: "destructive" });
        const qtyEl = document.getElementById("sale-qty") as HTMLInputElement | null;
        qtyEl?.focus(); qtyEl?.select();
        return;
      }
      allocationResult = {
        success: true,
        allocations: [{
          batch_id: chosen.id,
          batch_number: chosen.batch_number,
          quantity: totalNeeded,
          available_quantity: chosen.quantity,
          expiry_date: chosen.expiry_date,
          mrp: Number(chosen.mrp),
          purchase_price: Number(chosen.purchase_price),
        }],
        totalAllocated: totalNeeded,
        shortfall: 0,
      };
    } else {
      allocationResult = allocateBatchesFIFO(batchesForProduct, totalNeeded, existingCartQuantities);
      if (!allocationResult.success && !settings.allow_negative_stock) {
        toast({ title: "Insufficient stock", description: allocationResult.message, variant: "destructive" });
        const qtyEl = document.getElementById("sale-qty") as HTMLInputElement | null;
        qtyEl?.focus();
        qtyEl?.select();
        return;
      }
    }

    const gstPercentage = noGstBill ? 0 : Number(product.gst_percentage);
    const productName = `${product.name}${product.strength ? ` ${product.strength}` : ""}`;
    const hsnCode = product.hsn_code || "";
    const effectiveRate = itemRate > 0 ? itemRate : 0;

    // Distribute paid vs free quantities across batch allocations.
    // allocation.quantity = (paid + free) chunk for this batch; we split it back.
    let mainQtyLeft = itemQuantity;
    let freeQtyLeft = itemFreeQty;
    let newCart = [...cart];
    for (const allocation of allocationResult.allocations) {
      const takeMain = Math.min(mainQtyLeft, allocation.quantity);
      const takeFree = Math.min(freeQtyLeft, allocation.quantity - takeMain);
      mainQtyLeft -= takeMain;
      freeQtyLeft -= takeFree;

      const unitPrice = effectiveRate > 0 ? effectiveRate : allocation.mrp;
      const existingIndex = newCart.findIndex(i => i.batch_id === allocation.batch_id);
      if (existingIndex >= 0) {
        const row = newCart[existingIndex];
        row.quantity += takeMain;
        row.free_quantity = (row.free_quantity || 0) + takeFree;
        row.total_price = calculateItemTotal(row.unit_price, row.quantity, gstPercentage, row.discount_percentage, row.discount_flat);
        row.max_quantity = allocation.available_quantity;
      } else {
        newCart.push({
          product_id: product.id,
          batch_id: allocation.batch_id,
          product_name: productName,
          batch_number: allocation.batch_number,
          hsn_code: hsnCode,
          quantity: takeMain,
          free_quantity: takeFree,
          unit_price: unitPrice,
          gst_percentage: gstPercentage,
          discount_percentage: itemDiscount,
          discount_flat: itemDiscountFlat,
          total_price: calculateItemTotal(unitPrice, takeMain, gstPercentage, itemDiscount, itemDiscountFlat),
          max_quantity: allocation.available_quantity,
          expiry_date: allocation.expiry_date,
        });
      }
    }

    setCart(newCart);
    setSelectedProduct("");
    setSelectedBatchId(null);
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
  }, [selectedProduct, selectedBatchId, itemQuantity, itemFreeQty, itemRate, itemDiscount, itemDiscountFlat, products, batchesForProduct, availableStock, existingCartQuantities, cart, noGstBill, settings.allow_negative_stock, calculateItemTotal, toast, focusProductSearch]);

  const saleEnterNav = useEnterNavigation(handleAddToCart);

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
      let finalInvoiceNumber = invoiceNumber.trim();
      if (!finalInvoiceNumber) {
        const rawPrefix = (settings.invoice_prefix || "INV").replace(/[-\s]+$/g, "") || "INV";
        const { data: seqNum, error: seqErr } = await supabase.rpc("get_next_invoice_number", { _company_id: companyId!, _prefix: rawPrefix });
        if (seqErr) throw seqErr;
        finalInvoiceNumber = seqNum as string;
      }
      const invalidItems = cart.filter(i => !i.batch_id);
      if (invalidItems.length > 0) throw new Error(`${invalidItems.length} item(s) have no batch assigned.`);

      const { data: existing } = await supabase.from("sales_orders").select("id").eq("invoice_number", finalInvoiceNumber).eq("company_id", companyId).limit(1);
      if (existing && existing.length > 0) throw new Error(`Invoice "${finalInvoiceNumber}" already exists.`);

      const gstAmount = totalGst;
      const totalAmount = grandTotal;

      const { data: order, error: orderError } = await supabase.from("sales_orders").insert({
        invoice_number: finalInvoiceNumber, customer_name: customerName, customer_phone: customerPhone || null,
        customer_address: customerAddress || null, customer_id: selectedCustomerId || null, customer_gstin: customerGstin || null,
        prescription_number: prescriptionNumber || null, payment_method: paymentMethod, notes: notes || null,
        total_amount: totalAmount, gst_amount: gstAmount, discount_amount: totalDiscountAmount,
        freight_charges: freightCharges, handling_charges: handlingCharges, delivery_charges: deliveryCharges,
        other_charges: otherCharges, created_by: user?.id, status: "confirmed", company_id: companyId,
      }).select().single();
      if (orderError) throw orderError;

      try {
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
      } catch (innerError) {
        // Rollback: delete partially created order and its items
        await supabase.from("sales_order_items").delete().eq("sales_order_id", order.id);
        await supabase.from("sales_orders").delete().eq("id", order.id);
        throw innerError;
      }

      return order;
    },
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["all-batches-for-sale"] });
      toast({ title: "Sale completed", description: "Invoice generated successfully." });
      // Open post-sale payment dialog
      if (order) {
        setPostSaleDialog({
          id: order.id,
          invoice_number: order.invoice_number,
          customer_name: order.customer_name,
          total_amount: Number(order.total_amount),
        });
      }
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
    setCustomerGstin("");
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
    
    setShowCustomerDialog(false);
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

      // Recalculate GST from items (fixes old bills with wrong GST)
      const recalcGst = billItems.reduce((s, i) => {
        const afterDiscount = i.unit_price * i.quantity * (1 - i.discount_percentage / 100);
        if (gstInclusive) {
          return s + (afterDiscount - afterDiscount / (1 + i.gst_percentage / 100));
        }
        return s + (afterDiscount * i.gst_percentage / 100);
      }, 0);

      if (action === "csv") {
        const billData: BillData = {
          type: "sale", invoice_number: order.invoice_number, date: order.sale_date,
          customer_name: order.customer_name, items: billItems, subtotal,
          gst_amount: recalcGst, discount_amount: Number(order.discount_amount),
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
          customer_gstin: (order as any).customer_gstin || (order.customer_id ? customers?.find(c => c.id === order.customer_id)?.gst_number || undefined : undefined),
          items: billItems, subtotal,
          gst_amount: recalcGst, discount_amount: Number(order.discount_amount),
          freight_charges: Number(order.freight_charges), handling_charges: Number(order.handling_charges),
          delivery_charges: Number(order.delivery_charges), other_charges: Number(order.other_charges),
          total_amount: Number(order.total_amount), payment_method: order.payment_method || "cash",
          notes: order.notes || undefined,
          gstInclusive,
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
  useKeyboardShortcut({ key: "F6", callback: () => setShowProductDialog(true), enabled: activeTab === "billing" && !showProductDialog, allowInInput: true });
  useKeyboardShortcut({ key: "F4", callback: () => { const btn = document.getElementById("sale-submit-btn"); if (btn) btn.focus(); }, enabled: activeTab === "billing" && cart.length > 0, allowInInput: true });

  // Auto-focus invoice number on billing tab mount and prefetch next invoice number
  useEffect(() => {
    if (activeTab === "billing") {
      // Focus customer dropdown by default on new sale - it's pre-selected to "Walk-in Customer"
      setTimeout(() => {
        const customerBtn = document.querySelector('[aria-haspopup="dialog"][data-enter-nav-include="true"]');
        if (customerBtn && customerBtn instanceof HTMLElement) {
          customerBtn.focus();
        }
      }, 50);
    }
  }, [activeTab]);

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
  }, [allBatches, products, cart, noGstBill, gstInclusive, toast, focusProductSearch]);

  const filteredOrders = salesOrders?.filter(o => o.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) || o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales & Billing</h1>
          <p className="text-muted-foreground text-sm">
            <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px]">Ctrl+Enter</kbd> save
            <span className="mx-1">·</span>
            <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px]">F4</kbd> submit
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
        <TabsContent value="billing" className="mt-4 space-y-4" data-enter-nav onKeyDown={saleEnterNav}>
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
              <Input ref={invoiceNumberRef} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Auto-generated" className="h-8 text-sm" />
            </div>
            <div className="md:col-span-2 space-y-1">
                <Label className="text-[11px]">Customer *</Label>
                <div className="flex gap-1">
                    <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          ref={customerButtonRef}
                          variant="outline"
                          className="flex-1 justify-between h-8 text-sm font-normal"
                          data-enter-nav-include="true"
                          onKeyDown={(e) => {
                            if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey) {
                              e.preventDefault();
                              setShowCustomerDialog(true);
                            }
                          }}
                        >
                          {selectedCustomerId ? customers?.find(c => c.id === selectedCustomerId)?.name || customerName : customerName || "Select customer..."}
                          <ChevronsUpDown className="ml-1 h-3 w-3 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search by name or phone..." value={customerSearchQuery} onValueChange={setCustomerSearchQuery} />
                          <CommandList>
                            <CommandEmpty>No customer found.</CommandEmpty>
                            <CommandGroup>
                              {customers?.filter(c => c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) || (c.phone && c.phone.includes(customerSearchQuery))).map(c => (
                                <CommandItem key={c.id} value={c.name} onSelect={() => {
                                  setSelectedCustomerId(c.id);
                                  setCustomerName(c.name);
                                  setCustomerPhone(c.phone || "");
                                  setCustomerAddress(c.address || "");
                                  setCustomerGstin(c.gst_number || "");
                                  setCustomerPopoverOpen(false);
                                  // Immediately move focus to Product Search
                                  setTimeout(() => productSearchRef.current?.focus(), 50);
                                }}>
                                  <Check className={`mr-2 h-3 w-3 ${selectedCustomerId === c.id ? "opacity-100" : "opacity-0"}`} />
                                  <div><div className="text-sm">{c.name}</div><div className="text-[10px] text-muted-foreground">{c.phone || ""}{c.gst_number ? ` • ${c.gst_number}` : ""}</div></div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                   <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setShowCustomerDialog(true)} title="Add new customer"><UserPlus className="h-3 w-3" /></Button>
                </div>
                 {settings.show_customer_gstin && selectedCustomerId && (
                   <div className="space-y-1 mt-1">
                     <Label className="text-[11px]">Customer GSTIN</Label>
                     <Input value={customerGstin} onChange={e => setCustomerGstin(e.target.value)} className="h-8 text-sm" placeholder="e.g., 27AABCU9603R1ZM" />
                   </div>
                 )}
              </div>
            {config.hasPrescription && (
              <div className="space-y-1">
                <Label className="text-[11px]">Rx #</Label>
                <Input value={prescriptionNumber} onChange={e => setPrescriptionNumber(e.target.value)} className="h-8 text-sm" />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-[11px]">Payment</Label>
              <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v); focusProductSearch(); }}>
                <SelectTrigger className="h-8 text-sm" data-enter-nav-skip="true"><SelectValue /></SelectTrigger>
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
                <div className="flex gap-1">
                  <div className="flex-1">
                    <DrugBrandSearch
                      ref={productSearchRef}
                      products={products}
                      selectedProductId={selectedProduct}
                      onSelect={(v) => {
                        setSelectedProduct(v);
                        setSelectedBatchId(null); // reset manual batch when product changes
                        const p = products?.find(pp => pp.id === v);
                        if (p) setItemRate(p.sale_price && Number(p.sale_price) > 0 ? Number(p.sale_price) : Number(p.mrp));
                        // Compute available stock for this product right now
                        const productBatches = (allBatches || []).filter(b => b.product_id === v);
                        const stock = productBatches.reduce((sum, b) => sum + (b.quantity || 0), 0);
                        if (stock <= 0 && !settings.allow_negative_stock) {
                          // Out of stock — keep focus on product, show feedback
                          toast({ title: "Out of stock", description: "This product has 0 available stock. Pick another, or enable negative stock in Settings.", variant: "destructive" });
                          setTimeout(() => productSearchRef.current?.focus(), 30);
                          return;
                        }
                        setTimeout(() => (document.getElementById("sale-qty") as HTMLInputElement)?.focus(), 30);
                      }}
                      showPrice priceType="sale"
                    />
                  </div>
                  <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" title="New Product (F6)" onClick={() => setShowProductDialog(true)} data-enter-nav-skip="true" tabIndex={-1}>
                    <PlusCircle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground mb-0.5 block">Qty</Label>
                <Input type="number" id="sale-qty" min={1} value={itemQuantity}
                  onChange={e => setItemQuantity(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                  onKeyDown={saleEnterNav}
                  className="h-9" placeholder="1"
                />
              </div>
              {settings.show_free_qty_column && (
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block">Free</Label>
                  <Input type="number" min={0} value={itemFreeQty || ""}
                    onChange={e => setItemFreeQty(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                    onKeyDown={saleEnterNav}
                    className="h-9" placeholder="0"
                  />
                </div>
              )}
              <div>
                <Label className="text-[10px] text-muted-foreground mb-0.5 block">Rate ₹</Label>
                <Input type="number" min={0} step={0.01} value={itemRate || ""}
                  onChange={e => setItemRate(parseFloat(e.target.value) || 0)}
                  onKeyDown={saleEnterNav}
                  className="h-9" placeholder="0.00"
                />
              </div>
              {(settings.discount_mode === "percentage" || settings.discount_mode === "both") && (
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block">Disc%</Label>
                  <Input type="number" min={0} max={maxDiscountAllowed} step={0.1} value={itemDiscount || ""}
                    onChange={e => setItemDiscount(Math.min(parseFloat(e.target.value) || 0, maxDiscountAllowed))}
                    onKeyDown={saleEnterNav}
                    className="h-9" placeholder="0"
                  />
                </div>
              )}
              <div className="flex flex-col justify-end">
                <Label className="text-[10px] text-muted-foreground mb-0.5 block invisible">Action</Label>
                <div className="flex gap-1">
                  {selectedProduct && batchesForProduct.length > 0 && (
                    <BatchSelector
                      batches={batchesForProduct}
                      selectedBatchId={selectedBatchId}
                      existingCartQuantities={existingCartQuantities}
                      onSelect={setSelectedBatchId}
                    />
                  )}
                  {selectedProduct && (() => {
                    const projected = availableStock - (itemQuantity || 0) - (itemFreeQty || 0);
                    const isNeg = projected < 0;
                    return (
                      <Badge variant={availableStock > 0 && !isNeg ? "outline" : "destructive"} className="self-center text-[10px] whitespace-nowrap px-1.5">
                        {availableStock <= 0 ? (settings.allow_negative_stock ? "0 (override)" : "Out of stock") : `${projected}/${availableStock}`}
                      </Badge>
                    );
                  })()}
                  <Button onClick={handleAddToCart} className="h-9 flex-1" disabled={!selectedProduct || itemQuantity <= 0 || (availableStock === 0 && !settings.allow_negative_stock)} size="sm" data-enter-nav-include="true">
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
                  id="sale-submit-btn"
                  className="w-full gap-2"
                  onClick={() => createSaleMutation.mutate()}
                  disabled={cart.length === 0 || !customerName || createSaleMutation.isPending}
                  data-enter-nav-include="true"
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
      {postSaleDialog && <PostSalePaymentDialog open={!!postSaleDialog} onOpenChange={(o) => { if (!o) setPostSaleDialog(null); }} salesOrderId={postSaleDialog.id} invoiceNumber={postSaleDialog.invoice_number} customerName={postSaleDialog.customer_name} totalAmount={postSaleDialog.total_amount} defaultPaymentMethod={(settings.default_payment_method as "cash" | "upi" | "bank_transfer" | "cheque" | "card" | "other") || "cash"} />}
      {showProductDialog && <ProductFormDialog open={showProductDialog} onOpenChange={setShowProductDialog} onSuccess={(id) => { refetchProducts(); if (id) setSelectedProduct(id); setShowProductDialog(false); }} />}
      <CustomerFormDialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog} onSuccess={(customerId) => {
        queryClient.invalidateQueries({ queryKey: ["customers-for-sale"] });
        // Find the customer after refetch to populate fields
        supabase.from("customers").select("id, name, phone, address, gst_number").eq("id", customerId).single().then(({ data }) => {
          if (data) {
            setSelectedCustomerId(data.id);
            setCustomerName(data.name);
            setCustomerPhone(data.phone || "");
            setCustomerAddress(data.address || "");
            setCustomerGstin(data.gst_number || "");
            // Close dialog and advance focus to next field after customer selection
            setShowCustomerDialog(false);
            setTimeout(() => advanceToNextField(document.activeElement as HTMLElement), 100);
          }
        });
      }} />
    </div>
  );
}

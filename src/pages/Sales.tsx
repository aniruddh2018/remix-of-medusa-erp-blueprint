import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useCustomers, useSalesOrders, usePaymentsByRefType, useActiveProducts, useAvailableBatches } from "@/offline/hooks";
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
import { Plus, Search, Trash2, Receipt, CreditCard, Banknote, PlusCircle, AlertTriangle, Pencil, Printer, FileText, FileSpreadsheet, Download, ChevronDown, Loader2, RotateCcw, UserPlus, Check, ChevronsUpDown, History, Undo2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RecordPaymentDialog } from "@/components/dialogs/RecordPaymentDialog";
import { PostSalePaymentDialog } from "@/components/dialogs/PostSalePaymentDialog";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { usePlatformShortcut } from "@/hooks/usePlatformShortcut";
import { SHORTCUTS } from "@/lib/platform";
import { format, differenceInDays } from "date-fns";
import { ProductFormDialog } from "@/components/forms/ProductFormDialog";
import { EditSaleDialog } from "@/components/dialogs/EditSaleDialog";
import { CreditNoteDialog } from "@/components/dialogs/CreditNoteDialog";
import { allocateBatchesFIFO, getTotalAvailableStock } from "@/utils/fifoAllocation";
import { DrugBrandSearch, type DrugBrandSearchHandle } from "@/components/DrugBrandSearch";
import { useEnterNavigation, advanceToNextField } from "@/hooks/useEnterNavigation";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import { useModuleFocus } from "@/contexts/FocusContext";
import { CustomerFormDialog } from "@/components/forms/CustomerFormDialog";
import { PartySearchInput, type PartySearchHandle } from "@/components/PartySearchInput";
import { DoctorSelector } from "@/components/DoctorSelector";
import { CustomerHistoryDialog, type RepeatItem } from "@/components/dialogs/CustomerHistoryDialog";
import { QuickTextEntry } from "@/components/QuickTextEntry";
import { printConfigurableInvoice, downloadConfigurableInvoiceHTML, downloadConfigurableInvoicePDF, type InvoiceTemplateData } from "@/utils/invoiceTemplate";
import { downloadBillCSV, type BillData } from "@/utils/billGenerator";
import { SalesItemsTable, type CartItem } from "@/components/billing/SalesItemsTable";
import { BillingTotals } from "@/components/billing/BillingTotals";
import { BatchSelector, type BatchSelectorHandle } from "@/components/billing/BatchSelector";
import { UnitSelector, type UnitSelectorHandle } from "@/components/billing/UnitSelector";
import { resolveConversion } from "@/services/unitConversion";
import type { Tables } from "@/integrations/supabase/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type SalesOrder = Tables<"sales_orders">;
type Product = Tables<"products">;
type InventoryBatch = Tables<"inventory_batches">;

const salesFlow = ["product", "unit", "qty", "free", "rate", "discount", "fefo", "add"] as const;

export default function Sales() {
  const { toast } = useToast();
  const { user, isAdmin, isPharmacist } = useAuth();
  const { config, companyId, gstInclusive } = useBusiness();
  const { settings, maxDiscountAllowed } = useInvoiceSettings();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const productSearchRef = useRef<DrugBrandSearchHandle>(null);
  const unitSelectorRef = useRef<UnitSelectorHandle>(null);
  const fefoSelectorRef = useRef<BatchSelectorHandle>(null);
  const invoiceNumberRef = useRef<HTMLInputElement>(null);
  const customerButtonRef = useRef<HTMLButtonElement>(null);
  const customerSearchRef = useRef<PartySearchHandle>(null);

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
  const [doctor, setDoctor] = useState<{ id: string | null; name: string; registration_number: string }>({ id: null, name: "", registration_number: "" });
  const [prescriptionDate, setPrescriptionDate] = useState<string>("");
  const [prescriptionDurationDays, setPrescriptionDurationDays] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemDiscount, setItemDiscount] = useState<number>(0);
  const [itemDiscountFlat, setItemDiscountFlat] = useState<number>(0);
  const [itemFreeQty, setItemFreeQty] = useState<number>(0);
  const [itemRate, setItemRate] = useState<number>(0);
  const [itemUnit, setItemUnit] = useState<string>("");
  const [itemUnitFactor, setItemUnitFactor] = useState<number>(1);
  /** Per-base-unit rate captured when product is selected — source of truth for unit changes. */
  const [itemBaseRate, setItemBaseRate] = useState<number>(0);
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
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [customerCreateSeed, setCustomerCreateSeed] = useState<{ name?: string; phone?: string }>({});
  const [editingCustomer, setEditingCustomer] = useState<Tables<"customers"> | null>(null);
  
  const [billLoadingId, setBillLoadingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SalesOrder | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [paymentDialog, setPaymentDialog] = useState<null | { referenceId: string; referenceNumber: string; partyName: string; totalAmount: number; paidAmount: number }>(null);
  const [postSaleDialog, setPostSaleDialog] = useState<null | { id: string; invoice_number: string; customer_name: string; total_amount: number }>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [returnMode, setReturnMode] = useState(false);

  // ── Queries (PR 5: local-first reads via Dexie) ──
  const customers = useCustomers<{ id: string; name: string; phone: string | null; email: string | null; address: string | null; gst_number: string | null }>(companyId);


  const saleDraft = useMemo(() => ({ cart, invoiceNumber, customerName, customerPhone, customerAddress, customerGstin, prescriptionNumber, prescriptionDate, prescriptionDurationDays, doctor, notes, freightCharges, handlingCharges, deliveryCharges, otherCharges }), [cart, invoiceNumber, customerName, customerPhone, customerAddress, customerGstin, prescriptionNumber, prescriptionDate, prescriptionDurationDays, doctor, notes, freightCharges, handlingCharges, deliveryCharges, otherCharges]);

  const { clearDraft } = useDraftSave("draft_sale", saleDraft, (draft) => {
    if (draft.cart?.length > 0 || draft.customerName || draft.invoiceNumber) {
      setCart(draft.cart || []);
      setInvoiceNumber(draft.invoiceNumber || "");
      setCustomerName(draft.customerName || "");
      setCustomerPhone(draft.customerPhone || "");
      setCustomerAddress(draft.customerAddress || "");
      setCustomerGstin(draft.customerGstin || "");
      setPrescriptionNumber(draft.prescriptionNumber || "");
      setPrescriptionDate(draft.prescriptionDate || "");
      setPrescriptionDurationDays(draft.prescriptionDurationDays || "");
      if (draft.doctor) setDoctor(draft.doctor);
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
        customerSearchRef.current?.focus();
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
    getEntryPoint: () => (customerSearchRef.current as unknown as HTMLElement) || customerButtonRef.current,
    getFallback: () => (productSearchRef.current as unknown as HTMLElement) || null,
    flowStartedWhen: !!selectedCustomerId || cart.length > 0,
  });

  const salesOrders = useSalesOrders<SalesOrder>(companyId);
  const isLoading = salesOrders === undefined;
  const salesPayments = usePaymentsByRefType(companyId, "sales_order");

  const paidBySalesId = useMemo(() => {
    const map: Record<string, number> = {};
    salesPayments?.forEach(p => { map[p.reference_id] = (map[p.reference_id] || 0) + Number(p.amount); });
    return map;
  }, [salesPayments]);

  const products = useActiveProducts<Product>(companyId);
  const refetchProducts = () => { /* reactive via Dexie */ };

  // Preload ALL batches for instant search (MARG-style speed)
  const allBatches = useAvailableBatches<InventoryBatch>(companyId);


  const batchesForProduct = useMemo(() => {
    if (!allBatches || !selectedProduct) return [];
    return allBatches.filter(b => b.product_id === selectedProduct);
  }, [allBatches, selectedProduct]);

  const existingCartQuantities = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach(item => {
      // Return rows do NOT consume available stock — skip them
      if (item.is_return) return;
      if (item.product_id === selectedProduct) {
        // Reserve in BASE units (use base_quantity if present, else fall back to qty+free)
        const baseUsed = item.base_quantity ?? (item.quantity + (item.free_quantity || 0));
        map.set(item.batch_id, (map.get(item.batch_id) || 0) + baseUsed);
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

  const handleAddToCart = useCallback(async () => {
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

    // Guard 2: quantity must be > 0
    if (itemQuantity <= 0) {
      toast({ title: "Quantity required", description: "Enter a quantity greater than 0.", variant: "destructive" });
      productSearchRef.current?.focus();
      return;
    }

    const isReturn = returnMode;
    const baseUnit = (product.base_unit || product.unit || "pcs").toLowerCase();
    const soldUnit = (itemUnit || baseUnit).toLowerCase();
    const needsConversion = soldUnit !== baseUnit;

    // For RETURNS: skip stock checks
    if (!isReturn) {
      if (batchesForProduct.length === 0 || availableStock <= 0) {
        if (!settings.allow_negative_stock) {
          toast({ title: "Out of stock", description: "This product has 0 available stock. Choose another or enable negative stock in Settings.", variant: "destructive" });
          setSelectedProduct("");
          productSearchRef.current?.clear();
          setTimeout(() => productSearchRef.current?.focus(), 50);
          return;
        }
      }
    }

    // Resolve conversion factor (sold → base). For non-base units we REQUIRE a specific batch
    // so the conversion is unambiguous (different batches can have different pack sizes).
    let factor = 1;
    let batchForConversion = selectedBatchId;
    if (needsConversion) {
      if (!batchForConversion) {
        // Auto-pick first batch by FEFO so a single strip→tablet conversion is unambiguous.
        const sorted = [...batchesForProduct].sort((a, b) => {
          if (!a.expiry_date && !b.expiry_date) return 0;
          if (!a.expiry_date) return 1;
          if (!b.expiry_date) return -1;
          return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
        });
        batchForConversion = sorted[0]?.id ?? null;
      }
      if (!batchForConversion) {
        toast({ title: "Select a batch", description: `To sell in ${soldUnit}, please pick a specific batch (different batches may have different pack sizes).`, variant: "destructive" });
        return;
      }
      try {
        const conv = await resolveConversion({
          companyId: companyId!,
          productId: product.id,
          batchId: batchForConversion,
          fromUnit: soldUnit,
          toUnit: baseUnit,
        });
        factor = conv.toBase(1); // how many base units per 1 sold unit
        if (factor <= 0) throw new Error("Invalid factor");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast({ title: "Conversion missing", description: `Cannot convert ${soldUnit} → ${baseUnit}. ${msg}`, variant: "destructive" });
        return;
      }
    }

    // BASE-unit totals used for stock checks and allocations
    const baseQtyMain = itemQuantity * factor;
    const baseQtyFree = (itemFreeQty || 0) * factor;
    const totalBaseNeeded = baseQtyMain + baseQtyFree;
    const totalNeeded = itemQuantity + (itemFreeQty || 0); // user-unit total (for cart UI)

    // Guard 3: stock check in base units
    if (!isReturn && totalBaseNeeded > availableStock && !settings.allow_negative_stock) {
      toast({ title: "Quantity exceeds stock", description: `Only ${availableStock} ${baseUnit} available.`, variant: "destructive" });
      const qtyEl = document.getElementById("sale-qty") as HTMLInputElement | null;
      qtyEl?.focus();
      qtyEl?.select();
      return;
    }

    let allocationResult;

    if (isReturn) {
      const targetBatch = (selectedBatchId
        ? batchesForProduct.find(b => b.id === selectedBatchId)
        : batchesForProduct[0]);
      if (!targetBatch) {
        toast({ title: "No batch to credit", description: "This product has no existing batch to return into. Receive stock first or pick a batch.", variant: "destructive" });
        productSearchRef.current?.focus();
        return;
      }
      allocationResult = {
        success: true,
        allocations: [{
          batch_id: targetBatch.id,
          batch_number: targetBatch.batch_number,
          quantity: totalBaseNeeded,
          available_quantity: targetBatch.quantity,
          expiry_date: targetBatch.expiry_date,
          mrp: Number(targetBatch.mrp),
          purchase_price: Number(targetBatch.purchase_price),
          pack_size: targetBatch.pack_size,
        }],
        totalAllocated: totalBaseNeeded,
        shortfall: 0,
      };
    } else if (needsConversion || selectedBatchId) {
      // Forced single-batch path (manual override OR unit conversion)
      const chosenId = batchForConversion || selectedBatchId;
      const chosen = batchesForProduct.find(b => b.id === chosenId);
      if (!chosen) {
        toast({ title: "Batch unavailable", description: "Selected batch is no longer available.", variant: "destructive" });
        setSelectedBatchId(null);
        return;
      }
      const cartBaseInBatch = existingCartQuantities.get(chosen.id) || 0;
      const pack = chosen.pack_size && chosen.pack_size > 0 ? chosen.pack_size : 1;
      const availInBatchBase = Math.max(0, chosen.quantity * pack + (chosen.loose_quantity || 0) - cartBaseInBatch);
      if (totalBaseNeeded > availInBatchBase && !settings.allow_negative_stock) {
        toast({ title: "Batch quantity exceeded", description: `Only ${availInBatchBase} ${baseUnit} in batch ${chosen.batch_number}.`, variant: "destructive" });
        const qtyEl = document.getElementById("sale-qty") as HTMLInputElement | null;
        qtyEl?.focus(); qtyEl?.select();
        return;
      }
      allocationResult = {
        success: true,
        allocations: [{
          batch_id: chosen.id,
          batch_number: chosen.batch_number,
          quantity: totalBaseNeeded,
          available_quantity: chosen.quantity * pack + (chosen.loose_quantity || 0),
          expiry_date: chosen.expiry_date,
          mrp: Number(chosen.mrp),
          purchase_price: Number(chosen.purchase_price),
          pack_size: chosen.pack_size,
        }],
        totalAllocated: totalBaseNeeded,
        shortfall: 0,
      };
    } else {
      // Default FEFO across batches (base-unit aware)
      allocationResult = allocateBatchesFIFO(batchesForProduct, totalBaseNeeded, existingCartQuantities);
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

    // Distribute paid vs free across batch allocations.
    // allocations are in BASE units; convert back to user units (sold_unit) by dividing by factor.
    let mainBaseLeft = baseQtyMain;
    let freeBaseLeft = baseQtyFree;
    let newCart = [...cart];
    for (const allocation of allocationResult.allocations) {
      const takeMainBase = Math.min(mainBaseLeft, allocation.quantity);
      const takeFreeBase = Math.min(freeBaseLeft, allocation.quantity - takeMainBase);
      mainBaseLeft -= takeMainBase;
      freeBaseLeft -= takeFreeBase;

      // For multi-batch FEFO splits in non-base units, convert back to user-units (rounded).
      const takeMain = needsConversion ? Math.round(takeMainBase / factor) : takeMainBase;
      const takeFree = needsConversion ? Math.round(takeFreeBase / factor) : takeFreeBase;

      const unitPrice = effectiveRate > 0 ? effectiveRate : allocation.mrp;
      const existingIndex = isReturn
        ? -1
        : newCart.findIndex(i => i.batch_id === allocation.batch_id && !i.is_return && (i.sold_unit || baseUnit) === soldUnit);
      if (existingIndex >= 0) {
        const row = newCart[existingIndex];
        row.quantity += takeMain;
        row.free_quantity = (row.free_quantity || 0) + takeFree;
        row.base_quantity = (row.base_quantity || 0) + takeMainBase + takeFreeBase;
        row.total_price = calculateItemTotal(row.unit_price, row.quantity, gstPercentage, row.discount_percentage, row.discount_flat);
        row.max_quantity = allocation.available_quantity;
      } else {
        const baseTotal = calculateItemTotal(unitPrice, takeMain, gstPercentage, itemDiscount, itemDiscountFlat);
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
          total_price: isReturn ? -baseTotal : baseTotal,
          max_quantity: allocation.available_quantity,
          expiry_date: allocation.expiry_date,
          is_return: isReturn || undefined,
          sold_unit: soldUnit,
          base_unit: baseUnit,
          base_quantity: takeMainBase + takeFreeBase,
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
    setItemUnit("");
    setItemUnitFactor(1);
    setItemBaseRate(0);
    if (isReturn) {
      setReturnMode(false);
      toast({ title: "Return added", description: `${productName} marked as return. Stock will be restored on save.` });
    } else if (allocationResult.allocations.length > 1) {
      toast({ title: "FIFO Applied", description: `Split across ${allocationResult.allocations.length} batches` });
    }

    focusProductSearch();
  }, [selectedProduct, selectedBatchId, itemQuantity, itemFreeQty, itemRate, itemDiscount, itemDiscountFlat, itemUnit, products, batchesForProduct, availableStock, existingCartQuantities, cart, noGstBill, settings.allow_negative_stock, calculateItemTotal, toast, focusProductSearch, returnMode, companyId]);

  // Repeat-from-history: add a single product line using FEFO batches with the historic price/discount.
  const handleRepeatItem = useCallback((item: RepeatItem) => {
    if (!products || !allBatches) return;
    const product = products.find(p => p.id === item.product_id);
    if (!product) {
      toast({ title: "Product missing", description: "This product no longer exists in your catalog.", variant: "destructive" });
      return;
    }
    const productBatches = allBatches.filter(b => b.product_id === product.id);
    // Cart map for already-allocated quantities (across all products)
    const cartQtyMap = new Map<string, number>();
    cart.forEach(ci => {
      cartQtyMap.set(ci.batch_id, (cartQtyMap.get(ci.batch_id) || 0) + ci.quantity + (ci.free_quantity || 0));
    });
    const totalNeeded = item.quantity + (item.free_quantity || 0);
    const result = allocateBatchesFIFO(productBatches, totalNeeded, cartQtyMap);
    if (!result.success) {
      toast({ title: "Cannot repeat", description: result.message || "Insufficient stock.", variant: "destructive" });
      return;
    }
    const gst = noGstBill ? 0 : Number(product.gst_percentage);
    const productName = `${product.name}${product.strength ? ` ${product.strength}` : ""}`;
    let mainLeft = item.quantity;
    let freeLeft = item.free_quantity;
    const newRows: CartItem[] = [];
    for (const a of result.allocations) {
      const takeMain = Math.min(mainLeft, a.quantity);
      const takeFree = Math.min(freeLeft, a.quantity - takeMain);
      mainLeft -= takeMain;
      freeLeft -= takeFree;
      newRows.push({
        product_id: product.id,
        batch_id: a.batch_id,
        product_name: productName,
        batch_number: a.batch_number,
        hsn_code: product.hsn_code || "",
        quantity: takeMain,
        free_quantity: takeFree,
        unit_price: item.unit_price > 0 ? item.unit_price : a.mrp,
        gst_percentage: gst,
        discount_percentage: item.discount_percentage,
        discount_flat: 0,
        total_price: calculateItemTotal(item.unit_price > 0 ? item.unit_price : a.mrp, takeMain, gst, item.discount_percentage, 0),
        max_quantity: a.available_quantity,
        expiry_date: a.expiry_date,
      });
    }
    setCart(prev => [...prev, ...newRows]);
  }, [products, allBatches, cart, noGstBill, calculateItemTotal, toast]);

  const saleEnterNav = useEnterNavigation(handleAddToCart);
  const salesKeyboard = useKeyboardNavigation(salesFlow, {
    onEnd: handleAddToCart,
    blockForward: (current) => {
      if (current === "product" && !selectedProduct) {
        productSearchRef.current?.focus();
        toast({ title: "Select a product", description: "Pick a product before moving ahead.", variant: "destructive" });
        return true;
      }
      return false;
    },
  });

  // Jump-to-cart shortcut (Alt+L): focus first interactive element in first cart row
  const focusCart = useCallback(() => {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", description: "Add a product first." });
      return;
    }
    const firstRow = document.querySelector<HTMLElement>("[data-billing-row]");
    if (!firstRow) return;
    firstRow.scrollIntoView({ block: "center", behavior: "smooth" });
    const firstInput = firstRow.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), [role="combobox"], button:not([disabled])'
    );
    (firstInput || firstRow).focus();
    if (firstInput instanceof HTMLInputElement) firstInput.select();
  }, [cart.length, toast]);
  usePlatformShortcut({ shortcut: SHORTCUTS.FOCUS_CART, callback: focusCart, enabled: true, allowInInput: true });

  const updateCartItem = useCallback((index: number, field: keyof CartItem, value: string | number) => {
    const updated = [...cart];
    (updated[index] as any)[field] = value;
    const item = updated[index];
    item.total_price = calculateItemTotal(item.unit_price, item.quantity, item.gst_percentage, item.discount_percentage, item.discount_flat);
    setCart(updated);
  }, [cart, calculateItemTotal]);

  const removeFromCart = useCallback((index: number) => setCart(c => c.filter((_, i) => i !== index)), []);

  // ── Totals ── (returns count as negative contributions)
  const sign = (i: CartItem) => (i.is_return ? -1 : 1);
  const itemsGrossTotal = cart.reduce((s, i) => s + sign(i) * i.unit_price * i.quantity, 0);
  const totalItemDiscount = cart.reduce((s, i) => s + sign(i) * ((i.unit_price * i.quantity * i.discount_percentage / 100) + i.discount_flat), 0);
  const itemsSubtotal = cart.reduce((s, i) => s + sign(i) * Math.max(0, i.unit_price * i.quantity * (1 - i.discount_percentage / 100) - i.discount_flat), 0);
  const totalGst = gstInclusive
    ? cart.reduce((s, i) => { const after = Math.max(0, i.unit_price * i.quantity * (1 - i.discount_percentage / 100) - i.discount_flat); return s + sign(i) * (after - after / (1 + i.gst_percentage / 100)); }, 0)
    : cart.reduce((s, i) => { const after = Math.max(0, i.unit_price * i.quantity * (1 - i.discount_percentage / 100) - i.discount_flat); return s + sign(i) * (after * i.gst_percentage / 100); }, 0);
  const totalCharges = freightCharges + handlingCharges + deliveryCharges + otherCharges;
  const subtotalBeforeBillDiscount = gstInclusive ? itemsSubtotal + totalCharges : itemsSubtotal + totalGst + totalCharges;
  const billDiscountAmount = (subtotalBeforeBillDiscount * billDiscountPercent / 100) + billDiscountFlat;
  const grandTotal = Math.max(0, subtotalBeforeBillDiscount - billDiscountAmount);
  const totalDiscountAmount = totalItemDiscount + billDiscountAmount;

  // ── Save mutation (PR 6 — local-first via offline writer) ──
  const createSaleMutation = useMutation({
    mutationFn: async () => {
      const rawPrefix = (settings.invoice_prefix || "INV").replace(/[-\s]+$/g, "") || "INV";

      // Per-schedule prescription check (unchanged business rule)
      if (config.hasDrugSchedule) {
        const rxCheck = settings.prescription_check || {};
        const triggeredSchedules = new Set<string>();
        for (const i of cart) {
          const p = products?.find(pp => pp.id === i.product_id);
          if (p && p.drug_schedule && p.drug_schedule !== 'none' && (rxCheck as Record<string, boolean>)[p.drug_schedule]) {
            triggeredSchedules.add(p.drug_schedule);
          }
        }
        if (triggeredSchedules.size > 0) {
          const missing: string[] = [];
          if (!doctor.name.trim()) missing.push("Doctor");
          if (!prescriptionDate) missing.push("Prescription Date");
          if (!prescriptionDurationDays || parseInt(prescriptionDurationDays, 10) <= 0) missing.push("Prescription Duration");
          if (missing.length > 0) {
            const scheduleList = Array.from(triggeredSchedules).map(s => s.replace('schedule_', 'Schedule ').replace('Schedule h1', 'Schedule H1').replace('Schedule h', 'Schedule H').replace('Schedule x', 'Schedule X').replace('narcotic', 'Narcotic')).join(", ");
            const msg = `${missing.join(", ")} required for ${scheduleList}.`;
            if (isAdmin) {
              const ok = window.confirm(`${msg}\n\nAs Admin you may override and proceed. Continue anyway?`);
              if (!ok) throw new Error(msg);
            } else {
              throw new Error(`${msg} Ask an admin to override.`);
            }
          }
        }
      }

      const { createSalesOrderLocal } = await import("@/offline/sales/createSalesOrderLocal");
      const result = await createSalesOrderLocal({
        companyId: companyId!,
        userId: user?.id ?? null,
        blockExpired: !!(settings as any).block_expired_sales,
        header: {
          invoice_number: invoiceNumber.trim() || undefined,
          prefix: rawPrefix,
          customer_id: selectedCustomerId || null,
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
          notes: notes || null,
          total_amount: grandTotal,
          gst_amount: totalGst,
          discount_amount: totalDiscountAmount,
          freight_charges: freightCharges,
          handling_charges: handlingCharges,
          delivery_charges: deliveryCharges,
          other_charges: otherCharges,
          status: "confirmed",
        },
        items: cart.map(i => ({
          product_id: i.product_id,
          batch_id: i.batch_id!,
          quantity: i.quantity,
          free_quantity: i.free_quantity || 0,
          unit_price: i.unit_price,
          gst_percentage: i.gst_percentage,
          discount_percentage: i.discount_percentage,
          total_price: i.total_price,
          sold_unit: i.sold_unit || null,
          base_quantity: i.base_quantity ?? (i.quantity + (i.free_quantity || 0)),
          is_return: !!i.is_return,
        })),
      });
      return result;
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
      const { deleteSalesOrderLocal } = await import("@/offline/sales/deleteSalesOrderLocal");
      await deleteSalesOrderLocal(orderId, { companyId: companyId!, userId: user?.id || null });
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
    setPrescriptionDate("");
    setPrescriptionDurationDays("");
    setDoctor({ id: null, name: "", registration_number: "" });
    setNotes("");
    setSelectedProduct("");
    setItemQuantity(1);
    setItemDiscount(0);
    setItemDiscountFlat(0);
    setItemFreeQty(0);
    setItemRate(0);
    setItemUnit("");
    setItemUnitFactor(1);
    setItemBaseRate(0);
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
    key: "n",
    callback: () => { handleReset(); setActiveTab("billing"); },
    enabled: activeTab === "history" && !editDialogOpen && !creditNoteOpen && !deleteDialogOpen,
  });
  useKeyboardShortcut({ key: "F6", callback: () => setShowProductDialog(true), enabled: activeTab === "billing" && !showProductDialog, allowInInput: true });
  useKeyboardShortcut({ key: "F4", callback: () => { const btn = document.getElementById("sale-submit-btn"); if (btn) btn.focus(); }, enabled: activeTab === "billing" && cart.length > 0, allowInInput: true });
  // Ctrl+H — open customer purchase history
  useKeyboardShortcut({
    key: "h", modifiers: ["ctrl"],
    callback: () => { if (selectedCustomerId || (customerName && customerName !== (settings.default_customer_name || ""))) setHistoryOpen(true); else toast({ title: "Select a customer first", description: "Pick an existing customer to view their purchase history." }); },
    enabled: activeTab === "billing", allowInInput: true,
  });
  // * — toggle return mode for the next added item
  useKeyboardShortcut({
    key: "*",
    callback: () => { setReturnMode(m => !m); },
    enabled: activeTab === "billing", allowInInput: true,
  });

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
            <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px]">Ctrl+H</kbd> history
            <span className="mx-1">·</span>
            <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px]">*</kbd> return mode
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
                    <PartySearchInput
                      ref={customerSearchRef}
                      parties={customers}
                      selectedId={selectedCustomerId}
                      selectedName={selectedCustomerId ? (customers?.find(c => c.id === selectedCustomerId)?.name || customerName) : customerName}
                      entityLabel="customer"
                      placeholder="Type name or phone…"
                      enterNavInclude
                      required
                      className="flex-1"
                      onSelect={(c) => {
                        setSelectedCustomerId(c.id);
                        setCustomerName(c.name);
                        setCustomerPhone(c.phone || "");
                        setCustomerAddress(c.address || "");
                        setCustomerGstin(c.gst_number || "");
                        setTimeout(() => productSearchRef.current?.focus(), 50);
                      }}
                      onClear={() => {
                        setSelectedCustomerId(null);
                        setCustomerName("");
                        setCustomerPhone("");
                        setCustomerAddress("");
                        setCustomerGstin("");
                      }}
                      onCreateNew={(seed) => {
                        setEditingCustomer(null);
                        setCustomerCreateSeed(seed);
                        setShowCustomerDialog(true);
                      }}
                      onEditSelected={async (party) => {
                        // Fetch full record for the form
                        const { data } = await supabase.from("customers").select("*").eq("id", party.id).single();
                        if (data) {
                          setEditingCustomer(data as Tables<"customers">);
                          setCustomerCreateSeed({});
                          setShowCustomerDialog(true);
                        }
                      }}
                    />
                   <Button
                     variant="outline" size="icon" className="h-8 w-8"
                     disabled={!selectedCustomerId && !customerName}
                     onClick={() => setHistoryOpen(true)}
                     title="Past purchases (Ctrl+H)"
                   ><History className="h-3 w-3" /></Button>
                   <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setCustomerCreateSeed({}); setShowCustomerDialog(true); }} title="Add new customer (Ctrl+N)"><UserPlus className="h-3 w-3" /></Button>
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
            {config.hasDrugSchedule && (() => {
              const rxCheck = (settings.prescription_check || {}) as Record<string, boolean>;
              const rxRequired = cart.some(i => {
                const p = products?.find(pp => pp.id === i.product_id);
                return p && p.drug_schedule && p.drug_schedule !== 'none' && rxCheck[p.drug_schedule];
              });
              return (
                <>
                  <div className="md:col-span-2 space-y-1">
                    <DoctorSelector
                      value={doctor}
                      onChange={setDoctor}
                      required={rxRequired}
                      onSelected={focusProductSearch}
                    />
                  </div>
                  {rxRequired && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-[11px]">
                          Rx Date <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          type="date"
                          value={prescriptionDate}
                          onChange={(e) => setPrescriptionDate(e.target.value)}
                          max={new Date().toISOString().slice(0, 10)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">
                          Duration (days) <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          value={prescriptionDurationDays}
                          onChange={(e) => setPrescriptionDurationDays(e.target.value)}
                          placeholder="e.g. 7"
                          className="h-8 text-sm"
                        />
                      </div>
                    </>
                  )}
                </>
              );
            })()}
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
          {returnMode && (
            <div className="rounded-md border-2 border-destructive bg-destructive/10 px-3 py-2 flex items-center justify-between animate-pulse">
              <span className="text-xs font-semibold text-destructive flex items-center gap-2">
                🔁 RETURN MODE — next item will be added as a customer return (stock restored, total subtracted)
              </span>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setReturnMode(false)}>Cancel (*)</Button>
            </div>
          )}
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
                      ref={(node) => {
                        productSearchRef.current = node;
                        salesKeyboard.register("product")(node);
                      }}
                      products={products}
                      selectedProductId={selectedProduct}
                      onNavigateKeyDown={(e) => salesKeyboard.handleKey(e, "product")}
                      onSelect={(v) => {
                        setSelectedProduct(v);
                        setSelectedBatchId(null); // reset manual batch when product changes
                        setItemUnit("");          // reset to base unit
                        setItemUnitFactor(1);
                        const p = products?.find(pp => pp.id === v);
                        if (p) {
                          const baseRate = p.sale_price && Number(p.sale_price) > 0 ? Number(p.sale_price) : Number(p.mrp);
                          setItemBaseRate(baseRate);
                          setItemRate(baseRate); // base unit on first select → 1:1
                        }
                        // Compute available stock for this product right now
                        const productBatches = (allBatches || []).filter(b => b.product_id === v);
                        const stock = productBatches.reduce((sum, b) => sum + (b.quantity || 0), 0);
                        if (stock <= 0 && !settings.allow_negative_stock) {
                          // Out of stock — clear selection so input remounts, then refocus
                          toast({ title: "Out of stock", description: "This product has 0 available stock. Pick another, or enable negative stock in Settings.", variant: "destructive" });
                          setSelectedProduct("");
                          productSearchRef.current?.clear();
                          setTimeout(() => productSearchRef.current?.focus(), 50);
                          return;
                        }
                        setTimeout(() => salesKeyboard.focusField("unit"), 0);
                      }}
                      showPrice priceType="sale"
                    />
                  </div>
                  <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" title="New Product (F6)" onClick={() => setShowProductDialog(true)} data-enter-nav-skip="true" tabIndex={-1}>
                    <PlusCircle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {(() => {
                const entryDisabled = !selectedProduct || (availableStock <= 0 && !settings.allow_negative_stock && !returnMode);
                return (
                  <>
              <div>
                <Label className="text-[10px] text-muted-foreground mb-0.5 block">Unit</Label>
                {selectedProduct ? (() => {
                  const p = products?.find(pp => pp.id === selectedProduct);
                  const baseUnit = (p?.base_unit || p?.unit || "pcs").toLowerCase();
                  return (
                    <UnitSelector
                      ref={(node) => {
                        unitSelectorRef.current = node;
                        salesKeyboard.register("unit")(node);
                      }}
                      companyId={companyId}
                      productId={selectedProduct}
                      baseUnit={baseUnit}
                      batchId={selectedBatchId}
                      value={itemUnit || baseUnit}
                      quantity={itemQuantity + (itemFreeQty || 0)}
                      onChange={(unit, factor) => {
                        const prevFactor = itemUnitFactor > 0 ? itemUnitFactor : 1;
                        const factorRatio = factor / prevFactor;
                        // Auto-adjust rate proportionally when unit changes
                        setItemRate(itemRate > 0 ? +(itemRate * factorRatio).toFixed(2) : itemRate);
                        setItemUnit(unit);
                        setItemUnitFactor(factor);
                        setTimeout(() => salesKeyboard.focusField("qty"), 0);
                      }}
                      disabled={entryDisabled}
                      onKeyDown={(e) => salesKeyboard.handleKey(e, "unit")}
                    />
                  );
                })() : (
                  <button
                    ref={salesKeyboard.register("unit")}
                    type="button"
                    disabled
                    className="h-9 w-full rounded-md border bg-muted/40 text-xs text-muted-foreground"
                  >
                    Unit
                  </button>
                )}
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground mb-0.5 block">Qty</Label>
                <Input ref={salesKeyboard.register("qty")} type="number" id="sale-qty" min={0} step="any" value={itemQuantity}
                  onChange={e => setItemQuantity(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                  onKeyDown={(e) => salesKeyboard.handleKey(e, "qty")}
                  disabled={entryDisabled}
                  title={entryDisabled ? "Select an in-stock product first" : "Decimals allowed for measurable units (ml, g)."}
                  className="h-9" placeholder="1"
                />
              </div>
              {settings.show_free_qty_column && (
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block">Free</Label>
                  <Input ref={salesKeyboard.register("free")} type="number" min={0} step="any" value={itemFreeQty || ""}
                    onChange={e => setItemFreeQty(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                    onKeyDown={(e) => salesKeyboard.handleKey(e, "free")}
                    disabled={entryDisabled}
                    className="h-9" placeholder="0"
                  />
                </div>
              )}
              <div>
                <Label className="text-[10px] text-muted-foreground mb-0.5 block">Rate ₹</Label>
                <Input ref={salesKeyboard.register("rate")} type="number" min={0} step={0.01} value={itemRate || ""}
                  onChange={e => setItemRate(parseFloat(e.target.value) || 0)}
                  onKeyDown={(e) => salesKeyboard.handleKey(e, "rate")}
                  disabled={entryDisabled}
                  className="h-9" placeholder="0.00"
                />
              </div>
              {(settings.discount_mode === "percentage" || settings.discount_mode === "both") && (
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block">Disc%</Label>
                  <Input ref={salesKeyboard.register("discount")} type="number" min={0} max={maxDiscountAllowed} step={0.1} value={itemDiscount || ""}
                    onChange={e => setItemDiscount(Math.min(parseFloat(e.target.value) || 0, maxDiscountAllowed))}
                    onKeyDown={(e) => salesKeyboard.handleKey(e, "discount")}
                    disabled={entryDisabled}
                    className="h-9" placeholder="0"
                  />
                </div>
              )}
                  </>
                );
              })()}
                <div className="flex flex-col justify-end">
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block invisible">Action</Label>
                  <div className="flex gap-1">
                  {selectedProduct && (() => {
                    const p = products?.find(pp => pp.id === selectedProduct);
                    const baseUnit = (p?.base_unit || p?.unit || "pcs").toLowerCase();
                    return (
                      <UnitSelector
                        companyId={companyId}
                        productId={selectedProduct}
                        baseUnit={baseUnit}
                        batchId={selectedBatchId}
                        value={itemUnit || baseUnit}
                        onChange={(unit, factor) => {
                          setItemUnit(unit);
                          setItemUnitFactor(factor);
                          // Auto-recompute the displayed rate from the captured base rate.
                          // e.g. base ₹70/tablet × 15 tablets/strip = ₹1050/strip
                          const newRate = +(itemBaseRate * factor).toFixed(2);
                          setItemRate(newRate);
                        }}
                      />
                    );
                  })()}
                    {selectedProduct && batchesForProduct.length > 0 && (
                    <BatchSelector
                      ref={(node) => {
                        fefoSelectorRef.current = node;
                        salesKeyboard.register("fefo")(node);
                      }}
                      batches={batchesForProduct}
                      selectedBatchId={selectedBatchId}
                      existingCartQuantities={existingCartQuantities}
                      onSelect={(batchId) => {
                        setSelectedBatchId(batchId);
                        setTimeout(() => salesKeyboard.focusField("add"), 0);
                      }}
                      onKeyDown={(e) => salesKeyboard.handleKey(e, "fefo")}
                    />
                  )}
                  {selectedProduct && (() => {
                    // availableStock is in BASE units. Convert to display unit using factor.
                    const factor = itemUnitFactor > 0 ? itemUnitFactor : 1;
                    const availInUnit = Math.floor(availableStock / factor);
                    const usingNow = (itemQuantity || 0) + (itemFreeQty || 0);
                    const projected = availInUnit - usingNow;
                    const isNeg = projected < 0;
                    const p = products?.find(pp => pp.id === selectedProduct);
                    const baseUnit = (p?.base_unit || p?.unit || "pcs").toLowerCase();
                    const displayUnit = (itemUnit || baseUnit).toLowerCase();
                    return (
                      <Badge variant={availInUnit > 0 && !isNeg ? "outline" : "destructive"} className="self-center text-[10px] whitespace-nowrap px-1.5 capitalize" title={`${availableStock} ${baseUnit} in stock`}>
                        {availInUnit <= 0 ? (settings.allow_negative_stock ? "0 (override)" : "Out of stock") : `${projected}/${availInUnit} ${displayUnit}`}
                      </Badge>
                    );
                  })()}
                <Button ref={salesKeyboard.register("add")} onKeyDown={(e) => salesKeyboard.handleKey(e, "add")} onClick={handleAddToCart} className="h-9 flex-1" disabled={!selectedProduct || itemQuantity <= 0 || (availableStock === 0 && !settings.allow_negative_stock)} size="sm" data-enter-nav-include="true">
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
      <CustomerFormDialog
        open={showCustomerDialog}
        onOpenChange={(o) => { setShowCustomerDialog(o); if (!o) { setCustomerCreateSeed({}); setEditingCustomer(null); } }}
        editingCustomer={editingCustomer}
        initialData={customerCreateSeed}
        onSuccess={(customerId) => {
          queryClient.invalidateQueries({ queryKey: ["customers-for-sale"] });
          queryClient.invalidateQueries({ queryKey: ["customers"] });
          // Refresh the active customer's fields with the latest record
          supabase.from("customers").select("id, name, phone, address, gst_number").eq("id", customerId).single().then(({ data }) => {
            if (data) {
              setSelectedCustomerId(data.id);
              setCustomerName(data.name);
              setCustomerPhone(data.phone || "");
              setCustomerAddress(data.address || "");
              setCustomerGstin(data.gst_number || "");
              setShowCustomerDialog(false);
              setCustomerCreateSeed({});
              setEditingCustomer(null);
              setTimeout(() => productSearchRef.current?.focus(), 100);
            }
          });
        }}
      />
      <CustomerHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        customerId={selectedCustomerId}
        customerName={customerName}
        companyId={companyId}
        onRepeatItem={handleRepeatItem}
      />
    </div>
  );
}

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useDraftSave } from "@/hooks/useDraftSave";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useInvoiceSettings } from "@/hooks/useInvoiceSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, Receipt, CreditCard, Banknote, PlusCircle, AlertTriangle, Pencil, Printer, FileText, FileSpreadsheet, Download, ChevronDown, Loader2, RotateCcw, UserPlus, Check, ChevronsUpDown, Zap } from "lucide-react";
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
import { useEnterNavigation, advanceToNextField } from "@/hooks/useEnterNavigation";
import { useModuleFocus } from "@/contexts/FocusContext";
import { CustomerFormDialog } from "@/components/forms/CustomerFormDialog";
import { QuickTextEntry } from "@/components/QuickTextEntry";
import { downloadConfigurableInvoiceHTML, type InvoiceTemplateData } from "@/utils/invoiceTemplate";
import { downloadBillCSV, type BillData } from "@/utils/billGenerator";
import { SalesItemsTable, type CartItem } from "@/components/billing/SalesItemsTable";

interface ExtendedCartItem extends CartItem {
  drug_schedule: string;
}
import { BillingTotals } from "@/components/billing/BillingTotals";
import type { Tables } from "@/integrations/supabase/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type SalesOrder = Tables<"sales_orders">;
type Product = Tables<"products">;
type InventoryBatch = Tables<"inventory_batches">;

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number?: string | null;
}

// ── Multi-customer support (up to 9 simultaneous counters) ──
interface CustomerSlot {
  id: number;
  cart: ExtendedCartItem[];
  paymentMethod: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerGstin: string;
  selectedCustomerId: string | null;
  prescriptionNumber: string;
  notes: string;
  freightCharges: number;
  handlingCharges: number;
  deliveryCharges: number;
  otherCharges: number;
  billDiscountPercent: number;
  billDiscountFlat: number;
  invoiceNumber: string;
  narcoticInfo: NarcoticInfo;
}

interface NarcoticInfo {
  prescription_number: string;
  doctor_name: string;
  doctor_registration_number: string;
  patient_name: string;
}

const MAX_CUSTOMERS = 9;
const makeSlot = (id: number): CustomerSlot => ({
  id,
  cart: [] as ExtendedCartItem[],
  paymentMethod: "cash",
  customerName: "",
  customerPhone: "",
  customerAddress: "",
  customerGstin: "",
  selectedCustomerId: null,
  prescriptionNumber: "",
  notes: "",
  freightCharges: 0,
  handlingCharges: 0,
  deliveryCharges: 0,
  otherCharges: 0,
  billDiscountPercent: 0,
  billDiscountFlat: 0,
  invoiceNumber: "",
  narcoticInfo: {
    prescription_number: "",
    doctor_name: "",
    doctor_registration_number: "",
    patient_name: "",
  },
});

export default function CounterSales() {
  const { toast } = useToast();
  const { user } = useAuth();
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

  // Multi-slot state
  const [slots, setSlots] = useState<CustomerSlot[]>([makeSlot(1)]);
  const [activeSlot, setActiveSlot] = useState(1);
  const [multiMode, setMultiMode] = useState(true);

  // Derived: current slot's data
  const currentSlotData = slots.find(s => s.id === activeSlot) ?? slots[0];
  const cart = currentSlotData.cart;
  const paymentMethod = currentSlotData.paymentMethod;
  const customerName = currentSlotData.customerName;
  const customerPhone = currentSlotData.customerPhone;
  const customerAddress = currentSlotData.customerAddress;
  const customerGstin = currentSlotData.customerGstin;
  const selectedCustomerId = currentSlotData.selectedCustomerId;
  const prescriptionNumber = currentSlotData.prescriptionNumber;
  const notes = currentSlotData.notes;
  const freightCharges = currentSlotData.freightCharges;
  const handlingCharges = currentSlotData.handlingCharges;
  const deliveryCharges = currentSlotData.deliveryCharges;
  const otherCharges = currentSlotData.otherCharges;
  const billDiscountPercent = currentSlotData.billDiscountPercent;
  const billDiscountFlat = currentSlotData.billDiscountFlat;
  const invoiceNumber = currentSlotData.invoiceNumber;
  const narcoticInfo = currentSlotData.narcoticInfo;

  const setCart = (updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, cart: typeof updater === "function" ? updater(s.cart) : updater } : s));
  };
  const setPaymentMethod = (val: string) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, paymentMethod: val } : s));
  };
  const setCustomerName = (val: string) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, customerName: val } : s));
  };
  const setCustomerPhone = (val: string) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, customerPhone: val } : s));
  };
  const setCustomerAddress = (val: string) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, customerAddress: val } : s));
  };
  const setCustomerGstin = (val: string) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, customerGstin: val } : s));
  };
  const setSelectedCustomerId = (val: string | null) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, selectedCustomerId: val } : s));
  };
  const setPrescriptionNumber = (val: string) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, prescriptionNumber: val } : s));
  };
  const setNotes = (val: string) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, notes: val } : s));
  };
  const setFreightCharges = (val: number) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, freightCharges: val } : s));
  };
  const setHandlingCharges = (val: number) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, handlingCharges: val } : s));
  };
  const setDeliveryCharges = (val: number) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, deliveryCharges: val } : s));
  };
  const setOtherCharges = (val: number) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, otherCharges: val } : s));
  };
  const setBillDiscountPercent = (val: number) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, billDiscountPercent: val } : s));
  };
  const setBillDiscountFlat = (val: number) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, billDiscountFlat: val } : s));
  };
  const setInvoiceNumber = (val: string) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, invoiceNumber: val } : s));
  };
  const setNarcoticInfo = (val: NarcoticInfo) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, narcoticInfo: val } : s));
  };

  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemDiscount, setItemDiscount] = useState<number>(0);
  const [itemDiscountFlat, setItemDiscountFlat] = useState<number>(0);
  const [itemFreeQty, setItemFreeQty] = useState<number>(0);
  const [itemRate, setItemRate] = useState<number>(0);
  const [noGstBill, setNoGstBill] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);

  // Narcotic info for scheduled drugs
  const [showNarcoticForm, setShowNarcoticForm] = useState(false);
  const [pendingNarcoticProduct, setPendingNarcoticProduct] = useState<string | null>(null);

  // Draft save for the entire multi-slot state
  const { clearDraft } = useDraftSave("draft-counter-sales", { slots, activeSlot, multiMode }, (draft) => {
    setSlots(draft.slots);
    setActiveSlot(draft.activeSlot);
    setMultiMode(draft.multiMode);
    setDraftRestored(true);
  });

  // Module focus
  useModuleFocus("counter-sales");

  // Keyboard shortcuts
  useKeyboardShortcut("Alt+A", () => {
    // Focus product search - Alt+A for counter sales access
    focusProductSearch();
  });

  // Add new customer slot
  const addCustomerSlot = useCallback(() => {
    if (slots.length >= MAX_CUSTOMERS) return;
    const nextId = Math.max(...slots.map(s => s.id)) + 1;
    setSlots(prev => [...prev, makeSlot(nextId)]);
    setActiveSlot(nextId);
    focusProductSearch();
  }, [slots, focusProductSearch]);

  // Remove customer slot
  const removeCustomerSlot = useCallback((id: number) => {
    if (slots.length <= 1) { setCart([]); return; }
    const remaining = slots.filter(s => s.id !== id);
    setSlots(remaining);
    if (activeSlot === id) setActiveSlot(remaining[remaining.length - 1].id);
  }, [slots, activeSlot, setCart]);

  // Keyboard navigation for slots
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && multiMode && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const slotNum = parseInt(e.key);
        const target = slots.find(s => s.id === slotNum);
        if (target) {
          setActiveSlot(slotNum);
          focusProductSearch();
        }
      }
      if (e.key.toLowerCase() === "n" && !multiMode) {
        e.preventDefault();
        addCustomerSlot();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [multiMode, slots, focusProductSearch, addCustomerSlot]);

  // Queries
  const { data: products } = useQuery({
    queryKey: ["products-for-counter-sales", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!companyId,
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-for-counter-sales", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email, address, gst_number")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!companyId,
  });

  const { data: allBatches } = useQuery({
    queryKey: ["batches-for-counter-sales", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_batches")
        .select("*")
        .eq("company_id", companyId!)
        .gt("quantity", 0);
      if (error) throw error;
      return data as InventoryBatch[];
    },
    enabled: !!companyId,
  });

  // Available stock calculation
  const availableStock = useMemo(() => {
    if (!selectedProduct || !allBatches) return 0;
    return getTotalAvailableStock(selectedProduct, allBatches);
  }, [selectedProduct, allBatches]);

  // Check if cart has any scheduled drugs
  const hasScheduledDrugs = useMemo(() => {
    return cart.some(item => item.drug_schedule !== "none");
  }, [cart]);

  // Cart calculations
  const itemsGrossTotal = useMemo(() => cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0), [cart]);
  const totalItemDiscount = useMemo(() => cart.reduce((sum, item) => sum + (item.unit_price * item.quantity * item.discount_percentage / 100) + item.discount_flat, 0), [cart]);
  const itemsSubtotal = itemsGrossTotal - totalItemDiscount;
  const totalGst = useMemo(() => {
    const taxable = gstInclusive ? itemsSubtotal : itemsSubtotal;
    return cart.reduce((sum, item) => {
      const gstPct = item.gst_percentage || 0;
      const itemTotal = item.unit_price * item.quantity - (item.unit_price * item.quantity * item.discount_percentage / 100) - item.discount_flat;
      return sum + (gstInclusive ? itemTotal - itemTotal / (1 + gstPct / 100) : itemTotal * gstPct / 100);
    }, 0);
  }, [cart, gstInclusive]);
  const totalCharges = freightCharges + handlingCharges + deliveryCharges + otherCharges;
  const billDiscountAmount = (itemsSubtotal + (gstInclusive ? 0 : totalGst)) * billDiscountPercent / 100 + billDiscountFlat;
  const grandTotal = itemsSubtotal + (gstInclusive ? 0 : totalGst) + totalCharges - billDiscountAmount;

  // Enter navigation
  const saleEnterNav = useEnterNavigation();

  // Handle adding to cart
  const handleAddToCart = useCallback(() => {
    if (!selectedProduct || itemQuantity <= 0 || (availableStock === 0 && !settings.allow_negative_stock)) return;

    const product = products?.find(p => p.id === selectedProduct);
    if (!product) return;

    // Check if it's a scheduled drug and needs prescription info
    if (product.drug_schedule !== "none") {
      // For narcotics, require prescription info
      if (!narcoticInfo.prescription_number || !narcoticInfo.doctor_name || !narcoticInfo.patient_name) {
        setPendingNarcoticProduct(selectedProduct);
        setShowNarcoticForm(true);
        return;
      }
    }

    const batches = (allBatches || []).filter(b => b.product_id === selectedProduct);
    if (batches.length === 0) {
      toast({ title: "No inventory batches found", description: "Cannot add product without inventory batches.", variant: "destructive" });
      return;
    }

    const gstPct = noGstBill ? 0 : (product.gst_percentage || 0);
    const allocated = allocateBatchesFIFO(batches, itemQuantity);

    if (allocated.length === 0) {
      toast({ title: "Allocation failed", description: "Could not allocate inventory for this quantity.", variant: "destructive" });
      return;
    }

    const totalAllocated = allocated.reduce((sum, a) => sum + a.quantity, 0);
    if (totalAllocated < itemQuantity && !settings.allow_negative_stock) {
      toast({ title: "Insufficient stock", description: `Only ${totalAllocated} units available.`, variant: "destructive" });
      return;
    }

    const afterDiscount = itemRate * itemQuantity - itemDiscountFlat;
    const totalPrice = gstInclusive ? afterDiscount : afterDiscount + afterDiscount * gstPct / 100;

    const newItem: ExtendedCartItem = {
      product_id: selectedProduct,
      batch_id: allocated[0].batch_id, // Primary batch
      product_name: product.name,
      batch_number: allocated[0].batch.batch_number || "",
      hsn_code: product.hsn_code || "",
      quantity: itemQuantity,
      free_quantity: itemFreeQty,
      unit_price: itemRate,
      gst_percentage: gstPct,
      discount_percentage: itemDiscount,
      discount_flat: itemDiscountFlat,
      total_price: totalPrice,
      max_quantity: availableStock,
      expiry_date: allocated[0].batch.expiry_date || "",
      drug_schedule: product.drug_schedule || "none",
    };

    setCart(prev => [...prev, newItem]);
    setSelectedProduct("");
    setItemQuantity(1);
    setItemDiscount(0);
    setItemDiscountFlat(0);
    setItemFreeQty(0);
    setItemRate(0);
    focusProductSearch();
  }, [selectedProduct, itemQuantity, itemRate, itemDiscount, itemDiscountFlat, itemFreeQty, products, allBatches, availableStock, settings.allow_negative_stock, noGstBill, gstInclusive, toast, setCart, focusProductSearch, narcoticInfo]);

  // Handle narcotic form confirmation
  const handleNarcoticConfirm = useCallback(() => {
    if (!pendingNarcoticProduct) return;
    if (!narcoticInfo.prescription_number || !narcoticInfo.doctor_name || !narcoticInfo.patient_name) {
      toast({ title: "Required fields missing", description: "Please fill all required prescription fields.", variant: "destructive" });
      return;
    }
    setShowNarcoticForm(false);
    setPendingNarcoticProduct(null);
    // Re-trigger add to cart
    const product = products?.find(p => p.id === pendingNarcoticProduct);
    if (product) {
      // Set selected product and trigger add
      setSelectedProduct(pendingNarcoticProduct);
      setTimeout(() => {
        const addBtn = document.getElementById("sale-submit-btn") as HTMLButtonElement;
        if (addBtn) addBtn.click();
      }, 100);
    }
  }, [pendingNarcoticProduct, narcoticInfo, toast, products]);

  // Update cart item
  const updateCartItem = useCallback((index: number, field: keyof CartItem, value: string | number) => {
    setCart(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };

      if (field === "quantity" || field === "unit_price" || field === "discount_percentage" || field === "discount_flat") {
        const qty = field === "quantity" ? Number(value) : item.quantity;
        const price = field === "unit_price" ? Number(value) : item.unit_price;
        const discPct = field === "discount_percentage" ? Number(value) : item.discount_percentage;
        const discFlat = field === "discount_flat" ? Number(value) : item.discount_flat;
        const gstPct = item.gst_percentage;

        const afterDiscount = price * qty - discFlat;
        updated.total_price = gstInclusive ? afterDiscount : afterDiscount + afterDiscount * gstPct / 100;
      }

      return updated;
    }));
  }, [setCart, gstInclusive]);

  // Remove from cart
  const removeFromCart = useCallback((index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  }, [setCart]);

  // Quick text entry
  const handleQuickTextItems = useCallback((items: CartItem[]) => {
    setCart(prev => [...prev, ...items]);
  }, [setCart]);

  // Handle reset
  const handleReset = useCallback(() => {
    setCart([]);
    setPaymentMethod("cash");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setCustomerGstin("");
    setSelectedCustomerId(null);
    setPrescriptionNumber("");
    setNotes("");
    setFreightCharges(0);
    setHandlingCharges(0);
    setDeliveryCharges(0);
    setOtherCharges(0);
    setBillDiscountPercent(0);
    setBillDiscountFlat(0);
    setInvoiceNumber("");
    setNoGstBill(false);
    clearDraft();
    setDraftRestored(false);
    focusProductSearch();
  }, [setCart, setPaymentMethod, setCustomerName, setCustomerPhone, setCustomerAddress, setCustomerGstin, setSelectedCustomerId, setPrescriptionNumber, setNotes, setFreightCharges, setHandlingCharges, setDeliveryCharges, setOtherCharges, setBillDiscountPercent, setBillDiscountFlat, setInvoiceNumber, clearDraft, focusProductSearch]);

  // Create sale mutation
  const createSaleMutation = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Cart is empty");

      // Generate invoice number if not provided
      let finalInvoiceNumber = invoiceNumber;
      if (!finalInvoiceNumber) {
        const { data: lastOrder } = await supabase
          .from("sales_orders")
          .select("invoice_number")
          .eq("company_id", companyId!)
          .order("created_at", { ascending: false })
          .limit(1);
        const lastNum = lastOrder?.[0]?.invoice_number ? parseInt(lastOrder[0].invoice_number.replace(/\D/g, "")) : 0;
        finalInvoiceNumber = `INV-${String(lastNum + 1).padStart(4, "0")}`;
      }

      // Use default customer name if none provided
      const finalCustomerName = customerName || settings.default_customer_name || "Counter Sale";

      const saleData = {
        company_id: companyId!,
        customer_name: finalCustomerName,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        customer_gstin: customerGstin,
        invoice_number: finalInvoiceNumber,
        prescription_number: prescriptionNumber,
        payment_method: paymentMethod,
        notes,
        freight_charges: freightCharges,
        handling_charges: handlingCharges,
        delivery_charges: deliveryCharges,
        other_charges: otherCharges,
        bill_discount_percent: billDiscountPercent,
        bill_discount_flat: billDiscountFlat,
        total_amount: grandTotal,
        gst_inclusive: gstInclusive,
        no_gst_bill: noGstBill,
        items: cart.map(item => ({
          product_id: item.product_id,
          batch_id: item.batch_id,
          quantity: item.quantity,
          free_quantity: item.free_quantity,
          unit_price: item.unit_price,
          gst_percentage: item.gst_percentage,
          discount_percentage: item.discount_percentage,
          discount_flat: item.discount_flat,
        })),
        prescription_number: hasScheduledDrugs ? narcoticInfo.prescription_number : null,
      };

      const { data, error } = await supabase
        .from("sales_orders")
        .insert(saleData)
        .select()
        .single();

      if (error) throw error;
      return data as SalesOrder;
    },
    onSuccess: (order) => {
      // Record scheduled drug transactions
      const scheduledItems = cart.filter(item => item.drug_schedule !== "none");
      if (scheduledItems.length > 0) {
        supabase
          .from("scheduled_drug_register")
          .insert(
            scheduledItems.map(item => ({
              product_id: item.product_id,
              batch_id: item.batch_id,
              transaction_type: "sale",
              quantity: item.quantity,
              prescription_number: narcoticInfo.prescription_number,
              doctor_name: narcoticInfo.doctor_name,
              doctor_registration_number: narcoticInfo.doctor_registration_number,
              patient_name: narcoticInfo.patient_name,
              invoice_number: order.invoice_number,
              company_id: companyId!,
            }))
          )
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["scheduled-drug-register"] });
          });
      }

      toast({ title: "Sale completed", description: `Invoice ${order.invoice_number} created successfully.` });
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });

      // Open printable invoice in new tab
      const tplData: InvoiceTemplateData = {
        type: "sale",
        invoice_number: order.invoice_number,
        date: order.sale_date,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone || undefined,
        customer_address: order.customer_address || undefined,
        customer_gstin: (order as any).customer_gstin || undefined,
        items: cart.map(item => ({
          product_name: item.product_name,
          batch_number: item.batch_number,
          hsn_code: item.hsn_code,
          quantity: item.quantity,
          free_quantity: item.free_quantity || 0,
          unit_price: item.unit_price,
          gst_percentage: item.gst_percentage,
          discount_percentage: item.discount_percentage,
          discount_flat: item.discount_flat || 0,
          total_price: item.total_price,
        })),
        subtotal: itemsGrossTotal - totalItemDiscount,
        gst_amount: totalGst,
        discount_amount: billDiscountAmount,
        freight_charges: freightCharges,
        handling_charges: handlingCharges,
        delivery_charges: deliveryCharges,
        other_charges: otherCharges,
        total_amount: grandTotal,
        payment_method: paymentMethod,
        notes,
        gstInclusive,
      };

      // Open printable invoice in new tab
      downloadConfigurableInvoiceHTML(tplData, settings);

      // Stay on the page - don't reset automatically
      // User can manually start new sale when ready
    },
    onError: (error) => {
      toast({ title: "Sale failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Counter Sales</h2>
          <p className="text-muted-foreground">Fast billing for walk-in customers</p>
        </div>
        <Button
          variant={multiMode ? "default" : "outline"}
          onClick={() => { setMultiMode(!multiMode); }}
          className="gap-2"
        >
          <Zap className="h-4 w-4" />
          {multiMode ? "Multi-counter" : "Single counter"}
          <Badge variant="secondary" className="text-[10px] px-1 py-0">{slots.length}</Badge>
        </Button>
      </div>

      {draftRestored && (
        <div className="flex items-center gap-3 rounded-md border bg-muted px-4 py-2 text-sm">
          <span>💾</span>
          <span className="flex-1 font-medium">Draft restored</span>
          <button onClick={handleReset} className="text-xs underline opacity-70 hover:opacity-100">Discard</button>
        </div>
      )}

      {/* Multi-customer slots display */}
      {multiMode && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {slots.map((slot, i) => (
            <Card
              key={slot.id}
              className={`cursor-pointer transition-colors min-w-[200px] ${
                activeSlot === slot.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
              }`}
              onClick={() => setActiveSlot(slot.id)}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={activeSlot === slot.id ? "default" : "secondary"} className="text-[10px]">
                      Counter {slot.id}
                    </Badge>
                    {slot.cart.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {slot.cart.length} items
                      </Badge>
                    )}
                  </div>
                  {slots.length > 1 && activeSlot === slot.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); removeCustomerSlot(slot.id); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {slot.customerName || "No customer"}
                </div>
                {slot.cart.length > 0 && (
                  <div className="text-sm font-medium mt-1">
                    ₹{slot.cart.reduce((sum, item) => sum + item.total_price, 0).toFixed(2)}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {slots.length < MAX_CUSTOMERS && (
            <Card className="cursor-pointer border-dashed border-2 hover:bg-muted min-w-[200px]" onClick={addCustomerSlot}>
              <CardContent className="p-3 flex items-center justify-center">
                <div className="text-center">
                  <Plus className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                  <div className="text-xs text-muted-foreground">Add Counter</div>
                  <div className="text-[10px] text-muted-foreground">Ctrl+N</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Customer & Invoice info — compact bar */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px]">Invoice #</Label>
          <Input
            ref={invoiceNumberRef}
            value={invoiceNumber}
            onChange={e => setInvoiceNumber(e.target.value)}
            placeholder="Auto-generated"
            className="h-8 text-sm"
          />
        </div>
        <div className="md:col-span-2 space-y-1">
          <Label className="text-[11px]">Customer (Optional)</Label>
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
                  {selectedCustomerId ? customers?.find(c => c.id === selectedCustomerId)?.name || customerName : customerName || "Walk-in customer..."}
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
                          focusProductSearch();
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
                    const p = products?.find(pp => pp.id === v);
                    if (p) setItemRate(p.sale_price && Number(p.sale_price) > 0 ? Number(p.sale_price) : Number(p.mrp));
                    const productBatches = (allBatches || []).filter(b => b.product_id === v);
                    const stock = productBatches.reduce((sum, b) => sum + (b.quantity || 0), 0);
                    if (stock <= 0 && !settings.allow_negative_stock) {
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
              {selectedProduct && (
                <Badge variant={availableStock > 0 ? "outline" : "destructive"} className="self-center text-[10px] whitespace-nowrap px-1.5">
                  {availableStock > 0 ? `${availableStock}` : (settings.allow_negative_stock ? "0 (override)" : "Out of stock")}
                </Badge>
              )}
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
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleReset}
                className="flex-1"
                disabled={createSaleMutation.isPending}
              >
                New Sale
              </Button>
              <Button
                id="sale-submit-btn"
                className="flex-1 gap-2"
                onClick={() => {
                  if (!createSaleMutation.isPending && cart.length > 0) {
                    createSaleMutation.mutate();
                  }
                }}
                disabled={cart.length === 0 || createSaleMutation.isPending}
                data-enter-nav-include="true"
              >
                {createSaleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Complete & Print (₹{grandTotal.toFixed(2)})
              </Button>
            </div>
          </div>
        </div>
      )}

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
                  onChange={(e) => setNarcoticInfo({ ...narcoticInfo, prescription_number: e.target.value })}
                  placeholder="RX123456"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Patient Name *</Label>
                <Input
                  value={narcoticInfo.patient_name}
                  onChange={(e) => setNarcoticInfo({ ...narcoticInfo, patient_name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Doctor Name *</Label>
                <Input
                  value={narcoticInfo.doctor_name}
                  onChange={(e) => setNarcoticInfo({ ...narcoticInfo, doctor_name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Doctor Reg. #</Label>
                <Input
                  value={narcoticInfo.doctor_registration_number}
                  onChange={(e) => setNarcoticInfo({ ...narcoticInfo, doctor_registration_number: e.target.value })}
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

      {/* Dialogs */}
      <CustomerFormDialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog} />
      <ProductFormDialog open={showProductDialog} onOpenChange={setShowProductDialog} />
    </div>
  );
}
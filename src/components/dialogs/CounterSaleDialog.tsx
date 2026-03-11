import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trash2, AlertTriangle, Printer, Zap, Search, User, UserPlus, X } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { allocateBatchesFIFO, getTotalAvailableStock } from "@/utils/fifoAllocation";
import { printBill, type BillData } from "@/utils/billGenerator";
import type { Tables } from "@/integrations/supabase/types";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type Product = Tables<"products">;
type InventoryBatch = Tables<"inventory_batches">;

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

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

// ── Multi-customer support (up to 9 simultaneous counters) ──
interface CustomerSlot {
  id: number;
  cart: CartItem[];
  paymentMethod: string;
  customer: Customer | null;
}

const MAX_CUSTOMERS = 9;
const makeSlot = (id: number): CustomerSlot => ({ id, cart: [], paymentMethod: "cash", customer: null });

export function CounterSaleDialog({ open, onOpenChange }: CounterSaleDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId, gstInclusive } = useBusiness();
  const queryClient = useQueryClient();
  
  const productSearchRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const discountInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const completeButtonRef = useRef<HTMLButtonElement>(null);

  // Multi-customer state
  const [slots, setSlots] = useState<CustomerSlot[]>([makeSlot(1)]);
  const [activeSlot, setActiveSlot] = useState(1);
  const [multiMode, setMultiMode] = useState(false);

  // Derived: current slot's cart
  const currentSlotData = slots.find(s => s.id === activeSlot) ?? slots[0];
  const cart = currentSlotData.cart;
  const paymentMethod = currentSlotData.paymentMethod;

  const setCart = (updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, cart: typeof updater === "function" ? updater(s.cart) : updater } : s));
  };
  const setPaymentMethod = (val: string) => {
    setSlots(prev => prev.map(s => s.id === activeSlot ? { ...s, paymentMethod: val } : s));
  };
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [productSearch, setProductSearch] = useState("");
  const [productPopoverOpen, setProductPopoverOpen] = useState(false);
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemDiscount, setItemDiscount] = useState<number>(0);
  // paymentMethod / setPaymentMethod are derived from multi-slot state above
  
  // Customer state
  const [showCustomerSection, setShowCustomerSection] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", address: "" });
  const [isAddingNewCustomer, setIsAddingNewCustomer] = useState(false);
  
  // Narcotic info for scheduled drugs
  const [narcoticInfo, setNarcoticInfo] = useState<NarcoticInfo>({
    prescription_number: "",
    doctor_name: "",
    doctor_registration_number: "",
    patient_name: "",
  });
  const [showNarcoticForm, setShowNarcoticForm] = useState(false);
  const [pendingNarcoticProduct, setPendingNarcoticProduct] = useState<string | null>(null);

  // Auto-open popover and focus product search when dialog opens
  useEffect(() => {
    if (open) {
      // Open the product popover automatically
      setProductPopoverOpen(true);
      // Focus the search input after popover opens
      setTimeout(() => productSearchRef.current?.focus(), 150);
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

  // Fetch customers for search
  const { data: customers } = useQuery({
    queryKey: ["customers-for-sale"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email, address")
        .order("name");
      if (error) throw error;
      return data as Customer[];
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

  // Create new customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: async (customer: { name: string; phone: string; address: string }) => {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          name: customer.name,
          phone: customer.phone || null,
          address: customer.address || null,
          company_id: companyId,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["customers-for-sale"] });
      setSelectedCustomer(data as Customer);
      setIsAddingNewCustomer(false);
      setNewCustomer({ name: "", phone: "", address: "" });
      toast({ title: "Customer added", description: `${data.name} saved successfully` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createCounterSaleMutation = useMutation({
    mutationFn: async () => {
      const invoiceNumber = `CS-${Date.now()}`;
      
      // Calculate totals
      const itemsSubtotal = cart.reduce((sum, item) => {
        const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
        return sum + basePrice;
      }, 0);
      
      const gstAmount = gstInclusive
        ? cart.reduce((sum, item) => {
            const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
            return sum + (basePrice - basePrice / (1 + item.gst_percentage / 100));
          }, 0)
        : cart.reduce((sum, item) => {
            const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
            return sum + (basePrice * item.gst_percentage / 100);
          }, 0);
      
      const discountAmount = cart.reduce((sum, item) => {
        return sum + (item.unit_price * item.quantity * item.discount_percentage / 100);
      }, 0);

      const totalAmount = gstInclusive ? itemsSubtotal : itemsSubtotal + gstAmount;

      // Create sales order with customer info if provided
      const customerName = selectedCustomer?.name || "Counter Sale";
      const { data: order, error: orderError } = await supabase
        .from("sales_orders")
        .insert({
          invoice_number: invoiceNumber,
          customer_name: customerName,
          customer_phone: selectedCustomer?.phone || null,
          customer_address: selectedCustomer?.address || null,
          customer_id: selectedCustomer?.id || null,
          payment_method: paymentMethod,
          total_amount: totalAmount,
          gst_amount: gstAmount,
          discount_amount: discountAmount,
          created_by: user?.id,
          status: "confirmed",
          prescription_number: hasScheduledDrugs ? narcoticInfo.prescription_number : null,
          company_id: companyId,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Update customer total purchases if customer selected
      if (selectedCustomer?.id) {
        await supabase
          .from("customers")
          .update({ total_purchases: (selectedCustomer as any).total_purchases + totalAmount })
          .eq("id", selectedCustomer.id);
      }

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
        company_id: companyId,
      }));

      const { error: itemsError } = await supabase
        .from("sales_order_items")
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Atomically deduct batch quantities (sold qty + free qty) using DB function
      for (const item of cart) {
        const totalDeducted = item.quantity;
        const { error: deductError } = await supabase.rpc("deduct_batch_quantity", {
          _batch_id: item.batch_id,
          _quantity: totalDeducted,
        });
        if (deductError) throw new Error(deductError.message);
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
              company_id: companyId,
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
        customer_name: selectedCustomer?.name || "Counter Sale",
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

  // Add a new customer slot (up to MAX_CUSTOMERS)
  const addSlot = () => {
    if (slots.length >= MAX_CUSTOMERS) return;
    const nextId = Math.max(...slots.map(s => s.id)) + 1;
    setSlots(prev => [...prev, makeSlot(nextId)]);
    setActiveSlot(nextId);
  };

  // Remove a slot (at least one must remain)
  const removeSlot = (id: number) => {
    if (slots.length <= 1) { setCart([]); return; }
    const remaining = slots.filter(s => s.id !== id);
    setSlots(remaining);
    if (activeSlot === id) setActiveSlot(remaining[remaining.length - 1].id);
  };

  const handleClose = () => {
    setSlots([makeSlot(1)]);
    setActiveSlot(1);
    setMultiMode(false);
    setSelectedProduct("");
    setProductSearch("");
    setProductPopoverOpen(false);
    setItemQuantity(1);
    setItemDiscount(0);
    setShowCustomerSection(false);
    setSelectedCustomer(null);
    setCustomerSearch("");
    setCustomerPopoverOpen(false);
    setNewCustomer({ name: "", phone: "", address: "" });
    setIsAddingNewCustomer(false);
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

  // ─────────────────────────────────────────────────────────────
  //  Global keyboard handler inside the dialog
  //  Ctrl+Enter → complete sale (from anywhere)
  //  Enter       → complete sale (when not in input/popover)
  //  C key       → cycle payment: cash→card→upi→cash
  //  Delete/Backspace (on cart row) → remove that item
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement;
      const inInput =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        activeEl?.getAttribute("contenteditable") === "true";

      // Ctrl+Enter always completes (like most POS software)
      if (e.key === "Enter" && e.ctrlKey) {
        if (cart.length > 0 && !createCounterSaleMutation.isPending && !showNarcoticForm) {
          e.preventDefault();
          createCounterSaleMutation.mutate();
        }
        return;
      }

      // Plain Enter completes when not in input/popover
      if (
        e.key === "Enter" &&
        cart.length > 0 &&
        !createCounterSaleMutation.isPending &&
        !productPopoverOpen &&
        !customerPopoverOpen &&
        !showNarcoticForm &&
        !isAddingNewCustomer &&
        !inInput
      ) {
        e.preventDefault();
        createCounterSaleMutation.mutate();
        return;
      }

      // 'C' cycles payment method when not in input
      if (e.key.toLowerCase() === "c" && !inInput && !productPopoverOpen && cart.length > 0) {
        e.preventDefault();
        setPaymentMethod(paymentMethod === "cash" ? "card" : paymentMethod === "card" ? "upi" : "cash");
        return;
      }

      // Del/Backspace on a focused cart row removes that item
      if ((e.key === "Delete" || e.key === "Backspace") && !inInput) {
        const rowEl = activeEl?.closest("[data-kb-cart-row]") as HTMLElement | null;
        if (rowEl) {
          const idx = parseInt(rowEl.dataset.kbCartIdx ?? "-1", 10);
          if (idx >= 0) {
            e.preventDefault();
            setCart((prev) => prev.filter((_, i) => i !== idx));
          }
        }
      }

      // Ctrl+1-9 → switch to customer slot (in multi-mode)
      if (e.ctrlKey && multiMode && /^[1-9]$/.test(e.key)) {
        const slotNum = parseInt(e.key, 10);
        const target = slots.find(s => s.id === slotNum);
        if (target) { e.preventDefault(); setActiveSlot(slotNum); }
        return;
      }

      // N key → new customer slot (in multi-mode, when not in input)
      if (e.key.toLowerCase() === "n" && !inInput && multiMode) {
        e.preventDefault();
        addSlot();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, cart, createCounterSaleMutation, productPopoverOpen, customerPopoverOpen, showNarcoticForm, isAddingNewCustomer, multiMode, slots, paymentMethod]);

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

    // Use sale_price if set, otherwise MRP
    const effectiveRate = product.sale_price && Number(product.sale_price) > 0 ? Number(product.sale_price) : 0;

    let newCart = [...cart];
    
    for (const allocation of allocationResult.allocations) {
      const unitPrice = effectiveRate > 0 ? effectiveRate : allocation.mrp;
      const existingIndex = newCart.findIndex((item) => item.batch_id === allocation.batch_id);
      
      if (existingIndex >= 0) {
        const newQuantity = newCart[existingIndex].quantity + allocation.quantity;
        newCart[existingIndex].quantity = newQuantity;
        newCart[existingIndex].total_price = calculateItemTotal(
          newCart[existingIndex].unit_price,
          newQuantity,
          gstPercentage,
          newCart[existingIndex].discount_percentage
        );
        newCart[existingIndex].max_quantity = allocation.available_quantity;
      } else {
        const totalPrice = calculateItemTotal(unitPrice, allocation.quantity, gstPercentage, itemDiscount);
        newCart.push({
          product_id: product.id,
          batch_id: allocation.batch_id,
          product_name: productName,
          batch_number: allocation.batch_number,
          hsn_code: hsnCode,
          quantity: allocation.quantity,
          unit_price: unitPrice,
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
    if (gstInclusive) return discountedPrice; // price already includes GST
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
  
  const totalGst = gstInclusive
    ? cart.reduce((sum, item) => {
        const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
        return sum + (basePrice - basePrice / (1 + item.gst_percentage / 100));
      }, 0)
    : cart.reduce((sum, item) => {
        const basePrice = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
        return sum + (basePrice * item.gst_percentage / 100);
      }, 0);
  
  const grandTotal = gstInclusive ? itemsSubtotal : itemsSubtotal + totalGst;

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header bar */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 backdrop-blur px-4 sm:px-6">
        <Zap className="h-5 w-5 text-primary shrink-0" />
        <span className="font-semibold text-base sm:text-lg">Quick Counter Sale</span>
        <Badge variant="outline" className="hidden sm:inline-flex">Alt+A</Badge>
        <div className="flex-1" />
        <Button
          variant={multiMode ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => { setMultiMode(!multiMode); }}
        >
          <span>Multi</span>
          <Badge variant="secondary" className="text-[10px] px-1 py-0">{slots.length}</Badge>
        </Button>
        <Button variant="ghost" size="icon" onClick={handleClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground px-4 sm:px-6 py-1.5 border-b bg-muted/30 shrink-0">
        {multiMode ? "Multi-customer mode — Ctrl+1-9 to switch, N to add new counter" : "Fast billing without customer details"}
      </p>

      {/* Scrollable main content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto space-y-4">

        {/* ── Multi-customer slot tabs ── */}
        {multiMode && (
          <div className="flex items-center gap-1 flex-wrap border-b pb-2">
            {slots.map((slot, i) => {
              const slotTotal = slot.cart.reduce((s, item) => {
                const base = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
                return s + base + base * item.gst_percentage / 100;
              }, 0);
              return (
                <button
                  key={slot.id}
                  onClick={() => setActiveSlot(slot.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                    activeSlot === slot.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 hover:bg-muted border-border"
                  }`}
                >
                  <span>Cust.{slot.id}</span>
                  {slot.cart.length > 0 && (
                    <span className={`text-[10px] ${activeSlot === slot.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                      ₹{slotTotal.toFixed(0)}
                    </span>
                  )}
                  {slots.length > 1 && activeSlot === slot.id && (
                    <span
                      className="ml-0.5 hover:text-destructive cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); removeSlot(slot.id); }}
                    >×</span>
                  )}
                </button>
              );
            })}
            {slots.length < MAX_CUSTOMERS && (
              <button
                onClick={addSlot}
                className="px-2 py-1 rounded-md text-xs border border-dashed border-muted-foreground/40 hover:border-primary hover:text-primary transition-colors"
                title="Add new customer (N)"
              >
                + Cust.{Math.max(...slots.map(s => s.id)) + 1}
              </button>
            )}
          </div>
        )}

        {/* ── Multi-customer totals summary bar ── */}
        {multiMode && slots.some(s => s.cart.length > 0) && (
          <div className="grid gap-1 text-[11px] bg-muted/40 rounded-lg p-2 border">
            <div className="font-semibold text-xs text-muted-foreground mb-1">All Customers Summary</div>
            <div className="flex flex-wrap gap-2">
              {slots.filter(s => s.cart.length > 0).map(slot => {
                const total = slot.cart.reduce((s, item) => {
                  const base = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
                  return s + base + base * item.gst_percentage / 100;
                }, 0);
                const itemCount = slot.cart.reduce((s, item) => s + item.quantity, 0);
                return (
                  <div
                    key={slot.id}
                    onClick={() => setActiveSlot(slot.id)}
                    className={`flex items-center gap-2 px-2.5 py-1 rounded border cursor-pointer transition-colors ${
                      activeSlot === slot.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                    }`}
                  >
                    <span className="font-medium">Cust.{slot.id}</span>
                    <span className="text-muted-foreground">{itemCount} items</span>
                    <span className="font-bold text-primary">₹{total.toFixed(2)}</span>
                    <span className="text-muted-foreground capitalize text-[10px]">{slot.paymentMethod}</span>
                  </div>
                );
              })}
              <div className="flex items-center gap-1 px-2.5 py-1 rounded bg-primary/20 border border-primary/30 ml-auto">
                <span className="font-semibold">Grand Total:</span>
                <span className="font-bold text-primary text-sm">
                  ₹{slots.reduce((sum, slot) => {
                    return sum + slot.cart.reduce((s, item) => {
                      const base = item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
                      return s + base + base * item.gst_percentage / 100;
                    }, 0);
                  }, 0).toFixed(2)}
                </span>
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

          {/* Fast Product Search - Mobile Responsive */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-12 sm:col-span-6">
              <Label className="text-xs flex items-center gap-1">
                Product
                <Badge variant="outline" className="text-xs px-1 py-0 ml-1 hidden sm:inline-flex">Type to search</Badge>
              </Label>
              <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={productPopoverOpen}
                    className="w-full justify-between font-normal h-10 sm:h-9"
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
                <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[400px] p-0" align="start">
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
                          .slice(0, 20)
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
                              className="flex items-center justify-between py-3 sm:py-2"
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="truncate">{product.name}</span>
                                {product.strength && <span className="text-muted-foreground text-xs hidden sm:inline">({product.strength})</span>}
                                {product.drug_schedule !== "none" && getScheduleBadge(product.drug_schedule)}
                              </div>
                              <div className="text-right ml-2">
                                <span className="text-sm font-mono text-muted-foreground">
                                  ₹{product.sale_price && Number(product.sale_price) > 0 ? product.sale_price : product.mrp}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="col-span-4 sm:col-span-2">
              <Label className="text-xs">Stock</Label>
              <div className="h-10 sm:h-9 px-3 py-2 bg-muted rounded-md flex items-center justify-center text-sm font-medium">
                {selectedProduct ? (
                  <span className={availableStock > 0 ? "text-green-600" : "text-destructive"}>
                    {availableStock}
                  </span>
                ) : "-"}
              </div>
            </div>
            <div className="col-span-4 sm:col-span-2">
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
                    // Re-focus product search for fast multi-item entry
                    setTimeout(() => {
                      setProductPopoverOpen(true);
                      setTimeout(() => productSearchRef.current?.focus(), 100);
                    }, 50);
                  } else if (e.key === "Tab" && !e.shiftKey) {
                    // Tab from Qty goes to Discount
                    e.preventDefault();
                    discountInputRef.current?.focus();
                  }
                }}
                className="h-10 sm:h-9"
              />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <Label className="text-xs">Disc %</Label>
              <Input
                ref={discountInputRef}
                type="number"
                min={0}
                max={100}
                value={itemDiscount || ""}
                onChange={(e) => setItemDiscount(parseFloat(e.target.value) || 0)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && selectedProduct && itemQuantity > 0) {
                    e.preventDefault();
                    handleAddToCart();
                    setTimeout(() => {
                      setProductPopoverOpen(true);
                      setTimeout(() => productSearchRef.current?.focus(), 100);
                    }, 50);
                  } else if (e.key === "Tab" && !e.shiftKey) {
                    e.preventDefault();
                    addButtonRef.current?.focus();
                  }
                }}
                className="h-10 sm:h-9"
                placeholder="0"
              />
            </div>
            <div className="col-span-4 sm:col-span-2 flex items-end">
              <Button
                ref={addButtonRef}
                onClick={() => {
                  handleAddToCart();
                  setTimeout(() => {
                    setProductPopoverOpen(true);
                    setTimeout(() => productSearchRef.current?.focus(), 100);
                  }, 50);
                }}
                disabled={!selectedProduct || itemQuantity <= 0}
                className="w-full gap-1 h-10 sm:h-9"
              >
                Add
                <Badge variant="secondary" className="text-xs px-1 py-0 hidden sm:inline-flex">↵</Badge>
              </Button>
            </div>
          </div>

          {/* Optional Customer Section */}
          <div className="flex items-center gap-2">
            <Button
              variant={showCustomerSection ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowCustomerSection(!showCustomerSection)}
              className="gap-2"
            >
              <User className="h-4 w-4" />
              {selectedCustomer ? selectedCustomer.name : "Add Customer"}
              {selectedCustomer && (
                <X 
                  className="h-3 w-3 ml-1 hover:text-destructive" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCustomer(null);
                    setShowCustomerSection(false);
                  }}
                />
              )}
            </Button>
            {selectedCustomer && (
              <span className="text-xs text-muted-foreground">{selectedCustomer.phone}</span>
            )}
          </div>

          {showCustomerSection && !selectedCustomer && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-3 space-y-3">
                {!isAddingNewCustomer ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-between h-9">
                            <span className="text-muted-foreground">Search by name or phone...</span>
                            <Search className="h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[calc(100vw-3rem)] sm:w-[350px] p-0" align="start">
                          <Command>
                            <CommandInput 
                              placeholder="Search customers..." 
                              value={customerSearch}
                              onValueChange={setCustomerSearch}
                            />
                            <CommandList>
                              <CommandEmpty>No customer found.</CommandEmpty>
                              <CommandGroup className="max-h-48 overflow-auto">
                                {customers
                                  ?.filter(c => 
                                    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                                    c.phone?.includes(customerSearch)
                                  )
                                  .slice(0, 10)
                                  .map((customer) => (
                                    <CommandItem
                                      key={customer.id}
                                      value={customer.id}
                                      onSelect={() => {
                                        setSelectedCustomer(customer);
                                        setCustomerPopoverOpen(false);
                                        setCustomerSearch("");
                                        setShowCustomerSection(false);
                                      }}
                                      className="flex items-center justify-between py-2"
                                    >
                                      <div>
                                        <span className="font-medium">{customer.name}</span>
                                        {customer.phone && (
                                          <span className="text-xs text-muted-foreground ml-2">{customer.phone}</span>
                                        )}
                                      </div>
                                    </CommandItem>
                                  ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => setIsAddingNewCustomer(true)}
                        title="Add new customer"
                      >
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <UserPlus className="h-4 w-4" /> Add New Customer
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input
                        placeholder="Name *"
                        value={newCustomer.name}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                      />
                      <Input
                        placeholder="Phone"
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                      />
                      <Input
                        placeholder="Address"
                        value={newCustomer.address}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, address: e.target.value }))}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => {
                          if (!newCustomer.name.trim()) {
                            toast({ title: "Name required", variant: "destructive" });
                            return;
                          }
                          createCustomerMutation.mutate(newCustomer);
                        }}
                        disabled={createCustomerMutation.isPending}
                      >
                        {createCustomerMutation.isPending ? "Saving..." : "Save Customer"}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => {
                          setIsAddingNewCustomer(false);
                          setNewCustomer({ name: "", phone: "", address: "" });
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Cart — Arrow keys navigate rows, Del removes focused row */}
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
                      <TableHead className="w-12 text-xs text-muted-foreground text-center">Del</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.map((item, index) => (
                      <TableRow
                        key={`${item.batch_id}-${index}`}
                        tabIndex={0}
                        data-kb-cart-row
                        data-kb-cart-idx={index}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-kb-cart-row]"));
                            rows[index + 1]?.focus();
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-kb-cart-row]"));
                            rows[index - 1]?.focus();
                          } else if (e.key === "Delete" || e.key === "Backspace") {
                            e.preventDefault();
                            removeFromCart(index);
                          }
                        }}
                        className="focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                      >
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
                        <TableCell className="text-center">
                          <Button variant="ghost" size="icon" tabIndex={-1} onClick={() => removeFromCart(index)}>
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
              <div className="space-y-1">
                <Label className="text-xs">
                  Payment Method
                  <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0 hidden sm:inline-flex">C to cycle</Badge>
                </Label>
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
      </div>

      {/* Footer bar */}
      <div className="shrink-0 border-t bg-background px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center gap-2">
        <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-2 flex-1">
          <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Enter</kbd> complete
          <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Ctrl+Enter</kbd> force complete
          <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">C</kbd> cycle payment
          <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Del</kbd> remove row
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={handleClose} className="flex-1 sm:flex-none">Cancel</Button>
          <Button
            ref={completeButtonRef}
            onClick={() => createCounterSaleMutation.mutate()}
            disabled={cart.length === 0 || createCounterSaleMutation.isPending}
            className="gap-2 flex-1 sm:flex-none"
          >
            <Printer className="h-4 w-4" />
            {createCounterSaleMutation.isPending ? "Processing..." : "Complete & Print"}
          </Button>
        </div>
      </div>
    </div>
  );
}

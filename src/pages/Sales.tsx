import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useDraftSave } from "@/hooks/useDraftSave";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, Receipt, CreditCard, Banknote, PlusCircle, AlertTriangle, Clock, Pencil, Printer, FileText, FileSpreadsheet, Download, ChevronDown, Loader2, RotateCcw, UserPlus, Check, ChevronsUpDown } from "lucide-react";
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
import { RecordPaymentDialog } from "@/components/dialogs/RecordPaymentDialog";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { format, differenceInDays } from "date-fns";
import { ProductFormDialog } from "@/components/forms/ProductFormDialog";
import { EditSaleDialog } from "@/components/dialogs/EditSaleDialog";
import { CreditNoteDialog } from "@/components/dialogs/CreditNoteDialog";
import { allocateBatchesFIFO, getTotalAvailableStock } from "@/utils/fifoAllocation";
import { DrugBrandSearch } from "@/components/DrugBrandSearch";
import { printBill, downloadBillHTML, downloadBillCSV, downloadBillPDF, type BillData } from "@/utils/billGenerator";
import { printElectronicsInvoice, downloadElectronicsInvoiceHTML, downloadElectronicsInvoicePDF, type ElectronicsInvoiceData, type InvoiceSettings } from "@/utils/electronicsInvoiceGenerator";
import type { Tables } from "@/integrations/supabase/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SalesOrder = Tables<"sales_orders">;
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
  discount_flat: number;
  total_price: number;
  max_quantity: number;
  expiry_date: string;
}

export default function Sales() {
  const { toast } = useToast();
  const { user, isAdmin, isPharmacist } = useAuth();
  const { config, companyId, gstInclusive } = useBusiness();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editSaleId, setEditSaleId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [prescriptionNumber, setPrescriptionNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [notes, setNotes] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [productSearchQuery2, setProductSearchQuery2] = useState("");
  const [productPopoverOpen, setProductPopoverOpen] = useState(false);
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemDiscount, setItemDiscount] = useState<number>(0);
  const [itemDiscountFlat, setItemDiscountFlat] = useState<number>(0);
  const [itemRate, setItemRate] = useState<number>(0);
  const [draftRestored, setDraftRestored] = useState(false);
  
  // Other charges
  const [freightCharges, setFreightCharges] = useState<number>(0);
  const [handlingCharges, setHandlingCharges] = useState<number>(0);
  const [deliveryCharges, setDeliveryCharges] = useState<number>(0);
  const [otherCharges, setOtherCharges] = useState<number>(0);
  
  // Bill-level discount
  const [billDiscountPercent, setBillDiscountPercent] = useState<number>(0);
  const [billDiscountFlat, setBillDiscountFlat] = useState<number>(0);
  
  // Inline add product
  const [showProductDialog, setShowProductDialog] = useState(false);
  
  // Customer selector state (electronics)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [isAddingNewCustomer, setIsAddingNewCustomer] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({ name: "", phone: "", address: "", gst_number: "" });

  // Bill loading state
  const [billLoadingId, setBillLoadingId] = useState<string | null>(null);
  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SalesOrder | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  // Payment dialog
  const [paymentDialog, setPaymentDialog] = useState<null | {
    referenceId: string; referenceNumber: string; partyName: string;
    totalAmount: number; paidAmount: number;
  }>(null);

  // Fetch invoice settings for electronics format
  const { data: invoiceSettings } = useQuery({
    queryKey: ["invoice-settings", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("invoice_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch customers for selector
  const { data: customers } = useQuery({
    queryKey: ["customers-for-sale", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email, address, gst_number")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: isDialogOpen && !!companyId,
  });

  // Create new customer inline
  const createCustomerMutation = useMutation({
    mutationFn: async (cust: typeof newCustomerData) => {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          name: cust.name,
          phone: cust.phone || null,
          address: cust.address || null,
          gst_number: cust.gst_number || null,
          company_id: companyId,
        })
        .select()
        .single();
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
      toast({ title: "Customer added", description: `${data.name} saved successfully` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // ── Draft auto-save ───────────────────────────────────────────────────────
  const saleDraft = useMemo(() => ({
    cart, invoiceNumber, customerName, customerPhone, customerAddress,
    prescriptionNumber, paymentMethod, notes,
    freightCharges, handlingCharges, deliveryCharges, otherCharges,
  }), [cart, invoiceNumber, customerName, customerPhone, customerAddress,
      prescriptionNumber, paymentMethod, notes,
      freightCharges, handlingCharges, deliveryCharges, otherCharges]);

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

  const handleBillAction = async (order: SalesOrder, action: "print" | "pdf" | "html" | "csv") => {
    setBillLoadingId(order.id);
    try {
      const [{ data: items, error }, customerGstin] = await Promise.all([
        supabase
          .from("sales_order_items")
          .select(`
            *,
            products (name, strength, hsn_code, gst_percentage, unit),
            inventory_batches (batch_number)
          `)
          .eq("sales_order_id", order.id),
        // Fetch customer GSTIN with resilient fallback for legacy invoices
        (async () => {
          const clean = (value?: string | null) => (value ?? "").trim();
          const normalizeName = (value?: string | null) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
          const normalizePhone = (value?: string | null) => clean(value).replace(/\D/g, "").slice(-10);

          let targetName = order.customer_name;
          let targetPhone = order.customer_phone;

          if (order.customer_id) {
            const byId = await supabase
              .from("customers")
              .select("gst_number, name, phone")
              .eq("id", order.customer_id)
              .limit(1)
              .maybeSingle();

            const gstById = clean(byId.data?.gst_number);
            if (gstById) return gstById;

            // If order snapshot fields are incomplete, use linked customer fields for fallback matching
            targetName = targetName || byId.data?.name || null;
            targetPhone = targetPhone || byId.data?.phone || null;
          }

          const baseQuery = supabase
            .from("customers")
            .select("name, phone, gst_number, updated_at")
            .not("gst_number", "is", null)
            .order("updated_at", { ascending: false })
            .limit(500);

          const candidateQuery = order.company_id
            ? baseQuery.eq("company_id", order.company_id)
            : baseQuery;

          const { data: rawCandidates } = await candidateQuery;
          const candidates = (rawCandidates || []).filter((c) => clean(c.gst_number));

          const normalizedTargetName = normalizeName(targetName);
          const normalizedTargetPhone = normalizePhone(targetPhone);

          const byBoth = candidates.find(
            (c) =>
              normalizedTargetName &&
              normalizedTargetPhone &&
              normalizeName(c.name) === normalizedTargetName &&
              normalizePhone(c.phone) === normalizedTargetPhone,
          );
          if (byBoth) return clean(byBoth.gst_number);

          const byPhone = normalizedTargetPhone
            ? candidates.find((c) => normalizePhone(c.phone) === normalizedTargetPhone)
            : undefined;
          if (byPhone) return clean(byPhone.gst_number);

          const byName = normalizedTargetName
            ? candidates.find((c) => normalizeName(c.name) === normalizedTargetName)
            : undefined;
          if (byName) return clean(byName.gst_number);

          return null;
        })(),
      ]);

      if (error) throw error;

      const billItems = (items || []).map((item) => {
        const product = item.products as any;
        const batch = item.inventory_batches as any;
        return {
          product_name: `${product?.name || ""}${product?.strength ? ` ${product.strength}` : ""}`,
          batch_number: batch?.batch_number || "-",
          hsn_code: product?.hsn_code || "",
          quantity: item.quantity,
          unit: product?.unit || "pcs",
          unit_price: Number(item.unit_price),
          gst_percentage: Number(item.gst_percentage),
          discount_percentage: Number(item.discount_percentage),
          total_price: Number(item.total_price),
        };
      });

      const subtotal = billItems.reduce((sum, item) => {
        return sum + item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
      }, 0);

      // Use electronics invoice format for b2b business types
      if (config.type === "b2b_electronics" || config.type === "pharmacy_b2b" || invoiceSettings) {
        const settings: InvoiceSettings = {
          company_name: invoiceSettings?.company_name || "",
          company_address: invoiceSettings?.company_address || "",
          company_phone: invoiceSettings?.company_phone || "",
          company_email: invoiceSettings?.company_email || "",
          company_gstin: invoiceSettings?.company_gstin || "",
          company_state: invoiceSettings?.company_state || "",
          terms_and_conditions: invoiceSettings?.terms_and_conditions || "Thanks for doing business with us!",
          show_ship_to: invoiceSettings?.show_ship_to ?? true,
          show_due_date: invoiceSettings?.show_due_date ?? true,
          show_previous_balance: invoiceSettings?.show_previous_balance ?? true,
          show_tax_summary: invoiceSettings?.show_tax_summary ?? true,
          show_amount_in_words: invoiceSettings?.show_amount_in_words ?? true,
          show_customer_gstin: (invoiceSettings as any)?.show_customer_gstin ?? true,
          bank_name: (invoiceSettings as any)?.bank_name || "",
          bank_account_number: (invoiceSettings as any)?.bank_account_number || "",
          bank_ifsc: (invoiceSettings as any)?.bank_ifsc || "",
          bank_branch: (invoiceSettings as any)?.bank_branch || "",
          bank_account_holder: (invoiceSettings as any)?.bank_account_holder || "",
        };

        const elecData: ElectronicsInvoiceData = {
          type: "sale",
          invoice_number: order.invoice_number,
          date: order.sale_date,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone || undefined,
          customer_address: order.customer_address || undefined,
          customer_gstin: customerGstin || undefined,
          items: billItems,
          subtotal,
          gst_amount: Number(order.gst_amount),
          discount_amount: Number(order.discount_amount),
          freight_charges: Number(order.freight_charges),
          handling_charges: Number(order.handling_charges),
          delivery_charges: Number(order.delivery_charges),
          other_charges: Number(order.other_charges),
          total_amount: Number(order.total_amount),
          payment_method: order.payment_method || "cash",
          settings,
        };

        if (action === "print") printElectronicsInvoice(elecData);
        else if (action === "pdf") downloadElectronicsInvoicePDF(elecData);
        else if (action === "html") downloadElectronicsInvoiceHTML(elecData);
        else if (action === "csv") {
          // Fallback to standard CSV for electronics too
          const billData: BillData = {
            type: "sale", invoice_number: order.invoice_number, date: order.sale_date,
            customer_name: order.customer_name, customer_phone: order.customer_phone || undefined,
            customer_address: order.customer_address || undefined, customer_gstin: customerGstin || undefined,
            payment_method: order.payment_method || "cash",
            items: billItems, subtotal, gst_amount: Number(order.gst_amount),
            discount_amount: Number(order.discount_amount), freight_charges: Number(order.freight_charges),
            handling_charges: Number(order.handling_charges), delivery_charges: Number(order.delivery_charges),
            other_charges: Number(order.other_charges), total_amount: Number(order.total_amount),
          };
          downloadBillCSV(billData);
        }
      } else {
        const billData: BillData = {
          type: "sale",
          invoice_number: order.invoice_number,
          date: order.sale_date,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone || undefined,
          customer_address: order.customer_address || undefined,
          customer_gstin: customerGstin || undefined,
          payment_method: order.payment_method || "cash",
          items: billItems,
          subtotal,
          gst_amount: Number(order.gst_amount),
          discount_amount: Number(order.discount_amount),
          freight_charges: Number(order.freight_charges),
          handling_charges: Number(order.handling_charges),
          delivery_charges: Number(order.delivery_charges),
          other_charges: Number(order.other_charges),
          total_amount: Number(order.total_amount),
        };

        if (action === "print") printBill(billData);
        else if (action === "pdf") downloadBillPDF(billData);
        else if (action === "html") downloadBillHTML(billData);
        else if (action === "csv") downloadBillCSV(billData);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBillLoadingId(null);
    }
  };

  const { data: salesOrders, isLoading } = useQuery({
    queryKey: ["sales-orders", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SalesOrder[];
    },
    enabled: !!companyId,
  });

  const { data: salesPayments } = useQuery({
    queryKey: ["payments-sales", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("reference_id, amount")
        .eq("company_id", companyId!)
        .eq("reference_type", "sales_order");
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

  const { data: batches } = useQuery({
    queryKey: ["batches-for-product", selectedProduct],
    queryFn: async () => {
      if (!selectedProduct) return [];
      const { data, error } = await supabase
        .from("inventory_batches")
        .select("*")
        .eq("product_id", selectedProduct)
        .gt("quantity", 0)
        .gt("expiry_date", new Date().toISOString().split("T")[0])
        .order("expiry_date", { ascending: true }); // FEFO
      if (error) throw error;
      return data as InventoryBatch[];
    },
    enabled: !!selectedProduct,
  });

  const createSaleMutation = useMutation({
    mutationFn: async () => {
      const finalInvoiceNumber = invoiceNumber.trim() || `INV-${Date.now()}`;
      
      // Validate duplicate invoice number
      if (invoiceNumber.trim()) {
        const { data: existing, error: checkError } = await supabase
          .from("sales_orders")
          .select("id")
          .eq("invoice_number", invoiceNumber.trim())
          .limit(1);
        
        if (checkError) throw checkError;
        if (existing && existing.length > 0) {
          throw new Error(`Invoice number "${invoiceNumber}" already exists. Please use a unique invoice number.`);
        }
      }
      
      // Calculate item totals
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

      const totalCharges = freightCharges + handlingCharges + deliveryCharges + otherCharges;
      const totalAmount = gstInclusive
        ? itemsSubtotal + totalCharges
        : itemsSubtotal + gstAmount + totalCharges;

      const { data: order, error: orderError } = await supabase
        .from("sales_orders")
        .insert({
          invoice_number: finalInvoiceNumber,
          customer_name: customerName,
          customer_phone: customerPhone || null,
          customer_address: customerAddress || null,
          customer_id: selectedCustomerId || null,
          prescription_number: prescriptionNumber || null,
          payment_method: paymentMethod,
          notes: notes || null,
          total_amount: totalAmount,
          gst_amount: gstAmount,
          discount_amount: discountAmount,
          freight_charges: freightCharges,
          handling_charges: handlingCharges,
          delivery_charges: deliveryCharges,
          other_charges: otherCharges,
          created_by: user?.id,
          status: "confirmed",
          company_id: companyId,
        })
        .select()
        .single();

      if (orderError) throw orderError;

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

      // Update batch quantities
      for (const item of cart) {
        const { error: batchError } = await supabase
          .from("inventory_batches")
          .update({ quantity: item.max_quantity - item.quantity })
          .eq("id", item.batch_id);
        if (batchError) throw batchError;
      }

      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["batches-for-product"] });
      toast({ title: "Sale completed", description: "Invoice has been generated successfully." });
      handleCloseDialog();
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSaleMutation = useMutation({
    mutationFn: async (orderId: string) => {
      // 1. Fetch sale items to restore inventory
      const { data: saleItems, error: fetchErr } = await supabase
        .from("sales_order_items")
        .select("id, product_id, batch_id, quantity")
        .eq("sales_order_id", orderId);
      if (fetchErr) throw fetchErr;

      // 2. Restore inventory batch quantities
      for (const item of (saleItems || [])) {
        const { data: batch } = await supabase
          .from("inventory_batches")
          .select("quantity")
          .eq("id", item.batch_id)
          .single();
        if (batch) {
          const { error: batchErr } = await supabase
            .from("inventory_batches")
            .update({ quantity: batch.quantity + item.quantity })
            .eq("id", item.batch_id)
            .select();
          if (batchErr) throw new Error(`Failed to restore inventory: ${batchErr.message}`);
        }
      }

      // 3. Unlink credit notes referencing this sale (set FK to null)
      await supabase
        .from("credit_notes")
        .update({ original_invoice_id: null })
        .eq("original_invoice_id", orderId);

      // 4. Delete sale items one by one for reliability
      for (const item of (saleItems || [])) {
        const { error: delErr } = await supabase
          .from("sales_order_items")
          .delete()
          .eq("id", item.id);
        if (delErr) throw new Error(`Failed to delete sale item: ${delErr.message}`);
      }

      // 5. Delete related payments
      await supabase
        .from("payments")
        .delete()
        .eq("reference_id", orderId)
        .eq("reference_type", "sales_order");

      // 6. Delete the order
      const { data: deleted, error: orderErr } = await supabase
        .from("sales_orders")
        .delete()
        .eq("id", orderId)
        .select();
      if (orderErr) throw new Error(`Failed to delete invoice: ${orderErr.message}`);
      if (!deleted || deleted.length === 0) throw new Error("Invoice could not be deleted. Check your permissions.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["payments-sales"] });
      queryClient.invalidateQueries({ queryKey: ["batches-for-product"] });
      toast({ title: "Invoice deleted", description: "The invoice, items, and inventory have been restored successfully." });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setDeleteConfirmText("");
    },
    onError: (error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  const handleCloseDialog = useCallback(() => {
    clearDraft();
    setIsDialogOpen(false);
    setCart([]);
    setInvoiceNumber("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setPrescriptionNumber("");
    setPaymentMethod("cash");
    setNotes("");
    setSelectedProduct("");
    setProductSearchQuery2("");
    setProductPopoverOpen(false);
    setItemQuantity(1);
    setItemDiscount(0);
    setItemRate(0);
    setFreightCharges(0);
    setHandlingCharges(0);
    setDeliveryCharges(0);
    setOtherCharges(0);
    setDraftRestored(false);
    setSelectedCustomerId(null);
    setCustomerPopoverOpen(false);
    setCustomerSearchQuery("");
    setIsAddingNewCustomer(false);
    setNewCustomerData({ name: "", phone: "", address: "", gst_number: "" });
  }, [clearDraft]);

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────
  // "/" — focus search bar
  useKeyboardShortcut({
    key: "/",
    callback: () => { searchRef.current?.focus(); searchRef.current?.select(); },
    enabled: true,
  });

  // "N" — open new sale dialog
  useKeyboardShortcut({
    key: "n",
    callback: () => setIsDialogOpen(true),
    enabled: !isDialogOpen && !editDialogOpen && !creditNoteOpen && !deleteDialogOpen,
  });

  // Ctrl+Enter — complete sale (works from any input within dialog)
  useKeyboardShortcut({
    key: "Enter",
    modifiers: ["ctrl"],
    callback: () => {
      if (cart.length > 0 && customerName && !createSaleMutation.isPending) {
        createSaleMutation.mutate();
      }
    },
    enabled: isDialogOpen,
    allowInInput: true,
  });

  // Alt+C — cycle payment method in sale dialog
  const paymentMethods = ["cash", "card", "upi"];
  useKeyboardShortcut({
    key: "c",
    modifiers: ["alt"],
    callback: () => {
      setPaymentMethod(prev => {
        const idx = paymentMethods.indexOf(prev);
        return paymentMethods[(idx + 1) % paymentMethods.length];
      });
    },
    enabled: isDialogOpen,
    allowInInput: true,
  });

  // Get existing cart quantities for the selected product to account for already allocated stock
  const existingCartQuantities = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach(item => {
      if (item.product_id === selectedProduct) {
        map.set(item.batch_id, (map.get(item.batch_id) || 0) + item.quantity);
      }
    });
    return map;
  }, [cart, selectedProduct]);

  // Calculate available stock for selected product
  const availableStock = useMemo(() => {
    if (!batches) return 0;
    return getTotalAvailableStock(batches, existingCartQuantities);
  }, [batches, existingCartQuantities]);

  const handleAddToCart = () => {
    if (!selectedProduct || itemQuantity <= 0) return;

    const product = products?.find((p) => p.id === selectedProduct);
    if (!product || !batches || batches.length === 0) {
      toast({ title: "No stock available", description: "This product has no available batches.", variant: "destructive" });
      return;
    }

    // Use FIFO allocation to distribute quantity across batches
    const allocationResult = allocateBatchesFIFO(batches, itemQuantity, existingCartQuantities);

    if (!allocationResult.success) {
      toast({ 
        title: "Insufficient stock", 
        description: allocationResult.message, 
        variant: "destructive" 
      });
      return;
    }

    const gstPercentage = Number(product.gst_percentage);
    const productName = `${product.name}${product.strength ? ` ${product.strength}` : ""}`;
    const hsnCode = product.hsn_code || "";

    // Use itemRate if set, otherwise fall back to MRP
    const effectiveRate = itemRate > 0 ? itemRate : 0;

    // Add each allocated batch to cart
    let newCart = [...cart];
    
    for (const allocation of allocationResult.allocations) {
      const unitPrice = effectiveRate > 0 ? effectiveRate : allocation.mrp;
      const existingIndex = newCart.findIndex((item) => item.batch_id === allocation.batch_id);
      
      if (existingIndex >= 0) {
        // Update existing cart item
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
        // Add new cart item
        const totalPrice = calculateItemTotal(unitPrice, allocation.quantity, gstPercentage, itemDiscount, itemDiscountFlat);
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
          discount_flat: itemDiscountFlat,
          total_price: totalPrice,
          max_quantity: allocation.available_quantity,
          expiry_date: allocation.expiry_date,
        });
      }
    }

    setCart(newCart);
    setSelectedProduct("");
    setItemQuantity(1);
    setItemDiscount(0);
    setItemDiscountFlat(0);
    setItemRate(0);

    // Show info if quantity was split across batches
    if (allocationResult.allocations.length > 1) {
      toast({ 
        title: "FIFO Applied", 
        description: `Quantity split across ${allocationResult.allocations.length} batches (nearest expiry first)` 
      });
    }
  };

  const calculateItemTotal = (price: number, qty: number, gst: number, discountPct: number, discountFlat: number = 0) => {
    const basePrice = price * qty;
    const afterPctDiscount = basePrice * (1 - discountPct / 100);
    const afterAllDiscount = afterPctDiscount - discountFlat;
    const discountedPrice = Math.max(0, afterAllDiscount);
    if (gstInclusive) return discountedPrice;
    const gstAmount = discountedPrice * (gst / 100);
    return discountedPrice + gstAmount;
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const updateCartItem = (index: number, field: keyof CartItem, value: string | number) => {
    const updated = [...cart];
    (updated[index] as any)[field] = value;
    // Recalculate total price
    const item = updated[index];
    item.total_price = calculateItemTotal(item.unit_price, item.quantity, item.gst_percentage, item.discount_percentage);
    setCart(updated);
  };

  // Calculate totals
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
  
  const totalCharges = freightCharges + handlingCharges + deliveryCharges + otherCharges;
  const grandTotal = gstInclusive
    ? itemsSubtotal + totalCharges
    : itemsSubtotal + totalGst + totalCharges;

  const filteredOrders = salesOrders?.filter(
    (order) =>
      order.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "default";
      case "pending": return "secondary";
      case "cancelled": return "destructive";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sales & Billing</h1>
          <p className="text-muted-foreground">Create invoices and manage sales</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setCreditNoteOpen(true)}>
            <RotateCcw className="h-4 w-4" />
            Credit Note
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Sale
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Sale</DialogTitle>
              <DialogDescription>Add products and complete the sale</DialogDescription>
            </DialogHeader>
            {draftRestored && (
              <div className="flex items-center gap-3 rounded-md border border-border bg-muted px-4 py-2.5 text-sm text-foreground">
                <span className="text-base">💾</span>
                <span className="flex-1 font-medium">Draft restored — your previous unsaved sale was recovered.</span>
                <button
                  onClick={() => { clearDraft(); setCart([]); setInvoiceNumber(""); setCustomerName(""); setCustomerPhone(""); setCustomerAddress(""); setPrescriptionNumber(""); setPaymentMethod("cash"); setNotes(""); setFreightCharges(0); setHandlingCharges(0); setDeliveryCharges(0); setOtherCharges(0); setDraftRestored(false); }}
                  className="ml-auto text-xs underline hover:no-underline opacity-70 hover:opacity-100"
                >
                  Discard draft
                </button>
              </div>
            )}
            <div className="space-y-6">
              {/* Invoice & Customer Info */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invoice_number">Invoice # (Optional)</Label>
                  <Input
                    id="invoice_number"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Auto-generated if empty"
                  />
                </div>
                {(config.type === "b2b_electronics" || config.type === "pharmacy_b2b") ? (
                  <>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Customer *</Label>
                      {isAddingNewCustomer ? (
                        <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                          <div className="grid grid-cols-2 gap-2">
                            <Input placeholder="Customer Name *" value={newCustomerData.name} onChange={e => setNewCustomerData(d => ({ ...d, name: e.target.value }))} />
                            <Input placeholder="Phone" value={newCustomerData.phone} onChange={e => setNewCustomerData(d => ({ ...d, phone: e.target.value }))} />
                            <Input placeholder="GSTIN" value={newCustomerData.gst_number} onChange={e => setNewCustomerData(d => ({ ...d, gst_number: e.target.value }))} />
                            <Input placeholder="Address" value={newCustomerData.address} onChange={e => setNewCustomerData(d => ({ ...d, address: e.target.value }))} />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => { if (newCustomerData.name) createCustomerMutation.mutate(newCustomerData); }} disabled={!newCustomerData.name || createCustomerMutation.isPending}>
                              {createCustomerMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />} Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setIsAddingNewCustomer(false)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" role="combobox" className="flex-1 justify-between font-normal">
                                {selectedCustomerId
                                  ? customers?.find(c => c.id === selectedCustomerId)?.name || customerName
                                  : "Select customer..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[350px] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search customer..." value={customerSearchQuery} onValueChange={setCustomerSearchQuery} />
                                <CommandList>
                                  <CommandEmpty>No customer found.</CommandEmpty>
                                  <CommandGroup>
                                    {customers?.filter(c =>
                                      c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                                      (c.phone && c.phone.includes(customerSearchQuery))
                                    ).map(c => (
                                      <CommandItem
                                        key={c.id}
                                        value={c.name}
                                        onSelect={() => {
                                          setSelectedCustomerId(c.id);
                                          setCustomerName(c.name);
                                          setCustomerPhone(c.phone || "");
                                          setCustomerAddress(c.address || "");
                                          setCustomerPopoverOpen(false);
                                        }}
                                      >
                                        <Check className={`mr-2 h-4 w-4 ${selectedCustomerId === c.id ? "opacity-100" : "opacity-0"}`} />
                                        <div>
                                          <div className="font-medium">{c.name}</div>
                                          <div className="text-xs text-muted-foreground">{c.phone || ""} {c.gst_number ? `• GST: ${c.gst_number}` : ""}</div>
                                        </div>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <Button type="button" variant="outline" size="icon" onClick={() => setIsAddingNewCustomer(true)} title="Add new customer">
                            <UserPlus className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      {selectedCustomerId && customers && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {customerPhone && <span>📞 {customerPhone}</span>}
                          {customerAddress && <span className="ml-2">📍 {customerAddress}</span>}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="customer_name">Customer Name *</Label>
                      <Input
                        id="customer_name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customer_phone">Phone</Label>
                      <Input
                        id="customer_phone"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                      />
                    </div>
                  </>
                )}
                {config.hasPrescription && (
                  <div className="space-y-2">
                    <Label htmlFor="prescription">Prescription #</Label>
                    <Input
                      id="prescription"
                      value={prescriptionNumber}
                      onChange={(e) => setPrescriptionNumber(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Add Product to Cart */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Add Products</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                    <div className="md:col-span-2">
                      <Label>Product</Label>
                      <div className="flex gap-2">
                        <DrugBrandSearch
                          products={products}
                          selectedProductId={selectedProduct}
                          onSelect={(value) => {
                            setSelectedProduct(value);
                            const prod = products?.find((p) => p.id === value);
                            if (prod) {
                              const defaultRate = prod.sale_price && Number(prod.sale_price) > 0 ? Number(prod.sale_price) : Number(prod.mrp);
                              setItemRate(defaultRate);
                            }
                            setTimeout(() => {
                              const rateInput = document.getElementById("sale-rate-input") as HTMLInputElement;
                              rateInput?.focus();
                              rateInput?.select();
                            }, 50);
                          }}
                          showPrice
                          priceType="sale"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => setShowProductDialog(true)}
                          title="Add new product"
                        >
                          <PlusCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label>Available Stock</Label>
                      <div className="h-10 px-3 py-2 bg-muted rounded-md flex items-center gap-2 text-sm">
                        {selectedProduct ? (
                          <>
                            <span className={availableStock > 0 ? "text-green-600 font-medium" : "text-destructive font-medium"}>
                              {availableStock} units
                            </span>
                            {availableStock === 0 && (
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Select product</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label>Qty</Label>
                      <Input
                        id="sale-qty-input"
                        type="number"
                        min={1}
                        max={availableStock || undefined}
                        value={itemQuantity}
                        onChange={(e) => setItemQuantity(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && selectedProduct && availableStock > 0 && itemQuantity > 0) {
                            e.preventDefault();
                            handleAddToCart();
                          }
                        }}
                      />
                    </div>
                    <div>
                      <Label>Disc %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={itemDiscount || ""}
                        onChange={(e) => setItemDiscount(parseFloat(e.target.value) || 0)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && selectedProduct && availableStock > 0 && itemQuantity > 0) {
                            e.preventDefault();
                            handleAddToCart();
                          }
                        }}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>Rate (₹)</Label>
                      <Input
                        id="sale-rate-input"
                        type="number"
                        min={0}
                        step={0.01}
                        value={itemRate || ""}
                        onChange={(e) => setItemRate(parseFloat(e.target.value) || 0)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && selectedProduct && availableStock > 0 && itemQuantity > 0) {
                            e.preventDefault();
                            handleAddToCart();
                          }
                        }}
                        placeholder={selectedProduct ? `MRP: ₹${products?.find(p => p.id === selectedProduct)?.mrp ?? ""}` : "Auto (MRP)"}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button 
                        onClick={handleAddToCart} 
                        className="w-full" 
                        disabled={!selectedProduct || availableStock === 0 || itemQuantity <= 0}
                        title="Add item (Enter)"
                      >
                        Add (FIFO)
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cart */}
              {cart.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Cart Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Batch</TableHead>
                          <TableHead>Expiry</TableHead>
                          <TableHead>Price (₹)</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Disc %</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cart.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium min-w-[150px]">{item.product_name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{item.batch_number}</TableCell>
                            <TableCell>
                              {(() => {
                                const daysUntilExpiry = differenceInDays(new Date(item.expiry_date), new Date());
                                const isNearExpiry = daysUntilExpiry <= 60;
                                const isVeryNearExpiry = daysUntilExpiry <= 30;
                                return (
                                  <Badge 
                                    variant={isVeryNearExpiry ? "destructive" : isNearExpiry ? "secondary" : "outline"} 
                                    className={`text-xs gap-1 ${isNearExpiry ? "animate-pulse" : ""}`}
                                  >
                                    {isNearExpiry && <Clock className="h-3 w-3" />}
                                    {format(new Date(item.expiry_date), "MMM yy")}
                                    {isVeryNearExpiry && ` (${daysUntilExpiry}d)`}
                                  </Badge>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                value={item.unit_price}
                                onChange={(e) => updateCartItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                                className="w-24 h-8 text-right"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={1}
                                max={item.max_quantity}
                                value={item.quantity}
                                onChange={(e) => updateCartItem(index, "quantity", e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                                className="w-16 h-8 text-center"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step={0.1}
                                value={item.discount_percentage}
                                onChange={(e) => updateCartItem(index, "discount_percentage", parseFloat(e.target.value) || 0)}
                                className="w-16 h-8 text-center"
                                placeholder="0"
                              />
                            </TableCell>
                            <TableCell className="text-right font-medium">₹{item.total_price.toFixed(2)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => removeFromCart(index)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Other Charges */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Other Charges</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Freight (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={freightCharges || ""}
                        onChange={(e) => setFreightCharges(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Handling (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={handlingCharges || ""}
                        onChange={(e) => setHandlingCharges(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Delivery (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={deliveryCharges || ""}
                        onChange={(e) => setDeliveryCharges(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Other (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={otherCharges || ""}
                        onChange={(e) => setOtherCharges(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Totals Summary */}
              {cart.length > 0 && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>{gstInclusive ? "Total (GST Inclusive):" : "Subtotal:"}</span>
                        <span>₹{itemsSubtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{gstInclusive ? "Incl. GST (CGST + SGST):" : "GST (CGST + SGST):"}</span>
                        <span>₹{totalGst.toFixed(2)}</span>
                      </div>
                      {totalCharges > 0 && (
                        <div className="flex justify-between">
                          <span>Other Charges:</span>
                          <span>₹{totalCharges.toFixed(2)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Grand Total:</span>
                        <span>₹{grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payment */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">
                        <span className="flex items-center gap-2"><Banknote className="h-4 w-4" /> Cash</span>
                      </SelectItem>
                      <SelectItem value="card">
                        <span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Card</span>
                      </SelectItem>
                      <SelectItem value="upi">
                        <span className="flex items-center gap-2"><Receipt className="h-4 w-4" /> UPI</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes"
                  />
                </div>
              </div>

              <DialogFooter>
                <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-2 flex-wrap">
                  <span><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Ctrl+Enter</kbd> complete sale</span>
                  <span><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Alt+C</kbd> cycle payment</span>
                  <span><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Enter</kbd> add item</span>
                </div>
                <Button variant="outline" onClick={handleCloseDialog}>Cancel</Button>
                <Button
                  onClick={() => createSaleMutation.mutate()}
                  disabled={cart.length === 0 || !customerName || createSaleMutation.isPending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || (e.ctrlKey && e.key === "Enter")) {
                      e.preventDefault();
                      if (cart.length > 0 && customerName && !createSaleMutation.isPending) {
                        createSaleMutation.mutate();
                      }
                    }
                  }}
                >
                  Complete Sale (₹{grandTotal.toFixed(2)})
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Search invoices... ( / )"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading sales...</div>
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
                    <TableHead>Invoice #</TableHead>
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
                  {filteredOrders?.map((order, idx) => (
                    <TableRow
                      key={order.id}
                      tabIndex={0}
                      data-kb-row
                      onKeyDown={(e) => {
                        const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-kb-row]"));
                        const pos = rows.indexOf(e.currentTarget);
                        if (e.key === "ArrowDown") { e.preventDefault(); rows[pos + 1]?.focus(); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); rows[pos - 1]?.focus(); }
                        else if (e.key === "p" || e.key === "P") { e.preventDefault(); handleBillAction(order, "print"); }
                        else if (e.key === "e" || e.key === "E") {
                          if (isAdmin || isPharmacist) {
                            e.preventDefault();
                            setEditSaleId(order.id);
                            setEditDialogOpen(true);
                          }
                        }
                        else if ((e.key === "d" || e.key === "D") && isAdmin) {
                          e.preventDefault();
                          setDeleteTarget(order);
                          setDeleteConfirmText("");
                          setDeleteDialogOpen(true);
                        }
                        else if (e.key === "$" || e.key === "4" && !e.altKey) {
                          // "$" or "4" — open payment dialog
                          const paid = paidBySalesId[order.id] || 0;
                          e.preventDefault();
                          setPaymentDialog({
                            referenceId: order.id,
                            referenceNumber: order.invoice_number,
                            partyName: order.customer_name,
                            totalAmount: Number(order.total_amount),
                            paidAmount: paid,
                          });
                        }
                      }}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-medium">{order.invoice_number}</TableCell>
                      <TableCell>
                        <div>
                          <div>{order.customer_name}</div>
                          {order.customer_phone && (
                            <div className="text-sm text-muted-foreground">{order.customer_phone}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{format(new Date(order.sale_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="capitalize">{order.payment_method}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(order.status)}>{order.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">₹{Number(order.total_amount).toFixed(2)}</TableCell>
                      <TableCell>
                        {(() => {
                          const paid = paidBySalesId[order.id] || 0;
                          const balance = Number(order.total_amount) - paid;
                          const isPaid = balance <= 0.01;
                          const isPartial = paid > 0 && !isPaid;
                          return (
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-7 text-xs gap-1 px-2 ${isPaid ? "text-green-600" : isPartial ? "text-amber-600" : "text-destructive"}`}
                              onClick={() => setPaymentDialog({
                                referenceId: order.id,
                                referenceNumber: order.invoice_number,
                                partyName: order.customer_name,
                                totalAmount: Number(order.total_amount),
                                paidAmount: paid,
                              })}
                              title={isPaid ? "Fully Paid" : `Balance: ₹${balance.toFixed(2)}`}
                            >
                              <Banknote className="h-3 w-3" />
                              {isPaid ? "Paid" : isPartial ? `₹${paid.toFixed(0)} paid` : "Unpaid"}
                            </Button>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1" disabled={billLoadingId === order.id}>
                                {billLoadingId === order.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Printer className="h-3 w-3" />
                                )}
                                Bill
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-popover z-50">
                              <DropdownMenuItem onClick={() => handleBillAction(order, "print")}>
                                <Printer className="h-4 w-4 mr-2" /> Print <kbd className="ml-auto text-[10px] opacity-50">P</kbd>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleBillAction(order, "pdf")}>
                                <Download className="h-4 w-4 mr-2" /> Download PDF
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleBillAction(order, "html")}>
                                <FileText className="h-4 w-4 mr-2" /> Download HTML
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleBillAction(order, "csv")}>
                                <FileSpreadsheet className="h-4 w-4 mr-2" /> Download CSV
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {(isAdmin || isPharmacist) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditSaleId(order.id);
                                setEditDialogOpen(true);
                              }}
                              title="Edit bill (E)"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                setDeleteTarget(order);
                                setDeleteConfirmText("");
                                setDeleteDialogOpen(true);
                              }}
                              title="Delete invoice"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!open) { setDeleteDialogOpen(false); setDeleteTarget(null); setDeleteConfirmText(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Invoice
            </DialogTitle>
            <DialogDescription>
              This action is <strong>permanent and cannot be undone</strong>. The invoice, all its items, and related payment records will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-4">
              <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 space-y-1">
                <p className="text-sm font-medium">Invoice: <span className="font-mono">{deleteTarget.invoice_number}</span></p>
                <p className="text-sm text-muted-foreground">Customer: {deleteTarget.customer_name}</p>
                <p className="text-sm text-muted-foreground">Amount: ₹{Number(deleteTarget.total_amount).toFixed(2)}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">
                  Type <span className="font-mono font-bold text-destructive">{deleteTarget.invoice_number}</span> to confirm:
                </Label>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={deleteTarget.invoice_number}
                  className="font-mono"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeleteTarget(null); setDeleteConfirmText(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!deleteTarget || deleteConfirmText !== deleteTarget.invoice_number || deleteSaleMutation.isPending}
              onClick={() => deleteTarget && deleteSaleMutation.mutate(deleteTarget.id)}
            >
              {deleteSaleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductFormDialog
        open={showProductDialog}
        onOpenChange={setShowProductDialog}
        onSuccess={() => refetchProducts()}
      />

      {/* Edit Sale Dialog */}
      <EditSaleDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        saleId={editSaleId}
      />

      {/* Credit Note Dialog */}
      <CreditNoteDialog
        open={creditNoteOpen}
        onOpenChange={setCreditNoteOpen}
      />

      {/* Record Payment Dialog */}
      {paymentDialog && (
        <RecordPaymentDialog
          open={!!paymentDialog}
          onOpenChange={(open) => { if (!open) setPaymentDialog(null); queryClient.invalidateQueries({ queryKey: ["payments-sales"] }); }}
          referenceType="sales_order"
          referenceId={paymentDialog.referenceId}
          referenceNumber={paymentDialog.referenceNumber}
          partyName={paymentDialog.partyName}
          partyType="customer"
          totalAmount={paymentDialog.totalAmount}
          paidAmount={paymentDialog.paidAmount}
          paymentType="received"
        />
      )}
    </div>
  );
}

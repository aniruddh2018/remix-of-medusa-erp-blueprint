import { useState, useRef, useMemo, useCallback } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, Package, PlusCircle, FileText, ArrowRight, Lock, Link2, Printer, FileSpreadsheet, Download, ChevronDown, Loader2, Pencil, RotateCcw, Banknote, AlertTriangle } from "lucide-react";
import { RecordPaymentDialog } from "@/components/dialogs/RecordPaymentDialog";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { printBill, downloadBillHTML, downloadBillCSV, downloadBillPDF, type BillData } from "@/utils/billGenerator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { ProductFormDialog } from "@/components/forms/ProductFormDialog";
import { DrugBrandSearch } from "@/components/DrugBrandSearch";
import { SupplierFormDialog } from "@/components/forms/SupplierFormDialog";
import { ReceiveInventoryDialog } from "@/components/dialogs/ReceiveInventoryDialog";
import { LinkedChallansDialog } from "@/components/dialogs/LinkedChallansDialog";
import { EditPurchaseOrderDialog } from "@/components/dialogs/EditPurchaseOrderDialog";
import { DebitNoteDialog } from "@/components/dialogs/DebitNoteDialog";
import type { Tables } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";

type PurchaseOrder = Tables<"purchase_orders">;
type Supplier = Tables<"suppliers">;
type Product = Tables<"products">;
type OrderStatus = Database["public"]["Enums"]["order_status"];

interface OrderItem {
  product_id: string;
  product_name: string;
  hsn_code: string;
  batch_number: string;
  quantity: number;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  discount_flat: number;
  total_price: number;
  fromChallan?: boolean;
}

export default function PurchaseOrders() {
  const { toast } = useToast();
  const { user, isAdmin, isPharmacist } = useAuth();
  const { companyId, config, gstInclusive } = useBusiness();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // "/" shortcut — focus search bar
  useKeyboardShortcut({
    key: "/",
    callback: () => { searchRef.current?.focus(); searchRef.current?.select(); },
    enabled: true,
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemPrice, setItemPrice] = useState<number>(0);
  const [itemDiscount, setItemDiscount] = useState<number>(0);
  const [itemDiscountFlat, setItemDiscountFlat] = useState<number>(0);
  const [itemBatchNumber, setItemBatchNumber] = useState<string>("");
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

  const handleBillAction = async (order: any, action: "print" | "pdf" | "html" | "csv") => {
    setBillLoadingId(order.id);
    try {
      const { data: items, error } = await supabase
        .from("purchase_order_items")
        .select(`
          *,
          products (name, strength, hsn_code, gst_percentage)
        `)
        .eq("purchase_order_id", order.id);

      if (error) throw error;

      const billItems = (items || []).map((item) => {
        const product = item.products as any;
        return {
          product_name: `${product?.name || ""}${product?.strength ? ` ${product.strength}` : ""}`,
          batch_number: "-",
          hsn_code: product?.hsn_code || "",
          quantity: item.quantity,
          unit_price: Number(item.unit_price),
          gst_percentage: Number(item.gst_percentage),
          discount_percentage: Number(item.discount_percentage),
          total_price: Number(item.total_price),
        };
      });

      const subtotal = billItems.reduce((sum, item) => {
        return sum + item.unit_price * item.quantity * (1 - item.discount_percentage / 100);
      }, 0);

      const billData: BillData = {
        type: "purchase",
        invoice_number: order.invoice_number || order.challan_number || order.order_number,
        date: order.order_date,
        supplier_name: order.suppliers?.name || "-",
        items: billItems,
        subtotal,
        gst_amount: Number(order.gst_amount),
        discount_amount: Number(order.discount_amount),
        freight_charges: Number(order.freight_charges),
        handling_charges: Number(order.handling_charges),
        other_charges: Number(order.other_charges),
        total_amount: Number(order.total_amount),
      };

      if (action === "print") printBill(billData);
      else if (action === "pdf") downloadBillPDF(billData);
      else if (action === "html") downloadBillHTML(billData);
      else if (action === "csv") downloadBillCSV(billData);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBillLoadingId(null);
    }
  };

  const { data: purchaseOrders, isLoading } = useQuery({
    queryKey: ["purchase-orders", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(`
          *,
          suppliers (name)
        `)
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch invoice/discount settings
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

  const discountSettings = useMemo(() => {
    const s = invoiceSettings as any;
    return {
      discountMode: s?.discount_mode || "both",
      showDiscountRow: s?.show_discount_row ?? true,
      enableBillDiscount: s?.enable_bill_discount ?? true,
      billDiscountMode: s?.bill_discount_mode || "both",
      maxDiscountAdmin: Number(s?.max_discount_admin) || 100,
      maxDiscountPharmacist: Number(s?.max_discount_pharmacist) || 50,
      maxDiscountStaff: Number(s?.max_discount_staff) || 15,
      discountBeforeTax: s?.discount_before_tax ?? true,
    };
  }, [invoiceSettings]);

  const maxDiscountAllowed = useMemo(() => {
    if (isAdmin) return discountSettings.maxDiscountAdmin;
    if (isPharmacist) return discountSettings.maxDiscountPharmacist;
    return discountSettings.maxDiscountStaff;
  }, [isAdmin, isPharmacist, discountSettings]);

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
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("is_active", true)
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!companyId,
  });

  const { data: products, refetch: refetchProducts } = useQuery({
    queryKey: ["products-active", companyId],
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

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      // Validate duplicate challan/invoice number
      if (challanNumber) {
        const { data: existing, error: checkError } = await supabase
          .from("purchase_orders")
          .select("id")
          .eq("supplier_id", selectedSupplier)
          .or(
            isChallan 
              ? `challan_number.eq.${challanNumber}` 
              : `invoice_number.eq.${challanNumber}`
          )
          .limit(1);
        
        if (checkError) throw checkError;
        if (existing && existing.length > 0) {
          throw new Error(`${isChallan ? "Challan" : "Invoice"} number "${challanNumber}" already exists for this supplier.`);
        }
      }

      const orderNumber = `PO-${Date.now()}`;

      // Calculate item totals
      const itemsSubtotal = orderItems.reduce((sum, item) => {
        const base = item.unit_price * item.quantity;
        const afterDisc = Math.max(0, base * (1 - item.discount_percentage / 100) - item.discount_flat);
        return sum + afterDisc;
      }, 0);
      
      const gstAmount = gstInclusive
        ? orderItems.reduce((sum, item) => {
            const base = item.unit_price * item.quantity;
            const afterDisc = Math.max(0, base * (1 - item.discount_percentage / 100) - item.discount_flat);
            return sum + (afterDisc - afterDisc / (1 + item.gst_percentage / 100));
          }, 0)
        : orderItems.reduce((sum, item) => {
            const base = item.unit_price * item.quantity;
            const afterDisc = Math.max(0, base * (1 - item.discount_percentage / 100) - item.discount_flat);
            return sum + (afterDisc * item.gst_percentage / 100);
          }, 0);
      
      const discountAmount = orderItems.reduce((sum, item) => {
        const base = item.unit_price * item.quantity;
        return sum + (base * item.discount_percentage / 100) + item.discount_flat;
      }, 0);

      const totalCharges = freightCharges + handlingCharges + otherCharges;
      const subBeforeBillDisc = gstInclusive ? itemsSubtotal + totalCharges : itemsSubtotal + gstAmount + totalCharges;
      const totalAmount = Math.max(0, subBeforeBillDisc - billDiscountAmount);

      const { data: order, error: orderError } = await supabase
        .from("purchase_orders")
        .insert({
          order_number: orderNumber,
          supplier_id: selectedSupplier,
          expected_delivery_date: expectedDeliveryDate || null,
          notes: notes || null,
          total_amount: totalAmount,
          gst_amount: gstAmount,
          discount_amount: discountAmount + billDiscountAmount,
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

      // If invoice is merging challans, mark those challans as converted
      if (!isChallan && selectedChallanIds.length > 0) {
        const { error: updateError } = await supabase
          .from("purchase_orders")
          .update({ 
            converted_from_challan_id: order.id,
            is_challan: false 
          })
          .in("id", selectedChallanIds);
        
        if (updateError) {
          console.error("Error marking challans as converted:", updateError);
        }
      }

      // Only insert items that are NOT from challans
      const newItems = orderItems.filter(item => !item.fromChallan);
      if (newItems.length > 0) {
        const items = newItems.map((item) => ({
          purchase_order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          gst_percentage: item.gst_percentage,
          discount_percentage: item.discount_percentage,
          total_price: item.total_price,
          company_id: companyId,
        }));

        const { error: itemsError } = await supabase
          .from("purchase_order_items")
          .insert(items);

        if (itemsError) throw itemsError;
      }

      // Auto-receive: create inventory batches for all items immediately
      const allItemsToReceive = orderItems.filter(item => !item.fromChallan);
      if (allItemsToReceive.length > 0) {
        const today = new Date().toISOString().split("T")[0];
        const defaultExpiry = new Date();
        defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 2);
        const defaultExpiryStr = defaultExpiry.toISOString().split("T")[0];

        const batches = allItemsToReceive.map((item) => ({
          product_id: item.product_id,
          batch_number: item.batch_number || `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          quantity: item.quantity,
          purchase_price: item.unit_price,
          mrp: item.unit_price * 1.2,
          expiry_date: defaultExpiryStr,
          manufacturing_date: null,
          received_date: today,
          supplier_id: selectedSupplier || null,
          company_id: companyId,
        }));

        const { error: batchError } = await supabase
          .from("inventory_batches")
          .insert(batches);

        if (batchError) throw batchError;

        // Update order status to delivered since we auto-received
        await supabase
          .from("purchase_orders")
          .update({ status: "delivered" })
          .eq("id", order.id);
      }

      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Order created", description: "Purchase order has been created successfully." });
      handleCloseDialog();
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, skipReceive }: { id: string; status: OrderStatus; skipReceive?: boolean }) => {
      const { error } = await supabase
        .from("purchase_orders")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
      return { id, status, skipReceive };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
      toast({ title: "Status updated" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePOMutation = useMutation({
    mutationFn: async (orderId: string) => {
      // 1. Fetch PO items
      const { data: poItems, error: fetchErr } = await supabase
        .from("purchase_order_items")
        .select("id, product_id, quantity")
        .eq("purchase_order_id", orderId);
      if (fetchErr) throw fetchErr;

      // 2. Delete inventory batches created for this PO (match by product and approximate timing)
      // For scanned invoices and auto-received POs, batches were created at PO creation time
      for (const item of (poItems || [])) {
        // Find and reduce/delete matching batches
        const { data: batches } = await supabase
          .from("inventory_batches")
          .select("id, quantity")
          .eq("product_id", item.product_id)
          .eq("company_id", companyId!)
          .order("created_at", { ascending: false })
          .limit(5);
        
        let remainingToRestore = item.quantity;
        for (const batch of (batches || [])) {
          if (remainingToRestore <= 0) break;
          const newQty = Math.max(0, batch.quantity - remainingToRestore);
          remainingToRestore -= batch.quantity;
          await supabase
            .from("inventory_batches")
            .update({ quantity: newQty })
            .eq("id", batch.id);
        }
      }

      // 3. Unlink debit notes referencing this PO
      await supabase
        .from("debit_notes")
        .update({ original_order_id: null })
        .eq("original_order_id", orderId);

      // 4. Delete PO items
      for (const item of (poItems || [])) {
        await supabase.from("purchase_order_items").delete().eq("id", item.id);
      }

      // 5. Delete related payments
      await supabase
        .from("payments")
        .delete()
        .eq("reference_id", orderId)
        .eq("reference_type", "purchase_order");

      // 6. Delete the PO
      const { data: deleted, error: orderErr } = await supabase
        .from("purchase_orders")
        .delete()
        .eq("id", orderId)
        .select();
      if (orderErr) throw new Error(`Failed to delete PO: ${orderErr.message}`);
      if (!deleted || deleted.length === 0) throw new Error("PO could not be deleted. Check your permissions.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["payments-purchase"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
      toast({ title: "Purchase order deleted", description: "The PO, items, and inventory have been restored." });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setDeleteConfirmText("");
    },
    onError: (error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  const handleReceiveInventory = (orderId: string, supplierId: string) => {
    setSelectedOrderForReceive({ id: orderId, supplierId });
    setReceiveDialogOpen(true);
  };
  
  // Show linked challans for invoice
  const handleShowLinkedChallans = (invoiceId: string) => {
    setSelectedInvoiceForChallans(invoiceId);
    setLinkedChallansDialogOpen(true);
  };

  const handleCloseDialog = useCallback(() => {
    clearPODraft();
    setIsDialogOpen(false);
    setOrderItems([]);
    setSelectedSupplier("");
    setExpectedDeliveryDate("");
    setNotes("");
    setSelectedProduct("");
    setItemQuantity(1);
    setItemPrice(0);
    setItemDiscount(0);
    setItemDiscountFlat(0);
    setItemBatchNumber("");
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
  }, [clearPODraft]);

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────
  // "N" — open new purchase order dialog
  useKeyboardShortcut({
    key: "n",
    callback: () => setIsDialogOpen(true),
    enabled: !isDialogOpen && !editOrderDialogOpen && !receiveDialogOpen && !convertDialogOpen && !debitNoteOpen,
  });

  // Ctrl+Enter — create order (works from any input within dialog)
  useKeyboardShortcut({
    key: "Enter",
    modifiers: ["ctrl"],
    callback: () => {
      if (orderItems.length > 0 && selectedSupplier && !createOrderMutation.isPending) {
        createOrderMutation.mutate();
      }
    },
    enabled: isDialogOpen,
    allowInInput: true,
  });

  // Fetch pending challans for a supplier (only those not yet converted)
  const fetchPendingChallans = async (supplierId: string) => {
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("*")
      .eq("supplier_id", supplierId)
      .eq("is_challan", true)
      .is("converted_from_challan_id", null) // Only unconverted challans
      .order("order_date", { ascending: false });
    
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    
    setPendingChallans(data || []);
  };

  // Import items from selected challans
  const importChallanItems = async () => {
    if (selectedChallanIds.length === 0) return;

    try {
      const { data: items, error } = await supabase
        .from("purchase_order_items")
        .select(`
          *,
          products (name, strength, hsn_code, gst_percentage)
        `)
        .in("purchase_order_id", selectedChallanIds);

      if (error) throw error;

      const newItems: OrderItem[] = items.map((item) => ({
        product_id: item.product_id,
        product_name: `${(item.products as any).name}${(item.products as any).strength ? ` ${(item.products as any).strength}` : ""}`,
        hsn_code: (item.products as any).hsn_code || "",
        batch_number: "",
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        gst_percentage: Number(item.gst_percentage),
        discount_percentage: Number(item.discount_percentage),
        discount_flat: 0,
        total_price: Number(item.total_price),
        fromChallan: true,
      }));

      // Add challan items to the list (don't merge - keep separate)
      setOrderItems((prev) => [...prev, ...newItems]);
      toast({ 
        title: "Items Imported", 
        description: `${newItems.length} items imported from ${selectedChallanIds.length} challan(s). These items are locked and cannot be modified.` 
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Convert challan to invoice mutation
  const convertToInvoiceMutation = useMutation({
    mutationFn: async ({ challanId, invoiceNumber }: { challanId: string; invoiceNumber: string }) => {
      const { error } = await supabase
        .from("purchase_orders")
        .update({
          is_challan: false,
          invoice_number: invoiceNumber,
        })
        .eq("id", challanId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Converted to Invoice", description: "Challan has been converted to an invoice successfully." });
      setConvertDialogOpen(false);
      setSelectedChallanId(null);
      setNewInvoiceNumber("");
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleConvertToInvoice = (orderId: string) => {
    setSelectedChallanId(orderId);
    setNewInvoiceNumber(`INV-${Date.now()}`);
    setConvertDialogOpen(true);
  };

  const handleProductSelect = (productId: string) => {
    setSelectedProduct(productId);
    const product = products?.find((p) => p.id === productId);
    if (product) {
      setItemPrice(Number(product.purchase_price));
    }
  };

  const handleAddItem = () => {
    if (!selectedProduct || itemQuantity <= 0 || itemPrice <= 0) return;

    const product = products?.find((p) => p.id === selectedProduct);
    if (!product) return;

    const gstPercentage = Number(product.gst_percentage);
    const totalPrice = calculateItemTotal(itemPrice, itemQuantity, gstPercentage, itemDiscount, itemDiscountFlat);

    // Find existing non-challan item with same product to merge quantities
    const existingIndex = orderItems.findIndex(
      (item) => item.product_id === selectedProduct && !item.fromChallan
    );

    if (existingIndex >= 0) {
      const newItems = [...orderItems];
      newItems[existingIndex].quantity += itemQuantity;
      newItems[existingIndex].total_price = calculateItemTotal(
        itemPrice,
        newItems[existingIndex].quantity,
        gstPercentage,
        itemDiscount,
        itemDiscountFlat
      );
      setOrderItems(newItems);
    } else {
      // Always add as new line (don't merge with challan items)
      setOrderItems([
        ...orderItems,
        {
          product_id: product.id,
          product_name: `${product.name}${product.strength ? ` ${product.strength}` : ""}`,
          hsn_code: product.hsn_code || "",
          batch_number: itemBatchNumber || `BATCH-${Date.now()}`,
          quantity: itemQuantity,
          unit_price: itemPrice,
          gst_percentage: gstPercentage,
          discount_percentage: itemDiscount,
          discount_flat: itemDiscountFlat,
          total_price: totalPrice,
          fromChallan: false,
        },
      ]);
    }

    setSelectedProduct("");
    setItemQuantity(1);
    setItemPrice(0);
    setItemDiscount(0);
    setItemDiscountFlat(0);
    setItemBatchNumber("");
  };

  const updateOrderItem = (index: number, field: keyof OrderItem, value: string | number) => {
    const updated = [...orderItems];
    (updated[index] as any)[field] = value;
    // Recalculate total
    const item = updated[index];
    item.total_price = calculateItemTotal(item.unit_price, item.quantity, item.gst_percentage, item.discount_percentage, item.discount_flat);
    setOrderItems(updated);
  };

  const calculateItemTotal = (price: number, qty: number, gst: number, discount: number, discountFlat: number = 0) => {
    const basePrice = price * qty;
    const afterPctDiscount = basePrice * (1 - discount / 100);
    const discountedPrice = Math.max(0, afterPctDiscount - discountFlat);
    if (gstInclusive) return discountedPrice;
    const gstAmount = discountedPrice * (gst / 100);
    return discountedPrice + gstAmount;
  };

  const removeItem = (index: number) => {
    const item = orderItems[index];
    if (item.fromChallan) {
      toast({ 
        title: "Cannot Remove", 
        description: "Items imported from challans cannot be removed.", 
        variant: "destructive" 
      });
      return;
    }
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  // Calculate totals
  const grossTotal = orderItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  const totalItemDiscount = orderItems.reduce((sum, item) => {
    const base = item.unit_price * item.quantity;
    const pctDisc = base * item.discount_percentage / 100;
    return sum + pctDisc + item.discount_flat;
  }, 0);

  const itemsSubtotal = orderItems.reduce((sum, item) => {
    const base = item.unit_price * item.quantity;
    const afterDisc = Math.max(0, base * (1 - item.discount_percentage / 100) - item.discount_flat);
    return sum + afterDisc;
  }, 0);
  
  const totalGst = gstInclusive
    ? orderItems.reduce((sum, item) => {
        const base = item.unit_price * item.quantity;
        const afterDisc = Math.max(0, base * (1 - item.discount_percentage / 100) - item.discount_flat);
        return sum + (afterDisc - afterDisc / (1 + item.gst_percentage / 100));
      }, 0)
    : orderItems.reduce((sum, item) => {
        const base = item.unit_price * item.quantity;
        const afterDisc = Math.max(0, base * (1 - item.discount_percentage / 100) - item.discount_flat);
        return sum + (afterDisc * item.gst_percentage / 100);
      }, 0);
  
  const totalCharges = freightCharges + handlingCharges + otherCharges;
  
  // Bill-level discount
  const subtotalBeforeBillDiscount = gstInclusive ? itemsSubtotal + totalCharges : itemsSubtotal + totalGst + totalCharges;
  const billDiscountAmount = (subtotalBeforeBillDiscount * billDiscountPercent / 100) + billDiscountFlat;
  const totalDiscountAmount = totalItemDiscount + billDiscountAmount;
  
  const grandTotal = Math.max(0, subtotalBeforeBillDiscount - billDiscountAmount);

  const filteredOrders = purchaseOrders?.filter(
    (order) =>
      order.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.suppliers as any)?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "default";
      case "pending": return "secondary";
      case "shipped": return "outline";
      case "delivered": return "default";
      case "cancelled": return "destructive";
      default: return "outline";
    }
  };

  const handleProductCreated = (productId: string) => {
    refetchProducts();
    setSelectedProduct(productId);
    const product = products?.find((p) => p.id === productId);
    if (product) {
      setItemPrice(Number(product.purchase_price));
    }
  };

  const handleSupplierCreated = (supplierId: string) => {
    refetchSuppliers();
    setSelectedSupplier(supplierId);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Purchase Orders</h1>
          <p className="text-muted-foreground">Manage orders from suppliers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setDebitNoteOpen(true)}>
            <RotateCcw className="h-4 w-4" />
            Debit Note
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Order
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Purchase Order</DialogTitle>
              <DialogDescription>Order products from a supplier</DialogDescription>
            </DialogHeader>
            {draftRestored && (
              <div className="flex items-center gap-3 rounded-md border border-border bg-muted px-4 py-2.5 text-sm text-foreground">
                <span className="text-base">💾</span>
                <span className="flex-1 font-medium">Draft restored — your previous unsaved order was recovered.</span>
                <button
                  onClick={() => { clearPODraft(); setOrderItems([]); setSelectedSupplier(""); setExpectedDeliveryDate(""); setNotes(""); setFreightCharges(0); setHandlingCharges(0); setOtherCharges(0); setChallanNumber(""); setIsChallan(true); setDraftRestored(false); }}
                  className="text-xs underline hover:no-underline opacity-70 hover:opacity-100"
                >
                  Discard draft
                </button>
              </div>
            )}
            <div className="space-y-6">
              {/* Supplier Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Supplier *</Label>
                  <div className="flex gap-2">
                    <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers?.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setShowSupplierDialog(true)}
                      title="Add new supplier"
                    >
                      <PlusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Expected Delivery Date</Label>
                  <Input
                    type="date"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Challan/Invoice Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Document Type</Label>
                  <Select 
                    value={isChallan ? "challan" : "invoice"} 
                    onValueChange={(v) => {
                      const isNowChallan = v === "challan";
                      setIsChallan(isNowChallan);
                      if (!isNowChallan && selectedSupplier) {
                        fetchPendingChallans(selectedSupplier);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="challan">Challan (Temporary)</SelectItem>
                      <SelectItem value="invoice">Invoice (Final)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isChallan ? "Challan Number" : "Invoice Number"}</Label>
                  <Input
                    placeholder={isChallan ? "Supplier challan no." : "Supplier invoice no."}
                    value={challanNumber}
                    onChange={(e) => setChallanNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs block">
                    {isChallan 
                      ? "Challan is a temporary goods receipt. Convert to invoice when bill arrives."
                      : "Invoice is the final billing document from supplier."}
                  </Label>
                </div>
              </div>
              
              {/* Pending Challans Selection for Invoice */}
              {!isChallan && selectedSupplier && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Merge Pending Challans
                    </CardTitle>
                    <CardDescription>Select challans to include in this invoice</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!showChallanSelector ? (
                      <Button 
                        type="button"
                        variant="outline" 
                        className="w-full"
                        onClick={() => {
                          fetchPendingChallans(selectedSupplier);
                          setShowChallanSelector(true);
                        }}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        View Pending Challans from this Supplier
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        {pendingChallans.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No pending challans from this supplier
                          </p>
                        ) : (
                          <>
                            {pendingChallans.map((challan) => (
                              <div key={challan.id} className="flex items-center gap-3 p-2 rounded border bg-background">
                                <input
                                  type="checkbox"
                                  checked={selectedChallanIds.includes(challan.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedChallanIds([...selectedChallanIds, challan.id]);
                                    } else {
                                      setSelectedChallanIds(selectedChallanIds.filter(id => id !== challan.id));
                                    }
                                  }}
                                  className="h-4 w-4 rounded border-muted-foreground"
                                />
                                <div className="flex-1">
                                  <p className="text-sm font-medium">
                                    {challan.challan_number || challan.order_number}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {format(new Date(challan.order_date), "dd/MM/yyyy")} • ₹{Number(challan.total_amount).toFixed(2)}
                                  </p>
                                </div>
                              </div>
                            ))}
                            {selectedChallanIds.length > 0 && (
                              <Button 
                                type="button"
                                variant="secondary" 
                                className="w-full mt-2"
                                onClick={importChallanItems}
                              >
                                Import Items from {selectedChallanIds.length} Challan(s)
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Add Product */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Add Products</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-8 gap-3">
                    <div className="md:col-span-2">
                      <Label>Product</Label>
                      <div className="flex gap-2">
                        <DrugBrandSearch
                          products={products}
                          selectedProductId={selectedProduct}
                          onSelect={handleProductSelect}
                          showPrice
                          priceType="purchase"
                          placeholder="Search by drug or brand..."
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
                    {config.hasBatchTracking && (
                      <div>
                        <Label>Batch No.</Label>
                        <Input
                          placeholder="e.g. BT-2024-01"
                          value={itemBatchNumber}
                          onChange={(e) => setItemBatchNumber(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && selectedProduct && itemPrice > 0) {
                              e.preventDefault();
                              handleAddItem();
                            }
                          }}
                        />
                      </div>
                    )}
                    <div>
                      <Label>Unit Price (₹)</Label>
                      <Input
                        id="po-price-input"
                        type="number"
                        min={0}
                        step={0.01}
                        value={itemPrice || ""}
                        onChange={(e) => setItemPrice(parseFloat(e.target.value) || 0)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && selectedProduct && itemPrice > 0) {
                            e.preventDefault();
                            handleAddItem();
                          }
                        }}
                      />
                    </div>
                    <div>
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        min={1}
                        value={itemQuantity}
                        onChange={(e) => setItemQuantity(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && selectedProduct && itemPrice > 0) {
                            e.preventDefault();
                            handleAddItem();
                          }
                        }}
                      />
                    </div>
                    {(discountSettings.discountMode === "percentage" || discountSettings.discountMode === "both") && (
                    <div>
                      <Label>Disc %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={maxDiscountAllowed}
                        step={0.1}
                        value={itemDiscount || ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          if (val > maxDiscountAllowed) {
                            toast({ title: "Limit exceeded", description: `Max discount for your role: ${maxDiscountAllowed}%`, variant: "destructive" });
                            return;
                          }
                          setItemDiscount(val);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && selectedProduct && itemPrice > 0) {
                            e.preventDefault();
                            handleAddItem();
                          }
                        }}
                        placeholder="0"
                      />
                    </div>
                    )}
                    {(discountSettings.discountMode === "flat" || discountSettings.discountMode === "both") && (
                    <div>
                      <Label>Disc ₹</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={itemDiscountFlat || ""}
                        onChange={(e) => setItemDiscountFlat(parseFloat(e.target.value) || 0)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && selectedProduct && itemPrice > 0) {
                            e.preventDefault();
                            handleAddItem();
                          }
                        }}
                        placeholder="0"
                      />
                    </div>
                    )}
                    <div className="flex items-end">
                      <Button onClick={handleAddItem} className="w-full" disabled={!selectedProduct || itemPrice <= 0} title="Add item (Enter)">
                        Add
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Order Items */}
              {orderItems.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Order Items <span className="text-xs font-normal text-muted-foreground ml-2">— inventory will be auto-received on save</span></CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            {config.hasBatchTracking && <TableHead>Batch No.</TableHead>}
                            <TableHead>Price (₹)</TableHead>
                            <TableHead>Qty</TableHead>
                            <TableHead>GST%</TableHead>
                            {(discountSettings.discountMode === "percentage" || discountSettings.discountMode === "both") && <TableHead>Disc%</TableHead>}
                            {(discountSettings.discountMode === "flat" || discountSettings.discountMode === "both") && <TableHead>Disc ₹</TableHead>}
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderItems.map((item, index) => (
                            <TableRow key={index} className={item.fromChallan ? "bg-muted/30" : ""}>
                              <TableCell className="font-medium min-w-[150px]">
                                <div className="flex items-center gap-2">
                                  {item.fromChallan && <Lock className="h-3 w-3 text-muted-foreground" />}
                                  {item.product_name}
                                  {item.fromChallan && (
                                    <Badge variant="outline" className="text-xs">Challan</Badge>
                                  )}
                                </div>
                              </TableCell>
                              {config.hasBatchTracking && (
                                <TableCell>
                                  {item.fromChallan ? (
                                    <span className="text-muted-foreground text-xs">{item.batch_number || "-"}</span>
                                  ) : (
                                    <Input
                                      value={item.batch_number}
                                      onChange={(e) => updateOrderItem(index, "batch_number", e.target.value)}
                                      className="w-28 h-8"
                                      placeholder="Batch no."
                                    />
                                  )}
                                </TableCell>
                              )}
                              <TableCell>
                                {item.fromChallan ? (
                                  <span>₹{item.unit_price.toFixed(2)}</span>
                                ) : (
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={item.unit_price}
                                    onChange={(e) => updateOrderItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                                    className="w-24 h-8"
                                  />
                                )}
                              </TableCell>
                              <TableCell>
                                {item.fromChallan ? (
                                  <span>{item.quantity}</span>
                                ) : (
                                  <Input
                                    type="number"
                                    min={1}
                                    value={item.quantity}
                                    onChange={(e) => updateOrderItem(index, "quantity", e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                                    className="w-16 h-8 text-center"
                                  />
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{item.gst_percentage}%</TableCell>
                              {(discountSettings.discountMode === "percentage" || discountSettings.discountMode === "both") && (
                              <TableCell>
                                {item.fromChallan ? (
                                  <span>{item.discount_percentage}%</span>
                                ) : (
                                  <Input
                                    type="number"
                                    min={0}
                                    max={maxDiscountAllowed}
                                    step={0.1}
                                    value={item.discount_percentage}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      if (val > maxDiscountAllowed) {
                                        toast({ title: "Limit exceeded", description: `Max discount for your role: ${maxDiscountAllowed}%`, variant: "destructive" });
                                        return;
                                      }
                                      updateOrderItem(index, "discount_percentage", val);
                                    }}
                                    className="w-16 h-8 text-center"
                                    placeholder="0"
                                  />
                                )}
                              </TableCell>
                              )}
                              {(discountSettings.discountMode === "flat" || discountSettings.discountMode === "both") && (
                              <TableCell>
                                {item.fromChallan ? (
                                  <span>₹{item.discount_flat}</span>
                                ) : (
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.5}
                                    value={item.discount_flat || ""}
                                    onChange={(e) => updateOrderItem(index, "discount_flat", parseFloat(e.target.value) || 0)}
                                    className="w-20 h-8 text-center"
                                    placeholder="0"
                                  />
                                )}
                              </TableCell>
                              )}
                              <TableCell className="text-right font-medium">₹{item.total_price.toFixed(2)}</TableCell>
                              <TableCell>
                                {!item.fromChallan && (
                                  <Button variant="ghost" size="icon" onClick={() => removeItem(index)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Other Charges */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Other Charges</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Freight Charges (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={freightCharges || ""}
                        onChange={(e) => setFreightCharges(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Handling Charges (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={handlingCharges || ""}
                        onChange={(e) => setHandlingCharges(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Other Charges (₹)</Label>
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
              {orderItems.length > 0 && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="space-y-2 text-sm">
                      {discountSettings.showDiscountRow && totalItemDiscount > 0 && (
                        <>
                          <div className="flex justify-between">
                            <span>Gross Total:</span>
                            <span>₹{grossTotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-primary">
                            <span>Item Discount:</span>
                            <span>-₹{totalItemDiscount.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between">
                        <span>{gstInclusive ? "Net Total (GST Inclusive):" : "Subtotal:"}</span>
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
                      {billDiscountAmount > 0 && (
                        <div className="flex justify-between text-primary font-medium">
                          <span>Bill Discount:</span>
                          <span>-₹{billDiscountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Grand Total:</span>
                        <span>₹{grandTotal.toFixed(2)}</span>
                      </div>
                      {totalDiscountAmount > 0 && (
                        <div className="text-xs text-primary text-right">
                          You saved ₹{totalDiscountAmount.toFixed(2)} on this order
                        </div>
                      )}
                    </div>

                    {/* Bill-level discount inputs */}
                    {discountSettings.enableBillDiscount && (
                      <div className="mt-4 pt-3 border-t border-border">
                        <Label className="text-xs font-medium mb-2 block">Bill-Level Discount</Label>
                        <div className="flex gap-3">
                          {(discountSettings.billDiscountMode === "percentage" || discountSettings.billDiscountMode === "both") && (
                            <div className="space-y-1 flex-1">
                              <Label className="text-xs text-muted-foreground">Discount %</Label>
                              <Input
                                type="number" min={0} max={maxDiscountAllowed} step={0.1}
                                value={billDiscountPercent || ""}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setBillDiscountPercent(Math.min(val, maxDiscountAllowed));
                                }}
                                className="h-8"
                                placeholder="0"
                              />
                            </div>
                          )}
                          {(discountSettings.billDiscountMode === "flat" || discountSettings.billDiscountMode === "both") && (
                            <div className="space-y-1 flex-1">
                              <Label className="text-xs text-muted-foreground">Discount ₹</Label>
                              <Input
                                type="number" min={0} step={1}
                                value={billDiscountFlat || ""}
                                onChange={(e) => setBillDiscountFlat(parseFloat(e.target.value) || 0)}
                                className="h-8"
                                placeholder="0"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes for this order"
                  rows={3}
                />
              </div>

              <DialogFooter>
                <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Enter</kbd> add item
                  <span className="mx-1">·</span>
                  <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Ctrl+Enter</kbd> create order
                </div>
                <Button variant="outline" onClick={handleCloseDialog}>Cancel</Button>
                <Button
                  onClick={() => createOrderMutation.mutate()}
                  disabled={orderItems.length === 0 || !selectedSupplier || createOrderMutation.isPending}
                  onKeyDown={(e) => {
                    if (e.ctrlKey && e.key === "Enter") {
                      e.preventDefault();
                      if (orderItems.length > 0 && selectedSupplier && !createOrderMutation.isPending) {
                        createOrderMutation.mutate();
                      }
                    }
                  }}
                >
                  Create Order (₹{grandTotal.toFixed(2)})
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
                placeholder="Search orders... ( / )"
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
            <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
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
                    <TableHead>Challan/Invoice #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Actions</TableHead>
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
                        else if (e.key === "r" || e.key === "R") {
                          if (order.status !== "delivered" && order.status !== "cancelled") {
                            e.preventDefault();
                            handleReceiveInventory(order.id, order.supplier_id);
                          }
                        }
                        else if (e.key === "e" || e.key === "E") {
                          e.preventDefault();
                          setEditOrderId(order.id);
                          setEditOrderDialogOpen(true);
                        }
                        else if (e.key === "$") {
                          const paid = paidByPoId[order.id] || 0;
                          const supplierName = (order.suppliers as any)?.name || "-";
                          e.preventDefault();
                          setPaymentDialog({
                            referenceId: order.id,
                            referenceNumber: order.invoice_number || order.order_number,
                            partyName: supplierName,
                            totalAmount: Number(order.total_amount),
                            paidAmount: paid,
                          });
                        }
                      }}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-medium">{order.order_number}</TableCell>
                      <TableCell>
                        <Badge variant={(order as any).is_challan ? "secondary" : "default"}>
                          {(order as any).is_challan ? "Challan" : "Invoice"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(order as any).is_challan 
                          ? (order as any).challan_number || "-"
                          : (order as any).invoice_number || "-"}
                      </TableCell>
                      <TableCell>{(order.suppliers as any)?.name || "-"}</TableCell>
                      <TableCell>{format(new Date(order.order_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(order.status)}>{order.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">₹{Number(order.total_amount).toFixed(2)}</TableCell>
                      <TableCell>
                        {(() => {
                          const paid = paidByPoId[order.id] || 0;
                          const balance = Number(order.total_amount) - paid;
                          const isPaid = balance <= 0.01;
                          const isPartial = paid > 0 && !isPaid;
                          const supplierName = (order.suppliers as any)?.name || "-";
                          return (
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-7 text-xs gap-1 px-2 ${isPaid ? "text-green-600" : isPartial ? "text-amber-600" : "text-destructive"}`}
                              onClick={() => setPaymentDialog({
                                referenceId: order.id,
                                referenceNumber: order.invoice_number || order.order_number,
                                partyName: supplierName,
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
                        <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Bill dropdown - available to all */}
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
                                <Printer className="h-4 w-4 mr-2" /> Print
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

                          {/* Edit bill button */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditOrderId(order.id);
                              setEditOrderDialogOpen(true);
                            }}
                            title="Edit bill"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {order.status === "delivered" || order.status === "cancelled" ? (
                            <div className="flex items-center gap-1 text-muted-foreground text-sm px-2">
                              <Lock className="h-3 w-3" />
                              <span className="capitalize">{order.status}</span>
                            </div>
                          ) : (
                            <>
                              {/* Receive button - primary action to deliver and add to inventory */}
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleReceiveInventory(order.id, order.supplier_id)}
                                title="Receive to Inventory (Mark as Delivered)"
                                className="gap-1"
                              >
                                <Package className="h-4 w-4" />
                                Receive
                              </Button>
                              
                              {/* Status dropdown - only for non-delivered status changes */}
                              <Select
                                value={order.status}
                                onValueChange={(status: OrderStatus) => {
                                  if (status === "delivered") {
                                    handleReceiveInventory(order.id, order.supplier_id);
                                    return;
                                  }
                                  updateStatusMutation.mutate({ id: order.id, status, skipReceive: true });
                                }}
                              >
                                <SelectTrigger className="w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="confirmed">Confirmed</SelectItem>
                                  <SelectItem value="shipped">Shipped</SelectItem>
                                  <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                              </Select>
                            </>
                          )}
                          
                          {/* Convert challan to invoice (only for non-delivered challans) */}
                          {(order as any).is_challan && order.status !== "delivered" && order.status !== "cancelled" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConvertToInvoice(order.id)}
                              title="Convert to Invoice"
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          )}
                          
                          {/* View linked challans for invoices */}
                          {!(order as any).is_challan && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleShowLinkedChallans(order.id)}
                              title="View Linked Challans"
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                          )}

                          {/* Delete PO - admin only */}
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
                              title="Delete PO"
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

      {/* Inline Add Dialogs */}
      <ProductFormDialog
        open={showProductDialog}
        onOpenChange={setShowProductDialog}
        onSuccess={handleProductCreated}
      />
      <SupplierFormDialog
        open={showSupplierDialog}
        onOpenChange={setShowSupplierDialog}
        onSuccess={handleSupplierCreated}
      />

      {/* Convert Challan to Invoice Dialog */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert Challan to Invoice</DialogTitle>
            <DialogDescription>
              Enter the invoice number from the supplier's bill
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Invoice Number *</Label>
              <Input
                value={newInvoiceNumber}
                onChange={(e) => setNewInvoiceNumber(e.target.value)}
                placeholder="Enter supplier invoice number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selectedChallanId && convertToInvoiceMutation.mutate({
                challanId: selectedChallanId,
                invoiceNumber: newInvoiceNumber
              })}
              disabled={!newInvoiceNumber || convertToInvoiceMutation.isPending}
            >
              <FileText className="h-4 w-4 mr-2" />
              Convert to Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Receive Inventory Dialog */}
      <ReceiveInventoryDialog
        open={receiveDialogOpen}
        onOpenChange={setReceiveDialogOpen}
        orderId={selectedOrderForReceive?.id || null}
        supplierId={selectedOrderForReceive?.supplierId || null}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
          queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
        }}
      />
      
      {/* Linked Challans Dialog */}
      <LinkedChallansDialog
        open={linkedChallansDialogOpen}
        onOpenChange={setLinkedChallansDialogOpen}
        invoiceId={selectedInvoiceForChallans}
      />

      {/* Edit Purchase Order Dialog */}
      <EditPurchaseOrderDialog
        open={editOrderDialogOpen}
        onOpenChange={setEditOrderDialogOpen}
        orderId={editOrderId}
      />

      {/* Debit Note Dialog */}
      <DebitNoteDialog
        open={debitNoteOpen}
        onOpenChange={setDebitNoteOpen}
      />

      {/* Record Payment Dialog */}
      {paymentDialog && (
        <RecordPaymentDialog
          open={!!paymentDialog}
          onOpenChange={(open) => { if (!open) setPaymentDialog(null); queryClient.invalidateQueries({ queryKey: ["payments-purchase"] }); }}
          referenceType="purchase_order"
          referenceId={paymentDialog.referenceId}
          referenceNumber={paymentDialog.referenceNumber}
          partyName={paymentDialog.partyName}
          partyType="supplier"
          totalAmount={paymentDialog.totalAmount}
          paidAmount={paymentDialog.paidAmount}
          paymentType="made"
        />
      )}
    </div>
  );
}

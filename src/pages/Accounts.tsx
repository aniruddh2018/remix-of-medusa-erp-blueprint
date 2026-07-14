import React, { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import type {
  LedgerBalanceWithName, LedgerTransaction, Ledger, LedgerGroup, LedgerGroupNode,
  LedgerRoleType, LedgerGroupType, LedgerListResponse, CreateLedgerRequest,
  CreateLedgerGroupRequest, TrialBalanceResult, LedgerAuditEntry, CsvLedgerRow,
  FinancialYearCloseResult,
} from "@/types/ledger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Banknote, Search, TrendingUp, TrendingDown, AlertCircle,
  CheckCircle2, Clock, FileText, ReceiptText, BarChart3, Lock,
  Download, Trash2, Users, Building2, Loader2, AlertTriangle, CreditCard,
  ChevronDown, ChevronRight, FileDown, BookOpen, Filter,
  Plus, Pencil, Scale, Merge, History, FileSpreadsheet, ClipboardCheck,
  RefreshCw, Upload, XCircle, ArrowUpDown, Truck, Factory, User, Receipt,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { RecordPaymentDialog } from "@/components/dialogs/RecordPaymentDialog";
import { useInvoiceSettings } from "@/hooks/useInvoiceSettings";
import { generateLedgerPDF } from "@/utils/ledgerPdfGenerator";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { CreditCustomersTab } from "@/components/CreditCustomersTab";
import * as ledgerService from "@/services/ledgerService";
import * as ledgerAdvanced from "@/services/ledgerAdvancedService";
import { syncLedgerToCustomer, syncLedgerToSupplier } from "@/services/ledgerBridge";
import { parse as csvParse } from "papaparse";

// ─── helpers ────────────────────────────────────────────────────────────────
function paymentStatusBadge(paid: number, total: number) {
  const balance = total - paid;
  if (balance <= 0) return <Badge className="bg-green-600/15 text-green-700 border-green-200">Paid</Badge>;
  if (paid > 0) return <Badge className="bg-amber-500/15 text-amber-700 border-amber-200">Partial</Badge>;
  return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">Unpaid</Badge>;
}

const MONTHS = [
  { label: "This Month", value: "0" },
  { label: "Last Month", value: "1" },
  { label: "Last 3 Months", value: "3" },
  { label: "Last 6 Months", value: "6" },
  { label: "This Year", value: "12" },
  { label: "Custom Range", value: "custom" },
];

const ROLE_COLORS: Record<string, string> = {
  customer: 'bg-blue-100 text-blue-800', supplier: 'bg-orange-100 text-orange-800',
  manufacturer: 'bg-purple-100 text-purple-800', distributor: 'bg-teal-100 text-teal-800',
  employee: 'bg-slate-100 text-slate-800', doctor: 'bg-green-100 text-green-800',
  bank: 'bg-cyan-100 text-cyan-800', tax: 'bg-red-100 text-red-800',
  expense: 'bg-amber-100 text-amber-800', income: 'bg-emerald-100 text-emerald-800',
  asset: 'bg-indigo-100 text-indigo-800', liability: 'bg-rose-100 text-rose-800',
};

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${(c ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function Accounts() {
  const { toast } = useToast();
  const { user, isAdmin, isPharmacist } = useAuth();
  const { companyId, activeFinancialYearId } = useBusiness();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcut({ key: "/", callback: () => { searchRef.current?.focus(); searchRef.current?.select(); } });
  const [monthRange, setMonthRange] = useState("0");
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [expandedLedger, setExpandedLedger] = useState<string | null>(null);
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [ledgerRoleFilter, setLedgerRoleFilter] = useState<string>("all");
  const { settings: invoiceSettings } = useInvoiceSettings();
  const [paymentDialog, setPaymentDialog] = useState<null | {
    referenceType: "sales_order" | "purchase_order" | "credit_note" | "debit_note";
    referenceId: string;
    referenceNumber: string;
    partyName: string;
    partyType: "customer" | "supplier";
    totalAmount: number;
    paidAmount: number;
    paymentType: "received" | "made";
  }>(null);

  // Delete payment state
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);
  const [deletePaymentConfirmOpen, setDeletePaymentConfirmOpen] = useState(false);

  // Date filter
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    if (monthRange === "custom") {
      const s = customStart ? new Date(customStart) : startOfMonth(now);
      const e = customEnd ? new Date(customEnd) : endOfMonth(now);
      return { startDate: s.toISOString(), endDate: e.toISOString() };
    }
    const months = parseInt(monthRange);
    if (months === 0) {
      return { startDate: startOfMonth(now).toISOString(), endDate: endOfMonth(now).toISOString() };
    }
    if (months === 12) {
      return { startDate: new Date(now.getFullYear(), 0, 1).toISOString(), endDate: endOfMonth(now).toISOString() };
    }
    return { startDate: subMonths(startOfMonth(now), months - 1).toISOString(), endDate: endOfMonth(now).toISOString() };
  }, [monthRange, customStart, customEnd]);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: payments } = useQuery({
    queryKey: ["payments", startDate, endDate, companyId, activeFinancialYearId],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select("*")
        .eq("company_id", companyId!)
        .gte("payment_date", startDate.split("T")[0])
        .lte("payment_date", endDate.split("T")[0]);
      if (activeFinancialYearId) q = q.eq("financial_year_id", activeFinancialYearId);
      const { data, error } = await q.order("payment_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: allPayments } = useQuery({
    queryKey: ["all-payments", companyId, activeFinancialYearId],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select("*")
        .eq("company_id", companyId!);
      if (activeFinancialYearId) q = q.eq("financial_year_id", activeFinancialYearId);
      const { data, error } = await q.order("payment_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: salesOrders } = useQuery({
    queryKey: ["sales-orders-accounts", startDate, endDate, companyId, activeFinancialYearId],
    queryFn: async () => {
      let q = supabase
        .from("sales_orders")
        .select("id, invoice_number, customer_name, total_amount, sale_date, payment_method, status")
        .eq("company_id", companyId!)
        .gte("sale_date", startDate.split("T")[0])
        .lte("sale_date", endDate.split("T")[0]);
      if (activeFinancialYearId) q = q.eq("financial_year_id", activeFinancialYearId);
      const { data, error } = await q.order("sale_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: purchaseOrders } = useQuery({
    queryKey: ["purchase-orders-accounts", startDate, endDate, companyId, activeFinancialYearId],
    queryFn: async () => {
      let q = supabase
        .from("purchase_orders")
        .select("id, order_number, invoice_number, challan_number, total_amount, order_date, status, supplier_id")
        .eq("company_id", companyId!)
        .gte("order_date", startDate.split("T")[0])
        .lte("order_date", endDate.split("T")[0]);
      if (activeFinancialYearId) q = q.eq("financial_year_id", activeFinancialYearId);
      const { data, error } = await q.order("order_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-basic", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").eq("company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-basic-accounts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name, phone").eq("company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Real ledger balances from DB (replaces in-memory unifiedLedger)
  const { data: ledgerBalances } = useQuery({
    queryKey: ["ledger-balances", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_balances_with_names")
        .select("*")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
    enabled: !!companyId,
  });

  // Transaction history for expanded ledger (use party view for complete history)
  const { data: expandedLedgerTxs } = useQuery({
    queryKey: ["party-transactions", expandedLedger],
    queryFn: async () => {
      if (!expandedLedger) return [];
      const { data, error } = await supabase
        .rpc("get_party_transactions", {
          p_ledger_id: expandedLedger,
          p_year: null,
          p_limit: 100,
          p_offset: 0,
        });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
    enabled: !!expandedLedger,
  });

  // Transaction history for expanded supplier (use party view for complete history)
  const { data: expandedSupplierTxs } = useQuery({
    queryKey: ["party-transactions", expandedSupplier],
    queryFn: async () => {
      if (!expandedSupplier) return [];
      const { data, error } = await supabase
        .rpc("get_party_transactions", {
          p_ledger_id: expandedSupplier,
          p_year: null,
          p_limit: 100,
          p_offset: 0,
        });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
    enabled: !!expandedSupplier,
  });

  // GST data
  const { data: salesItems } = useQuery({
    queryKey: ["sales-items-gst", startDate, endDate, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_order_items")
        .select(`
          quantity, unit_price, gst_percentage, discount_percentage, total_price,
          product_id,
          products(name, hsn_code),
          sales_orders!inner(sale_date, status, invoice_number)
        `)
        .eq("company_id", companyId!)
        .gte("sales_orders.sale_date", startDate.split("T")[0])
        .lte("sales_orders.sale_date", endDate.split("T")[0])
        .neq("sales_orders.status", "cancelled");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: purchaseItems } = useQuery({
    queryKey: ["purchase-items-gst", startDate, endDate, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select(`
          quantity, unit_price, gst_percentage, discount_percentage, total_price,
          product_id,
          products(name, hsn_code),
          purchase_orders!inner(order_date, status)
        `)
        .eq("company_id", companyId!)
        .gte("purchase_orders.order_date", startDate.split("T")[0])
        .lte("purchase_orders.order_date", endDate.split("T")[0])
        .neq("purchase_orders.status", "cancelled");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Delete payment mutation
  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.from("payments").delete().eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Payment deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["all-payments"] });
      queryClient.invalidateQueries({ queryKey: ["payments-sales"] });
      queryClient.invalidateQueries({ queryKey: ["payments-purchase"] });
      queryClient.invalidateQueries({ queryKey: ["ledger-balances"] });
      queryClient.invalidateQueries({ queryKey: ["ledger-transactions"] });
      setDeletePaymentConfirmOpen(false);
      setDeletePaymentId(null);
    },
    onError: (e: any) => {
      toast({ title: "Failed to delete payment", description: e.message, variant: "destructive" });
    },
  });

  // ── Compute paid amounts per reference ───────────────────────────────────
  const paidBySalesId = useMemo(() => {
    const map: Record<string, number> = {};
    payments?.filter(p => p.reference_type === "sales_order").forEach(p => {
      map[p.reference_id] = (map[p.reference_id] || 0) + Number(p.amount);
    });
    return map;
  }, [payments]);

  const paidByPoId = useMemo(() => {
    const map: Record<string, number> = {};
    payments?.filter(p => p.reference_type === "purchase_order").forEach(p => {
      map[p.reference_id] = (map[p.reference_id] || 0) + Number(p.amount);
    });
    return map;
  }, [payments]);

  const supplierMap = useMemo(() => {
    const m: Record<string, string> = {};
    suppliers?.forEach(s => { m[s.id] = s.name; });
    return m;
  }, [suppliers]);

  // ── Summary metrics ──────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalSales = salesOrders?.reduce((s, o) => s + Number(o.total_amount), 0) ?? 0;
    const totalPurchase = purchaseOrders?.reduce((s, o) => s + Number(o.total_amount), 0) ?? 0;
    const receivedPayments = payments?.filter(p => p.payment_type === "received").reduce((s, p) => s + Number(p.amount), 0) ?? 0;
    const madePayments = payments?.filter(p => p.payment_type === "made").reduce((s, p) => s + Number(p.amount), 0) ?? 0;
    const salesOutstanding = totalSales - receivedPayments;
    const purchaseOutstanding = totalPurchase - madePayments;
    return { totalSales, totalPurchase, receivedPayments, madePayments, salesOutstanding, purchaseOutstanding };
  }, [salesOrders, purchaseOrders, payments]);

  // ── GST computations ─────────────────────────────────────────────────────
  const gstData = useMemo(() => {
    const outputByRate: Record<number, { taxable: number; gst: number; count: number }> = {};
    const hsnSales: Record<string, { hsn: string; name: string; qty: number; taxable: number; gst: number; rate: number }> = {};

    salesItems?.forEach((item: any) => {
      const gstRate = Number(item.gst_percentage);
      const qty = Number(item.quantity);
      const taxable = Number(item.unit_price) * qty * (1 - Number(item.discount_percentage) / 100);
      const gstAmt = taxable * (gstRate / 100);
      const hsn = item.products?.hsn_code || "UNKNOWN";

      if (!outputByRate[gstRate]) outputByRate[gstRate] = { taxable: 0, gst: 0, count: 0 };
      outputByRate[gstRate].taxable += taxable;
      outputByRate[gstRate].gst += gstAmt;
      outputByRate[gstRate].count++;

      if (!hsnSales[hsn]) hsnSales[hsn] = { hsn, name: item.products?.name || "-", qty: 0, taxable: 0, gst: 0, rate: gstRate };
      hsnSales[hsn].qty += qty;
      hsnSales[hsn].taxable += taxable;
      hsnSales[hsn].gst += gstAmt;
    });

    const inputByRate: Record<number, { taxable: number; gst: number; count: number }> = {};
    const hsnPurchase: Record<string, { hsn: string; name: string; qty: number; taxable: number; gst: number; rate: number }> = {};

    purchaseItems?.forEach((item: any) => {
      const gstRate = Number(item.gst_percentage);
      const qty = Number(item.quantity);
      const taxable = Number(item.unit_price) * qty * (1 - Number(item.discount_percentage) / 100);
      const gstAmt = taxable * (gstRate / 100);
      const hsn = item.products?.hsn_code || "UNKNOWN";

      if (!inputByRate[gstRate]) inputByRate[gstRate] = { taxable: 0, gst: 0, count: 0 };
      inputByRate[gstRate].taxable += taxable;
      inputByRate[gstRate].gst += gstAmt;
      inputByRate[gstRate].count++;

      if (!hsnPurchase[hsn]) hsnPurchase[hsn] = { hsn, name: item.products?.name || "-", qty: 0, taxable: 0, gst: 0, rate: gstRate };
      hsnPurchase[hsn].qty += qty;
      hsnPurchase[hsn].taxable += taxable;
      hsnPurchase[hsn].gst += gstAmt;
    });

    const totalOutputGst = Object.values(outputByRate).reduce((s, v) => s + v.gst, 0);
    const totalInputGst = Object.values(inputByRate).reduce((s, v) => s + v.gst, 0);
    const netLiability = totalOutputGst - totalInputGst;

    return { outputByRate, inputByRate, hsnSales, hsnPurchase, totalOutputGst, totalInputGst, netLiability };
  }, [salesItems, purchaseItems]);

  // ── Real Ledger Data (from DB) ──────────────────────────────────────────
  // unifiedLedger replaced by ledgerBalances query above.
  const allLedgers = useMemo(() => ledgerBalances ?? [], [ledgerBalances]);

  const filteredUnifiedLedger = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result = allLedgers.filter((l: any) => l.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (ledgerRoleFilter !== 'all') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = result.filter((l: any) => l.roles?.includes(ledgerRoleFilter));
    }
    return result;
  }, [allLedgers, searchQuery, ledgerRoleFilter]);

  const filteredSupplierLedger = useMemo(() => {
    return allLedgers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((l: any) => l.roles?.includes('supplier'))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((l: any) => l.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [allLedgers, searchQuery]);

  const downloadUnifiedLedger = (ledgerName?: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = ledgerName ? allLedgers.filter((l: any) => l.name === ledgerName) : allLedgers;
    const rows: string[][] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entries.forEach((l: any) => {
      const bal = Number(l.current_balance ?? 0);
      rows.push([l.name, (l.roles ?? []).join(','), "", "", (l.total_debit ?? 0).toFixed(2), (l.total_credit ?? 0).toFixed(2), bal >= 0 ? `Dr ${bal.toFixed(2)}` : `Cr ${Math.abs(bal).toFixed(2)}`]);
    });
    downloadCSV(`unified-ledger${ledgerName ? `-${ledgerName.replace(/\s+/g, "-")}` : ""}.csv`, ["Party", "Roles", "Date", "Reference", "Debit (₹)", "Credit (₹)", "Balance"], rows);
    toast({ title: "Ledger downloaded" });
  };

  const downloadSupplierLedger = (ledgerName?: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = ledgerName ? filteredSupplierLedger.filter((l: any) => l.name === ledgerName) : filteredSupplierLedger;
    const rows: string[][] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entries.forEach((l: any) => {
      const bal = Number(l.current_balance ?? 0);
      rows.push([l.name, "", "", "", (l.total_credit ?? 0).toFixed(2), (l.total_debit ?? 0).toFixed(2), Math.abs(bal).toFixed(2)]);
    });
    downloadCSV(`supplier-ledger${ledgerName ? `-${ledgerName.replace(/\s+/g, "-")}` : ""}.csv`, ["Supplier", "Date", "Type", "Reference", "Purchase (₹)", "Paid (₹)", "Balance"], rows);
    toast({ title: "Supplier ledger downloaded" });
  };

  // ── Filtered lists ───────────────────────────────────────────────────────
  const filteredSales = useMemo(() =>
    salesOrders?.filter(o =>
      o.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(searchQuery.toLowerCase())
    ), [salesOrders, searchQuery]);

  const filteredPO = useMemo(() =>
    purchaseOrders?.filter(o =>
      (o.invoice_number || o.order_number || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (supplierMap[o.supplier_id] || "").toLowerCase().includes(searchQuery.toLowerCase())
    ), [purchaseOrders, searchQuery, supplierMap]);

  const filteredPayments = useMemo(() =>
    payments?.filter(p =>
      p.reference_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.party_name.toLowerCase().includes(searchQuery.toLowerCase())
    ), [payments, searchQuery]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-muted-foreground">Payments, ledgers, outstanding balances & GST summary</p>
        </div>
        <Select value={monthRange} onValueChange={setMonthRange}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Sales</p>
            <p className="text-lg font-bold text-primary">₹{metrics.totalSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Received</p>
            <p className="text-lg font-bold text-green-600">₹{metrics.receivedPayments.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertCircle className="h-3 w-3 text-destructive" />Sales Due</p>
            <p className="text-lg font-bold text-destructive">₹{metrics.salesOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Purchase</p>
            <p className="text-lg font-bold">₹{metrics.totalPurchase.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Paid to Suppliers</p>
            <p className="text-lg font-bold text-green-600">₹{metrics.madePayments.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertCircle className="h-3 w-3 text-amber-500" />Purchase Due</p>
            <p className="text-lg font-bold text-amber-600">₹{metrics.purchaseOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search + Role Filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Search ledgers, invoices... ( / )"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={ledgerRoleFilter} onValueChange={setLedgerRoleFilter}>
          <SelectTrigger className="w-40">
            <Filter className="h-3.5 w-3.5 mr-1" />
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Parties</SelectItem>
            <SelectItem value="customer">Customers</SelectItem>
            <SelectItem value="supplier">Suppliers</SelectItem>
            <SelectItem value="bank">Banks</SelectItem>
            <SelectItem value="tax">Tax</SelectItem>
            <SelectItem value="expense">Expenses</SelectItem>
            <SelectItem value="income">Income</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="ledger">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="ledger" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />Unified Ledger
          </TabsTrigger>
          <TabsTrigger value="sales" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />Sales Receivable
          </TabsTrigger>
          <TabsTrigger value="purchase" className="gap-1.5">
            <TrendingDown className="h-3.5 w-3.5" />Purchase Payable
          </TabsTrigger>
          <TabsTrigger value="credit-customers" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />Credit Customers
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5">
            <Banknote className="h-3.5 w-3.5" />Payments
          </TabsTrigger>
          <TabsTrigger value="gst" className="gap-1.5">
            <ReceiptText className="h-3.5 w-3.5" />GST Summary
          </TabsTrigger>
          <TabsTrigger value="expense-entry" className="gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5" />Expense Entry
          </TabsTrigger>
          <TabsTrigger value="chart-of-accounts" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />Chart of Accounts
          </TabsTrigger>
          <TabsTrigger value="trial-balance" className="gap-1.5">
            <Scale className="h-3.5 w-3.5" />Trial Balance
          </TabsTrigger>
          <TabsTrigger value="duplicates" className="gap-1.5">
            <Merge className="h-3.5 w-3.5" />Duplicates
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <History className="h-3.5 w-3.5" />Audit
          </TabsTrigger>
        </TabsList>

        {/* ── Unified Ledger ───────────────────────────────────────────── */}
        <TabsContent value="ledger" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />Unified Ledger
                </CardTitle>
                <div className="flex gap-2">
                  <Badge variant="outline">{filteredUnifiedLedger.length} parties</Badge>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => downloadUnifiedLedger()}>
                    <Download className="h-3.5 w-3.5" /> CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Party Name</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead className="text-right">Debit (₹)</TableHead>
                      <TableHead className="text-right">Credit (₹)</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUnifiedLedger.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No ledger data found.</TableCell></TableRow>
                    )}
                    {filteredUnifiedLedger.map((l: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => {
                      const isExpanded = expandedLedger === l.id;
                      const periodLabel = MONTHS.find(m => m.value === monthRange)?.label || "";
                      const hasCustomerRole = l.roles?.includes('customer');
                      const hasSupplierRole = l.roles?.includes('supplier');
                      const totalDebit = Number(l.total_debit ?? 0);
                      const totalCredit = Number(l.total_credit ?? 0);
                      const currentBalance = Number(l.current_balance ?? 0);
                      const txList = isExpanded ? (expandedLedgerTxs ?? []) : [];
                      return (
                        <React.Fragment key={l.id}>
                          <TableRow className="cursor-pointer focus:bg-accent" tabIndex={0} data-kb-row
                            onClick={() => setExpandedLedger(isExpanded ? null : l.id)}>
                            <TableCell className="pr-0">
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </TableCell>
                            <TableCell className="font-medium">{l.name}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {(l.roles ?? []).map((r: string) => (
                                  <Badge key={r} className={`text-[10px] px-1.5 py-0 h-4 ${ROLE_COLORS[r] || 'bg-muted text-muted-foreground'}`}>{r}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">₹{totalDebit.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-mono text-green-600">₹{totalCredit.toFixed(2)}</TableCell>
                            <TableCell className={`text-right font-mono font-semibold ${currentBalance > 0 ? 'text-destructive' : currentBalance < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                              {currentBalance > 0 ? `Dr ₹${currentBalance.toFixed(2)}` : currentBalance < 0 ? `Cr ₹${Math.abs(currentBalance).toFixed(2)}` : '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); downloadUnifiedLedger(l.name); }} title="Download CSV">
                                  <Download className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => {
                                  e.stopPropagation();
                                  generateLedgerPDF(hasCustomerRole ? 'customer' : 'supplier', {
                                    name: l.name,
                                    totalDebit, totalCredit,
                                    balance: Math.abs(currentBalance), transactions: [],
                                  }, invoiceSettings, periodLabel);
                                }} title="Print / Save as PDF">
                                  <FileDown className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={l.id + "-detail"}>
                              <TableCell colSpan={7} className="p-0 bg-muted/30">
                                <div className="p-4">
                                  <p className="text-xs font-semibold text-muted-foreground mb-2">Transaction Details — {l.name}</p>
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-xs">Date</TableHead>
                                        <TableHead className="text-xs">Type</TableHead>
                                        <TableHead className="text-xs">Reference</TableHead>
                                        <TableHead className="text-xs text-right">Debit (₹)</TableHead>
                                        <TableHead className="text-xs text-right">Credit (₹)</TableHead>
                                        <TableHead className="text-xs text-right">Running Balance</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {txList.length === 0 ? (
                                        <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-4">No transactions or loading…</TableCell></TableRow>
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      ) : txList.map((t: any, i: number) => (
                                        <TableRow key={i}>
                                          <TableCell className="text-xs py-1.5">{format(new Date(t.date), "dd/MM/yyyy")}</TableCell>
                                          <TableCell className="text-xs py-1.5">{t.ref_type}</TableCell>
                                          <TableCell className="text-xs py-1.5 font-medium">{t.ref_number || "-"}</TableCell>
                                          <TableCell className="text-xs py-1.5 text-right font-mono">{Number(t.debit) > 0 ? `₹${Number(t.debit).toFixed(2)}` : ""}</TableCell>
                                          <TableCell className="text-xs py-1.5 text-right font-mono text-green-600">{Number(t.credit) > 0 ? `₹${Number(t.credit).toFixed(2)}` : ""}</TableCell>
                                          <TableCell className={`text-xs py-1.5 text-right font-mono font-semibold ${Number(t.running_balance) > 0 ? 'text-destructive' : 'text-green-600'}`}>
                                            {Number(t.running_balance) > 0 ? `Dr ₹${Number(t.running_balance).toFixed(2)}` : Number(t.running_balance) < 0 ? `Cr ₹${Math.abs(Number(t.running_balance)).toFixed(2)}` : '—'}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                   </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Credit Customers (aging-aware) ───────────────────────────── */}
        <TabsContent value="credit-customers" className="mt-4">
          <CreditCustomersTab />
        </TabsContent>

        {/* ── Sales Receivable ─────────────────────────────────────────── */}
        <TabsContent value="sales" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales?.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No sales orders found.</TableCell></TableRow>
                    )}
                    {filteredSales?.map(order => {
                      const paid = paidBySalesId[order.id] || 0;
                      const balance = Number(order.total_amount) - paid;
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.invoice_number}</TableCell>
                          <TableCell>{order.customer_name}</TableCell>
                          <TableCell>{format(new Date(order.sale_date), "dd/MM/yy")}</TableCell>
                          <TableCell className="capitalize">{order.payment_method || "cash"}</TableCell>
                          <TableCell className="text-right font-mono">₹{Number(order.total_amount).toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">₹{paid.toFixed(2)}</TableCell>
                          <TableCell className={`text-right font-mono ${balance > 0 ? "text-destructive" : "text-muted-foreground"}`}>₹{balance.toFixed(2)}</TableCell>
                          <TableCell>{paymentStatusBadge(paid, Number(order.total_amount))}</TableCell>
                          <TableCell>
                            {balance > 0.01 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 h-7 text-xs"
                                onClick={() => setPaymentDialog({
                                  referenceType: "sales_order",
                                  referenceId: order.id,
                                  referenceNumber: order.invoice_number,
                                  partyName: order.customer_name,
                                  partyType: "customer",
                                  totalAmount: Number(order.total_amount),
                                  paidAmount: paid,
                                  paymentType: "received",
                                })}
                              >
                                <Banknote className="h-3 w-3" /> Collect
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Purchase Payable ─────────────────────────────────────────── */}
        <TabsContent value="purchase" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPO?.length === 0 && (
                      <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No purchase orders found.</TableCell></TableRow>
                    )}
                    {filteredPO?.map(order => {
                      const paid = paidByPoId[order.id] || 0;
                      const balance = Number(order.total_amount) - paid;
                      const supplierName = supplierMap[order.supplier_id] || "-";
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.order_number}</TableCell>
                          <TableCell className="text-muted-foreground">{order.invoice_number || order.challan_number || "-"}</TableCell>
                          <TableCell>{supplierName}</TableCell>
                          <TableCell>{format(new Date(order.order_date), "dd/MM/yy")}</TableCell>
                          <TableCell className="text-right font-mono">₹{Number(order.total_amount).toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">₹{paid.toFixed(2)}</TableCell>
                          <TableCell className={`text-right font-mono ${balance > 0 ? "text-amber-600" : "text-muted-foreground"}`}>₹{balance.toFixed(2)}</TableCell>
                          <TableCell>
                            {(order as any).payment_method === "credit" || !(order as any).payment_method ? (
                              <Badge variant="outline" className="text-xs">Credit</Badge>
                            ) : (
                              <Badge className="text-xs bg-green-100 text-green-800 border-green-200">
                                <Banknote className="h-3 w-3 mr-1" />
                                {(order as any).payment_method || "Cash"}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{paymentStatusBadge(paid, Number(order.total_amount))}</TableCell>
                          <TableCell>
                            {balance > 0.01 && (order as any).payment_method === "credit" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 h-7 text-xs"
                                onClick={() => setPaymentDialog({
                                  referenceType: "purchase_order",
                                  referenceId: order.id,
                                  referenceNumber: order.invoice_number || order.order_number,
                                  partyName: supplierName,
                                  partyType: "supplier",
                                  totalAmount: Number(order.total_amount),
                                  paidAmount: paid,
                                  paymentType: "made",
                                })}
                              >
                                <Banknote className="h-3 w-3" /> Pay
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>



        {/* ── Supplier Ledger ──────────────────────────────────────────── */}
        <TabsContent value="supplier-ledger" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Supplier Ledger
                </CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => downloadSupplierLedger()}>
                    <Download className="h-3.5 w-3.5" /> CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Total Purchase (₹)</TableHead>
                      <TableHead className="text-right">Paid (₹)</TableHead>
                      <TableHead className="text-right">Balance (₹)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSupplierLedger.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No supplier data found.</TableCell></TableRow>
                    )}
                    {filteredSupplierLedger.map((l: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => {
                      const isExpanded = expandedSupplier === l.id;
                      const periodLabel = MONTHS.find(m => m.value === monthRange)?.label || "";
                      const totalPurchase = Number(l.total_credit ?? 0);
                      const totalPaid = Number(l.total_debit ?? 0);
                      const balance = Number(l.current_balance ?? 0);
                      const sTxList = isExpanded ? (expandedSupplierTxs ?? []) : [];
                      return (
                        <>
                          <TableRow key={l.id} className="cursor-pointer focus:bg-accent" tabIndex={0} data-kb-row
                            onClick={() => setExpandedSupplier(isExpanded ? null : l.id)}
                            onKeyDown={(e) => {
                              const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-kb-row]"));
                              const pos = rows.indexOf(e.currentTarget);
                              if (e.key === "ArrowDown") { e.preventDefault(); rows[pos + 1]?.focus(); }
                              else if (e.key === "ArrowUp") { e.preventDefault(); rows[pos - 1]?.focus(); }
                              else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedSupplier(isExpanded ? null : l.id); }
                            }}>
                            <TableCell className="pr-0">
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </TableCell>
                            <TableCell className="font-medium">{l.name}</TableCell>
                            <TableCell className="text-right font-mono">₹{totalPurchase.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-mono text-green-600">₹{totalPaid.toFixed(2)}</TableCell>
                            <TableCell className={`text-right font-mono font-semibold ${balance > 0 ? "text-amber-600" : "text-green-600"}`}>
                              ₹{Math.abs(balance).toFixed(2)}
                            </TableCell>
                            <TableCell>{paymentStatusBadge(totalPaid, totalPurchase)}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs" onClick={(e) => { e.stopPropagation(); downloadSupplierLedger(l.name); }} title="Download CSV">
                                  <Download className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs" onClick={(e) => { e.stopPropagation(); generateLedgerPDF("supplier", {
                                  name: l.name, totalDebit: totalPaid, totalCredit: totalPurchase,
                                  balance: Math.abs(balance), transactions: [],
                                }, invoiceSettings, periodLabel); }} title="Print / Save as PDF">
                                  <FileDown className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={l.id + "-detail"}>
                              <TableCell colSpan={7} className="p-0 bg-muted/30">
                                <div className="p-4">
                                  <p className="text-xs font-semibold text-muted-foreground mb-2">Transaction Details — {l.name}</p>
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-xs">Date</TableHead>
                                        <TableHead className="text-xs">Type</TableHead>
                                        <TableHead className="text-xs">Reference</TableHead>
                                        <TableHead className="text-xs text-right">Debit (₹)</TableHead>
                                        <TableHead className="text-xs text-right">Credit (₹)</TableHead>
                                        <TableHead className="text-xs text-right">Running Balance</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {sTxList.length === 0 ? (
                                        <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-4">No transactions or loading…</TableCell></TableRow>
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      ) : sTxList.map((t: any, i: number) => (
                                        <TableRow key={i}>
                                          <TableCell className="text-xs py-1.5">{format(new Date(t.date), "dd/MM/yyyy")}</TableCell>
                                          <TableCell className="text-xs py-1.5">{t.ref_type}</TableCell>
                                          <TableCell className="text-xs py-1.5 font-medium">{t.ref_number || "-"}</TableCell>
                                          <TableCell className="text-xs py-1.5 text-right font-mono">{Number(t.debit) > 0 ? `₹${Number(t.debit).toFixed(2)}` : ""}</TableCell>
                                          <TableCell className="text-xs py-1.5 text-right font-mono text-green-600">{Number(t.credit) > 0 ? `₹${Number(t.credit).toFixed(2)}` : ""}</TableCell>
                                          <TableCell className={`text-xs py-1.5 text-right font-mono font-semibold ${Number(t.running_balance) > 0 ? "text-amber-600" : "text-green-600"}`}>
                                            ₹{Math.abs(Number(t.running_balance)).toFixed(2)}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Payment Ledger ───────────────────────────────────────────── */}
        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Cheque/Bank</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Notes</TableHead>
                      {(isAdmin || isPharmacist) && <TableHead></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments?.length === 0 && (
                      <TableRow><TableCell colSpan={isAdmin || isPharmacist ? 9 : 8} className="text-center py-8 text-muted-foreground">No payments recorded for this period.</TableCell></TableRow>
                    )}
                    {filteredPayments?.map(p => (
                      <TableRow key={p.id}>
                        <TableCell>{format(new Date(p.payment_date), "dd/MM/yy")}</TableCell>
                        <TableCell>
                          {p.payment_type === "received"
                            ? <Badge className="bg-green-600/15 text-green-700 border-green-200">Received</Badge>
                            : <Badge className="bg-amber-500/15 text-amber-700 border-amber-200">Made</Badge>}
                        </TableCell>
                        <TableCell className="font-medium">{p.reference_number}</TableCell>
                        <TableCell>{p.party_name}</TableCell>
                        <TableCell className="capitalize">{p.payment_method}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.cheque_number ? `#${p.cheque_number}` : ""}
                          {p.bank_name ? ` / ${p.bank_name}` : ""}
                          {!p.cheque_number && !p.bank_name ? "-" : ""}
                        </TableCell>
                        <TableCell className={`text-right font-mono font-semibold ${p.payment_type === "received" ? "text-green-600" : "text-amber-600"}`}>
                          {p.payment_type === "received" ? "+" : "-"}₹{Number(p.amount).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-32 truncate">{p.notes || "-"}</TableCell>
                        {(isAdmin || isPharmacist) && (
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setDeletePaymentId(p.id);
                                setDeletePaymentConfirmOpen(true);
                              }}
                              title="Delete payment"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── GST Summary ──────────────────────────────────────────────── */}
        <TabsContent value="gst" className="mt-4 space-y-4">
          {/* Tax Liability Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-green-200 bg-green-50/40 dark:bg-green-900/10">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Output GST (Sales)</p>
                <p className="text-2xl font-bold text-green-700">₹{gstData.totalOutputGst.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">Tax collected from customers</p>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-900/10">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Input GST (Purchase / ITC)</p>
                <p className="text-2xl font-bold text-amber-700">₹{gstData.totalInputGst.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">Tax paid to suppliers (claimable)</p>
              </CardContent>
            </Card>
            <Card className={gstData.netLiability >= 0 ? "border-destructive/30 bg-destructive/5" : "border-green-200 bg-green-50/40"}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Net Tax Liability</p>
                <p className={`text-2xl font-bold ${gstData.netLiability >= 0 ? "text-destructive" : "text-green-600"}`}>
                  ₹{Math.abs(gstData.netLiability).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {gstData.netLiability >= 0 ? "Payable to government" : "Credit available (carry forward)"}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* GSTR-1 Output */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />GSTR-1 — Outward Supplies (Sales)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>GST Rate</TableHead>
                      <TableHead className="text-right">Taxable (₹)</TableHead>
                      <TableHead className="text-right">CGST (₹)</TableHead>
                      <TableHead className="text-right">SGST (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(gstData.outputByRate).sort((a, b) => Number(a[0]) - Number(b[0])).map(([rate, vals]) => (
                      <TableRow key={rate}>
                        <TableCell>{rate}%</TableCell>
                        <TableCell className="text-right font-mono">₹{vals.taxable.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">₹{(vals.gst / 2).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">₹{(vals.gst / 2).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    {Object.keys(gstData.outputByRate).length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No sales data</TableCell></TableRow>
                    )}
                    <TableRow className="font-semibold bg-muted/30">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right font-mono">
                        ₹{Object.values(gstData.outputByRate).reduce((s, v) => s + v.taxable, 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono">₹{(gstData.totalOutputGst / 2).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">₹{(gstData.totalOutputGst / 2).toFixed(2)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* GSTR-2 Input */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-amber-600" />GSTR-2 — Inward Supplies (Purchases)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>GST Rate</TableHead>
                      <TableHead className="text-right">Taxable (₹)</TableHead>
                      <TableHead className="text-right">CGST (₹)</TableHead>
                      <TableHead className="text-right">SGST (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(gstData.inputByRate).sort((a, b) => Number(a[0]) - Number(b[0])).map(([rate, vals]) => (
                      <TableRow key={rate}>
                        <TableCell>{rate}%</TableCell>
                        <TableCell className="text-right font-mono">₹{vals.taxable.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">₹{(vals.gst / 2).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">₹{(vals.gst / 2).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    {Object.keys(gstData.inputByRate).length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No purchase data</TableCell></TableRow>
                    )}
                    <TableRow className="font-semibold bg-muted/30">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right font-mono">
                        ₹{Object.values(gstData.inputByRate).reduce((s, v) => s + v.taxable, 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono">₹{(gstData.totalInputGst / 2).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">₹{(gstData.totalInputGst / 2).toFixed(2)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* HSN Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />HSN-wise Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="hsn-sales">
                <TabsList>
                  <TabsTrigger value="hsn-sales">Sales (Outward)</TabsTrigger>
                  <TabsTrigger value="hsn-purchase">Purchase (Inward)</TabsTrigger>
                </TabsList>
                <TabsContent value="hsn-sales" className="mt-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>HSN Code</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>GST %</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Taxable (₹)</TableHead>
                        <TableHead className="text-right">GST (₹)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.values(gstData.hsnSales).sort((a, b) => b.taxable - a.taxable).map(row => (
                        <TableRow key={row.hsn}>
                          <TableCell className="font-mono text-xs">{row.hsn}</TableCell>
                          <TableCell className="text-sm">{row.name}</TableCell>
                          <TableCell>{row.rate}%</TableCell>
                          <TableCell className="text-right">{row.qty}</TableCell>
                          <TableCell className="text-right font-mono">₹{row.taxable.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono">₹{row.gst.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      {Object.keys(gstData.hsnSales).length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No data</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
                <TabsContent value="hsn-purchase" className="mt-3">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>HSN Code</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>GST %</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Taxable (₹)</TableHead>
                        <TableHead className="text-right">ITC (₹)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.values(gstData.hsnPurchase).sort((a, b) => b.taxable - a.taxable).map(row => (
                        <TableRow key={row.hsn}>
                          <TableCell className="font-mono text-xs">{row.hsn}</TableCell>
                          <TableCell className="text-sm">{row.name}</TableCell>
                          <TableCell>{row.rate}%</TableCell>
                          <TableCell className="text-right">{row.qty}</TableCell>
                          <TableCell className="text-right font-mono">₹{row.taxable.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono text-amber-600">₹{row.gst.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      {Object.keys(gstData.hsnPurchase).length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No data</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Expense Entry ─────────────────────────────────────────────── */}
        <TabsContent value="expense-entry" className="mt-4">
          <ExpenseEntryTab />
        </TabsContent>

        {/* ── Chart of Accounts ─────────────────────────────────────────────── */}
        <TabsContent value="chart-of-accounts" className="mt-4">
          <ChartOfAccountsTab />
        </TabsContent>

        {/* ── Trial Balance ─────────────────────────────────────────────── */}
        <TabsContent value="trial-balance" className="mt-4">
          <TrialBalanceTab />
        </TabsContent>

        {/* ── Duplicates ─────────────────────────────────────────────── */}
        <TabsContent value="duplicates" className="mt-4">
          <DuplicatesTab />
        </TabsContent>

        {/* ── Audit ─────────────────────────────────────────────── */}
        <TabsContent value="audit" className="mt-4">
          <AuditTab />
        </TabsContent>
      </Tabs>

      {/* Record Payment Dialog */}
      {paymentDialog && (
        <RecordPaymentDialog
          open={!!paymentDialog}
          onOpenChange={(open) => { if (!open) setPaymentDialog(null); }}
          {...paymentDialog}
        />
      )}

      {/* Delete Payment Confirmation Dialog */}
      <Dialog open={deletePaymentConfirmOpen} onOpenChange={(open) => { if (!open) { setDeletePaymentConfirmOpen(false); setDeletePaymentId(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Payment
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this payment record? This action cannot be undone and will affect the outstanding balance.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeletePaymentConfirmOpen(false); setDeletePaymentId(null); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deletePaymentMutation.isPending}
              onClick={() => deletePaymentId && deletePaymentMutation.mutate(deletePaymentId)}
            >
              {deletePaymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Chart of Accounts Tab Component ─────────────────────────────────────────

const GROUP_TYPE_LABELS: Record<string, string> = {
  assets: 'Assets', liabilities: 'Liabilities', income: 'Income',
  expenses: 'Expenses', capital: 'Capital', bank: 'Bank',
  cash: 'Cash', tax: 'Tax', sundry_debtors: 'Sundry Debtors',
  sundry_creditors: 'Sundry Creditors', loan: 'Loans',
  investment: 'Investments', other: 'Other',
};

function GroupTreeNode({ node, depth, onSelect, selectedId }: {
  node: LedgerGroupNode; depth: number;
  onSelect: (id: string) => void; selectedId: string | null;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <>
      <div
        className={`flex items-center gap-1 py-1.5 px-2 cursor-pointer rounded hover:bg-muted/50 ${isSelected ? 'bg-muted font-medium' : ''}`}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
        onClick={() => { onSelect(node.id); if (hasChildren) setExpanded(!expanded); }}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        ) : <span className="w-3.5" />}
        <span className="text-sm flex-1 truncate">{node.name}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
          {GROUP_TYPE_LABELS[node.groupType] || node.groupType}
        </Badge>
        {node.isSystem && <Badge className="text-[10px] px-1.5 py-0 h-4 bg-slate-100 text-slate-600">System</Badge>}
      </div>
      {expanded && hasChildren && node.children!.map(child => (
        <GroupTreeNode key={child.id} node={child} depth={depth + 1} onSelect={onSelect} selectedId={selectedId} />
      ))}
    </>
  );
}

function ChartOfAccountsTab() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: groupTree, isLoading } = useQuery<LedgerGroupNode[]>({
    queryKey: ['ledger-group-tree', companyId],
    queryFn: () => ledgerService.getLedgerGroupTree(companyId!),
    enabled: !!companyId,
  });

  const seedDefaultsMutation = useMutation({
    mutationFn: () => ledgerService.seedDefaultLedgerGroups(companyId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger-group-tree'] });
      toast({ title: 'Default groups created' });
    },
    onError: (err) => toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Chart of Accounts</h3>
          <p className="text-xs text-muted-foreground">Accounting groups hierarchy</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => seedDefaultsMutation.mutate()} disabled={seedDefaultsMutation.isPending}>
          {seedDefaultsMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          Seed Defaults
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !groupTree || groupTree.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>No ledger groups found.</p>
          <Button className="mt-4" size="sm" onClick={() => seedDefaultsMutation.mutate()}>Create Default Groups</Button>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="space-y-1">
            {groupTree.map(node => (
              <GroupTreeNode key={node.id} node={node} depth={0} onSelect={setSelectedGroupId} selectedId={selectedGroupId} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Trial Balance Tab Component ─────────────────────────────────────────────

function TrialBalanceTab() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const [fy, setFy] = useState(() => {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-${y + 1}`;
  });

  const { data, isLoading } = useQuery<TrialBalanceResult>({
    queryKey: ['trial-balance', companyId, fy],
    queryFn: () => ledgerAdvanced.getTrialBalance(companyId!, fy),
    enabled: !!companyId,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="text-sm">Financial Year</Label>
        <Input value={fy} onChange={e => setFy(e.target.value)} className="w-32" placeholder="2025-2026" />
        <Badge variant="outline">{fy}</Badge>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data || data.rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Scale className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>No balances found for {fy}.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3"><div className="text-xs text-muted-foreground">Total Debit</div><div className="text-xl font-bold text-red-600">₹{data.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Total Credit</div><div className="text-xl font-bold text-green-600">₹{data.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Difference</div>
              <div className={`text-xl font-bold ${data.isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                {data.isBalanced ? 'Balanced ✓' : `₹${data.difference.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              </div>
            </Card>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Group</TableHead><TableHead>Type</TableHead>
                <TableHead className="text-right">Debit (₹)</TableHead><TableHead className="text-right">Credit (₹)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-sm">{r.groupName}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.groupType}</Badge></TableCell>
                    <TableCell className="text-right font-mono">{r.totalDebit > 0 ? `₹${r.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                    <TableCell className="text-right font-mono">{r.totalCredit > 0 ? `₹${r.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Duplicates Tab Component ────────────────────────────────────────────────

interface DuplicateLedgerForMerge {
  canonicalName: string;
  duplicateCount: number;
  ledgerIds: string[];
  totalDebit: number;
  totalCredit: number;
}

interface MergePreviewResult {
  canonicalName: string;
  keptLedgerId: string;
  keptLedgerName: string;
  mergedLedgerId: string;
  mergedLedgerName: string;
  transactionsMoved: number;
  ordersUpdated: number;
  paymentsUpdated: number;
  status: string;
}

function DuplicatesTab() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isMerging, setIsMerging] = useState(false);
  const [previewResults, setPreviewResults] = useState<MergePreviewResult[] | null>(null);

  const { data: duplicates, isLoading, refetch } = useQuery<DuplicateLedgerForMerge[]>({
    queryKey: ['ledger-duplicates-db', companyId],
    queryFn: () => ledgerAdvanced.findDuplicateLedgers(companyId!),
    enabled: !!companyId,
  });

  const handlePreview = async () => {
    if (!companyId) return;
    setIsMerging(true);
    try {
      const results = await ledgerAdvanced.bulkMergeDuplicateLedgers(companyId, true);
      setPreviewResults(results);
      toast({ title: 'Preview Ready', description: `${results.filter(r => r.status === 'WOULD_MERGE').length} duplicates would be merged` });
    } catch (err) {
      toast({ title: 'Preview failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsMerging(false);
    }
  };

  const handleBulkMerge = async () => {
    if (!companyId) return;
    if (!confirm('This will merge all duplicate ledgers. This action cannot be undone. Continue?')) return;

    setIsMerging(true);
    try {
      const results = await ledgerAdvanced.bulkMergeDuplicateLedgers(companyId, false);
      const merged = results.filter(r => r.status === 'MERGED').length;
      const errors = results.filter(r => r.status.startsWith('ERROR')).length;

      toast({
        title: 'Merge Complete',
        description: `${merged} groups merged${errors > 0 ? `, ${errors} errors` : ''}`,
        variant: errors > 0 ? 'destructive' : 'default'
      });

      setPreviewResults(results);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['ledgers'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-stats'] });
    } catch (err) {
      toast({ title: 'Merge failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsMerging(false);
    }
  };

  const clearPreview = () => setPreviewResults(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Duplicate Ledgers</h3>
          <p className="text-xs text-muted-foreground">Merge duplicate party records to consolidate transaction history</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isMerging}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isLoading ? 'animate-spin' : ''}`} />Scan
          </Button>
          <Button variant="outline" size="sm" onClick={handlePreview} disabled={isMerging || !duplicates?.length}>
            <ClipboardCheck className="h-3.5 w-3.5 mr-1" />Preview
          </Button>
          <Button size="sm" onClick={handleBulkMerge} disabled={isMerging || !duplicates?.length} className="bg-amber-600 hover:bg-amber-700">
            {isMerging ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Merge className="h-3.5 w-3.5 mr-1" />}
            Merge All
          </Button>
        </div>
      </div>

      {previewResults && (
        <Card className="p-4 bg-muted/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">
              {previewResults.some(r => r.status === 'MERGED') ? 'Merge Results' : 'Preview (Dry Run)'}
            </h4>
            <Button variant="ghost" size="sm" onClick={clearPreview}><XCircle className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {previewResults.map((result, i) => (
              <div key={i} className={`flex items-center justify-between p-2 rounded text-xs ${
                result.status === 'MERGED' ? 'bg-green-50 border border-green-200' :
                result.status === 'WOULD_MERGE' ? 'bg-blue-50 border border-blue-200' :
                'bg-red-50 border border-red-200'
              }`}>
                <div>
                  <span className="font-medium">{result.canonicalName}</span>
                  <span className="text-muted-foreground ml-2">
                    {result.mergedLedgerName} → {result.keptLedgerName}
                  </span>
                </div>
                <Badge variant={result.status === 'MERGED' ? 'default' : result.status === 'WOULD_MERGE' ? 'secondary' : 'destructive'} className="text-[10px]">
                  {result.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !duplicates || duplicates.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
          <p>No duplicate ledgers detected.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{duplicates.length} duplicate group(s) found</p>
          {duplicates.map((group, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">{group.canonicalName}</span>
                  <Badge variant="outline" className="text-[10px]">{group.duplicateCount} ledgers</Badge>
                </div>
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                IDs: {group.ledgerIds.join(', ')}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Audit Tab Component ─────────────────────────────────────────────────────

function AuditTab() {
  const { companyId } = useBusiness();
  const [actionFilter, setActionFilter] = useState<string>('all');

  const { data, isLoading } = useQuery<{ data: LedgerAuditEntry[]; count: number }>({
    queryKey: ['ledger-audit', companyId, actionFilter],
    queryFn: () => ledgerAdvanced.getLedgerAuditLog(companyId!, { action: actionFilter !== 'all' ? actionFilter : undefined, limit: 100 }),
    enabled: !!companyId,
  });

  const ACTION_COLORS: Record<string, string> = {
    create: 'bg-green-100 text-green-800', update: 'bg-blue-100 text-blue-800',
    delete: 'bg-red-100 text-red-800', merge: 'bg-purple-100 text-purple-800',
    role_add: 'bg-cyan-100 text-cyan-800', role_remove: 'bg-amber-100 text-amber-800',
    balance_close: 'bg-slate-100 text-slate-800', import: 'bg-teal-100 text-teal-800',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Label className="text-sm">Action</Label>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {['create', 'update', 'delete', 'merge', 'role_add', 'role_remove', 'balance_close', 'import'].map(a => (
              <SelectItem key={a} value={a}>{a.replace('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data || data.data.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <History className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>No audit records found.</p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>User</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs">{new Date(entry.createdAt).toLocaleString()}</TableCell>
                  <TableCell><Badge className={`text-[10px] ${ACTION_COLORS[entry.action] || 'bg-slate-100'}`}>{entry.action}</Badge></TableCell>
                  <TableCell className="text-sm">{entry.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{entry.userId || 'System'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ─── Expense Entry Tab Component ─────────────────────────────────────────────

function ExpenseEntryTab() {
  const { companyId } = useBusiness();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [expenseLedgerId, setExpenseLedgerId] = useState<string>("");
  const [paymentLedgerId, setPaymentLedgerId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch expense ledgers
  const { data: expenseLedgers, isLoading: loadingExpenses } = useQuery({
    queryKey: ["expense-ledgers", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: unknown }> })
        .rpc("get_expense_ledgers", { p_company_id: companyId });
      if (error) throw error as Error;
      return ((data as unknown[]) || []) as Array<{ id: string; name: string }>;
    },
    enabled: !!companyId,
  });

  // Fetch cash/bank ledgers for payment
  const { data: paymentLedgers, isLoading: loadingPayments } = useQuery({
    queryKey: ["payment-ledgers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledgers")
        .select("id, name")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .or("group_type.eq.cash,group_type.eq.bank")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const handleSubmit = async () => {
    if (!expenseLedgerId || !paymentLedgerId || !amount || parseFloat(amount) <= 0) {
      toast({ title: "Validation Error", description: "Please select expense type, payment method, and enter a valid amount.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await (supabase as unknown as { rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: unknown }> }).rpc("create_expense_voucher", {
        p_company_id: companyId,
        p_date: date,
        p_expense_ledger_id: expenseLedgerId,
        p_payment_ledger_id: paymentLedgerId,
        p_amount: parseFloat(amount),
        p_description: description || null,
        p_reference_number: referenceNumber || null,
        p_created_by: user?.id,
      });

      if (error) throw error;

      toast({ 
        title: "Expense Recorded", 
        description: `Voucher created for ₹${parseFloat(amount).toFixed(2)}` 
      });

      // Reset form
      setExpenseLedgerId("");
      setPaymentLedgerId("");
      setAmount("");
      setDescription("");
      setReferenceNumber("");

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["ledgers"] });
      queryClient.invalidateQueries({ queryKey: ["ledger-stats"] });
      queryClient.invalidateQueries({ queryKey: ["expense-ledgers"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4" />Record Expense
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Reference Number (Optional)</Label>
              <Input placeholder="EXP-001" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Expense Category *</Label>
            <Select value={expenseLedgerId} onValueChange={setExpenseLedgerId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingExpenses ? "Loading..." : "Select expense type"} />
              </SelectTrigger>
              <SelectContent>
                {expenseLedgers?.map((ledger: any) => (
                  <SelectItem key={ledger.id} value={ledger.id}>
                    {ledger.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Payment Method *</Label>
            <Select value={paymentLedgerId} onValueChange={setPaymentLedgerId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingPayments ? "Loading..." : "Select payment method"} />
              </SelectTrigger>
              <SelectContent>
                {paymentLedgers?.map((ledger: any) => (
                  <SelectItem key={ledger.id} value={ledger.id}>
                    {ledger.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Amount (₹) *</Label>
            <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea placeholder="Enter expense details..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="bg-muted/50 p-3 rounded-md text-sm">
            <p className="font-medium">Journal Entry Preview:</p>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Dr. {expenseLedgers?.find((l: any) => l.id === expenseLedgerId)?.name || "Expense Account"}</span>
                <span>₹{amount || "0.00"}</span>
              </div>
              <div className="flex justify-between">
                <span>Cr. {paymentLedgers?.find((l: any) => l.id === paymentLedgerId)?.name || "Cash/Bank"}</span>
                <span>₹{amount || "0.00"}</span>
              </div>
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={isSubmitting || !expenseLedgerId || !paymentLedgerId || !amount} className="w-full">
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Record Expense
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

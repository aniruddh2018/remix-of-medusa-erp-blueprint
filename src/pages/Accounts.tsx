import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Banknote, Search, TrendingUp, TrendingDown, AlertCircle,
  CheckCircle2, Clock, FileText, ReceiptText, BarChart3, Lock
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { RecordPaymentDialog } from "@/components/dialogs/RecordPaymentDialog";

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
];

export default function Accounts() {
  const { toast } = useToast();
  const { user, isAdmin, isPharmacist } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [monthRange, setMonthRange] = useState("0");
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

  // Date filter
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const months = parseInt(monthRange);
    if (months === 0) {
      return { startDate: startOfMonth(now).toISOString(), endDate: endOfMonth(now).toISOString() };
    }
    if (months === 12) {
      return { startDate: new Date(now.getFullYear(), 0, 1).toISOString(), endDate: endOfMonth(now).toISOString() };
    }
    return { startDate: subMonths(startOfMonth(now), months - 1).toISOString(), endDate: endOfMonth(now).toISOString() };
  }, [monthRange]);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: payments } = useQuery({
    queryKey: ["payments", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .gte("payment_date", startDate.split("T")[0])
        .lte("payment_date", endDate.split("T")[0])
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: salesOrders } = useQuery({
    queryKey: ["sales-orders-accounts", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select("id, invoice_number, customer_name, total_amount, sale_date, payment_method, status")
        .gte("sale_date", startDate.split("T")[0])
        .lte("sale_date", endDate.split("T")[0])
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: purchaseOrders } = useQuery({
    queryKey: ["purchase-orders-accounts", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, order_number, invoice_number, challan_number, total_amount, order_date, status, supplier_id")
        .gte("order_date", startDate.split("T")[0])
        .lte("order_date", endDate.split("T")[0])
        .order("order_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-basic"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name");
      if (error) throw error;
      return data;
    },
  });

  // GST data
  const { data: salesItems } = useQuery({
    queryKey: ["sales-items-gst", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_order_items")
        .select(`
          quantity, unit_price, gst_percentage, discount_percentage, total_price,
          product_id,
          products(name, hsn_code),
          sales_orders!inner(sale_date, status, invoice_number)
        `)
        .gte("sales_orders.sale_date", startDate.split("T")[0])
        .lte("sales_orders.sale_date", endDate.split("T")[0])
        .neq("sales_orders.status", "cancelled");
      if (error) throw error;
      return data;
    },
  });

  const { data: purchaseItems } = useQuery({
    queryKey: ["purchase-items-gst", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select(`
          quantity, unit_price, gst_percentage, discount_percentage, total_price,
          product_id,
          products(name, hsn_code),
          purchase_orders!inner(order_date, status)
        `)
        .gte("purchase_orders.order_date", startDate.split("T")[0])
        .lte("purchase_orders.order_date", endDate.split("T")[0])
        .neq("purchase_orders.status", "cancelled");
      if (error) throw error;
      return data;
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
    // Output GST (from sales)
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

    // Input GST (from purchases)
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
          <p className="text-muted-foreground">Payments, outstanding balances & GST summary</p>
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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by number, name..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="sales">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="sales" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />Sales Receivable
          </TabsTrigger>
          <TabsTrigger value="purchase" className="gap-1.5">
            <TrendingDown className="h-3.5 w-3.5" />Purchase Payable
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5">
            <Banknote className="h-3.5 w-3.5" />Payment Ledger
          </TabsTrigger>
          <TabsTrigger value="gst" className="gap-1.5">
            <ReceiptText className="h-3.5 w-3.5" />GST Summary
          </TabsTrigger>
        </TabsList>

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
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPO?.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No purchase orders found.</TableCell></TableRow>
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
                          <TableCell>{paymentStatusBadge(paid, Number(order.total_amount))}</TableCell>
                          <TableCell>
                            {balance > 0.01 && (
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments?.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No payments recorded for this period.</TableCell></TableRow>
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
      </Tabs>

      {/* Record Payment Dialog */}
      {paymentDialog && (
        <RecordPaymentDialog
          open={!!paymentDialog}
          onOpenChange={(open) => { if (!open) setPaymentDialog(null); }}
          {...paymentDialog}
        />
      )}
    </div>
  );
}

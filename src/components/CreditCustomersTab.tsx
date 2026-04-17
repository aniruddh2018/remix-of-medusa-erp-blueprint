import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CreditCard, Phone, AlertTriangle, Search, Download } from "lucide-react";
import { differenceInDays, format } from "date-fns";

interface CreditInvoice {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  total_amount: number;
  amount_paid: number;
  payment_status: string;
  due_date: string | null;
  sale_date: string;
  credit_period_days: number | null;
}

interface AggregatedCustomer {
  customer_id: string | null;
  name: string;
  phone: string | null;
  outstanding: number;
  invoiceCount: number;
  oldestDays: number;
  invoices: CreditInvoice[];
  bucket: "current" | "1-30" | "31-60" | "61-90" | "90+";
}

function bucketFor(days: number): AggregatedCustomer["bucket"] {
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

const BUCKET_VARIANT: Record<AggregatedCustomer["bucket"], string> = {
  "current": "bg-muted text-foreground",
  "1-30": "bg-amber-500/15 text-amber-700 border-amber-200",
  "31-60": "bg-orange-500/15 text-orange-700 border-orange-200",
  "61-90": "bg-destructive/15 text-destructive border-destructive/20",
  "90+": "bg-destructive text-destructive-foreground",
};

interface CreditCustomersTabProps {
  /** When true, renders a compact card (Customers page). When false, full ledger view (Accounts page). */
  compact?: boolean;
}

export function CreditCustomersTab({ compact = false }: CreditCustomersTabProps) {
  const { companyId } = useBusiness();
  const [search, setSearch] = useState("");

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["credit-customers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select("id, invoice_number, customer_id, customer_name, customer_phone, total_amount, amount_paid, payment_status, due_date, sale_date, credit_period_days")
        .eq("company_id", companyId!)
        .in("payment_status", ["credit", "partial"])
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as CreditInvoice[];
    },
    enabled: !!companyId,
  });

  const aggregated = useMemo<AggregatedCustomer[]>(() => {
    if (!invoices) return [];
    const today = new Date();
    const map = new Map<string, AggregatedCustomer>();

    for (const inv of invoices) {
      const outstanding = Number(inv.total_amount) - Number(inv.amount_paid);
      if (outstanding <= 0.01) continue;
      const key = inv.customer_id || `name:${inv.customer_name}`;
      const daysPastDue = inv.due_date
        ? differenceInDays(today, new Date(inv.due_date))
        : 0;

      const existing = map.get(key);
      if (existing) {
        existing.outstanding += outstanding;
        existing.invoiceCount += 1;
        existing.invoices.push(inv);
        existing.oldestDays = Math.max(existing.oldestDays, daysPastDue);
        existing.bucket = bucketFor(existing.oldestDays);
      } else {
        map.set(key, {
          customer_id: inv.customer_id,
          name: inv.customer_name,
          phone: inv.customer_phone,
          outstanding,
          invoiceCount: 1,
          oldestDays: daysPastDue,
          invoices: [inv],
          bucket: bucketFor(daysPastDue),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding);
  }, [invoices]);

  const filtered = useMemo(() => {
    if (!search.trim()) return aggregated;
    const q = search.toLowerCase();
    return aggregated.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q)
    );
  }, [aggregated, search]);

  const totals = useMemo(() => {
    const total = aggregated.reduce((s, c) => s + c.outstanding, 0);
    const overdue = aggregated.filter((c) => c.oldestDays > 0).reduce((s, c) => s + c.outstanding, 0);
    return { total, overdue, customers: aggregated.length };
  }, [aggregated]);

  const downloadCSV = () => {
    const headers = ["Customer", "Phone", "Outstanding (₹)", "Invoices", "Oldest (days)", "Aging Bucket"];
    const rows = aggregated.map((c) => [
      c.name,
      c.phone || "",
      c.outstanding.toFixed(2),
      String(c.invoiceCount),
      String(c.oldestDays),
      c.bucket,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `credit-customers-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Credit Customers
            <Badge variant="outline" className="ml-1">{totals.customers}</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground">
              Outstanding: <span className="font-semibold text-destructive">₹{totals.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              {totals.overdue > 0 && (
                <span className="ml-2">Overdue: <span className="font-semibold text-destructive">₹{totals.overdue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></span>
              )}
            </div>
            <Button size="sm" variant="outline" className="gap-1" onClick={downloadCSV} disabled={aggregated.length === 0}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search credit customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                {!compact && <TableHead>Phone</TableHead>}
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-center">Invoices</TableHead>
                <TableHead className="text-center">Oldest</TableHead>
                <TableHead>Aging</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={compact ? 5 : 6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={compact ? 5 : 6} className="text-center py-8 text-muted-foreground">
                    No credit customers. All invoices are paid in full.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.customer_id || c.name}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    {!compact && (
                      <TableCell>
                        {c.phone ? (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />{c.phone}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    <TableCell className="text-right font-mono font-semibold text-destructive">
                      ₹{c.outstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center">{c.invoiceCount}</TableCell>
                    <TableCell className="text-center text-sm">
                      {c.oldestDays > 0 ? (
                        <span className="text-destructive font-medium flex items-center justify-center gap-1">
                          <AlertTriangle className="h-3 w-3" />{c.oldestDays}d
                        </span>
                      ) : (
                        <span className="text-muted-foreground">on time</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={BUCKET_VARIANT[c.bucket]}>
                        {c.bucket === "current" ? "Current" : `${c.bucket} days`}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

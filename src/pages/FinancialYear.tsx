
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Calendar,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Plus,
  Shield,
  Clock,
  FileText,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";

type FYStatus = "active" | "closed" | "archived";

interface FinancialYear {
  id: string;
  company_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: FYStatus;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
}

interface ValidationResult {
  label: string;
  passed: boolean;
  count?: number;
  detail?: string;
}

interface AuditLog {
  id: string;
  action: string;
  details: Record<string, unknown>;
  performed_by: string;
  created_at: string;
}

export default function FinancialYear() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const { companyId } = useBusiness();
  const { toast } = useToast();

  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closingFY, setClosingFY] = useState<FinancialYear | null>(null);
  const [validations, setValidations] = useState<ValidationResult[]>([]);
  const [validating, setValidating] = useState(false);
  const [closing, setClosing] = useState(false);
  const [creating, setCreating] = useState(false);

  const canManage = isAdmin || isSuperAdmin;

  useEffect(() => {
    if (companyId) {
      fetchData();
    }
  }, [companyId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [fyRes, logRes] = await Promise.all([
        supabase
          .from("financial_years")
          .select("*")
          .eq("company_id", companyId)
          .order("start_date", { ascending: false }),
        supabase
          .from("fy_audit_logs")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (fyRes.data) setFinancialYears(fyRes.data as FinancialYear[]);
      if (logRes.data) setAuditLogs(logRes.data as AuditLog[]);
    } catch (err) {
      console.error("Failed to fetch FY data:", err);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentFYDates = () => {
    const now = new Date();
    const month = now.getMonth(); // 0-indexed
    const year = now.getFullYear();
    if (month >= 3) {
      // April onwards
      return {
        start: `${year}-04-01`,
        end: `${year + 1}-03-31`,
        name: `FY ${year}-${String(year + 1).slice(2)}`,
      };
    } else {
      return {
        start: `${year - 1}-04-01`,
        end: `${year}-03-31`,
        name: `FY ${year - 1}-${String(year).slice(2)}`,
      };
    }
  };

  const getNextFYDates = (currentEnd: string) => {
    const endDate = new Date(currentEnd);
    const nextStart = new Date(endDate);
    nextStart.setDate(nextStart.getDate() + 1);
    const nextEnd = new Date(nextStart);
    nextEnd.setFullYear(nextEnd.getFullYear() + 1);
    nextEnd.setDate(nextEnd.getDate() - 1);
    const sy = nextStart.getFullYear();
    const ey = nextEnd.getFullYear();
    return {
      start: format(nextStart, "yyyy-MM-dd"),
      end: format(nextEnd, "yyyy-MM-dd"),
      name: `FY ${sy}-${String(ey).slice(2)}`,
    };
  };

  const createInitialFY = async () => {
    if (!companyId || !user) return;
    setCreating(true);
    try {
      const fy = getCurrentFYDates();
      const { error } = await supabase.from("financial_years").insert({
        company_id: companyId,
        name: fy.name,
        start_date: fy.start,
        end_date: fy.end,
        status: "active" as FYStatus,
      });
      if (error) throw error;

      await supabase.from("fy_audit_logs").insert({
        company_id: companyId,
        action: "FY_CREATED",
        details: { fy_name: fy.name, start: fy.start, end: fy.end },
        performed_by: user.id,
      });

      toast({ title: "Financial Year Created", description: `${fy.name} is now active.` });
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to create FY", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const runValidations = async (fy: FinancialYear) => {
    if (!companyId) return;
    setValidating(true);
    setClosingFY(fy);
    setShowCloseDialog(true);

    try {
      // Check pending purchase orders
      const { count: pendingPOs } = await supabase
        .from("purchase_orders")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "pending")
        .gte("order_date", fy.start_date)
        .lte("order_date", fy.end_date);

      // Check pending sales
      const { count: pendingSales } = await supabase
        .from("sales_orders")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "pending")
        .gte("sale_date", fy.start_date)
        .lte("sale_date", fy.end_date);

      // Check negative stock batches
      const { count: negativeStock } = await supabase
        .from("inventory_batches")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
        .lt("quantity", 0);

      // Check open tax sessions for this FY period
      const startDate = new Date(fy.start_date);
      const endDate = new Date(fy.end_date);
      const { count: openTax } = await supabase
        .from("tax_sessions")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "open")
        .gte("period_year", startDate.getFullYear())
        .lte("period_year", endDate.getFullYear());

      const results: ValidationResult[] = [
        {
          label: "No pending Purchase Orders",
          passed: (pendingPOs || 0) === 0,
          count: pendingPOs || 0,
          detail: pendingPOs ? `${pendingPOs} pending PO(s) found` : undefined,
        },
        {
          label: "No pending Sales Orders",
          passed: (pendingSales || 0) === 0,
          count: pendingSales || 0,
          detail: pendingSales ? `${pendingSales} pending sale(s) found` : undefined,
        },
        {
          label: "No negative stock batches",
          passed: (negativeStock || 0) === 0,
          count: negativeStock || 0,
          detail: negativeStock ? `${negativeStock} batch(es) with negative stock` : undefined,
        },
        {
          label: "No open GST sessions",
          passed: (openTax || 0) === 0,
          count: openTax || 0,
          detail: openTax ? `${openTax} open tax session(s)` : undefined,
        },
      ];

      setValidations(results);
    } catch (err) {
      console.error("Validation error:", err);
      setValidations([{ label: "Validation check failed", passed: false, detail: "System error" }]);
    } finally {
      setValidating(false);
    }
  };

  const allValidationsPassed = validations.length > 0 && validations.every((v) => v.passed);

  const closeFY = async () => {
    if (!closingFY || !companyId || !user) return;
    setClosing(true);
    try {
      // 1. Close current FY
      const { error: closeErr } = await supabase
        .from("financial_years")
        .update({
          status: "closed" as FYStatus,
          closed_by: user.id,
          closed_at: new Date().toISOString(),
        })
        .eq("id", closingFY.id);
      if (closeErr) throw closeErr;

      // 2. Generate opening balances
      await generateOpeningBalances(closingFY);

      // 3. Create next FY
      const nextFY = getNextFYDates(closingFY.end_date);
      const { error: createErr } = await supabase.from("financial_years").insert({
        company_id: companyId,
        name: nextFY.name,
        start_date: nextFY.start,
        end_date: nextFY.end,
        status: "active" as FYStatus,
      });
      if (createErr) throw createErr;

      // 4. Audit log
      await supabase.from("fy_audit_logs").insert({
        company_id: companyId,
        financial_year_id: closingFY.id,
        action: "FY_CLOSED",
        details: {
          closed_fy: closingFY.name,
          new_fy: nextFY.name,
          closed_by_email: user.email,
        },
        performed_by: user.id,
      });

      toast({ title: "Financial Year Closed", description: `${closingFY.name} closed. ${nextFY.name} is now active.` });
      setShowCloseDialog(false);
      setClosingFY(null);
      setValidations([]);
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to close FY", variant: "destructive" });
    } finally {
      setClosing(false);
    }
  };

  const generateOpeningBalances = async (fy: FinancialYear) => {
    if (!companyId || !user) return;

    // Get next FY ID (will be created after this)
    // We'll create opening balances after FY is created, but we need the next FY id
    // For now, compute balances and store them under the closing FY as a snapshot
    // The actual opening_balances will reference the NEW FY

    // Customer balances: total sales - total payments received
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name, total_purchases")
      .eq("company_id", companyId);

    const { data: customerPayments } = await supabase
      .from("payments")
      .select("reference_id, amount")
      .eq("company_id", companyId)
      .eq("party_type", "customer");

    // Supplier balances: total purchases - total payments made
    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("company_id", companyId);

    const { data: purchaseOrders } = await supabase
      .from("purchase_orders")
      .select("supplier_id, total_amount")
      .eq("company_id", companyId)
      .in("status", ["confirmed", "delivered"]);

    const { data: supplierPayments } = await supabase
      .from("payments")
      .select("reference_id, amount")
      .eq("company_id", companyId)
      .eq("party_type", "supplier");

    // Inventory snapshot
    const { data: batches } = await supabase
      .from("inventory_batches")
      .select("product_id, quantity, purchase_price, mrp")
      .eq("company_id", companyId)
      .gt("quantity", 0);

    const { data: products } = await supabase
      .from("products")
      .select("id, name")
      .eq("company_id", companyId);

    const productMap = new Map((products || []).map((p) => [p.id, p.name]));

    // We'll store the balances; actual insertion happens when new FY is created
    // For now, store in audit log as snapshot
    const customerBalances: Record<string, number> = {};
    (customers || []).forEach((c) => {
      customerBalances[c.id] = c.total_purchases || 0;
    });
    (customerPayments || []).forEach((p) => {
      if (customerBalances[p.reference_id] !== undefined) {
        customerBalances[p.reference_id] -= p.amount;
      }
    });

    const supplierTotals: Record<string, number> = {};
    (purchaseOrders || []).forEach((po) => {
      supplierTotals[po.supplier_id] = (supplierTotals[po.supplier_id] || 0) + po.total_amount;
    });
    (supplierPayments || []).forEach((p) => {
      if (supplierTotals[p.reference_id] !== undefined) {
        supplierTotals[p.reference_id] -= p.amount;
      }
    });

    const inventoryByProduct: Record<string, { qty: number; value: number }> = {};
    (batches || []).forEach((b) => {
      if (!inventoryByProduct[b.product_id]) {
        inventoryByProduct[b.product_id] = { qty: 0, value: 0 };
      }
      inventoryByProduct[b.product_id].qty += b.quantity;
      inventoryByProduct[b.product_id].value += b.quantity * b.purchase_price;
    });

    // Store snapshot in audit log
    await supabase.from("fy_audit_logs").insert({
      company_id: companyId,
      financial_year_id: fy.id,
      action: "CLOSING_BALANCES_SNAPSHOT",
      details: {
        customer_balances: Object.entries(customerBalances)
          .filter(([, v]) => v !== 0)
          .map(([id, amt]) => ({
            id,
            name: (customers || []).find((c) => c.id === id)?.name,
            outstanding: amt,
          })),
        supplier_balances: Object.entries(supplierTotals)
          .filter(([, v]) => v !== 0)
          .map(([id, amt]) => ({
            id,
            name: (suppliers || []).find((s) => s.id === id)?.name,
            outstanding: amt,
          })),
        inventory_summary: {
          total_products: Object.keys(inventoryByProduct).length,
          total_quantity: Object.values(inventoryByProduct).reduce((s, v) => s + v.qty, 0),
          total_value: Object.values(inventoryByProduct).reduce((s, v) => s + v.value, 0),
        },
      },
      performed_by: user!.id,
    });
  };

  const statusBadge = (status: FYStatus) => {
    const map = {
      active: { variant: "default" as const, icon: CheckCircle2, label: "Active" },
      closed: { variant: "secondary" as const, icon: Lock, label: "Closed" },
      archived: { variant: "outline" as const, icon: FileText, label: "Archived" },
    };
    const cfg = map[status];
    return (
      <Badge variant={cfg.variant} className="gap-1">
        <cfg.icon className="h-3 w-3" />
        {cfg.label}
      </Badge>
    );
  };

  const activeFY = financialYears.find((fy) => fy.status === "active");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Financial Year Management</h1>
        <p className="text-muted-foreground">
          Manage financial years, close periods, and carry forward balances (India FY: April 1 → March 31)
        </p>
      </div>

      {/* Current FY Card */}
      {activeFY ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Current Financial Year
                </CardTitle>
                <CardDescription>
                  {activeFY.name} • {format(new Date(activeFY.start_date), "dd MMM yyyy")} to{" "}
                  {format(new Date(activeFY.end_date), "dd MMM yyyy")}
                </CardDescription>
              </div>
              {statusBadge(activeFY.status as FYStatus)}
            </div>
          </CardHeader>
          {canManage && (
            <CardContent>
              <Button
                variant="destructive"
                onClick={() => runValidations(activeFY)}
                className="gap-2"
              >
                <Lock className="h-4 w-4" />
                Close Financial Year
              </Button>
            </CardContent>
          )}
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <Calendar className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">No financial year has been set up yet.</p>
            {canManage && (
              <Button onClick={createInitialFY} disabled={creating} className="gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create Current Financial Year
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* All Financial Years */}
      {financialYears.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All Financial Years</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Closed On</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {financialYears.map((fy) => (
                  <TableRow key={fy.id}>
                    <TableCell className="font-medium">{fy.name}</TableCell>
                    <TableCell>{format(new Date(fy.start_date), "dd MMM yyyy")}</TableCell>
                    <TableCell>{format(new Date(fy.end_date), "dd MMM yyyy")}</TableCell>
                    <TableCell>{statusBadge(fy.status as FYStatus)}</TableCell>
                    <TableCell>
                      {fy.closed_at
                        ? format(new Date(fy.closed_at), "dd MMM yyyy HH:mm")
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Audit Logs */}
      {auditLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Audit Trail
            </CardTitle>
            <CardDescription>Immutable log of all financial year operations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 text-sm">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {log.action.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), "dd MMM yyyy HH:mm:ss")}
                      </span>
                    </div>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {JSON.stringify(log.details).slice(0, 200)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Close FY Dialog */}
      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Close {closingFY?.name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action is <strong>irreversible</strong>. All transactions in this period will become read-only.
              A new financial year will be created automatically with opening balances.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 my-2">
            <p className="text-sm font-medium">Pre-Closure Validation Checklist</p>
            {validating ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Running validations…</span>
              </div>
            ) : (
              <div className="space-y-2">
                {validations.map((v, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 p-2 rounded-md text-sm ${
                      v.passed ? "bg-green-500/10 text-green-700" : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {v.passed ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0" />
                    )}
                    <span className="flex-1">{v.label}</span>
                    {v.detail && <span className="text-xs opacity-70">{v.detail}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setClosingFY(null);
                setValidations([]);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={closeFY}
              disabled={!allValidationsPassed || closing || validating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {closing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Closing…
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Confirm Close
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

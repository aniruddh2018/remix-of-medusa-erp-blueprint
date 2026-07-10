import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useMigrationMode } from "@/hooks/useMigrationMode";
import { listActiveUnlocks, revokeUnlock, type FyUnlock } from "@/services/fy/unlock";
import { Loader2, ShieldAlert, Play, Wand2, Scale, ArrowLeftRight } from "lucide-react";
import { computeReconciliation, applyReconciliation, type ReconcilePlan } from "@/services/fy/reconcile";

type Stats = { sales: number; purchases: number; payments: number; skipped: number; missing_fy: number };

/**
 * Admin console for FY v2: backfill legacy rows into canonical tables, run
 * year-end close, view + revoke active unlock windows.
 */
export default function FinancialYearAdmin() {
  const { companyId, financialYears, refreshFinancialYears } = useBusiness();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("super_admin");

  const [busy, setBusy] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [unlocks, setUnlocks] = useState<FyUnlock[]>([]);
  const [reconPlan, setReconPlan] = useState<ReconcilePlan | null>(null);

  const loadUnlocks = async () => {
    if (!companyId) return;
    try { setUnlocks(await listActiveUnlocks(companyId)); } catch { /* ignore */ }
  };
  useEffect(() => { loadUnlocks(); }, [companyId]);

  const runBackfill = async (dryRun: boolean) => {
    if (!companyId) return;
    setBusy(dryRun ? "dry" : "run");
    try {
      const { data, error } = await supabase.functions.invoke("fy-backfill", {
        body: { company_id: companyId, dry_run: dryRun },
      });
      if (error) throw error;
      setStats((data as { stats: Stats }).stats);
      toast({ title: dryRun ? "Dry run complete" : "Backfill complete" });
      await refreshFinancialYears();
    } catch (e) {
      toast({ title: "Backfill failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const runClose = async (sourceFyId: string) => {
    if (!companyId) return;
    // Create the next FY (Apr–Mar of source.end_date + 1)
    const source = financialYears.find((f) => f.id === sourceFyId);
    if (!source) return;
    const endYear = Number(source.end_date.slice(0, 4));
    const start = `${endYear}-04-01`;
    const end = `${endYear + 1}-03-31`;
    const name = `FY ${endYear}-${String((endYear + 1) % 100).padStart(2, "0")}`;

    setBusy("close");
    try {
      const { data: targetFy, error: tgtErr } = await supabase
        .from("financial_years")
        .insert({ company_id: companyId, name, start_date: start, end_date: end, status: "draft" })
        .select("id").single();
      if (tgtErr) throw tgtErr;

      const { data, error } = await supabase.functions.invoke("close-financial-year", {
        body: {
          company_id: companyId,
          source_fy_id: sourceFyId,
          target_fy_id: (targetFy as { id: string }).id,
        },
      });
      if (error) throw error;
      toast({
        title: "Year closed",
        description: `Carried ${(data as { ledger_openings?: number }).ledger_openings ?? 0} ledgers and ${(data as { stock_openings?: number }).stock_openings ?? 0} batches.`,
      });
      await refreshFinancialYears();
    } catch (e) {
      toast({ title: "Close failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const runReconcilePreview = async () => {
    if (!companyId) return;
    setBusy("recon-preview");
    try {
      const plan = await computeReconciliation(companyId);
      setReconPlan(plan);
      toast({
        title: "Reconciliation ready",
        description: `${plan.totals.products} products need attention · ${plan.totals.total_opening_qty} opening qty`,
      });
    } catch (e) {
      toast({ title: "Reconciliation failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const runReconcileApply = async () => {
    if (!reconPlan) return;
    setBusy("recon-apply");
    try {
      const r = await applyReconciliation(reconPlan);
      toast({
        title: "Reconciliation applied",
        description: `${r.openingBatchesCreated} opening batches · ${r.batchesTaggedAsOpening} tagged`,
        variant: r.errors.length ? "destructive" : "default",
      });
      setReconPlan(null);
    } catch (e) {
      toast({ title: "Apply failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const activeFy = financialYears.find((y) => y.status === "active");

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Admin access required</AlertTitle>
          <AlertDescription>Only company admins can run backfill and year-close jobs.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Financial Year — Admin</h1>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Wand2 className="h-4 w-4" /> Backfill legacy data</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Reads existing sales, purchases, and payments and writes canonical rows
            into transactions. Missing archived FYs are auto-created. Safe to re-run — duplicates are skipped.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy !== null} onClick={() => runBackfill(true)}>
              {busy === "dry" && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Dry run
            </Button>
            <Button disabled={busy !== null} onClick={() => runBackfill(false)}>
              {busy === "run" && <Loader2 className="h-4 w-4 animate-spin mr-2" />} <Play className="h-4 w-4 mr-1" /> Run backfill
            </Button>
          </div>
          {stats && (
            <div className="text-sm grid grid-cols-2 md:grid-cols-5 gap-2 pt-2">
              <Stat label="Sales" value={stats.sales} />
              <Stat label="Purchases" value={stats.purchases} />
              <Stat label="Payments" value={stats.payments} />
              <Stat label="Skipped" value={stats.skipped} />
              <Stat label="Missing FY" value={stats.missing_fy} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Year-end close</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Closes the active FY, creates the next FY, rolls closing balances into openings, and seeds fresh document numbers.
          </p>
          {activeFy ? (
            <div className="flex items-center gap-3">
              <Badge>{activeFy.name}</Badge>
              <span className="text-sm">{activeFy.start_date} → {activeFy.end_date}</span>
              <Button disabled={busy !== null} onClick={() => runClose(activeFy.id)}>
                {busy === "close" && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Close & open next
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active FY.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Scale className="h-4 w-4" /> Stock reconciliation (opening balances)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Compares imported on-hand stock against past-FY purchase/sales history. Any leftover quantity
            is posted as an OPENING batch dated to the earliest past FY's end. Sales/purchase history is never modified.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy !== null} onClick={runReconcilePreview}>
              {busy === "recon-preview" && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Preview
            </Button>
            <Button disabled={busy !== null || !reconPlan || reconPlan.lines.length === 0} onClick={runReconcileApply}>
              {busy === "recon-apply" && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Apply reconciliation
            </Button>
          </div>
          {reconPlan && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <Stat label="Products" value={reconPlan.totals.products} />
                <Stat label="Opening qty" value={reconPlan.totals.total_opening_qty} />
                <Stat label="Shortfall qty" value={reconPlan.totals.total_shortfall_qty} />
                <Stat label="Unmatched batches" value={reconPlan.totals.unmatched_batches} />
              </div>
              {!reconPlan.earliestFy && (
                <Alert variant="destructive">
                  <AlertDescription>No financial year found. Create one before applying.</AlertDescription>
                </Alert>
              )}
              {reconPlan.totals.per_fy.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Opening allocation by FY:{" "}
                  {reconPlan.totals.per_fy
                    .filter((f) => f.opening_qty > 0)
                    .map((f) => `${f.fy_name}: ${f.opening_qty}`)
                    .join(" · ") || "—"}
                </div>
              )}
              <div className="border rounded max-h-72 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="p-2">Product</th>
                      <th className="p-2 text-right">On hand</th>
                      <th className="p-2 text-right">Purchased</th>
                      <th className="p-2 text-right">Sold</th>
                      <th className="p-2">Opening by FY</th>
                      <th className="p-2 text-right">Shortfall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconPlan.lines.slice(0, 200).map((l) => (
                      <tr key={l.product_id} className="border-t">
                        <td className="p-2">{l.product_name}</td>
                        <td className="p-2 text-right">{l.on_hand_qty}</td>
                        <td className="p-2 text-right">{l.total_purchased_qty}</td>
                        <td className="p-2 text-right">{l.total_sold_qty}</td>
                        <td className="p-2 font-medium">
                          {l.allocations.length === 0
                            ? "—"
                            : l.allocations.map((a) => `${a.fy_name}: ${a.opening_qty}`).join(", ")}
                        </td>
                        <td className={`p-2 text-right ${l.shortfall_qty ? "text-destructive" : ""}`}>{l.shortfall_qty || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {reconPlan.lines.length > 200 && (
                  <div className="p-2 text-xs text-center text-muted-foreground border-t">
                    Showing first 200 of {reconPlan.lines.length}.
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Active FY unlocks</CardTitle></CardHeader>
        <CardContent>
          {unlocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active unlock windows.</p>
          ) : (
            <ul className="space-y-2">
              {unlocks.map((u) => (
                <li key={u.id} className="flex items-center justify-between border rounded p-2 text-sm">
                  <div>
                    <div className="font-medium">{financialYears.find((y) => y.id === u.financial_year_id)?.name ?? u.financial_year_id}</div>
                    <div className="text-muted-foreground">{u.reason} · expires {new Date(u.expires_at).toLocaleString()}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={async () => { await revokeUnlock(u.id); await loadUnlocks(); }}>Revoke</Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

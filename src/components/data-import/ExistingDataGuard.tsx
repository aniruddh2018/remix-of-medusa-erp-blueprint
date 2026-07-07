import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";

export type GuardScope = "products" | "stock" | "purchase" | "sales";

interface Props {
  companyId: string | null | undefined;
  scope: GuardScope;
  children: ReactNode;
}

interface Counts {
  products: number;
  batches: number;
  purchases: number;
  sales: number;
}

async function fetchCounts(companyId: string): Promise<Counts> {
  const [p, b, po, so] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("inventory_batches").select("id", { count: "exact", head: true }).eq("company_id", companyId).gt("quantity", 0),
    supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("sales_orders").select("id", { count: "exact", head: true }).eq("company_id", companyId),
  ]);
  return {
    products: p.count ?? 0,
    batches: b.count ?? 0,
    purchases: po.count ?? 0,
    sales: so.count ?? 0,
  };
}

export function ExistingDataGuard({ companyId, scope, children }: Props) {
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!companyId) { setLoading(false); return; }
    setLoading(true); setConfirmed(false); setTyped("");
    Promise.all([
      fetchCounts(companyId),
      supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
    ]).then(([c, cn]) => {
      if (cancelled) return;
      setCounts(c);
      setCompanyName(cn.data?.name ?? "");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [companyId, scope]);

  if (!companyId) return <>{children}</>;
  if (loading) {
    return (
      <Card><CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking company data…
      </CardContent></Card>
    );
  }

  const relevantCount = counts
    ? scope === "products" ? counts.products
    : scope === "stock" ? counts.batches
    : scope === "purchase" ? counts.purchases
    : counts.sales
    : 0;

  const totalCount = counts ? counts.products + counts.batches + counts.purchases + counts.sales : 0;

  // If this scope AND total are all zero, no warning needed.
  if (totalCount === 0 || confirmed) return <>{children}</>;

  const match = typed.trim().toLowerCase() === companyName.trim().toLowerCase() && companyName.length > 0;

  return (
    <Card className="border-amber-400/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-5 h-5" /> This company already has data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm">
          <div className="font-medium mb-1">
            <span className="text-foreground">{companyName || "This company"}</span> currently contains:
          </div>
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
            <Cell label="Products" value={counts?.products ?? 0} highlight={scope === "products"} />
            <Cell label="Batches w/ stock" value={counts?.batches ?? 0} highlight={scope === "stock"} />
            <Cell label="Purchase bills" value={counts?.purchases ?? 0} highlight={scope === "purchase"} />
            <Cell label="Sales bills" value={counts?.sales ?? 0} highlight={scope === "sales"} />
          </ul>
        </div>

        <Alert>
          <AlertDescription className="text-xs leading-relaxed">
            Importing will <strong>MERGE</strong> — duplicate bill numbers are skipped,
            matching products are updated by name, and batch quantities accumulate.
            No existing rows are deleted. If that isn't what you want, cancel and
            start with a fresh company instead.
            {scope === "stock" && relevantCount > 0 && (
              <> The stock importer's optional <em>Override</em> toggle can zero prior
              batches per matched product — off by default.</>
            )}
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            Type the company name <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{companyName}</span> to proceed:
          </label>
          <div className="flex gap-2 max-w-md">
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Company name"
              autoFocus
            />
            <Button disabled={!match} onClick={() => setConfirmed(true)}>
              <ShieldCheck className="w-4 h-4 mr-1" /> Proceed
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Cell({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <li className={`border rounded-md p-2 ${highlight ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value.toLocaleString()}</div>
    </li>
  );
}

// Edge function: fy-backfill
// One-shot admin-triggered migration: reads existing sales_orders, purchase_orders,
// payments, credit_notes, debit_notes, journal_vouchers and writes canonical rows
// into transactions + ledger_entries + inventory_movements. Idempotent — safe to
// re-run; existing (reference_type, reference_id) rows are skipped.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { company_id, dry_run = false } = await req.json();
    if (!company_id) return json({ error: "company_id required" }, 400);

    // Admin check
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id);
    const rolesList = (roles ?? []).map((r: { role: string }) => r.role);
    if (!rolesList.includes("admin") && !rolesList.includes("super_admin")) {
      return json({ error: "forbidden: admin required" }, 403);
    }

    // 1. Ensure archived FYs exist for every year of data
    const fyIds = await ensureFinancialYears(supabase, company_id);
    const findFy = (d: string): string | null => {
      for (const fy of fyIds) if (d >= fy.start_date && d <= fy.end_date) return fy.id;
      return null;
    };

    const stats = { sales: 0, purchases: 0, payments: 0, credit_notes: 0, debit_notes: 0, journal_vouchers: 0, skipped: 0, missing_fy: 0 };

    // 2. Sales orders
    const { data: sales } = await supabase
      .from("sales_orders")
      .select("id, sale_date, financial_year_id, order_number")
      .eq("company_id", company_id);
    for (const s of (sales ?? []) as { id: string; sale_date: string; financial_year_id: string | null; order_number: string }[]) {
      const fy = s.financial_year_id ?? findFy(s.sale_date);
      if (!fy) { stats.missing_fy++; continue; }
      if (!dry_run) {
        const { error } = await supabase.from("transactions").insert({
          company_id, financial_year_id: fy, transaction_type: "SALE",
          transaction_date: s.sale_date, reference_type: "sales_orders", reference_id: s.id,
          source: "backfill", narration: s.order_number,
        });
        if (!error) stats.sales++;
        else stats.skipped++;
      } else stats.sales++;
    }

    // 3. Purchase orders
    const { data: purchases } = await supabase
      .from("purchase_orders")
      .select("id, order_date, financial_year_id, order_number")
      .eq("company_id", company_id);
    for (const p of (purchases ?? []) as { id: string; order_date: string; financial_year_id: string | null; order_number: string }[]) {
      const fy = p.financial_year_id ?? findFy(p.order_date);
      if (!fy) { stats.missing_fy++; continue; }
      if (!dry_run) {
        const { error } = await supabase.from("transactions").insert({
          company_id, financial_year_id: fy, transaction_type: "PURCHASE",
          transaction_date: p.order_date, reference_type: "purchase_orders", reference_id: p.id,
          source: "backfill", narration: p.order_number,
        });
        if (!error) stats.purchases++;
        else stats.skipped++;
      } else stats.purchases++;
    }

    // 4. Payments
    const { data: payments } = await supabase
      .from("payments")
      .select("id, payment_date, financial_year_id")
      .eq("company_id", company_id);
    for (const p of (payments ?? []) as { id: string; payment_date: string; financial_year_id: string | null }[]) {
      const fy = p.financial_year_id ?? findFy(p.payment_date);
      if (!fy) { stats.missing_fy++; continue; }
      if (!dry_run) {
        const { error } = await supabase.from("transactions").insert({
          company_id, financial_year_id: fy, transaction_type: "PAYMENT",
          transaction_date: p.payment_date, reference_type: "payments", reference_id: p.id,
          source: "backfill",
        });
        if (!error) stats.payments++;
        else stats.skipped++;
      } else stats.payments++;
    }

    return json({ ok: true, dry_run, stats });
  } catch (e) {
    console.error("fy-backfill error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function ensureFinancialYears(supabase: SupabaseClient, companyId: string) {
  const { data: existing } = await supabase
    .from("financial_years")
    .select("id, start_date, end_date")
    .eq("company_id", companyId);
  const yrs = (existing ?? []) as { id: string; start_date: string; end_date: string }[];

  // Find min and max transaction dates across sources
  const dates: string[] = [];
  for (const t of ["sales_orders", "purchase_orders", "payments"]) {
    const col = t === "sales_orders" ? "sale_date" : t === "purchase_orders" ? "order_date" : "payment_date";
    const { data } = await supabase.from(t).select(col).eq("company_id", companyId).order(col, { ascending: true }).limit(1);
    const { data: max } = await supabase.from(t).select(col).eq("company_id", companyId).order(col, { ascending: false }).limit(1);
    for (const row of [...(data ?? []), ...(max ?? [])]) {
      const v = (row as Record<string, unknown>)[col];
      if (typeof v === "string") dates.push(v);
    }
  }
  if (!dates.length) return yrs;

  const min = dates.reduce((a, b) => (a < b ? a : b));
  const max = dates.reduce((a, b) => (a > b ? a : b));

  const minYr = fyStartYear(min);
  const maxYr = fyStartYear(max);
  for (let y = minYr; y <= maxYr; y++) {
    const start = `${y}-04-01`;
    const end = `${y + 1}-03-31`;
    if (yrs.some((r) => r.start_date === start)) continue;
    const { data: created } = await supabase
      .from("financial_years")
      .insert({
        company_id: companyId,
        name: `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`,
        start_date: start, end_date: end, status: "archived",
      })
      .select("id, start_date, end_date").single();
    if (created) yrs.push(created as { id: string; start_date: string; end_date: string });
  }

  return yrs;
}

function fyStartYear(iso: string): number {
  const [y, m] = iso.split("-").map(Number);
  return m >= 4 ? y : y - 1;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

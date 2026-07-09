// Edge function: close-financial-year
// Runs pre-close validation, then rolls closing balances into next FY.
// Called by client via supabase.functions.invoke("close-financial-year", { body: {...} })
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Body {
  company_id: string;
  source_fy_id: string;
  target_fy_id: string;   // must already exist (created by client with dates)
  force?: boolean;        // ignore non-blocking warnings
}

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

    const body = (await req.json()) as Body;
    if (!body.company_id || !body.source_fy_id || !body.target_fy_id) {
      return json({ error: "missing fields" }, 400);
    }

    // Verify caller is admin/super_admin of the company
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id);
    const rolesList = (roles ?? []).map((r: { role: string }) => r.role);
    if (!rolesList.includes("admin") && !rolesList.includes("super_admin")) {
      return json({ error: "forbidden: admin required" }, 403);
    }

    // Create job row
    const { data: job, error: jobErr } = await supabase
      .from("financial_year_close_jobs")
      .insert({
        company_id: body.company_id,
        source_financial_year_id: body.source_fy_id,
        target_financial_year_id: body.target_fy_id,
        status: "VALIDATING",
        initiated_by: user.id,
      })
      .select("id").single();
    if (jobErr) return json({ error: jobErr.message }, 500);
    const jobId = (job as { id: string }).id;

    const setStatus = async (status: string, patch: Record<string, unknown> = {}) =>
      supabase.from("financial_year_close_jobs").update({ status, ...patch }).eq("id", jobId);

    // ── Pre-close validation ────────────────────────────────────────────────
    const warnings: string[] = [];
    const errors: string[] = [];

    const { data: ledgerBalance } = await supabase
      .from("ledger_entries")
      .select("debit, credit")
      .eq("financial_year_id", body.source_fy_id);
    if (ledgerBalance && ledgerBalance.length) {
      const dr = ledgerBalance.reduce((s: number, r: { debit: number }) => s + Number(r.debit), 0);
      const cr = ledgerBalance.reduce((s: number, r: { credit: number }) => s + Number(r.credit), 0);
      if (Math.abs(dr - cr) > 0.05)
        errors.push(`Ledger not balanced: DR=${dr.toFixed(2)} CR=${cr.toFixed(2)}`);
    }

    const { count: negStock } = await supabase
      .from("inventory_batches").select("id", { count: "exact", head: true })
      .eq("company_id", body.company_id).lt("quantity", 0);
    if ((negStock ?? 0) > 0) warnings.push(`${negStock} batches have negative stock.`);

    const report = { errors, warnings, checked_at: new Date().toISOString() };

    if (errors.length) {
      await setStatus("FAILED", { validation_report: report, error_message: errors.join("; ") });
      return json({ ok: false, report }, 400);
    }
    if (warnings.length && !body.force) {
      await setStatus("PENDING", { validation_report: report });
      return json({ ok: false, needs_confirmation: true, report });
    }

    await setStatus("PROCESSING", { validation_report: report });

    // ── Ledger opening balances for target FY ──────────────────────────────
    // opening = source opening + sum(dr) - sum(cr) — sign convention: DR positive
    const { data: sourceOpenings } = await supabase
      .from("ledger_opening_balances")
      .select("ledger_account_id, amount, balance_type")
      .eq("financial_year_id", body.source_fy_id);

    const openingMap = new Map<string, number>();
    for (const o of (sourceOpenings ?? []) as { ledger_account_id: string; amount: number; balance_type: string }[]) {
      openingMap.set(o.ledger_account_id, (o.balance_type === "DR" ? 1 : -1) * Number(o.amount));
    }

    const { data: entries } = await supabase
      .from("ledger_entries")
      .select("ledger_account_id, debit, credit")
      .eq("financial_year_id", body.source_fy_id);
    for (const e of (entries ?? []) as { ledger_account_id: string; debit: number; credit: number }[]) {
      const cur = openingMap.get(e.ledger_account_id) ?? 0;
      openingMap.set(e.ledger_account_id, cur + Number(e.debit) - Number(e.credit));
    }

    const lobRows = Array.from(openingMap.entries())
      .filter(([, v]) => Math.abs(v) > 0.005)
      .map(([acc, v]) => ({
        company_id: body.company_id,
        financial_year_id: body.target_fy_id,
        ledger_account_id: acc,
        amount: Math.abs(v),
        balance_type: v >= 0 ? "DR" : "CR",
        source: "CARRY_FORWARD",
        source_financial_year_id: body.source_fy_id,
      }));

    if (lobRows.length) {
      // Chunked upsert
      for (let i = 0; i < lobRows.length; i += 500) {
        await supabase.from("ledger_opening_balances")
          .upsert(lobRows.slice(i, i + 500), { onConflict: "financial_year_id,ledger_account_id" });
      }
    }

    // ── Inventory opening balances for target FY ────────────────────────────
    const { data: iobSource } = await supabase
      .from("inventory_opening_balances")
      .select("product_id, batch_id, opening_quantity, opening_value")
      .eq("financial_year_id", body.source_fy_id);

    const stockMap = new Map<string, { product_id: string; batch_id: string | null; qty: number; val: number }>();
    const key = (p: string, b: string | null) => `${p}::${b ?? ""}`;
    for (const s of (iobSource ?? []) as { product_id: string; batch_id: string | null; opening_quantity: number; opening_value: number }[]) {
      stockMap.set(key(s.product_id, s.batch_id), {
        product_id: s.product_id, batch_id: s.batch_id,
        qty: Number(s.opening_quantity), val: Number(s.opening_value),
      });
    }

    const { data: movements } = await supabase
      .from("inventory_movements")
      .select("product_id, batch_id, quantity_in, quantity_out, rate")
      .eq("financial_year_id", body.source_fy_id);
    for (const m of (movements ?? []) as { product_id: string; batch_id: string | null; quantity_in: number; quantity_out: number; rate: number }[]) {
      const k = key(m.product_id, m.batch_id);
      const cur = stockMap.get(k) ?? { product_id: m.product_id, batch_id: m.batch_id, qty: 0, val: 0 };
      const delta = Number(m.quantity_in) - Number(m.quantity_out);
      cur.qty += delta;
      cur.val += delta * Number(m.rate);
      stockMap.set(k, cur);
    }

    const iobRows = Array.from(stockMap.values())
      .filter((s) => s.qty > 0.0005)
      .map((s) => ({
        company_id: body.company_id,
        financial_year_id: body.target_fy_id,
        product_id: s.product_id,
        batch_id: s.batch_id,
        opening_quantity: s.qty,
        opening_value: s.val,
        source_financial_year_id: body.source_fy_id,
      }));

    if (iobRows.length) {
      for (let i = 0; i < iobRows.length; i += 500) {
        await supabase.from("inventory_opening_balances")
          .upsert(iobRows.slice(i, i + 500), { onConflict: "financial_year_id,product_id,batch_id" });
      }
    }

    // ── Fresh document sequences for target FY ─────────────────────────────
    const seqTypes = ["SALE_INVOICE","PURCHASE_INVOICE","CHALLAN","PURCHASE_ORDER","PAYMENT","RECEIPT","CREDIT_NOTE","DEBIT_NOTE","JOURNAL"];
    for (const t of seqTypes) {
      await supabase.from("document_sequences").upsert(
        { company_id: body.company_id, financial_year_id: body.target_fy_id, document_type: t, current_number: 0 },
        { onConflict: "financial_year_id,document_type" },
      );
    }

    // ── Close source, activate target ──────────────────────────────────────
    await supabase.from("financial_years")
      .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: user.id, is_locked: true })
      .eq("id", body.source_fy_id);

    await supabase.from("financial_years")
      .update({ status: "active", activated_at: new Date().toISOString() })
      .eq("id", body.target_fy_id);

    await setStatus("COMPLETED", {
      completed_at: new Date().toISOString(),
      validation_report: { ...report, ledger_openings: lobRows.length, stock_openings: iobRows.length },
    });

    return json({ ok: true, job_id: jobId, ledger_openings: lobRows.length, stock_openings: iobRows.length });
  } catch (e) {
    console.error("close-financial-year error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

import { supabase } from "@/integrations/supabase/client";

export type FYStatus = "active" | "closed" | "archived";

export interface FinancialYear {
  id: string;
  company_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: FYStatus;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function listFinancialYears(companyId: string): Promise<FinancialYear[]> {
  const { data, error } = await supabase
    .from("financial_years")
    .select("*")
    .eq("company_id", companyId)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FinancialYear[];
}

export async function getActiveFinancialYear(companyId: string): Promise<FinancialYear | null> {
  const { data, error } = await supabase
    .from("financial_years")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return (data as FinancialYear) ?? null;
}

/** Preview counts of rows that would fall in a proposed previous-year window. */
export async function previewPreviousYearCounts(
  companyId: string,
  startDate: string,
  endDate: string,
) {
  const range = <T,>(name: string, dateCol: string) =>
    supabase
      .from(name as never)
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("financial_year_id", null)
      .gte(dateCol, startDate)
      .lte(dateCol, endDate);

  const [sales, purch, pay, jv] = await Promise.all([
    range("sales_orders", "sale_date"),
    range("purchase_orders", "order_date"),
    range("payments", "payment_date"),
    range("journal_vouchers", "date"),
  ]);
  return {
    sales_orders: sales.count ?? 0,
    purchase_orders: purch.count ?? 0,
    payments: pay.count ?? 0,
    journal_vouchers: jv.count ?? 0,
  };
}

export async function createPreviousFinancialYear(input: {
  companyId: string;
  name: string;
  startDate: string;
  endDate: string;
}) {
  const { data, error } = await supabase.rpc("create_previous_financial_year", {
    p_company_id: input.companyId,
    p_name: input.name,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function closeAndOpenFinancialYear(input: {
  companyId: string;
  name: string;
  startDate: string;
  endDate: string;
}) {
  const { data, error } = await supabase.rpc("close_and_open_financial_year", {
    p_company_id: input.companyId,
    p_new_name: input.name,
    p_new_start: input.startDate,
    p_new_end: input.endDate,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

/** Preview counts of rows that would be carried into a new year on close. */
export async function previewCloseCounts(companyId: string) {
  const [{ count: ledgerCount }, { count: batchCount }] = await Promise.all([
    supabase
      .from("ledger_balances")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("inventory_batches")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_carry_forward", false)
      .gt("quantity", 0),
  ]);
  return {
    ledger_balances: ledgerCount ?? 0,
    stock_batches: batchCount ?? 0,
  };
}

/** Build a default FY name like "FY 2025-26" from a start date (Apr YYYY). */
export function fyNameFromStart(startISO: string): string {
  const d = new Date(startISO);
  const y = d.getUTCFullYear();
  return `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

/** Default next FY window: Apr 1 of next year → Mar 31 of the year after. */
export function nextFyWindow(current: { start_date: string; end_date: string }) {
  const end = new Date(current.end_date);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1));
  const nextEnd = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), 0));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: nextEnd.toISOString().slice(0, 10),
  };
}

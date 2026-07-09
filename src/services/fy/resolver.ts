import { supabase } from "@/integrations/supabase/client";

/** Thrown when a transaction date does not fall inside any Financial Year. */
export class FinancialYearNotFoundError extends Error {
  code = "FY_NOT_FOUND" as const;
  constructor(public companyId: string, public txDate: string) {
    super(`No Financial Year covers ${txDate}`);
  }
}

/** Thrown when the resolved FY is not writable (closed / locked / no unlock). */
export class FinancialYearLockedError extends Error {
  code = "FY_LOCKED" as const;
  constructor(public fyId: string) {
    super(`Financial Year ${fyId} is locked or closed`);
  }
}

/**
 * Resolve the FY that owns a given transaction date. Never falls back to
 * "current" — a NULL result means the caller must reconcile (create FY,
 * change date, or route to import review).
 */
export async function resolveFinancialYear(
  companyId: string,
  txDate: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("resolve_financial_year", {
    _company_id: companyId,
    _tx_date: txDate,
  });
  if (error) throw error;
  if (!data) throw new FinancialYearNotFoundError(companyId, txDate);
  return data as string;
}

export async function tryResolveFinancialYear(
  companyId: string,
  txDate: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("resolve_financial_year", {
    _company_id: companyId,
    _tx_date: txDate,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** True if the current user may post/edit rows in this FY right now. */
export async function isFinancialYearWritable(
  fyId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_financial_year_writable", {
    _fy_id: fyId,
    _user_id: userId,
  });
  if (error) throw error;
  return Boolean(data);
}

/** Resolve + writability check in one shot. Throws on either failure. */
export async function assertWritableFy(
  companyId: string,
  txDate: string,
  userId: string,
): Promise<string> {
  const fyId = await resolveFinancialYear(companyId, txDate);
  const ok = await isFinancialYearWritable(fyId, userId);
  if (!ok) throw new FinancialYearLockedError(fyId);
  return fyId;
}

/** Atomic per-FY document numbering. */
export async function nextDocumentNumber(
  companyId: string,
  fyId: string,
  documentType:
    | "SALE_INVOICE"
    | "PURCHASE_INVOICE"
    | "CHALLAN"
    | "PURCHASE_ORDER"
    | "PAYMENT"
    | "RECEIPT"
    | "CREDIT_NOTE"
    | "DEBIT_NOTE"
    | "JOURNAL",
): Promise<string> {
  const { data, error } = await supabase.rpc("next_document_number", {
    _company_id: companyId,
    _fy_id: fyId,
    _doc_type: documentType,
  });
  if (error) throw error;
  return data as string;
}

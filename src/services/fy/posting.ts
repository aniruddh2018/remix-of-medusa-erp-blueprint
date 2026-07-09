import { supabase } from "@/integrations/supabase/client";
import { assertWritableFy } from "./resolver";

export type TxnType =
  | "SALE"
  | "PURCHASE"
  | "SALE_RETURN"
  | "PURCHASE_RETURN"
  | "PAYMENT"
  | "RECEIPT"
  | "JOURNAL"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "STOCK_ADJUSTMENT"
  | "OPENING_BALANCE";

export type MovementType =
  | "PURCHASE"
  | "SALE"
  | "SALE_RETURN"
  | "PURCHASE_RETURN"
  | "OPENING_STOCK"
  | "STOCK_ADJUSTMENT"
  | "EXPIRY"
  | "DAMAGE"
  | "TRANSFER_IN"
  | "TRANSFER_OUT";

export interface LedgerLine {
  ledger_account_id: string;
  debit?: number;
  credit?: number;
  narration?: string;
}

export interface StockLine {
  product_id: string;
  batch_id?: string | null;
  movement_type: MovementType;
  quantity_in?: number;
  quantity_out?: number;
  rate?: number;
  narration?: string;
}

export interface PostTransactionInput {
  companyId: string;
  userId: string;
  transactionType: TxnType;
  transactionDate: string;
  referenceType: string;   // 'sales_orders' | 'purchase_orders' | 'payments' | ...
  referenceId: string;
  narration?: string;
  source?: string;         // 'app' | 'marg' | 'tally' | 'import'
  ledgerLines?: LedgerLine[];
  stockLines?: StockLine[];
}

/**
 * Canonical posting entry point. Resolves FY, validates writable, then writes:
 *   - 1 row in `transactions`
 *   - N rows in `ledger_entries`
 *   - N rows in `inventory_movements`
 *
 * Debit/credit must balance across ledgerLines. Idempotent via
 * (reference_type, reference_id) unique constraint — will throw on duplicate.
 */
export async function postTransaction(input: PostTransactionInput): Promise<string> {
  const fyId = await assertWritableFy(
    input.companyId,
    input.transactionDate,
    input.userId,
  );

  // Balance check
  const lines = input.ledgerLines ?? [];
  if (lines.length) {
    const dr = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const cr = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
    if (Math.abs(dr - cr) > 0.01) {
      throw new Error(`Ledger not balanced: DR=${dr.toFixed(2)} CR=${cr.toFixed(2)}`);
    }
  }

  const { data: txn, error: txnErr } = await supabase
    .from("transactions")
    .insert({
      company_id: input.companyId,
      financial_year_id: fyId,
      transaction_type: input.transactionType,
      transaction_date: input.transactionDate,
      reference_type: input.referenceType,
      reference_id: input.referenceId,
      source: input.source ?? "app",
      narration: input.narration,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (txnErr) throw txnErr;

  const txnId = (txn as { id: string }).id;

  if (lines.length) {
    const { error: leErr } = await supabase.from("ledger_entries").insert(
      lines.map((l) => ({
        company_id: input.companyId,
        transaction_id: txnId,
        financial_year_id: fyId,
        ledger_account_id: l.ledger_account_id,
        entry_date: input.transactionDate,
        debit: l.debit ?? 0,
        credit: l.credit ?? 0,
        narration: l.narration ?? input.narration ?? null,
      })),
    );
    if (leErr) {
      // Manual rollback of header row (no server tx here)
      await supabase.from("transactions").delete().eq("id", txnId);
      throw leErr;
    }
  }

  const stock = input.stockLines ?? [];
  if (stock.length) {
    const { error: imErr } = await supabase.from("inventory_movements").insert(
      stock.map((s) => ({
        company_id: input.companyId,
        transaction_id: txnId,
        financial_year_id: fyId,
        product_id: s.product_id,
        batch_id: s.batch_id ?? null,
        movement_date: input.transactionDate,
        movement_type: s.movement_type,
        quantity_in: s.quantity_in ?? 0,
        quantity_out: s.quantity_out ?? 0,
        rate: s.rate ?? 0,
        narration: s.narration ?? null,
      })),
    );
    if (imErr) {
      await supabase.from("ledger_entries").delete().eq("transaction_id", txnId);
      await supabase.from("transactions").delete().eq("id", txnId);
      throw imErr;
    }
  }

  return txnId;
}

/** Reverse a posting (e.g. edit / cancel). Deletes by (reference_type, reference_id). */
export async function reverseTransaction(referenceType: string, referenceId: string) {
  const { data } = await supabase
    .from("transactions")
    .select("id")
    .eq("reference_type", referenceType)
    .eq("reference_id", referenceId)
    .maybeSingle();
  const txnId = (data as { id: string } | null)?.id;
  if (!txnId) return;
  await supabase.from("inventory_movements").delete().eq("transaction_id", txnId);
  await supabase.from("ledger_entries").delete().eq("transaction_id", txnId);
  await supabase.from("transactions").delete().eq("id", txnId);
}

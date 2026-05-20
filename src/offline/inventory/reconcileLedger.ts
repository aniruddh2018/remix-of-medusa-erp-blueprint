/**
 * Inventory ledger reconciliation client.
 *
 * Calls the `reconcile_inventory_ledger` RPC which compares each
 * inventory_batches row against the sum of its inventory_transactions.
 * When `apply=true` it inserts an adjustment transaction and forces the
 * stored stock to match the ledger (collapsing loose into sealed).
 */
import { supabase } from "@/integrations/supabase/client";

export interface LedgerDriftRow {
  batch_id: string;
  product_id: string;
  batch_number: string;
  stored_qty: number;
  ledger_qty: number;
  diff: number;
  applied: boolean;
}

export async function reconcileInventoryLedger(
  companyId: string,
  apply = false,
): Promise<LedgerDriftRow[]> {
  const { data, error } = await supabase.rpc("reconcile_inventory_ledger" as never, {
    p_company_id: companyId,
    p_apply: apply,
  } as never);
  if (error) throw error;
  return (data ?? []) as LedgerDriftRow[];
}

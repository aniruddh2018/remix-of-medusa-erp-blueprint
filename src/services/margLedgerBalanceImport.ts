/**
 * MARG Ledger Balance Importer
 *
 * Takes a trial-balance style export (one row per ledger with a signed
 * BALANCE column) and writes:
 *   1. any missing ledger_groups (mapped to our enum)
 *   2. any missing ledgers under the correct group
 *   3. per-FY entries in `ledger_opening_balances` (upsert)
 *
 * Reconciliation rule (like stock): the imported balance is treated as
 * OPENING for the selected FY. We subtract net movement already posted
 * to `ledger_entries` in the selected FY on/before the as-of date so
 * that live sales/purchases in the current FY are not double-counted.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ParsedLedgerBalanceRow } from "./margLedgerBalanceParse";
import { mapGroupType } from "./margLedgerBalanceParse";

export interface LedgerBalanceImportOptions {
  companyId: string;
  financialYearId: string | null;
  /** yyyy-mm-dd — reconcile against ledger_entries up to this date. */
  asOfDate: string;
  /** If true, subtract current-FY movement so imported balance = OPENING. */
  reconcileAgainstFy: boolean;
  /** If false, only upsert opening balances for ledgers that already exist. */
  createMissingLedgers: boolean;
}

export interface LedgerBalanceImportResult {
  groupsCreated: number;
  ledgersCreated: number;
  ledgersMatched: number;
  openingsInserted: number;
  openingsUpdated: number;
  skippedZero: number;
  skippedNoFy: number;
  unmatched: string[];
  errors: string[];
}

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");

export async function importMargLedgerBalances(
  rows: ParsedLedgerBalanceRow[],
  opts: LedgerBalanceImportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<LedgerBalanceImportResult> {
  const result: LedgerBalanceImportResult = {
    groupsCreated: 0, ledgersCreated: 0, ledgersMatched: 0,
    openingsInserted: 0, openingsUpdated: 0,
    skippedZero: 0, skippedNoFy: 0,
    unmatched: [], errors: [],
  };

  if (!opts.financialYearId) {
    result.errors.push("No financial year selected — opening balances need an FY.");
    result.skippedNoFy = rows.length;
    return result;
  }

  // Preload existing groups & ledgers
  const { data: existingGroups } = await supabase
    .from("ledger_groups").select("id, name, group_type")
    .eq("company_id", opts.companyId);
  const groupByName = new Map<string, { id: string; group_type: string }>();
  for (const g of existingGroups ?? []) {
    groupByName.set(norm(g.name), { id: g.id, group_type: g.group_type });
  }

  const { data: existingLedgers } = await supabase
    .from("ledgers").select("id, name, ledger_group_id")
    .eq("company_id", opts.companyId).eq("is_active", true);
  const ledgerByName = new Map<string, { id: string; ledger_group_id: string | null }>();
  for (const l of existingLedgers ?? []) {
    ledgerByName.set(norm(l.name), { id: l.id, ledger_group_id: l.ledger_group_id });
  }

  // Preload existing openings for this FY so we know insert vs update
  const { data: existingOpenings } = await supabase
    .from("ledger_opening_balances").select("ledger_account_id")
    .eq("company_id", opts.companyId).eq("financial_year_id", opts.financialYearId);
  const openingSet = new Set((existingOpenings ?? []).map((o) => o.ledger_account_id));

  // Fetch the FY range for reconciliation window
  let fyStart = "1900-01-01", fyEnd = opts.asOfDate;
  if (opts.reconcileAgainstFy) {
    const { data: fy } = await supabase
      .from("financial_years").select("start_date, end_date")
      .eq("id", opts.financialYearId).maybeSingle();
    if (fy) {
      fyStart = fy.start_date;
      fyEnd = opts.asOfDate < fy.end_date ? opts.asOfDate : fy.end_date;
    }
  }

  let done = 0;
  for (const row of rows) {
    done++;
    if (done % 25 === 0) onProgress?.(done, rows.length);

    if (row.balance === 0) { result.skippedZero++; continue; }

    // 1. Ensure group exists
    let groupId: string | null = null;
    if (row.groupName) {
      const gKey = norm(row.groupName);
      const hit = groupByName.get(gKey);
      if (hit) groupId = hit.id;
      else {
        const gt = mapGroupType(row.groupName);
        const { data: created, error } = await supabase
          .from("ledger_groups").insert([{
            company_id: opts.companyId,
            name: row.groupName,
            group_type: gt as never,
            source_system: "marg",
          }]).select("id").single();
        if (error) {
          result.errors.push(`Group "${row.groupName}": ${error.message}`);
        } else if (created) {
          groupId = created.id;
          groupByName.set(gKey, { id: created.id, group_type: gt });
          result.groupsCreated++;
        }
      }
    }

    // 2. Find or create ledger
    const lKey = norm(row.ledgerName);
    let ledger = ledgerByName.get(lKey);
    if (!ledger) {
      if (!opts.createMissingLedgers) {
        result.unmatched.push(row.ledgerName);
        continue;
      }
      const balType = row.balance >= 0 ? "debit" : "credit";
      const { data: created, error } = await supabase
        .from("ledgers").insert({
          company_id: opts.companyId,
          name: row.ledgerName,
          ledger_group_id: groupId,
          balance_type: balType,
          source_system: "marg",
          source_ledger_name: row.ledgerName,
          source_group_name: row.groupName || null,
          import_metadata: { imported_via: "marg_ledger_balance", serial: row.serial },
        }).select("id, ledger_group_id").single();
      if (error) {
        result.errors.push(`Ledger "${row.ledgerName}": ${error.message}`);
        continue;
      }
      ledger = { id: created!.id, ledger_group_id: created!.ledger_group_id };
      ledgerByName.set(lKey, ledger);
      result.ledgersCreated++;
    } else {
      result.ledgersMatched++;
    }

    // 3. Compute opening = balance - (net FY movement so far)
    let opening = row.balance;
    if (opts.reconcileAgainstFy) {
      const { data: movRows } = await supabase
        .from("ledger_entries")
        .select("debit, credit")
        .eq("company_id", opts.companyId)
        .eq("ledger_account_id", ledger.id)
        .gte("entry_date", fyStart)
        .lte("entry_date", fyEnd);
      let dr = 0, cr = 0;
      for (const m of movRows ?? []) {
        dr += Number(m.debit ?? 0);
        cr += Number(m.credit ?? 0);
      }
      // Debit-positive convention: net = dr - cr
      opening = row.balance - (dr - cr);
    }

    if (Math.abs(opening) < 0.005) { result.skippedZero++; continue; }

    const balance_type = opening >= 0 ? "DR" : "CR";
    const amount = Math.round(Math.abs(opening) * 100) / 100;

    const already = openingSet.has(ledger.id);
    const { error: upErr } = await supabase
      .from("ledger_opening_balances")
      .upsert(
        {
          company_id: opts.companyId,
          financial_year_id: opts.financialYearId,
          ledger_account_id: ledger.id,
          amount, balance_type,
          source: "MARG_IMPORT",
        },
        { onConflict: "financial_year_id,ledger_account_id" },
      );
    if (upErr) {
      result.errors.push(`Opening "${row.ledgerName}": ${upErr.message}`);
    } else if (already) {
      result.openingsUpdated++;
    } else {
      result.openingsInserted++;
      openingSet.add(ledger.id);
    }
  }

  onProgress?.(rows.length, rows.length);
  return result;
}

export function ledgerBalanceUnmatchedToCsv(names: string[]): string {
  const header = "Ledger Name\n";
  return header + names.map((n) => `"${n.replace(/"/g, '""')}"`).join("\n");
}

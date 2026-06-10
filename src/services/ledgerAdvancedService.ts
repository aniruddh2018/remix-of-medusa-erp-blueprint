import { supabase } from '@/integrations/supabase/client';
import type {
  LedgerAuditEntry,
  TrialBalanceRow,
  TrialBalanceResult,
  DuplicateLedgerGroup,
  CsvLedgerRow,
  FinancialYearCloseResult,
  LedgerRoleType,
  Ledger,
} from '@/types/ledger';
import * as ledgerService from '@/services/ledgerService';
import { mergeLedgersSchema, closeFinancialYearSchema, csvImportSchema } from '@/lib/validation/ledgerSchemas';

// ─── DUPLICATE DETECTION ─────────────────────────────────────────────────────

export async function detectDuplicateLedgers(companyId: string): Promise<DuplicateLedgerGroup[]> {
  const { data, error } = await supabase
    .from('ledgers')
    .select('id, name, gst_number, source_system')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(`Failed to fetch ledgers: ${error.message}`);

  const ledgers = data ?? [];
  const groups: DuplicateLedgerGroup[] = [];
  const seen = new Map<string, number[]>();

  for (const l of ledgers) {
    const nameNorm = l.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const gstNorm = (l.gst_number ?? '').trim();

    const keys: string[] = [];
    if (gstNorm) keys.push(`gst:${gstNorm}`);
    if (nameNorm.length >= 3) keys.push(`name:${nameNorm}`);

    for (const key of keys) {
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(l.id);
    }
  }

  const processed = new Set<string>();
  for (const [, ids] of seen) {
    if (ids.length < 2) continue;
    const key = ids.sort().join(',');
    if (processed.has(key)) continue;
    processed.add(key);

    const matched = ledgers.filter(l => ids.includes(l.id));
    const firstKey = [...seen.entries()].find(([, v]) => v.length >= 2 && v.sort().join(',') === key)?.[0] ?? '';

    groups.push({
      ledgers: matched.map(l => ({
        id: l.id,
        name: l.name as string,
        gstNumber: l.gst_number as string | null,
        roles: [] as LedgerRoleType[],
        sourceSystem: (l.source_system ?? 'manual') as string,
      })),
      matchReason: firstKey.startsWith('gst:') ? 'Same GST number' : 'Similar name (normalized)',
      matchScore: firstKey.startsWith('gst:') ? 1.0 : 0.8,
    });
  }

  for (const group of groups) {
    const { data: roles } = await supabase
      .from('ledger_roles')
      .select('role_type, ledger_id')
      .in('ledger_id', group.ledgers.map(l => l.id));

    for (const l of group.ledgers) {
      l.roles = (roles ?? []).filter(r => r.ledger_id === l.id).map(r => r.role_type as LedgerRoleType);
    }
  }

  return groups.sort((a, b) => b.matchScore - a.matchScore);
}

// ─── AUDIT TRAIL ────────────────────────────────────────────────────────────

export async function getLedgerAuditLog(
  companyId: string,
  filters?: { ledgerId?: string; action?: string; limit?: number; offset?: number },
): Promise<{ data: LedgerAuditEntry[]; count: number }> {
  let query = supabase
    .from('ledger_audit_log')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId);

  if (filters?.ledgerId) query = query.eq('ledger_id', filters.ledgerId);
  if (filters?.action) query = query.eq('action', filters.action);

  query = query.order('created_at', { ascending: false });
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to fetch audit log: ${error.message}`);

  return {
    data: (data ?? []).map(row => ({
      id: row.id as string,
      companyId: row.company_id as string,
      userId: row.user_id as string | null,
      ledgerId: row.ledger_id as string | null,
      action: row.action as LedgerAuditEntry['action'],
      oldValues: (row.old_values ?? {}) as Record<string, unknown>,
      newValues: (row.new_values ?? {}) as Record<string, unknown>,
      changedFields: (row.changed_fields ?? []) as string[],
      description: (row.description ?? '') as string,
      createdAt: row.created_at as string,
    })),
    count: count ?? 0,
  };
}

// ─── TRIAL BALANCE ────────────────────────────────────────────────────────────

export async function getTrialBalance(companyId: string, financialYear: string): Promise<TrialBalanceResult> {
  const { data, error } = await supabase.rpc('trial_balance', {
    p_company_id: companyId,
    p_financial_year: financialYear,
  });

  if (error) throw new Error(`Failed to get trial balance: ${error.message}`);

  const rows: TrialBalanceRow[] = (data ?? []).map((row: Record<string, unknown>) => ({
    groupName: (row.group_name ?? 'Ungrouped') as string,
    groupType: (row.group_type ?? 'other') as string,
    totalDebit: Number(row.total_debit ?? 0),
    totalCredit: Number(row.total_credit ?? 0),
  }));

  const totalDebit = rows.reduce((sum, r) => sum + r.totalDebit, 0);
  const totalCredit = rows.reduce((sum, r) => sum + r.totalCredit, 0);

  return {
    rows,
    totalDebit,
    totalCredit,
    difference: Math.abs(totalDebit - totalCredit),
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    financialYear,
  };
}

// ─── FINANCIAL YEAR CLOSING ──────────────────────────────────────────────────

export async function closeFinancialYear(
  companyId: string,
  financialYear: string,
): Promise<FinancialYearCloseResult> {
  closeFinancialYearSchema.parse({ companyId, financialYear });

  const { data, error } = await supabase.rpc('close_financial_year', {
    p_company_id: companyId,
    p_financial_year: financialYear,
  });

  if (error) throw new Error(`Failed to close financial year: ${error.message}`);

  const entries = (data ?? []).map((row: Record<string, unknown>) => ({
    ledgerId: row.ledger_id as string,
    name: row.name as string,
    closingBalance: Number(row.closing_balance ?? 0),
    closingBalanceType: row.closing_balance_type as string,
  }));

  return {
    financialYear,
    ledgersClosed: entries.length,
    entries,
  };
}

export async function openFinancialYear(
  companyId: string,
  financialYear: string,
  previousYear: string,
): Promise<{ created: number }> {
  const { data: prevBalances } = await supabase
    .from('ledger_balances')
    .select('*')
    .eq('company_id', companyId)
    .eq('financial_year', previousYear);

  if (!prevBalances || prevBalances.length === 0) {
    throw new Error(`No balances found for ${previousYear}. Close that year first.`);
  }

  const rows = prevBalances.map(pb => ({
    ledger_id: pb.ledger_id,
    company_id: companyId,
    financial_year: financialYear,
    opening_balance: pb.closing_balance,
    opening_balance_type: pb.closing_balance_type,
    current_balance: pb.closing_balance,
    total_debit: 0,
    total_credit: 0,
    closing_balance: pb.closing_balance,
    closing_balance_type: pb.closing_balance_type,
  }));

  const { error } = await supabase.from('ledger_balances').insert(rows);
  if (error) {
    if (error.code === '23505') throw new Error(`Year ${financialYear} already opened`);
    throw new Error(`Failed to open year: ${error.message}`);
  }

  return { created: rows.length };
}

// ─── CSV IMPORT ──────────────────────────────────────────────────────────────

export async function importLedgersFromCsv(
  companyId: string,
  rows: CsvLedgerRow[],
): Promise<{ imported: number; duplicates: number; errors: number }> {
  const parsed = csvImportSchema.parse({ companyId, rows });

  const { data: existing } = await supabase
    .from('ledgers')
    .select('name')
    .eq('company_id', companyId);

  const existingNames = new Set((existing ?? []).map(l => (l.name as string).toUpperCase()));

  let imported = 0;
  let duplicates = 0;
  let errors = 0;

  for (const row of parsed.rows) {
    if (existingNames.has(row.name.toUpperCase())) {
      duplicates++;
      continue;
    }

    const roleTypes = row.roleTypes
      ? row.roleTypes.split(',').map(r => r.trim().toLowerCase()).filter(r => r)
      : [];

    try {
      await ledgerService.createLedger(companyId, {
        name: row.name,
        alias: row.alias,
        ledgerGroupId: undefined,
        ledgerCode: row.ledgerCode,
        openingBalance: row.openingBalance ?? 0,
        balanceType: row.balanceType,
        gstNumber: row.gstNumber,
        panNumber: row.panNumber,
        phone: row.phone,
        email: row.email,
        city: row.city,
        state: row.state,
        contactPerson: row.contactPerson,
        bankName: row.bankName,
        bankAccountNumber: row.bankAccountNumber,
        bankIfsc: row.bankIfsc,
        roles: (roleTypes.length > 0 ? roleTypes : ['customer']) as LedgerRoleType[],
        primaryRole: (roleTypes[0] as LedgerRoleType) ?? 'customer',
        sourceSystem: 'imported',
      });
      imported++;
      existingNames.add(row.name.toUpperCase());
    } catch {
      errors++;
    }
  }

  return { imported, duplicates, errors };
}

// ─── LEDGER MERGE ────────────────────────────────────────────────────────────

export interface MergeLedgerResult {
  sourceName: string;
  targetName: string;
  transactionsMoved: number;
  ordersUpdated: number;
  paymentsUpdated: number;
  rolesMerged: number;
  balanceTransferred: number;
}

export async function mergeLedgers(
  sourceLedgerId: string,
  targetLedgerId: string,
  companyId: string,
): Promise<MergeLedgerResult> {
  const { data, error } = await supabase.rpc('merge_ledgers', {
    p_source_ledger_id: sourceLedgerId,
    p_target_ledger_id: targetLedgerId,
    p_company_id: companyId,
  });

  if (error) throw new Error(`Failed to merge ledgers: ${error.message}`);
  if (!data || data.length === 0) throw new Error('No result from merge operation');

  const row = data[0];
  return {
    sourceName: row.source_name,
    targetName: row.target_name,
    transactionsMoved: row.transactions_moved,
    ordersUpdated: row.orders_updated,
    paymentsUpdated: row.payments_updated,
    rolesMerged: row.roles_merged,
    balanceTransferred: row.balance_transferred,
  };
}

export interface DuplicateLedgerForMerge {
  canonicalName: string;
  duplicateCount: number;
  ledgerIds: string[];
  totalDebit: number;
  totalCredit: number;
}

export async function findDuplicateLedgers(companyId: string): Promise<DuplicateLedgerForMerge[]> {
  const { data, error } = await supabase.rpc('find_duplicate_ledgers', {
    p_company_id: companyId,
  });

  if (error) throw new Error(`Failed to find duplicate ledgers: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    canonicalName: row.canonical_name,
    duplicateCount: row.duplicate_count,
    ledgerIds: row.ledger_ids,
    totalDebit: row.total_debit,
    totalCredit: row.total_credit,
  }));
}

export interface BulkMergeResult {
  canonicalName: string;
  keptLedgerId: string;
  keptLedgerName: string;
  mergedLedgerId: string;
  mergedLedgerName: string;
  transactionsMoved: number;
  ordersUpdated: number;
  paymentsUpdated: number;
  status: string;
}

export async function bulkMergeDuplicateLedgers(
  companyId: string,
  dryRun: boolean = true,
): Promise<BulkMergeResult[]> {
  const { data, error } = await supabase.rpc('bulk_merge_duplicate_ledgers', {
    p_company_id: companyId,
    p_dry_run: dryRun,
  });

  if (error) throw new Error(`Failed to bulk merge ledgers: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    canonicalName: row.canonical_name,
    keptLedgerId: row.kept_ledger_id,
    keptLedgerName: row.kept_ledger_name,
    mergedLedgerId: row.merged_ledger_id,
    mergedLedgerName: row.merged_ledger_name,
    transactionsMoved: row.transactions_moved,
    ordersUpdated: row.orders_updated,
    paymentsUpdated: row.payments_updated,
    status: row.status,
  }));
}

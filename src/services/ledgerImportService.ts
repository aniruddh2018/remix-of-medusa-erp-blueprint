import { supabase } from '@/integrations/supabase/client';
import type {
  LedgerImportSession,
  StagingLedgerGroup,
  StagingLedger,
  ImportPreview,
  ImportResult,
  LedgerRoleType,
  LedgerGroupType,
  BalanceType,
  MargGroupImport,
  MargLedgerImport,
} from '@/types/ledger';
import { classifyLedgerType } from '@/services/mappingEngine';

const GROUP_TYPE_MAP: Record<string, LedgerGroupType> = {
  'SUNDRY CREDITORS': 'sundry_creditors',
  'SUNDRY DEBTORS': 'sundry_debtors',
  'BANK ACCOUNTS': 'bank',
  'CASH-IN-HAND': 'cash',
  'DUTIES & TAXES': 'tax',
  'CAPITAL ACCOUNT': 'capital',
  'CURRENT ASSETS': 'assets',
  'CURRENT LIABILITIES': 'liabilities',
  'FIXED ASSETS': 'assets',
  'INVESTMENTS': 'investment',
  'LOANS (LIABILITY)': 'loan',
  'DIRECT EXPENSES': 'expenses',
  'INDIRECT EXPENSES': 'expenses',
  'DIRECT INCOMES': 'income',
  'INDIRECT INCOMES': 'income',
  'PURCHASE ACCOUNT': 'expenses',
  'SALES ACCOUNT': 'income',
  'RESERVES & SURPLUS': 'capital',
  'PROVISIONS': 'liabilities',
};

function classifyGroupType(groupName: string): LedgerGroupType {
  const upper = groupName.toUpperCase();
  for (const [key, value] of Object.entries(GROUP_TYPE_MAP)) {
    if (upper.includes(key) || key.includes(upper)) return value;
  }
  if (upper.includes('ASSET')) return 'assets';
  if (upper.includes('LIABILIT')) return 'liabilities';
  if (upper.includes('INCOME') || upper.includes('REVENUE')) return 'income';
  if (upper.includes('EXPENSE') || upper.includes('COST')) return 'expenses';
  if (upper.includes('CAPITAL') || upper.includes('EQUITY')) return 'capital';
  if (upper.includes('BANK')) return 'bank';
  if (upper.includes('CASH')) return 'cash';
  if (upper.includes('TAX') || upper.includes('DUTIES')) return 'tax';
  if (upper.includes('CREDITOR')) return 'sundry_creditors';
  if (upper.includes('DEBTOR')) return 'sundry_debtors';
  if (upper.includes('LOAN')) return 'loan';
  if (upper.includes('INVEST')) return 'investment';
  return 'other';
}

function classifyLedgerRoles(parentGroup: string): LedgerRoleType[] {
  const type = classifyLedgerType(parentGroup);
  const roleMap: Record<string, LedgerRoleType[]> = {
    supplier: ['supplier'],
    customer: ['customer'],
    bank: ['bank'],
    cash: [],
    gst: ['tax'],
    tax: ['tax'],
    expense: ['expense'],
    income: ['income'],
    asset: ['asset'],
    liability: ['liability'],
  };
  return roleMap[type] ?? [];
}

function gstToRoleType(type: string): LedgerRoleType {
  const map: Record<string, LedgerRoleType> = {
    supplier: 'supplier', customer: 'customer', manufacturer: 'manufacturer',
    distributor: 'distributor', employee: 'employee', doctor: 'doctor',
    bank: 'bank', gst: 'tax', tax: 'tax', expense: 'expense',
    income: 'income', asset: 'asset', liability: 'liability', general: 'customer',
  };
  return map[type] ?? 'customer';
}

// ─── SESSION MANAGEMENT ─────────────────────────────────────────────────────

export async function createImportSession(
  companyId: string,
  userId: string,
  name: string,
  sourceSystem: 'tally' | 'marg' | 'csv',
  fileName?: string,
  fileSize?: number,
): Promise<LedgerImportSession> {
  const { data, error } = await supabase.from('ledger_import_sessions').insert({
    company_id: companyId,
    user_id: userId,
    name,
    source_system: sourceSystem,
    file_name: fileName,
    file_size: fileSize,
    status: 'uploaded',
  }).select('*').single();

  if (error) throw new Error(`Failed to create import session: ${error.message}`);
  return fromDbSession(data);
}

export async function getImportSession(sessionId: string): Promise<LedgerImportSession | null> {
  const { data, error } = await supabase.from('ledger_import_sessions').select('*').eq('id', sessionId).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch session: ${error.message}`);
  }
  return fromDbSession(data);
}

export async function updateSessionStatus(sessionId: string, status: LedgerImportSession['status'], updates?: Partial<Record<string, unknown>>): Promise<void> {
  const { error } = await supabase.from('ledger_import_sessions').update({ status, ...updates }).eq('id', sessionId);
  if (error) throw new Error(`Failed to update session: ${error.message}`);
}

function fromDbSession(row: Record<string, unknown>): LedgerImportSession {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    userId: row.user_id as string | null,
    name: row.name as string,
    sourceSystem: row.source_system as string,
    fileName: row.file_name as string | null,
    fileSize: row.file_size as number | null,
    status: row.status as LedgerImportSession['status'],
    groupsImported: (row.groups_imported ?? 0) as number,
    ledgersImported: (row.ledgers_imported ?? 0) as number,
    groupsFailed: (row.groups_failed ?? 0) as number,
    ledgersFailed: (row.ledgers_failed ?? 0) as number,
    duplicateGroups: (row.duplicate_groups ?? 0) as number,
    duplicateLedgers: (row.duplicate_ledgers ?? 0) as number,
    errorLog: (row.error_log ?? []) as unknown[],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ─── STAGE GROUPS ───────────────────────────────────────────────────────────

export async function stageGroups(
  sessionId: string,
  companyId: string,
  groups: MargGroupImport[],
): Promise<{ staged: number; duplicates: number; errors: number }> {
  await updateSessionStatus(sessionId, 'parsing');

  const { data: existingGroups } = await supabase
    .from('ledger_groups')
    .select('name')
    .eq('company_id', companyId);

  const existingNames = new Set((existingGroups ?? []).map(g => (g.name as string).toUpperCase()));

  const { data: existingStaged } = await supabase
    .from('staging_ledger_groups')
    .select('name')
    .eq('session_id', sessionId)
    .eq('company_id', companyId);

  const stagedNames = new Set((existingStaged ?? []).map(g => (g.name as string).toUpperCase()));

  const rows: Record<string, unknown>[] = [];
  let duplicates = 0;
  let errors = 0;
  const errorLog: { rowIndex: number; name: string; error: string }[] = [];

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const nameUpper = g.name.toUpperCase();

    if (existingNames.has(nameUpper) || stagedNames.has(nameUpper)) {
      duplicates++;
      rows.push({
        session_id: sessionId,
        company_id: companyId,
        row_index: i,
        name: g.name,
        parent_name: g.parentName,
        group_type: classifyGroupType(g.parentName ?? g.name),
        affects_stock: g.affectsStock,
        source_data: { reservedName: g.reservedName },
        validation_status: 'skipped',
        validation_errors: [{ message: 'Duplicate group name' }],
      });
      continue;
    }

    const validationErrors: string[] = [];
    if (!g.name || g.name.trim() === '') validationErrors.push('Name is required');

    rows.push({
      session_id: sessionId,
      company_id: companyId,
      row_index: i,
      name: g.name,
      parent_name: g.parentName,
      group_type: classifyGroupType(g.parentName ?? g.name),
      affects_stock: g.affectsStock,
      source_data: { reservedName: g.reservedName },
      validation_status: validationErrors.length > 0 ? 'invalid' : 'valid',
      validation_errors: validationErrors,
    });

    if (validationErrors.length > 0) errors++;
    stagedNames.add(nameUpper);
  }

  if (rows.length > 0) {
    const BATCH_SIZE = 200;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('staging_ledger_groups').insert(batch);
      if (error) {
        errors += batch.length;
        errorLog.push({ rowIndex: i, name: 'batch', error: error.message });
      }
    }
  }

  await updateSessionStatus(sessionId, 'staging', { duplicate_groups: duplicates });
  return { staged: rows.length - duplicates, duplicates, errors };
}

// ─── STAGE LEDGERS ─────────────────────────────────────────────────────────

export async function stageLedgers(
  sessionId: string,
  companyId: string,
  ledgers: MargLedgerImport[],
): Promise<{ staged: number; duplicates: number; errors: number }> {
  const { data: existingLedgers } = await supabase
    .from('ledgers')
    .select('name')
    .eq('company_id', companyId);

  const existingNames = new Set((existingLedgers ?? []).map(l => (l.name as string).toUpperCase()));

  const { data: existingStaged } = await supabase
    .from('staging_ledgers')
    .select('name')
    .eq('session_id', sessionId)
    .eq('company_id', companyId);

  const stagedNames = new Set((existingStaged ?? []).map(l => (l.name as string).toUpperCase()));

  const rows: Record<string, unknown>[] = [];
  let duplicates = 0;
  let errors = 0;

  const GST_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z\d]$/;

  for (let i = 0; i < ledgers.length; i++) {
    const l = ledgers[i];
    const nameUpper = l.name.toUpperCase();

    if (existingNames.has(nameUpper) || stagedNames.has(nameUpper)) {
      duplicates++;
      rows.push({
        session_id: sessionId,
        company_id: companyId,
        row_index: i,
        name: l.name,
        alias: l.gstNumber ? undefined : undefined,
        parent_group_name: l.parentGroupName,
        opening_balance: l.openingBalance,
        balance_type: l.balanceType,
        gst_number: l.gstNumber,
        pan_number: l.panNumber,
        phone: l.phone,
        email: l.email,
        address: l.address,
        state: l.state,
        role_types: l.roleTypes.map(rt => rt),
        source_data: l.sourceData,
        validation_status: 'skipped',
        validation_errors: [{ message: 'Duplicate ledger name' }],
        mapped_ledger_id: null,
        mapped_group_id: null,
        resolved: false,
      });
      continue;
    }

    const validationErrors: string[] = [];
    if (!l.name || l.name.trim() === '') validationErrors.push('Name is required');
    if (!l.parentGroupName || l.parentGroupName.trim() === '') validationErrors.push('Parent group is required');
    if (l.gstNumber && !GST_RE.test(l.gstNumber)) validationErrors.push('Invalid GST number format');

    rows.push({
      session_id: sessionId,
      company_id: companyId,
      row_index: i,
      name: l.name,
      alias: null,
      parent_group_name: l.parentGroupName,
      ledger_code: null,
      opening_balance: l.openingBalance,
      balance_type: l.balanceType,
      gst_number: l.gstNumber,
      pan_number: l.panNumber,
      phone: l.phone,
      email: l.email,
      address: l.address,
      state: l.state,
      city: null,
      pincode: null,
      country: 'India',
      bank_name: null,
      bank_account_number: null,
      bank_ifsc: null,
      contact_person: null,
      role_types: l.roleTypes.map(rt => rt),
      source_data: l.sourceData,
      validation_status: validationErrors.length > 0 ? 'invalid' : 'valid',
      validation_errors: validationErrors,
      mapped_ledger_id: null,
      mapped_group_id: null,
      resolved: false,
    });

    if (validationErrors.length > 0) errors++;
    stagedNames.add(nameUpper);
  }

  if (rows.length > 0) {
    const BATCH_SIZE = 200;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('staging_ledgers').insert(batch);
      if (error) errors += batch.length;
    }
  }

  await updateSessionStatus(sessionId, 'staging', { duplicate_ledgers: duplicates });
  return { staged: rows.length - duplicates, duplicates, errors };
}

// ─── PREVIEW ───────────────────────────────────────────────────────────────

export async function previewImport(sessionId: string, companyId: string): Promise<ImportPreview> {
  const [groupsRes, ledgersRes] = await Promise.all([
    supabase.from('staging_ledger_groups').select('*').eq('session_id', sessionId).eq('company_id', companyId),
    supabase.from('staging_ledgers').select('*').eq('session_id', sessionId).eq('company_id', companyId),
  ]);

  const groups = groupsRes.data ?? [];
  const ledgers = ledgersRes.data ?? [];

  const groupStats = {
    total: groups.length,
    new: groups.filter(g => g.validation_status === 'valid').length,
    existing: groups.filter(g => g.validation_status === 'skipped').length,
    errors: groups.filter(g => g.validation_status === 'invalid').length,
  };

  const ledgerStats = {
    total: ledgers.length,
    new: ledgers.filter(l => l.validation_status === 'valid').length,
    existing: ledgers.filter(l => l.validation_status === 'skipped').length,
    errors: ledgers.filter(l => l.validation_status === 'invalid').length,
  };

  const errors: { rowIndex: number; name: string; error: string }[] = [];
  for (const g of groups.filter(g => g.validation_status === 'invalid')) {
    const errs = (g.validation_errors as { message: string }[]) ?? [];
    errors.push({ rowIndex: g.row_index as number, name: g.name as string, error: errs.map(e => e.message).join(', ') });
  }
  for (const l of ledgers.filter(l => l.validation_status === 'invalid')) {
    const errs = (l.validation_errors as { message: string }[]) ?? [];
    errors.push({ rowIndex: l.row_index as number, name: l.name as string, error: errs.map(e => e.message).join(', ') });
  }

  return { groups: groupStats, ledgers: ledgerStats, errors };
}

// ─── CONFIRM IMPORT ────────────────────────────────────────────────────────

export async function confirmImport(sessionId: string, companyId: string, dryRun = false): Promise<ImportResult> {
  await updateSessionStatus(sessionId, 'importing');

  const result: ImportResult = {
    sessionId,
    groupsImported: 0,
    groupsFailed: 0,
    ledgersImported: 0,
    ledgersFailed: 0,
    duplicateGroups: 0,
    duplicateLedgers: 0,
    errors: [],
  };

  try {
    const groupsRes = await supabase
      .from('staging_ledger_groups')
      .select('*')
      .eq('session_id', sessionId)
      .eq('company_id', companyId)
      .in('validation_status', ['valid', 'pending']);

    const ledgersRes = await supabase
      .from('staging_ledgers')
      .select('*')
      .eq('session_id', sessionId)
      .eq('company_id', companyId)
      .in('validation_status', ['valid', 'pending']);

    const stagedGroups = groupsRes.data ?? [];
    const stagedLedgers = ledgersRes.data ?? [];

    const groupIdMap = new Map<string, string>();

    if (!dryRun) {
      // 1. Import groups in dependency order (parents first)
      const sortedGroups = [...stagedGroups].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));

      for (const sg of sortedGroups) {
        let parentId: string | null = null;
        if (sg.parent_name) {
          const { data: parentGroup } = await supabase
            .from('ledger_groups')
            .select('id')
            .eq('company_id', companyId)
            .ilike('name', sg.parent_name as string)
            .limit(1);

          if (parentGroup && parentGroup.length > 0) {
            parentId = parentGroup[0].id as string;
          } else if (groupIdMap.has((sg.parent_name as string).toUpperCase())) {
            parentId = groupIdMap.get((sg.parent_name as string).toUpperCase())!;
          }
        }

        const { data, error } = await supabase.from('ledger_groups').insert({
          company_id: companyId,
          name: sg.name,
          parent_id: parentId,
          group_type: sg.group_type ?? 'other',
          affects_stock: sg.affects_stock ?? false,
          source_system: 'imported',
        }).select('id').single();

        if (error) {
          if (error.code === '23505') {
            result.duplicateGroups++;
            const { data: existing } = await supabase
              .from('ledger_groups')
              .select('id')
              .eq('company_id', companyId)
              .eq('name', sg.name as string)
              .limit(1);
            if (existing && existing.length > 0) {
              groupIdMap.set((sg.name as string).toUpperCase(), existing[0].id as string);
            }
          } else {
            result.groupsFailed++;
            result.errors.push(`Group "${sg.name}": ${error.message}`);
          }
        } else {
          groupIdMap.set((sg.name as string).toUpperCase(), data.id as string);
          result.groupsImported++;
        }
      }

      // 2. Map all existing groups too
      const { data: allGroups } = await supabase
        .from('ledger_groups')
        .select('id, name')
        .eq('company_id', companyId);

      if (allGroups) {
        for (const g of allGroups) {
          groupIdMap.set((g.name as string).toUpperCase(), g.id as string);
        }
      }

      // 3. Import ledgers
      for (const sl of stagedLedgers) {
        const groupLookupName = (sl.parent_group_name as string)?.toUpperCase() ?? '';
        const ledgerGroupId = groupIdMap.get(groupLookupName) ?? null;

        const roleTypes = (sl.role_types as string[]) ?? [];
        const resolvedRoles = roleTypes.length > 0
          ? roleTypes.map(rt => rt as LedgerRoleType)
          : classifyLedgerRoles(sl.parent_group_name as string);

        const { data, error } = await supabase.from('ledgers').insert({
          company_id: companyId,
          ledger_group_id: ledgerGroupId,
          name: sl.name,
          alias: sl.alias,
          ledger_code: sl.ledger_code,
          opening_balance: sl.opening_balance ?? 0,
          balance_type: sl.balance_type ?? 'debit',
          gst_number: sl.gst_number,
          pan_number: sl.pan_number,
          phone: sl.phone,
          email: sl.email,
          address: sl.address ? { line1: sl.address } : {},
          city: sl.city,
          state: sl.state,
          pincode: sl.pincode,
          country: sl.country ?? 'India',
          contact_person: sl.contact_person,
          party_type: 'other',
          source_system: 'imported',
          source_ledger_name: sl.name,
          source_group_name: sl.parent_group_name,
          import_metadata: sl.source_data ?? {},
        }).select('id').single();

        if (error) {
          if (error.code === '23505') {
            result.duplicateLedgers++;
          } else {
            result.ledgersFailed++;
            result.errors.push(`Ledger "${sl.name}": ${error.message}`);
          }
        } else {
          if (resolvedRoles.length > 0) {
            const roleRows = resolvedRoles.map((roleType, idx) => ({
              ledger_id: data.id,
              company_id: companyId,
              role_type: roleType,
              is_primary: idx === 0,
              priority: idx,
            }));
            await supabase.from('ledger_roles').insert(roleRows).then(({ error: rErr }) => {
              if (rErr) result.errors.push(`Roles for "${sl.name}": ${rErr.message}`);
            });
          }
          result.ledgersImported++;
        }
      }
    }

    // Update session counts
    await updateSessionStatus(sessionId, dryRun ? 'reviewing' : 'completed', {
      groups_imported: result.groupsImported,
      ledgers_imported: result.ledgersImported,
      groups_failed: result.groupsFailed,
      ledgers_failed: result.ledgersFailed,
      duplicate_groups: result.duplicateGroups,
      duplicate_ledgers: result.duplicateLedgers,
      error_log: result.errors,
    });

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    await updateSessionStatus(sessionId, 'failed', { error_log: result.errors });
    return result;
  }
}

// ─── ROLLBACK ──────────────────────────────────────────────────────────────

export async function rollbackImport(sessionId: string, companyId: string): Promise<void> {
  const session = await getImportSession(sessionId);
  if (!session) throw new Error('Session not found');

  const cutoffTime = session.createdAt;

  const { data: groupsCreated } = await supabase
    .from('ledger_groups')
    .select('id')
    .eq('company_id', companyId)
    .eq('source_system', 'imported')
    .gte('created_at', cutoffTime);

  const { data: ledgersCreated } = await supabase
    .from('ledgers')
    .select('id')
    .eq('company_id', companyId)
    .eq('source_system', 'imported')
    .gte('created_at', cutoffTime);

  if (groupsCreated && groupsCreated.length > 0) {
    const ids = groupsCreated.map(g => g.id);
    await supabase.from('ledger_groups').delete().in('id', ids);
  }

  if (ledgersCreated && ledgersCreated.length > 0) {
    const ids = ledgersCreated.map(l => l.id);
    await supabase.from('ledger_roles').delete().in('ledger_id', ids);
    await supabase.from('ledgers').delete().in('id', ids);
  }

  await supabase.from('staging_ledger_groups').delete().eq('session_id', sessionId);
  await supabase.from('staging_ledgers').delete().eq('session_id', sessionId);

  await updateSessionStatus(sessionId, 'rolled_back');
}

// ─── RESOLVE STAGING ROW ───────────────────────────────────────────────────

export async function resolveStagingGroup(
  stagingId: string,
  action: 'skip' | 'retry' | 'map',
  mappedGroupId?: string,
): Promise<void> {
  const update: Record<string, unknown> = { resolved: true };

  if (action === 'skip') {
    update.validation_status = 'skipped';
  } else if (action === 'map') {
    update.validation_status = 'imported';
    update.mapped_group_id = mappedGroupId;
  } else {
    update.validation_status = 'valid';
    update.validation_errors = [];
  }

  const { error } = await supabase.from('staging_ledger_groups').update(update).eq('id', stagingId);
  if (error) throw new Error(`Failed to resolve: ${error.message}`);
}

export async function resolveStagingLedger(
  stagingId: string,
  action: 'skip' | 'retry' | 'map',
  mappedLedgerId?: string,
  mappedGroupId?: string,
): Promise<void> {
  const update: Record<string, unknown> = { resolved: true };

  if (action === 'skip') {
    update.validation_status = 'skipped';
  } else if (action === 'map') {
    update.validation_status = 'imported';
    if (mappedLedgerId) update.mapped_ledger_id = mappedLedgerId;
    if (mappedGroupId) update.mapped_group_id = mappedGroupId;
  } else {
    update.validation_status = 'valid';
    update.validation_errors = [];
  }

  const { error } = await supabase.from('staging_ledgers').update(update).eq('id', stagingId);
  if (error) throw new Error(`Failed to resolve: ${error.message}`);
}

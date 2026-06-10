import { supabase } from '@/integrations/supabase/client';
import type {
  LedgerGroup,
  Ledger,
  LedgerRole,
  LedgerBalance,
  LedgerImportSession,
  StagingLedgerGroup,
  StagingLedger,
  LedgerFilter,
  LedgerGroupFilter,
  LedgerListResponse,
  LedgerGroupTreeResponse,
  CreateLedgerRequest,
  UpdateLedgerRequest,
  CreateLedgerGroupRequest,
  UpdateLedgerGroupRequest,
  LedgerGroupNode,
  LedgerGroupFlat,
  ImportPreview,
  ImportResult,
  LedgerRoleType,
  LedgerGroupType,
  BalanceType,
} from '@/types/ledger';
import {
  createLedgerSchema,
  updateLedgerSchema,
  createLedgerGroupSchema,
  ledgerFilterSchema,
  ledgerGroupFilterSchema,
  createLedgerRoleSchema,
} from '@/lib/validation/ledgerSchemas';

function toDbLedger(input: CreateLedgerRequest | UpdateLedgerRequest, companyId: string) {
  const isCreate = !('id' in input) || !input.id;
  const parsed = isCreate
    ? createLedgerSchema.parse(input)
    : updateLedgerSchema.parse(input);

  const { roles, primaryRole, metadata, ...fields } = parsed as Record<string, unknown>;

  const db: Record<string, unknown> = { company_id: companyId };
  const fieldMap: Record<string, string> = {
    name: 'name', alias: 'alias', ledgerGroupId: 'ledger_group_id',
    ledgerCode: 'ledger_code', openingBalance: 'opening_balance',
    balanceType: 'balance_type', gstNumber: 'gst_number',
    gstRegistrationType: 'gst_registration_type', panNumber: 'pan_number',
    taxId: 'tax_id', contactPerson: 'contact_person', phone: 'phone',
    mobile: 'mobile', email: 'email', website: 'website',
    address: 'address', billingAddress: 'billing_address',
    shippingAddress: 'shipping_address', city: 'city', state: 'state',
    pincode: 'pincode', country: 'country', bankName: 'bank_name',
    bankAccountNumber: 'bank_account_number', bankIfsc: 'bank_ifsc',
    bankBranch: 'bank_branch', partyType: 'party_type',
    sourceSystem: 'source_system', sourceLedgerName: 'source_ledger_name',
    sourceGroupName: 'source_group_name', importMetadata: 'import_metadata',
    isActive: 'is_active',
  };

  for (const [camelKey, snakeKey] of Object.entries(fieldMap)) {
    if (fields[camelKey] !== undefined) {
      db[snakeKey] = fields[camelKey];
    }
  }

  return { db, roles: (parsed as Record<string, unknown>).roles as LedgerRoleType[] | undefined, primaryRole: (parsed as Record<string, unknown>).primaryRole as LedgerRoleType | undefined };
}

function toDbGroup(input: CreateLedgerGroupRequest | UpdateLedgerGroupRequest, companyId: string) {
  const parsed = createLedgerGroupSchema.parse(input);
  const db: Record<string, unknown> = { company_id: companyId };
  const fieldMap: Record<string, string> = {
    name: 'name', parentId: 'parent_id', groupType: 'group_type',
    sortOrder: 'sort_order', affectsStock: 'affects_stock',
  };
  for (const [camelKey, snakeKey] of Object.entries(fieldMap)) {
    if ((parsed as Record<string, unknown>)[camelKey] !== undefined) {
      db[snakeKey] = (parsed as Record<string, unknown>)[camelKey];
    }
  }
  return db;
}

function fromDbLedger(row: Record<string, unknown>): Ledger {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    ledgerGroupId: row.ledger_group_id as string | null,
    name: row.name as string,
    alias: row.alias as string | null,
    ledgerCode: row.ledger_code as string | null,
    openingBalance: Number(row.opening_balance ?? 0),
    balanceType: (row.balance_type ?? 'debit') as BalanceType,
    currentBalance: Number(row.current_balance ?? 0),
    gstNumber: row.gst_number as string | null,
    gstRegistrationType: (row.gst_registration_type ?? 'regular') as Ledger['gstRegistrationType'],
    panNumber: row.pan_number as string | null,
    taxId: row.tax_id as string | null,
    contactPerson: row.contact_person as string | null,
    phone: row.phone as string | null,
    mobile: row.mobile as string | null,
    email: row.email as string | null,
    website: row.website as string | null,
    address: (row.address ?? {}) as Record<string, unknown>,
    billingAddress: (row.billing_address ?? {}) as Record<string, unknown>,
    shippingAddress: (row.shipping_address ?? {}) as Record<string, unknown>,
    city: row.city as string | null,
    state: row.state as string | null,
    pincode: row.pincode as string | null,
    country: (row.country ?? 'India') as string,
    bankName: row.bank_name as string | null,
    bankAccountNumber: row.bank_account_number as string | null,
    bankIfsc: row.bank_ifsc as string | null,
    bankBranch: row.bank_branch as string | null,
    partyType: (row.party_type ?? 'other') as Ledger['partyType'],
    sourceSystem: (row.source_system ?? 'manual') as string,
    sourceLedgerName: row.source_ledger_name as string | null,
    sourceGroupName: row.source_group_name as string | null,
    importMetadata: (row.import_metadata ?? {}) as Record<string, unknown>,
    isActive: (row.is_active ?? true) as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    primaryRole: (row as Record<string, unknown>).primary_role as LedgerRoleType | null ?? null,
    roles: ((row as Record<string, unknown>).roles as unknown as import('@/types/ledger').LedgerRole[]) ?? [],
  };
}

function fromDbGroup(row: Record<string, unknown>): LedgerGroup {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    name: row.name as string,
    parentId: row.parent_id as string | null,
    groupType: (row.group_type ?? 'other') as LedgerGroupType,
    materializedPath: (row.materialized_path ?? '') as string,
    level: (row.level ?? 0) as number,
    sortOrder: (row.sort_order ?? 0) as number,
    affectsStock: (row.affects_stock ?? false) as boolean,
    isSystem: (row.is_system ?? false) as boolean,
    sourceSystem: (row.source_system ?? 'manual') as string,
    isActive: (row.is_active ?? true) as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function fromDbRole(row: Record<string, unknown>): LedgerRole {
  return {
    id: row.id as string,
    ledgerId: row.ledger_id as string,
    companyId: row.company_id as string,
    roleType: row.role_type as LedgerRoleType,
    isPrimary: (row.is_primary ?? false) as boolean,
    priority: (row.priority ?? 0) as number,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.created_at as string,
  };
}

// ─── LEDGER GROUPS ──────────────────────────────────────────────────────────

export async function getLedgerGroups(filter: LedgerGroupFilter): Promise<LedgerGroup[]> {
  const parsed = ledgerGroupFilterSchema.parse(filter);
  let query = supabase.from('ledger_groups').select('*').eq('company_id', parsed.companyId);

  if (parsed.parentId === null) query = query.is('parent_id', null);
  else if (parsed.parentId) query = query.eq('parent_id', parsed.parentId);

  if (parsed.groupType) query = query.eq('group_type', parsed.groupType);
  if (parsed.search) query = query.ilike('name', `%${parsed.search}%`);

  query = query.eq('is_active', true).order('sort_order').order('name');
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch ledger groups: ${error.message}`);
  return (data ?? []).map(fromDbGroup);
}

export async function getLedgerGroupTree(companyId: string): Promise<LedgerGroupNode[]> {
  const { data, error } = await supabase
    .from('ledger_groups')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('sort_order')
    .order('name');

  if (error) throw new Error(`Failed to fetch group tree: ${error.message}`);
  const groups = (data ?? []).map(fromDbGroup) as LedgerGroupNode[];

  const map = new Map<string, LedgerGroupNode>();
  const roots: LedgerGroupNode[] = [];
  for (const g of groups) {
    g.children = [];
    map.set(g.id, g);
  }
  for (const g of groups) {
    if (g.parentId && map.has(g.parentId)) {
      map.get(g.parentId)!.children!.push(g);
    } else {
      roots.push(g);
    }
  }
  return roots;
}

export async function getLedgerGroupFlatList(companyId: string): Promise<LedgerGroupFlat[]> {
  const { data, error } = await supabase
    .from('ledger_groups')
    .select('id, name, parent_id, group_type, level, materialized_path')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('materialized_path');

  if (error) throw new Error(`Failed to fetch flat groups: ${error.message}`);
  return (data ?? []).map(row => ({
    id: row.id as string,
    name: row.name as string,
    parentId: row.parent_id as string | null,
    groupType: (row.group_type ?? 'other') as LedgerGroupType,
    level: (row.level ?? 0) as number,
    fullPath: (row.materialized_path ?? '') as string,
  }));
}

export async function getLedgerGroupById(id: string): Promise<LedgerGroup | null> {
  const { data, error } = await supabase.from('ledger_groups').select('*').eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch group: ${error.message}`);
  }
  return data ? fromDbGroup(data) : null;
}

export async function createLedgerGroup(companyId: string, input: CreateLedgerGroupRequest): Promise<LedgerGroup> {
  const db = toDbGroup(input, companyId);
  const { data, error } = await supabase.from('ledger_groups').insert(db).select('*').single();
  if (error) {
    if (error.code === '23505') throw new Error(`Group "${input.name}" already exists`);
    throw new Error(`Failed to create group: ${error.message}`);
  }
  return fromDbGroup(data);
}

export async function updateLedgerGroup(id: string, companyId: string, input: Partial<CreateLedgerGroupRequest>): Promise<LedgerGroup> {
  const db = toDbGroup(input as CreateLedgerGroupRequest, companyId);
  delete db.company_id;
  const { data, error } = await supabase.from('ledger_groups').update(db).eq('id', id).eq('company_id', companyId).select('*').single();
  if (error) throw new Error(`Failed to update group: ${error.message}`);
  return fromDbGroup(data);
}

export async function deleteLedgerGroup(id: string, companyId: string): Promise<void> {
  const { error } = await supabase.from('ledger_groups').update({ is_active: false }).eq('id', id).eq('company_id', companyId);
  if (error) throw new Error(`Failed to delete group: ${error.message}`);
}

// ─── LEDGERS ────────────────────────────────────────────────────────────────

export async function getLedgers(filter: LedgerFilter): Promise<LedgerListResponse> {
  const parsed = ledgerFilterSchema.parse(filter);
  let query = supabase.from('ledgers_with_roles').select('*', { count: 'exact' }).eq('company_id', parsed.companyId);

  if (parsed.search) {
    query = query.or(`name.ilike.%${parsed.search}%,alias.ilike.%${parsed.search}%,ledger_code.ilike.%${parsed.search}%`);
  }
  if (parsed.groupId) query = query.eq('ledger_group_id', parsed.groupId);
  if (parsed.role) query = query.contains('roles', [parsed.role]);
  if (parsed.isActive !== undefined) query = query.eq('is_active', parsed.isActive);
  if (parsed.sourceSystem) query = query.eq('source_system', parsed.sourceSystem);
  if (parsed.state) query = query.eq('state', parsed.state);
  if (parsed.city) query = query.eq('city', parsed.city);
  if (parsed.gstNumber) query = query.eq('gst_number', parsed.gstNumber);

  const validOrderBy = ['name', 'created_at', 'opening_balance', 'current_balance', 'ledger_code'];
  const orderCol = validOrderBy.includes(parsed.orderBy) ? parsed.orderBy : 'name';
  query = query.order(orderCol, { ascending: parsed.orderDirection === 'asc' });
  query = query.range(parsed.offset, parsed.offset + parsed.limit - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to fetch ledgers: ${error.message}`);

  return {
    data: (data ?? []).map(fromDbLedger),
    count: count ?? 0,
    limit: parsed.limit,
    offset: parsed.offset,
  };
}

export async function getLedgerById(id: string): Promise<Ledger | null> {
  const { data, error } = await supabase.from('ledgers_with_roles').select('*').eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch ledger: ${error.message}`);
  }
  return data ? fromDbLedger(data) : null;
}

export async function getLedgersByRole(companyId: string, role: LedgerRoleType, limit = 100): Promise<Ledger[]> {
  const { data, error } = await supabase
    .from('ledgers_with_roles')
    .select('*')
    .eq('company_id', companyId)
    .contains('roles', [role])
    .eq('is_active', true)
    .order('name')
    .limit(limit);

  if (error) throw new Error(`Failed to fetch ledgers by role: ${error.message}`);
  return (data ?? []).map(fromDbLedger);
}

export async function createLedger(companyId: string, input: CreateLedgerRequest): Promise<Ledger> {
  const { db, roles, primaryRole } = toDbLedger(input, companyId);

  const { data, error } = await supabase.from('ledgers').insert(db).select('*').single();
  if (error) {
    if (error.code === '23505') throw new Error(`Ledger "${input.name}" already exists`);
    throw new Error(`Failed to create ledger: ${error.message}`);
  }

  const ledger = fromDbLedger(data);
  const ledgerId = ledger.id;

  if (roles && roles.length > 0) {
    await syncLedgerRoles(ledgerId, companyId, roles, primaryRole);
  }

  return getLedgerById(ledgerId) ?? ledger;
}

export async function updateLedger(id: string, companyId: string, input: UpdateLedgerRequest): Promise<Ledger> {
  const { db, roles, primaryRole } = toDbLedger(input, companyId);
  delete db.company_id;

  const { data, error } = await supabase.from('ledgers').update(db).eq('id', id).eq('company_id', companyId).select('*').single();
  if (error) throw new Error(`Failed to update ledger: ${error.message}`);

  if (roles !== undefined) {
    await syncLedgerRoles(id, companyId, roles, primaryRole);
  }

  return getLedgerById(id) ?? fromDbLedger(data);
}

export async function deleteLedger(id: string, companyId: string): Promise<void> {
  const { error } = await supabase.from('ledgers').update({ is_active: false }).eq('id', id).eq('company_id', companyId);
  if (error) throw new Error(`Failed to delete ledger: ${error.message}`);
}

// ─── LEDGER ROLES ──────────────────────────────────────────────────────────

export async function syncLedgerRoles(
  ledgerId: string,
  companyId: string,
  roles: LedgerRoleType[],
  primaryRole?: LedgerRoleType,
): Promise<void> {
  const { error: delError } = await supabase
    .from('ledger_roles')
    .delete()
    .eq('ledger_id', ledgerId)
    .eq('company_id', companyId);
  if (delError) throw new Error(`Failed to clear roles: ${delError.message}`);

  const rows = roles.map((roleType, idx) => ({
    ledger_id: ledgerId,
    company_id: companyId,
    role_type: roleType,
    is_primary: roleType === primaryRole,
    priority: idx,
  }));

  const { error: insError } = await supabase.from('ledger_roles').insert(rows);
  if (insError) throw new Error(`Failed to insert roles: ${insError.message}`);
}

export async function addLedgerRole(
  ledgerId: string,
  companyId: string,
  roleType: LedgerRoleType,
  isPrimary = false,
): Promise<LedgerRole> {
  const parsed = createLedgerRoleSchema.parse({ ledgerId, roleType, isPrimary });
  const { data, error } = await supabase.from('ledger_roles').insert({
    ledger_id: parsed.ledgerId,
    company_id: companyId,
    role_type: parsed.roleType,
    is_primary: parsed.isPrimary,
  }).select('*').single();
  if (error) {
    if (error.code === '23505') throw new Error(`Role "${roleType}" already exists on this ledger`);
    throw new Error(`Failed to add role: ${error.message}`);
  }
  return fromDbRole(data);
}

export async function removeLedgerRole(ledgerId: string, roleType: LedgerRoleType): Promise<void> {
  const { error } = await supabase.from('ledger_roles').delete().eq('ledger_id', ledgerId).eq('role_type', roleType);
  if (error) throw new Error(`Failed to remove role: ${error.message}`);
}

// ─── LEDGER BALANCES ───────────────────────────────────────────────────────

export async function getLedgerBalance(ledgerId: string, financialYear: string): Promise<LedgerBalance | null> {
  const { data, error } = await supabase
    .from('ledger_balances')
    .select('*')
    .eq('ledger_id', ledgerId)
    .eq('financial_year', financialYear)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch balance: ${error.message}`);
  }
  return {
    id: data.id as string,
    ledgerId: data.ledger_id as string,
    companyId: data.company_id as string,
    financialYear: data.financial_year as string,
    openingBalance: Number(data.opening_balance ?? 0),
    openingBalanceType: (data.opening_balance_type ?? 'debit') as BalanceType,
    currentBalance: Number(data.current_balance ?? 0),
    totalDebit: Number(data.total_debit ?? 0),
    totalCredit: Number(data.total_credit ?? 0),
    closingBalance: Number(data.closing_balance ?? 0),
    closingBalanceType: (data.closing_balance_type ?? 'debit') as BalanceType,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

export async function getLedgerBalances(companyId: string, financialYear: string): Promise<LedgerBalance[]> {
  const { data, error } = await supabase
    .from('ledger_balances')
    .select('*')
    .eq('company_id', companyId)
    .eq('financial_year', financialYear);
  if (error) throw new Error(`Failed to fetch balances: ${error.message}`);
  return (data ?? []).map(row => ({
    id: row.id as string,
    ledgerId: row.ledger_id as string,
    companyId: row.company_id as string,
    financialYear: row.financial_year as string,
    openingBalance: Number(row.opening_balance ?? 0),
    openingBalanceType: (row.opening_balance_type ?? 'debit') as BalanceType,
    currentBalance: Number(row.current_balance ?? 0),
    totalDebit: Number(row.total_debit ?? 0),
    totalCredit: Number(row.total_credit ?? 0),
    closingBalance: Number(row.closing_balance ?? 0),
    closingBalanceType: (row.closing_balance_type ?? 'debit') as BalanceType,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

// ─── SEED DEFAULT GROUPS ───────────────────────────────────────────────────

export async function seedDefaultLedgerGroups(companyId: string): Promise<void> {
  const { error } = await supabase.rpc('seed_default_ledger_groups', { p_company_id: companyId });
  if (error) throw new Error(`Failed to seed default groups: ${error.message}`);
}

// ─── STATS ─────────────────────────────────────────────────────────────────

export async function getLedgerStats(companyId: string): Promise<{
  totalLedgers: number;
  activeLedgers: number;
  totalGroups: number;
  roleBreakdown: Record<string, number>;
}> {
  const [ledgerRes, groupRes, roleRes] = await Promise.all([
    supabase.from('ledgers').select('id, is_active', { count: 'exact', head: false }).eq('company_id', companyId),
    supabase.from('ledger_groups').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_active', true),
    supabase.from('ledger_roles').select('role_type').eq('company_id', companyId),
  ]);

  const roleBreakdown: Record<string, number> = {};
  if (roleRes.data) {
    for (const r of roleRes.data) {
      const rt = r.role_type as string;
      roleBreakdown[rt] = (roleBreakdown[rt] ?? 0) + 1;
    }
  }

  return {
    totalLedgers: ledgerRes.count ?? 0,
    activeLedgers: ledgerRes.data?.filter(l => l.is_active).length ?? 0,
    totalGroups: groupRes.count ?? 0,
    roleBreakdown,
  };
}

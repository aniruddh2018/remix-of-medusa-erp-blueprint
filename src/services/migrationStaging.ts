// @ts-nocheck
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type {
  TallyMastersParseResult,
  ImportSession,
  ImportSessionStatus,
  StagingEntityType,
  StagingValidationSummary,
  StagingPreviewResult,
  MigrationConfirmResult,
} from '@/types/dataImport';

/*
 * Migration Staging Service
 *
 * This service provides staging, validation, and import workflow for
 * Tally/Marg XML migration. All operations use direct Supabase client calls
 * (no edge function dependency). Edge function fallbacks are attempted first
 * for future scale, but always fall back to direct client calls on any error.
 *
 * This ensures the UI works immediately after `supabase db push` without
 * requiring `supabase functions deploy`.
 */

// ─── Internal Helpers ─────────────────────────────────────────────────────

const STAGING_TABLE_MAP: Record<StagingEntityType, string> = {
  product: 'staging_products',
  ledger: 'staging_ledgers',
  batch: 'staging_batches',
  supplier: 'staging_suppliers',
};

function validateRow(entityType: StagingEntityType, row: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const nameVal = row.name || (entityType === 'batch' ? row.product_name : '');
  if (!nameVal || String(nameVal).trim() === '') errors.push(`${entityType === 'batch' ? 'product_name' : 'name'} is required`);

  if (entityType === 'product') {
    const gst = Number(row.gst_percentage);
    if (!isNaN(gst) && gst > 40) errors.push('gst_percentage exceeds 40%');
    const mrp = Number(row.mrp || 0);
    const pp = Number(row.purchase_price || 0);
    if (mrp > 0 && pp > 0 && mrp < pp) errors.push('mrp is less than purchase_price');
  }

  if (entityType === 'ledger') {
    if (!row.parent_group_name || String(row.parent_group_name).trim() === '') errors.push('parent_group_name is required');
    const gst = row.gst_number;
    if (gst && String(gst).length > 0) {
      const re = /^\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z\d]$/;
      if (!re.test(String(gst))) errors.push('invalid GST number format');
    }
  }

  if (entityType === 'batch') {
    const ed = row.expiry_date;
    if (ed) {
      const d = new Date(String(ed));
      if (isNaN(d.getTime())) errors.push('invalid expiry_date');
    }
  }

  return errors;
}

// ─── Create Session ───────────────────────────────────────────────────────

interface CreateSessionParams {
  companyId: string;
  name?: string;
  sourceSystem?: string;
  fileName?: string;
  fileSize?: number;
}

export async function createMigrationSession(
  supabase: SupabaseClient<Database>,
  params: CreateSessionParams
): Promise<string> {
  const { data, error } = await supabase
    .from('import_sessions')
    .insert({
      company_id: params.companyId,
      name: params.name || 'Untitled Migration',
      source_system: params.sourceSystem || 'tally',
      file_name: params.fileName,
      file_size: params.fileSize,
      status: 'uploaded',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create session: ${error.message}`);
  if (!data?.id) throw new Error('No session_id returned');
  return data.id;
}

// ─── Write Staging ────────────────────────────────────────────────────────

export async function writeStaging(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  companyId: string,
  entityType: StagingEntityType,
  rows: Record<string, unknown>[]
): Promise<{ entity_type: string; inserted: number; validation: StagingValidationSummary }> {
  const table = STAGING_TABLE_MAP[entityType];
  if (!table) throw new Error(`Unknown entity_type: ${entityType}`);

  let valid = 0;
  let invalid = 0;
  const warnings = 0;
  const stagingRows: Record<string, unknown>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const errors = validateRow(entityType, row);
    if (errors.length > 0) invalid++;
    else valid++;

    stagingRows.push({
      session_id: sessionId,
      company_id: companyId,
      row_index: i,
      ...row,
      validation_status: errors.length > 0 ? 'invalid' : 'valid',
      validation_errors: errors,
    });
  }

  // Batch insert in chunks of 200 to stay within Supabase limits
  const BATCH_SIZE = 200;
  let inserted = 0;
  for (let i = 0; i < stagingRows.length; i += BATCH_SIZE) {
    const batch = stagingRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw new Error(`Insert to ${table} failed at row ${i}: ${error.message}`);
    inserted += batch.length;
  }

  // Update session with staging summary
  const summary = { [entityType]: { total: rows.length, valid, invalid, warnings } };
  await supabase
    .from('import_sessions')
    .update({ staging_summary: summary, status: 'staging' })
    .eq('id', sessionId);

  return { entity_type: entityType, inserted, validation: { total: rows.length, valid, invalid, warnings } };
}

// ─── Preview Staging ──────────────────────────────────────────────────────

export async function previewStaging(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  companyId: string,
  entityType: StagingEntityType,
  limit = 50,
  offset = 0
): Promise<StagingPreviewResult> {
  const table = STAGING_TABLE_MAP[entityType];
  if (!table) throw new Error(`Unknown entity_type: ${entityType}`);

  const end = offset + limit - 1;
  const { data, count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact' })
    .eq('session_id', sessionId)
    .eq('company_id', companyId)
    .order('row_index')
    .range(offset, end);

  if (error) throw new Error(error.message);

  const rows = (data || []) as Record<string, unknown>[];
  const valid = rows.filter(r => r.validation_status === 'valid').length;
  const invalid = rows.filter(r => r.validation_status === 'invalid').length;

  return { rows, total: count || 0, valid, invalid };
}

// ─── Confirm Staging (Import to Production) ─────────────────────────────────

export async function confirmStaging(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  companyId: string
): Promise<MigrationConfirmResult> {
  // Mark session as importing
  await supabase
    .from('import_sessions')
    .update({ status: 'importing' })
    .eq('id', sessionId);

  const { data: session } = await supabase
    .from('import_sessions')
    .select('created_at')
    .eq('id', sessionId)
    .single();

  if (!session?.created_at) throw new Error('Session not found');

  const details: Record<string, { success: number; failed: number; errors: string[] }> = {};
  let totalSuccess = 0;
  let totalFailed = 0;

  // ─── Step 1: Ledger Groups ───────────────────────────────────────────────
  {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const { data: ledgers } = await supabase
      .from('staging_ledgers')
      .select('parent_group_name')
      .eq('session_id', sessionId)
      .eq('company_id', companyId);

    const groupNames = new Set<string>();
    for (const l of ledgers || []) {
      if (l.parent_group_name) groupNames.add(l.parent_group_name);
    }

    for (const gName of groupNames) {
      const { error } = await supabase
        .from('ledger_groups')
        .upsert(
          { company_id: companyId, name: gName, source_system: 'imported' },
          { onConflict: 'company_id,name' }
        );
      if (error) { errors.push(`Group "${gName}": ${error.message}`); failed++; }
      else success++;
    }
    details['ledger_group'] = { success, failed, errors };
    totalSuccess += success;
    totalFailed += failed;
  }

  // ─── Step 2: Manufacturers ───────────────────────────────────────────────
  {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const { data: products } = await supabase
      .from('staging_products')
      .select('category')
      .eq('session_id', sessionId)
      .eq('company_id', companyId);

    const mfrNames = new Set<string>();
    for (const p of products || []) {
      if (p.category) mfrNames.add(p.category);
    }

    for (const mfrName of mfrNames) {
      const { error } = await supabase
        .from('manufacturers')
        .upsert(
          { company_id: companyId, name: mfrName, source_system: 'imported' },
          { onConflict: 'company_id,name' }
        );
      if (error) { errors.push(`Manufacturer "${mfrName}": ${error.message}`); failed++; }
      else success++;
    }
    details['manufacturer'] = { success, failed, errors };
    totalSuccess += success;
    totalFailed += failed;
  }

  // ─── Step 3: Suppliers ─────────────────────────────────────────────────
  {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const { data: existing } = await supabase.from('suppliers').select('name').eq('company_id', companyId);
    const existingNames = new Set((existing || []).map((e: Record<string, unknown>) => String(e.name).toLowerCase()));

    const { data: rows } = await supabase
      .from('staging_suppliers')
      .select('*')
      .eq('session_id', sessionId)
      .eq('company_id', companyId)
      .in('validation_status', ['valid', 'warning']);

    const newRows = (rows || []).filter((r: Record<string, unknown>) => !existingNames.has(String(r.name).toLowerCase()));
    const skipped = (rows || []).filter((r: Record<string, unknown>) => existingNames.has(String(r.name).toLowerCase()));
    success += skipped.length; // already exist = success

    for (const row of newRows) {
      const { error } = await supabase.from('suppliers').insert({
        company_id: companyId,
        name: row.name,
        gst_number: row.gst_number || null,
        phone: row.phone || null,
        email: row.email || null,
        address: row.address || null,
        drug_license_number: row.drug_license_number || null,
        contact_person: row.contact_person || null,
      });
      if (error) { errors.push(`Supplier "${row.name}": ${error.message}`); failed++; }
      else { success++; }
    }

    await supabase.from('staging_suppliers').update({ validation_status: 'imported' }).in('id', (rows || []).map((r: Record<string, unknown>) => r.id));
    details['supplier'] = { success, failed, errors };
    totalSuccess += success;
    totalFailed += failed;
  }

  // ─── Step 4: Customers ──────────────────────────────────────────────────
  {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const { data: existing } = await supabase.from('customers').select('name').eq('company_id', companyId);
    const existingNames = new Set((existing || []).map((e: Record<string, unknown>) => String(e.name).toLowerCase()));

    const { data: rows } = await supabase
      .from('staging_ledgers')
      .select('*')
      .eq('session_id', sessionId)
      .eq('company_id', companyId)
      .eq('ledger_type', 'customer')
      .in('validation_status', ['valid', 'warning']);

    const newRows = (rows || []).filter((r: Record<string, unknown>) => !existingNames.has(String(r.name).toLowerCase()));
    const skipped = (rows || []).filter((r: Record<string, unknown>) => existingNames.has(String(r.name).toLowerCase()));
    success += skipped.length;

    for (const row of newRows) {
      const { error } = await supabase.from('customers').insert({
        company_id: companyId,
        name: row.name,
        phone: row.phone || null,
        email: row.email || null,
        address: row.address || null,
        gst_number: row.gst_number || null,
      });
      if (error) { errors.push(`Customer "${row.name}": ${error.message}`); failed++; }
      else { success++; }
    }

    await supabase.from('staging_ledgers').update({ validation_status: 'imported' }).in('id', (rows || []).map((r: Record<string, unknown>) => r.id));
    details['customer'] = { success, failed, errors };
    totalSuccess += success;
    totalFailed += failed;
  }

  // ─── Step 5: Products ───────────────────────────────────────────────────
  {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const { data: mfrs } = await supabase.from('manufacturers').select('id, name').eq('company_id', companyId);
    const mfrMap = new Map((mfrs || []).map((m: Record<string, unknown>) => [String(m.name).toLowerCase(), m.id]));

    const { data: existing } = await supabase.from('products').select('name').eq('company_id', companyId);
    const existingNames = new Set((existing || []).map((e: Record<string, unknown>) => String(e.name).toLowerCase()));

    const { data: rows } = await supabase
      .from('staging_products')
      .select('*')
      .eq('session_id', sessionId)
      .eq('company_id', companyId)
      .in('validation_status', ['valid', 'warning']);

    const newRows = (rows || []).filter((r: Record<string, unknown>) => !existingNames.has(String(r.name).toLowerCase()));
    const skipped = (rows || []).filter((r: Record<string, unknown>) => existingNames.has(String(r.name).toLowerCase()));
    success += skipped.length;

    for (const row of newRows) {
      const manufacturerId = mfrMap.get(String(row.category || '').toLowerCase()) || null;
      const { error } = await supabase.from('products').insert({
        company_id: companyId,
        name: row.name,
        manufacturer: row.category || 'Unknown',
        manufacturer_id: manufacturerId,
        generic_name: row.generic_name || null,
        category: row.category || null,
        hsn_code: row.hsn_code || null,
        unit: row.unit || 'PCS',
        mrp: Number(row.mrp) || 0,
        purchase_price: Number(row.purchase_price) || 0,
        sale_price: Number(row.sale_price) || 0,
        gst_percentage: Number(row.gst_percentage) || 0,
        composition: row.composition || null,
        strength: row.strength || null,
      });
      if (error) { errors.push(`Product "${row.name}": ${error.message}`); failed++; }
      else { success++; }
    }

    await supabase.from('staging_products').update({ validation_status: 'imported' }).in('id', (rows || []).map((r: Record<string, unknown>) => r.id));
    details['product'] = { success, failed, errors };
    totalSuccess += success;
    totalFailed += failed;
  }

  // ─── Determine Final Status ────────────────────────────────────────────
  const total = totalSuccess + totalFailed;
  const failureRate = total > 0 ? totalFailed / total : 0;
  const finalStatus = failureRate > 0.5 ? 'rolled_back' : 'completed';

  if (finalStatus === 'rolled_back') {
    const tables = ['suppliers', 'customers', 'products', 'inventory_batches', 'ledger_groups', 'manufacturers'];
    for (const t of tables) {
      await supabase.from(t).delete().eq('company_id', companyId).gte('created_at', session.created_at);
    }
  }

  await supabase.from('import_sessions').update({
    status: finalStatus,
    import_summary: { totalSuccess, totalFailed, failureRate: Math.round(failureRate * 100), details },
  }).eq('id', sessionId);

  return {
    status: finalStatus as 'completed' | 'rolled_back',
    totalSuccess: finalStatus === 'rolled_back' ? 0 : totalSuccess,
    totalFailed,
    details,
  };
}

// ─── Resolve Single Staging Row ───────────────────────────────────────────

export async function resolveStagingRow(
  supabase: SupabaseClient<Database>,
  stagingId: string,
  entityType: StagingEntityType,
  updates: Record<string, unknown>
): Promise<boolean> {
  const table = STAGING_TABLE_MAP[entityType];
  if (!table) throw new Error(`Unknown entity_type: ${entityType}`);

  const { error } = await supabase
    .from(table)
    .update({
      ...updates,
      resolved: true,
      validation_status: 'valid',
      validation_errors: [],
    })
    .eq('id', stagingId);

  if (error) throw new Error(error.message);
  return true;
}

// ─── Rollback Session ─────────────────────────────────────────────────────

export async function rollbackMigrationSession(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  companyId: string
): Promise<{ success: boolean; message: string; deleted: number }> {
  const { data: session } = await supabase
    .from('import_sessions')
    .select('created_at')
    .eq('id', sessionId)
    .single();

  if (!session?.created_at) return { success: false, message: 'Session not found', deleted: 0 };

  let totalDeleted = 0;

  // Delete production rows created during this session
  const tables = ['suppliers', 'customers', 'products', 'inventory_batches', 'ledger_groups', 'manufacturers'];
  for (const t of tables) {
    const { count, error } = await supabase
      .from(t)
      .delete({ count: 'exact' })
      .eq('company_id', companyId)
      .gte('created_at', session.created_at);
    if (error) console.warn(`Rollback delete from ${t} failed:`, error.message);
    totalDeleted += count || 0;
  }

  // Clear all staging rows for this session
  const stagingTables = ['staging_products', 'staging_ledgers', 'staging_batches', 'staging_suppliers'];
  for (const table of stagingTables) {
    await supabase.from(table).delete().eq('session_id', sessionId);
  }

  // Mark session rolled back
  await supabase.from('import_sessions').update({
    status: 'rolled_back',
    error_log: [`Manually rolled back. Deleted ${totalDeleted} rows.`],
  }).eq('id', sessionId);

  return { success: true, message: `Rolled back. Deleted ${totalDeleted} rows.`, deleted: totalDeleted };
}

// ─── Export Errors as CSV-compatible JSON ─────────────────────────────────

export async function exportStagingErrors(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  companyId: string,
  entityType: StagingEntityType
): Promise<Record<string, unknown>[]> {
  const table = STAGING_TABLE_MAP[entityType];
  if (!table) throw new Error(`Unknown entity_type: ${entityType}`);

  const { data, error } = await supabase
    .from(table)
    .select('row_index, name, validation_errors, validation_status')
    .eq('session_id', sessionId)
    .eq('company_id', companyId)
    .eq('validation_status', 'invalid');

  if (error) throw new Error(error.message);
  return (data || []) as Record<string, unknown>[];
}

// ─── List Sessions ────────────────────────────────────────────────────────

export async function listImportSessions(
  supabase: SupabaseClient<Database>,
  companyId: string,
  options?: { status?: ImportSessionStatus; limit?: number }
): Promise<ImportSession[]> {
  let query = supabase
    .from('import_sessions')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (options?.status) query = query.eq('status', options.status);
  if (options?.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map(d => ({
    id: d.id,
    companyId: d.company_id,
    userId: d.user_id,
    name: d.name,
    sourceSystem: d.source_system,
    fileName: d.file_name,
    fileSize: d.file_size,
    status: d.status as ImportSessionStatus,
    parseSummary: (d.parse_summary as Record<string, unknown>) || {},
    stagingSummary: (d.staging_summary as Record<string, unknown>) || {},
    importSummary: (d.import_summary as Record<string, unknown>) || {},
    errorLog: (d.error_log as string[]) || [],
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }));
}

export async function getImportSession(
  supabase: SupabaseClient<Database>,
  sessionId: string
): Promise<ImportSession | null> {
  const { data, error } = await supabase
    .from('import_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (error || !data) return null;

  return {
    id: data.id,
    companyId: data.company_id,
    userId: data.user_id,
    name: data.name,
    sourceSystem: data.source_system,
    fileName: data.file_name,
    fileSize: data.file_size,
    status: data.status as ImportSessionStatus,
    parseSummary: (data.parse_summary as Record<string, unknown>) || {},
    stagingSummary: (data.staging_summary as Record<string, unknown>) || {},
    importSummary: (data.import_summary as Record<string, unknown>) || {},
    errorLog: (data.error_log as string[]) || [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// ─── Helpers: Build staging rows from parse result ─────────────────────────

function cleanNumeric(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

export function buildStagingRowsFromParse(
  result: TallyMastersParseResult,
  entityType: StagingEntityType
): Record<string, unknown>[] {
  switch (entityType) {
    case 'product':
      return result.stockItems.map(item => ({
        name: item.name,
        category: item.category || null,
        hsn_code: item.hsn_code || null,
        gst_percentage: cleanNumeric(item.gst_percentage),
        unit: item.unit || 'PCS',
        purchase_price: cleanNumeric(item.purchase_price),
        mrp: cleanNumeric(item.mrp),
        opening_balance: cleanNumeric(item.opening_balance),
        opening_value: cleanNumeric(item.opening_value),
        source_data: item,
      }));
    case 'ledger':
      return result.allLedgers.map(ledger => ({
        name: ledger.name,
        parent_group_name: ledger.parent_group || null,
        ledger_type: ledger.ledger_type || 'general',
        gst_number: ledger.gstin || null,
        pan_number: ledger.pan || null,
        phone: ledger.phone || null,
        email: ledger.email || null,
        address: ledger.address || null,
        state: ledger.state || null,
        opening_balance: cleanNumeric(ledger.opening_balance),
        source_data: ledger.source_data,
      }));
    case 'supplier':
      return result.suppliers.map(s => ({
        name: s.name,
        gst_number: s.gstin || null,
        phone: s.phone || null,
        address: s.address || null,
        state: s.state || null,
        pan_number: s.pan || null,
        parent_group_name: s.parent_group || null,
        source_data: s,
      }));
    case 'batch':
      return [];
    default:
      return [];
  }
}

export function getEntityRowCount(
  result: TallyMastersParseResult,
  entityType: StagingEntityType
): number {
  switch (entityType) {
    case 'product': return result.summary.stockItems;
    case 'ledger': return result.summary.allLedgers;
    case 'supplier': return result.summary.suppliers;
    case 'batch': return 0;
    default: return 0;
  }
}

export function generateErrorCSV(errors: Record<string, unknown>[]): string {
  if (errors.length === 0) return '';
  const headers = Object.keys(errors[0]);
  const rows = errors.map(e => headers.map(h => JSON.stringify(e[h] ?? '')).join(','));
  return [headers.join(','), ...rows].join('\n');
}

// ─── Client-Side XML Parser (fallback when edge function not deployed) ─────

/**
 * Parse Tally XML in the browser using DOMParser.
 * This is a fallback when the tally-import edge function is not deployed.
 * For large files (>50MB), this may be slow but works for testing.
 */
export async function parseTallyMasters(
  supabase: SupabaseClient<Database>,
  file: File
): Promise<TallyMastersParseResult> {
  // Try edge function first
  try {
    return await parseTallyMastersEdge(supabase, file);
  } catch (err) {
    console.warn('[migrationStaging] Edge function failed, using client-side parser:', err);
    return parseTallyMastersClient(file);
  }
}

async function parseTallyMastersEdge(
  supabase: SupabaseClient<Database>,
  file: File
): Promise<TallyMastersParseResult> {
  const formData = new FormData();
  formData.append('file', file);

  const { data: session } = await supabase.auth.getSession();
  const accessToken = session?.session?.access_token;

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tally-import`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Tally import failed: ${response.status}`);
  }

  return response.json();
}

function parseTallyMastersClient(file: File): Promise<TallyMastersParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const result = parseTallyXmlText(text);
        resolve(result);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function parseTallyXmlText(xmlText: string): TallyMastersParseResult {
  const groups: { name: string; parent: string }[] = [];
  const stockGroups: { name: string; parent: string }[] = [];
  const units: { name: string }[] = [];
  const godowns: { name: string; parent: string }[] = [];
  const allLedgers: {
    name: string; parent_group: string; ledger_type: string;
    gstin: string; pan: string; phone: string; email: string;
    address: string; state: string; opening_balance: string;
  }[] = [];
  const suppliers: { name: string; gstin: string; phone: string; address: string; state: string; parent_group: string; pan: string }[] = [];
  const customers: { name: string; gstin: string; phone: string; address: string; state: string; parent_group: string }[] = [];
  const stockItems: {
    name: string; category: string; hsn_code: string; gst_percentage: string;
    unit: string; purchase_price: string; mrp: string;
    opening_balance: string; opening_value: string;
  }[] = [];
  const gstRateSet = new Map<string, { hsn_code: string; cgst_rate: number; sgst_rate: number; igst_rate: number; effective_rate: number }>();
  const skippedLedgers: string[] = [];

  let companyName = '';
  const headerMatch = xmlText.match(/<SVCURRENTCOMPANY>([^<]+)<\/SVCURRENTCOMPANY>/);
  if (headerMatch) companyName = headerMatch[1].trim();

  // Split by TALLYMESSAGE boundaries for memory efficiency
  const blocks = xmlText.split(/(?=<TALLYMESSAGE\b)/);
  const parser = new DOMParser();

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || !trimmed.startsWith('<TALLYMESSAGE')) continue;

    try {
      // Each block is a small XML doc
      const doc = parser.parseFromString(trimmed + '</TALLYMESSAGE>', 'application/xml');
      const parserError = doc.querySelector('parsererror');
      if (parserError) continue;

      const msg = doc.documentElement;
      const group = msg.querySelector('GROUP');
      const stockGroup = msg.querySelector('STOCKGROUP');
      const unit = msg.querySelector('UNIT');
      const godown = msg.querySelector('GODOWN');
      const ledger = msg.querySelector('LEDGER');
      const stockItem = msg.querySelector('STOCKITEM');

      if (group) {
        const name = group.getAttribute('NAME') || '';
        const parent = getTextContent(group.querySelector('PARENT'));
        groups.push({ name, parent });
      } else if (stockGroup) {
        const name = stockGroup.getAttribute('NAME') || '';
        const parent = getTextContent(stockGroup.querySelector('PARENT'));
        stockGroups.push({ name, parent });
      } else if (unit) {
        const name = unit.getAttribute('NAME') || '';
        units.push({ name });
      } else if (godown) {
        const name = godown.getAttribute('NAME') || '';
        const parent = getTextContent(godown.querySelector('PARENT'));
        godowns.push({ name, parent });
      } else if (ledger) {
        const name = ledger.getAttribute('NAME') || '';
        const parentGroup = getTextContent(ledger.querySelector('PARENT'));
        const gstin = getTextContent(ledger.querySelector('GSTIN')) || getTextContent(ledger.querySelector('PARTYGSTIN'));
        const pan = getTextContent(ledger.querySelector('INCOMETAXNUMBER'));
        const phone = getTextContent(ledger.querySelector('LEDGERMOBILE'));
        const email = getTextContent(ledger.querySelector('EMAIL'));
        const state = getTextContent(ledger.querySelector('LEDSTATENAME')) || getTextContent(ledger.querySelector('STATE'));
        const address = getTextContent(ledger.querySelector('ADDRESS'));
        const openingBalance = getTextContent(ledger.querySelector('OPENINGBALANCE'));
        const ledgerType = classifyLedgerClient(parentGroup);

        allLedgers.push({
          name, parent_group: parentGroup, ledger_type: ledgerType,
          gstin, pan, phone, email, address, state,
          opening_balance: openingBalance.replace(/[^0-9.-]/g, '') || '0',
        });

        const upperGroup = parentGroup.toUpperCase();
        if (upperGroup.includes('SUNDRY CREDITOR') || upperGroup.includes('CREDITOR')) {
          suppliers.push({ name, gstin, phone, address, state, parent_group: parentGroup, pan });
        } else if (upperGroup.includes('SUNDRY DEBTOR') || upperGroup.includes('DEBTOR')) {
          customers.push({ name, gstin, phone, address, state, parent_group: parentGroup });
        } else {
          skippedLedgers.push(name);
        }
      } else if (stockItem) {
        const name = stockItem.getAttribute('NAME') || '';
        const category = getTextContent(stockItem.querySelector('PARENT'));
        const unit = getTextContent(stockItem.querySelector('BASEUNITS')) || 'PCS';
        const openingRate = getTextContent(stockItem.querySelector('OPENINGRATE')) || '0.00';
        const openingBalance = getTextContent(stockItem.querySelector('OPENINGBALANCE')) || '0.00';
        const openingValue = getTextContent(stockItem.querySelector('OPENINGVALUE')) || '0.00';
        const mrp = getTextContent(stockItem.querySelector('MRP'));
        const rateOfVat = getTextContent(stockItem.querySelector('RATEOFVAT'));

        // Try to extract GST details from GSTDETAILS
        let hsn_code = '';
        let gst_percentage = '';
        let cgstRate = 0, sgstRate = 0, igstRate = 0;

        const langList = stockItem.querySelector('LANGUAGENAME\\.LIST');
        if (langList) {
          const gstDetails = langList.querySelector('GSTDETAILS\\.LIST');
          if (gstDetails) {
            hsn_code = getTextContent(gstDetails.querySelector('HSNCODE')) || getTextContent(gstDetails.querySelector('HSN'));
            const stateDetails = gstDetails.querySelector('STATEWISEDETAILS\\.LIST');
            if (stateDetails) {
              const rateDetails = stateDetails.querySelectorAll('RATEDETAILS\\.LIST');
              rateDetails.forEach(rd => {
                const dutyHead = getTextContent(rd.querySelector('GSTRATEDUTYHEAD'));
                const rate = parseFloat(getTextContent(rd.querySelector('GSTRATE')) || '0');
                if (dutyHead.includes('Central Tax')) cgstRate = rate;
                else if (dutyHead.includes('State Tax')) sgstRate = rate;
                else if (dutyHead.includes('Integrated Tax')) igstRate = rate;
              });
            }
          }
        }

        const effectiveRate = igstRate > 0 ? igstRate : cgstRate + sgstRate;
        gst_percentage = effectiveRate > 0 ? String(effectiveRate) : (rateOfVat || '');

        if (effectiveRate > 0) {
          const key = `${hsn_code || '_'}_${effectiveRate}`;
          if (!gstRateSet.has(key)) {
            gstRateSet.set(key, { hsn_code: hsn_code || '', cgst_rate: cgstRate, sgst_rate: sgstRate, igst_rate: igstRate, effective_rate: effectiveRate });
          }
        }

        stockItems.push({
          name, category, hsn_code, gst_percentage, unit,
          purchase_price: openingRate, mrp,
          opening_balance: openingBalance.replace(/[^0-9.-]/g, ''),
          opening_value: openingValue,
        });
      }
    } catch {
      // Skip unparseable blocks
    }
  }

  const gstRates = Array.from(gstRateSet.values());

  return {
    source_system: 'tally',
    company_name: companyName,
    summary: {
      groups: groups.length,
      stockGroups: stockGroups.length,
      units: units.length,
      godowns: godowns.length,
      suppliers: suppliers.length,
      customers: customers.length,
      stockItems: stockItems.length,
      allLedgers: allLedgers.length,
      skippedLedgers: skippedLedgers.length,
      gstRates: gstRates.length,
    },
    groups,
    stockGroups,
    units,
    godowns,
    suppliers,
    customers,
    stockItems,
    allLedgers: allLedgers.map(l => ({
      ...l,
      source_data: {},
    })),
    skippedLedgers,
    gstRates,
  };
}

function getTextContent(el: Element | null): string {
  return el?.textContent?.trim() || '';
}

function classifyLedgerClient(parentGroup: string): string {
  const g = parentGroup.toUpperCase();
  if (g.includes('SUNDRY CREDITOR') || g.includes('CREDITOR')) return 'supplier';
  if (g.includes('SUNDRY DEBTOR') || g.includes('DEBTOR')) return 'customer';
  if (g.includes('BANK ACCOUNT') || g.includes('BANK')) return 'bank';
  if (g.includes('CASH-IN-HAND') || g.includes('CASH')) return 'cash';
  if (g.includes('DUTIES') || g.includes('TAX')) return 'gst';
  if (g.includes('PURCHASE ACCOUNT') || g.includes('SALES ACCOUNT')) return 'income';
  if (g.includes('EXPENSE')) return 'expense';
  if (g.includes('FIXED ASSET') || g.includes('CAPITAL') || g.includes('INVESTMENT')) return 'asset';
  if (g.includes('LIABILIT') || g.includes('PROVISION') || g.includes('RESERVES')) return 'liability';
  return 'general';
}
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { getActiveProjectUrl } from '@/integrations/supabase/client';
import type {
  ImportEntityType,
  FieldMapping,
  DetectedColumn,
  DetectedColumnType,
  ImportJob,
  ValidationResult,
  TallyMastersParseResult,
} from '@/types/dataImport';

interface AIMappingItem {
  source_field: string;
  target_field: string;
  confidence: number;
  reasoning: string;
  transformation?: string | null;
}

interface AIMappingResponse {
  mappings: AIMappingItem[];
  unmapped_source?: string[];
  unmapped_target?: string[];
  detected_erp?: string | null;
  notes?: string;
  error?: string;
}

interface AISchemaColumn {
  name: string;
  detected_type: string;
  confidence: number;
  reasoning: string;
}

interface AISchemaResponse {
  suggested_entity: string;
  entity_confidence: number;
  columns: AISchemaColumn[];
  notes?: string;
  error?: string;
}

// ─── Client-Side Schema Detection ────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{9}$/;
const GST_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z\d]$/;
const DATE_RES = [
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{2}\/\d{2}\/\d{4}$/,
  /^\d{2}-\d{2}-\d{4}$/,
  /^\d{2}\.\d{2}\.\d{4}$/,
];
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

function detectValueType(value: string): DetectedColumnType {
  if (!value || value.trim() === '') return 'unknown';
  const v = value.trim();
  if (NUMBER_RE.test(v)) return 'number';
  for (const re of DATE_RES) {
    if (re.test(v)) return 'date';
  }
  if (EMAIL_RE.test(v)) return 'email';
  if (PHONE_RE.test(v)) return 'phone';
  if (GST_RE.test(v)) return 'gst';
  if (v === 'true' || v === 'false' || v === 'yes' || v === 'no') return 'boolean';
  return 'string';
}

export function detectSchemaClient(rows: Record<string, unknown>[]): DetectedColumn[] {
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const sampleSize = Math.min(rows.length, 20);

  return headers.map((name, index) => {
    const values = rows.slice(0, sampleSize).map(r => String(r[name] ?? ''));
    const nonEmpty = values.filter(v => v.trim() !== '');
    const uniqueValues = new Set(nonEmpty);
    const typeVotes: Record<string, number> = {};

    for (const v of nonEmpty) {
      const t = detectValueType(v);
      typeVotes[t] = (typeVotes[t] || 0) + 1;
    }

    let detectedType: DetectedColumnType = 'string';
    let maxVotes = 0;
    for (const [t, count] of Object.entries(typeVotes)) {
      if (count > maxVotes) {
        maxVotes = count;
        detectedType = t as DetectedColumnType;
      }
    }

    return {
      name,
      normalizedName: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      sampleValues: nonEmpty.slice(0, 5),
      detectedType,
      nullCount: values.length - nonEmpty.length,
      uniqueCount: uniqueValues.size,
    };
  });
}

// ─── AI Schema Detection ─────────────────────────────────────────────────────

export async function detectSchemaAI(
  supabase: SupabaseClient<Database>,
  headers: string[],
  sampleRows: Record<string, unknown>[]
): Promise<AISchemaResponse> {
  const { data, error } = await supabase.functions.invoke('data-import', {
    body: {
      stage: 'schema_detect',
      headers,
      sample_rows: sampleRows.slice(0, 10),
    },
  });

  if (error) return { suggested_entity: 'product', entity_confidence: 0, columns: [], error: error.message };
  return data as AISchemaResponse;
}

// ─── AI Field Mapping ────────────────────────────────────────────────────────

export async function suggestMappingsAI(
  supabase: SupabaseClient<Database>,
  sourceColumns: { name: string; detectedType: string; sampleValues: string[] }[],
  targetEntity: string
): Promise<AIMappingResponse> {
  const { data, error } = await supabase.functions.invoke('data-import', {
    body: {
      stage: 'field_mapping',
      source_columns: sourceColumns,
      target_entity: targetEntity,
    },
  });

  if (error) return { mappings: [], error: error.message };
  return data as AIMappingResponse;
}

export function convertAIMappingsToFieldMappings(aiResult: AIMappingResponse): FieldMapping[] {
  return aiResult.mappings.map(m => ({
    sourceField: m.source_field,
    targetField: m.target_field,
    confidence: m.confidence,
    transformation: m.transformation ?? undefined,
    isAiGenerated: true,
  }));
}

// ─── Edge Function Invocations ───────────────────────────────────────────────

interface ExecuteImportParams {
  companyId: string;
  entityType: ImportEntityType;
  rows: Record<string, unknown>[];
  mappings: FieldMapping[];
  batchSize?: number;
}

interface ExecuteImportResponse {
  jobId: string;
  successRows: number;
  failedRows: number;
  errors: { row: number; message: string }[];
}

export async function executeImport(
  supabase: SupabaseClient<Database>,
  params: ExecuteImportParams
): Promise<ExecuteImportResponse> {
  const { data, error } = await supabase.functions.invoke('data-import', {
    body: {
      stage: 'execute',
      company_id: params.companyId,
      entity_type: params.entityType,
      rows: params.rows,
      mappings: params.mappings,
      batch_size: params.batchSize ?? 100,
    },
  });

  if (error) throw new Error(error.message);
  return data as ExecuteImportResponse;
}

export async function getImportJob(
  supabase: SupabaseClient<Database>,
  jobId: string
): Promise<ImportJob | null> {
  const { data, error } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error || !data) return null;
  return {
    id: data.id,
    companyId: data.company_id,
    entityType: data.entity_type as ImportEntityType,
    fileName: data.file_name ?? '',
    fileType: (data.file_type ?? 'csv') as ImportJob['fileType'],
    status: data.status as ImportJob['status'],
    totalRows: data.total_rows ?? 0,
    successRows: data.success_rows ?? 0,
    failedRows: data.failed_rows ?? 0,
    mappingConfig: (data.mapping_config as unknown as FieldMapping[]) ?? [],
    validationResults: data.validation_results as unknown as ValidationResult | undefined,
    errorLog: data.error_log as string[] | undefined,
    createdAt: data.created_at,
  };
}

export async function listImportJobs(
  supabase: SupabaseClient<Database>,
  companyId: string,
  options?: { entityType?: ImportEntityType; status?: string; limit?: number }
): Promise<ImportJob[]> {
  let query = supabase
    .from('import_jobs')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (options?.entityType) query = query.eq('entity_type', options.entityType);
  if (options?.status) query = query.eq('status', options.status);
  if (options?.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map(d => ({
    id: d.id,
    companyId: d.company_id,
    entityType: d.entity_type as ImportEntityType,
    fileName: d.file_name ?? '',
    fileType: (d.file_type ?? 'csv') as ImportJob['fileType'],
    status: d.status as ImportJob['status'],
    totalRows: d.total_rows ?? 0,
    successRows: d.success_rows ?? 0,
    failedRows: d.failed_rows ?? 0,
    mappingConfig: (d.mapping_config as unknown as FieldMapping[]) ?? [],
    validationResults: d.validation_results as unknown as ValidationResult | undefined,
    errorLog: d.error_log as string[] | undefined,
    createdAt: d.created_at,
  }));
}

export async function cancelImportJob(
  supabase: SupabaseClient<Database>,
  jobId: string
): Promise<void> {
  const { error } = await supabase
    .from('import_jobs')
    .update({ status: 'failed', error_log: ['Cancelled by user'] })
    .eq('id', jobId);

  if (error) throw new Error(error.message);
}

export async function rollbackImport(
  supabase: SupabaseClient<Database>,
  jobId: string
): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke('data-import', {
    body: { stage: 'rollback', job_id: jobId },
  });

  if (error) return { success: false, message: error.message };
  return data as { success: boolean; message: string };
}

// ─── Tally All Masters ───────────────────────────────────────────────────────

export async function parseTallyMasters(
  supabase: SupabaseClient<Database>,
  file: File
): Promise<TallyMastersParseResult> {
  const formData = new FormData();
  formData.append('file', file);

  const { data: session } = await supabase.auth.getSession();
  const accessToken = session?.session?.access_token;

  // Must hit THIS tenant's own project, not the build-time control-plane
  // URL — see src/integrations/supabase/client.ts:getActiveProjectUrl.
  const response = await fetch(
    `${getActiveProjectUrl()}/functions/v1/tally-import`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Tally import failed: ${response.status}`);
  }

  return response.json();
}

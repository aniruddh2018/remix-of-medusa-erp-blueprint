import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { ImportEntityType, ImportTemplate, FieldMapping } from '@/types/dataImport';

export async function listTemplates(
  supabase: SupabaseClient<Database>,
  companyId: string,
  entityType?: ImportEntityType
): Promise<ImportTemplate[]> {
  let query = supabase
    .from('import_templates')
    .select('*')
    .or(`company_id.eq.${companyId},is_system.eq.true`)
    .order('is_system', { ascending: false })
    .order('created_at', { ascending: false });

  if (entityType) {
    query = query.eq('entity_type', entityType);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map(d => ({
    id: d.id,
    name: d.name,
    description: d.description ?? undefined,
    entityType: d.entity_type as ImportEntityType,
    sourceSystem: d.source_system,
    fieldMappings: (d.field_mappings as unknown as FieldMapping[]) ?? [],
    isSystem: d.is_system ?? false,
    createdAt: d.created_at,
  }));
}

export async function loadTemplate(
  supabase: SupabaseClient<Database>,
  templateId: string
): Promise<ImportTemplate | null> {
  const { data, error } = await supabase
    .from('import_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    description: data.description ?? undefined,
    entityType: data.entity_type as ImportEntityType,
    sourceSystem: data.source_system,
    fieldMappings: (data.field_mappings as unknown as FieldMapping[]) ?? [],
    isSystem: data.is_system ?? false,
    createdAt: data.created_at,
  };
}

export async function saveTemplate(
  supabase: SupabaseClient<Database>,
  params: {
    name: string;
    entityType: ImportEntityType;
    companyId: string;
    mappings: FieldMapping[];
    sourceSystem?: string;
  }
): Promise<ImportTemplate | null> {
  const { data, error } = await supabase
    .from('import_templates')
    .insert([{
      name: params.name,
      entity_type: params.entityType,
      company_id: params.companyId,
      source_system: params.sourceSystem ?? 'generic',
      field_mappings: params.mappings as unknown as never,
      is_system: false,
    }])
    .select('*')
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    description: data.description ?? undefined,
    entityType: data.entity_type as ImportEntityType,
    sourceSystem: data.source_system,
    fieldMappings: (data.field_mappings as unknown as FieldMapping[]) ?? [],
    isSystem: false,
    createdAt: data.created_at,
  };
}

export async function deleteTemplate(
  supabase: SupabaseClient<Database>,
  templateId: string
): Promise<void> {
  const { error } = await supabase
    .from('import_templates')
    .delete()
    .eq('id', templateId);

  if (error) throw new Error(error.message);
}

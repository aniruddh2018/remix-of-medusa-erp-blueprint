import { supabase } from '@/integrations/supabase/client';
import type { MargRow } from '@/lib/import/margListParser';

export interface MargImportResult {
  inserted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function importMargRows(
  rows: MargRow[],
  companyId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<MargImportResult> {
  const result: MargImportResult = { inserted: 0, skipped: 0, failed: 0, errors: [] };
  const selected = rows.filter((r) => r.selected);

  for (let i = 0; i < selected.length; i++) {
    const r = selected[i];
    onProgress?.(i, selected.length);

    if (!r.brand || r.mrp <= 0) {
      result.failed++;
      result.errors.push(`Row ${r.rowIndex}: missing brand or MRP`);
      continue;
    }

    try {
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('company_id', companyId)
        .eq('name', r.brand)
        .eq('strength', r.strength ?? '')
        .eq('pack_size', r.pack ?? '')
        .limit(1)
        .maybeSingle();

      if (existing) {
        result.skipped++;
        continue;
      }

      const { data, error } = await supabase
        .from('products')
        .insert({
          company_id: companyId,
          name: r.brand,
          brand: r.brand,
          generic_name: r.generic || null,
          strength: r.strength || null,
          form: r.form,
          pack_size: r.pack || null,
          unit: r.baseUnit,
          base_unit: r.baseUnit,
          mrp: r.mrp,
          purchase_price: r.purchase_price,
          sale_price: r.mrp,
          gst_percentage: r.gst_percentage || 0,
          drug_schedule: r.schedule,
          manufacturer: 'Unknown',
          batch_tracking_enabled: true,
          expiry_required: true,
        })
        .select('id')
        .single();

      if (error || !data) {
        result.failed++;
        result.errors.push(`Row ${r.rowIndex} (${r.brand}): ${error?.message ?? 'insert failed'}`);
        continue;
      }

      if (r.conversion && r.secondaryUnit && r.conversion > 0) {
        await supabase.from('product_conversions').insert({
          company_id: companyId,
          product_id: data.id,
          from_unit: r.secondaryUnit,
          to_unit: r.baseUnit,
          conversion_factor: r.conversion,
        });
      }

      result.inserted++;
    } catch (err) {
      result.failed++;
      result.errors.push(`Row ${r.rowIndex} (${r.brand}): ${(err as Error).message}`);
    }
  }

  onProgress?.(selected.length, selected.length);
  return result;
}

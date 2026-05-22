/**
 * Alias Learning System
 * Learns from approved mappings to improve future matching accuracy
 */

import { supabase } from '@/integrations/supabase/client';
import { normalizeProductText } from './textNormalization';

export interface VendorAlias {
  id: string;
  supplierId: string;
  vendorProductName: string;
  normalizedName: string;
  productId: string;
  confidenceScore: number;
  isApproved: boolean;
  approvedBy?: string;
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AliasLearningConfig {
  minUsageCount: number;
  autoPromoteThreshold: number;
  confidenceDecay: number;
}

/**
 * Create a new alias from approved mapping
 */
export async function createAlias(params: {
  supplierId: string;
  vendorProductName: string;
  productId: string;
  confidenceScore: number;
  approvedBy: string;
}): Promise<VendorAlias | null> {
  const normalizedName = normalizeProductText(params.vendorProductName);

  const { data, error } = await supabase
    .from('vendor_product_aliases')
    .insert({
      supplier_id: params.supplierId,
      vendor_product_name: params.vendorProductName,
      normalized_name: normalizedName,
      product_id: params.productId,
      confidence_score: params.confidenceScore,
      is_approved: true,
      approved_by: params.approvedBy,
      usage_count: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating alias:', error);
    return null;
  }

  return mapToAlias(data);
}

/**
 * Get aliases for a supplier
 */
export async function getAliasesForSupplier(supplierId: string): Promise<VendorAlias[]> {
  const { data, error } = await supabase
    .from('vendor_product_aliases')
    .select(`
      *,
      supplier:suppliers(name),
      product:products(name)
    `)
    .eq('supplier_id', supplierId)
    .order('usage_count', { ascending: false });

  if (error) {
    console.error('Error fetching aliases:', error);
    return [];
  }

  return data.map(mapToAlias);
}

/**
 * Find alias by vendor product name
 */
export async function findAlias(supplierId: string, vendorProductName: string): Promise<VendorAlias | null> {
  const { data, error } = await supabase
    .from('vendor_product_aliases')
    .select('*')
    .eq('supplier_id', supplierId)
    .eq('vendor_product_name', vendorProductName)
    .eq('is_approved', true)
    .single();

  if (error) {
    return null;
  }

  return mapToAlias(data);
}

/**
 * Increment alias usage count
 */
export async function incrementAliasUsage(aliasId: string): Promise<boolean> {
  // supabase.raw() doesn't exist in JS v2 — read then increment
  const { data: current } = await supabase
    .from('vendor_product_aliases')
    .select('usage_count')
    .eq('id', aliasId)
    .single();

  const newCount = (current?.usage_count ?? 0) + 1;

  const { error } = await supabase
    .from('vendor_product_aliases')
    .update({
      usage_count: newCount,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', aliasId);

  if (error) {
    console.error('Error incrementing alias usage:', error);
    return false;
  }

  return true;
}

/**
 * Auto-promote high-usage unapproved aliases
 */
export async function autoPromoteAliases(config: AliasLearningConfig = {
  minUsageCount: 5,
  autoPromoteThreshold: 90,
  confidenceDecay: 0.1,
}): Promise<number> {
  const { data, error } = await supabase
    .from('vendor_product_aliases')
    .select('*')
    .eq('is_approved', false)
    .gte('usage_count', config.minUsageCount)
    .gte('confidence_score', config.autoPromoteThreshold);

  if (error) {
    console.error('Error fetching candidates for promotion:', error);
    return 0;
  }

  let promotedCount = 0;

  for (const alias of data) {
    // Apply confidence decay based on age
    const ageInDays = (Date.now() - new Date(alias.created_at).getTime()) / (1000 * 60 * 60 * 24);
    const adjustedConfidence = alias.confidence_score - (ageInDays * config.confidenceDecay);

    if (adjustedConfidence >= config.autoPromoteThreshold) {
      const { error: updateError } = await supabase
        .from('vendor_product_aliases')
        .update({
          is_approved: true,
          approved_by: 'system', // System auto-approval
        })
        .eq('id', alias.id);

      if (!updateError) {
        promotedCount++;
      }
    }
  }

  return promotedCount;
}

/**
 * Get alias learning statistics
 */
export async function getAliasStats(companyId?: string): Promise<{
  totalAliases: number;
  approvedAliases: number;
  pendingAliases: number;
  avgUsageCount: number;
  topSuppliers: Array<{ supplierId: string; supplierName: string; aliasCount: number }>;
}> {
  let query = supabase
    .from('vendor_product_aliases')
    .select(`
      *,
      supplier:suppliers(name, company_id)
    `);

  if (companyId) {
    query = query.eq('supplier.company_id', companyId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching alias stats:', error);
    return {
      totalAliases: 0,
      approvedAliases: 0,
      pendingAliases: 0,
      avgUsageCount: 0,
      topSuppliers: [],
    };
  }

  const approved = data.filter((a: any) => a.is_approved).length;
  const pending = data.filter((a: any) => !a.is_approved).length;
  const totalUsage = data.reduce((sum: number, a: any) => sum + a.usage_count, 0);

  // Group by supplier
  const supplierMap = new Map<string, { name: string; count: number }>();
  data.forEach((a: any) => {
    const supplierId = a.supplier_id;
    const supplierName = a.supplier?.name || 'Unknown';
    const current = supplierMap.get(supplierId) || { name: supplierName, count: 0 };
    supplierMap.set(supplierId, { name: current.name, count: current.count + 1 });
  });

  const topSuppliers = Array.from(supplierMap.entries())
    .map(([supplierId, data]) => ({ supplierId, supplierName: data.name, aliasCount: data.count }))
    .sort((a, b) => b.aliasCount - a.aliasCount)
    .slice(0, 10);

  return {
    totalAliases: data.length,
    approvedAliases: approved,
    pendingAliases: pending,
    avgUsageCount: data.length > 0 ? totalUsage / data.length : 0,
    topSuppliers,
  };
}

/**
 * Suggest aliases based on high-confidence matches
 */
export async function suggestAliases(
  matches: Array<{
    vendorProductName: string;
    productId: string;
    supplierId: string;
    confidenceScore: number;
  }>
): Promise<number> {
  let createdCount = 0;

  for (const match of matches) {
    // Check if alias already exists
    const existing = await findAlias(match.supplierId, match.vendorProductName);
    
    if (!existing && match.confidenceScore >= 85) {
      const result = await createAlias({
        supplierId: match.supplierId,
        vendorProductName: match.vendorProductName,
        productId: match.productId,
        confidenceScore: match.confidenceScore,
        approvedBy: 'system', // Auto-created suggestion
      });

      if (result) {
        createdCount++;
      }
    }
  }

  return createdCount;
}

/**
 * Merge duplicate aliases
 */
export async function mergeDuplicateAliases(): Promise<number> {
  // Find aliases with same normalized name and product
  const { data, error } = await supabase
    .from('vendor_product_aliases')
    .select('*')
    .order('usage_count', { ascending: false });

  if (error) {
    console.error('Error fetching aliases for merge:', error);
    return 0;
  }

  const groups = new Map<string, any[]>();
  data.forEach((alias: any) => {
    const key = `${alias.supplier_id}-${alias.normalized_name}-${alias.product_id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(alias);
  });

  let mergedCount = 0;

  for (const [key, aliases] of groups) {
    if (aliases.length > 1) {
      // Keep the one with highest usage count
      const toKeep = aliases.reduce((best, current) => 
        current.usage_count > best.usage_count ? current : best
      );

      const toDelete = aliases.filter(a => a.id !== toKeep.id);

      // Transfer usage counts
      const totalUsage = toDelete.reduce((sum, a) => sum + a.usage_count, 0);
      
      await supabase
        .from('vendor_product_aliases')
        .update({ usage_count: toKeep.usage_count + totalUsage })
        .eq('id', toKeep.id);

      // Delete duplicates
      for (const alias of toDelete) {
        await supabase
          .from('vendor_product_aliases')
          .delete()
          .eq('id', alias.id);
      }

      mergedCount += toDelete.length;
    }
  }

  return mergedCount;
}

/**
 * Delete unused aliases
 */
export async function cleanupUnusedAliases(daysUnused: number = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysUnused);

  const { error } = await supabase
    .from('vendor_product_aliases')
    .delete()
    .lt('last_used_at', cutoffDate.toISOString())
    .lt('usage_count', 2); // Only delete if used less than 2 times

  if (error) {
    console.error('Error cleaning up unused aliases:', error);
    return 0;
  }

  return 1;
}

/**
 * Map database record to Alias interface
 */
function mapToAlias(data: any): VendorAlias {
  return {
    id: data.id,
    supplierId: data.supplier_id,
    vendorProductName: data.vendor_product_name,
    normalizedName: data.normalized_name,
    productId: data.product_id,
    confidenceScore: data.confidence_score,
    isApproved: data.is_approved,
    approvedBy: data.approved_by,
    usageCount: data.usage_count,
    lastUsedAt: data.last_used_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

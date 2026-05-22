/**
 * Product Duplicate Detection Service
 * Uses fingerprinting and similarity analysis to detect potential duplicate products
 */

import { supabase } from '@/integrations/supabase/client';
import {
  extractProductComponents,
  generateProductFingerprint,
  calculateCombinedSimilarity,
  fingerprintsMatch,
} from './textNormalization';

export interface ProductDuplicate {
  productId: string;
  productName: string;
  duplicateProductId: string;
  duplicateProductName: string;
  similarityScore: number;
  fingerprintMatch: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}

export interface DuplicateDetectionResult {
  duplicates: ProductDuplicate[];
  totalProducts: number;
  potentialDuplicates: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
}

/**
 * Detect duplicates in the product catalog
 */
export async function detectDuplicates(companyId: string): Promise<DuplicateDetectionResult> {
  // Fetch all products for the company
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (error || !products) {
    console.error('Error fetching products:', error);
    return {
      duplicates: [],
      totalProducts: 0,
      potentialDuplicates: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
    };
  }

  const duplicates: ProductDuplicate[] = [];
  const processedPairs = new Set<string>();

  // Compare each product with every other product
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const productA = products[i];
      const productB = products[j];

      // Create unique pair identifier to avoid duplicate comparisons
      const pairKey = [productA.id, productB.id].sort().join('-');
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      const duplicate = compareProducts(productA, productB);
      if (duplicate) {
        duplicates.push(duplicate);
      }
    }
  }

  // Calculate statistics
  const highConfidence = duplicates.filter(d => d.confidence === 'high').length;
  const mediumConfidence = duplicates.filter(d => d.confidence === 'medium').length;
  const lowConfidence = duplicates.filter(d => d.confidence === 'low').length;

  return {
    duplicates,
    totalProducts: products.length,
    potentialDuplicates: duplicates.length,
    highConfidence,
    mediumConfidence,
    lowConfidence,
  };
}

/**
 * Compare two products for potential duplication
 */
function compareProducts(productA: any, productB: any): ProductDuplicate | null {
  const reasons: string[] = [];
  let similarityScore = 0;

  // Extract components
  const componentsA = extractProductComponents(productA.name);
  const componentsB = extractProductComponents(productB.name);

  // Check fingerprint match
  const fingerprintA = generateProductFingerprint(componentsA);
  const fingerprintB = generateProductFingerprint(componentsB);
  const fpMatch = fingerprintsMatch(fingerprintA, fingerprintB);

  if (fpMatch) {
    similarityScore += 40;
    reasons.push('Fingerprint match');
  }

  // Check name similarity
  const nameSimilarity = calculateCombinedSimilarity(productA.name, productB.name);
  if (nameSimilarity >= 80) {
    similarityScore += 30;
    reasons.push(`High name similarity (${nameSimilarity.toFixed(1)}%)`);
  } else if (nameSimilarity >= 60) {
    similarityScore += 15;
    reasons.push(`Moderate name similarity (${nameSimilarity.toFixed(1)}%)`);
  }

  // Check manufacturer match
  if (productA.manufacturer && productB.manufacturer) {
    if (productA.manufacturer.toLowerCase() === productB.manufacturer.toLowerCase()) {
      similarityScore += 15;
      reasons.push('Same manufacturer');
    }
  }

  // Check HSN code match
  if (productA.hsn_code && productB.hsn_code) {
    if (productA.hsn_code === productB.hsn_code) {
      similarityScore += 10;
      reasons.push('Same HSN code');
    }
  }

  // Check MRP similarity (within 5%)
  if (productA.mrp && productB.mrp) {
    const mrpDiff = Math.abs(productA.mrp - productB.mrp);
    const mrpPercent = (mrpDiff / Math.max(productA.mrp, productB.mrp)) * 100;
    if (mrpPercent <= 5) {
      similarityScore += 5;
      reasons.push('Similar MRP');
    }
  }

  // Determine confidence level
  let confidence: 'high' | 'medium' | 'low';
  if (similarityScore >= 75) {
    confidence = 'high';
  } else if (similarityScore >= 50) {
    confidence = 'medium';
  } else if (similarityScore >= 30) {
    confidence = 'low';
  } else {
    return null; // Not a duplicate
  }

  return {
    productId: productA.id,
    productName: productA.name,
    duplicateProductId: productB.id,
    duplicateProductName: productB.name,
    similarityScore,
    fingerprintMatch: fpMatch,
    confidence,
    reasons,
  };
}

/**
 * Check if a new product would be a duplicate
 */
export async function checkForDuplicate(
  productName: string,
  companyId: string,
  excludeProductId?: string
): Promise<ProductDuplicate | null> {
  const components = extractProductComponents(productName);
  const fingerprint = generateProductFingerprint(components);

  // Fetch products with similar fingerprints or names
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (error || !products) {
    return null;
  }

  // Filter out the product being edited (if provided)
  const candidates = excludeProductId 
    ? products.filter(p => p.id !== excludeProductId)
    : products;

  for (const product of candidates) {
    const duplicate = compareProducts(
      { name: productName, manufacturer: null, hsn_code: null, mrp: null },
      product
    );

    if (duplicate && duplicate.confidence === 'high') {
      return duplicate;
    }
  }

  return null;
}

/**
 * Generate fingerprint for a product
 */
export async function generateProductFingerprintDB(productId: string): Promise<string | null> {
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  if (error || !product) {
    return null;
  }

  const components = extractProductComponents(product.name);
  const fingerprint = generateProductFingerprint(components);

  // Update the product with fingerprint
  await supabase
    .from('products')
    .update({
      fingerprint,
      brand: components.brand,
      strength: components.strength,
      form: components.form,
      pack_size: components.packSize,
      canonical_name: components.normalized,
    })
    .eq('id', productId);

  return fingerprint;
}

/**
 * Bulk generate fingerprints for all products
 */
export async function bulkGenerateFingerprints(companyId: string): Promise<{
  success: number;
  failed: number;
}> {
  const { data: products, error } = await supabase
    .from('products')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (error || !products) {
    return { success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  for (const product of products) {
    try {
      const result = await generateProductFingerprintDB(product.id);
      if (result) {
        success++;
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Get duplicate statistics for dashboard
 */
export async function getDuplicateStats(companyId: string): Promise<{
  totalProducts: number;
  potentialDuplicates: number;
  highRisk: number;
  mediumRisk: number;
  lastChecked: string | null;
}> {
  const { data: products, error } = await supabase
    .from('products')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (error || !products) {
    return {
      totalProducts: 0,
      potentialDuplicates: 0,
      highRisk: 0,
      mediumRisk: 0,
      lastChecked: null,
    };
  }

  // Run duplicate detection
  const result = await detectDuplicates(companyId);

  return {
    totalProducts: products.length,
    potentialDuplicates: result.potentialDuplicates,
    highRisk: result.highConfidence,
    mediumRisk: result.mediumConfidence,
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Merge duplicate products
 */
export async function mergeDuplicates(
  keepProductId: string,
  mergeProductId: string,
  userId: string
): Promise<boolean> {
  // This would need to:
  // 1. Update all references from mergeProductId to keepProductId
  // 2. Mark mergeProductId as inactive
  // 3. Create a merge record for audit trail

  const { error } = await supabase
    .from('products')
    .update({ is_active: false })
    .eq('id', mergeProductId);

  if (error) {
    console.error('Error merging products:', error);
    return false;
  }

  // TODO: Update all foreign key references
  // - inventory_batches
  // - purchase_order_items
  // - sales_order_items
  // - vendor_product_aliases

  return true;
}

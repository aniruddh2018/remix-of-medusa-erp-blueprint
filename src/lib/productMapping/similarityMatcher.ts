/**
 * Semantic Similarity Matching Engine
 * Intelligently matches vendor product names to ERP products with confidence scoring
 */

import {
  normalizeProductText,
  extractProductComponents,
  generateProductFingerprint,
  calculateCombinedSimilarity,
  getConfidenceFromSimilarity,
  fingerprintsMatch,
} from './textNormalization';

export interface ProductMatch {
  productId: string;
  productName: string;
  confidenceScore: number;
  matchingMethod: 'exact' | 'alias' | 'fingerprint' | 'fuzzy' | 'semantic';
  normalizedInput: string;
  normalizedProduct: string;
}

export interface ProductCandidate {
  id: string;
  name: string;
  canonicalName?: string;
  brand?: string;
  strength?: string;
  form?: string;
  packSize?: string;
  fingerprint?: string;
}

export interface MatchingOptions {
  supplierId?: string;
  companyId: string;
  minConfidence?: number;
  useAliases?: boolean;
  useFingerprinting?: boolean;
}

/**
 * Main product matching engine
 */
export class ProductMatcher {
  private aliases: Map<string, ProductMatch[]> = new Map();
  private products: Map<string, ProductCandidate> = new Map();

  constructor() {
    // Initialize with empty caches
  }

  /**
   * Load products into memory for matching
   */
  loadProducts(products: ProductCandidate[]): void {
    this.products.clear();
    products.forEach(p => {
      this.products.set(p.id, p);
    });
  }

  /**
   * Load aliases into memory for matching
   */
  loadAliases(aliases: Array<{ vendor_product_name: string; product_id: string; confidence_score: number }>): void {
    this.aliases.clear();
    aliases.forEach(a => {
      const key = a.vendor_product_name.toLowerCase();
      if (!this.aliases.has(key)) {
        this.aliases.set(key, []);
      }
      this.aliases.get(key)!.push({
        productId: a.product_id,
        productName: a.vendor_product_name,
        confidenceScore: a.confidence_score,
        matchingMethod: 'alias',
        normalizedInput: normalizeProductText(a.vendor_product_name),
        normalizedProduct: normalizeProductText(a.vendor_product_name),
      });
    });
  }

  /**
   * Find best product match using multi-layer approach
   */
  async findBestMatch(
    extractedName: string,
    options: MatchingOptions
  ): Promise<ProductMatch | null> {
    const normalizedInput = normalizeProductText(extractedName);
    const inputComponents = extractProductComponents(extractedName);
    const inputFingerprint = generateProductFingerprint(inputComponents);

    // Layer 1: Exact match
    const exactMatch = this.tryExactMatch(extractedName, options.companyId);
    if (exactMatch) {
      return exactMatch;
    }

    // Layer 2: Alias match (if supplier provided)
    if (options.supplierId && options.useAliases !== false) {
      const aliasMatch = this.tryAliasMatch(extractedName, options.supplierId);
      if (aliasMatch) {
        return aliasMatch;
      }
    }

    // Layer 3: Fingerprint match
    if (options.useFingerprinting !== false) {
      const fingerprintMatch = this.tryFingerprintMatch(inputFingerprint, options.companyId);
      if (fingerprintMatch) {
        return fingerprintMatch;
      }
    }

    // Layer 4: Fuzzy matching
    const fuzzyMatch = this.tryFuzzyMatch(normalizedInput, options.companyId, options.minConfidence);
    if (fuzzyMatch) {
      return fuzzyMatch;
    }

    // Layer 5: Semantic matching (component-based)
    const semanticMatch = this.trySemanticMatch(inputComponents, options.companyId, options.minConfidence);
    if (semanticMatch) {
      return semanticMatch;
    }

    return null;
  }

  /**
   * Try exact string match
   */
  private tryExactMatch(extractedName: string, companyId: string): ProductMatch | null {
    for (const [id, product] of this.products) {
      if (product.name.toLowerCase().trim() === extractedName.toLowerCase().trim()) {
        return {
          productId: id,
          productName: product.name,
          confidenceScore: 100,
          matchingMethod: 'exact',
          normalizedInput: normalizeProductText(extractedName),
          normalizedProduct: normalizeProductText(product.name),
        };
      }
    }
    return null;
  }

  /**
   * Try alias match from vendor-specific aliases
   */
  private tryAliasMatch(extractedName: string, supplierId: string): ProductMatch | null {
    const key = extractedName.toLowerCase();
    const matches = this.aliases.get(key);
    
    if (matches && matches.length > 0) {
      // Return the highest confidence alias
      const bestMatch = matches.reduce((best, current) => 
        current.confidenceScore > best.confidenceScore ? current : best
      );
      return bestMatch;
    }
    
    return null;
  }

  /**
   * Try fingerprint match
   */
  private tryFingerprintMatch(inputFingerprint: string, companyId: string): ProductMatch | null {
    for (const [id, product] of this.products) {
      if (product.fingerprint && fingerprintsMatch(inputFingerprint, product.fingerprint)) {
        return {
          productId: id,
          productName: product.name,
          confidenceScore: 95,
          matchingMethod: 'fingerprint',
          normalizedInput: inputFingerprint,
          normalizedProduct: product.fingerprint,
        };
      }
    }
    return null;
  }

  /**
   * Try fuzzy matching using combined similarity
   */
  private tryFuzzyMatch(
    normalizedInput: string,
    companyId: string,
    minConfidence: number = 75
  ): ProductMatch | null {
    let bestMatch: ProductMatch | null = null;
    let bestScore = 0;

    for (const [id, product] of this.products) {
      const normalizedProduct = normalizeProductText(product.name);
      const similarity = calculateCombinedSimilarity(normalizedInput, normalizedProduct);

      if (similarity >= minConfidence && similarity > bestScore) {
        bestScore = similarity;
        bestMatch = {
          productId: id,
          productName: product.name,
          confidenceScore: similarity,
          matchingMethod: 'fuzzy',
          normalizedInput,
          normalizedProduct,
        };
      }
    }

    return bestMatch;
  }

  /**
   * Try semantic matching using component comparison
   */
  private trySemanticMatch(
    inputComponents: ReturnType<typeof extractProductComponents>,
    companyId: string,
    minConfidence: number = 75
  ): ProductMatch | null {
    let bestMatch: ProductMatch | null = null;
    let bestScore = 0;

    for (const [id, product] of this.products) {
      let componentScore = 0;
      let componentCount = 0;

      // Compare brand
      if (inputComponents.brand && product.brand) {
        componentCount++;
        if (inputComponents.brand.toLowerCase() === product.brand.toLowerCase()) {
          componentScore += 40;
        } else {
          componentScore += calculateCombinedSimilarity(inputComponents.brand, product.brand) * 0.4;
        }
      }

      // Compare strength
      if (inputComponents.strength && product.strength) {
        componentCount++;
        if (inputComponents.strength.toLowerCase() === product.strength.toLowerCase()) {
          componentScore += 30;
        } else {
          componentScore += calculateCombinedSimilarity(inputComponents.strength, product.strength) * 0.3;
        }
      }

      // Compare form
      if (inputComponents.form && product.form) {
        componentCount++;
        if (inputComponents.form.toLowerCase() === product.form.toLowerCase()) {
          componentScore += 20;
        } else {
          componentScore += calculateCombinedSimilarity(inputComponents.form, product.form) * 0.2;
        }
      }

      // Compare pack size
      if (inputComponents.packSize && product.packSize) {
        componentCount++;
        if (inputComponents.packSize.toLowerCase() === product.packSize.toLowerCase()) {
          componentScore += 10;
        } else {
          componentScore += calculateCombinedSimilarity(inputComponents.packSize, product.packSize) * 0.1;
        }
      }

      // Normalize score
      const finalScore = componentCount > 0 ? componentScore : 0;

      if (finalScore >= minConfidence && finalScore > bestScore) {
        bestScore = finalScore;
        bestMatch = {
          productId: id,
          productName: product.name,
          confidenceScore: finalScore,
          matchingMethod: 'semantic',
          normalizedInput: inputComponents.normalized,
          normalizedProduct: normalizeProductText(product.name),
        };
      }
    }

    return bestMatch;
  }

  /**
   * Get decision based on confidence score
   */
  getDecision(confidenceScore: number): 'auto_map' | 'human_review' | 'new_product' {
    if (confidenceScore >= 95) {
      return 'auto_map';
    } else if (confidenceScore >= 75) {
      return 'human_review';
    } else {
      return 'new_product';
    }
  }

  /**
   * Batch match multiple products
   */
  async batchMatch(
    extractedNames: string[],
    options: MatchingOptions
  ): Promise<Map<string, ProductMatch | null>> {
    const results = new Map<string, ProductMatch | null>();

    for (const name of extractedNames) {
      const match = await this.findBestMatch(name, options);
      results.set(name, match);
    }

    return results;
  }
}

/**
 * Singleton instance for use across the application
 */
export const productMatcher = new ProductMatcher();

/**
 * Text Normalization Engine for Product Mapping
 * Normalizes vendor product names to enable fuzzy matching
 */

export interface NormalizedProduct {
  original: string;
  normalized: string;
  brand?: string;
  strength?: string;
  form?: string;
  packSize?: string;
}

/**
 * Common medical filler words to remove
 */
const FILLER_WORDS = [
  'tablets', 'capsules', 'syrup', 'injection', 'ointment', 'cream', 'gel',
  'drops', 'spray', 'inhaler', 'patch', 'suppository', 'tablet', 'capsule',
  'strip of', 'box of', 'pack of', 'bottle of', 'tube of', 'vial of',
  'each', 'pcs', 'pieces', 'units', 'each', 'per', 'for'
];

/**
 * Pharmacopeia references to remove
 */
const PHARMACOPEIA = ['ip', 'bp', 'usp', 'ep', 'bp'];

/**
 * Common abbreviations and their expansions
 */
const ABBREVIATIONS: Record<string, string> = {
  'tab': 'tablet',
  'tabs': 'tablet',
  'cap': 'capsule',
  'caps': 'capsule',
  'syr': 'syrup',
  'inj': 'injection',
  'oint': 'ointment',
  'cr': 'cream',
  'gtt': 'drops',
  'inhl': 'inhaler',
  'sol': 'solution',
  'susp': 'suspension',
  'emul': 'emulsion',
  'pow': 'powder',
  'gran': 'granules',
};

/**
 * Unit patterns for extraction
 */
const UNIT_PATTERNS = {
  strength: /(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|l|iu|units?)/i,
  pack_size: /(\d+)\s*(?:strip|box|pack|bottle|tube|vial|s)/i,
};

/**
 * Normalize product text for matching
 */
export function normalizeProductText(input: string): string {
  if (!input) return '';

  let normalized = input.toLowerCase().trim();

  // Remove punctuation except hyphens and numbers
  normalized = normalized.replace(/[^\w\s-]/g, ' ');

  // Remove extra spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Remove pharmacopeia references
  PHARMACOPEIA.forEach(ref => {
    const regex = new RegExp(`\\b${ref}\\b`, 'gi');
    normalized = normalized.replace(regex, '');
  });

  // Remove filler words
  FILLER_WORDS.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    normalized = normalized.replace(regex, '');
  });

  // Expand abbreviations
  Object.entries(ABBREVIATIONS).forEach(([abbr, full]) => {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    normalized = normalized.replace(regex, full);
  });

  // Remove units (they'll be extracted separately)
  normalized = normalized.replace(UNIT_PATTERNS.strength, '$1');
  normalized = normalized.replace(UNIT_PATTERNS.pack_size, '$1');

  // Clean up final spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Extract structured components from product name
 */
export function extractProductComponents(input: string): NormalizedProduct {
  const normalized = normalizeProductText(input);
  const words = normalized.split(' ').filter(w => w.length > 0);

  // Extract strength (e.g., "650" from "650mg")
  const strengthMatch = input.match(UNIT_PATTERNS.strength);
  const strength = strengthMatch ? `${strengthMatch[1]}${strengthMatch[2]}` : undefined;

  // Extract pack size (e.g., "15" from "strip of 15")
  const packSizeMatch = input.match(UNIT_PATTERNS.pack_size);
  const packSize = packSizeMatch ? packSizeMatch[1] : undefined;

  // Heuristic: first word is usually brand
  const brand = words.length > 0 ? words[0] : undefined;

  // Heuristic: last word before numbers is usually form
  let form: string | undefined;
  for (let i = words.length - 1; i >= 0; i--) {
    if (!/^\d+$/.test(words[i])) {
      form = words[i];
      break;
    }
  }

  return {
    original: input,
    normalized,
    brand,
    strength,
    form,
    packSize,
  };
}

/**
 * Generate product fingerprint for duplicate detection
 */
export function generateProductFingerprint(components: NormalizedProduct): string {
  const parts = [
    components.brand || '',
    components.strength || '',
    components.form || '',
    components.packSize || '',
  ];
  return parts.join('|').toLowerCase().trim();
}

/**
 * Calculate text similarity using word overlap
 */
export function calculateTextSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  if (text1 === text2) return 100;

  const words1 = new Set(normalizeProductText(text1).split(' '));
  const words2 = new Set(normalizeProductText(text2).split(' '));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  const similarity = (intersection.size / union.size) * 100;
  return Math.round(similarity * 100) / 100;
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],      // deletion
          dp[i][j - 1],      // insertion
          dp[i - 1][j - 1]   // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity using Levenshtein distance
 */
export function calculateLevenshteinSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  if (text1 === text2) return 100;

  const distance = levenshteinDistance(text1.toLowerCase(), text2.toLowerCase());
  const maxLength = Math.max(text1.length, text2.length);

  if (maxLength === 0) return 100;

  const similarity = ((maxLength - distance) / maxLength) * 100;
  return Math.round(similarity * 100) / 100;
}

/**
 * Combined similarity score (word overlap + Levenshtein)
 */
export function calculateCombinedSimilarity(text1: string, text2: string): number {
  const wordSim = calculateTextSimilarity(text1, text2);
  const levSim = calculateLevenshteinSimilarity(text1, text2);

  // Weighted average (word overlap is more important for product names)
  return Math.round((wordSim * 0.6 + levSim * 0.4) * 100) / 100;
}

/**
 * Check if two product fingerprints match
 */
export function fingerprintsMatch(fp1: string, fp2: string): boolean {
  if (!fp1 || !fp2) return false;
  return fp1.toLowerCase() === fp2.toLowerCase();
}

/**
 * Extract confidence score from similarity
 */
export function getConfidenceFromSimilarity(similarity: number): {
  score: number;
  level: 'high' | 'medium' | 'low';
} {
  if (similarity >= 95) {
    return { score: similarity, level: 'high' };
  } else if (similarity >= 75) {
    return { score: similarity, level: 'medium' };
  } else {
    return { score: similarity, level: 'low' };
  }
}

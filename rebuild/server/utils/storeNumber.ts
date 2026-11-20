/**
 * Store number utilities for search ranking.
 * 
 * Store numbers are stored as text with leading zeros preserved ("007" is not "7").
 * However, for search purposes, users expect 7, 07, and 007 to match the same store.
 * 
 * Tie-break rules (applied in order):
 * 
 * TIER 1 (exact normalized match):
 *   1. Raw exact match first (typed "12" → stored "12" before "012")
 *   2. Then shorter raw string (stored "7" before "07" before "007")
 *   3. Then raw string lexicographic
 *   4. Then document id as final deterministic key
 * 
 * TIER 2 (prefix match):
 *   1. By normalized length ascending (store 12 before 100, 101, 112)
 *   2. Then raw string lexicographic
 *   3. Then document id
 * 
 * Zero-only queries (0, 00, 000): These all normalize to "00" and return
 * only exact matches, not substring matches.
 * 
 * Single-digit queries (7, #7): Return only exact + prefix matches,
 * NOT substring matches like 307, 317. This prevents tier-3 spray.
 */

/**
 * Normalize a store number for comparison:
 * - Strip leading '#'
 * - Strip leading zeros (but keep at least one digit)
 * - Pad to minimum 2 digits
 * 
 * Examples: "007" → "07", "7" → "07", "12" → "12", "0" → "00", "" → "00"
 */
export function normalizeStoreNumber(storeNumber: string): string {
  const cleaned = storeNumber.replace(/^#/, '').trim();
  if (cleaned === '') return '00'; // Empty string normalizes to "00"
  const numeric = cleaned.replace(/^0+/, '') || '0';
  return numeric.padStart(2, '0');
}

/**
 * Check if two store numbers match after normalization.
 */
export function storeNumbersMatch(a: string, b: string): boolean {
  return normalizeStoreNumber(a) === normalizeStoreNumber(b);
}

/**
 * Check if a query looks like a store number:
 * - Optional leading '#'
 * - 1+ digits only (after stripping # and leading zeros)
 * - The significant part (after stripping leading zeros) must be 1-4 digits
 * - No letters or other characters
 * 
 * This allows '00123' to match store 123 (leading zeros don't count toward limit).
 */
export function isStoreNumberQuery(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length === 0) return false;
  
  // Strip optional leading '#'
  const withoutHash = trimmed.replace(/^#/, '');
  
  // Must be all digits
  if (!/^\d+$/.test(withoutHash)) return false;
  
  // Strip leading zeros and check the significant part is 1-4 digits
  const significant = withoutHash.replace(/^0+/, '') || '0';
  if (significant.length > 4) return false;
  
  return true;
}

/**
 * Check if a query is a single-digit store number (after stripping # and zeros).
 * Single-digit queries only get exact + prefix matches, not tier-3 substring.
 */
export function isSingleDigitStoreQuery(query: string): boolean {
  if (!isStoreNumberQuery(query)) return false;
  const withoutHash = query.trim().replace(/^#/, '');
  const significant = withoutHash.replace(/^0+/, '') || '0';
  return significant.length === 1;
}

/**
 * Check if a query consists only of zeros (after stripping #).
 * Zero-only queries (0, 00, 000, #0) should match only exact stores,
 * not every store via substring matching.
 */
export function isZeroOnlyQuery(query: string): boolean {
  const withoutHash = query.trim().replace(/^#/, '');
  return withoutHash.length > 0 && /^0+$/.test(withoutHash);
}

/**
 * Extract the numeric part of a store number query (strips # and whitespace).
 */
export function extractStoreDigits(query: string): string {
  return query.trim().replace(/^#/, '');
}

/**
 * Check if a query is phone-like: consists of digits and phone separators only,
 * with at least 3 digits. This prevents "store 07" from being treated as a phone query.
 * 
 * Note: "ext." style extensions are allowed (555-123 ext. 4567) since they contain
 * only the allowed characters when checking the phone portion.
 */
export function isPhoneLikeQuery(query: string): { isPhoneLike: boolean; digits: string } {
  // Allow only digits and common phone separators (including 'ext' for extensions)
  const phoneChars = /^[\d\s\-().+ext]+$/i;
  const trimmed = query.trim();
  
  if (!phoneChars.test(trimmed)) {
    return { isPhoneLike: false, digits: '' };
  }
  
  const digits = trimmed.replace(/\D/g, '');
  return { 
    isPhoneLike: digits.length >= 3, 
    digits 
  };
}

/**
 * Location data needed for ranking. This is the minimal interface
 * required by the ranking helper - it does not include people or enrichment data.
 */
export interface RankableLocation {
  id: string;
  storeNumber: string;
  name: string;
  city: string;
  mall?: string;
  mainPhone?: string;
}

/**
 * Ranking tier for store-number-shaped queries:
 * 1 = exact store number match (normalized equality)
 * 2 = prefix match (store number starts with query digits)
 * 3 = other matches (name, city, mall, phone) - SKIPPED for single-digit queries
 */
export type RankTier = 1 | 2 | 3;

export interface RankedLocation<T extends RankableLocation> {
  location: T;
  tier: RankTier;
  rawExact: boolean; // True if the raw string matches exactly (for tie-breaking)
}

/**
 * Rank locations for a store-number-shaped query.
 * 
 * This is a pure function: no database access, no side effects.
 * It only handles location ranking - people are handled separately by the caller.
 * 
 * For single-digit queries (like '7'), only tier 1 (exact) and tier 2 (prefix)
 * matches are returned - tier 3 (substring) matches are excluded to prevent spray.
 * 
 * @param query - The search query (must pass isStoreNumberQuery check)
 * @param locations - Array of locations to rank
 * @param includePhoneMatches - Whether to include phone-based matches (tier 3)
 * @returns Ranked and sorted array of locations with tier info
 */
export function rankLocationsForStoreQuery<T extends RankableLocation>(
  query: string,
  locations: T[],
  includePhoneMatches: boolean = true
): RankedLocation<T>[] {
  const queryDigits = extractStoreDigits(query.toLowerCase());
  const normalizedQuery = normalizeStoreNumber(queryDigits);
  const isZeroOnly = isZeroOnlyQuery(query);
  const isSingleDigit = isSingleDigitStoreQuery(query);
  
  // For phone matching, we need 3+ digits and not zero-only
  const phoneQuery = isPhoneLikeQuery(query);
  const canMatchPhone = includePhoneMatches && phoneQuery.isPhoneLike && !isZeroOnly && !isSingleDigit;
  
  const results: RankedLocation<T>[] = [];
  
  for (const location of locations) {
    const storeNum = location.storeNumber?.toLowerCase() || '';
    
    // A blank/empty store number should not match zero queries
    if (storeNum === '' && isZeroOnly) {
      continue;
    }
    
    const normalizedStore = normalizeStoreNumber(storeNum);
    
    // Check for exact match (tier 1)
    if (normalizedStore === normalizedQuery) {
      results.push({
        location,
        tier: 1,
        rawExact: storeNum === queryDigits,
      });
      continue;
    }
    
    // For zero-only queries, don't do prefix or substring matching
    if (isZeroOnly) {
      continue;
    }
    
    // Check for prefix match (tier 2)
    // Important: Use the raw query digits for prefix check, not normalized
    // This prevents "1" from becoming "01" and missing 10-19
    if (storeNum.startsWith(queryDigits) || normalizedStore.startsWith(queryDigits)) {
      results.push({
        location,
        tier: 2,
        rawExact: false,
      });
      continue;
    }
    
    // For single-digit queries, skip tier 3 entirely (no substring matches)
    if (isSingleDigit) {
      continue;
    }
    
    // Check for other matches (tier 3): name, city, mall, phone
    const name = location.name?.toLowerCase() || '';
    const city = location.city?.toLowerCase() || '';
    const mall = location.mall?.toLowerCase() || '';
    const phone = (location.mainPhone || '').replace(/\D/g, '');
    
    const nameMatch = name.includes(queryDigits);
    const cityMatch = city.includes(queryDigits);
    const mallMatch = mall.includes(queryDigits);
    const phoneMatch = canMatchPhone && phone.includes(phoneQuery.digits);
    
    // Also check if store number contains the query (but not as prefix)
    const storeContains = storeNum.includes(queryDigits);
    
    if (nameMatch || cityMatch || mallMatch || phoneMatch || storeContains) {
      results.push({
        location,
        tier: 3,
        rawExact: false,
      });
    }
  }
  
  // Sort by tier, then by tie-break rules within each tier
  results.sort((a, b) => {
    // Primary sort: by tier
    if (a.tier !== b.tier) return a.tier - b.tier;
    
    const snA = a.location.storeNumber || '';
    const snB = b.location.storeNumber || '';
    
    // Within tier 1 (exact matches), apply tie-break:
    // 1. Raw exact match first
    // 2. Then shorter raw string
    // 3. Then raw string lexicographic
    // 4. Then by id
    if (a.tier === 1) {
      if (a.rawExact && !b.rawExact) return -1;
      if (b.rawExact && !a.rawExact) return 1;
      
      // Shorter raw string first (7 before 07 before 007)
      if (snA.length !== snB.length) return snA.length - snB.length;
      
      // Lexicographic
      const cmp = snA.localeCompare(snB);
      if (cmp !== 0) return cmp;
      
      return a.location.id.localeCompare(b.location.id);
    }
    
    // Within tier 2 (prefix matches):
    // 1. By normalized length ascending (12 before 100, 101, 112)
    // 2. Then raw string lexicographic
    // 3. Then by id
    if (a.tier === 2) {
      const normA = normalizeStoreNumber(snA);
      const normB = normalizeStoreNumber(snB);
      
      if (normA.length !== normB.length) return normA.length - normB.length;
      
      const cmp = snA.localeCompare(snB);
      if (cmp !== 0) return cmp;
      
      return a.location.id.localeCompare(b.location.id);
    }
    
    // Tier 3: just lexicographic by store number, then id
    const cmp = snA.localeCompare(snB);
    if (cmp !== 0) return cmp;
    
    return a.location.id.localeCompare(b.location.id);
  });
  
  return results;
}

/**
 * Filter and sort locations for a non-store-number query (names, cities, etc).
 * This keeps today's ordering: startsWith title first, then alphabetical.
 * 
 * @param query - The search query (lowercase, trimmed)
 * @param locations - Array of locations to filter
 * @param getTitle - Function to get the display title for sorting
 * @returns Filtered and sorted locations
 */
export function filterLocationsForTextQuery<T extends RankableLocation>(
  query: string,
  locations: T[],
  getTitle: (loc: T) => string
): T[] {
  const q = query.toLowerCase();
  const phoneQuery = isPhoneLikeQuery(query);
  
  const results: T[] = [];
  
  for (const location of locations) {
    const storeNum = location.storeNumber?.toLowerCase() || '';
    const name = location.name?.toLowerCase() || '';
    const city = location.city?.toLowerCase() || '';
    const mall = location.mall?.toLowerCase() || '';
    const phone = (location.mainPhone || '').replace(/\D/g, '');
    
    const storeMatch = storeNum.includes(q);
    const nameMatch = name.includes(q);
    const cityMatch = city.includes(q);
    const mallMatch = mall.includes(q);
    const phoneMatch = phoneQuery.isPhoneLike && phone.includes(phoneQuery.digits);
    
    if (storeMatch || nameMatch || cityMatch || mallMatch || phoneMatch) {
      results.push(location);
    }
  }
  
  // Sort: startsWith first, then alphabetical by title
  results.sort((a, b) => {
    const titleA = getTitle(a).toLowerCase();
    const titleB = getTitle(b).toLowerCase();
    
    const aStarts = titleA.startsWith(q) ? 0 : 1;
    const bStarts = titleB.startsWith(q) ? 0 : 1;
    
    if (aStarts !== bStarts) return aStarts - bStarts;
    return titleA.localeCompare(titleB);
  });
  
  return results;
}

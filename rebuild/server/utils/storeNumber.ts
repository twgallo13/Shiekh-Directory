/**
 * Store number utilities for search ranking.
 * 
 * Store numbers are stored as text with leading zeros preserved ("007" is not "7").
 * However, for search purposes, users expect 7, 07, and 007 to match the same store.
 * 
 * Tie-break rule when multiple stores match (e.g., 7, 07, 007 all exist):
 * 1. Raw exact match first (typed "12" matches stored "12" before "012")
 * 2. Then by normalized value length ascending (shorter normalized = more specific)
 * 3. Then by raw string lexicographic order
 * 4. Then by document id as final deterministic key
 * 
 * Zero-only queries (0, 00, 000): These all normalize to "00" and should return
 * only exact matches, not substring matches (since every store contains "0").
 */

/**
 * Normalize a store number for comparison:
 * - Strip leading '#'
 * - Strip leading zeros (but keep at least one digit)
 * - Pad to minimum 2 digits
 * 
 * Examples: "007" → "07", "7" → "07", "12" → "12", "0" → "00"
 */
export function normalizeStoreNumber(storeNumber: string): string {
  const cleaned = storeNumber.replace(/^#/, '').trim();
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
 * - 1-4 digits only (after stripping #)
 * - No letters or other characters
 * 
 * This is strict to avoid treating "store 07" or "1 2" as store numbers.
 */
export function isStoreNumberQuery(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length === 0) return false;
  
  // Strip optional leading '#'
  const withoutHash = trimmed.replace(/^#/, '');
  
  // Must be 1-4 digits only
  if (!/^\d{1,4}$/.test(withoutHash)) return false;
  
  return true;
}

/**
 * Check if a query consists only of zeros (after stripping #).
 * Zero-only queries (0, 00, 000, #0) should match only exact stores,
 * not every store via substring matching.
 */
export function isZeroOnlyQuery(query: string): boolean {
  const withoutHash = query.trim().replace(/^#/, '');
  return /^0+$/.test(withoutHash);
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
 */
export function isPhoneLikeQuery(query: string): { isPhoneLike: boolean; digits: string } {
  // Allow only digits and common phone separators
  const phoneChars = /^[\d\s\-().+]+$/;
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
 * 3 = other matches (name, city, mall, phone)
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
  
  // For phone matching, we need 3+ digits
  const phoneQuery = isPhoneLikeQuery(query);
  const canMatchPhone = includePhoneMatches && phoneQuery.isPhoneLike && !isZeroOnly;
  
  const results: RankedLocation<T>[] = [];
  
  for (const location of locations) {
    const storeNum = location.storeNumber?.toLowerCase() || '';
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
    
    // Within tier 1 (exact matches), apply tie-break:
    // 1. Raw exact match first
    // 2. Then by normalized length (shorter = more specific)
    // 3. Then by raw string lexicographic
    // 4. Then by id
    if (a.tier === 1) {
      if (a.rawExact && !b.rawExact) return -1;
      if (b.rawExact && !a.rawExact) return 1;
      
      const normA = normalizeStoreNumber(a.location.storeNumber);
      const normB = normalizeStoreNumber(b.location.storeNumber);
      if (normA.length !== normB.length) return normA.length - normB.length;
    }
    
    // Within tier 2 (prefix matches), sort by store number
    // to get 120, 121, 125 in order
    const snA = a.location.storeNumber || '';
    const snB = b.location.storeNumber || '';
    const cmp = snA.localeCompare(snB);
    if (cmp !== 0) return cmp;
    
    // Final deterministic tie-break: document id
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

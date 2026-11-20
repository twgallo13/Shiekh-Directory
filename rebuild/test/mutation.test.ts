/**
 * Helper Unit Tests for storeNumber.ts
 * 
 * These are unit-level assertions on the pure helper functions, NOT route-level
 * mutation tests. The real mutation testing is done in searchRoutes.test.ts
 * which calls the actual route handlers with a fake Firestore.
 * 
 * These tests verify:
 * - Tier assignment (exact vs prefix vs substring)
 * - Single-digit query handling (no tier 3)
 * - Tie-break ordering (raw exact → shorter → lexicographic)
 * - Zero-only query behavior
 * - Store number normalization
 * - Query validation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  normalizeStoreNumber,
  isStoreNumberQuery,
  isSingleDigitStoreQuery,
  rankLocationsForStoreQuery,
  RankableLocation,
} from '../server/utils/storeNumber.js';

function makeLoc(storeNumber: string): RankableLocation {
  return { id: `loc-${storeNumber}`, storeNumber, name: `Store ${storeNumber}`, city: 'Test City' };
}

describe('Helper Unit Tests (storeNumber.ts)', () => {
  it('M1: q=12 → 012 is tier 1 (exact), not tier 2', () => {
    const locs = [
      makeLoc('012'),   // Should be tier 1 (exact)
      makeLoc('121'),   // Should be tier 2 (prefix)
      makeLoc('500'),   // Should not match
    ];
    const result = rankLocationsForStoreQuery('12', locs);
    const numbers = result.map(r => r.location.storeNumber);
    
    // 012 should come before 121
    assert.ok(numbers.indexOf('012') < numbers.indexOf('121'), '012 should be tier 1 (exact), before tier 2');
    assert.ok(numbers.includes('012'), 'Should include 012');
    assert.ok(numbers.includes('121'), 'Should include 121');
    assert.ok(!numbers.includes('500'), 'Should not include 500');
  });

  it('M2: q=7 (single-digit) excludes substring matches 307, 317', () => {
    const locs = [
      makeLoc('7'),     // tier 1 exact
      makeLoc('07'),    // tier 1 exact (normalized)
      makeLoc('71'),    // tier 2 prefix
      makeLoc('307'),   // tier 3 substring - should be excluded for single-digit
      makeLoc('317'),   // tier 3 substring - should be excluded for single-digit
    ];
    const result = rankLocationsForStoreQuery('7', locs);
    const numbers = result.map(r => r.location.storeNumber);
    
    assert.ok(numbers.includes('7'), 'Should include exact 7');
    assert.ok(numbers.includes('07'), 'Should include exact 07');
    assert.ok(numbers.includes('71'), 'Should include prefix 71');
    assert.ok(!numbers.includes('307'), 'Should NOT include substring 307');
    assert.ok(!numbers.includes('317'), 'Should NOT include substring 317');
  });

  it('M3: q=12 orders tier 2 by normalized length: 121 before 1200', () => {
    const locs = [
      makeLoc('1200'),  // tier 2 prefix, longer
      makeLoc('121'),   // tier 2 prefix, shorter
      makeLoc('12'),    // tier 1 exact
    ];
    const result = rankLocationsForStoreQuery('12', locs);
    const numbers = result.map(r => r.location.storeNumber);
    
    const idx121 = numbers.indexOf('121');
    const idx1200 = numbers.indexOf('1200');
    assert.ok(idx121 < idx1200, '121 should come before 1200 (shorter normalized length)');
  });

  it('M4: Tie-break for exact: raw exact first, then shorter raw (7 < 07 < 007)', () => {
    const locs = [
      makeLoc('007'),   // tier 1 exact (normalized matches)
      makeLoc('7'),     // tier 1 exact AND raw exact
      makeLoc('07'),    // tier 1 exact (normalized matches)
    ];
    const result = rankLocationsForStoreQuery('7', locs);
    const numbers = result.map(r => r.location.storeNumber);
    
    // Order should be: 7 (raw exact), 07 (shorter), 007 (longest)
    assert.deepStrictEqual(numbers, ['7', '07', '007'], 'Tie-break order: raw exact, then shorter raw');
  });

  it('M5: q=0 and q=00 return empty unless store "00" exists', () => {
    const locs = [
      makeLoc('10'),
      makeLoc('100'),
      makeLoc('20'),
    ];
    
    const result0 = rankLocationsForStoreQuery('0', locs);
    const result00 = rankLocationsForStoreQuery('00', locs);
    
    // Both should be empty since there's no store "00"
    assert.strictEqual(result0.length, 0, 'q=0 should return empty');
    assert.strictEqual(result00.length, 0, 'q=00 should return empty');
  });

  it('M6: Empty storeNumber normalizes to "00"', () => {
    const result = normalizeStoreNumber('');
    assert.strictEqual(result, '00', 'Empty string should normalize to "00"');
  });

  it('M7: 00123 is a valid store query (leading zeros ignored for digit limit)', () => {
    assert.strictEqual(isStoreNumberQuery('00123'), true, '00123 should be valid (123 has 3 significant digits)');
    assert.strictEqual(isStoreNumberQuery('12345'), false, '12345 should be invalid (5 significant digits)');
    assert.strictEqual(isStoreNumberQuery('0012345'), false, '0012345 should be invalid (12345 is 5 digits)');
  });

  it('M8: isSingleDigitStoreQuery correctly identifies single-digit queries', () => {
    assert.strictEqual(isSingleDigitStoreQuery('7'), true, '"7" is single-digit');
    assert.strictEqual(isSingleDigitStoreQuery('07'), true, '"07" is single-digit');
    assert.strictEqual(isSingleDigitStoreQuery('007'), true, '"007" is single-digit');
    assert.strictEqual(isSingleDigitStoreQuery('#7'), true, '"#7" is single-digit');
    assert.strictEqual(isSingleDigitStoreQuery('12'), false, '"12" is NOT single-digit');
    assert.strictEqual(isSingleDigitStoreQuery('10'), false, '"10" is NOT single-digit');
    assert.strictEqual(isSingleDigitStoreQuery('#'), false, '"#" alone is not valid');
    assert.strictEqual(isSingleDigitStoreQuery('0'), true, '"0" is single-digit');
  });
});

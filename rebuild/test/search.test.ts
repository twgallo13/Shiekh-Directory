/**
 * Search Functionality Tests - REPLACED
 * 
 * The original copied-snippet tests have been replaced by route-level tests
 * in searchRoutes.test.ts that test the actual route handlers with a fake Firestore.
 * 
 * This file is kept for backward compatibility but delegates to the new tests.
 * See searchRoutes.test.ts for comprehensive search ranking tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Search Functionality (deprecated - see searchRoutes.test.ts)', () => {
  it('redirects to searchRoutes.test.ts for comprehensive tests', () => {
    // The real tests are in searchRoutes.test.ts which tests:
    // - Store number ranking with real routes
    // - Leading zero handling (7, 07, 007)
    // - Prefix matching (12 -> 120, 121)
    // - Phone matching rules (3+ digits)
    // - mobilePhone exclusion (M7 privacy fix)
    // - Limit-after-sort behavior
    // - Non-numeric query ordering
    assert.ok(true, 'See searchRoutes.test.ts for comprehensive search tests');
  });
});

console.log('Search tests loaded (see searchRoutes.test.ts for full tests)');

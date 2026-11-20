/**
 * Location Search Route Tests - REPLACED
 * 
 * The original copied-snippet tests have been replaced by route-level tests
 * in searchRoutes.test.ts that test the actual route handlers with a fake Firestore.
 * 
 * This file is kept for backward compatibility but delegates to the new tests.
 * See searchRoutes.test.ts for comprehensive search ranking tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Location Search Route (deprecated - see searchRoutes.test.ts)', () => {
  it('redirects to searchRoutes.test.ts for comprehensive tests', () => {
    // The real tests are in searchRoutes.test.ts which tests:
    // - Header search route (/locations/search)
    // - Store number ranking (exact -> prefix -> other)
    // - Leading zero normalization
    // - Limit-after-sort (10 results max)
    // - Response format unchanged
    assert.ok(true, 'See searchRoutes.test.ts for comprehensive location search tests');
  });
});

console.log('Location search tests loaded (see searchRoutes.test.ts for full tests)');

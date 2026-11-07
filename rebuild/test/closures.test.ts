import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { seedTestUsers, seedTestLocation } from './testHelpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function fetchApi(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    headers: {
      'Authorization': 'Bearer test-token-admin',
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
}

describe('Closures API', () => {
  let testLocationId: string;

  before(async () => {
    await seedTestUsers();
    testLocationId = await seedTestLocation({
      storeNumber: '997',
      name: 'Closures Test Store',
      kind: 'store',
      lifecycle: 'active',
    });
  });

  describe('POST /api/app/edit/locations/:id/closures', () => {
    it('creates a same-day closure with reason code', async () => {
      const response = await fetchApi(`/api/app/edit/locations/${testLocationId}/closures`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'AC failure',
          reasonCode: 'ac_hvac',
          type: 'same_day',
        }),
      });

      assert.strictEqual(response.status, 200);
      const { data } = await response.json();
      assert.ok(data.id, 'Should return closure ID');
      assert.strictEqual(data.reason, 'AC failure');
      assert.strictEqual(data.reasonCode, 'ac_hvac');
      assert.strictEqual(data.type, 'same_day');
      assert.strictEqual(data.status, 'active');
      assert.ok(data.endsAt, 'Same-day closure should have endsAt set to local midnight');
    });

    it('requires note for "other" reason code', async () => {
      const response = await fetchApi(`/api/app/edit/locations/${testLocationId}/closures`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Something else',
          reasonCode: 'other',
        }),
      });

      assert.strictEqual(response.status, 400);
      const { error } = await response.json();
      assert.strictEqual(error.code, 'note_required');
    });

    it('accepts "other" reason code with note', async () => {
      const response = await fetchApi(`/api/app/edit/locations/${testLocationId}/closures`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Something else',
          reasonCode: 'other',
          reasonNote: 'Detailed explanation for other closure',
        }),
      });

      assert.strictEqual(response.status, 200);
      const { data } = await response.json();
      assert.strictEqual(data.reasonCode, 'other');
      assert.strictEqual(data.reasonNote, 'Detailed explanation for other closure');
    });

    it('requires next review date for unknown_end closures', async () => {
      const response = await fetchApi(`/api/app/edit/locations/${testLocationId}/closures`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Long-term renovation',
          type: 'unknown_end',
        }),
      });

      assert.strictEqual(response.status, 400);
      const { error } = await response.json();
      assert.strictEqual(error.code, 'review_date_required');
    });
  });

  describe('POST /api/app/edit/locations/:locationId/closures/:closureId/renew', () => {
    it('renews a same-day closure', async () => {
      // Create a closure first
      const createResp = await fetchApi(`/api/app/edit/locations/${testLocationId}/closures`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Staffing issue',
          reasonCode: 'staffing',
          type: 'same_day',
        }),
      });
      assert.strictEqual(createResp.status, 200, 'Create should succeed');
      const { data: created } = await createResp.json();

      // Renew it
      const renewResp = await fetchApi(`/api/app/edit/locations/${testLocationId}/closures/${created.id}/renew`, {
        method: 'POST',
      });

      assert.strictEqual(renewResp.status, 200);
      const { data } = await renewResp.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.newEndsAt);
    });
  });
});

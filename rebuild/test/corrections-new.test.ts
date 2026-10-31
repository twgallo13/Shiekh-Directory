import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { seedTestUsers, seedTestLocation } from './testHelpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function fetchApi(path: string, token: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
}

describe('Corrections API - New Features', () => {
  let testLocationId: string;
  const viewerToken = 'test-token-viewer';
  const adminToken = 'test-token-admin';

  before(async () => {
    await seedTestUsers();
    testLocationId = await seedTestLocation({
      storeNumber: '998',
      name: 'Corrections Test Store',
      kind: 'store',
      lifecycle: 'active',
    });
  });

  describe('POST /api/app/corrections (Report a Problem)', () => {
    it('allows Viewer to submit a correction request', async () => {
      const response = await fetchApi('/api/app/corrections', viewerToken, {
        method: 'POST',
        body: JSON.stringify({
          locationId: testLocationId,
          category: 'phone',
          proposedNote: 'The phone number is wrong',
        }),
      });

      assert.strictEqual(response.status, 201);
      const { data } = await response.json();
      assert.ok(data.id, 'Should return correction ID');
      assert.strictEqual(data.category, 'phone');
      assert.strictEqual(data.status, 'pending');
      assert.strictEqual(data.proposedNote, 'The phone number is wrong');
    });

    it('requires category', async () => {
      const response = await fetchApi('/api/app/corrections', viewerToken, {
        method: 'POST',
        body: JSON.stringify({
          locationId: testLocationId,
        }),
      });

      assert.strictEqual(response.status, 400);
      const { error } = await response.json();
      assert.strictEqual(error.code, 'category_required');
    });

    it('validates category values', async () => {
      const response = await fetchApi('/api/app/corrections', viewerToken, {
        method: 'POST',
        body: JSON.stringify({
          locationId: testLocationId,
          category: 'invalid-category',
        }),
      });

      assert.strictEqual(response.status, 400);
      const { error } = await response.json();
      assert.strictEqual(error.code, 'invalid_category');
    });

    it('supports all valid categories', async () => {
      const categories = ['address', 'suite', 'directions', 'phone', 'hours', 'manager', 'other'];
      
      for (const category of categories) {
        const response = await fetchApi('/api/app/corrections', viewerToken, {
          method: 'POST',
          body: JSON.stringify({
            locationId: testLocationId,
            category,
          }),
        });

        assert.strictEqual(response.status, 201, `Category ${category} should be valid`);
      }
    });
  });

  describe('POST /api/app/corrections/:id/cancel', () => {
    it('allows user to cancel their own pending request', async () => {
      // Create a request
      const createResp = await fetchApi('/api/app/corrections', viewerToken, {
        method: 'POST',
        body: JSON.stringify({
          locationId: testLocationId,
          category: 'address',
          proposedNote: 'Cancel test',
        }),
      });
      assert.strictEqual(createResp.status, 201, 'Create should succeed');
      const { data: created } = await createResp.json();

      // Cancel it
      const cancelResp = await fetchApi(`/api/app/corrections/${created.id}/cancel`, viewerToken, {
        method: 'POST',
      });

      assert.strictEqual(cancelResp.status, 200);
      const { data } = await cancelResp.json();
      assert.strictEqual(data.success, true);
    });

    it('prevents canceling someone else\'s request', async () => {
      // Create a request as viewer
      const createResp = await fetchApi('/api/app/corrections', viewerToken, {
        method: 'POST',
        body: JSON.stringify({
          locationId: testLocationId,
          category: 'hours',
          proposedNote: 'Someone else cancel test',
        }),
      });
      assert.strictEqual(createResp.status, 201, 'Create should succeed');
      const { data: created } = await createResp.json();

      // Try to cancel as admin (different user)
      const cancelResp = await fetchApi(`/api/app/corrections/${created.id}/cancel`, adminToken, {
        method: 'POST',
      });

      assert.strictEqual(cancelResp.status, 403);
      const { error } = await cancelResp.json();
      assert.strictEqual(error.code, 'forbidden');
    });
  });

  describe('GET /api/app/corrections?myRequests=true', () => {
    it('returns only the user\'s own requests', async () => {
      const response = await fetchApi('/api/app/corrections?status=pending&myRequests=true', viewerToken);

      assert.strictEqual(response.status, 200);
      const { data } = await response.json();
      assert.ok(Array.isArray(data), 'Should return array');
      // All returned requests should be from the viewer
      for (const correction of data) {
        assert.strictEqual(correction.submittedByEmail, 'viewer@test.com');
      }
    });
  });
});

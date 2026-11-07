import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { seedTestUsers, seedTestLocation, getTestDb } from './testHelpers';

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

describe('UI Auth Integration Tests', () => {
  let testLocationId: string;
  const adminToken = 'test-token-admin';
  const viewerToken = 'test-token-viewer';

  before(async () => {
    await seedTestUsers();
    testLocationId = await seedTestLocation({
      storeNumber: '990',
      name: 'UI Auth Test Store',
      kind: 'store',
      lifecycle: 'active',
    });
  });

  describe('ClosuresBoard API - requires auth', () => {
    it('returns locations with closures when authenticated', async () => {
      const response = await fetchApi('/api/app/locations?lifecycle=active', adminToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();
      assert.ok(Array.isArray(data), 'Should return array of locations');
    });

    it('returns 401 when not authenticated', async () => {
      const response = await fetch(`${API_BASE}/api/app/locations?lifecycle=active`);
      assert.strictEqual(response.status, 401);
    });

    it('returns districts when authenticated', async () => {
      const response = await fetchApi('/api/app/districts', adminToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();
      assert.ok(Array.isArray(data), 'Should return array of districts');
    });
  });

  describe('Corrections API (My Requests, Report Problem) - requires auth', () => {
    it('creates correction when authenticated', async () => {
      const response = await fetchApi('/api/app/corrections', viewerToken, {
        method: 'POST',
        body: JSON.stringify({
          locationId: testLocationId,
          category: 'phone',
          proposedNote: 'UI auth test correction',
        }),
      });
      assert.strictEqual(response.status, 201);
      const { data } = await response.json();
      assert.ok(data.id, 'Should return correction ID');
    });

    it('returns 401 when creating correction without auth', async () => {
      const response = await fetch(`${API_BASE}/api/app/corrections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: testLocationId,
          category: 'phone',
        }),
      });
      assert.strictEqual(response.status, 401);
    });

    it('lists corrections (my requests) when authenticated', async () => {
      const response = await fetchApi('/api/app/corrections?status=pending&myRequests=true', viewerToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();
      assert.ok(Array.isArray(data), 'Should return array');
    });

    it('returns 401 when listing corrections without auth', async () => {
      const response = await fetch(`${API_BASE}/api/app/corrections?status=pending&myRequests=true`);
      assert.strictEqual(response.status, 401);
    });
  });

  describe('Hours Templates API - requires auth', () => {
    let testTemplateId: string;

    it('lists templates when authenticated', async () => {
      const response = await fetchApi('/api/app/hours-templates', adminToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();
      assert.ok(Array.isArray(data), 'Should return array');
    });

    it('returns 401 when listing templates without auth', async () => {
      const response = await fetch(`${API_BASE}/api/app/hours-templates`);
      assert.strictEqual(response.status, 401);
    });

    it('creates template when authenticated as Admin', async () => {
      const response = await fetchApi('/api/app/hours-templates', adminToken, {
        method: 'POST',
        body: JSON.stringify({
          name: 'UI Auth Test Template',
          hours: {
            monday: { closed: false, intervals: [{ open: '09:00', close: '21:00' }] },
            tuesday: { closed: false, intervals: [{ open: '09:00', close: '21:00' }] },
            wednesday: { closed: false, intervals: [{ open: '09:00', close: '21:00' }] },
            thursday: { closed: false, intervals: [{ open: '09:00', close: '21:00' }] },
            friday: { closed: false, intervals: [{ open: '09:00', close: '21:00' }] },
            saturday: { closed: false, intervals: [{ open: '10:00', close: '20:00' }] },
            sunday: { closed: true, intervals: [] },
          },
        }),
      });
      assert.strictEqual(response.status, 201);
      const { data } = await response.json();
      assert.ok(data.id, 'Should return template ID');
      testTemplateId = data.id;
    });

    it('returns 401 when creating template without auth', async () => {
      const response = await fetch(`${API_BASE}/api/app/hours-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'No Auth Template',
          hours: {},
        }),
      });
      assert.strictEqual(response.status, 401);
    });

    after(async () => {
      // Cleanup: archive the test template
      if (testTemplateId) {
        await fetchApi(`/api/app/hours-templates/${testTemplateId}/archive`, adminToken, {
          method: 'POST',
        });
      }
    });
  });

  describe('Closures API - requires auth', () => {
    let testClosureId: string;

    it('creates same-day closure when authenticated', async () => {
      // First, update the test location to have a timezone
      const db = getTestDb();
      await db.collection('locations').doc(testLocationId).update({
        timeZone: 'America/Los_Angeles',
      });

      const response = await fetchApi(`/api/app/edit/locations/${testLocationId}/closures`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'UI Auth Test Closure',
          reasonCode: 'maintenance',
          type: 'same_day',
        }),
      });
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();
      assert.ok(data.id, 'Should return closure ID');
      testClosureId = data.id;
    });

    it('returns 401 when creating closure without auth', async () => {
      const response = await fetch(`${API_BASE}/api/app/edit/locations/${testLocationId}/closures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'No Auth Closure',
        }),
      });
      assert.strictEqual(response.status, 401);
    });

    it('renews closure when authenticated', async () => {
      if (!testClosureId) return;
      const response = await fetchApi(`/api/app/edit/locations/${testLocationId}/closures/${testClosureId}/renew`, adminToken, {
        method: 'POST',
      });
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();
      assert.strictEqual(data.success, true);
    });

    it('ends closure when authenticated', async () => {
      if (!testClosureId) return;
      const response = await fetchApi(`/api/app/edit/locations/${testLocationId}/closures/${testClosureId}/end`, adminToken, {
        method: 'POST',
      });
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();
      assert.strictEqual(data.success, true);
    });
  });

  describe('Closure fail-closed safety', () => {
    let noTzLocationId: string;

    before(async () => {
      // Create a location without timezone
      noTzLocationId = await seedTestLocation({
        storeNumber: '991',
        name: 'No TZ Test Store',
        kind: 'store',
        lifecycle: 'active',
      });
      // Remove timezone
      const db = getTestDb();
      await db.collection('locations').doc(noTzLocationId).update({
        timeZone: null,
      });
    });

    it('rejects same-day closure for location without timezone', async () => {
      const response = await fetchApi(`/api/app/edit/locations/${noTzLocationId}/closures`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Should fail',
          type: 'same_day',
        }),
      });
      assert.strictEqual(response.status, 400);
      const { error } = await response.json();
      assert.strictEqual(error.code, 'missing_timezone');
    });

    it('allows multi-day closure for location without timezone', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const response = await fetchApi(`/api/app/edit/locations/${noTzLocationId}/closures`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Multi-day closure',
          type: 'multi_day',
          endsAt: tomorrow.toISOString(),
        }),
      });
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();
      assert.ok(data.id, 'Should create multi-day closure');
      
      // Cleanup
      await fetchApi(`/api/app/edit/locations/${noTzLocationId}/closures/${data.id}/end`, adminToken, {
        method: 'POST',
      });
    });
  });

  describe('Closure renew extends to next day', () => {
    let renewTestLocationId: string;
    let renewTestClosureId: string;

    before(async () => {
      renewTestLocationId = await seedTestLocation({
        storeNumber: '992',
        name: 'Renew Test Store',
        kind: 'store',
        lifecycle: 'active',
      });
      // Set timezone
      const db = getTestDb();
      await db.collection('locations').doc(renewTestLocationId).update({
        timeZone: 'America/Los_Angeles',
      });
      
      // Create a closure
      const response = await fetchApi(`/api/app/edit/locations/${renewTestLocationId}/closures`, adminToken, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Renew test',
          reasonCode: 'maintenance',
          type: 'same_day',
        }),
      });
      const { data } = await response.json();
      renewTestClosureId = data.id;
    });

    it('renew extends expiry to next day after current expiry', async () => {
      // Get current closure
      const db = getTestDb();
      const closureDoc = await db.collection(`locations/${renewTestLocationId}/closures`).doc(renewTestClosureId).get();
      const originalEndsAt = closureDoc.data()?.endsAt;
      assert.ok(originalEndsAt, 'Should have original endsAt');
      
      // Renew
      const response = await fetchApi(`/api/app/edit/locations/${renewTestLocationId}/closures/${renewTestClosureId}/renew`, adminToken, {
        method: 'POST',
      });
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();
      
      // Check that new endsAt is after original
      const newEndsAt = data.newEndsAt;
      assert.ok(newEndsAt, 'Should return newEndsAt');
      assert.ok(new Date(newEndsAt) > new Date(originalEndsAt), 'New endsAt should be after original');
    });
  });
});

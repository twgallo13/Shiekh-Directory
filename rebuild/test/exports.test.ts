import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'shiekh-directory-rebuild-placeholder';

function getTestDb() {
  if (getApps().length === 0) {
    initializeApp({ projectId: PROJECT_ID });
  }
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

async function seedTestUsers(): Promise<void> {
  const db = getTestDb();
  const users = [
    { id: 'admin', email: 'admin@test.com', displayName: 'Test Admin', role: 'Admin', status: 'active', version: 1 },
    { id: 'viewer', email: 'viewer@test.com', displayName: 'Test Viewer', role: 'Viewer', status: 'active', version: 1 },
    { id: 'steward', email: 'steward@test.com', displayName: 'Test Steward', role: 'Steward', status: 'active', version: 1 },
    { id: 'leader', email: 'leader@test.com', displayName: 'Test Leader', role: 'Leader', status: 'active', version: 1 },
  ];

  for (const user of users) {
    await db.collection('users').doc(user.id).set({
      ...user,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}

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

describe('Export API', () => {
  before(async () => {
    await seedTestUsers();
  });

  describe('POST /api/app/exports/locations/prepare', () => {
    it('requires authentication', async () => {
      const res = await fetch(`${API_BASE}/api/app/exports/locations/prepare`, {
        method: 'POST',
      });
      assert.strictEqual(res.status, 401, 'should return 401 without auth');
    });

    it('prepares export and returns token', async () => {
      const res = await fetchApi('/api/app/exports/locations/prepare', {
        method: 'POST',
      });
      assert.strictEqual(res.status, 200, 'should return 200');

      const body = await res.json();
      assert.ok(body.token, 'should return token');
      assert.ok(body.metadata, 'should return metadata');
      assert.ok(typeof body.metadata.locationCount === 'number', 'should have location count');
      assert.ok(body.metadata.generatedAt, 'should have generatedAt');
      assert.ok(body.metadata.expiresAt, 'should have expiresAt');
      assert.ok(body.metadata.filename, 'should have filename');
    });
  });

  describe('GET /api/app/exports/locations/:token/csv', () => {
    it('returns CSV for valid token', async () => {
      const prepareRes = await fetchApi('/api/app/exports/locations/prepare', {
        method: 'POST',
      });
      const { token } = await prepareRes.json();

      const res = await fetchApi(`/api/app/exports/locations/${token}/csv`);
      assert.strictEqual(res.status, 200, 'should return 200');

      const contentType = res.headers.get('content-type');
      assert.ok(contentType?.includes('text/csv'), 'should return CSV content type');

      const csv = await res.text();
      assert.ok(csv.includes('StoreNumber'), 'CSV should have StoreNumber column');
      assert.ok(csv.includes('StoreName'), 'CSV should have StoreName column');
      assert.ok(csv.includes('StoreManager'), 'CSV should have StoreManager column');
    });

    it('returns 410 for invalid token', async () => {
      const res = await fetchApi('/api/app/exports/locations/invalid-token/csv');
      assert.strictEqual(res.status, 410, 'should return 410 for invalid token');
    });
  });

  describe('GET /api/app/exports/locations/:token/pdf-data', () => {
    it('returns PDF data for valid token', async () => {
      const prepareRes = await fetchApi('/api/app/exports/locations/prepare', {
        method: 'POST',
      });
      const { token } = await prepareRes.json();

      const res = await fetchApi(`/api/app/exports/locations/${token}/pdf-data`);
      assert.strictEqual(res.status, 200, 'should return 200');

      const body = await res.json();
      assert.ok(body.generatedAt, 'should have generatedAt');
      assert.ok(typeof body.locationCount === 'number', 'should have locationCount');
      assert.ok(typeof body.canViewMobilePhones === 'boolean', 'should have canViewMobilePhones');
      assert.ok(Array.isArray(body.districts), 'should have districts array');
    });
  });

  describe('Contact Visibility Rules', () => {
    it('shows mobile phones for admin', async () => {
      const prepareRes = await fetch(`${API_BASE}/api/app/exports/locations/prepare`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-token-admin',
          'Content-Type': 'application/json',
        },
      });
      const { token } = await prepareRes.json();

      const res = await fetch(`${API_BASE}/api/app/exports/locations/${token}/pdf-data`, {
        headers: {
          'Authorization': 'Bearer test-token-admin',
        },
      });
      const body = await res.json();
      assert.strictEqual(body.canViewMobilePhones, true, 'admin should see mobile phones');
    });

    it('hides mobile phones for viewer', async () => {
      const prepareRes = await fetch(`${API_BASE}/api/app/exports/locations/prepare`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-token-viewer',
          'Content-Type': 'application/json',
        },
      });
      const { token } = await prepareRes.json();

      const res = await fetch(`${API_BASE}/api/app/exports/locations/${token}/pdf-data`, {
        headers: {
          'Authorization': 'Bearer test-token-viewer',
        },
      });
      const body = await res.json();
      assert.strictEqual(body.canViewMobilePhones, false, 'viewer should not see mobile phones');
    });
  });
});

describe('CSV Format', () => {
  before(async () => {
    await seedTestUsers();
  });

  it('includes required columns matching legacy format', async () => {
    const prepareRes = await fetchApi('/api/app/exports/locations/prepare', {
      method: 'POST',
    });
    const { token } = await prepareRes.json();

    const res = await fetchApi(`/api/app/exports/locations/${token}/csv`);
    const csv = await res.text();
    const headers = csv.split('\r\n')[0];

    const requiredColumns = [
      'StoreNumber',
      'StoreName',
      'Type',
      'Address',
      'City',
      'State',
      'ZipCode',
      'Phone',
      'RegionId',
      'RegionName',
      'DistrictId',
      'DistrictName',
      'StoreManager',
      'DistrictManager',
      'AssistantStoreManagers',
      'OperationalStatus',
    ];

    for (const col of requiredColumns) {
      assert.ok(headers.includes(col), `CSV should include ${col} column`);
    }
  });

  it('preserves store number leading zeros', async () => {
    const prepareRes = await fetchApi('/api/app/exports/locations/prepare', {
      method: 'POST',
    });
    const { token } = await prepareRes.json();

    const res = await fetchApi(`/api/app/exports/locations/${token}/csv`);
    const csv = await res.text();

    if (csv.includes('007')) {
      assert.ok(!csv.includes(',7,'), 'store number 007 should not become 7');
    }
  });
});

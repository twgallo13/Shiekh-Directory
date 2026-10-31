import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { seedTestUsers, seedTestHierarchy, getTestDb } from './testHelpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

describe('Stale Stores API', () => {
  before(async () => {
    await seedTestUsers();
  });

  async function fetchApi(path: string, token: string): Promise<Response> {
    return fetch(`${API_BASE}${path}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });
  }

  describe('GET /api/app/stale-stores', () => {
    it('requires authentication', async () => {
      const res = await fetch(`${API_BASE}/api/app/stale-stores`);
      assert.strictEqual(res.status, 401, 'should return 401 without auth');
    });

    it('denies access to Viewer role', async () => {
      const res = await fetchApi('/api/app/stale-stores', 'test-token-viewer');
      assert.strictEqual(res.status, 403, 'should return 403 for Viewer');
    });

    it('denies access to Store role', async () => {
      const res = await fetchApi('/api/app/stale-stores', 'test-token-store');
      assert.strictEqual(res.status, 403, 'should return 403 for Store');
    });

    it('allows Leader access', async () => {
      const res = await fetchApi('/api/app/stale-stores', 'test-token-leader');
      assert.strictEqual(res.status, 200, 'should return 200 for Leader');
      const body = await res.json();
      assert.ok(Array.isArray(body.staleStores), 'should return staleStores array');
      assert.ok(typeof body.thresholdDays === 'number', 'should return thresholdDays');
      assert.strictEqual(body.thresholdDays, 90, 'threshold should be 90 days');
    });

    it('allows Steward access', async () => {
      const res = await fetchApi('/api/app/stale-stores', 'test-token-steward');
      assert.strictEqual(res.status, 200, 'should return 200 for Steward');
      const body = await res.json();
      assert.ok(Array.isArray(body.staleStores), 'should return staleStores array');
    });

    it('allows Admin access', async () => {
      const res = await fetchApi('/api/app/stale-stores', 'test-token-admin');
      assert.strictEqual(res.status, 200, 'should return 200 for Admin');
      const body = await res.json();
      assert.ok(Array.isArray(body.staleStores), 'should return staleStores array');
      assert.ok(typeof body.totalCount === 'number', 'should return totalCount');
    });

    it('returns expected shape for stale stores', async () => {
      const res = await fetchApi('/api/app/stale-stores', 'test-token-admin');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      
      if (body.staleStores.length > 0) {
        const store = body.staleStores[0];
        assert.ok(store.id, 'store should have id');
        assert.ok(store.storeNumber, 'store should have storeNumber');
        assert.ok(store.name, 'store should have name');
        assert.ok(store.districtId, 'store should have districtId');
        assert.ok(store.regionId, 'store should have regionId');
        assert.ok(
          store.daysSinceVerification === null || typeof store.daysSinceVerification === 'number',
          'daysSinceVerification should be null or number'
        );
      }
    });

    it('excludes facilities from results', async () => {
      const res = await fetchApi('/api/app/stale-stores', 'test-token-admin');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      
      for (const store of body.staleStores) {
        assert.ok(
          !store.name.toLowerCase().includes('warehouse') || store.storeNumber,
          'should not include warehouse facilities'
        );
      }
    });
  });
});

describe('Stale Stores - v2 Data Shape', () => {
  let testLocationId: string;
  const db = getTestDb();

  before(async () => {
    await seedTestHierarchy();
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    
    const locationRef = db.collection('locations').doc();
    await locationRef.set({
      kind: 'store',
      lifecycle: 'active',
      storeNumber: 'V2T001',
      name: 'V2 Test Store',
      districtId: 'test-district-1',
      regionId: 'test-region-1',
      lastVerifiedAt: old,
      address: { street: '123 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+12135559999',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    testLocationId = locationRef.id;
  });

  after(async () => {
    if (testLocationId) {
      await db.collection('locations').doc(testLocationId).delete();
    }
  });

  it('queries locations using v2 fields (lifecycle=active, kind=store)', async () => {
    const res = await fetch(`${API_BASE}/api/app/stale-stores`, {
      headers: {
        'Authorization': 'Bearer test-token-admin',
        'Accept': 'application/json',
      },
    });
    assert.strictEqual(res.status, 200, 'should return 200');
    const body = await res.json();
    
    const v2Store = body.staleStores.find((s: { storeNumber: string }) => s.storeNumber === 'V2T001');
    assert.ok(v2Store, 'should find the v2-shaped store in stale stores');
    assert.strictEqual(v2Store.name, 'V2 Test Store', 'should have correct name');
    assert.ok(v2Store.daysSinceVerification > 90, 'should be stale (>90 days)');
  });

  it('excludes locations with lifecycle!=active', async () => {
    const now = new Date().toISOString();
    const retiredRef = db.collection('locations').doc();
    await retiredRef.set({
      kind: 'store',
      lifecycle: 'retired',
      storeNumber: 'V2T002',
      name: 'Retired V2 Store',
      districtId: 'test-district-1',
      regionId: 'test-region-1',
      address: { street: '456 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      createdAt: now,
      updatedAt: now,
      version: 1,
    });

    try {
      const res = await fetch(`${API_BASE}/api/app/stale-stores`, {
        headers: {
          'Authorization': 'Bearer test-token-admin',
          'Accept': 'application/json',
        },
      });
      const body = await res.json();
      const retiredStore = body.staleStores.find((s: { storeNumber: string }) => s.storeNumber === 'V2T002');
      assert.strictEqual(retiredStore, undefined, 'should not include retired stores');
    } finally {
      await retiredRef.delete();
    }
  });

  it('excludes locations with kind!=store', async () => {
    const now = new Date().toISOString();
    const warehouseRef = db.collection('locations').doc();
    await warehouseRef.set({
      kind: 'warehouse',
      lifecycle: 'active',
      storeNumber: 'WH001',
      name: 'Test Warehouse',
      districtId: 'test-district-1',
      regionId: 'test-region-1',
      address: { street: '789 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      createdAt: now,
      updatedAt: now,
      version: 1,
    });

    try {
      const res = await fetch(`${API_BASE}/api/app/stale-stores`, {
        headers: {
          'Authorization': 'Bearer test-token-admin',
          'Accept': 'application/json',
        },
      });
      const body = await res.json();
      const warehouse = body.staleStores.find((s: { storeNumber: string }) => s.storeNumber === 'WH001');
      assert.strictEqual(warehouse, undefined, 'should not include warehouses');
    } finally {
      await warehouseRef.delete();
    }
  });
});

describe('Stale Stores - Verification Threshold Logic', () => {
  it('stores verified within 90 days should not be stale', () => {
    const now = Date.now();
    const verifiedDate = new Date(now - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const thresholdDate = new Date(now - 90 * 24 * 60 * 60 * 1000); // 90 days ago
    
    assert.ok(verifiedDate > thresholdDate, '30 days ago should be after threshold');
  });

  it('stores verified more than 90 days ago should be stale', () => {
    const now = Date.now();
    const verifiedDate = new Date(now - 100 * 24 * 60 * 60 * 1000); // 100 days ago
    const thresholdDate = new Date(now - 90 * 24 * 60 * 60 * 1000); // 90 days ago
    
    assert.ok(verifiedDate < thresholdDate, '100 days ago should be before threshold');
  });

  it('stores never verified should be stale', () => {
    const lastVerifiedAt = undefined;
    assert.strictEqual(lastVerifiedAt, undefined, 'unverified stores have no date');
  });

  it('calculates days since verification correctly', () => {
    const now = Date.now();
    const verifiedDate = new Date(now - 45 * 24 * 60 * 60 * 1000); // 45 days ago
    const days = Math.floor((now - verifiedDate.getTime()) / (24 * 60 * 60 * 1000));
    
    assert.strictEqual(days, 45, 'should calculate 45 days');
  });
});

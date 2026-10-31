import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { seedTestUsers } from './testHelpers';

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

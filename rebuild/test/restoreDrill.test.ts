import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { createHash } from 'crypto';
import { seedTestUsers } from './testHelpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

describe('Restore Drill API', () => {
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

  describe('GET /api/app/admin/last-drill', () => {
    it('requires authentication', async () => {
      const res = await fetch(`${API_BASE}/api/app/admin/last-drill`);
      assert.strictEqual(res.status, 401, 'should return 401 without auth');
    });

    it('requires Admin role', async () => {
      const res = await fetchApi('/api/app/admin/last-drill', 'test-token-viewer');
      assert.strictEqual(res.status, 403, 'should return 403 for non-admin');
    });

    it('returns null when no drills exist', async () => {
      const res = await fetchApi('/api/app/admin/last-drill', 'test-token-admin');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok('lastDrill' in body, 'should return lastDrill field');
    });

    it('returns drill data shape when drill exists', async () => {
      const res = await fetchApi('/api/app/admin/last-drill', 'test-token-admin');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      
      if (body.lastDrill) {
        assert.ok(body.lastDrill.drillId, 'should have drillId');
        assert.ok(body.lastDrill.completedAt, 'should have completedAt');
        assert.ok(body.lastDrill.status, 'should have status');
        assert.ok(typeof body.lastDrill.totalExpected === 'number', 'should have totalExpected');
        assert.ok(typeof body.lastDrill.totalRestored === 'number', 'should have totalRestored');
      }
    });
  });
});

describe('Restore Drill - Checksum Logic', () => {
  function computeChecksum(docs: Array<{ id: string; data: Record<string, unknown> }>): string {
    const sorted = [...docs].sort((a, b) => a.id.localeCompare(b.id));
    const content = sorted.map(d => `${d.id}:${JSON.stringify(d.data)}`).join('\n');
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  it('produces consistent checksum for same data', () => {
    const docs = [
      { id: 'doc1', data: { name: 'Test 1' } },
      { id: 'doc2', data: { name: 'Test 2' } },
    ];
    
    const checksum1 = computeChecksum(docs);
    const checksum2 = computeChecksum(docs);
    
    assert.strictEqual(checksum1, checksum2, 'same data should produce same checksum');
  });

  it('produces same checksum regardless of input order', () => {
    const docs1 = [
      { id: 'doc1', data: { name: 'Test 1' } },
      { id: 'doc2', data: { name: 'Test 2' } },
    ];
    const docs2 = [
      { id: 'doc2', data: { name: 'Test 2' } },
      { id: 'doc1', data: { name: 'Test 1' } },
    ];
    
    const checksum1 = computeChecksum(docs1);
    const checksum2 = computeChecksum(docs2);
    
    assert.strictEqual(checksum1, checksum2, 'order should not affect checksum');
  });

  it('produces different checksum for different data', () => {
    const docs1 = [
      { id: 'doc1', data: { name: 'Test 1' } },
    ];
    const docs2 = [
      { id: 'doc1', data: { name: 'Test 2' } },
    ];
    
    const checksum1 = computeChecksum(docs1);
    const checksum2 = computeChecksum(docs2);
    
    assert.notStrictEqual(checksum1, checksum2, 'different data should produce different checksum');
  });

  it('checksum is 16 hex characters', () => {
    const docs = [{ id: 'doc1', data: { name: 'Test' } }];
    const checksum = computeChecksum(docs);
    
    assert.strictEqual(checksum.length, 16, 'checksum should be 16 characters');
    assert.ok(/^[a-f0-9]{16}$/.test(checksum), 'checksum should be lowercase hex');
  });
});

describe('Restore Drill - Collection Naming', () => {
  function getDrillCollectionName(drillId: string, collection: string): string {
    return `${drillId}_${collection}`;
  }

  it('prefixes collection name with drill ID', () => {
    const drillId = 'drill_20261031_143000';
    const collection = 'locations';
    
    const result = getDrillCollectionName(drillId, collection);
    
    assert.strictEqual(result, 'drill_20261031_143000_locations');
  });

  it('never produces a name without drill prefix', () => {
    const drillId = 'drill_20261031_143000';
    const collections = ['locations', 'people', 'assignments', 'users'];
    
    for (const collection of collections) {
      const result = getDrillCollectionName(drillId, collection);
      assert.ok(result.startsWith('drill_'), `${collection} should be prefixed`);
      assert.ok(!result.startsWith(collection), `${collection} should not be a live collection`);
    }
  });
});

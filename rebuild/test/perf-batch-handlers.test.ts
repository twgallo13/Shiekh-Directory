import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { getTestDb, seedTestUsers } from './testHelpers';

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

describe('Performance Batch Handler Regression Tests', () => {
  const adminToken = 'test-token-admin';
  const viewerToken = 'test-token-viewer';
  const stewardToken = 'test-token-steward';
  const db = getTestDb();
  const testSuffix = `perf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  before(async () => {
    await seedTestUsers();
  });

  after(async () => {
    const collections = ['people', 'assignments', 'locations', 'districts', 'regions'];
    for (const coll of collections) {
      const snap = await db.collection(coll).get();
      for (const doc of snap.docs) {
        if (doc.id.includes(testSuffix)) {
          await doc.ref.delete();
        }
      }
    }
  });

  describe('Item #1: People assignment - first doc only, check if active', () => {
    let personWithInactiveFirst: string;
    let personWithActiveFirst: string;

    before(async () => {
      const now = new Date().toISOString();
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

      const locationRef = db.collection('locations').doc(`loc_item1_${testSuffix}`);
      await locationRef.set({
        storeNumber: '901',
        name: 'Item1 Test Store',
        kind: 'store',
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      personWithInactiveFirst = `person_inactive_first_${testSuffix}`;
      await db.collection('people').doc(personWithInactiveFirst).set({
        fullName: `Inactive First Person ${testSuffix}`,
        workEmail: `inactive_first_${testSuffix}@test.com`,
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      // Doc ID "1_expired_" sorts BEFORE "2_active_" so expired is first in Firestore order
      await db.collection('assignments').doc(`1_expired_${testSuffix}`).set({
        personId: personWithInactiveFirst,
        scopeType: 'location',
        scopeId: locationRef.id,
        role: 'SM',
        slot: 'primary',
        startDate: yesterday,
        endDate: yesterday,
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('assignments').doc(`2_active_${testSuffix}`).set({
        personId: personWithInactiveFirst,
        scopeType: 'location',
        scopeId: locationRef.id,
        role: 'ASM',
        slot: 'primary',
        startDate: yesterday,
        endDate: nextWeek,
        createdAt: now,
        updatedAt: now,
      });

      personWithActiveFirst = `person_active_first_${testSuffix}`;
      await db.collection('people').doc(personWithActiveFirst).set({
        fullName: `Active First Person ${testSuffix}`,
        workEmail: `active_first_${testSuffix}@test.com`,
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('assignments').doc(`assign_active_${testSuffix}`).set({
        personId: personWithActiveFirst,
        scopeType: 'location',
        scopeId: locationRef.id,
        role: 'Leader',
        slot: 'primary',
        startDate: yesterday,
        endDate: nextWeek,
        createdAt: now,
        updatedAt: now,
      });
    });

    it('person with inactive first assignment has no primaryRole/Scope', async () => {
      const response = await fetchApi('/api/app/people?lifecycle=active', adminToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();

      const person = data.find((p: { fullName: string }) => p.fullName === `Inactive First Person ${testSuffix}`);
      assert.ok(person, `Should find Inactive First Person ${testSuffix}`);
      assert.strictEqual(person.primaryRole, undefined, 'primaryRole should be undefined when first assignment is inactive');
      assert.strictEqual(person.primaryScopeName, undefined, 'primaryScopeName should be undefined when first assignment is inactive');
    });

    it('person with active first assignment has primaryRole/Scope', async () => {
      const response = await fetchApi('/api/app/people?lifecycle=active', adminToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();

      const person = data.find((p: { fullName: string }) => p.fullName === `Active First Person ${testSuffix}`);
      assert.ok(person, `Should find Active First Person ${testSuffix}`);
      assert.strictEqual(person.primaryRole, 'Leader', 'primaryRole should be Leader');
      assert.ok(person.primaryScopeName, 'primaryScopeName should be set');
    });
  });

  describe('Item #2: Locations SM assignment - first returned wins', () => {
    let testLocationId: string;

    before(async () => {
      const now = new Date().toISOString();
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

      testLocationId = `loc_item2_${testSuffix}`;
      await db.collection('locations').doc(testLocationId).set({
        storeNumber: '902',
        name: 'Item2 Test Store',
        kind: 'store',
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      const person1Ref = db.collection('people').doc(`sm1_${testSuffix}`);
      await person1Ref.set({
        fullName: 'First SM',
        workEmail: `sm1_${testSuffix}@test.com`,
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      const person2Ref = db.collection('people').doc(`sm2_${testSuffix}`);
      await person2Ref.set({
        fullName: 'Second SM',
        workEmail: `sm2_${testSuffix}@test.com`,
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('assignments').doc(`sm_assign_1_${testSuffix}`).set({
        personId: person1Ref.id,
        scopeType: 'location',
        scopeId: testLocationId,
        role: 'SM',
        slot: 'primary',
        startDate: yesterday,
        endDate: nextWeek,
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('assignments').doc(`sm_assign_2_${testSuffix}`).set({
        personId: person2Ref.id,
        scopeType: 'location',
        scopeId: testLocationId,
        role: 'SM',
        slot: 'primary',
        startDate: yesterday,
        endDate: nextWeek,
        createdAt: now,
        updatedAt: now,
      });
    });

    it('returns first SM assignment per location, not last', async () => {
      const response = await fetchApi('/api/app/locations?kind=store', adminToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();

      const location = data.find((l: { storeNumber: string }) => l.storeNumber === '902');
      assert.ok(location, 'Should find Item2 Test Store');
      assert.ok(location.smName, 'smName should be set');
      assert.strictEqual(location.smName, 'First SM', 'Should show First SM (first in Firestore order), not Second SM');
    });
  });

  describe('Item #3: Scope name collision - same ID across types', () => {
    const collisionId = `collision_${testSuffix}`;

    before(async () => {
      const now = new Date().toISOString();
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

      await db.collection('locations').doc(collisionId).set({
        storeNumber: '903',
        name: 'Collision Location',
        kind: 'store',
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('districts').doc(collisionId).set({
        code: 'COLL',
        name: 'Collision District',
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('regions').doc(collisionId).set({
        code: 'COLL',
        name: 'Collision Region',
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      const locPersonRef = db.collection('people').doc(`loc_person_${testSuffix}`);
      await locPersonRef.set({
        fullName: `Location Scope Person ${testSuffix}`,
        workEmail: `loc_person_${testSuffix}@test.com`,
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      const distPersonRef = db.collection('people').doc(`dist_person_${testSuffix}`);
      await distPersonRef.set({
        fullName: `District Scope Person ${testSuffix}`,
        workEmail: `dist_person_${testSuffix}@test.com`,
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      const regPersonRef = db.collection('people').doc(`reg_person_${testSuffix}`);
      await regPersonRef.set({
        fullName: `Region Scope Person ${testSuffix}`,
        workEmail: `reg_person_${testSuffix}@test.com`,
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('assignments').doc(`loc_assign_${testSuffix}`).set({
        personId: locPersonRef.id,
        scopeType: 'location',
        scopeId: collisionId,
        role: 'SM',
        slot: 'primary',
        startDate: yesterday,
        endDate: nextWeek,
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('assignments').doc(`dist_assign_${testSuffix}`).set({
        personId: distPersonRef.id,
        scopeType: 'district',
        scopeId: collisionId,
        role: 'DM',
        slot: 'primary',
        startDate: yesterday,
        endDate: nextWeek,
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('assignments').doc(`reg_assign_${testSuffix}`).set({
        personId: regPersonRef.id,
        scopeType: 'region',
        scopeId: collisionId,
        role: 'RVP',
        slot: 'primary',
        startDate: yesterday,
        endDate: nextWeek,
        createdAt: now,
        updatedAt: now,
      });
    });

    it('location scope shows location name format', async () => {
      const response = await fetchApi('/api/app/people?lifecycle=active', adminToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();

      const person = data.find((p: { fullName: string }) => p.fullName === `Location Scope Person ${testSuffix}`);
      assert.ok(person, `Should find Location Scope Person ${testSuffix}`);
      assert.strictEqual(person.primaryScopeName, '#903 Collision Location', 'Should show location format');
    });

    it('district scope shows district name', async () => {
      const response = await fetchApi('/api/app/people?lifecycle=active', adminToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();

      const person = data.find((p: { fullName: string }) => p.fullName === `District Scope Person ${testSuffix}`);
      assert.ok(person, `Should find District Scope Person ${testSuffix}`);
      assert.strictEqual(person.primaryScopeName, 'Collision District', 'Should show district name');
    });

    it('region scope shows region name', async () => {
      const response = await fetchApi('/api/app/people?lifecycle=active', adminToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();

      const person = data.find((p: { fullName: string }) => p.fullName === `Region Scope Person ${testSuffix}`);
      assert.ok(person, `Should find Region Scope Person ${testSuffix}`);
      assert.strictEqual(person.primaryScopeName, 'Collision Region', 'Should show region name');
    });
  });

  describe('Item #3b: Missing doc and empty name behavior', () => {
    before(async () => {
      const now = new Date().toISOString();
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

      const missingPersonRef = db.collection('people').doc(`missing_scope_person_${testSuffix}`);
      await missingPersonRef.set({
        fullName: `Missing Scope Person ${testSuffix}`,
        workEmail: `missing_scope_${testSuffix}@test.com`,
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('assignments').doc(`missing_assign_${testSuffix}`).set({
        personId: missingPersonRef.id,
        scopeType: 'location',
        scopeId: `nonexistent_${testSuffix}`,
        role: 'SM',
        slot: 'primary',
        startDate: yesterday,
        endDate: nextWeek,
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('districts').doc(`empty_name_${testSuffix}`).set({
        code: 'EMPTY',
        name: '',
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      const emptyPersonRef = db.collection('people').doc(`empty_name_person_${testSuffix}`);
      await emptyPersonRef.set({
        fullName: `Empty Name Scope Person ${testSuffix}`,
        workEmail: `empty_name_${testSuffix}@test.com`,
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      await db.collection('assignments').doc(`empty_assign_${testSuffix}`).set({
        personId: emptyPersonRef.id,
        scopeType: 'district',
        scopeId: `empty_name_${testSuffix}`,
        role: 'DM',
        slot: 'primary',
        startDate: yesterday,
        endDate: nextWeek,
        createdAt: now,
        updatedAt: now,
      });
    });

    it('missing scope doc falls back to scopeId', async () => {
      const response = await fetchApi('/api/app/people?lifecycle=active', adminToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();

      const person = data.find((p: { fullName: string }) => p.fullName === `Missing Scope Person ${testSuffix}`);
      assert.ok(person, `Should find Missing Scope Person ${testSuffix}`);
      assert.strictEqual(person.primaryScopeName, `nonexistent_${testSuffix}`, 'Should fall back to scopeId');
    });

    it('empty name district preserves empty string (not falls back to scopeId)', async () => {
      const response = await fetchApi('/api/app/people?lifecycle=active', adminToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();

      const person = data.find((p: { fullName: string }) => p.fullName === `Empty Name Scope Person ${testSuffix}`);
      assert.ok(person, `Should find Empty Name Scope Person ${testSuffix}`);
      assert.strictEqual(person.primaryScopeName, '', 'Should preserve empty string, not fall back to scopeId');
    });
  });

  describe('Batch boundary tests', () => {
    describe('Zero/one/boundary people counts', () => {
      it('returns empty array for zero matching people', async () => {
        const response = await fetchApi('/api/app/people?lifecycle=active&search=nonexistent_xyz_123', adminToken);
        assert.strictEqual(response.status, 200);
        const { data } = await response.json();
        assert.ok(Array.isArray(data));
        assert.strictEqual(data.length, 0);
      });

      it('handles single person', async () => {
        const response = await fetchApi(`/api/app/people?lifecycle=active&search=Location Scope Person`, adminToken);
        assert.strictEqual(response.status, 200);
        const { data } = await response.json();
        assert.ok(Array.isArray(data));
      });
    });

    describe('Zero/one/boundary locations counts', () => {
      it('returns empty array for zero matching locations', async () => {
        const response = await fetchApi('/api/app/locations?kind=store&districtId=nonexistent_district_xyz', adminToken);
        assert.strictEqual(response.status, 200);
        const { data } = await response.json();
        assert.ok(Array.isArray(data));
        assert.strictEqual(data.length, 0);
      });
    });
  });

  describe('Role access tests', () => {
    it('Admin can list people', async () => {
      const response = await fetchApi('/api/app/people', adminToken);
      assert.strictEqual(response.status, 200);
    });

    it('Viewer can list people', async () => {
      const response = await fetchApi('/api/app/people', viewerToken);
      assert.strictEqual(response.status, 200);
    });

    it('Steward can list people', async () => {
      const response = await fetchApi('/api/app/people', stewardToken);
      assert.strictEqual(response.status, 200);
    });

    it('unauthenticated returns 401 for people', async () => {
      const response = await fetch(`${API_BASE}/api/app/people`);
      assert.strictEqual(response.status, 401);
    });

    it('Admin can list locations', async () => {
      const response = await fetchApi('/api/app/locations', adminToken);
      assert.strictEqual(response.status, 200);
    });

    it('unauthenticated returns 401 for locations', async () => {
      const response = await fetch(`${API_BASE}/api/app/locations`);
      assert.strictEqual(response.status, 401);
    });
  });

  describe('Response shape and order', () => {
    it('people response has expected fields', async () => {
      const response = await fetchApi('/api/app/people?lifecycle=active', adminToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();

      if (data.length > 0) {
        const person = data[0];
        assert.ok('id' in person, 'Should have id');
        assert.ok('fullName' in person, 'Should have fullName');
        assert.ok('lifecycle' in person, 'Should have lifecycle');
      }
    });

    it('locations response has expected fields', async () => {
      const response = await fetchApi('/api/app/locations?kind=store', adminToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();

      if (data.length > 0) {
        const location = data[0];
        assert.ok('id' in location, 'Should have id');
        assert.ok('storeNumber' in location, 'Should have storeNumber');
        assert.ok('name' in location, 'Should have name');
        assert.ok('statusNow' in location, 'Should have statusNow');
      }
    });

    it('locations are sorted by storeNumber', async () => {
      const response = await fetchApi('/api/app/locations?kind=store', adminToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();

      if (data.length > 1) {
        for (let i = 1; i < data.length; i++) {
          const prevNum = parseInt(data[i - 1].storeNumber, 10) || 0;
          const currNum = parseInt(data[i].storeNumber, 10) || 0;
          assert.ok(prevNum <= currNum, `Locations should be sorted by storeNumber: ${prevNum} <= ${currNum}`);
        }
      }
    });
  });

  describe('Operating status with closures and exceptions', () => {
    let closureLocationId: string;

    before(async () => {
      const now = new Date().toISOString();
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      closureLocationId = `loc_closure_${testSuffix}`;
      await db.collection('locations').doc(closureLocationId).set({
        storeNumber: '904',
        name: 'Closure Test Store',
        kind: 'store',
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
      });

      await db.collection(`locations/${closureLocationId}/closures`).doc(`closure_${testSuffix}`).set({
        reason: 'renovation',
        status: 'active',
        startsAt: today,
        endsAt: tomorrow,
        createdAt: now,
        updatedAt: now,
      });
    });

    it('location with active closure includes activeClosure in response', async () => {
      const response = await fetchApi('/api/app/locations?kind=store', adminToken);
      assert.strictEqual(response.status, 200);
      const { data } = await response.json();

      const location = data.find((l: { storeNumber: string }) => l.storeNumber === '904');
      assert.ok(location, 'Should find Closure Test Store');
      assert.ok(location.activeClosure, 'Should have activeClosure');
      assert.strictEqual(location.activeClosure.reason, 'renovation');
    });
  });
});

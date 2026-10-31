import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { getTestDb, seedTestUsers, seedTestHierarchy } from './testHelpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

describe('v2 Regression Tests - Store Number Formats', () => {
  const db = getTestDb();
  let testLocationId: string;

  before(async () => {
    await seedTestHierarchy();
    const now = new Date().toISOString();
    
    const locationRef = db.collection('locations').doc();
    await locationRef.set({
      kind: 'store',
      lifecycle: 'active',
      storeNumber: '07',
      name: 'v2 Format Store Seven',
      districtId: 'test-district-1',
      regionId: 'test-region-1',
      sharedInboxEmail: 'store7@shiekhshoes.com',
      address: { street: '123 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+12135557777',
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

  it('finds store with 2-digit format (07) via store7@shiekhshoes.com', async () => {
    const res = await fetch(`${API_BASE}/api/store-auth/send-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'store7@shiekhshoes.com' }),
    });
    
    assert.strictEqual(res.status, 200, 'should find store with 2-digit format');
    const body = await res.json();
    assert.ok(body.success, 'should succeed');
    assert.strictEqual(body.email, 'store7@shiekhshoes.com');
  });
});

describe('v2 Regression Tests - Location Doc ID', () => {
  const db = getTestDb();
  let testLocationId: string;

  before(async () => {
    await seedTestUsers();
    await seedTestHierarchy();
    const now = new Date().toISOString();
    
    const locationRef = db.collection('locations').doc();
    await locationRef.set({
      kind: 'store',
      lifecycle: 'active',
      storeNumber: '08',
      name: 'v2 Doc ID Test Store',
      districtId: 'test-district-1',
      regionId: 'test-region-1',
      sharedInboxEmail: 'store8@shiekh.test',
      address: { street: '456 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+12135558888',
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
      const tokensSnap = await db.collection('storeAuthTokens')
        .where('storeNumber', '==', '08')
        .get();
      for (const doc of tokensSnap.docs) {
        await doc.ref.delete();
      }
      const testTokensSnap = await db.collection('testTokens')
        .where('storeNumber', '==', '08')
        .get();
      for (const doc of testTokensSnap.docs) {
        await doc.ref.delete();
      }
    }
  });

  it('verification request stores locationId from doc.id', async () => {
    const res = await fetch(`${API_BASE}/api/app/verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-admin',
      },
      body: JSON.stringify({ locationId: testLocationId }),
    });

    assert.strictEqual(res.status, 201, 'should create verification request');
    const body = await res.json();
    
    assert.ok(body.data, 'should have data');
    assert.strictEqual(body.data.locationId, testLocationId, 'should have correct locationId');
    
    const tokensSnap = await db.collection('storeAuthTokens')
      .where('storeNumber', '==', '08')
      .limit(1)
      .get();
    
    assert.ok(!tokensSnap.empty, 'should have created auth tokens');
    const tokenData = tokensSnap.docs[0].data();
    assert.strictEqual(tokenData.locationId, testLocationId, 'token should have locationId from doc.id');
  });
});

describe('v2 Regression Tests - Lifecycle and Kind Fields', () => {
  const db = getTestDb();
  let activeStoreId: string;
  let retiredStoreId: string;
  let warehouseId: string;

  before(async () => {
    await seedTestUsers();
    await seedTestHierarchy();
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    
    const activeRef = db.collection('locations').doc();
    await activeRef.set({
      kind: 'store',
      lifecycle: 'active',
      storeNumber: 'R01',
      name: 'Active Regression Store',
      districtId: 'test-district-1',
      regionId: 'test-region-1',
      lastVerifiedAt: old,
      address: { street: '100 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    activeStoreId = activeRef.id;
    
    const retiredRef = db.collection('locations').doc();
    await retiredRef.set({
      kind: 'store',
      lifecycle: 'retired',
      storeNumber: 'R02',
      name: 'Retired Regression Store',
      districtId: 'test-district-1',
      regionId: 'test-region-1',
      address: { street: '200 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    retiredStoreId = retiredRef.id;
    
    const warehouseRef = db.collection('locations').doc();
    await warehouseRef.set({
      kind: 'warehouse',
      lifecycle: 'active',
      storeNumber: 'WH01',
      name: 'Active Warehouse',
      districtId: 'test-district-1',
      regionId: 'test-region-1',
      address: { street: '300 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    warehouseId = warehouseRef.id;
  });

  after(async () => {
    if (activeStoreId) await db.collection('locations').doc(activeStoreId).delete();
    if (retiredStoreId) await db.collection('locations').doc(retiredStoreId).delete();
    if (warehouseId) await db.collection('locations').doc(warehouseId).delete();
  });

  it('stale stores includes active stores with kind=store', async () => {
    const res = await fetch(`${API_BASE}/api/app/stale-stores`, {
      headers: { 'Authorization': 'Bearer test-token-admin' },
    });
    
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    
    const activeStore = body.staleStores.find((s: { storeNumber: string }) => s.storeNumber === 'R01');
    assert.ok(activeStore, 'should include active store');
  });

  it('stale stores excludes retired stores', async () => {
    const res = await fetch(`${API_BASE}/api/app/stale-stores`, {
      headers: { 'Authorization': 'Bearer test-token-admin' },
    });
    
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    
    const retiredStore = body.staleStores.find((s: { storeNumber: string }) => s.storeNumber === 'R02');
    assert.strictEqual(retiredStore, undefined, 'should not include retired stores');
  });

  it('stale stores excludes warehouses (kind!=store)', async () => {
    const res = await fetch(`${API_BASE}/api/app/stale-stores`, {
      headers: { 'Authorization': 'Bearer test-token-admin' },
    });
    
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    
    const warehouse = body.staleStores.find((s: { storeNumber: string }) => s.storeNumber === 'WH01');
    assert.strictEqual(warehouse, undefined, 'should not include warehouses');
  });
});

describe('v2 Regression Tests - Store Sign-in Number Formats', () => {
  const db = getTestDb();
  const testStores: { id: string; storeNumber: string }[] = [];

  before(async () => {
    await seedTestHierarchy();
    const now = new Date().toISOString();
    
    const formats = [
      { storeNumber: '09', email: 'store9@shiekhshoes.com' },
      { storeNumber: '10', email: 'store10@shiekhshoes.com' },
      { storeNumber: '123', email: 'store123@shiekhshoes.com' },
    ];
    
    for (const format of formats) {
      const ref = db.collection('locations').doc();
      await ref.set({
        kind: 'store',
        lifecycle: 'active',
        storeNumber: format.storeNumber,
        name: `Store ${format.storeNumber}`,
        districtId: 'test-district-1',
        regionId: 'test-region-1',
        sharedInboxEmail: format.email,
        address: { street: '123 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
        timeZone: 'America/Los_Angeles',
        createdAt: now,
        updatedAt: now,
        version: 1,
      });
      testStores.push({ id: ref.id, storeNumber: format.storeNumber });
    }
  });

  after(async () => {
    for (const store of testStores) {
      await db.collection('locations').doc(store.id).delete();
    }
  });

  it('finds store 09 via store9@shiekhshoes.com (2-digit padded)', async () => {
    const res = await fetch(`${API_BASE}/api/store-auth/send-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'store9@shiekhshoes.com' }),
    });
    
    assert.strictEqual(res.status, 200, 'should find store 09');
  });

  it('finds store 10 via store10@shiekhshoes.com (2-digit no padding needed)', async () => {
    const res = await fetch(`${API_BASE}/api/store-auth/send-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'store10@shiekhshoes.com' }),
    });
    
    assert.strictEqual(res.status, 200, 'should find store 10');
  });

  it('finds store 123 via store123@shiekhshoes.com (3-digit)', async () => {
    const res = await fetch(`${API_BASE}/api/store-auth/send-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'store123@shiekhshoes.com' }),
    });
    
    assert.strictEqual(res.status, 200, 'should find store 123');
  });
});

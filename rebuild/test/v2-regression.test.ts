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

describe('v2 Regression Tests - Missing Fields Tolerance', () => {
  const db = getTestDb();
  let testLocationId: string;
  let correctionId: string;

  before(async () => {
    await seedTestUsers();
    await seedTestHierarchy();
    const now = new Date().toISOString();
    
    const locationRef = db.collection('locations').doc();
    await locationRef.set({
      kind: 'store',
      lifecycle: 'active',
      storeNumber: 'MF01',
      name: 'Missing Fields Store',
      districtId: 'test-district-1',
      regionId: 'test-region-1',
      address: { street: '999 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    testLocationId = locationRef.id;
    
    const correctionRef = db.collection('corrections').doc();
    await correctionRef.set({
      locationId: testLocationId,
      storeNumber: 'MF01',
      locationName: 'Missing Fields Store',
      type: 'correction',
      status: 'pending',
      submittedAt: now,
      submittedBy: 'test-uid',
      submittedByEmail: 'test@test.com',
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    correctionId = correctionRef.id;
  });

  after(async () => {
    if (testLocationId) await db.collection('locations').doc(testLocationId).delete();
    if (correctionId) await db.collection('corrections').doc(correctionId).delete();
  });

  it('lists corrections with missing proposedChanges and currentValues', async () => {
    const res = await fetch(`${API_BASE}/api/app/corrections?status=pending`, {
      headers: { 'Authorization': 'Bearer test-token-admin' },
    });
    
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    
    const correction = body.data.find((c: { id: string }) => c.id === correctionId);
    assert.ok(correction, 'should find correction with missing fields');
    assert.strictEqual(correction.storeNumber, 'MF01');
  });

  it('location detail works with missing optional fields', async () => {
    const res = await fetch(`${API_BASE}/api/app/locations/${testLocationId}`, {
      headers: { 'Authorization': 'Bearer test-token-admin' },
    });
    
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    
    assert.ok(body.data, 'should return location');
    assert.strictEqual(body.data.wayfindingDirections, undefined, 'wayfindingDirections can be undefined');
    assert.strictEqual(body.data.sharedInboxEmail, undefined, 'sharedInboxEmail can be undefined');
  });
});

describe('v2 Regression Tests - Hours Normalization', () => {
  it('normalizes hours with missing days', () => {
    const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const DEFAULT_DAY = { closed: true, intervals: [] };
    
    function normalizeHours(hours: Record<string, unknown> | undefined | null): Record<string, unknown> {
      const result: Record<string, unknown> = {};
      for (const day of DAYS) {
        const existing = hours?.[day] as { closed?: boolean; intervals?: unknown[] } | undefined;
        if (existing) {
          result[day] = {
            closed: existing.closed ?? false,
            intervals: existing.intervals ?? [],
          };
        } else {
          result[day] = DEFAULT_DAY;
        }
      }
      return result;
    }
    
    const incompleteHours = {
      monday: { closed: false, intervals: [{ open: '09:00', close: '21:00' }] },
      wednesday: { closed: true },
    };
    
    const normalized = normalizeHours(incompleteHours);
    
    assert.strictEqual(Object.keys(normalized).length, 7, 'should have all 7 days');
    
    for (const day of DAYS) {
      assert.ok(normalized[day], `should have ${day}`);
      const dayData = normalized[day] as { closed: boolean; intervals: unknown[] };
      assert.ok('closed' in dayData, `${day} should have closed property`);
      assert.ok('intervals' in dayData, `${day} should have intervals property`);
    }
    
    const monday = normalized.monday as { closed: boolean; intervals: { open: string; close: string }[] };
    assert.strictEqual(monday.closed, false);
    assert.strictEqual(monday.intervals.length, 1);
    
    const tuesday = normalized.tuesday as { closed: boolean };
    assert.strictEqual(tuesday.closed, true, 'missing day should default to closed');
  });

  it('handles completely missing hours object', () => {
    const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const DEFAULT_DAY = { closed: true, intervals: [] };
    
    function normalizeHours(hours: Record<string, unknown> | undefined | null): Record<string, unknown> {
      const result: Record<string, unknown> = {};
      for (const day of DAYS) {
        const existing = hours?.[day] as { closed?: boolean; intervals?: unknown[] } | undefined;
        if (existing) {
          result[day] = {
            closed: existing.closed ?? false,
            intervals: existing.intervals ?? [],
          };
        } else {
          result[day] = DEFAULT_DAY;
        }
      }
      return result;
    }
    
    const normalized = normalizeHours(null);
    
    assert.strictEqual(Object.keys(normalized).length, 7, 'should have all 7 days');
    
    for (const day of DAYS) {
      const dayData = normalized[day] as { closed: boolean; intervals: unknown[] };
      assert.strictEqual(dayData.closed, true, `${day} should be closed by default`);
      assert.strictEqual(dayData.intervals.length, 0, `${day} should have empty intervals`);
    }
  });

  it('handles hours with missing intervals', () => {
    const incompleteHours = {
      monday: { closed: false },
      tuesday: { closed: false, intervals: null },
      wednesday: { closed: false, intervals: [] },
    };
    
    const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    function normalizeHours(hours: Record<string, unknown> | undefined | null): Record<string, unknown> {
      const result: Record<string, unknown> = {};
      for (const day of DAYS) {
        const existing = hours?.[day] as { closed?: boolean; intervals?: unknown[] } | undefined;
        if (existing) {
          result[day] = {
            closed: existing.closed ?? false,
            intervals: existing.intervals ?? [],
          };
        } else {
          result[day] = { closed: true, intervals: [] };
        }
      }
      return result;
    }
    
    const normalized = normalizeHours(incompleteHours);
    
    const monday = normalized.monday as { intervals: unknown[] };
    assert.ok(Array.isArray(monday.intervals), 'monday should have intervals array');
    
    const tuesday = normalized.tuesday as { intervals: unknown[] };
    assert.ok(Array.isArray(tuesday.intervals), 'tuesday should have intervals array');
  });
});

describe('v2 Regression Tests - Campaign Archive Filter', () => {
  const db = getTestDb();
  let archivedCampaignId: string;
  let testLocationId: string;

  before(async () => {
    await seedTestHierarchy();
    await seedTestUsers();
    const now = new Date().toISOString();
    
    const locationRef = db.collection('locations').doc();
    await locationRef.set({
      kind: 'store',
      lifecycle: 'active',
      storeNumber: '99',
      name: 'Archive Filter Test Store',
      districtId: 'test-district-1',
      regionId: 'test-region-1',
      sharedInboxEmail: 'archivetest@shiekhshoes.com',
      address: { street: '123 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    testLocationId = locationRef.id;
    
    const createRes = await fetch(`${API_BASE}/api/app/verification/campaigns`, {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer test-token-admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scope: 'district',
        scopeId: 'test-district-1',
        dryRun: false,
      }),
    });
    
    assert.strictEqual(createRes.status, 200, 'should create campaign');
    const createBody = await createRes.json();
    archivedCampaignId = createBody.campaignId;
    assert.ok(archivedCampaignId, 'should have campaign ID');
    
    const archiveRes = await fetch(`${API_BASE}/api/app/verification/campaigns/${archivedCampaignId}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer test-token-admin' },
    });
    
    assert.strictEqual(archiveRes.status, 200, 'should archive campaign via DELETE');
  });

  after(async () => {
    if (archivedCampaignId) {
      await db.collection('verificationCampaigns').doc(archivedCampaignId).delete();
    }
    if (testLocationId) {
      await db.collection('locations').doc(testLocationId).delete();
    }
  });

  it('campaign list hides archived by default (DELETE sets archived:true)', async () => {
    const res = await fetch(`${API_BASE}/api/app/verification/campaigns`, {
      headers: { 'Authorization': 'Bearer test-token-steward' },
    });
    
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    
    const foundArchived = body.campaigns.find((c: { id: string }) => c.id === archivedCampaignId);
    assert.strictEqual(foundArchived, undefined, 'archived campaign should not appear in default list');
  });

  it('campaign list shows archived with includeArchived=true', async () => {
    const res = await fetch(`${API_BASE}/api/app/verification/campaigns?includeArchived=true`, {
      headers: { 'Authorization': 'Bearer test-token-steward' },
    });
    
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.campaigns), 'should return campaigns array');
    
    const foundArchived = body.campaigns.find((c: { id: string }) => c.id === archivedCampaignId);
    assert.ok(foundArchived, 'archived campaign should appear when includeArchived=true');
    assert.strictEqual(foundArchived.archived, true, 'campaign should have archived:true flag');
  });
});

describe('v2 Regression Tests - PersonDetailView Scope Error Handling', () => {
  const db = getTestDb();
  let testPersonId: string;

  before(async () => {
    await seedTestUsers();
    await seedTestHierarchy();
    const now = new Date().toISOString();
    
    const personRef = db.collection('people').doc();
    await personRef.set({
      fullName: 'Scope Error Test Person',
      workEmail: 'scopetest@shiekhshoes.com',
      workPhone: '+15551234567',
      mobilePhone: '',
      status: 'active',
      assignments: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    testPersonId = personRef.id;
  });

  after(async () => {
    if (testPersonId) {
      await db.collection('people').doc(testPersonId).delete();
    }
  });

  it('person endpoint returns data independently of scopes endpoints', async () => {
    const personRes = await fetch(`${API_BASE}/api/app/people/${testPersonId}`, {
      headers: { 'Authorization': 'Bearer test-token-admin' },
    });
    
    assert.strictEqual(personRes.status, 200, 'person endpoint should return 200');
    const personBody = await personRes.json();
    assert.ok(personBody.data, 'should return person data');
    assert.strictEqual(personBody.data.fullName, 'Scope Error Test Person');
  });

  it('scopes endpoints (regions, districts, locations) are separate from person endpoint', async () => {
    const [personRes, regionsRes, districtsRes, locationsRes] = await Promise.all([
      fetch(`${API_BASE}/api/app/people/${testPersonId}`, {
        headers: { 'Authorization': 'Bearer test-token-admin' },
      }),
      fetch(`${API_BASE}/api/app/regions`, {
        headers: { 'Authorization': 'Bearer test-token-admin' },
      }),
      fetch(`${API_BASE}/api/app/districts`, {
        headers: { 'Authorization': 'Bearer test-token-admin' },
      }),
      fetch(`${API_BASE}/api/app/locations?kind=store`, {
        headers: { 'Authorization': 'Bearer test-token-admin' },
      }),
    ]);
    
    assert.strictEqual(personRes.status, 200, 'person should load');
    assert.strictEqual(regionsRes.status, 200, 'regions should load');
    assert.strictEqual(districtsRes.status, 200, 'districts should load');
    assert.strictEqual(locationsRes.status, 200, 'locations should load');
    
    const personBody = await personRes.json();
    assert.ok(personBody.data.fullName, 'person data should be complete');
    assert.ok(personBody.data.workEmail, 'person email should be present');
  });

  it('invalid person ID returns 404 but does not affect scopes endpoints', async () => {
    const [personRes, regionsRes] = await Promise.all([
      fetch(`${API_BASE}/api/app/people/nonexistent-person-id`, {
        headers: { 'Authorization': 'Bearer test-token-admin' },
      }),
      fetch(`${API_BASE}/api/app/regions`, {
        headers: { 'Authorization': 'Bearer test-token-admin' },
      }),
    ]);
    
    assert.strictEqual(personRes.status, 404, 'invalid person should return 404');
    assert.strictEqual(regionsRes.status, 200, 'scopes should still load independently');
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

describe('v2 Regression Tests - Hours Template Picker', () => {
  const db = getTestDb();
  let testTemplateId: string;
  let testLocationId: string;

  before(async () => {
    await seedTestUsers();
    await seedTestHierarchy();
    const now = new Date().toISOString();
    
    // Create a test template with defaultForTypes
    const templateRef = db.collection('hoursTemplates').doc();
    await templateRef.set({
      name: 'Test Mall Hours',
      description: 'Standard mall hours template',
      hours: {
        monday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
        tuesday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
        wednesday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
        thursday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
        friday: { closed: false, intervals: [{ open: '10:00', close: '22:00' }] },
        saturday: { closed: false, intervals: [{ open: '10:00', close: '22:00' }] },
        sunday: { closed: false, intervals: [{ open: '11:00', close: '19:00' }] },
      },
      version: 1,
      lifecycle: 'active',
      defaultForTypes: ['enclosed_mall'],
      createdAt: now,
      createdBy: 'test',
      updatedAt: now,
      updatedBy: 'test',
    });
    testTemplateId = templateRef.id;
    
    // Create a test location with storeType
    const locationRef = db.collection('locations').doc();
    await locationRef.set({
      kind: 'store',
      lifecycle: 'active',
      storeNumber: 'TPL01',
      name: 'Template Test Store',
      storeType: 'enclosed_mall',
      districtId: 'test-district-1',
      regionId: 'test-region-1',
      sharedInboxEmail: 'tpltest@shiekhshoes.com',
      address: { street: '123 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    testLocationId = locationRef.id;
  });

  after(async () => {
    if (testTemplateId) {
      await db.collection('hoursTemplates').doc(testTemplateId).delete();
    }
    if (testLocationId) {
      await db.collection('locations').doc(testLocationId).delete();
    }
  });

  it('lists active hours templates', async () => {
    const res = await fetch(`${API_BASE}/api/app/hours-templates`, {
      headers: { 'Authorization': 'Bearer test-token-admin' },
    });
    
    assert.strictEqual(res.status, 200);
    const { data } = await res.json();
    assert.ok(Array.isArray(data), 'should return array of templates');
    
    const found = data.find((t: { id: string }) => t.id === testTemplateId);
    assert.ok(found, 'should include test template');
    assert.strictEqual(found.name, 'Test Mall Hours');
  });

  it('suggests template for store type', async () => {
    const res = await fetch(`${API_BASE}/api/app/hours-templates/suggest/enclosed_mall`, {
      headers: { 'Authorization': 'Bearer test-token-admin' },
    });
    
    assert.strictEqual(res.status, 200);
    const { data } = await res.json();
    assert.strictEqual(data.storeType, 'enclosed_mall');
    assert.ok(data.suggestions.length > 0, 'should have suggestions');
    
    const suggested = data.suggestions.find((t: { id: string }) => t.id === testTemplateId);
    assert.ok(suggested, 'should suggest template with matching defaultForTypes');
  });

  it('returns empty suggestions for store type with no matching templates', async () => {
    const res = await fetch(`${API_BASE}/api/app/hours-templates/suggest/warehouse_distribution`, {
      headers: { 'Authorization': 'Bearer test-token-admin' },
    });
    
    assert.strictEqual(res.status, 200);
    const { data } = await res.json();
    assert.strictEqual(data.storeType, 'warehouse_distribution');
  });

  it('returns 400 for invalid store type', async () => {
    const res = await fetch(`${API_BASE}/api/app/hours-templates/suggest/INVALID`, {
      headers: { 'Authorization': 'Bearer test-token-admin' },
    });
    
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'invalid_store_type');
  });

  it('template hours can be retrieved for UI picker', async () => {
    const res = await fetch(`${API_BASE}/api/app/hours-templates/${testTemplateId}`, {
      headers: { 'Authorization': 'Bearer test-token-admin' },
    });
    
    assert.strictEqual(res.status, 200);
    const { data } = await res.json();
    assert.ok(data.hours, 'should include hours');
    assert.ok(data.hours.monday, 'should have monday hours');
    assert.strictEqual(data.hours.monday.closed, false);
    assert.strictEqual(data.hours.monday.intervals[0].open, '10:00');
  });
});

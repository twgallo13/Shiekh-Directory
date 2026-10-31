/**
 * Tests for Facility handling:
 * 1. Facilities excluded from verification (cannot create requests)
 * 2. Facilities can have region without district
 * 3. Facilities excluded from admin stores list by default
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { seedTestUsers, getTestDb } from './testHelpers';

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

describe('Facility - Verification Exclusion', () => {
  let facilityId: string;

  before(async () => {
    await seedTestUsers();
    const db = getTestDb();
    const now = new Date().toISOString();

    const regionRef = await db.collection('regions').add({
      code: 'FACTEST',
      name: 'Facility Test Region',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    const facilityRef = await db.collection('locations').add({
      storeNumber: 'FAC01',
      name: 'Test Facility',
      kind: 'facility',
      lifecycle: 'active',
      regionId: regionRef.id,
      districtId: '',
      address: { street: '123 Facility St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+15555550001',
      phonePublic: true,
      sharedInboxEmail: 'facility@example.com',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    facilityId = facilityRef.id;
  });

  it('cannot create verification request for facility', async () => {
    const res = await fetchApi('/api/app/verification', {
      method: 'POST',
      body: JSON.stringify({ locationId: facilityId }),
    });

    assert.strictEqual(res.status, 400, 'should return 400');
    const body = await res.json();
    assert.strictEqual(body.error.code, 'facility_excluded', 
      'should return facility_excluded error code');
  });
});

describe('Facility - Region Without District', () => {
  let facilityId: string;
  let newRegionId: string;

  before(async () => {
    await seedTestUsers();
    const db = getTestDb();
    const now = new Date().toISOString();

    const regionRef = await db.collection('regions').add({
      code: 'REGONLY1',
      name: 'Region Only Test 1',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    const newRegionRef = await db.collection('regions').add({
      code: 'REGONLY2',
      name: 'Region Only Test 2',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    newRegionId = newRegionRef.id;

    const facilityRef = await db.collection('locations').add({
      storeNumber: 'FAC02',
      name: 'Region Only Facility',
      kind: 'facility',
      lifecycle: 'active',
      regionId: regionRef.id,
      districtId: '',
      address: { street: '456 Facility St', city: 'Test City', state: 'CA', zip: '90002', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+15555550002',
      phonePublic: true,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    facilityId = facilityRef.id;
  });

  it('can move location to region only (no district)', async () => {
    const res = await fetchApi(`/api/app/hierarchy/locations/${facilityId}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ regionId: newRegionId }),
    });

    assert.strictEqual(res.status, 200, 'should succeed');
    const body = await res.json();
    assert.strictEqual(body.data.regionId, newRegionId, 'regionId should be updated');
    assert.strictEqual(body.data.districtId, '', 'districtId should be empty');
  });

  it('can create location with region only (no district)', async () => {
    const res = await fetchApi('/api/app/hierarchy/locations', {
      method: 'POST',
      body: JSON.stringify({
        storeNumber: 'FAC03',
        name: 'New Region Only Facility',
        kind: 'facility',
        regionId: newRegionId,
        address: { street: '789 Facility St', city: 'Test City', state: 'CA', zip: '90003' },
        timeZone: 'America/Los_Angeles',
        mainPhone: '+15555550003',
      }),
    });

    assert.strictEqual(res.status, 201, 'should succeed');
    const body = await res.json();
    assert.strictEqual(body.data.regionId, newRegionId, 'regionId should be set');
    assert.strictEqual(body.data.districtId, '', 'districtId should be empty');
    assert.strictEqual(body.data.kind, 'facility', 'kind should be facility');
  });
});

describe('Admin Stores List - Filter', () => {
  let facilityId: string;

  before(async () => {
    await seedTestUsers();
    const db = getTestDb();
    const now = new Date().toISOString();

    const regionRef = await db.collection('regions').add({
      code: 'ADMTEST',
      name: 'Admin Test Region',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    const districtRef = await db.collection('districts').add({
      code: 'ADMTESTD',
      name: 'Admin Test District',
      regionId: regionRef.id,
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    await db.collection('locations').add({
      storeNumber: 'ADM01',
      name: 'Admin Test Store',
      kind: 'store',
      lifecycle: 'active',
      regionId: regionRef.id,
      districtId: districtRef.id,
      address: { street: '123 Store St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+15555551001',
      phonePublic: true,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    const facilityRef = await db.collection('locations').add({
      storeNumber: 'ADM02',
      name: 'Admin Test Facility',
      kind: 'facility',
      lifecycle: 'active',
      regionId: regionRef.id,
      districtId: '',
      address: { street: '456 Facility St', city: 'Test City', state: 'CA', zip: '90002', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+15555551002',
      phonePublic: true,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    facilityId = facilityRef.id;
  });

  it('excludes facilities from default stores list', async () => {
    const res = await fetchApi('/api/app/admin/stores');
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    
    const facilityInList = body.stores.find((s: any) => s.id === facilityId);
    assert.strictEqual(facilityInList, undefined, 'facility should not be in default list');
  });

  it('includes facilities with includeAll=true', async () => {
    const res = await fetchApi('/api/app/admin/stores?includeAll=true');
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    
    const facilityInList = body.stores.find((s: any) => s.id === facilityId);
    assert.ok(facilityInList, 'facility should be in list with includeAll=true');
  });
});

console.log('Facility tests loaded');

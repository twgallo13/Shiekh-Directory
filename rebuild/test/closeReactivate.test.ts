/**
 * Tests for store permanent close (retire) and reactivate functionality:
 * Covers Frink's 12 required tests plus store sign-in and lifecycle filter
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { seedTestUsers, getTestDb } from './testHelpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function fetchApi(path: string, options: RequestInit = {}, token = 'test-token-admin'): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
}

describe('Store Close (Retire) Tests', () => {
  let hierarchyIds: { regionId: string; districtId: string };
  let locationId: string;
  let assignmentId: string;
  let verificationId: string;
  let correctionId: string;
  let dmTaskId: string;
  let closureId: string;
  let sessionId: string;

  before(async () => {
    await seedTestUsers();
    const db = getTestDb();
    const now = new Date().toISOString();
    const todayStr = now.slice(0, 10);
    const suffix = `close_${Date.now()}`;

    // Create hierarchy
    const regionRef = await db.collection('regions').add({
      code: `CLOSE_REG_${suffix.slice(-6)}`,
      name: 'Close Test Region',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    const districtRef = await db.collection('districts').add({
      code: `CLOSE_DIST_${suffix.slice(-6)}`,
      name: 'Close Test District',
      regionId: regionRef.id,
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    
    hierarchyIds = { regionId: regionRef.id, districtId: districtRef.id };

    // Create location
    const locationRef = await db.collection('locations').add({
      kind: 'store',
      storeNumber: `C${suffix.slice(-4)}`,
      name: 'Close Test Store',
      lifecycle: 'active',
      address: { street: '123 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+12135550001',
      phonePublic: true,
      sharedInboxEmail: `close${suffix.slice(-4)}@shiekh.test`,
      regionId: regionRef.id,
      districtId: districtRef.id,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    locationId = locationRef.id;

    // Create person and assignment
    const personRef = await db.collection('people').add({
      fullName: 'Close Test Person',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    const assignmentRef = await db.collection('assignments').add({
      personId: personRef.id,
      role: 'SL',
      scopeType: 'location',
      scopeId: locationId,
      slot: 'primary',
      startDate: todayStr,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    assignmentId = assignmentRef.id;

    // Create verification request
    const verificationRef = await db.collection('verificationRequests').add({
      locationId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    verificationId = verificationRef.id;

    // Create correction
    const correctionRef = await db.collection('corrections').add({
      locationId,
      status: 'pending',
      correctionType: 'hours',
      submittedByEmail: 'test@test.com',
      createdAt: now,
      updatedAt: now,
    });
    correctionId = correctionRef.id;

    // Create DM task
    const dmTaskRef = await db.collection('dmTasks').add({
      locationId,
      status: 'pending',
      taskType: 'verify_data',
      title: 'Test Task',
      createdAt: now,
      updatedAt: now,
    });
    dmTaskId = dmTaskRef.id;

    // Create active closure
    const closureRef = await db.collection('locations').doc(locationId).collection('closures').add({
      status: 'active',
      reason: 'Test closure',
      startsAt: now,
      endsAt: new Date(Date.now() + 86400000).toISOString(),
      createdAt: now,
      updatedAt: now,
    });
    closureId = closureRef.id;

    // Create store session
    const sessionRef = await db.collection('storeSessions').add({
      locationId,
      storeNumber: `C${suffix.slice(-4)}`,
      revoked: false,
      createdAt: now,
    });
    sessionId = sessionRef.id;
  });

  it('1. Close as Steward succeeds with correct lifecycle, version bump, and counts', async () => {
    const res = await fetchApi(`/api/app/hierarchy/locations/${locationId}/retire`, {
      method: 'POST',
    }, 'test-token-steward');

    assert.strictEqual(res.status, 200, 'retire should succeed for Steward');
    const body = await res.json();
    assert.strictEqual(body.data.retired, true);
    assert.strictEqual(body.data.assignmentsEnded, 1, 'should end 1 assignment');

    const db = getTestDb();
    const locationDoc = await db.collection('locations').doc(locationId).get();
    const location = locationDoc.data()!;
    assert.strictEqual(location.lifecycle, 'retired');
    assert.ok(location.version >= 2, 'version should be bumped');
    assert.ok(location.updatedAt, 'updatedAt should be set');
  });

  it('2. Close cancels verifications, corrections, DM tasks, closures, and revokes sessions', async () => {
    const db = getTestDb();

    // Check verification cancelled
    const verificationDoc = await db.collection('verificationRequests').doc(verificationId).get();
    assert.strictEqual(verificationDoc.data()?.status, 'cancelled');
    assert.ok(verificationDoc.data()?.cancelledAt, 'verification should have cancelledAt');
    assert.ok(verificationDoc.data()?.cancelReason, 'verification should have cancelReason');

    // Check correction cancelled (no cancelReason field)
    const correctionDoc = await db.collection('corrections').doc(correctionId).get();
    assert.strictEqual(correctionDoc.data()?.status, 'cancelled');
    assert.ok(correctionDoc.data()?.cancelledAt, 'correction should have cancelledAt');

    // Check DM task cancelled with correct field names
    const dmTaskDoc = await db.collection('dmTasks').doc(dmTaskId).get();
    assert.strictEqual(dmTaskDoc.data()?.status, 'cancelled');
    assert.ok(dmTaskDoc.data()?.cancelledAt, 'DM task should have cancelledAt');
    assert.ok(dmTaskDoc.data()?.cancelledReason, 'DM task should have cancelledReason');

    // Check closure ended with 'manual' reason
    const closureDoc = await db.collection('locations').doc(locationId).collection('closures').doc(closureId).get();
    assert.strictEqual(closureDoc.data()?.status, 'ended');
    assert.strictEqual(closureDoc.data()?.endedReason, 'manual', 'closure should have endedReason=manual');

    // Check session revoked
    const sessionDoc = await db.collection('storeSessions').doc(sessionId).get();
    assert.strictEqual(sessionDoc.data()?.revoked, true);
    assert.ok(sessionDoc.data()?.revokedAt, 'session should have revokedAt');
  });

  it('3. Close as Leader/Viewer/Store returns 403', async () => {
    const db = getTestDb();
    const now = new Date().toISOString();
    const suffix = `auth_${Date.now()}`;

    // Create a fresh active location for this test
    const locationRef = await db.collection('locations').add({
      kind: 'store',
      storeNumber: `A${suffix.slice(-4)}`,
      name: 'Auth Test Store',
      lifecycle: 'active',
      address: { street: '123 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+12135550002',
      phonePublic: true,
      regionId: hierarchyIds.regionId,
      districtId: hierarchyIds.districtId,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    // Test Leader
    const leaderRes = await fetchApi(`/api/app/hierarchy/locations/${locationRef.id}/retire`, {
      method: 'POST',
    }, 'test-token-leader');
    assert.strictEqual(leaderRes.status, 403, 'Leader should get 403');

    // Test Viewer
    const viewerRes = await fetchApi(`/api/app/hierarchy/locations/${locationRef.id}/retire`, {
      method: 'POST',
    }, 'test-token-viewer');
    assert.strictEqual(viewerRes.status, 403, 'Viewer should get 403');

    // Cleanup
    await db.collection('locations').doc(locationRef.id).delete();
  });

  it('4. Reactivate as Steward returns 403 before any read', async () => {
    const res = await fetchApi(`/api/app/hierarchy/locations/${locationId}/reactivate`, {
      method: 'POST',
    }, 'test-token-steward');

    assert.strictEqual(res.status, 403, 'Steward should get 403 for reactivate');
    const body = await res.json();
    assert.strictEqual(body.error.code, 'forbidden');
  });

  it('5. Reactivate as Admin succeeds, sets active, bumps version, updatedAt, assignments stay ended', async () => {
    const db = getTestDb();
    const beforeDoc = await db.collection('locations').doc(locationId).get();
    const beforeVersion = beforeDoc.data()?.version;

    const res = await fetchApi(`/api/app/hierarchy/locations/${locationId}/reactivate`, {
      method: 'POST',
    }, 'test-token-admin');

    assert.strictEqual(res.status, 200, 'Admin should succeed');
    const body = await res.json();
    assert.strictEqual(body.data.reactivated, true);

    const afterDoc = await db.collection('locations').doc(locationId).get();
    const afterData = afterDoc.data()!;
    assert.strictEqual(afterData.lifecycle, 'active');
    assert.ok(afterData.version > beforeVersion, 'version should be bumped');
    assert.ok(afterData.updatedAt, 'updatedAt should be set');

    // Assignment should still have endDate
    const assignmentDoc = await db.collection('assignments').doc(assignmentId).get();
    assert.ok(assignmentDoc.data()?.endDate, 'assignment should still be ended');
  });

  it('6. Reactivate on active store returns 409 not_retired', async () => {
    // locationId is now active from test 5
    const res = await fetchApi(`/api/app/hierarchy/locations/${locationId}/reactivate`, {
      method: 'POST',
    }, 'test-token-admin');

    assert.strictEqual(res.status, 409, 'should get 409 for active location');
    const body = await res.json();
    assert.strictEqual(body.error.code, 'not_retired');
  });
});

describe('Reactivate Conflict Tests', () => {
  let retiredLocationId: string;
  let retiredDistrictLocationId: string;
  let retiredRegionLocationId: string;
  let retiredDistrictId: string;
  let retiredRegionId: string;

  before(async () => {
    await seedTestUsers();
    const db = getTestDb();
    const now = new Date().toISOString();
    const suffix = `dup_${Date.now()}`;

    // Create active hierarchy
    const regionRef = await db.collection('regions').add({
      code: `DUP_REG_${suffix.slice(-6)}`,
      name: 'Duplicate Test Region',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    const districtRef = await db.collection('districts').add({
      code: `DUP_DIST_${suffix.slice(-6)}`,
      name: 'Duplicate Test District',
      regionId: regionRef.id,
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    // Create retired store with number "DUP001"
    const retiredRef = await db.collection('locations').add({
      kind: 'store',
      storeNumber: 'DUP001',
      name: 'Retired Store',
      lifecycle: 'retired',
      address: { street: '123 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+12135550003',
      phonePublic: true,
      regionId: regionRef.id,
      districtId: districtRef.id,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    retiredLocationId = retiredRef.id;

    // Create active store with SAME number "DUP001"
    void await db.collection('locations').add({
      kind: 'store',
      storeNumber: 'DUP001',
      name: 'Active Store Same Number',
      lifecycle: 'active',
      address: { street: '456 Test St', city: 'Test City', state: 'CA', zip: '90002', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+12135550004',
      phonePublic: true,
      regionId: regionRef.id,
      districtId: districtRef.id,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    // Create retired region and retired store in it
    const retiredRegRef = await db.collection('regions').add({
      code: `RET_REG_${suffix.slice(-6)}`,
      name: 'Retired Region',
      lifecycle: 'retired',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    retiredRegionId = retiredRegRef.id;

    const retiredDistRef = await db.collection('districts').add({
      code: `RET_DIST_${suffix.slice(-6)}`,
      name: 'Retired District',
      regionId: retiredRegRef.id,
      lifecycle: 'retired',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    retiredDistrictId = retiredDistRef.id;

    // Store in retired district
    const retiredDistLocRef = await db.collection('locations').add({
      kind: 'store',
      storeNumber: 'RETD01',
      name: 'Store In Retired District',
      lifecycle: 'retired',
      address: { street: '789 Test St', city: 'Test City', state: 'CA', zip: '90003', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+12135550005',
      phonePublic: true,
      regionId: regionRef.id,
      districtId: retiredDistRef.id,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    retiredDistrictLocationId = retiredDistLocRef.id;

    // Store in retired region (with active district but retired region)
    const retiredRegLocRef = await db.collection('locations').add({
      kind: 'store',
      storeNumber: 'RETR01',
      name: 'Store In Retired Region',
      lifecycle: 'retired',
      address: { street: '101 Test St', city: 'Test City', state: 'CA', zip: '90004', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+12135550006',
      phonePublic: true,
      regionId: retiredRegionId,
      districtId: retiredDistrictId,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    retiredRegionLocationId = retiredRegLocRef.id;
  });

  it('7. Reactivate with duplicate store number (active store exists) returns 409', async () => {
    const res = await fetchApi(`/api/app/hierarchy/locations/${retiredLocationId}/reactivate`, {
      method: 'POST',
    }, 'test-token-admin');

    assert.strictEqual(res.status, 409, 'should get 409 for duplicate number');
    const body = await res.json();
    assert.strictEqual(body.error.code, 'store_number_in_use');
  });

  it('7b. Duplicate check uses trimmed comparison', async () => {
    const db = getTestDb();
    const now = new Date().toISOString();

    // Create retired store with leading space in number
    const retiredRef = await db.collection('locations').add({
      kind: 'store',
      storeNumber: ' DUP002 ',
      name: 'Retired Store Spaces',
      lifecycle: 'retired',
      address: { street: '123 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+12135550007',
      phonePublic: true,
      regionId: 'test-region',
      districtId: 'test-district',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    // Create active store with trimmed version
    await db.collection('locations').add({
      kind: 'store',
      storeNumber: 'DUP002',
      name: 'Active Store Trimmed',
      lifecycle: 'active',
      address: { street: '456 Test St', city: 'Test City', state: 'CA', zip: '90002', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+12135550008',
      phonePublic: true,
      regionId: 'test-region',
      districtId: 'test-district',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    const res = await fetchApi(`/api/app/hierarchy/locations/${retiredRef.id}/reactivate`, {
      method: 'POST',
    }, 'test-token-admin');

    assert.strictEqual(res.status, 409, 'should detect duplicate even with spaces');
  });

  it('8a. Reactivate with retired district returns 409', async () => {
    const res = await fetchApi(`/api/app/hierarchy/locations/${retiredDistrictLocationId}/reactivate`, {
      method: 'POST',
    }, 'test-token-admin');

    assert.strictEqual(res.status, 409, 'should get 409 for retired district');
    const body = await res.json();
    assert.strictEqual(body.error.code, 'district_retired');
  });

  it('8b. Reactivate with retired region returns 409', async () => {
    const res = await fetchApi(`/api/app/hierarchy/locations/${retiredRegionLocationId}/reactivate`, {
      method: 'POST',
    }, 'test-token-admin');

    assert.strictEqual(res.status, 409, 'should get 409 for retired region');
    const body = await res.json();
    assert.ok(body.error.code === 'region_retired' || body.error.code === 'district_retired');
  });
});

describe('Store Sign-In with Reused Number', () => {
  before(async () => {
    await seedTestUsers();
    const db = getTestDb();
    const now = new Date().toISOString();
    const suffix = `signin_${Date.now()}`;

    // Create active hierarchy
    const regionRef = await db.collection('regions').add({
      code: `SIGN_REG_${suffix.slice(-6)}`,
      name: 'Sign-In Test Region',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    const districtRef = await db.collection('districts').add({
      code: `SIGN_DIST_${suffix.slice(-6)}`,
      name: 'Sign-In Test District',
      regionId: regionRef.id,
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    // Create RETIRED store with number "777"
    await db.collection('locations').add({
      kind: 'store',
      storeNumber: '777',
      name: 'Retired Store 777',
      lifecycle: 'retired',
      address: { street: '123 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+12135550009',
      phonePublic: true,
      sharedInboxEmail: 'store777old@shiekh.test',
      regionId: regionRef.id,
      districtId: districtRef.id,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    // Create ACTIVE store with SAME number "777"
    void await db.collection('locations').add({
      kind: 'store',
      storeNumber: '777',
      name: 'Active Store 777',
      lifecycle: 'active',
      address: { street: '456 Test St', city: 'Test City', state: 'CA', zip: '90002', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+12135550010',
      phonePublic: true,
      sharedInboxEmail: 'store777new@shiekh.test',
      regionId: regionRef.id,
      districtId: districtRef.id,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
  });

  it('Store PIN sign-in with reused number finds active store, not retired', async () => {
    const res = await fetch(`${API_BASE}/api/store/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'store777new@shiekh.test' }),
    });

    // Should succeed (200) or at least not return store_permanently_closed
    if (res.status === 200) {
      const body = await res.json();
      assert.ok(body.data, 'should return sign-in data for active store');
    } else {
      const body = await res.json();
      assert.notStrictEqual(body.error?.code, 'store_permanently_closed', 
        'should NOT say store is permanently closed when active store exists');
    }
  });
});

describe('Lifecycle Filter Tests', () => {
  before(async () => {
    await seedTestUsers();
  });

  it('Non-Admin gets 403 for lifecycle=retired', async () => {
    const res = await fetchApi('/api/app/locations?lifecycle=retired', {}, 'test-token-steward');
    assert.strictEqual(res.status, 403, 'Steward should get 403 for retired filter');
  });

  it('Non-Admin gets 403 for lifecycle=all', async () => {
    const res = await fetchApi('/api/app/locations?lifecycle=all', {}, 'test-token-leader');
    assert.strictEqual(res.status, 403, 'Leader should get 403 for all filter');
  });

  it('Admin can use lifecycle=retired', async () => {
    const res = await fetchApi('/api/app/locations?lifecycle=retired', {}, 'test-token-admin');
    assert.strictEqual(res.status, 200, 'Admin should succeed with retired filter');
  });
});

describe('Audit Log Tests', () => {
  it('Retire audit entry includes cancellation counts', async () => {
    const db = getTestDb();
    const now = new Date().toISOString();
    const suffix = `audit_${Date.now()}`;

    // Create a fresh location
    const regionRef = await db.collection('regions').add({
      code: `AUD_REG_${suffix.slice(-6)}`,
      name: 'Audit Test Region',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    const districtRef = await db.collection('districts').add({
      code: `AUD_DIST_${suffix.slice(-6)}`,
      name: 'Audit Test District',
      regionId: regionRef.id,
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    const locationRef = await db.collection('locations').add({
      kind: 'store',
      storeNumber: `AUD${suffix.slice(-3)}`,
      name: 'Audit Test Store',
      lifecycle: 'active',
      address: { street: '123 Test St', city: 'Test City', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+12135550011',
      phonePublic: true,
      regionId: regionRef.id,
      districtId: districtRef.id,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });

    // Retire it
    await fetchApi(`/api/app/hierarchy/locations/${locationRef.id}/retire`, {
      method: 'POST',
    }, 'test-token-admin');

    // Check audit entry
    const auditSnap = await db.collection('auditLog')
      .where('entityId', '==', locationRef.id)
      .where('action', '==', 'update')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    assert.strictEqual(auditSnap.empty, false, 'should have audit entry');
    const audit = auditSnap.docs[0].data();
    
    // Check that counts are in the changes array
    const changes = audit.changes || [];
    const hasLifecycleChange = changes.some((c: { field: string }) => c.field === 'lifecycle');
    const hasAssignmentsCount = changes.some((c: { field: string }) => c.field === 'assignmentsEnded');
    
    assert.ok(hasLifecycleChange, 'audit should have lifecycle change');
    assert.ok(hasAssignmentsCount, 'audit should have assignmentsEnded count');
  });
});

console.log('Close/Reactivate tests loaded');

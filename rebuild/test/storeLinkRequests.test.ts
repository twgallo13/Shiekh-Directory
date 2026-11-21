import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getTestDb, seedTestHierarchy, seedTestLocation, seedTestUsers } from './testHelpers';
import { API_BASE, GOOD_REVIEW_URL, WEEK_HOURS, api } from './storePageHttp';

describe('store-link requests and own-store filing', () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let ownId = '';
  let otherId = '';
  let inScopeId = '';
  let outScopeId = '';
  let storeUid = '';
  let leaderUid = '';
  let leaderPerson = '';
  let assignmentId = '';

  before(async () => {
    const health = await fetch(`${API_BASE}/api/health`);
    assert.equal(health.status, 200, 'API server must be running on the emulator');
    await seedTestUsers();
    const hierarchy = await seedTestHierarchy(`link-${suffix}`);
    ownId = await seedTestLocation({
      storeNumber: `71${suffix.slice(-4)}`,
      name: 'Filing Own',
      kind: 'store',
      lifecycle: 'active',
      districtId: hierarchy.districtId,
      regionId: hierarchy.regionId,
    });
    otherId = await seedTestLocation({
      storeNumber: `72${suffix.slice(-4)}`,
      name: 'Filing Other',
      kind: 'store',
      lifecycle: 'active',
      districtId: hierarchy.district2Id,
      regionId: hierarchy.region2Id,
    });
    inScopeId = await seedTestLocation({
      storeNumber: `73${suffix.slice(-4)}`,
      name: 'In Scope',
      kind: 'store',
      lifecycle: 'active',
      districtId: hierarchy.districtId,
      regionId: hierarchy.regionId,
    });
    outScopeId = await seedTestLocation({
      storeNumber: `74${suffix.slice(-4)}`,
      name: 'Out Scope',
      kind: 'store',
      lifecycle: 'active',
      districtId: hierarchy.district2Id,
      regionId: hierarchy.region2Id,
    });
    const db = getTestDb();
    const now = new Date().toISOString();
    storeUid = `store-link-${suffix}`;
    await db.collection('users').doc(storeUid).set({
      email: `${storeUid}@test.com`,
      displayName: 'Store Filer',
      role: 'Store',
      status: 'active',
      storeLocationId: ownId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    leaderUid = `leader-link-${suffix}`;
    leaderPerson = `person-link-${suffix}`;
    assignmentId = `asg-link-${suffix}`;
    await db.collection('people').doc(leaderPerson).set({
      fullName: 'Link Leader',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    await db.collection('users').doc(leaderUid).set({
      email: `${leaderUid}@test.com`,
      displayName: 'Link Leader',
      role: 'Leader',
      status: 'active',
      personId: leaderPerson,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await db.collection('assignments').doc(assignmentId).set({
      personId: leaderPerson,
      role: 'DM',
      scopeType: 'district',
      scopeId: hierarchy.districtId,
      slot: 'primary',
      startDate: now.slice(0, 10),
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
  });

  async function correctionsFor(locationId: string) {
    const snap = await getTestDb().collection('corrections').where('locationId', '==', locationId).get();
    return snap.docs.map((doc) => doc.data());
  }

  it('edit_store_other_store_contact_403', async () => {
    const token = `test-token-${storeUid}`;
    const before = (await correctionsFor(otherId)).length;
    for (const changes of [
      { mainPhone: '+12135550199' },
      { address: { street: '9 Other', city: 'LA', state: 'CA', zip: '90001', country: 'US' } },
      { sharedInboxEmail: 'other-inbox@shiekh.test' },
      { standardHours: WEEK_HOURS },
    ]) {
      const response = await api(`/api/app/edit/locations/${otherId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ changes }),
      });
      assert.equal(response.status, 403);
    }
    assert.equal((await correctionsFor(otherId)).length, before);

    for (const changes of [
      { mainPhone: '+12135550198' },
      { address: { street: '1 Own', city: 'LA', state: 'CA', zip: '90001', country: 'US' } },
      { sharedInboxEmail: 'own-inbox@shiekh.test' },
      { standardHours: WEEK_HOURS },
    ]) {
      const response = await api(`/api/app/edit/locations/${ownId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ changes }),
      });
      const body = await response.json() as { data?: { correctionCreated?: boolean } };
      assert.equal(response.status, 200);
      assert.equal(body.data?.correctionCreated, true);
    }
  });

  it('corrections_invalid_type_400', async () => {
    const unknown = await api('/api/app/corrections', 'test-token-viewer', {
      method: 'POST',
      body: JSON.stringify({ locationId: ownId, category: 'phone', type: 'not-a-type' }),
    });
    assert.equal(unknown.status, 400);
    const mismatched = await api('/api/app/corrections', 'test-token-viewer', {
      method: 'POST',
      body: JSON.stringify({ locationId: ownId, category: 'phone', type: 'store-page' }),
    });
    assert.equal(mismatched.status, 400);
    const body = await mismatched.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, 'invalid_type');
  });

  it('store and leader scope, one pending, and steward direct-edit only', async () => {
    const storeOther = await api('/api/app/corrections', `test-token-${storeUid}`, {
      method: 'POST',
      body: JSON.stringify({
        locationId: otherId,
        category: 'store-link',
        proposedChanges: { reviewUrl: GOOD_REVIEW_URL },
      }),
    });
    assert.equal(storeOther.status, 403);
    const viewer = await api('/api/app/corrections', 'test-token-viewer', {
      method: 'POST',
      body: JSON.stringify({
        locationId: ownId,
        category: 'store-link',
        proposedChanges: { reviewUrl: GOOD_REVIEW_URL },
      }),
    });
    assert.equal(viewer.status, 403);
    const extra = await api('/api/app/corrections', `test-token-${storeUid}`, {
      method: 'POST',
      body: JSON.stringify({
        locationId: ownId,
        category: 'store-link',
        proposedChanges: { reviewUrl: GOOD_REVIEW_URL, mainPhone: '+12135550000' },
      }),
    });
    assert.equal(extra.status, 400);
    const leaderOut = await api('/api/app/corrections', `test-token-${leaderUid}`, {
      method: 'POST',
      body: JSON.stringify({
        locationId: outScopeId,
        category: 'store-link',
        proposedChanges: { reviewUrl: GOOD_REVIEW_URL },
      }),
    });
    assert.equal(leaderOut.status, 403);
    const steward = await api('/api/app/corrections', 'test-token-steward', {
      method: 'POST',
      body: JSON.stringify({
        locationId: ownId,
        category: 'store-link',
        proposedChanges: { reviewUrl: GOOD_REVIEW_URL },
      }),
    });
    assert.equal(steward.status, 403);

    const filed = await api('/api/app/corrections', `test-token-${leaderUid}`, {
      method: 'POST',
      body: JSON.stringify({
        locationId: inScopeId,
        category: 'store-link',
        proposedChanges: { reviewUrl: GOOD_REVIEW_URL },
        proposedNote: 'New review link',
      }),
    });
    assert.equal(filed.status, 201);
    const again = await api('/api/app/corrections', `test-token-${leaderUid}`, {
      method: 'POST',
      body: JSON.stringify({
        locationId: inScopeId,
        category: 'store-link',
        proposedChanges: { reviewUrl: 'https://g.page/r/second/review' },
      }),
    });
    assert.equal(again.status, 409);
    const mine = await api('/api/app/corrections?myRequests=true', `test-token-${leaderUid}`);
    const listed = await mine.json() as { data: Array<{ category: string; status: string; locationId: string }> };
    assert.ok(listed.data.some((row) => row.category === 'store-link' && row.status === 'pending' && row.locationId === inScopeId));
  });

  it('storelink_approve_after_unrelated_location_edit_ok', async () => {
    const filed = await api('/api/app/corrections', `test-token-${storeUid}`, {
      method: 'POST',
      body: JSON.stringify({
        locationId: ownId,
        category: 'store-link',
        proposedChanges: { reviewUrl: 'https://maps.app.goo.gl/pilot' },
      }),
    });
    assert.equal(filed.status, 201);
    const created = await filed.json() as { data: { id: string } };
    const hours = await api(`/api/app/edit/locations/${ownId}`, 'test-token-admin', {
      method: 'PATCH',
      body: JSON.stringify({ changes: { standardHours: WEEK_HOURS } }),
    });
    assert.equal(hours.status, 200);
    const before = (await getTestDb().collection('locations').doc(ownId).get()).data()!;
    const approved = await api(`/api/app/corrections/${created.data.id}/approve`, 'test-token-steward', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(approved.status, 200);
    const after = (await getTestDb().collection('locations').doc(ownId).get()).data()!;
    assert.equal(after.version, before.version);
    assert.equal(after.updatedAt, before.updatedAt);
    assert.equal(after.reviewUrl, undefined);
    const page = await getTestDb().collection('storePages').doc(ownId).get();
    assert.equal(page.data()?.reviewUrl, 'https://maps.app.goo.gl/pilot');
  });

  it('storelink_concurrent_approve_and_cancel', async () => {
    const locationId = await seedTestLocation({
      storeNumber: `75${suffix.slice(-3)}`,
      name: 'Race Link',
      kind: 'store',
      lifecycle: 'active',
    });
    const db = getTestDb();
    const now = new Date().toISOString();
    const ref = db.collection('corrections').doc();
    await ref.set({
      status: 'pending',
      type: 'store-page',
      category: 'store-link',
      locationId,
      locationName: 'Race Link',
      storeNumber: '75',
      submittedBy: 'admin',
      submittedByEmail: 'admin@test.com',
      submittedByRole: 'Admin',
      submittedAt: now,
      expiresAt: now,
      proposedChanges: { reviewUrl: GOOD_REVIEW_URL },
      currentValues: { reviewUrl: null },
      locationVersion: 1,
      storePageVersion: 0,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'admin',
      version: 1,
    });
    const [approved, cancelled] = await Promise.all([
      api(`/api/app/corrections/${ref.id}/approve`, 'test-token-steward', { method: 'POST', body: '{}' }),
      api(`/api/app/corrections/${ref.id}/cancel`, 'test-token-admin', { method: 'POST', body: '{}' }),
    ]);
    assert.deepEqual([approved.status, cancelled.status].sort(), [200, 400]);
    const correction = (await ref.get()).data()!;
    const page = await db.collection('storePages').doc(locationId).get();
    if (correction.status === 'approved') {
      assert.equal(page.data()?.reviewUrl, GOOD_REVIEW_URL);
    } else {
      assert.equal(correction.status, 'cancelled');
      assert.equal(page.exists ? page.data()?.reviewUrl ?? null : null, null);
    }
  });

  it('storelink_approve_rechecks_requester', async () => {
    const db = getTestDb();
    const now = new Date().toISOString();
    const planted = db.collection('corrections').doc();
    await planted.set({
      status: 'pending',
      type: 'store-page',
      category: 'store-link',
      locationId: ownId,
      locationName: 'Filing Own',
      storeNumber: '71',
      submittedBy: `store_${otherId}`,
      submittedByEmail: 'other@test.com',
      submittedByRole: 'Store',
      submittedAt: now,
      expiresAt: now,
      proposedChanges: { reviewUrl: GOOD_REVIEW_URL },
      currentValues: {},
      locationVersion: 1,
      storePageVersion: 0,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    const denied = await api(`/api/app/corrections/${planted.id}/approve`, 'test-token-steward', {
      method: 'POST',
      body: '{}',
    });
    assert.ok(denied.status === 409 || denied.status === 403);

    const link = db.collection('corrections').doc();
    await link.set({
      status: 'pending',
      type: 'store-page',
      category: 'store-link',
      locationId: inScopeId,
      locationName: 'In Scope',
      storeNumber: '73',
      submittedBy: leaderUid,
      submittedByEmail: `${leaderUid}@test.com`,
      submittedByRole: 'Leader',
      submittedAt: now,
      expiresAt: now,
      proposedChanges: { reviewUrl: 'https://www.google.com/maps/place/Later' },
      currentValues: { reviewUrl: null },
      locationVersion: 99,
      storePageVersion: 0,
      createdAt: now,
      updatedAt: now,
      updatedBy: leaderUid,
      version: 1,
    });
    await db.collection('assignments').doc(assignmentId).delete();
    const out = await api(`/api/app/corrections/${link.id}/approve`, 'test-token-steward', {
      method: 'POST',
      body: '{}',
    });
    const body = await out.json() as { error?: { code?: string } };
    assert.equal(out.status, 409);
    assert.equal(body.error?.code, 'requester_out_of_scope');
  });

  it('storelink_approve_revalidates_value', async () => {
    const db = getTestDb();
    const now = new Date().toISOString();
    const ref = db.collection('corrections').doc();
    await ref.set({
      status: 'pending',
      type: 'store-page',
      category: 'store-link',
      locationId: otherId,
      locationName: 'Other',
      storeNumber: '72',
      submittedBy: 'admin',
      submittedByEmail: 'admin@test.com',
      submittedByRole: 'Admin',
      submittedAt: now,
      expiresAt: now,
      proposedChanges: { reviewUrl: 'https://www.google.com/url?q=https://evil.example' },
      currentValues: {},
      locationVersion: 1,
      storePageVersion: 0,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'admin',
      version: 1,
    });
    const response = await api(`/api/app/corrections/${ref.id}/approve`, 'test-token-steward', {
      method: 'POST',
      body: '{}',
    });
    assert.equal(response.status, 400);
    const page = await db.collection('storePages').doc(otherId).get();
    const review = page.exists ? page.data()?.reviewUrl : null;
    assert.ok(!String(review || '').includes('evil.example'));
  });

  it('tampered extra fields are rejected at approve', async () => {
    const db = getTestDb();
    const now = new Date().toISOString();
    const location = await db.collection('locations').doc(otherId).get();
    const ref = db.collection('corrections').doc();
    await ref.set({
      status: 'pending',
      type: 'phone',
      category: 'phone',
      locationId: otherId,
      locationName: 'Other',
      storeNumber: '72',
      submittedBy: 'viewer',
      submittedByEmail: 'viewer@test.com',
      submittedByRole: 'Viewer',
      submittedAt: now,
      expiresAt: now,
      proposedChanges: { mainPhone: '+12135550111', reviewUrl: GOOD_REVIEW_URL },
      currentValues: {},
      locationVersion: location.data()?.version,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'viewer',
      version: 1,
    });
    const response = await api(`/api/app/corrections/${ref.id}/approve`, 'test-token-steward', {
      method: 'POST',
      body: '{}',
    });
    assert.equal(response.status, 400);
    const after = await db.collection('locations').doc(otherId).get();
    assert.equal(after.data()?.mainPhone, location.data()?.mainPhone);
    assert.equal(after.data()?.reviewUrl, undefined);

    const link = db.collection('corrections').doc();
    await link.set({
      status: 'pending',
      type: 'store-page',
      category: 'store-link',
      locationId: otherId,
      locationName: 'Other',
      storeNumber: '72',
      submittedBy: 'admin',
      submittedByEmail: 'admin@test.com',
      submittedByRole: 'Admin',
      submittedAt: now,
      expiresAt: now,
      proposedChanges: { reviewUrl: GOOD_REVIEW_URL, sharedInboxEmail: 'tamper@secret.test' },
      currentValues: {},
      locationVersion: 1,
      storePageVersion: 0,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'admin',
      version: 1,
    });
    const linkResponse = await api(`/api/app/corrections/${link.id}/approve`, 'test-token-steward', {
      method: 'POST',
      body: '{}',
    });
    assert.equal(linkResponse.status, 400);
    const page = await db.collection('storePages').doc(otherId).get();
    assert.notEqual(page.data()?.reviewUrl, GOOD_REVIEW_URL);
  });

  it('a store cannot file a holiday exception for another store', async () => {
    const db = getTestDb();
    const beforeExceptions = (await db.collection(`locations/${otherId}/hoursExceptions`).get()).size;
    const beforeCorrections = (await db.collection('corrections').where('locationId', '==', otherId).get()).docs
      .filter((doc) => doc.data().proposedChanges?.addHoursException).length;
    const response = await api(`/api/app/hours-exceptions/locations/${otherId}`, `test-token-${storeUid}`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'holiday',
        label: 'Other store holiday',
        startDate: '2026-12-25',
        endDate: '2026-12-25',
        closed: true,
        intervals: [],
      }),
    });
    const body = await response.json() as { error?: { code?: string; message?: string } };
    assert.equal(response.status, 403);
    assert.equal(body.error?.code, 'forbidden');
    assert.equal(body.error?.message, 'You can only submit requests for your own store.');
    assert.equal((await db.collection(`locations/${otherId}/hoursExceptions`).get()).size, beforeExceptions);
    const afterCorrections = (await db.collection('corrections').where('locationId', '==', otherId).get()).docs
      .filter((doc) => doc.data().proposedChanges?.addHoursException).length;
    assert.equal(afterCorrections, beforeCorrections);
  });

  it('storelink_approve_rejects_a_changed_page_version', async () => {
    const db = getTestDb();
    const now = new Date().toISOString();
    const locationId = await seedTestLocation({
      storeNumber: `80${suffix.slice(-4)}`,
      name: 'Version Clash',
      kind: 'store',
      lifecycle: 'active',
    });
    await db.collection('storePages').doc(locationId).set({
      reviewUrl: 'https://g.page/r/before/review',
      magentoStoreId: null,
      pageEnabled: false,
      version: 2,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'admin',
    });
    const correction = db.collection('corrections').doc();
    await correction.set({
      status: 'pending',
      type: 'store-page',
      category: 'store-link',
      locationId,
      locationName: 'Version Clash',
      storeNumber: '80',
      submittedBy: 'admin',
      submittedByEmail: 'admin@test.com',
      submittedByRole: 'Admin',
      submittedAt: now,
      expiresAt: now,
      proposedChanges: { reviewUrl: 'https://g.page/r/after-version/review' },
      currentValues: { reviewUrl: 'https://g.page/r/before/review' },
      locationVersion: 1,
      storePageVersion: 0,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'admin',
      version: 1,
    });
    const response = await api(`/api/app/corrections/${correction.id}/approve`, 'test-token-steward', {
      method: 'POST',
      body: '{}',
    });
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(response.status, 409);
    assert.equal(body.error?.code, 'version_conflict');
    const page = await db.collection('storePages').doc(locationId).get();
    assert.equal(page.data()?.reviewUrl, 'https://g.page/r/before/review');
    assert.equal(page.data()?.version, 2);
    assert.equal((await correction.get()).data()?.status, 'pending');
  });

  it('hoursexception_label_61_rejected_at_create_and_approve', async () => {
    const token = `test-token-${storeUid}`;
    const created = await api(`/api/app/hours-exceptions/locations/${ownId}`, token, {
      method: 'POST',
      body: JSON.stringify({
        type: 'holiday',
        label: 'x'.repeat(61),
        startDate: '2026-11-26',
        endDate: '2026-11-26',
        closed: true,
        intervals: [],
      }),
    });
    assert.equal(created.status, 400);
    const db = getTestDb();
    const now = new Date().toISOString();
    const bad = db.collection('corrections').doc();
    const location = await db.collection('locations').doc(ownId).get();
    await bad.set({
      status: 'pending',
      type: 'hours',
      category: 'hours',
      locationId: ownId,
      locationName: 'Own',
      storeNumber: '71',
      submittedBy: storeUid,
      submittedByEmail: `${storeUid}@test.com`,
      submittedByRole: 'Store',
      submittedAt: now,
      expiresAt: now,
      proposedChanges: {
        addHoursException: {
          type: 'holiday',
          label: 'y'.repeat(61),
          startDate: '2026-11-26',
          endDate: '2026-11-26',
          closed: true,
          intervals: [],
          source: 'manual',
        },
      },
      currentValues: {},
      locationVersion: location.data()?.version,
      createdAt: now,
      updatedAt: now,
      updatedBy: storeUid,
      version: 1,
    });
    const rejected = await api(`/api/app/corrections/${bad.id}/approve`, 'test-token-steward', {
      method: 'POST',
      body: '{}',
    });
    assert.equal(rejected.status, 400);

    const good = db.collection('corrections').doc();
    const fresh = await db.collection('locations').doc(ownId).get();
    await good.set({
      status: 'pending',
      type: 'hours',
      category: 'hours',
      locationId: ownId,
      locationName: 'Own',
      storeNumber: '71',
      submittedBy: storeUid,
      submittedByEmail: `${storeUid}@test.com`,
      submittedByRole: 'Store',
      submittedAt: now,
      expiresAt: now,
      proposedChanges: {
        addHoursException: {
          type: 'holiday',
          label: 'Thanksgiving',
          startDate: '2026-11-26',
          endDate: '2026-11-26',
          closed: true,
          intervals: [],
          source: 'manual',
        },
      },
      currentValues: {},
      locationVersion: fresh.data()?.version,
      createdAt: now,
      updatedAt: now,
      updatedBy: storeUid,
      version: 1,
    });
    const approved = await api(`/api/app/corrections/${good.id}/approve`, 'test-token-steward', {
      method: 'POST',
      body: '{}',
    });
    assert.equal(approved.status, 200);
    const exceptions = await db.collection(`locations/${ownId}/hoursExceptions`).get();
    const match = exceptions.docs.find((doc) => doc.data().label === 'Thanksgiving');
    assert.ok(match);
    assert.equal(match?.data().source, 'manual');
  });

  it('reject leaves store page and location unchanged', async () => {
    const filed = await api('/api/app/corrections', `test-token-${storeUid}`, {
      method: 'POST',
      body: JSON.stringify({
        locationId: ownId,
        category: 'store-link',
        proposedChanges: { reviewUrl: 'https://g.page/r/reject-me/review' },
      }),
    });
    if (filed.status === 409) return;
    assert.equal(filed.status, 201);
    const created = await filed.json() as { data: { id: string } };
    const before = (await getTestDb().collection('locations').doc(ownId).get()).data();
    const response = await api(`/api/app/corrections/${created.data.id}/reject`, 'test-token-steward', {
      method: 'POST',
      body: JSON.stringify({ notes: 'no' }),
    });
    assert.equal(response.status, 200);
    const after = (await getTestDb().collection('locations').doc(ownId).get()).data();
    assert.equal(after?.version, before?.version);
    assert.equal(after?.updatedAt, before?.updatedAt);
  });

  it('one pending store-link is atomic and is not hidden by newer requests', async () => {
    const db = getTestDb();
    const locationId = await seedTestLocation({
      storeNumber: `75${suffix.slice(-4)}`,
      name: 'Pending Lock',
      kind: 'store',
      lifecycle: 'active',
    });
    const filer = `store-lock-${suffix}`;
    const now = new Date().toISOString();
    await db.collection('users').doc(filer).set({
      email: `${filer}@test.com`,
      displayName: 'Lock Filer',
      role: 'Store',
      status: 'active',
      storeLocationId: locationId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const olderId = `older-store-link-${suffix}`;
    await db.collection('corrections').doc(olderId).set({
      status: 'pending',
      type: 'store-page',
      category: 'store-link',
      locationId,
      locationName: 'Pending Lock',
      storeNumber: '75',
      submittedBy: filer,
      submittedByEmail: `${filer}@test.com`,
      submittedByRole: 'Store',
      submittedAt: '2000-01-01T00:00:00.000Z',
      expiresAt: now,
      proposedChanges: { reviewUrl: GOOD_REVIEW_URL },
      currentValues: {},
      locationVersion: 1,
      storePageVersion: 0,
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
      updatedBy: filer,
      version: 1,
    });
    for (let i = 0; i < 21; i += 1) {
      await db.collection('corrections').doc().set({
        status: 'pending',
        type: 'phone',
        category: 'phone',
        locationId,
        locationName: 'Pending Lock',
        storeNumber: '75',
        submittedBy: filer,
        submittedByEmail: `${filer}@test.com`,
        submittedByRole: 'Store',
        submittedAt: `2026-11-21T00:00:${String(i).padStart(2, '0')}.000Z`,
        expiresAt: now,
        proposedChanges: { mainPhone: '+12135550000' },
        currentValues: {},
        locationVersion: 1,
        createdAt: now,
        updatedAt: now,
        updatedBy: filer,
        version: 1,
      });
    }
    const hidden = await api('/api/app/corrections', `test-token-${filer}`, {
      method: 'POST',
      body: JSON.stringify({
        locationId,
        category: 'store-link',
        proposedChanges: { reviewUrl: 'https://g.page/r/hidden/review' },
      }),
    });
    const hiddenBody = await hidden.json() as { error?: { code?: string; existingId?: string } };
    assert.equal(hidden.status, 409);
    assert.equal(hiddenBody.error?.code, 'pending_store_link');
    assert.equal(hiddenBody.error?.existingId, olderId);

    const raceId = await seedTestLocation({
      storeNumber: `76${suffix.slice(-4)}`,
      name: 'Race Lock',
      kind: 'store',
      lifecycle: 'active',
    });
    const racer = `store-race-${suffix}`;
    await db.collection('users').doc(racer).set({
      email: `${racer}@test.com`,
      displayName: 'Race Filer',
      role: 'Store',
      status: 'active',
      storeLocationId: raceId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const [first, second] = await Promise.all([
      api('/api/app/corrections', `test-token-${racer}`, {
        method: 'POST',
        body: JSON.stringify({
          locationId: raceId,
          category: 'store-link',
          proposedChanges: { reviewUrl: GOOD_REVIEW_URL },
        }),
      }),
      api('/api/app/corrections', `test-token-${racer}`, {
        method: 'POST',
        body: JSON.stringify({
          locationId: raceId,
          category: 'store-link',
          proposedChanges: { reviewUrl: 'https://g.page/r/race/review' },
        }),
      }),
    ]);
    assert.deepEqual([first.status, second.status].sort(), [201, 409]);
    const pending = await db.collection('corrections').where('locationId', '==', raceId).get();
    const links = pending.docs.filter((doc) => doc.data().category === 'store-link');
    assert.equal(links.length, 1);
    const lock = await db.collection('storeLinkPending').doc(raceId).get();
    assert.equal(lock.exists, true);
    assert.equal(lock.data()?.correctionId, links[0].id);
  });

  it('a closed store-link releases the pending lock', async () => {
    const db = getTestDb();
    const now = new Date().toISOString();
    const locationId = await seedTestLocation({
      storeNumber: `79${suffix.slice(-4)}`,
      name: 'Stale Lock',
      kind: 'store',
      lifecycle: 'active',
    });
    const filer = `store-stale-${suffix}`;
    await db.collection('users').doc(filer).set({
      email: `${filer}@test.com`,
      displayName: 'Stale Filer',
      role: 'Store',
      status: 'active',
      storeLocationId: locationId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const first = await api('/api/app/corrections', `test-token-${filer}`, {
      method: 'POST',
      body: JSON.stringify({
        locationId,
        category: 'store-link',
        proposedChanges: { reviewUrl: GOOD_REVIEW_URL },
      }),
    });
    const firstBody = await first.json() as { data?: { id: string }; error?: { code?: string } };
    assert.equal(first.status, 201, firstBody.error?.code || 'file failed');
    const blocked = await api('/api/app/corrections', `test-token-${filer}`, {
      method: 'POST',
      body: JSON.stringify({
        locationId,
        category: 'store-link',
        proposedChanges: { reviewUrl: 'https://g.page/r/still-pending/review' },
      }),
    });
    const blockedBody = await blocked.json() as { error?: { code?: string } };
    assert.equal(blocked.status, 409);
    assert.equal(blockedBody.error?.code, 'pending_store_link');
    await db.collection('corrections').doc(firstBody.data!.id).update({ status: 'rejected' });
    const staleLock = await db.collection('storeLinkPending').doc(locationId).get();
    assert.equal(staleLock.data()?.correctionId, firstBody.data!.id);
    const again = await api('/api/app/corrections', `test-token-${filer}`, {
      method: 'POST',
      body: JSON.stringify({
        locationId,
        category: 'store-link',
        proposedChanges: { reviewUrl: 'https://g.page/r/after-close/review' },
      }),
    });
    const againBody = await again.json() as { data?: { id: string }; error?: { code?: string } };
    assert.equal(again.status, 201, againBody.error?.code || 'refile failed');
    const lock = await db.collection('storeLinkPending').doc(locationId).get();
    assert.equal(lock.data()?.correctionId, againBody.data?.id);
    assert.notEqual(againBody.data?.id, firstBody.data!.id);
  });

  it('a leader who is no longer a leader cannot be approved', async () => {
    const db = getTestDb();
    const now = new Date().toISOString();
    const hierarchy = await seedTestHierarchy(`demote-${suffix}`);
    const locationId = await seedTestLocation({
      storeNumber: `78${suffix.slice(-4)}`,
      name: 'Demoted Leader Store',
      kind: 'store',
      lifecycle: 'active',
      districtId: hierarchy.districtId,
      regionId: hierarchy.regionId,
    });
    const personId = `demote-person-${suffix}`;
    const userId = `demote-leader-${suffix}`;
    await db.collection('people').doc(personId).set({
      fullName: 'Demoted Leader',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    await db.collection('users').doc(userId).set({
      email: `${userId}@test.com`,
      displayName: 'Demoted Leader',
      role: 'Leader',
      status: 'active',
      personId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await db.collection('assignments').doc(`demote-asg-${suffix}`).set({
      personId,
      role: 'DM',
      scopeType: 'district',
      scopeId: hierarchy.districtId,
      slot: 'primary',
      startDate: now.slice(0, 10),
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    const filed = await api('/api/app/corrections', `test-token-${userId}`, {
      method: 'POST',
      body: JSON.stringify({
        locationId,
        category: 'store-link',
        proposedChanges: { reviewUrl: 'https://g.page/r/demoted/review' },
      }),
    });
    const filedBody = await filed.json() as { data?: { id: string }; error?: { code?: string } };
    assert.equal(filed.status, 201, filedBody.error?.code || 'file failed');
    await db.collection('users').doc(userId).update({ role: 'Viewer' });
    const denied = await api(`/api/app/corrections/${filedBody.data?.id}/approve`, 'test-token-steward', {
      method: 'POST',
      body: '{}',
    });
    const deniedBody = await denied.json() as { error?: { code?: string } };
    assert.equal(denied.status, 409);
    assert.equal(deniedBody.error?.code, 'requester_out_of_scope');
    const page = await db.collection('storePages').doc(locationId).get();
    assert.equal(page.exists ? page.data()?.reviewUrl ?? null : null, null);
  });
});

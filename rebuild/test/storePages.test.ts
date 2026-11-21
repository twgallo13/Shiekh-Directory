import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getTestDb, seedTestHierarchy, seedTestLocation, seedTestUsers } from './testHelpers';
import { hashSessionId } from '../server/services/tokenAuth';
import { EMPTY_STORE_PAGE_TILES } from '../src/constants/storePage';
import { API_BASE, GOOD_REVIEW_URL, api } from './storePageHttp';

const badUrls = [
  'https://www.google.com/url?q=https://evil.example',
  'https://www.google.com/amp/s/evil.example',
  'https://google.com.evil.com/maps',
  'https://user@g.page/r/abc',
  'https://g.page:8443/r/abc',
  'https://www.google.com./maps',
  'https://g\u043e\u043egle.com/maps',
  'https://www.google.com/search?q=x',
  'https://www.google.com/aclk?sa=l',
  'http://g.page/r/abc',
  'javascript:alert(1)',
  'https://g.page/r/ab\tc',
  `https://g.page/r/${'a'.repeat(490)}`,
];

const goodUrls = [
  'https://g.page/r/abc/review',
  'https://search.google.com/local/writereview?placeid=ChIJ',
  'https://www.google.com/maps/place/Shiekh',
  'https://maps.app.goo.gl/abc123',
];

function freshMagento(nudge: number): string {
  return String(((Date.now() + nudge) % 800000) + 100000);
}

describe('store pages app API', () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const ownMagento = freshMagento(1);
  let ownId = '';
  let otherId = '';
  let plannedId = '';
  let retiredId = '';
  let warehouseId = '';
  let storeUid = '';
  let leaderUid = '';
  let sessionToken = '';

  before(async () => {
    const health = await fetch(`${API_BASE}/api/health`);
    assert.equal(health.status, 200, 'API server must be running on the emulator');
    await seedTestUsers();
    const hierarchy = await seedTestHierarchy(suffix);
    ownId = await seedTestLocation({
      storeNumber: `81${suffix.slice(-4)}`,
      name: 'Own Store',
      kind: 'store',
      lifecycle: 'active',
      districtId: hierarchy.districtId,
      regionId: hierarchy.regionId,
    });
    otherId = await seedTestLocation({
      storeNumber: `82${suffix.slice(-4)}`,
      name: 'Other Store',
      kind: 'store',
      lifecycle: 'active',
      districtId: hierarchy.district2Id,
      regionId: hierarchy.region2Id,
    });
    plannedId = await seedTestLocation({
      storeNumber: `83${suffix.slice(-4)}`,
      name: 'Planned',
      kind: 'store',
      lifecycle: 'planned',
      districtId: hierarchy.districtId,
      regionId: hierarchy.regionId,
    });
    retiredId = await seedTestLocation({
      storeNumber: `84${suffix.slice(-4)}`,
      name: 'Retired',
      kind: 'store',
      lifecycle: 'retired',
      districtId: hierarchy.districtId,
      regionId: hierarchy.regionId,
    });
    warehouseId = await seedTestLocation({
      storeNumber: `85${suffix.slice(-4)}`,
      name: 'Warehouse',
      kind: 'warehouse',
      lifecycle: 'active',
      districtId: hierarchy.districtId,
      regionId: hierarchy.regionId,
    });

    const db = getTestDb();
    const now = new Date().toISOString();
    storeUid = `store-user-${suffix}`;
    await db.collection('users').doc(storeUid).set({
      email: `${storeUid}@test.com`,
      displayName: 'Store User',
      role: 'Store',
      status: 'active',
      storeLocationId: ownId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    leaderUid = `leader-sp-${suffix}`;
    const personId = `person-sp-${suffix}`;
    await db.collection('people').doc(personId).set({
      fullName: 'Scoped Leader',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    await db.collection('users').doc(leaderUid).set({
      email: `${leaderUid}@test.com`,
      displayName: 'Scoped Leader',
      role: 'Leader',
      status: 'active',
      personId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await db.collection('assignments').doc(`asg-sp-${suffix}`).set({
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
    const sessionId = `session-${suffix}`;
    sessionToken = `StoreSession ${sessionId}`;
    await db.collection('storeSessions').doc(hashSessionId(sessionId)).set({
      locationId: ownId,
      storeNumber: '81',
      email: 'store-session@test.com',
      revoked: false,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  });

  async function locationStamp(id: string) {
    const doc = await getTestDb().collection('locations').doc(id).get();
    const data = doc.data() || {};
    return { version: data.version, updatedAt: data.updatedAt, reviewUrl: data.reviewUrl };
  }

  it('role matrix: read, edit, on/off, and defaults', async () => {
    const cases: Array<[string, string, number, number]> = [
      ['viewer', 'test-token-viewer', 403, 403],
      ['store', `test-token-${storeUid}`, 200, 403],
      ['session', sessionToken, 200, 403],
      ['leader', `test-token-${leaderUid}`, 200, 403],
      ['steward', 'test-token-steward', 200, 200],
      ['admin', 'test-token-admin', 200, 200],
    ];
    for (const [name, token, ownStatus, otherStatus] of cases) {
      const own = await api(`/api/app/store-pages/${ownId}`, token);
      const other = await api(`/api/app/store-pages/${otherId}`, token);
      assert.equal(own.status, ownStatus, `${name} own read`);
      assert.equal(other.status, otherStatus, `${name} other read`);
    }

    const leaderOther = await api(`/api/app/store-pages/${otherId}`, `test-token-${leaderUid}`);
    assert.equal(leaderOther.status, 403);

    const storePatchOther = await api(`/api/app/store-pages/${ownId}`, `test-token-${storeUid}`, {
      method: 'PATCH',
      body: JSON.stringify({ reviewUrl: GOOD_REVIEW_URL, expectedVersion: 0 }),
    });
    assert.equal(storePatchOther.status, 403);

    const before = await locationStamp(ownId);
    const stewardPatch = await api(`/api/app/store-pages/${ownId}`, 'test-token-steward', {
      method: 'PATCH',
      body: JSON.stringify({ reviewUrl: GOOD_REVIEW_URL, magentoStoreId: ownMagento, expectedVersion: 0 }),
    });
    assert.equal(stewardPatch.status, 200);
    const after = await locationStamp(ownId);
    assert.deepEqual(after, before);
    assert.equal(after.reviewUrl, undefined);

    const viewerOff = await api(`/api/app/store-pages/${ownId}/visibility`, 'test-token-viewer', {
      method: 'POST',
      body: JSON.stringify({ enabled: true, expectedVersion: 1 }),
    });
    assert.equal(viewerOff.status, 403);
    const stewardOff = await api(`/api/app/store-pages/${ownId}/visibility`, 'test-token-steward', {
      method: 'POST',
      body: JSON.stringify({ enabled: true, expectedVersion: 1 }),
    });
    assert.equal(stewardOff.status, 403);
    const adminOff = await api(`/api/app/store-pages/${ownId}/visibility`, 'test-token-admin', {
      method: 'POST',
      body: JSON.stringify({ enabled: true, expectedVersion: 1 }),
    });
    assert.equal(adminOff.status, 200);

    const stewardDefaults = await api('/api/app/admin/store-page-defaults', 'test-token-steward');
    assert.equal(stewardDefaults.status, 403);
    const adminDefaults = await api('/api/app/admin/store-page-defaults', 'test-token-admin');
    assert.equal(adminDefaults.status, 200);
    const defaultsBody = await adminDefaults.json() as { data: { defaultImage: { source: string } } };
    assert.equal(defaultsBody.data.defaultImage.source, 'dynamic-qr');

    const storeRead = await api(`/api/app/store-pages/${ownId}`, `test-token-${storeUid}`);
    const storeBody = await storeRead.json() as { data: { magentoStoreId: string | null; shopTileVisible: boolean } };
    assert.equal(storeBody.data.magentoStoreId, null);
    assert.equal(storeBody.data.shopTileVisible, true);
    const adminRead = await api(`/api/app/store-pages/${ownId}`, 'test-token-admin');
    const adminBody = await adminRead.json() as { data: { magentoStoreId: string } };
    assert.equal(adminBody.data.magentoStoreId, ownMagento);

    const audits = await getTestDb().collection('auditLog').where('entityId', '==', ownId).get();
    const storePageAudits = audits.docs.filter((doc) => doc.data().entityType === 'store-page');
    assert.ok(storePageAudits.length >= 1);
  });

  it('g.page and maps.app.goo.gl reject redirect paths', async () => {
    const id = await seedTestLocation({
      storeNumber: `89${suffix.slice(-3)}`,
      name: 'Redirect Paths',
      kind: 'store',
      lifecycle: 'active',
    });
    const db = getTestDb();
    const blocked = ['/url', '/url/redirect', '/amp', '/amp/s/example', '/aclk', '/aclk?sa=l'];
    for (const host of ['https://g.page', 'https://maps.app.goo.gl']) {
      for (const path of blocked) {
        const reviewUrl = `${host}${path}`;
        const response = await api(`/api/app/store-pages/${id}`, 'test-token-steward', {
          method: 'PATCH',
          body: JSON.stringify({ reviewUrl, expectedVersion: 0 }),
        });
        assert.equal(response.status, 400, reviewUrl);
        const page = await db.collection('storePages').doc(id).get();
        assert.notEqual(page.data()?.reviewUrl, reviewUrl);
      }
    }
    let version = 0;
    for (const reviewUrl of ['https://g.page/r/plain/review', 'https://maps.app.goo.gl/plainPath']) {
      const response = await api(`/api/app/store-pages/${id}`, 'test-token-steward', {
        method: 'PATCH',
        body: JSON.stringify({ reviewUrl, expectedVersion: version }),
      });
      assert.equal(response.status, 200, reviewUrl);
      version += 1;
    }
  });

  it('reviewurl_rejects', async () => {
    const db = getTestDb();
    const version = (await db.collection('storePages').doc(otherId).get()).data()?.version ?? 0;
    for (const reviewUrl of badUrls) {
      const response = await api(`/api/app/store-pages/${otherId}`, 'test-token-steward', {
        method: 'PATCH',
        body: JSON.stringify({ reviewUrl, expectedVersion: version }),
      });
      assert.equal(response.status, 400, reviewUrl);
    }
    let current = version;
    for (const reviewUrl of goodUrls) {
      const response = await api(`/api/app/store-pages/${otherId}`, 'test-token-steward', {
        method: 'PATCH',
        body: JSON.stringify({ reviewUrl, expectedVersion: current }),
      });
      assert.equal(response.status, 200, reviewUrl);
      current += 1;
    }
  });

  it('magento_unique_concurrent', async () => {
    const left = await seedTestLocation({
      storeNumber: `86${suffix.slice(-3)}`,
      name: 'Magento A',
      kind: 'store',
      lifecycle: 'active',
    });
    const right = await seedTestLocation({
      storeNumber: `87${suffix.slice(-3)}`,
      name: 'Magento B',
      kind: 'store',
      lifecycle: 'active',
    });
    const sharedId = freshMagento(11);
    const movedId = freshMagento(22);
    const [first, second] = await Promise.all([
      api(`/api/app/store-pages/${left}`, 'test-token-admin', {
        method: 'PATCH',
        body: JSON.stringify({ magentoStoreId: sharedId, expectedVersion: 0 }),
      }),
      api(`/api/app/store-pages/${right}`, 'test-token-admin', {
        method: 'PATCH',
        body: JSON.stringify({ magentoStoreId: sharedId, expectedVersion: 0 }),
      }),
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const winnerId = first.status === 200 ? left : right;
    const loserId = winnerId === left ? right : left;
    const moved = await api(`/api/app/store-pages/${winnerId}`, 'test-token-admin', {
      method: 'PATCH',
      body: JSON.stringify({ magentoStoreId: movedId, expectedVersion: 1 }),
    });
    assert.equal(moved.status, 200);
    const freed = await api(`/api/app/store-pages/${loserId}`, 'test-token-admin', {
      method: 'PATCH',
      body: JSON.stringify({ magentoStoreId: sharedId, expectedVersion: 0 }),
    });
    assert.equal(freed.status, 200);
    const bad = await api(`/api/app/store-pages/${loserId}`, 'test-token-admin', {
      method: 'PATCH',
      body: JSON.stringify({ magentoStoreId: '0123', expectedVersion: 1 }),
    });
    assert.equal(bad.status, 400);
  });

  it('storepage_first_write_race', async () => {
    const id = await seedTestLocation({
      storeNumber: `88${suffix.slice(-3)}`,
      name: 'Race',
      kind: 'store',
      lifecycle: 'active',
    });
    const [first, second] = await Promise.all([
      api(`/api/app/store-pages/${id}`, 'test-token-admin', {
        method: 'PATCH',
        body: JSON.stringify({ reviewUrl: 'https://g.page/r/one/review', expectedVersion: 0 }),
      }),
      api(`/api/app/store-pages/${id}`, 'test-token-steward', {
        method: 'PATCH',
        body: JSON.stringify({ reviewUrl: 'https://g.page/r/two/review', expectedVersion: 0 }),
      }),
    ]);
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);
    const page = await getTestDb().collection('storePages').doc(id).get();
    assert.equal(page.data()?.version, 1);
  });

  it('rejects on/off for planned, retired, and non-store locations', async () => {
    for (const id of [plannedId, retiredId, warehouseId]) {
      const response = await api(`/api/app/store-pages/${id}/visibility`, 'test-token-admin', {
        method: 'POST',
        body: JSON.stringify({ enabled: true, expectedVersion: 0 }),
      });
      const body = await response.json() as { error?: { code?: string } };
      assert.equal(response.status, 400, id);
      assert.equal(body.error?.code, 'not_a_live_store');
    }
  });

  it('saves find-a-store and default image urls for Admin only', async () => {
    const db = getTestDb();
    const ref = db.collection('settings').doc('storePageDefaults');
    const before = await ref.get();
    const findStoreUrl = 'https://www.shiekh.com/stores';
    const defaultStoreImageUrl = 'https://cdn.shiekh.com/images/store-default.jpg';
    const publicToken = 'test-api-token-public-profile';
    try {
      const current = await api('/api/app/admin/store-page-defaults', 'test-token-admin');
      assert.equal(current.status, 200);
      const currentBody = await current.json() as { data: { version: number } };
      const beforeAudits = new Set(
        (await db.collection('auditLog').where('entityId', '==', 'defaults').get()).docs.map((doc) => doc.id),
      );
      const saved = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: currentBody.data.version,
          tiles: EMPTY_STORE_PAGE_TILES,
          findStoreUrl,
          defaultStoreImageUrl,
        }),
      });
      assert.equal(saved.status, 200);
      const savedBody = await saved.json() as { data: { findStoreUrl: string; defaultStoreImageUrl: string; version: number } };
      assert.equal(savedBody.data.findStoreUrl, findStoreUrl);
      assert.equal(savedBody.data.defaultStoreImageUrl, defaultStoreImageUrl);

      const read = await api('/api/app/admin/store-page-defaults', 'test-token-admin');
      const readBody = await read.json() as { data: { findStoreUrl: string; defaultStoreImageUrl: string; version: number } };
      assert.equal(read.status, 200);
      assert.equal(readBody.data.findStoreUrl, findStoreUrl);
      assert.equal(readBody.data.defaultStoreImageUrl, defaultStoreImageUrl);

      for (const token of ['test-token-steward', 'test-token-viewer']) {
        const denied = await api('/api/app/admin/store-page-defaults', token, {
          method: 'PUT',
          body: JSON.stringify({
            expectedVersion: readBody.data.version,
            tiles: EMPTY_STORE_PAGE_TILES,
            findStoreUrl: 'https://evil.example/stores',
            defaultStoreImageUrl: 'https://evil.example/image.jpg',
          }),
        });
        assert.equal(denied.status, 403, token);
      }
      const still = await ref.get();
      assert.equal(still.data()?.findStoreUrl, findStoreUrl);
      assert.equal(still.data()?.defaultStoreImageUrl, defaultStoreImageUrl);

      const tooLong = `https://cdn.shiekh.com/${'a'.repeat(2040)}`;
      assert.ok(tooLong.length > 2048);
      const rejected = [
        'http://www.shiekh.com/stores',
        'javascript:alert(1)',
        'https://user:pass@www.shiekh.com/stores',
        'https://localhost/stores',
        'https://127.0.0.1/stores',
        'https://[::1]/stores',
        'https://cdn.shiekh.com:8443/image.jpg',
        tooLong,
      ];
      for (const bad of rejected) {
        const response = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
          method: 'PUT',
          body: JSON.stringify({
            expectedVersion: readBody.data.version,
            tiles: EMPTY_STORE_PAGE_TILES,
            findStoreUrl: bad,
            defaultStoreImageUrl: bad,
          }),
        });
        assert.equal(response.status, 400, bad.slice(0, 80));
      }
      const unchanged = await ref.get();
      assert.equal(unchanged.data()?.findStoreUrl, findStoreUrl);
      assert.equal(unchanged.data()?.defaultStoreImageUrl, defaultStoreImageUrl);
      assert.equal(unchanged.data()?.version, readBody.data.version);

      const audits = await db.collection('auditLog').where('entityId', '==', 'defaults').get();
      const created = audits.docs.filter((doc) => !beforeAudits.has(doc.id));
      assert.equal(created.length, 1);
      const changes = created[0].data().changes as Array<{ field: string; newValue: string | null }>;
      assert.equal(changes.find((change) => change.field === 'findStoreUrl')?.newValue, findStoreUrl);
      assert.equal(changes.find((change) => change.field === 'defaultStoreImageUrl')?.newValue, defaultStoreImageUrl);
      assert.equal(created[0].data().previousVersion, currentBody.data.version);
      assert.equal(created[0].data().newVersion, readBody.data.version);

      const offNumber = `93${suffix.slice(-4)}`;
      const retiredNumber = `94${suffix.slice(-4)}`;
      const offId = await seedTestLocation({
        storeNumber: offNumber,
        name: 'Defaults Off',
        kind: 'store',
        lifecycle: 'active',
      });
      await db.collection('storePages').doc(offId).set({
        reviewUrl: 'https://g.page/r/defaults-off/review',
        magentoStoreId: '420788',
        pageEnabled: false,
        version: 1,
        updatedAt: new Date().toISOString(),
        updatedBy: 'admin',
      });
      const retiredStoreId = await seedTestLocation({
        storeNumber: retiredNumber,
        name: 'Defaults Retired',
        kind: 'store',
        lifecycle: 'retired',
      });
      await db.collection('storePages').doc(retiredStoreId).set({
        reviewUrl: 'https://g.page/r/defaults-retired/review',
        magentoStoreId: '420789',
        pageEnabled: true,
        version: 1,
        updatedAt: new Date().toISOString(),
        updatedBy: 'admin',
      });

      const listed = await api('/api/public-profile/v1/stores', publicToken);
      const listedBody = await listed.json() as {
        findStoreUrl?: string;
        defaultStoreImageUrl?: string;
        stores: Array<Record<string, unknown>>;
      };
      assert.equal(listed.status, 200);
      assert.equal(listedBody.findStoreUrl, findStoreUrl);
      assert.equal(listedBody.defaultStoreImageUrl, defaultStoreImageUrl);
      const offStore = listedBody.stores.find((store) => store.storeNumber === offNumber);
      const retiredStore = listedBody.stores.find((store) => store.storeNumber === retiredNumber);
      assert.deepEqual(offStore, { storeNumber: offNumber, status: 'Active', pageEnabled: false });
      assert.deepEqual(retiredStore, { storeNumber: retiredNumber, status: 'Retired' });

      const cleared = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: readBody.data.version,
          tiles: EMPTY_STORE_PAGE_TILES,
          findStoreUrl: '',
          defaultStoreImageUrl: '',
        }),
      });
      assert.equal(cleared.status, 200);
      const omitted = await api('/api/public-profile/v1/stores', publicToken);
      const omittedBody = await omitted.json() as Record<string, unknown>;
      assert.equal(omitted.status, 200);
      assert.equal('findStoreUrl' in omittedBody, false);
      assert.equal('defaultStoreImageUrl' in omittedBody, false);
    } finally {
      if (before.exists) await ref.set(before.data()!);
      else await ref.delete();
    }
  });

  it('version conflict on a second write', async () => {
    const response = await api(`/api/app/store-pages/${ownId}`, 'test-token-admin', {
      method: 'PATCH',
      body: JSON.stringify({ reviewUrl: GOOD_REVIEW_URL, expectedVersion: 0 }),
    });
    assert.equal(response.status, 409);
  });
});

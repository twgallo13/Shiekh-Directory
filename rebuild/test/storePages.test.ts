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

function encodedPast2048(prefix: string): string {
  const raw = `${prefix}${'é'.repeat(360)}`;
  const href = new URL(raw).href;
  if (raw.length >= href.length || href.length <= 2048) {
    throw new Error(`fixture did not grow past 2048: raw ${raw.length} href ${href.length}`);
  }
  return raw;
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
    for (const [name, token] of [
      ['viewer', 'test-token-viewer'],
      ['store', `test-token-${storeUid}`],
      ['leader', `test-token-${leaderUid}`],
    ] as Array<[string, string]>) {
      const denied = await api(`/api/app/store-pages/${ownId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ websiteUrl: 'https://www.shiekh.com/stores/own', expectedVersion: 0 }),
      });
      assert.equal(denied.status, 403, `${name} websiteUrl`);
    }

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

  it('T-D1c: websiteUrl rejects http and other hosts, Steward edits are audited, Viewer/Leader/Store get 403', async () => {
    const id = await seedTestLocation({
      storeNumber: `91${suffix.slice(-3)}`,
      name: 'Website Url Store',
      kind: 'store',
      lifecycle: 'active',
    });
    const rejected = [
      'http://www.shiekh.com/stores/48',
      'javascript:alert(1)',
      'https://qr.shiekh.store/s/48',
      'https://directory.shiekh.store/',
      'https://stores.shiekh.com/48',
      'https://google.com/',
      'https://user@www.shiekh.com/stores/48',
      'https://www.shiekh.com:8443/stores/48',
      'https://www.shiekh.com./stores/48',
      'https://www.shiekh.com/stores/48\t',
    ];
    for (const websiteUrl of rejected) {
      const response = await api(`/api/app/store-pages/${id}`, 'test-token-steward', {
        method: 'PATCH',
        body: JSON.stringify({ websiteUrl, expectedVersion: 0 }),
      });
      assert.equal(response.status, 400, websiteUrl);
      const body = await response.json() as { error?: { code?: string } };
      assert.equal(body.error?.code, 'invalid_website_url', websiteUrl);
      const page = await getTestDb().collection('storePages').doc(id).get();
      assert.equal(page.exists, false);
    }

    const good = 'https://www.shiekh.com/stores/48';
    const steward = await api(`/api/app/store-pages/${id}`, 'test-token-steward', {
      method: 'PATCH',
      body: JSON.stringify({ websiteUrl: good, expectedVersion: 0 }),
    });
    assert.equal(steward.status, 200);
    const saved = await getTestDb().collection('storePages').doc(id).get();
    assert.equal(saved.data()?.websiteUrl, 'https://www.shiekh.com/stores/48');
    const audits = await getTestDb().collection('auditLog').where('entityId', '==', id).get();
    const websiteAudits = audits.docs.filter((doc) => {
      const changes = doc.data().changes as Array<{ field?: string; newValue?: string }> | undefined;
      return doc.data().entityType === 'store-page' && changes?.some((change) => change.field === 'websiteUrl' && change.newValue === good);
    });
    assert.equal(websiteAudits.length, 1);
    assert.equal(websiteAudits[0].data().userRole, 'Steward');

    const version = saved.data()?.version ?? 1;
    const viewer = await api(`/api/app/store-pages/${id}`, 'test-token-viewer', {
      method: 'PATCH',
      body: JSON.stringify({ websiteUrl: 'https://shiekh.com/stores/48', expectedVersion: version }),
    });
    assert.equal(viewer.status, 403);
    const afterForbidden = await getTestDb().collection('storePages').doc(id).get();
    assert.equal(afterForbidden.data()?.websiteUrl, good);
    assert.equal(afterForbidden.data()?.version, version);
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
    const defaultStoreImageUrl = 'https://qr.shiekh.store/images/store-default.jpg';
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

      const tooLong = `https://qr.shiekh.store/${'a'.repeat(2040)}`;
      assert.ok(tooLong.length > 2048);
      const rejected = [
        'http://www.shiekh.com/stores',
        'javascript:alert(1)',
        'https://user:pass@www.shiekh.com/stores',
        'https://localhost/stores',
        'https://127.0.0.1/stores',
        'https://[::1]/stores',
        'https://qr.shiekh.store:8443/image.jpg',
        'https://shíekh.com/stores',
        'https://xn--shekh-0sa.com/stores',
        'https://example.com/stores',
        'https://evil.qr.shiekh.store/image.jpg',
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
      assert.deepEqual(offStore, {
        storeNumber: offNumber,
        status: 'Active',
        pageEnabled: false,
        name: 'Defaults Off',
        address: { city: 'Test City', state: 'CA' },
        reviewUrl: 'https://g.page/r/defaults-off/review',
        websiteUrl: null,
      });
      assert.deepEqual(retiredStore, {
        storeNumber: retiredNumber,
        status: 'Retired',
        name: 'Defaults Retired',
      });

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

  it('a partial defaults save keeps, clears, and audits each url on its own', async () => {
    const db = getTestDb();
    const ref = db.collection('settings').doc('storePageDefaults');
    const before = await ref.get();
    const tiles = {
      ...EMPTY_STORE_PAGE_TILES,
      returns: { ...EMPTY_STORE_PAGE_TILES.returns, url: 'https://www.shiekh.com/returns', show: true },
    };
    const findStoreUrl = 'https://shiekh.com/stores';
    const replacementFind = 'https://qr.shiekh.store/find';
    const defaultStoreImageUrl = 'https://qr.shiekh.store/images/store-default.jpg';
    try {
      const current = await api('/api/app/admin/store-page-defaults', 'test-token-admin');
      const currentBody = await current.json() as { data: { version: number } };
      const seeded = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: currentBody.data.version,
          tiles,
          findStoreUrl,
          defaultStoreImageUrl,
        }),
      });
      assert.equal(seeded.status, 200);
      const seededBody = await seeded.json() as { data: { version: number } };
      const beforeAudits = new Set(
        (await db.collection('auditLog').where('entityId', '==', 'defaults').get()).docs.map((doc) => doc.id),
      );

      const tilesOnly = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
        method: 'PUT',
        body: JSON.stringify({ expectedVersion: seededBody.data.version, tiles }),
      });
      assert.equal(tilesOnly.status, 200);
      const tilesOnlyBody = await tilesOnly.json() as { data: { version: number; findStoreUrl: string; defaultStoreImageUrl: string; tiles: { returns: { url: string } } } };
      assert.equal(tilesOnlyBody.data.version, seededBody.data.version + 1);
      assert.equal(tilesOnlyBody.data.findStoreUrl, findStoreUrl);
      assert.equal(tilesOnlyBody.data.defaultStoreImageUrl, defaultStoreImageUrl);
      assert.equal(tilesOnlyBody.data.tiles.returns.url, 'https://www.shiekh.com/returns');

      const clearFind = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: tilesOnlyBody.data.version,
          tiles,
          findStoreUrl: '',
        }),
      });
      assert.equal(clearFind.status, 200);
      const clearFindBody = await clearFind.json() as { data: { findStoreUrl: string | null; defaultStoreImageUrl: string } };
      assert.equal(clearFindBody.data.findStoreUrl, null);
      assert.equal(clearFindBody.data.defaultStoreImageUrl, defaultStoreImageUrl);

      const clearImage = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: tilesOnlyBody.data.version + 1,
          tiles,
          defaultStoreImageUrl: null,
        }),
      });
      assert.equal(clearImage.status, 200);
      const clearImageBody = await clearImage.json() as { data: { version: number; findStoreUrl: string | null; defaultStoreImageUrl: string | null } };
      assert.equal(clearImageBody.data.findStoreUrl, null);
      assert.equal(clearImageBody.data.defaultStoreImageUrl, null);

      const restored = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: clearImageBody.data.version,
          tiles,
          findStoreUrl,
          defaultStoreImageUrl,
        }),
      });
      const restoredBody = await restored.json() as { data: { version: number } };
      assert.equal(restored.status, 200);
      const changed = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: restoredBody.data.version,
          tiles,
          findStoreUrl: replacementFind,
        }),
      });
      assert.equal(changed.status, 200);
      const changedBody = await changed.json() as { data: { findStoreUrl: string; defaultStoreImageUrl: string; version: number } };
      assert.equal(changedBody.data.findStoreUrl, replacementFind);
      assert.equal(changedBody.data.defaultStoreImageUrl, defaultStoreImageUrl);
      assert.equal(changedBody.data.version, restoredBody.data.version + 1);

      const audits = await db.collection('auditLog').where('entityId', '==', 'defaults').get();
      const created = audits.docs.filter((doc) => !beforeAudits.has(doc.id));
      const findChange = created.flatMap((doc) => (doc.data().changes as Array<{ field: string; oldValue: string | null; newValue: string | null }>))
        .find((change) => change.field === 'findStoreUrl' && change.newValue === replacementFind);
      assert.equal(findChange?.oldValue, findStoreUrl);

      for (const bad of [12, { href: findStoreUrl }, ['https://shiekh.com/stores'], true]) {
        const response = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
          method: 'PUT',
          body: JSON.stringify({
            expectedVersion: changedBody.data.version,
            tiles,
            findStoreUrl: bad,
          }),
        });
        assert.equal(response.status, 400, typeof bad);
      }
      const afterBad = await ref.get();
      assert.equal(afterBad.data()?.findStoreUrl, replacementFind);
      assert.equal(afterBad.data()?.defaultStoreImageUrl, defaultStoreImageUrl);
      assert.equal(afterBad.data()?.version, changedBody.data.version);

      const imageOnFindHost = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: changedBody.data.version,
          tiles,
          defaultStoreImageUrl: 'https://www.shiekh.com/images/store.jpg',
        }),
      });
      assert.equal(imageOnFindHost.status, 400);
      const qrFind = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: changedBody.data.version,
          tiles,
          findStoreUrl: 'https://QR.shiekh.store/find',
          defaultStoreImageUrl: 'https://qr.shiekh.store/images/other.jpg',
        }),
      });
      assert.equal(qrFind.status, 200);
      const qrBody = await qrFind.json() as { data: { findStoreUrl: string; defaultStoreImageUrl: string } };
      assert.equal(qrBody.data.findStoreUrl, 'https://qr.shiekh.store/find');
      assert.equal(qrBody.data.defaultStoreImageUrl, 'https://qr.shiekh.store/images/other.jpg');
    } finally {
      if (before.exists) await ref.set(before.data()!);
      else await ref.delete();
    }
  });

  it('a stale defaults version is rejected and writes nothing', async () => {
    const db = getTestDb();
    const ref = db.collection('settings').doc('storePageDefaults');
    const before = await ref.get();
    try {
      const current = await api('/api/app/admin/store-page-defaults', 'test-token-admin');
      const currentBody = await current.json() as { data: { version: number } };
      const saved = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: currentBody.data.version,
          tiles: EMPTY_STORE_PAGE_TILES,
          findStoreUrl: 'https://shiekh.com/stores',
        }),
      });
      assert.equal(saved.status, 200);
      const savedBody = await saved.json() as { data: { version: number } };
      const stale = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: savedBody.data.version - 1,
          tiles: EMPTY_STORE_PAGE_TILES,
          findStoreUrl: 'https://www.shiekh.com/other',
        }),
      });
      const staleBody = await stale.json() as { error?: { code?: string } };
      assert.equal(stale.status, 409);
      assert.equal(staleBody.error?.code, 'version_conflict');
      const after = await ref.get();
      assert.equal(after.data()?.version, savedBody.data.version);
      assert.equal(after.data()?.findStoreUrl, 'https://shiekh.com/stores');
    } finally {
      if (before.exists) await ref.set(before.data()!);
      else await ref.delete();
    }
  });

  it('percent-encoded links past 2048 are rejected for review, website, tile, and find-a-store urls', async () => {
    const id = await seedTestLocation({
      storeNumber: `95${suffix.slice(-4)}`,
      name: 'Long Link',
      kind: 'store',
      lifecycle: 'active',
    });
    const review = await api(`/api/app/store-pages/${id}`, 'test-token-steward', {
      method: 'PATCH',
      body: JSON.stringify({ reviewUrl: encodedPast2048('https://g.page/r/'), expectedVersion: 0 }),
    });
    assert.equal(review.status, 400);
    assert.equal((await getTestDb().collection('storePages').doc(id).get()).data()?.reviewUrl, undefined);

    const website = await api(`/api/app/store-pages/${id}`, 'test-token-steward', {
      method: 'PATCH',
      body: JSON.stringify({ websiteUrl: encodedPast2048('https://www.shiekh.com/'), expectedVersion: 0 }),
    });
    assert.equal(website.status, 400);
    assert.equal((await getTestDb().collection('storePages').doc(id).get()).data()?.websiteUrl, undefined);

    const tiles = {
      ...EMPTY_STORE_PAGE_TILES,
      returns: { ...EMPTY_STORE_PAGE_TILES.returns, url: encodedPast2048('https://www.shiekh.com/'), show: true },
    };
    const current = await api('/api/app/admin/store-page-defaults', 'test-token-admin');
    const currentBody = await current.json() as { data: { version: number } };
    const tileSave = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
      method: 'PUT',
      body: JSON.stringify({ expectedVersion: currentBody.data.version, tiles }),
    });
    assert.equal(tileSave.status, 400);

    const findSave = await api('/api/app/admin/store-page-defaults', 'test-token-admin', {
      method: 'PUT',
      body: JSON.stringify({
        expectedVersion: currentBody.data.version,
        tiles: EMPTY_STORE_PAGE_TILES,
        findStoreUrl: encodedPast2048('https://www.shiekh.com/'),
      }),
    });
    assert.equal(findSave.status, 400);
  });

  it('version conflict on a second write', async () => {
    const response = await api(`/api/app/store-pages/${ownId}`, 'test-token-admin', {
      method: 'PATCH',
      body: JSON.stringify({ reviewUrl: GOOD_REVIEW_URL, expectedVersion: 0 }),
    });
    assert.equal(response.status, 409);
  });
});

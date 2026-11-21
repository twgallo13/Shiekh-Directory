import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { ChildProcess } from 'child_process';
import { getTestDb, seedTestLocation, seedTestUsers } from './testHelpers';
import { API_BASE, WEEK_HOURS, api } from './storePageHttp';
import { PUBLIC_PROFILE_RATE_LIMIT } from '../src/constants/storePage';
import { startFf606e5Server, stopChild } from './ff606e5Server';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = 'test-api-token-public-profile';
const ALL = 'test-api-token-all';
const LOCATIONS = 'test-api-token-locations';
const LIVE_KEYS = [
  'storeNumber', 'status', 'pageEnabled', 'updatedAt', 'name', 'mallOrCenterName',
  'address', 'timeZone', 'phone', 'hours', 'temporaryClosure', 'reviewUrl', 'magentoStoreId',
];

function stripRequestId(body: string): string {
  return body.replace(/"requestId":"[^"]*"/g, '"requestId":"X"');
}

describe('public store profile', () => {
  const stamp = String(Date.now());
  const liveNumber = `61${stamp.slice(-6)}`;
  const offNumber = `62${stamp.slice(-6)}`;
  const retiredNumber = `63${stamp.slice(-6)}`;
  const plannedNumber = `64${stamp.slice(-6)}`;
  const warehouseNumber = `65${stamp.slice(-6)}`;
  const collisionNumber = `66${stamp.slice(-6)}`;
  const privateNumber = `67${stamp.slice(-6)}`;
  const badUrlNumber = `68${stamp.slice(-6)}`;
  const noHoursNumber = `69${stamp.slice(-6)}`;
  let oldServer: ChildProcess | undefined;
  let oldPort = 0;

  before(async () => {
    const health = await fetch(`${API_BASE}/api/health`);
    assert.equal(health.status, 200, 'API server must be running on the emulator');
    await seedTestUsers();
  });

  after(() => {
    stopChild(oldServer);
  });

  async function enablePage(id: string, extra: Record<string, unknown>) {
    const now = new Date().toISOString();
    await getTestDb().collection('storePages').doc(id).set({
      reviewUrl: 'https://g.page/r/pilot/review',
      magentoStoreId: '420701',
      pageEnabled: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      ...extra,
    });
  }

  it('public_profile_isolation', async () => {
    const legacyPaths = [
      '/api/v1/location-fields',
      '/api/v1/locations?limit=1',
      '/api/v2/snapshot',
      '/api/v2/personnel',
      '/api/v2/location-staffing',
      '/api/v3/snapshot',
      '/api/v3/district-leadership',
      '/api/v3/location-districts',
    ];
    for (const path of legacyPaths) {
      const response = await api(path, PUBLIC);
      const body = await response.json() as { error?: { code?: string } };
      assert.equal(response.status, 403, path);
      assert.equal(body.error?.code, 'insufficient_scope');
    }
    for (const token of [ALL, LOCATIONS]) {
      for (const path of ['/api/public-profile/v1/stores', '/api/public-profile/v1/stores/1']) {
        const response = await api(path, token);
        const body = await response.json() as { error?: { code?: string } };
        assert.equal(response.status, 403, `${token} ${path}`);
        assert.equal(body.error?.code, 'insufficient_scope');
      }
    }

    const plannedId = await seedTestLocation({
      storeNumber: plannedNumber,
      name: 'SECRET_PLANNED',
      kind: 'store',
      lifecycle: 'planned',
    });
    const warehouseId = await seedTestLocation({
      storeNumber: warehouseNumber,
      name: 'SECRET_WAREHOUSE',
      kind: 'warehouse',
      lifecycle: 'active',
    });
    assert.ok(plannedId && warehouseId);
    const unknown = stripRequestId(await (await api('/api/public-profile/v1/stores/88888871', PUBLIC)).text());
    const planned = stripRequestId(await (await api(`/api/public-profile/v1/stores/${plannedNumber}`, PUBLIC)).text());
    const warehouse = stripRequestId(await (await api(`/api/public-profile/v1/stores/${warehouseNumber}`, PUBLIC)).text());
    assert.equal(planned, unknown);
    assert.equal(warehouse, unknown);
    assert.match(unknown, /store_not_found/);

    const digits = await api('/api/public-profile/v1/stores/12a', PUBLIC);
    const digitsBody = await digits.json() as { error?: { code?: string; message?: string } };
    assert.equal(digits.status, 400);
    assert.equal(digitsBody.error?.code, 'invalid_store_number');
    assert.equal(digitsBody.error?.message, 'Store number must be digits only.');
  });

  it('allowlist, closures, hours, and leading-zero lookup', async () => {
    const db = getTestDb();
    const liveId = await seedTestLocation({
      storeNumber: liveNumber,
      name: 'Pilot\u0007 Store',
      kind: 'store',
      lifecycle: 'active',
    });
    await db.collection('locations').doc(liveId).set({
      mallOrCenterName: 'Main Mall',
      address: { street: '1 Main', suite: 'A', city: 'Los Angeles', state: 'CA', zip: '90001', country: 'US' },
      timeZone: 'America/Los_Angeles',
      phonePublic: true,
      mainPhone: '+12135550148',
      standardHours: WEEK_HOURS,
      sharedInboxEmail: 'LEAKED_INBOX@secret.test',
      wayfindingDirections: 'SECRET_WAYFINDING',
      secretPersonName: 'SECRET_PERSON',
    }, { merge: true });
    await enablePage(liveId, {});
    await db.collection(`locations/${liveId}/hoursExceptions`).add({
      type: 'holiday',
      label: 'Holiday week',
      startDate: '2026-11-26',
      endDate: '2026-11-27',
      closed: false,
      intervals: [{ open: '12:00', close: '16:00' }],
      source: 'manual',
    });
    await db.collection(`locations/${liveId}/hoursExceptions`).add({
      type: 'holiday',
      label: 'x'.repeat(61),
      startDate: '2026-11-01',
      endDate: '2026-11-01',
      closed: true,
      intervals: [],
    });
    await db.collection(`locations/${liveId}/closures`).add({
      reason: 'Repair',
      reasonNote: 'SECRET_REASON_NOTE',
      publicExplanation: 'Closed for a repair',
      startsAt: '2026-11-20T08:00:00.000Z',
      endsAt: '2026-12-01T08:00:00.000Z',
      status: 'active',
    });

    const response = await api(`/api/public-profile/v1/stores/${liveNumber}`, PUBLIC);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json() as {
      contractVersion: string;
      generatedAt: string;
      companyTiles: Array<Record<string, unknown>>;
      stores: Array<Record<string, unknown>>;
    };
    assert.equal(response.status, 200);
    assert.equal(body.contractVersion, 'public-profile.v1');
    assert.equal(typeof body.generatedAt, 'string');
    assert.deepEqual(Object.keys(body).sort(), ['companyTiles', 'contractVersion', 'generatedAt', 'stores']);
    assert.equal(body.stores.length, 1);
    const store = body.stores[0];
    assert.deepEqual(Object.keys(store).sort(), [...LIVE_KEYS].sort());
    assert.equal(store.status, 'Temporarily Closed');
    assert.equal(store.pageEnabled, true);
    assert.equal(store.name, 'Pilot Store');
    assert.equal(store.timeZone, 'America/Los_Angeles');
    assert.equal(store.phone, '+12135550148');
    assert.equal(store.magentoStoreId, '420701');
    assert.equal(store.reviewUrl, 'https://g.page/r/pilot/review');
    const closure = store.temporaryClosure as Record<string, unknown>;
    assert.deepEqual(Object.keys(closure).sort(), ['publicExplanation', 'reopensOn']);
    assert.equal(closure.publicExplanation, 'Closed for a repair');
    assert.equal(closure.reopensOn, '2026-12-01');
    const hours = store.hours as { weekly: Record<string, { closed: boolean; intervals: Array<{ open: string; close: string }> } | null>; exceptions: Array<Record<string, unknown>> };
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    assert.deepEqual(Object.keys(hours.weekly), dayNames);
    for (const day of dayNames) {
      assert.notEqual(hours.weekly[day], null, day);
      assert.notEqual(hours.weekly[day], undefined, day);
      for (const interval of hours.weekly[day]!.intervals) {
        assert.match(interval.open, /^([01]\d|2[0-3]):[0-5]\d$/);
        assert.match(interval.close, /^([01]\d|2[0-3]):[0-5]\d$/);
      }
    }
    assert.deepEqual(hours.weekly.tuesday!.intervals, [{ open: '10:00', close: '18:00' }, { open: '19:00', close: '21:00' }]);
    assert.deepEqual(hours.weekly.wednesday!.intervals, [{ open: '22:00', close: '02:00' }]);
    assert.deepEqual(hours.weekly.thursday, { closed: true, intervals: [] });
    assert.equal(hours.exceptions.length, 1);
    assert.equal(hours.exceptions[0].type, 'holiday');
    assert.deepEqual(Object.keys(hours.exceptions[0]).sort(), ['closed', 'endDate', 'intervals', 'label', 'startDate', 'type']);
    assert.equal(hours.exceptions[0].endDate, '2026-11-27');
    assert.equal(hours.exceptions[0].source, undefined);
    assert.equal(Array.isArray(body.companyTiles), true);
    assert.equal('companyTiles' in store, false);
    assert.equal(body.companyTiles.some((tile) => tile.key === 'shop'), false);
    assert.equal('shop' in store, false);
    assert.equal('shopTileVisible' in store, false);
    const serialized = JSON.stringify(body);
    for (const secret of ['LEAKED_INBOX@secret.test', 'SECRET_WAYFINDING', 'SECRET_REASON_NOTE', 'SECRET_PERSON', 'defaultImage', 'imageUrl']) {
      assert.equal(serialized.includes(secret), false, secret);
    }

    const offId = await seedTestLocation({
      storeNumber: offNumber,
      name: 'SECRET_OFF_NAME',
      kind: 'store',
      lifecycle: 'active',
    });
    await db.collection(`locations/${offId}/closures`).add({
      reason: 'Repair',
      publicExplanation: 'SECRET_OFF_REASON',
      reasonNote: 'SECRET_OFF_NOTE',
      startsAt: '2026-11-20T08:00:00.000Z',
      endsAt: '2026-12-15T08:00:00.000Z',
      status: 'active',
    });
    const off = await api(`/api/public-profile/v1/stores/${offNumber}`, PUBLIC);
    const offBody = await off.json() as { stores: Array<Record<string, unknown>> };
    assert.deepEqual(Object.keys(offBody.stores[0]).sort(), ['pageEnabled', 'status', 'storeNumber']);
    assert.equal(offBody.stores[0].pageEnabled, false);
    assert.equal(offBody.stores[0].status, 'Temporarily Closed');
    assert.equal(JSON.stringify(offBody).includes('SECRET_OFF'), false);

    const retiredId = await seedTestLocation({
      storeNumber: retiredNumber,
      name: 'SECRET_RETIRED',
      kind: 'store',
      lifecycle: 'retired',
    });
    await enablePage(retiredId, { pageEnabled: true });
    const retired = await api(`/api/public-profile/v1/stores/${retiredNumber}`, PUBLIC);
    const retiredBody = await retired.json() as { stores: Array<Record<string, unknown>> };
    assert.deepEqual(retiredBody.stores[0], { storeNumber: retiredNumber, status: 'Retired' });
    assert.equal('pageEnabled' in retiredBody.stores[0], false);
    assert.equal(retiredBody.stores[0].status, 'Retired');

    const activeId = await seedTestLocation({
      storeNumber: collisionNumber,
      name: 'Collision Active',
      kind: 'store',
      lifecycle: 'active',
    });
    const retiredTwin = await seedTestLocation({
      storeNumber: collisionNumber,
      name: 'SECRET_COLLISION',
      kind: 'store',
      lifecycle: 'retired',
    });
    await db.collection('locations').doc(retiredTwin).set({ updatedAt: '2000-01-01T00:00:00.000Z' }, { merge: true });
    await db.collection('locations').doc(activeId).set({ updatedAt: '2098-01-01T00:00:00.000Z' }, { merge: true });
    await enablePage(activeId, { magentoStoreId: '420704' });
    await db.collection('locations').doc(activeId).set({ name: 'Collision Active' }, { merge: true });
    const collision = await api(`/api/public-profile/v1/stores/${collisionNumber}`, PUBLIC);
    const collisionBody = await collision.json() as { stores: Array<Record<string, unknown>> };
    assert.equal(collisionBody.stores.length, 1);
    assert.equal(collisionBody.stores[0].status, 'Active');
    assert.equal(collisionBody.stores[0].name, 'Collision Active');
    assert.equal(JSON.stringify(collisionBody).includes('SECRET_COLLISION'), false);

    const privateId = await seedTestLocation({
      storeNumber: privateNumber,
      name: 'Private Phone',
      kind: 'store',
      lifecycle: 'active',
    });
    await db.collection('locations').doc(privateId).set({
      phonePublic: false,
      mainPhone: '+19995550199',
    }, { merge: true });
    await enablePage(privateId, { magentoStoreId: '420702' });
    const hiddenPhone = await api(`/api/public-profile/v1/stores/${privateNumber}`, PUBLIC);
    const hiddenBody = await hiddenPhone.json() as { stores: Array<Record<string, unknown>> };
    assert.equal('phone' in hiddenBody.stores[0], false);
    assert.equal(JSON.stringify(hiddenBody).includes('+19995550199'), false);

    const bareId = await seedTestLocation({
      storeNumber: noHoursNumber,
      name: 'No Hours',
      kind: 'store',
      lifecycle: 'active',
    });
    await enablePage(bareId, { magentoStoreId: '420703', reviewUrl: null });
    const bare = await api(`/api/public-profile/v1/stores/${noHoursNumber}`, PUBLIC);
    const bareBody = await bare.json() as { stores: Array<Record<string, unknown>> };
    assert.equal(bareBody.stores[0].hours, null);
    await db.collection('locations').doc(bareId).set({
      standardHours: {
        friday: { closed: false, intervals: [{ open: '11:00', close: '19:00' }] },
      },
    }, { merge: true });
    const missingDay = await api(`/api/public-profile/v1/stores/${noHoursNumber}`, PUBLIC);
    const missingDayBody = await missingDay.json() as {
      stores: Array<{ hours: { weekly: Record<string, { closed: boolean; intervals: unknown[] } | null> } }>;
    };
    const missingWeekly = missingDayBody.stores[0].hours.weekly;
    assert.deepEqual(Object.keys(missingWeekly), ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
    assert.deepEqual(missingWeekly.monday, { closed: true, intervals: [] });
    assert.notEqual(missingWeekly.monday, null);
    assert.deepEqual(missingWeekly.friday!.intervals, [{ open: '11:00', close: '19:00' }]);

    const badId = await seedTestLocation({
      storeNumber: badUrlNumber,
      name: 'Bad Review',
      kind: 'store',
      lifecycle: 'active',
    });
    await enablePage(badId, {
      reviewUrl: 'https://www.google.com/url?q=https://evil.example',
      magentoStoreId: '0123',
    });
    const bad = await api(`/api/public-profile/v1/stores/${badUrlNumber}`, PUBLIC);
    const badBody = await bad.json() as { stores: Array<Record<string, unknown>> };
    assert.equal(badBody.stores[0].reviewUrl, null);
    assert.equal(badBody.stores[0].magentoStoreId, null);
    assert.equal(JSON.stringify(badBody).includes('evil.example'), false);
    assert.equal(JSON.stringify(badBody).includes('0123'), false);

    const zeroId = await seedTestLocation({
      storeNumber: '001',
      name: 'Pilot Leading Zero',
      kind: 'store',
      lifecycle: 'active',
    });
    await db.collection('locations').doc(zeroId).set({
      name: 'Pilot Leading Zero',
      updatedAt: '2099-12-31T00:00:00.000Z',
    }, { merge: true });
    await enablePage(zeroId, { magentoStoreId: '420799', reviewUrl: 'https://g.page/r/zero/review' });
    const zero = await api('/api/public-profile/v1/stores/001', PUBLIC);
    const zeroBody = await zero.json() as { stores: Array<{ storeNumber: string; name?: string }> };
    assert.equal(zero.status, 200);
    assert.equal(zeroBody.stores[0].storeNumber, '001');
    assert.equal(zeroBody.stores[0].name, 'Pilot Leading Zero');

    const listed = await api('/api/public-profile/v1/stores', PUBLIC);
    const listBody = await listed.json() as { stores: Array<{ storeNumber: string }> };
    const numbers = listBody.stores.map((store) => store.storeNumber);
    assert.equal(numbers.includes(liveNumber), true);
    assert.equal(numbers.includes(plannedNumber), false);
    assert.equal(numbers.includes(warehouseNumber), false);
    assert.equal(numbers.filter((number) => number === collisionNumber).length, 1);
  });

  it('public-profile keys require an explicit rate limit and no other scope', async () => {
    const mixed = await api('/api/app/api-clients', 'test-token-admin', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Mixed pilot key',
        scopes: ['public-profile:read', 'locations:read'],
        rateLimit: 60,
      }),
    });
    assert.equal(mixed.status, 400);
    const missing = await api('/api/app/api-clients', 'test-token-admin', {
      method: 'POST',
      body: JSON.stringify({ name: 'No limit pilot key', scopes: ['public-profile:read'] }),
    });
    const missingBody = await missing.json() as { error?: { code?: string } };
    assert.equal(missing.status, 400);
    assert.equal(missingBody.error?.code, 'rate_limit_required');
    const locationsOnly = await api('/api/app/api-clients', 'test-token-admin', {
      method: 'POST',
      body: JSON.stringify({ name: `Locations ${stamp}`, scopes: ['locations:read'] }),
    });
    assert.equal(locationsOnly.status, 201);
  });

  it('omits company tiles with no Admin-saved https url', async () => {
    const db = getTestDb();
    const ref = db.collection('settings').doc('storePageDefaults');
    await ref.delete();
    const empty = await api('/api/public-profile/v1/stores', PUBLIC);
    assert.equal(empty.status, 200);
    const emptyBody = await empty.json() as { companyTiles: unknown[] };
    assert.deepEqual(emptyBody.companyTiles, []);

    await ref.set({
      version: 1,
      tiles: {
        instagram: { label: 'Instagram', url: 'https://www.instagram.com/shiekh', show: true },
        returns: { label: 'Return policy', url: 'https://www.shiekh.com/returns' },
        launch: { label: 'Launch Calendar', url: 'https://www.shiekh.com/launch', show: false },
        rewards: { label: 'Legacy rewards', url: null, show: true },
        card: { label: 'Sunbit card' },
        app: { label: 'Get the app', iosUrl: 'http://apps.apple.com/app/id1', androidUrl: null, show: true },
      },
    });
    const partial = await api('/api/public-profile/v1/stores', PUBLIC);
    const partialBody = await partial.json() as { companyTiles: Array<{ key: string; url: string; order: number }> };
    assert.deepEqual(
      partialBody.companyTiles.map((tile) => tile.key),
      ['instagram', 'returns'],
    );
    assert.deepEqual(
      partialBody.companyTiles.map((tile) => tile.url),
      ['https://www.instagram.com/shiekh', 'https://www.shiekh.com/returns'],
    );
    assert.deepEqual(partialBody.companyTiles.map((tile) => tile.order), [5, 8]);
    assert.equal(partialBody.companyTiles.some((tile) => tile.key === 'shop' || tile.key === 'app'), false);
    await ref.delete();
    const cleared = await api('/api/public-profile/v1/stores', PUBLIC);
    const clearedBody = await cleared.json() as { companyTiles: unknown[] };
    assert.deepEqual(clearedBody.companyTiles, []);
  });

  it('a 15-minute public-profile refresh is not throttled', async () => {
    const burst = 1 + 3 + 5;
    assert.equal(PUBLIC_PROFILE_RATE_LIMIT, 120);
    assert.ok(PUBLIC_PROFILE_RATE_LIMIT >= burst * 4);
    const created = await api('/api/app/api-clients', 'test-token-admin', {
      method: 'POST',
      body: JSON.stringify({
        name: `Refresh ${stamp}`,
        scopes: ['public-profile:read'],
        rateLimit: PUBLIC_PROFILE_RATE_LIMIT,
      }),
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json() as {
      token?: string;
      client?: { id?: string; rateLimit?: number };
    };
    assert.equal(createdBody.client?.rateLimit, 120);
    const token = createdBody.token;
    const clientId = createdBody.client?.id;
    assert.equal(typeof token, 'string');
    assert.equal(typeof clientId, 'string');
    const paths = [
      '/api/public-profile/v1/stores',
      '/api/public-profile/v1/stores',
      '/api/public-profile/v1/stores',
      '/api/public-profile/v1/stores',
      '/api/public-profile/v1/stores/1',
      '/api/public-profile/v1/stores/1',
      '/api/public-profile/v1/stores/1',
      '/api/public-profile/v1/stores/1',
      '/api/public-profile/v1/stores/1',
    ];
    assert.equal(paths.length, burst);
    const statuses: number[] = [];
    for (const path of paths) {
      const response = await api(path, token || null);
      statuses.push(response.status);
      await response.arrayBuffer();
    }
    assert.deepEqual(statuses.filter((status) => status === 429), []);
    assert.equal(statuses[0], 200);
    if (clientId) {
      const blocked = await api(`/api/app/api-clients/${clientId}/rate-limit`, 'test-token-admin', {
        method: 'POST',
        body: JSON.stringify({ rateLimit: 0 }),
      });
      const blockedBody = await blocked.json() as { error?: { code?: string } };
      assert.equal(blocked.status, 400);
      assert.equal(blockedBody.error?.code, 'rate_limit_required');
      const kept = await api(`/api/app/api-clients/${clientId}/rate-limit`, 'test-token-admin', {
        method: 'POST',
        body: JSON.stringify({ rateLimit: 120 }),
      });
      assert.equal(kept.status, 200);
      const revoked = await api(`/api/app/api-clients/${clientId}/revoke`, 'test-token-admin', { method: 'POST' });
      await revoked.arrayBuffer();
      assert.equal(revoked.status, 200);
    }
  });

  it('the management CLI keeps public-profile:read alone and rate limited', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const project = process.env.GCLOUD_PROJECT || 'demo-storepage-dir';
    const run = (args: string[]) => spawnSync('npx', ['tsx', 'scripts/manage-api-client.ts', '--project', project, ...args], {
      cwd: root,
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:18581',
        GCLOUD_PROJECT: project,
      },
      encoding: 'utf8',
    });
    const mixed = run(['create', '--name', `Mixed CLI ${stamp}`, '--scopes', 'public-profile:read,locations:read', '--rate-limit', '120']);
    assert.equal(mixed.status, 1);
    const missingLimit = run(['create', '--name', `No limit CLI ${stamp}`, '--scopes', 'public-profile:read']);
    assert.equal(missingLimit.status, 1);
    const created = run(['create', '--name', `Public CLI ${stamp}`, '--scopes', 'public-profile:read', '--rate-limit', '120']);
    assert.equal(created.status, 0, created.stderr);
    return getTestDb().collection('apiClients').where('name', '==', `Public CLI ${stamp}`).get().then(async (snap) => {
      assert.equal(snap.size, 1);
      assert.deepEqual(snap.docs[0].data().scopes, ['public-profile:read']);
      assert.equal(snap.docs[0].data().rateLimit, 120);
      await snap.docs[0].ref.delete();
    });
  });

  it('an expired closure does not mark the store temporarily closed', async () => {
    const number = `77${stamp.slice(-6)}`;
    const id = await seedTestLocation({
      storeNumber: number,
      name: 'Reopened Store',
      kind: 'store',
      lifecycle: 'active',
    });
    await getTestDb().collection('locations').doc(id).set({
      timeZone: 'America/Los_Angeles',
    }, { merge: true });
    await enablePage(id, { magentoStoreId: '420712', reviewUrl: null });
    const closures = getTestDb().collection('locations').doc(id).collection('closures');
    await closures.add({
      reason: 'Old repair',
      publicExplanation: 'SECRET_EXPIRED',
      startsAt: '2020-01-01T00:00:00.000Z',
      endsAt: '2020-01-02T00:00:00.000Z',
      status: 'active',
    });
    const expired = await api(`/api/public-profile/v1/stores/${number}`, PUBLIC);
    const expiredBody = await expired.json() as { stores: Array<{ status: string; temporaryClosure: unknown }> };
    assert.equal(expired.status, 200);
    assert.equal(expiredBody.stores[0].status, 'Active');
    assert.equal(expiredBody.stores[0].temporaryClosure, null);
    assert.equal(JSON.stringify(expiredBody).includes('SECRET_EXPIRED'), false);
    await closures.add({
      reason: 'Current repair',
      publicExplanation: 'Closed this week',
      startsAt: '2026-11-20T00:00:00.000Z',
      endsAt: '2026-12-20T00:00:00.000Z',
      status: 'active',
    });
    const current = await api(`/api/public-profile/v1/stores/${number}`, PUBLIC);
    const currentBody = await current.json() as {
      stores: Array<{ status: string; temporaryClosure: { publicExplanation: string } | null }>;
    };
    assert.equal(currentBody.stores[0].status, 'Temporarily Closed');
    assert.equal(currentBody.stores[0].temporaryClosure?.publicExplanation, 'Closed this week');
  });

  it('firestore.rules, indexes, and legacy routes are unchanged from ff606e5', () => {
    const diff = execFileSync('git', [
      'diff', '--exit-code', 'ff606e5', '--',
      'rebuild/server/routes/legacyV1.ts',
      'rebuild/server/routes/legacyV2.ts',
      'rebuild/server/routes/legacyV3.ts',
      'rebuild/firestore.rules',
      'rebuild/firestore.indexes.json',
    ], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(diff, '');
  });

  it('legacy_golden_unchanged', async () => {
    oldServer = await startFf606e5Server(13952);
    oldPort = 13952;
    const oldBase = 'http://127.0.0.1:13952';
    const paths = [
      '/api/v1/location-fields',
      '/api/v1/locations?limit=50',
      `/api/v1/locations/${liveNumber}`,
      `/api/v1/locations/${liveNumber}/operating-state`,
    ];
    for (const path of paths) {
      await compareBytes(path, `${API_BASE}${path}`, `${oldBase}${path}`);
    }
    await compareSnapshotFamily(API_BASE, oldBase, '/api/v2', ['/personnel?limit=50', '/location-staffing?limit=50']);
    await compareSnapshotFamily(API_BASE, oldBase, '/api/v3', ['/district-leadership?limit=50', '/location-districts?limit=50']);
  });

  it('rollback_drill', async () => {
    if (!oldServer || oldServer.exitCode !== null) {
      oldServer = await startFf606e5Server(13953);
      oldPort = 13953;
    }
    const base = `http://127.0.0.1:${oldPort}`;
    const locationId = await seedTestLocation({
      storeNumber: `70${stamp.slice(-6)}`,
      name: 'Rollback Store',
      kind: 'store',
      lifecycle: 'active',
    });
    const db = getTestDb();
    const before = (await db.collection('locations').doc(locationId).get()).data()!;
    const now = new Date().toISOString();
    const ref = db.collection('corrections').doc();
    await ref.set({
      status: 'pending',
      type: 'other',
      category: 'store-link',
      locationId,
      locationName: 'Rollback Store',
      storeNumber: before.storeNumber,
      submittedBy: 'viewer',
      submittedByEmail: 'viewer@test.com',
      submittedByRole: 'Viewer',
      submittedAt: now,
      expiresAt: now,
      proposedChanges: { reviewUrl: 'https://g.page/r/rollback/review' },
      currentValues: {},
      locationVersion: before.version,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'viewer',
      version: 1,
    });
    const response = await fetch(`${base}/api/app/corrections/${ref.id}/reject`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token-steward',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notes: 'rollback drill' }),
    });
    assert.equal(response.status, 200);
    const after = (await db.collection('locations').doc(locationId).get()).data()!;
    assert.equal(after.version, before.version);
    assert.equal(after.updatedAt, before.updatedAt);
    assert.equal(after.reviewUrl, undefined);
    assert.equal((await ref.get()).data()?.status, 'rejected');
  });
});

const DROP = new Set([
  'requestId', 'evaluatedAt', 'snapshotAt', 'expiresAt', 'watermark', 'generatedAt', 'nextTransitionAt',
]);

function decodeCursor(value: string): unknown {
  const [encoded] = value.split('.');
  if (!encoded) return value;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return value;
  }
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (DROP.has(key)) continue;
      if ((key === 'snapshot' || key === 'nextCursor' || key === 'cursor') && typeof item === 'string') {
        const decoded = decodeCursor(item);
        out[key] = decoded === item ? item : normalize(decoded);
        continue;
      }
      out[key] = normalize(item);
    }
    return out;
  }
  return value;
}

async function readNormalized(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${ALL}` } });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: normalize(parsed) };
}

async function compareBytes(label: string, leftUrl: string, rightUrl: string): Promise<void> {
  let last = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const [left, right] = await Promise.all([readNormalized(leftUrl), readNormalized(rightUrl)]);
    const a = JSON.stringify(left);
    const b = JSON.stringify(right);
    if (a === b) return;
    last = `${label} ${left.status}/${right.status} ${a.slice(0, 240)} != ${b.slice(0, 240)}`;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.fail(last);
}

async function compareSnapshotFamily(branch: string, oldBase: string, prefix: string, followUps: string[]): Promise<void> {
  let last = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const [branchSnap, oldSnap] = await Promise.all([
      fetch(`${branch}${prefix}/snapshot`, { headers: { Authorization: `Bearer ${ALL}` } }),
      fetch(`${oldBase}${prefix}/snapshot`, { headers: { Authorization: `Bearer ${ALL}` } }),
    ]);
    const branchJson = await branchSnap.json() as { snapshot?: string };
    const oldJson = await oldSnap.json() as { snapshot?: string };
    const snapOk = JSON.stringify(normalize(branchJson)) === JSON.stringify(normalize(oldJson));
    const bodies: string[] = [];
    let followOk = true;
    for (const path of followUps) {
      const [left, right] = await Promise.all([
        readNormalized(`${branch}${prefix}${path}${path.includes('?') ? '&' : '?'}snapshot=${encodeURIComponent(branchJson.snapshot || '')}`),
        readNormalized(`${oldBase}${prefix}${path}${path.includes('?') ? '&' : '?'}snapshot=${encodeURIComponent(oldJson.snapshot || '')}`),
      ]);
      const a = JSON.stringify(left);
      const b = JSON.stringify(right);
      if (a !== b) {
        followOk = false;
        bodies.push(`${path} ${a.slice(0, 180)} != ${b.slice(0, 180)}`);
      }
    }
    if (snapOk && followOk) return;
    last = bodies.join('\n') || `${prefix} snapshot mismatch`;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.fail(last);
}

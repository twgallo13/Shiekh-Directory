/**
 * Registration gate on the real server (server/index.ts), against the emulators.
 * Middleware order is the one mounted in server/index.ts.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { seedTestUsers, getTestDb } from './testHelpers';
import { hashToken } from '../server/middleware/legacyApiAuth';
import { hashSessionId } from '../server/services/tokenAuth';

const API = process.env.API_BASE || 'http://localhost:3001';
const rid = `reg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function token(uid: string, email?: string, provider?: 'google' | 'password', extra?: 'verified' | 'unverified'): string {
  if (!email) return `test-token-${uid}`;
  if (provider === 'google') {
    return extra === 'unverified'
      ? `test-token-${uid}:${email}:google:unverified`
      : `test-token-${uid}:${email}:google`;
  }
  if (provider === 'password') {
    return extra === 'verified'
      ? `test-token-${uid}:${email}:password:verified`
      : `test-token-${uid}:${email}:password`;
  }
  return `test-token-${uid}:${email}`;
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, init);
}

async function authed(path: string, bearer: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${bearer}`);
  return api(path, { ...init, headers });
}

async function readError(res: Response): Promise<{ status: number; code?: string; body: Record<string, unknown> }> {
  const body = await res.json() as Record<string, unknown>;
  const error = body.error as { code?: string } | undefined;
  return { status: res.status, code: error?.code, body };
}

function assertNoData(body: Record<string, unknown>) {
  assert.ok(!('data' in body), `response must not include data: ${JSON.stringify(body)}`);
  const error = body.error as { code?: string; message?: string; requestId?: string } | undefined;
  assert.ok(error && typeof error.code === 'string' && typeof error.message === 'string' && typeof error.requestId === 'string',
    `error shape: ${JSON.stringify(body)}`);
}

async function putUser(uid: string, fields: Record<string, unknown>) {
  const db = getTestDb();
  const now = new Date().toISOString();
  await db.collection('users').doc(uid).set({
    id: uid,
    email: `user-${uid}@shiekhshoes.org`,
    displayName: uid,
    role: 'Viewer',
    createdAt: now,
    updatedAt: now,
    updatedBy: 'registration-test',
    version: 1,
    ...fields,
  });
}

describe('registration gate', () => {
  before(async () => {
    const health = await api('/api/health');
    assert.strictEqual(health.status, 200, 'server/index.ts must be running against the emulators');
    await seedTestUsers();
  });

  const dataRoutes = [
    '/api/app/locations?kind=store',
    '/api/app/people',
    '/api/app/search?q=store',
    '/api/app/assignments/location/none',
    '/api/app/regions',
    '/api/app/districts',
  ];

  it('gmail token with no record is 403 domain_not_allowed and returns no data', async () => {
    const bearer = token(`gmail-none-${rid}`, `person-${rid}@gmail.com`, 'google');
    for (const path of dataRoutes) {
      const res = await authed(path, bearer);
      const parsed = await readError(res);
      assert.strictEqual(parsed.status, 403, path);
      assert.strictEqual(parsed.code, 'domain_not_allowed', path);
      assertNoData(parsed.body);
    }
    assert.strictEqual((await getTestDb().collection('users').doc(`gmail-none-${rid}`).get()).exists, false);
  });

  it('registered gmail account with an active record passes a data route', async () => {
    const uid = `gmail-rec-${rid}`;
    await putUser(uid, { email: `kept-${rid}@gmail.com`, role: 'Viewer', status: 'active' });
    const res = await authed('/api/app/regions', token(uid, `kept-${rid}@gmail.com`, 'google'));
    assert.strictEqual(res.status, 200, await res.clone().text());
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
  });

  it('password account @shiekhshoes.com with an active record passes a data route', async () => {
    const uid = `pw-com-${rid}`;
    const email = `steward-${rid}@shiekhshoes.com`;
    await putUser(uid, { email, role: 'Steward', status: 'active' });
    const res = await authed('/api/app/regions', token(uid, email, 'password'));
    assert.strictEqual(res.status, 200, await res.clone().text());
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
  });

  it('password account with email_verified false and a record still passes /users/me and a data route', async () => {
    const uid = `pw-unverified-${rid}`;
    const email = `qa-${rid}@shiekh.test`;
    await putUser(uid, { email, role: 'Steward', status: 'active' });
    const bearer = token(uid, email, 'password');
    const me = await authed('/api/app/users/me', bearer);
    assert.strictEqual(me.status, 200, await me.clone().text());
    assert.strictEqual((await me.json()).data.role, 'Steward');
    const regions = await authed('/api/app/regions', bearer);
    assert.strictEqual(regions.status, 200, await regions.clone().text());
  });

  it('company-domain password account with no record gets 403 not_registered', async () => {
    const res = await authed('/api/app/regions', token(`pw-none-${rid}`, `none-${rid}@shiekhshoes.org`, 'password', 'verified'));
    const parsed = await readError(res);
    assert.strictEqual(parsed.status, 403);
    assert.strictEqual(parsed.code, 'not_registered');
    assertNoData(parsed.body);
  });

  it('GET /users/me for gmail is 403 and creates no user; other /users/me shapes are blocked', async () => {
    const uid = `gmail-me-${rid}`;
    const email = `new-${rid}@gmail.com`;
    const res = await authed('/api/app/users/me', token(uid, email, 'google'));
    const parsed = await readError(res);
    assert.strictEqual(parsed.status, 403);
    assert.strictEqual(parsed.code, 'domain_not_allowed');
    assertNoData(parsed.body);
    assert.strictEqual((await getTestDb().collection('users').doc(uid).get()).exists, false);

    const bare = `bare-${rid}`;
    const bareEmail = `bare-${rid}@shiekhshoes.org`;
    const cases: Array<{ method: string; path: string }> = [
      { method: 'HEAD', path: '/api/app/users/me' },
      { method: 'POST', path: '/api/app/users/me' },
      { method: 'GET', path: '/api/app/users/me/x' },
      { method: 'GET', path: '/api/app/users/meX' },
      { method: 'GET', path: '/api/app/Users/me' },
    ];
    for (const c of cases) {
      const blocked = await authed(c.path, token(bare, bareEmail, 'password', 'verified'), { method: c.method });
      const bodyText = await blocked.text();
      assert.strictEqual(blocked.status, 403, `${c.method} ${c.path} -> ${blocked.status} ${bodyText}`);
      if (bodyText) {
        const body = JSON.parse(bodyText) as Record<string, unknown>;
        assert.strictEqual((body.error as { code?: string }).code, 'not_registered');
        assertNoData(body);
      }
    }
    const open = await authed('/api/app/users/me', token(bare, bareEmail, 'password', 'verified'));
    assert.strictEqual(open.status, 404, 'exact GET /users/me reaches the handler');
    assert.strictEqual((await open.json()).error.code, 'user_not_found');
    assert.strictEqual((await getTestDb().collection('users').doc(bare).get()).exists, false);
  });

  it('new company Google user with email_verified is created and can read regions; unverified creates nothing', async () => {
    const unverified = `g-unv-${rid}`;
    const unverifiedEmail = `unv-${rid}@shiekhshoes.org`;
    const denied = await authed('/api/app/users/me', token(unverified, unverifiedEmail, 'google', 'unverified'));
    assert.strictEqual(denied.status, 403, await denied.clone().text());
    assert.strictEqual((await denied.json()).error.code, 'email_not_verified');
    assert.strictEqual((await getTestDb().collection('users').doc(unverified).get()).exists, false);
    const stillBlocked = await authed('/api/app/regions', token(unverified, unverifiedEmail, 'google', 'unverified'));
    assert.strictEqual(stillBlocked.status, 403);

    const uid = `g-new-${rid}`;
    const email = `new-${rid}@shiekhshoes.org`;
    const created = await authed('/api/app/users/me', token(uid, email, 'google'));
    assert.strictEqual(created.status, 200, await created.clone().text());
    assert.strictEqual((await created.json()).data.role, 'Viewer');
    const doc = await getTestDb().collection('users').doc(uid).get();
    assert.strictEqual(doc.exists, true);
    assert.strictEqual(doc.data()?.email, email);
    assert.strictEqual(doc.data()?.status, 'active');
    const regions = await authed('/api/app/regions', token(uid, email, 'google'));
    assert.strictEqual(regions.status, 200, await regions.clone().text());
  });

  it('Google domain is exact lowercase shiekhshoes.org', async () => {
    const mixedUid = `g-case-${rid}`;
    const mixed = await authed('/api/app/users/me', token(mixedUid, `Case-${rid}@ShiekhShoes.org`, 'google'));
    assert.strictEqual(mixed.status, 200, await mixed.clone().text());
    assert.strictEqual((await getTestDb().collection('users').doc(mixedUid).get()).data()?.email, `case-${rid}@shiekhshoes.org`);

    const blocked: Array<{ email: string }> = [
      { email: `com-${rid}@shiekhshoes.com` },
      { email: `evil-${rid}@shiekhshoes.org.evil.com` },
      { email: `look-${rid}@xshiekhshoes.org` },
    ];
    for (const row of blocked) {
      const uid = `g-bad-${row.email}`;
      const res = await authed('/api/app/users/me', token(uid, row.email, 'google'));
      const parsed = await readError(res);
      assert.strictEqual(parsed.status, 403, row.email);
      assert.strictEqual(parsed.code, 'domain_not_allowed', row.email);
      assert.strictEqual((await getTestDb().collection('users').doc(uid).get()).exists, false, row.email);
      const data = await authed('/api/app/locations?kind=store', token(uid, row.email, 'google'));
      const dataParsed = await readError(data);
      assert.strictEqual(dataParsed.status, 403, row.email);
      assert.strictEqual(dataParsed.code, 'domain_not_allowed', row.email);
      assertNoData(dataParsed.body);
    }
  });

  it('does not link a Google @shiekhshoes.com sign-in to a pre-provisioned record', async () => {
    const email = `pre-${rid}@shiekhshoes.com`;
    const pre = `pre-${rid}`;
    await putUser(pre, { email, role: 'Steward', status: 'active' });
    const uid = `g-link-${rid}`;
    const res = await authed('/api/app/users/me', token(uid, email, 'google'));
    const parsed = await readError(res);
    assert.strictEqual(parsed.status, 403);
    assert.strictEqual(parsed.code, 'domain_not_allowed');
    assert.strictEqual((await getTestDb().collection('users').doc(uid).get()).exists, false);
    assert.strictEqual((await getTestDb().collection('users').doc(pre).get()).exists, true);
  });

  it('forced lookup error and forced leader-scope error are 403 user_lookup_failed', async () => {
    const lookupUid = `fault-lookup-${rid}`;
    const lookup = await authed('/api/app/regions', token(lookupUid, `lookup-${rid}@shiekhshoes.org`, 'password', 'verified'));
    const lookupParsed = await readError(lookup);
    assert.strictEqual(lookupParsed.status, 403);
    assert.strictEqual(lookupParsed.code, 'user_lookup_failed');
    assertNoData(lookupParsed.body);

    const scopeUid = `fault-leader-scope-${rid}`;
    await putUser(scopeUid, { email: `scope-${rid}@shiekhshoes.org`, role: 'Leader', status: 'active' });
    const scope = await authed('/api/app/regions', token(scopeUid, `scope-${rid}@shiekhshoes.org`, 'password', 'verified'));
    const scopeParsed = await readError(scope);
    assert.strictEqual(scopeParsed.status, 403);
    assert.strictEqual(scopeParsed.code, 'user_lookup_failed');
    assertNoData(scopeParsed.body);
  });

  it('status allow-list: missing, active, and pending pass; every other value is blocked', async () => {
    const passing: Array<{ name: string; status?: string }> = [
      { name: 'missing' },
      { name: 'active', status: 'active' },
      { name: 'pending', status: 'pending' },
    ];
    for (const row of passing) {
      const uid = `st-ok-${row.name}-${rid}`;
      const email = `${row.name}-${rid}@shiekhshoes.org`;
      const fields: Record<string, unknown> = { email, role: 'Viewer' };
      if (row.status !== undefined) fields.status = row.status;
      await putUser(uid, fields);
      const bearer = token(uid, email, 'password', 'verified');
      const data = await authed('/api/app/regions', bearer);
      assert.strictEqual(data.status, 200, `${row.name} data ${await data.clone().text()}`);
      const me = await authed('/api/app/users/me', bearer);
      assert.strictEqual(me.status, 200, `${row.name} me ${await me.clone().text()}`);
    }

    const blocked = ['disabled', 'suspended', 'inactive', 'Disabled', 'deactivated', ''];
    for (const status of blocked) {
      const uid = `st-no-${status === '' ? 'empty' : status}-${rid}`;
      const email = `blocked-${status === '' ? 'empty' : status}-${rid}@shiekhshoes.org`;
      await putUser(uid, { email, role: 'Viewer', status });
      const bearer = token(uid, email, 'password', 'verified');
      const data = await authed('/api/app/regions', bearer);
      const dataParsed = await readError(data);
      assert.strictEqual(dataParsed.status, 403, `data status ${JSON.stringify(status)}`);
      assert.strictEqual(dataParsed.code, 'account_disabled', `data status ${JSON.stringify(status)}`);
      assertNoData(dataParsed.body);
      const me = await authed('/api/app/users/me', bearer);
      const meParsed = await readError(me);
      assert.strictEqual(meParsed.status, 403, `me status ${JSON.stringify(status)}`);
      assert.strictEqual(meParsed.code, 'account_disabled', `me status ${JSON.stringify(status)}`);
      assertNoData(meParsed.body);
    }
  });

  it('store session with no users record passes; expired or revoked session plus a gmail token is blocked', async () => {
    const db = getTestDb();
    const sessionId = `session-${rid}`;
    const sessionHash = hashSessionId(sessionId);
    await db.collection('storeSessions').doc(sessionHash).set({
      locationId: `store-loc-${rid}`,
      storeNumber: '71',
      email: 'store71@shiekhshoes.com',
      role: 'Store',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      revoked: false,
    });
    assert.strictEqual((await db.collection('users').doc(`store_store-loc-${rid}`).get()).exists, false);

    const ok = await api('/api/app/regions', { headers: { Authorization: `StoreSession ${sessionId}` } });
    assert.strictEqual(ok.status, 200, await ok.clone().text());

    const gmail = token(`gmail-sess-${rid}`, `sess-${rid}@gmail.com`, 'google');
    await db.collection('storeSessions').doc(sessionHash).update({
      expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
    });
    const expired = await authed('/api/app/regions', gmail, { headers: { Cookie: `__session=${sessionId}` } });
    const expiredParsed = await readError(expired);
    assert.strictEqual(expiredParsed.status, 403);
    assert.strictEqual(expiredParsed.code, 'domain_not_allowed');
    assertNoData(expiredParsed.body);

    await db.collection('storeSessions').doc(sessionHash).update({
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      revoked: true,
    });
    const revoked = await authed('/api/app/locations?kind=store', gmail, { headers: { Cookie: `__session=${sessionId}` } });
    const revokedParsed = await readError(revoked);
    assert.strictEqual(revokedParsed.status, 403);
    assert.strictEqual(revokedParsed.code, 'domain_not_allowed');
    assertNoData(revokedParsed.body);
  });

  it('seeded roles Viewer, Store, Leader, Steward, and Admin pass', async () => {
    const storeUid = 'store';
    await putUser(storeUid, {
      email: 'store@test.com',
      displayName: 'Test Store',
      role: 'Store',
      status: 'active',
      storeLocationId: `store-loc-role-${rid}`,
    });
    const roles = ['viewer', 'store', 'leader', 'steward', 'admin'];
    for (const role of roles) {
      const res = await authed('/api/app/regions', `test-token-${role}`);
      assert.strictEqual(res.status, 200, `${role} ${await res.clone().text()}`);
      const body = await res.json();
      assert.ok(Array.isArray(body.data), role);
    }
  });

  it('consumer /api/v1/locations accepts a seeded shk_ key and rejects a Firebase ID token', async () => {
    const db = getTestDb();
    const raw = `shk_registration_${rid}`;
    await db.collection('apiClients').doc(`client-${rid}`).set({
      name: `registration ${rid}`,
      tokenHash: hashToken(raw),
      scopes: ['locations:read'],
      active: true,
      version: 1,
      createdAt: new Date().toISOString(),
    });
    const ok = await api('/api/v1/locations?limit=5', { headers: { Authorization: `Bearer ${raw}` } });
    assert.strictEqual(ok.status, 200, await ok.clone().text());
    const body = await ok.json();
    assert.ok(Array.isArray(body.data), 'consumer API still returns location data');

    const firebase = await api('/api/v1/locations?limit=5', { headers: { Authorization: 'Bearer test-token-admin' } });
    assert.strictEqual(firebase.status, 401, await firebase.clone().text());
    const firebaseBody = await firebase.json();
    assert.ok(!Array.isArray(firebaseBody.data), 'Firebase ID token must not read the consumer API');
  });
});

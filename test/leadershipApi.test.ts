import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import express from 'express';
import type { ManagedApiCredential } from '../server/apiClientApi';
import { createLeadershipApiRouter, LEADERSHIP_SNAPSHOT_TTL_MS } from '../server/leadershipApi';
import { createPersonnelApiRouter } from '../server/personnelApi';
import { createApiDocumentationRouter } from '../server/apiDocumentation';
import type { LeadershipReadOptions, LeadershipRepository } from '../server/firestoreLeadership';
import { projectDistrictLeadership, projectLocationDistrict, WORK_EMAIL_DOMAINS } from '../server/leadershipProjection';
import { parseApiScopes } from '../src/lib/apiScopes';
import { projectStaffing, type SourceRecord } from '../server/personnelProjection';

const people: SourceRecord[] = [{ id: 'dm', data: { fullName: 'Synthetic DM', status: 'Active', activeStatus: true, workEmail: 'Manager@SHIEKHSHOES.org', email: 'personal@excluded.test', phone: 'private', firebaseUid: 'excluded' } }];
const regions = [{ id: 'r', data: { name: 'Synthetic Region', status: 'Active' } }];
const districts: SourceRecord[] = [
  { id: 'd-1', data: { name: 'Zero store District', status: 'Active', regionId: 'r', districtManagerId: 'dm' } },
  { id: 'd-2', data: { name: 'Vacant District', status: 'Retired', regionId: 'r', districtManagerId: null } },
  { id: 'd-3', data: { name: 'Unmanaged District', status: 'Active', regionId: 'r' } },
];
const locations: SourceRecord[] = [{ id: 'loc', data: { storeNumber: '007', recordStatus: 'Retired', type: 'Enclosed Mall', regionId: 'r', districtId: 'd-2', districtManagerId: 'stale-copy' } }];

async function harness() {
  const credential: ManagedApiCredential = { clientId: 'client', tokenVersionId: 'token-version', cursorSigningKey: 'synthetic-signing-key', scopes: ['district-leadership:read', 'district-leadership:contacts:read'], grantsVersion: 1 };
  let clock = new Date('2026-10-22T15:00:00.000Z'), failed = false;
  const calls: LeadershipReadOptions[] = [];
  const repository: LeadershipRepository = { async read(options) {
    calls.push(options); if (failed) throw new Error('private Manager@shiekhshoes.org source error');
    const source = options.dataset === 'district-leadership' ? districts : locations;
    const remaining = options.id ? source.filter(r => r.id === options.id) : source.filter(r => !options.afterId || r.id > options.afterId);
    const records = remaining.slice(0, options.limit);
    return { records, people, regions, districts, sharedInboxKeys: new Set(), nextId: !options.id && remaining.length > options.limit ? records.at(-1)!.id : null };
  } };
  const authenticator = { async authenticate(token: string) {
    if (token === 'old') return { ...credential, scopes: ['locations:read', 'personnel:read', 'staffing:read'] as ManagedApiCredential['scopes'] };
    if (token === 'base') return { ...credential, scopes: ['district-leadership:read'] as ManagedApiCredential['scopes'] };
    if (token === 'other') return { ...credential, clientId: 'other' };
    if (token === 'rotated') return { ...credential, tokenVersionId: 'rotated' };
    return token === 'synthetic-token' ? credential : null;
  } };
  const app = express(); app.disable('etag');
  app.use('/api', createApiDocumentationRouter());
  app.use('/api/v3', createLeadershipApiRouter({ authenticator, repository, now: () => clock, rateLimit: false }));
  app.use('/api/v2', createPersonnelApiRouter({ authenticator, repository: { async read() { throw Error('not used'); } }, now: () => clock, rateLimit: false }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const get = (path: string, token = 'synthetic-token') => fetch(origin + path, { headers: { Authorization: 'Bearer ' + token } });
  return { credential, calls, get, advance(ms: number) { clock = new Date(clock.getTime() + ms); }, fail() { failed = true; },
    async snapshot(token = 'synthetic-token', version = 'v3') { const r = await get('/api/' + version + '/snapshot', token); assert.equal(r.status, 200); return (await r.json()).snapshot as string; },
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}

test('new least-privilege grants are explicit, contact needs base, and old clients cannot read v3', async () => {
  assert.deepEqual(parseApiScopes(undefined, true), ['locations:read']);
  assert.equal(parseApiScopes(['district-leadership:contacts:read']), null);
  assert.deepEqual(parseApiScopes(['district-leadership:contacts:read', 'district-leadership:read']), ['district-leadership:read', 'district-leadership:contacts:read']);
  const h = await harness(); try {
    assert.equal((await h.get('/api/v3/snapshot', 'invalid')).status, 401);
    assert.equal((await h.get('/api/v3/snapshot', 'old')).status, 403);
    assert.equal((await h.get('/api/v3/district-leadership?snapshot=bad', 'old')).status, 403);
    assert.equal(h.calls.length, 0);
    const snapshot = await h.snapshot('base');
    const response = await h.get('/api/v3/district-leadership?snapshot=' + snapshot, 'base');
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json(); assert.equal(body.data[0].districtManager.workEmail, null);
    assert.equal(body.data[0].districtManager.workEmailStatus, 'not_granted');
    assert.equal(h.calls[0].includeWorkEmail, false);
  } finally { await h.close(); }
});

test('two datasets share one snapshot, preserve zero-store Districts, retired records and leading zeros, and paginate/detail consistently', async () => {
  const h = await harness(); try {
    const snapshot = await h.snapshot(); let cursor: string | null = null; const rows: unknown[] = [];
    do {
      const r = await h.get('/api/v3/district-leadership?snapshot=' + snapshot + '&limit=1' + (cursor ? '&cursor=' + cursor : ''));
      assert.equal(r.status, 200); const body = await r.json(); rows.push(...body.data); cursor = body.pagination.nextCursor;
      const detail = await h.get('/api/v3/district-leadership/' + body.data[0].districtId + '?snapshot=' + snapshot);
      assert.deepEqual((await detail.json()).data, body.data[0]);
      assert.equal(body.sync.contactAccess, 'work-email');
    } while (cursor);
    assert.equal(rows.length, 3);
    const r = await h.get('/api/v3/location-districts?snapshot=' + snapshot); const body = await r.json();
    assert.equal(body.data[0].storeNumber, '007'); assert.equal(body.data[0].recordStatus, 'retired');
    assert(!JSON.stringify(body).includes('stale-copy'));
    assert(h.calls.every(c => c.snapshotAt.toISOString() === '2026-10-22T15:00:00.000Z'));
    assert.equal((await h.get('/api/v3/district-leadership/missing?snapshot=' + snapshot)).status, 404);
  } finally { await h.close(); }
});

test('snapshots/cursors bind credential, grants, dataset, limit and contract; failure/expiry never yields partial success', async () => {
  const h = await harness(); try {
    const snapshot = await h.snapshot();
    const page = await (await h.get('/api/v3/district-leadership?snapshot=' + snapshot + '&limit=1')).json();
    for (const path of [
      '/api/v3/location-districts?snapshot=' + snapshot + '&limit=1&cursor=' + page.pagination.nextCursor,
      '/api/v3/district-leadership?snapshot=' + snapshot + '&limit=2&cursor=' + page.pagination.nextCursor,
      '/api/v3/district-leadership?snapshot=' + snapshot + '&extra=1',
      '/api/v3/district-leadership?snapshot=' + snapshot + '&limit=101',
      '/api/v3/district-leadership?snapshot=' + snapshot.slice(0, -2) + 'AA',
    ]) assert.equal((await h.get(path)).status, 400);
    for (const token of ['other', 'rotated', 'base']) assert.equal((await h.get('/api/v3/district-leadership?snapshot=' + snapshot, token)).status, 400);
    const v2 = await h.snapshot('old', 'v2');
    assert.equal((await h.get('/api/v3/district-leadership?snapshot=' + v2)).status, 400);
    h.credential.grantsVersion = 2;
    assert.equal((await h.get('/api/v3/district-leadership?snapshot=' + snapshot)).status, 400);
    const fresh = await h.snapshot(); h.advance(LEADERSHIP_SNAPSHOT_TTL_MS);
    assert.equal((await h.get('/api/v3/location-districts?snapshot=' + fresh)).status, 409);
    const latest = await h.snapshot(); h.fail();
    const response = await h.get('/api/v3/district-leadership?snapshot=' + latest);
    assert.equal(response.status, 503); assert(!JSON.stringify(await response.json()).includes('Manager@'));
  } finally { await h.close(); }
});

test('District ownership distinguishes vacancy, unmanaged, invalid and missing-person assignment, retaining inactive/unknown lifecycle', () => {
  const project = (value: unknown, owned = true, person = people[0]) => projectDistrictLeadership({ ...districts[0], data: { ...districts[0].data, ...(owned ? { districtManagerId: value } : {}) } }, [person], regions);
  assert.equal(projectDistrictLeadership(districts[2], people, regions).assignmentState, 'unmanaged');
  for (const value of ['', ' dm ', [], {}, 2]) { const result = project(value); assert.equal(result.assignmentState, 'invalid'); assert.equal(result.districtManager, null); }
  assert.equal(project(null).assignmentState, 'vacant'); assert.equal(project(null).districtManager, null);
  const missing = project('missing'); assert.equal(missing.assignmentState, 'unresolved'); assert.equal(missing.districtManager?.personId, 'missing');
  assert.equal(project('dm', true, { ...people[0], data: { ...people[0].data, status: 'Inactive', activeStatus: false } }).districtManager?.lifecycle, 'inactive');
  assert.equal(project('dm', true, { ...people[0], data: { ...people[0].data, activeStatus: false } }).districtManager?.lifecycle, 'unknown');
});

test('work email is an explicit contact allowlist: never aliases, personal domains, shared inboxes, inactive or unknown lifecycle', () => {
  assert.deepEqual(WORK_EMAIL_DOMAINS, ['shiekhshoes.com', 'shiekhshoes.org']);
  const project = (data: Record<string, unknown>, granted = true, sharedInboxKeys = new Set<string>()) => projectDistrictLeadership(districts[0], [{ id: 'dm', data }], regions, { granted, sharedInboxKeys }).districtManager!;
  const active = people[0].data;
  assert.equal(project(active).workEmail, 'Manager@shiekhshoes.org');
  assert.equal(project(active, false).workEmailStatus, 'not_granted');
  for (const [overrides, expected] of [
    [{ workEmail: undefined, email: 'legacy@shiekhshoes.org' }, 'missing'], [{ workEmail: 'invalid' }, 'invalid'],
    [{ workEmail: 'personal@example.test' }, 'unapproved_domain'], [{ status: 'Inactive', activeStatus: false }, 'withheld_inactive'],
    [{ activeStatus: false }, 'withheld_unknown_lifecycle'],
  ] as const) { const p = project({ ...active, ...overrides }); assert.equal(p.workEmail, null); assert.equal(p.workEmailStatus, expected); }
  assert.equal(project(active, true, new Set(['manager@shiekhshoes.org'])).workEmailStatus, 'shared_location_inbox');
  assert.deepEqual(Object.keys(project(active)).sort(), ['personId', 'fullName', 'lifecycle', 'workEmail', 'workEmailStatus', 'issues'].sort());
  assert.equal(projectDistrictLeadership(districts[0], [], regions, { granted: true, sharedInboxKeys: new Set() }).districtManager?.workEmailStatus, 'unresolved_person');
});

test('membership reports invalid/retired hierarchy and never treats legacy copies as leadership authority; v2 stays persisted/contact-free', () => {
  const result = projectLocationDistrict({ ...locations[0], data: { ...locations[0].data, regionId: 'missing' } }, districts, regions);
  assert(result.issues.some(i => i.code === 'hierarchy_parent_mismatch'));
  assert(result.issues.some(i => i.code === 'retired_hierarchy'));
  const old = projectStaffing(locations[0], people, regions, districts);
  assert.equal(old.districtManagerId, 'stale-copy');
  assert(!JSON.stringify(old).includes('workEmail'));
});
interface Schema {
  $ref?: string; type?: string | string[]; enum?: unknown[]; const?: unknown; format?: string;
  oneOf?: Schema[]; properties?: Record<string, Schema>; required?: string[];
  additionalProperties?: boolean; items?: Schema; minimum?: number; maximum?: number;
}

test('published v3 documentation matches real snapshot/page/detail/null/error allowlists and contains no credentials', async () => {
  const document: { components: { schemas: Record<string, Schema> } } = JSON.parse(await readFile('docs/district-leadership-openapi.json', 'utf8'));
  const validate = (schema: Schema, value: unknown): void => {
    if (schema.$ref) return validate(document.components.schemas[schema.$ref.split('/').at(-1)!], value);
    if (schema.oneOf) {
      let matches = 0;
      for (const candidate of schema.oneOf) {
        try { validate(candidate, value); matches++; }
        catch (error) { if (!(error instanceof assert.AssertionError)) throw error; }
      }
      assert.equal(matches, 1);
      return;
    }
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'number' && Number.isInteger(value) ? 'integer' : typeof value;
    if (schema.type) assert.ok((Array.isArray(schema.type) ? schema.type : [schema.type]).includes(type), `Expected ${schema.type}; got ${type}`);
    if (schema.enum) assert.ok(schema.enum.includes(value));
    if (Object.hasOwn(schema, 'const')) assert.equal(value, schema.const);
    if (schema.format === 'date-time') assert.ok(typeof value === 'string' && Number.isFinite(Date.parse(value)));
    if (typeof value === 'number') {
      if (schema.minimum !== undefined) assert.ok(value >= schema.minimum);
      if (schema.maximum !== undefined) assert.ok(value <= schema.maximum);
    }
    if (Array.isArray(value) && schema.items) value.forEach(item => validate(schema.items!, item));
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const field of schema.required || []) assert.ok(Object.hasOwn(value, field), `Missing ${field}`);
      for (const [key, entry] of Object.entries(value)) {
        if (schema.additionalProperties === false) assert.ok(Object.hasOwn(schema.properties || {}, key), `Undocumented ${key}`);
        if (schema.properties?.[key]) validate(schema.properties[key], entry);
      }
    }
  };
  const h = await harness(); try {
    const session = await (await h.get('/api/v3/snapshot')).json(); validate(document.components.schemas.Snapshot, session);
    for (const [dataset, pageSchema, detailSchema, id] of [
      ['district-leadership', 'DistrictPage', 'DistrictDetail', 'd-2'],
      ['location-districts', 'MembershipPage', 'MembershipDetail', 'loc'],
    ]) {
      const page = await (await h.get('/api/v3/' + dataset + '?snapshot=' + session.snapshot)).json();
      validate(document.components.schemas[pageSchema], page);
      const detail = await (await h.get('/api/v3/' + dataset + '/' + id + '?snapshot=' + session.snapshot)).json();
      validate(document.components.schemas[detailSchema], detail);
    }
    for (const value of ['', null, 'missing']) {
      const row = projectDistrictLeadership({ ...districts[0], data: { ...districts[0].data, districtManagerId: value } }, people, regions);
      validate(document.components.schemas.District, row);
    }
    for (const [path, token, status] of [
      ['/api/v3/district-leadership', 'synthetic-token', 400],
      ['/api/v3/snapshot', 'invalid', 401], ['/api/v3/snapshot', 'old', 403],
      ['/api/v3/district-leadership/missing?snapshot=' + session.snapshot, 'synthetic-token', 404],
    ] as const) { const response = await h.get(path, token); assert.equal(response.status, status); validate(document.components.schemas.Error, await response.json()); }
    h.advance(LEADERSHIP_SNAPSHOT_TTL_MS);
    const expired = await h.get('/api/v3/district-leadership?snapshot=' + session.snapshot); assert.equal(expired.status, 409); validate(document.components.schemas.Error, await expired.json());
    const fresh = await h.snapshot(); h.fail();
    const unavailable = await h.get('/api/v3/district-leadership?snapshot=' + fresh); assert.equal(unavailable.status, 503); validate(document.components.schemas.Error, await unavailable.json());
    assert.throws(() => validate(document.components.schemas.DistrictManager, { ...projectDistrictLeadership(districts[0], people, regions).districtManager, email: 'excluded@example.test' }));
    for (const [route, file] of [['/api/leadership-guide','district-leadership-api.md'], ['/api/leadership-openapi.json','district-leadership-openapi.json']]) {
      const response = await h.get(route, 'invalid'); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(await response.text(), await readFile('docs/' + file, 'utf8'));
    }
  } finally { await h.close(); }
});

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import express from 'express';
import type { ManagedApiCredential } from '../server/apiClientApi';
import { createPersonnelApiRouter } from '../server/personnelApi';
import { apiErrorHandler, apiNotFoundHandler } from '../server/directoryApi';
import { createApiDocumentationRouter } from '../server/apiDocumentation';
import type { PersonnelReadOptions, PersonnelRepository } from '../server/firestorePersonnel';
import { projectPerson, projectStaffing, type SourceRecord } from '../server/personnelProjection';
import { personLifecycle } from '../src/lib/personLifecycle';

const people: SourceRecord[] = [
  { id: 'p-1', data: { fullName: 'Synthetic Manager', status: 'Active', activeStatus: true, email: 'secret@example.test', phone: 'private', primaryLocationId: 'loc-1', supportedLocationIds: ['loc-2'], customMetadata: { private: 'excluded' } } },
  { id: 'p-2', data: { fullName: 'Synthetic Former Manager', status: 'Inactive', activeStatus: false } },
  { id: 'p-3', data: { fullName: 'Synthetic Manager', status: 'Active', activeStatus: false, name: 'Legacy Alias' } },
];
const locations: SourceRecord[] = [
  { id: 'loc-1', data: { storeNumber: '07', recordStatus: 'Active', storeManagerId: 'p-1', districtManagerId: 'missing', regionalManagerId: 'p-2', assistantStoreManagerIds: ['p-1', 'p-3'], keyHolderIds: ['p-2'], regionId: 'reg-1', districtId: 'dist-1', storeManagerName: 'Stale Copy', locationInboxEmail: 'private@example.test' } },
  { id: 'loc-2', data: { storeNumber: '7', recordStatus: 'Retired', storeManagerName: 'Legacy Only' } },
];
const regions = [{ id: 'reg-1', data: { name: 'Synthetic Region', status: 'Active' } }];
const districts = [{ id: 'dist-1', data: { name: 'Synthetic District', status: 'Active', regionId: 'reg-1' } }];

async function harness() {
  let clock = new Date('2026-10-04T11:00:00.000Z');
  let failed = false;
  const calls: PersonnelReadOptions[] = [];
  const credential: ManagedApiCredential = { clientId: 'client-1', tokenVersionId: 'token-1', cursorSigningKey: 'synthetic-key-one', scopes: ['personnel:read', 'staffing:read'], grantsVersion: 1 };
  const repository: PersonnelRepository = {
    async read(options) {
      calls.push(options);
      if (failed) throw new Error('private source failure');
      const source = options.dataset === 'personnel' ? people : locations;
      const remaining = options.id ? source.filter(item => item.id === options.id) : source.filter(item => !options.afterId || item.id > options.afterId);
      const records = remaining.slice(0, options.limit);
      return { records, people, locations, regions, districts, nextId: !options.id && remaining.length > options.limit ? records.at(-1)!.id : null };
    },
  };
  const app = express();
  app.use('/api', createApiDocumentationRouter());
  app.use('/api/v2', createPersonnelApiRouter({
    repository, now: () => clock, rateLimit: false,
    authenticator: { async authenticate(token) {
      if (token === 'location-only') return { ...credential, scopes: ['locations:read'] };
      if (token === 'other-client') return { ...credential, clientId: 'other' };
      if (token === 'rotated') return { ...credential, tokenVersionId: 'token-2' };
      if (token === 'personnel-only') return { ...credential, scopes: ['personnel:read'] };
      if (token === 'staffing-only') return { ...credential, scopes: ['staffing:read'] };
      return token === 'test-token' ? credential : null;
    } },
  }));
  app.use('/api', apiNotFoundHandler); app.use('/api', apiErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    calls, credential, clock: (value: Date) => { clock = value; }, fail: () => { failed = true; },
    get: (path: string, token = 'test-token') => fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } }),
    async snapshot(token = 'test-token') { const response = await this.get('/api/v2/snapshot', token); assert.equal(response.status, 200); return (await response.json()).snapshot as string; },
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

test('v2 authorizes datasets independently, never upgrades v1-only grants', async () => {
  const app = await harness();
  try {
    assert.equal((await app.get('/api/v2/snapshot', 'invalid')).status, 401);
    assert.equal((await app.get('/api/v2/snapshot', 'location-only')).status, 403);
    for (const token of ['personnel-only', 'staffing-only']) {
      const snapshot = await app.snapshot(token);
      const own = token === 'personnel-only' ? 'personnel' : 'location-staffing';
      const other = own === 'personnel' ? 'location-staffing' : 'personnel';
      assert.equal((await app.get(`/api/v2/${own}?snapshot=${snapshot}`, token)).status, 200);
      assert.equal((await app.get(`/api/v2/${other}?snapshot=${snapshot}`, token)).status, 403);
    }
  } finally { await app.close(); }
});

test('full snapshot pagination includes inactive People and retired Locations, details match, contacts excluded', async () => {
  const app = await harness();
  try {
    const snapshot = await app.snapshot();
    for (const dataset of ['personnel', 'location-staffing']) {
      let cursor: string | null = null;
      const received: unknown[] = [];
      do {
        const response = await app.get(`/api/v2/${dataset}?snapshot=${snapshot}&limit=1${cursor ? `&cursor=${cursor}` : ''}`);
        assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
        const body = await response.json(); received.push(...body.data); cursor = body.pagination.nextCursor;
        assert.equal(body.sync.mode, 'full'); assert.equal(body.sync.snapshotAt, '2026-10-04T11:00:00.000Z');
      } while (cursor);
      assert.equal(received.length, dataset === 'personnel' ? 3 : 2);
      const detail = await (await app.get(`/api/v2/${dataset}/${dataset === 'personnel' ? 'p-1' : 'loc-1'}?snapshot=${snapshot}`)).json();
      assert.deepEqual(detail.data, received[0]);
      assert.doesNotMatch(JSON.stringify(received), /secret@example|private|Stale Copy|Legacy Only|email|phone|customMetadata/);
    }
    assert.ok(app.calls.every(call => call.snapshotAt.toISOString() === '2026-10-04T11:00:00.000Z'));
    assert.equal((await app.get(`/api/v2/location-staffing/07?snapshot=${snapshot}`)).status, 404);
  } finally { await app.close(); }
});

test('snapshot/cursor binds client, token, grant generation, dataset and limit; rejects unsupported deltas', async () => {
  const app = await harness();
  try {
    const snapshot = await app.snapshot();
    const first = await (await app.get(`/api/v2/personnel?snapshot=${snapshot}&limit=1`)).json();
    const cursor = first.pagination.nextCursor;
    for (const path of [
      `/api/v2/location-staffing?snapshot=${snapshot}&limit=1&cursor=${cursor}`,
      `/api/v2/personnel?snapshot=${snapshot}&limit=2&cursor=${cursor}`,
      `/api/v2/personnel?snapshot=${snapshot}&limit=1&cursor=${cursor.slice(0, -1)}x`,
      `/api/v2/personnel?snapshot=${snapshot}&updatedSince=2026-01-01`,
      '/api/v2/personnel',
      `/api/v2/personnel?snapshot=${snapshot}&limit=101`,
      `/api/v2/personnel?snapshot=${snapshot}&snapshot=${snapshot}`,
    ]) assert.equal((await app.get(path)).status, 400, path);
    for (const token of ['other-client', 'rotated']) assert.equal((await app.get(`/api/v2/personnel?snapshot=${snapshot}`, token)).status, 400);
    app.credential.grantsVersion = 2;
    assert.equal((await app.get(`/api/v2/personnel?snapshot=${snapshot}`)).status, 400);
    app.credential.grantsVersion = 1;
    app.clock(new Date('2026-10-04T11:15:00.000Z'));
    assert.equal((await app.get(`/api/v2/personnel?snapshot=${snapshot}`)).status, 409);
  } finally { await app.close(); }
});

test('source failure returns error rather than empty successful data', async () => {
  const app = await harness();
  try {
    const snapshot = await app.snapshot(); app.fail();
    const response = await app.get(`/api/v2/personnel?snapshot=${snapshot}`);
    assert.equal(response.status, 503); const body = await response.json();
    assert.equal(body.error.code, 'snapshot_unavailable'); assert.equal('data' in body, false);
    assert.doesNotMatch(JSON.stringify(body), /private source/);
  } finally { await app.close(); }
});

test('all five staffing roles preserve raw identity, report invalid/missing/inactive/legacy-only without name fallback', () => {
  const source = structuredClone(locations[0]);
  source.data.assistantStoreManagerIds = ['p-1', 'p-1', 42, '', 'missing'];
  source.data.keyHolderIds = 'bad-list';
  source.data.keyHolderNames = ['Legacy Only'];
  source.data.regionId = 'missing';
  const result = projectStaffing(source, people, regions, districts);
  assert.equal(result.storeNumber, '07');
  assert.equal(result.storeManagerId, 'p-1');
  assert.equal(result.districtManagerId, 'missing');
  assert.equal(result.regionalManagerId, 'p-2');
  assert.equal(result.staffing.storeManager?.fullName, 'Synthetic Manager');
  assert.equal(result.staffing.districtManager?.personId, 'missing');
  assert.equal(result.staffing.districtManager?.fullName, null);
  assert.equal(result.staffing.regionalManager?.lifecycle, 'inactive');
  assert.equal(result.assistantStoreManagerIds.length, 3);
  assert.deepEqual(result.keyHolderIds, []);
  for (const code of ['duplicate_assignment', 'invalid_reference', 'legacy_only', 'missing_hierarchy', 'hierarchy_parent_mismatch']) assert.ok(result.issues.some(issue => issue.code === code), code);
  assert.equal(projectStaffing(locations[1], people, [], []).storeManagerId, null);
  assert.ok(projectStaffing(locations[1], people, [], []).issues.some(issue => issue.code === 'legacy_only'));
});

test('Draft is valid, exact duplicate store numbers remain ID-distinct and never select a roster member', () => {
  const first = projectStaffing({ id: 'loc-a', data: { recordStatus: 'Draft', storeNumber: '07' } }, [], [], []);
  const second = projectStaffing({ id: 'loc-b', data: { recordStatus: 'Active', storeNumber: '07' } }, [], [], []);
  assert.equal(first.recordStatus, 'draft');
  assert.equal(first.storeNumber, second.storeNumber);
  assert.notEqual(first.locationId, second.locationId);
  assert.ok(!first.issues.some(issue => issue.code === 'unknown_location_state'));
});

test('strict lifecycle and aliases preserve history as explicit unknown; workplace/support not management', () => {
  for (const [source, expected] of [
    [{}, 'unknown'], [{ status: 'Other' }, 'unknown'], [{ status: 'Active', activeStatus: false }, 'unknown'],
    [{ status: 'Inactive', activeStatus: true }, 'unknown'], [{ status: 'Active', activeStatus: 'yes' }, 'unknown'],
    [{ status: 'Active' }, 'active'], [{ activeStatus: false }, 'inactive'], [{ status: 'Inactive' }, 'inactive'],
  ] as const) assert.equal(personLifecycle(source), expected);
  const projected = projectPerson({ id: 'p', data: { name: 'Legacy Name', status: 'Other', primaryLocationId: '07', supportedLocationIds: ['07', 'loc-2', 42, 'loc-2'] } }, locations);
  assert.equal(projected.fullName, null);
  assert.equal(projected.primaryLocationId, '07');
  for (const code of ['invalid_name', 'ambiguous_lifecycle', 'missing_location', 'retired_location', 'duplicate_assignment', 'invalid_reference', 'overlapping_workplace']) assert.ok(projected.issues.some(issue => issue.code === code), code);
});

test('public documentation serves only the synthetic contract and all OpenAPI local references resolve', async () => {
  const app = await harness();
  try {
    const response = await app.get('/api/openapi.json', 'invalid');
    assert.equal(response.status, 200);
    const schema = await response.json();
    assert.equal(schema.openapi, '3.1.0');
    const check = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      for (const [key, entry] of Object.entries(value)) {
        if (key === '$ref') {
          assert.equal(typeof entry, 'string');
          assert.ok(String(entry).startsWith('#/'));
          let resolved: unknown = schema;
          for (const part of String(entry).slice(2).split('/')) resolved = resolved?.[part];
          assert.ok(resolved, String(entry));
        } else check(entry);
      }
    };
    check(schema);
    const guide = await app.get('/api/personnel-guide', 'invalid'); assert.equal(guide.status, 200);
    assert.equal(await guide.text(), await readFile('docs/personnel-staffing-api.md', 'utf8'));
  } finally { await app.close(); }
});

interface Schema {
  $ref?: string; type?: string | string[]; enum?: unknown[]; const?: unknown; format?: string;
  oneOf?: Schema[]; properties?: Record<string, Schema>; required?: string[];
  additionalProperties?: boolean; items?: Schema; minimum?: number; maximum?: number;
}

test('actual snapshot/list/detail/null/error payloads validate against the published strict OpenAPI schemas', async () => {
  const document: { components: { schemas: Record<string, Schema> } } = JSON.parse(await readFile('docs/personnel-staffing-openapi.json', 'utf8'));
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
  const app = await harness();
  try {
    const session = await (await app.get('/api/v2/snapshot')).json();
    validate(document.components.schemas.Snapshot, session);
    for (const [dataset, listSchema, detailSchema, id] of [
      ['personnel', 'PersonnelPage', 'Person', 'p-2'],
      ['location-staffing', 'StaffingPage', 'Staffing', 'loc-2'],
    ]) {
      const page = await (await app.get(`/api/v2/${dataset}?snapshot=${session.snapshot}`)).json();
      validate(document.components.schemas[listSchema], page);
      const detail = await (await app.get(`/api/v2/${dataset}/${id}?snapshot=${session.snapshot}`)).json();
      assert.deepEqual(Object.keys(detail).sort(), ['data', 'sync']);
      validate(document.components.schemas[detailSchema], detail.data);
      validate(document.components.schemas.Sync, detail.sync);
    }
    for (const [path, token, status] of [
      ['/api/v2/personnel', 'test-token', 400],
      ['/api/v2/snapshot', 'invalid', 401],
      ['/api/v2/snapshot', 'location-only', 403],
      [`/api/v2/personnel/missing?snapshot=${session.snapshot}`, 'test-token', 404],
    ] as const) {
      const response = await app.get(path, token);
      assert.equal(response.status, status); validate(document.components.schemas.Error, await response.json());
    }
    app.clock(new Date('2026-10-04T11:15:00.000Z'));
    const expired = await app.get(`/api/v2/personnel?snapshot=${session.snapshot}`);
    assert.equal(expired.status, 409); validate(document.components.schemas.Error, await expired.json());
    app.clock(new Date('2026-10-04T11:00:00.000Z')); app.fail();
    const unavailable = await app.get(`/api/v2/personnel?snapshot=${session.snapshot}`);
    assert.equal(unavailable.status, 503); validate(document.components.schemas.Error, await unavailable.json());
    assert.throws(() => validate(document.components.schemas.Person, { ...projectPerson(people[0], locations), email: 'must-not-publish@example.test' }));
    assert.throws(() => validate(document.components.schemas.Staffing, { ...projectStaffing(locations[0], people, regions, districts), storeManagerId: { personId: 'p-1' } }));
  } finally { await app.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createDirectoryDataRouter } from '../server/directoryDataApi';
import { FirestoreDirectoryStore, type DirectoryWriter } from '../server/firestoreDirectory';
import { locationLifecycleCapabilities } from '../server/locationLifecycleConfiguration';
import { LeadershipPlanError } from '../server/organizationLeadershipPlanner';
import { leadershipActor as actor } from './helpers/organizationLeadershipFixture';
const lifecycleIntent=()=>({schemaVersion:1,operationId:'operation-1',locationId:'007',expectedVersion:4,reason:'Explicit use conversion',action:'convert',type:'Corporate Office',hierarchy:null,releaseStoreStaffing:false});

async function harness(options: { actor?: any; flags?: Partial<ReturnType<typeof locationLifecycleCapabilities>>; fail?: Error; omit?: string; result?:unknown } = {}) {
  const calls: { mode: string; input?: unknown; actor: unknown }[] = [];
  const record = async (mode: string, input: unknown, resolved: unknown) => {
    calls.push({ mode, input, actor: resolved }); if (options.fail) throw options.fail;
    return options.result??{ schemaVersion: 1, operationId: 'operation-1', state: 'cancelled', updatedAt: '2026-10-28T12:00:00.000Z' };
  };
  const store = {
    commit: async () => { assert.fail('No generic commit fallback'); },
    locationLifecycleCapabilities: () => ({ schemaVersion: 1, catalogEnabled: true, newCommandsEnabled: true, recoveryEnabled: true, ...options.flags }),
    readLocationLifecycleCatalog: async (a: unknown) => { await record('catalog', undefined, a); return { schemaVersion: 1, complete: true, evaluatedAt: '2026-10-28T12:00:00.000Z', units: [], people: [], issues: [] }; },
    listLocationLifecycleOperations: async (a: unknown) => { await record('operations', undefined, a); return { schemaVersion: 1, complete: true, operations: [] }; },
    prepareLocationLifecycle: (i: unknown, a: unknown) => record('prepare', i, a),
    commitLocationLifecycle: (i: unknown, a: unknown) => record('commit', i, a),
    readLocationLifecycleOperation: (i: unknown, a: unknown) => record('status', i, a),
    cancelLocationLifecycleOperation: (i: unknown, a: unknown) => record('cancel', i, a),
  } as unknown as DirectoryWriter;
  (store as any).previewLocationLifecycle=(i:unknown,a:unknown)=>record('preview',i,a);
  if (options.omit) delete store[options.omit];
  const app = express();
  app.use('/api/directory', createDirectoryDataRouter(async token => { assert.equal(token, 'synthetic-token'); return options.actor ?? actor; }, store));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const request = (path: string, body?: unknown, extra: RequestInit = {}) => fetch(`http://127.0.0.1:${(server.address() as any).port}/api/directory/location-lifecycle/${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...extra });
  return { calls, request, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}

test('gates default off, require exact true values and never inherit older Person workflow flags', () => {
  assert.equal(locationLifecycleCapabilities({ORGANIZATION_LEADERSHIP_CATALOG_ENABLED:'true',ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED:'true',ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED:'true'}).newCommandsEnabled,false);
  assert.deepEqual(locationLifecycleCapabilities({LOCATION_LIFECYCLE_ENABLED:'false',ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED:'true'}),{schemaVersion:1,catalogEnabled:false,recoveryEnabled:true,newCommandsEnabled:false});
  assert.deepEqual(locationLifecycleCapabilities({}), { schemaVersion: 1, catalogEnabled: false, recoveryEnabled: false, newCommandsEnabled: false });
  assert.equal(locationLifecycleCapabilities({ ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED: 'true' }).newCommandsEnabled, false);
  assert.equal(locationLifecycleCapabilities({ ORGANIZATION_LEADERSHIP_CATALOG_ENABLED: 'true', ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED: 'true', ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED: 'true', LOCATION_LIFECYCLE_ENABLED: 'true' }).newCommandsEnabled, true);
  assert.equal(locationLifecycleCapabilities({ ORGANIZATION_LEADERSHIP_CATALOG_ENABLED: 'TRUE', PERSON_TRANSITION_COMMANDS_ENABLED: 'true', PERSON_TRANSITION_RECOVERY_ENABLED: 'true' }).newCommandsEnabled, false);
});

test('read-only preview uses exact intent and partial preview adapters cannot enable new work',async()=>{
  const h=await harness();try{assert.equal((await h.request('preview',lifecycleIntent())).status,200);assert.equal(h.calls[0].mode,'preview');assert.deepEqual(h.calls[0].input,lifecycleIntent());}finally{await h.close();}
  const partial=await harness({omit:'previewLocationLifecycle'});try{const c=await(await partial.request('capabilities')).json();assert.equal(c.catalogEnabled,false);assert.equal(c.newCommandsEnabled,false);assert.equal((await partial.request('prepare',lifecycleIntent())).status,503);assert.deepEqual(partial.calls,[]);}finally{await partial.close();}
});

test('oversize responses fail closed and authenticated commands are actor-rate-limited',async()=>{
  const huge=await harness({result:{privatePadding:'x'.repeat(1_000_001)}});try{const r=await huge.request('status',{operationId:'operation-1'});assert.equal(r.status,413);assert.doesNotMatch(await r.text(),/privatePadding/);}finally{await huge.close();}
  const limited=await harness();try{for(let n=0;n<10;n++)assert.equal((await limited.request('prepare',lifecycleIntent())).status,200);assert.equal((await limited.request('prepare',lifecycleIntent())).status,429);assert.equal(limited.calls.length,10);}finally{await limited.close();}
});

test('capabilities and catalog require administrator authentication and never emit ETag/304', async () => {
  const h = await harness();
  try {
    const response = await h.request('catalog', undefined, { headers: { Authorization: 'Bearer synthetic-token', 'If-None-Match': '*' } });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('etag'), null);
    assert.equal((await response.json()).complete, true); assert.deepEqual(h.calls[0].actor, actor);
    const noToken = await h.request('catalog', undefined, { headers: {} }); assert.equal(noToken.status, 401);
  } finally { await h.close(); }
});

test('non-admin, inactive and scoped actors cannot read or write this private workflow', async () => {
  for (const change of [{ role: 'Directory Data Steward' }, { status: 'Inactive' }, { accessScope: 'Store 007' }]) {
    const h = await harness({ actor: { ...actor, ...change } });
    try { assert.equal((await h.request('capabilities')).status, 403); assert.equal((await h.request('prepare', lifecycleIntent())).status, 403); assert.deepEqual(h.calls, []); }
    finally { await h.close(); }
  }
});

test('command pause leaves status/cancel/list recovery available; disabled catalog does not fall back', async () => {
  const h = await harness({ flags: { catalogEnabled: false, newCommandsEnabled: false } });
  try {
    assert.equal((await h.request('catalog')).status, 503);
    assert.equal((await h.request('prepare', lifecycleIntent())).status, 503);
    for (const mode of ['status', 'cancel']) assert.equal((await h.request(mode, { operationId: 'operation-1' })).status, 200);
    assert.equal((await h.request('operations')).status, 200);
    assert.deepEqual(h.calls.map(c => c.mode), ['status', 'cancel', 'operations']);
  } finally { await h.close(); }
});

test('partial implementation cannot advertise or admit command capability', async () => {
  const h = await harness({ omit: 'listLocationLifecycleOperations' });
  try {
    const caps = await (await h.request('capabilities')).json(); assert.equal(caps.newCommandsEnabled, false); assert.equal(caps.recoveryEnabled, false);
    assert.equal((await h.request('commit', { operationId: 'operation-1', reviewHash: 'a'.repeat(64) })).status, 503);
    assert.deepEqual(h.calls, []);
  } finally { await h.close(); }
});

test('exact normalized prepare/commit markers are passed with the server-resolved actor', async () => {
  const h = await harness(), intent = lifecycleIntent();
  try {
    assert.equal((await h.request('prepare', intent)).status, 200);
    assert.deepEqual(h.calls[0], { mode: 'prepare', input: intent, actor });
    const marker = { operationId: intent.operationId, reviewHash: 'a'.repeat(64) };
    assert.equal((await h.request('commit', marker)).status, 200);
    assert.deepEqual(h.calls[1], { mode: 'commit', input: marker, actor });
  } finally { await h.close(); }
});

test('unknown fields, forged actors, arbitrary patches and missing confirmation cannot reach the Store', async () => {
  const h = await harness();
  try {
    for (const [mode, value] of [['prepare', { ...lifecycleIntent(), actor }], ['commit', { operationId: 'operation-1' }], ['cancel', { operationId: 'operation-1', patches: [] }], ['status', { operationId: '../bad' }]] as const) assert.equal((await h.request(mode, value)).status, 400);
    assert.deepEqual(h.calls, []);
  } finally { await h.close(); }
});

test('JSON and 32 KiB limits apply before the parent generic commit body parser', async () => {
  const h = await harness();
  try {
    assert.equal((await h.request('prepare', {}, { body: '{broken' })).status, 400);
    assert.equal((await h.request('prepare', { padding: 'x'.repeat(33_000) })).status, 413);
    assert.deepEqual(h.calls, []);
  } finally { await h.close(); }
});

test('unknown infrastructure errors stay private; known conflict is actionable without a generic write retry', async () => {
  for (const error of [new Error('PRIVATE_CREDENTIAL_OR_INFRASTRUCTURE'), new LeadershipPlanError('conflict', 'Review the changed assignment again.')]) {
    const h = await harness({ fail: error });
    try {
      const response = await h.request('commit', { operationId: 'operation-1', reviewHash: 'a'.repeat(64) });
      assert.equal(response.status, error instanceof LeadershipPlanError ? 409 : 503);
      assert.doesNotMatch(await response.text(), /PRIVATE/);
      assert.equal(h.calls.length, 1);
    } finally { await h.close(); }
  }
});

test('Store methods enforce disabled admission before any database call', async () => {
  const keys = ['LOCATION_LIFECYCLE_ENABLED','ORGANIZATION_LEADERSHIP_CATALOG_ENABLED', 'ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED', 'ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED'];
  const previous = keys.map(key => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    const store = new FirestoreDirectoryStore({ collection: () => assert.fail('No database call while disabled') } as any);
    for (const run of [() => store.readLocationLifecycleCatalog(actor), () => store.prepareLocationLifecycle({}, actor), () => store.commitLocationLifecycle({}, actor), () => store.readLocationLifecycleOperation({}, actor), () => store.cancelLocationLifecycleOperation({}, actor), () => store.listLocationLifecycleOperations(actor)]) assert.throws(run, /disabled/);
  } finally { keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); }
});

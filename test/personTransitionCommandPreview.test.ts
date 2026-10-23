import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import type { Firestore } from '@google-cloud/firestore';
import type { Account } from '../server/authAuthority';
import { createDirectoryDataRouter } from '../server/directoryDataApi';
import { previewPersonTransitionCommand, COMMAND_PREVIEW_LIMITS } from '../server/personTransitionCommandPreview';
import { PersonTransitionReviewSigner, loadPersonTransitionReviewSigner, TRANSITION_REVIEW_TTL_MS } from '../server/personTransitionReviewEnvelope';

const time = Date.parse('2026-10-23T20:00:00Z');
const clock = () => new Date(time);
const secret = Buffer.alloc(32, 0x35).toString('base64url'); // Synthetic fixture only; never a deployment key.
const config = { activeKeyId: 'synthetic', keys: [{ id: 'synthetic', secret }] };
const signer = () => new PersonTransitionReviewSigner(config);
const actor: Account = { uid: 'synthetic-admin', name: 'Synthetic Admin', email: null, emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
const claims = () => ({ actorUid: actor.uid, personId: 'subject', intentHash: 'a'.repeat(64), stateHash: 'b'.repeat(64), planHash: 'c'.repeat(64), issuedAt: time, expiresAt: time + TRANSITION_REVIEW_TTL_MS });

test('dedicated keyring: strict configuration, no fallback, fixed domain and rotation', () => {
  assert.equal(loadPersonTransitionReviewSigner(''), undefined);
  for (const value of ['broken JSON PRIVATE', '{}', JSON.stringify({ ...config, extra: 'PRIVATE' }), JSON.stringify({ ...config, activeKeyId: 'missing' }),
    JSON.stringify({ ...config, keys: [...config.keys, ...config.keys] }), JSON.stringify({ ...config, keys: [{ id: 'synthetic', secret: Buffer.alloc(16).toString('base64url') }] }),
    JSON.stringify({ ...config, keys: [{ id: 'synthetic', secret: secret + '=' }] }), JSON.stringify({ ...config, keys: [{ ...config.keys[0], algorithm: 'none' }] })]) {
    assert.throws(() => loadPersonTransitionReviewSigner(value), /^Error: Invalid transition review signing configuration\.$/);
  }
  const first = signer(), token = first.sign(claims());
  assert.equal(JSON.stringify(first), '{}', 'Secret material is not serializable');
  assert.equal(first.verify(token, claims(), time).keyId, 'synthetic');
  const next = { id: 'next', secret: Buffer.alloc(32, 0x44).toString('base64url') };
  const rotating = new PersonTransitionReviewSigner({ activeKeyId: next.id, keys: [...config.keys, next] });
  assert.equal(rotating.verify(token, claims(), time).keyId, 'synthetic');
  assert.equal(rotating.verify(rotating.sign(claims()), claims(), time).keyId, next.id);
  assert.throws(() => new PersonTransitionReviewSigner({ activeKeyId: next.id, keys: [next] }).verify(token, claims(), time));
  assert.equal(first.verify(first.sign({ ...claims(), keyId: 'invented', audience: 'import' } as any), claims(), time).keyId, 'synthetic');
});

test('review envelope rejects tampering, cross-actor/subject/intent, expiry, future time and noncanonical encoding', () => {
  const s = signer(), token = s.sign(claims());
  for (const expected of [{ ...claims(), actorUid: 'other' }, { ...claims(), personId: 'other' }, { ...claims(), intentHash: 'd'.repeat(64) }]) assert.throws(() => s.verify(token, expected, time));
  for (const now of [time - 1, time + TRANSITION_REVIEW_TTL_MS, NaN]) assert.throws(() => s.verify(token, claims(), now));
  for (const bad of [token + '.', token.replace('ptv1', 'import'), token.slice(0, -2) + 'xx', 'x'.repeat(4097), null]) assert.throws(() => s.verify(bad, claims(), time));
  const [prefix, payload] = token.split('.');
  const signed = (raw: string) => { const p = Buffer.from(raw).toString('base64url'); return `${prefix}.${p}.${createHmac('sha256', Buffer.from(secret, 'base64url')).update(`directory-person-transition-review-v1.${p}`).digest('base64url')}`; };
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
  for (const change of [{ audience: 'different' }, { algorithm: 'none' }, { schemaVersion: 2 }, { keyId: 'unknown' }, { expiresAt: time + 1 }, { planHash: 'not-hash' }, { actorUid: '' }]) assert.throws(() => s.verify(signed(JSON.stringify({ ...parsed, ...change })), claims(), time));
  assert.throws(() => s.verify(signed(JSON.stringify(parsed).replace('{', '{"schemaVersion":2,')), claims(), time));
  assert.throws(() => s.verify(`${prefix}.${payload}=.${token.split('.')[2]}`, claims(), time));
  assert.throws(() => s.sign({ ...claims(), reason: 'PRIVATE' } as any));
});

function fixture() {
  const records = new Map<string, any>([
    ['users/admin', { firebaseUid: actor.uid, role: actor.role, status: 'Active', accessScope: actor.accessScope, email: 'PRIVATE_USER_EMAIL' }],
    ['people/subject', { fullName: 'Synthetic Subject', status: 'Active', activeStatus: true, positionIds: ['store-manager'], version: 0, workPhone: '+19095550100', phonePrivacy: 'Internal', workEmail: 'PRIVATE_CONTACT', primaryLocationId: 'store' }],
    ['people/replacement', { fullName: 'Synthetic Replacement', status: 'Active', positionIds: ['store-manager', 'district-manager'], workPhone: '+19095550101', phonePrivacy: 'Restricted', workEmail: 'PRIVATE_CONTACT' }],
    ['regions/region', { name: 'Synthetic Region', status: 'Active', version: null }],
    ['districts/district', { name: 'Synthetic District', regionId: 'region', status: 'Active', districtManagerId: null }],
    ['locations/store', { name: 'Synthetic Store', storeNumber: '007', type: 'Enclosed Mall', recordStatus: 'Active', districtId: 'district', regionId: 'region', storeManagerId: 'subject', storeManagerName: 'Synthetic Subject', storeManagerPhone: '+19095550100', storeManagerPhonePrivacy: 'Internal', districtManagerId: '', address: 'PRIVATE_UNRELATED_ADDRESS' }],
  ]);
  const reads: { collection: string; keys: string[]; max?: number; paths?: string[] }[] = [];
  const versions = new Map<string, number>();
  const state: { overflow?: string; noTime?: string; exactMissing?: boolean; incoherent?: boolean; fail?: boolean } = {};
  class Query {
    keys: string[] = []; field?: string; value?: unknown; max = Infinity;
    constructor(public name: string) {}
    select(...keys: string[]) { this.keys = keys; return this; }
    where(field: string, op: string, value: unknown) { assert.equal(op, '=='); this.field = field; this.value = value; return this; }
    limit(value: number) { this.max = value; return this; }
    doc(id: string) { return { path: `${this.name}/${id}` }; }
  }
  const document = (path: string, keys: string[], exact = false) => ({ id: path.split('/')[1], ref: { path }, exists: records.has(path),
    updateTime: state.noTime === path ? undefined : records.has(path) ? { seconds: 100, nanoseconds: (versions.get(path) || 0) + (exact && state.incoherent && path.startsWith('locations/') ? 1 : 0) } : undefined,
    data: () => records.has(path) ? Object.fromEntries(keys.filter(k => Object.hasOwn(records.get(path), k)).map(k => [k, structuredClone(records.get(path)[k])])) : undefined });
  const firestore = { collection: (name: string) => new Query(name), runTransaction: async (callback: any, options: unknown) => {
    assert.deepEqual(options, { readOnly: true });
    return callback({
      get: async (query: Query) => {
        if (state.fail) throw new Error('PRIVATE infrastructure error');
        assert(query.keys.length); assert(Number.isFinite(query.max)); reads.push({ collection: query.name, keys: [...query.keys], max: query.max });
        if (query.field !== 'firebaseUid' && state.overflow === query.name) return { size: query.max, docs: [] };
        const docs = [...records].filter(([path, data]) => path.startsWith(query.name + '/') && (!query.field || data[query.field] === query.value)).slice(0, query.max).map(([path]) => document(path, query.keys));
        return { docs, size: docs.length };
      },
      getAll: async (...args: any[]) => {
        const { fieldMask } = args.pop(); const paths = args.map(ref => ref.path);
        reads.push({ collection: paths[0].split('/')[0], keys: [...fieldMask], paths });
        return state.exactMissing ? [] : paths.map(path => document(path, fieldMask, true)).reverse();
      },
      set: () => assert.fail('No writer is available'), update: () => assert.fail('No writer is available'), delete: () => assert.fail('No writer is available'),
    });
  } } as unknown as Firestore;
  const intent: any = { schemaVersion: 1, personId: 'subject', positionIds: ['store-manager', 'district-manager'], lifecycle: 'keep', reason: 'PRIVATE_REASON', responsibilities: [{ owner: 'locations', id: 'store', field: 'storeManagerId', action: 'retain' }], primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: [] };
  return { records, reads, state, versions, firestore, intent };
}

test('coherent projected preview: explicit roles only, no mutations or exposed contacts/patches/preconditions', async () => {
  const f = fixture(), before = structuredClone([...f.records]);
  const p = await previewPersonTransitionCommand(f.firestore, f.intent, actor, signer(), clock);
  assert.equal(p.ready, true); assert.equal(p.canCommit, false); assert(p.reviewEnvelope);
  assert.equal(p.expiresAt, new Date(time + TRANSITION_REVIEW_TTL_MS).toISOString());
  assert.equal(p.review.responsibilities[0].action, 'retain'); assert.equal(p.review.counts.businessDocuments, 1);
  assert.deepEqual([...f.records], before);
  assert.doesNotMatch(JSON.stringify(p), /PRIVATE|19095550100|patches|preconditions|internal|firebaseUid/);
  assert(!f.reads.some(r => r.collection === 'people' && !r.paths));
  assert.deepEqual(f.reads.filter(r => r.collection === 'people').flatMap(r => r.paths!), ['people/subject']);
  assert(!f.reads.some(r => r.keys.some(k => /email|phone/i.test(k))));
  for (const [collection, maximum] of Object.entries(COMMAND_PREVIEW_LIMITS)) assert(f.reads.some(r => r.collection === collection && r.max === maximum + 1));
  assert.equal((await previewPersonTransitionCommand(f.firestore, f.intent, actor, signer(), clock)).reviewEnvelope, p.reviewEnvelope);
});

test('SM replacement reads only needed exact contacts; vacancy never fetches replacement contacts', async () => {
  for (const action of ['replace', 'vacate']) {
    const f = fixture(); f.intent.positionIds = ['district-manager'];
    f.intent.responsibilities[0] = { ...f.intent.responsibilities[0], action, ...(action === 'replace' ? { replacementId: 'replacement' } : {}) };
    const p = await previewPersonTransitionCommand(f.firestore, f.intent, actor, signer(), clock);
    assert.equal(p.ready, true); assert.equal(p.canCommit, false);
    assert.equal(p.review.responsibilities[0].after, action === 'replace' ? 'replacement' : '');
    assert.doesNotMatch(JSON.stringify(p), /PRIVATE|1909555010[01]/);
    const contacts = f.reads.filter(r => r.keys.includes('workPhone'));
    assert.deepEqual(contacts.flatMap(r => r.paths!), action === 'replace' ? ['people/replacement'] : []);
    assert(f.reads.some(r => r.paths?.includes('locations/store') && r.keys.includes('storeManagerPhone')));
  }
});

test('blocked or missing replacements have no envelope, and pending review uses exact IDs without private prose', async () => {
  const f = fixture(); f.intent.positionIds = ['district-manager'];
  f.intent.responsibilities[0] = { ...f.intent.responsibilities[0], action: 'replace', replacementId: 'missing' };
  const p = await previewPersonTransitionCommand(f.firestore, f.intent, actor, signer(), clock);
  assert.equal(p.ready, false); assert(!Object.hasOwn(p, 'reviewEnvelope')); assert.match(p.review.blockers.join(), /Active controlled/);
  const pending = fixture(); pending.records.set('requests/pending', { status: 'Pending', targetType: 'Person', targetId: 'subject', changeType: 'Phone', reason: 'PRIVATE_PROSE', requestedChanges: { email: 'PRIVATE_PROPOSED_EMAIL' }, currentSnapshot: {} });
  const blocked = await previewPersonTransitionCommand(pending.firestore, pending.intent, actor, signer(), clock); assert.equal(blocked.ready, false);
  pending.intent.acknowledgedRequestIds = ['pending'];
  const accepted = await previewPersonTransitionCommand(pending.firestore, pending.intent, actor, signer(), clock); assert.equal(accepted.ready, true);
  assert.doesNotMatch(JSON.stringify(accepted), /PRIVATE/); assert.deepEqual(accepted.review.pendingRequests.map(r => r.id), ['pending']);
});

test('native metadata and presence distinguish unversioned edits, explicit zero/null and absent application versions', async () => {
  const f = fixture();
  const envelope = async () => { const p = await previewPersonTransitionCommand(f.firestore, f.intent, actor, signer(), clock); return signer().verify(p.reviewEnvelope, { actorUid: actor.uid, personId: 'subject', intentHash: JSON.parse(Buffer.from(p.reviewEnvelope!.split('.')[1], 'base64url').toString()).intentHash }, time); };
  const first = await envelope(); f.versions.set('locations/store', 1); const native = await envelope(); assert.notEqual(first.stateHash, native.stateHash);
  f.records.get('people/subject').version = null; const nullable = await envelope(); assert.notEqual(native.stateHash, nullable.stateHash);
  delete f.records.get('people/subject').version; assert.notEqual(nullable.stateHash, (await envelope()).stateHash);
  f.records.set('districts/new', { name: 'New District', regionId: 'region', status: 'Active', districtManagerId: null }); assert.notEqual(nullable.stateHash, (await envelope()).stateHash);
});

test('fresh administrator authority, missing signing configuration and malformed intent fail before inventory', async () => {
  for (const change of [{ role: 'Directory Data Steward' }, { accessScope: 'Store 007' }, { status: 'Suspended' }]) {
    const f = fixture(); await assert.rejects(previewPersonTransitionCommand(f.firestore, f.intent, { ...actor, ...change } as Account, signer(), clock), /administrator/); assert.equal(f.reads.length, 0);
  }
  const missing = fixture(); await assert.rejects(previewPersonTransitionCommand(missing.firestore, missing.intent, actor, undefined, clock), /signing is unavailable/); assert.equal(missing.reads.length, 0);
  const invalid = fixture(); await assert.rejects(previewPersonTransitionCommand(invalid.firestore, { ...invalid.intent, writes: [] }, actor, signer(), clock), /Invalid Person/); assert.equal(invalid.reads.length, 0);
  for (const mutate of [(f: ReturnType<typeof fixture>) => { f.records.get('users/admin').status = 'Revoked'; }, (f: ReturnType<typeof fixture>) => { f.records.set('users/duplicate', { ...f.records.get('users/admin') }); }]) {
    const f = fixture(); mutate(f); await assert.rejects(previewPersonTransitionCommand(f.firestore, f.intent, actor, signer(), clock), /Current administrator/); assert.equal(f.reads.length, 1);
  }
});

test('incomplete, malformed, excessive, incoherent or expired reads fail closed', async () => {
  for (const collection of Object.keys(COMMAND_PREVIEW_LIMITS)) {
    const f = fixture(); f.state.overflow = collection; await assert.rejects(previewPersonTransitionCommand(f.firestore, f.intent, actor, signer(), clock), /capacity exceeded/);
  }
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.state.noTime = 'locations/store'; },
    (f: ReturnType<typeof fixture>) => { f.state.exactMissing = true; },
    (f: ReturnType<typeof fixture>) => { f.records.get('locations/store').id = 'different'; },
    (f: ReturnType<typeof fixture>) => { f.records.set('requests/malformed', { status: 'Pending', targetType: 'Person', targetId: 'subject', changeType: 'Phone', requestedChanges: 'PRIVATE_BAD_SHAPE' }); },
    (f: ReturnType<typeof fixture>) => { f.records.get('districts/district').name = 'x'.repeat(8 * 1024 * 1024); },
    (f: ReturnType<typeof fixture>) => { f.state.fail = true; },
  ]) { const f = fixture(); mutate(f); await assert.rejects(previewPersonTransitionCommand(f.firestore, f.intent, actor, signer(), clock)); }
  const incoherent = fixture(); incoherent.state.incoherent = true; incoherent.intent.responsibilities[0].action = 'vacate'; incoherent.intent.positionIds = ['district-manager'];
  await assert.rejects(previewPersonTransitionCommand(incoherent.firestore, incoherent.intent, actor, signer(), clock), /Inconsistent/);
  const slow = fixture(); let calls = 0; await assert.rejects(previewPersonTransitionCommand(slow.firestore, slow.intent, actor, signer(), () => new Date(time + (calls++ ? TRANSITION_REVIEW_TTL_MS : 0))), /expired/);
});

test('HTTP preview is private, admin-only, bounded and never enables writer methods', async () => {
  let selected = actor, failure = false, calls = 0, writes = 0;
  const f = fixture(), app = express();
  app.use('/api/directory', createDirectoryDataRouter(async () => selected, { commit: async () => { writes++; throw new Error('Forbidden'); }, previewPersonTransitionCommand: async (intent, current) => { calls++; if (failure) throw new Error('PRIVATE_BACKEND_FAILURE'); return previewPersonTransitionCommand(f.firestore, intent, current, signer(), clock); } }));
  app.use((_request, response) => response.status(404).json({ error: { code: 'api_route_not_found' } }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/directory/person-transitions`;
  const post = (body: string, token = true, mode = 'preview') => fetch(`${url}/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer synthetic' } : {}) }, body });
  try {
    assert.equal((await post('{}', false)).status, 401); assert.equal(calls, 0);
    for (const change of [{ role: 'Viewer' }, { role: 'Editor' }, { role: 'Directory Data Steward' }, { status: 'Suspended' }, { accessScope: 'Store 007' }]) { selected = { ...actor, ...change } as Account; assert.equal((await post(JSON.stringify(f.intent))).status, 403); }
    selected = actor; assert.equal(calls, 0);
    assert.equal((await post(JSON.stringify({ ...f.intent, writes: [] }))).status, 400);
    assert.equal((await post('{')).status, 400);
    assert.equal((await post(' '.repeat(128 * 1024) + JSON.stringify(f.intent))).status, 413); assert.equal(calls, 0);
    const success = await post(JSON.stringify(f.intent)); assert.equal(success.status, 200); assert.equal(success.headers.get('cache-control'), 'no-store'); assert.equal(success.headers.get('etag'), null);
    const body = await success.json(); assert.equal(body.ready, true); assert.equal(body.canCommit, false); assert.doesNotMatch(JSON.stringify(body), /PRIVATE|19095550100|internal|patches|preconditions/);
    for (const mode of ['prepare', 'commit', 'cancel', 'status']) assert.equal((await post('{}', true, mode)).status, 404);
    assert.equal((await fetch(`${url}/operations`)).status, 404); assert.equal(writes, 0);
    failure = true; const unavailable = await post(JSON.stringify(f.intent)); assert.equal(unavailable.status, 503); assert.doesNotMatch(await unavailable.text(), /PRIVATE/);
    const attempts = [];
    for (let index = 0; index < 11; index++) attempts.push((await post(JSON.stringify(f.intent))).status);
    assert.ok(attempts.includes(429)); assert.equal(attempts.at(-1), 429); assert.equal(writes, 0);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

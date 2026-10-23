import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Firestore } from '@google-cloud/firestore';
import type { Account } from '../server/authAuthority';
import { PersonTransitionReviewSigner, TRANSITION_REVIEW_TTL_MS } from '../server/personTransitionReviewEnvelope';
import { personTransitionIntentHash } from '../server/personTransitionPlanner';
import {
  TRANSITION_OPERATION_COLLECTION, normalizeTransitionPreparation, normalizeTransitionRecoveryMarker,
  transitionOperationIdentity, transitionOperationKey, transitionCommitAuditId, transitionCancellationAuditId,
  storedTransitionReview, newPreparedTransitionReceipt, readTransitionReceipt, cancelledTransitionReceipt, transitionRecoveryOutcome,
} from '../server/personTransitionOperation';
import { preparePersonTransitionRecovery, readPersonTransitionRecovery, cancelPersonTransitionRecovery, listPersonTransitionPreparations } from '../server/firestorePersonTransitionRecovery';

const time = Date.parse('2026-10-23T21:00:00Z');
const clock = () => new Date(time);
const actor: Account = { uid: 'synthetic-admin', name: 'PRIVATE_ACTOR_NAME', email: 'PRIVATE_ACTOR_EMAIL', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
const signer = new PersonTransitionReviewSigner({ activeKeyId: 'synthetic', keys: [{ id: 'synthetic', secret: Buffer.alloc(32, 0x61).toString('base64url') }] });
const operationId = '11111111-1111-4111-8111-111111111111';
const intent = { schemaVersion: 1, personId: 'synthetic-person', positionIds: ['store-manager', 'district-manager'], lifecycle: 'keep', reason: 'PRIVATE_REASON', responsibilities: [], primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: [] };
const claims = { actorUid: actor.uid, personId: intent.personId, intentHash: personTransitionIntentHash(intent), stateHash: 'a'.repeat(64), planHash: 'b'.repeat(64), issuedAt: time, expiresAt: time + TRANSITION_REVIEW_TTL_MS };
const envelope = signer.sign(claims);
const input = (overrides = {}) => ({ schemaVersion: 1, operationId, intent, reviewEnvelope: envelope, ...overrides });
const command = normalizeTransitionPreparation(input(), actor.uid);
const marker = (identity = command.identity) => ({ schemaVersion: 1 as const, operationId: identity.operationId, personId: identity.personId, commandDigest: identity.commandDigest });
const review = storedTransitionReview(signer.verify(envelope, claims, time), command.envelopeHash);
const path = (identity = command.identity) => `${TRANSITION_OPERATION_COLLECTION}/${transitionOperationKey(identity)}`;
const prepared = () => newPreparedTransitionReceipt(command.identity, review, time);
const committed = () => readTransitionReceipt({ ...prepared(), state: 'committed', updatedAt: time + 1, auditId: transitionCommitAuditId(command.identity), changes: [{ collection: 'people', id: intent.personId, version: 2 }] }, command.identity);

/** Serialized rollback-capable fixture, NOT emulator/query-concurrency evidence. No business writer. */
function fixture() {
  const records = new Map<string, any>([['users/admin', { firebaseUid: actor.uid, role: actor.role, status: actor.status, accessScope: actor.accessScope, email: 'PRIVATE_ACCOUNT' }]]);
  const reads: any[] = [], writes: any[] = [];
  let queue = Promise.resolve(), failCommit = false, loseResponse = false, overflow = false, badSource = false;
  class Query {
    filters: [string, unknown][] = []; keys: string[] | null = null; max = Infinity;
    constructor(public name: string) {}
    where(field: string, op: string, value: unknown) { assert.equal(op, '=='); this.filters.push([field, value]); return this; }
    select(...keys: string[]) { this.keys = keys; return this; }
    limit(max: number) { this.max = max; return this; }
    doc(id: string) { return { path: `${this.name}/${id}` }; }
  }
  const document = (p: string, keys: string[] | null = null) => ({ id: p.split('/')[1], ref: { path: badSource && p.startsWith(TRANSITION_OPERATION_COLLECTION + '/') ? 'wrong/path' : p }, exists: records.has(p), data: () => {
    const value = records.get(p); return value === undefined ? undefined : structuredClone(keys ? Object.fromEntries(keys.filter(k => Object.hasOwn(value, k)).map(k => [k, value[k]])) : value);
  } });
  const firestore = { collection: (name: string) => new Query(name), runTransaction: async (callback: any, options?: { readOnly?: boolean }) => {
    const previous = queue; let release: () => void; queue = new Promise<void>(resolve => { release = resolve; }); await previous;
    const staged: any[] = []; let hasWrites = false;
    try {
      const result = await callback({ get: async (target: Query | { path: string }) => {
        assert.equal(hasWrites, false, 'Every read precedes writes');
        if (!(target instanceof Query)) { reads.push({ path: target.path }); return document(target.path); }
        reads.push({ collection: target.name, filters: target.filters, keys: target.keys, max: target.max, readOnly: options?.readOnly });
        assert(Number.isFinite(target.max));
        const docs = [...records].filter(([p, v]) => p.startsWith(target.name + '/') && target.filters.every(([k, value]) => v[k] === value)).slice(0, target.max).map(([p]) => document(p, target.keys));
        return { docs, size: overflow && target.name === TRANSITION_OPERATION_COLLECTION ? 51 : docs.length };
      }, create: (ref: { path: string }, value: any) => { assert(!options?.readOnly); hasWrites = true; staged.push({ type: 'create', path: ref.path, value: structuredClone(value) }); },
      update: (ref: { path: string }, value: any) => { assert(!options?.readOnly); hasWrites = true; staged.push({ type: 'update', path: ref.path, value: structuredClone(value) }); },
      set: () => assert.fail('No unguarded set'), delete: () => assert.fail('No delete') });
      if (failCommit) throw new Error('Synthetic commit failure');
      const final = new Map(records);
      for (const write of staged) {
        assert([TRANSITION_OPERATION_COLLECTION, 'audit_logs'].includes(write.path.split('/')[0]), 'No business/account writes');
        if (write.type === 'create' && final.has(write.path) || write.type === 'update' && !final.has(write.path)) throw new Error('Synthetic create/update precondition');
        final.set(write.path, write.type === 'create' ? write.value : { ...final.get(write.path), ...write.value });
      }
      records.clear(); for (const [p, v] of final) records.set(p, v); writes.push(...staged);
      if (loseResponse && staged.length) throw new Error('Synthetic lost response after commit');
      return result;
    } finally { release!(); }
  } } as unknown as Firestore;
  return { firestore, records, reads, writes, failCommit: () => { failCommit = true; }, loseResponse: () => { loseResponse = true; }, overflow: () => { overflow = true; }, badSource: () => { badSource = true; } };
}

test('immutable operation identity binds actor/intent/envelope; actor+UUID key detects reused content', () => {
  assert.equal(command.identity.commandDigest.length, 64); assert.equal(transitionOperationKey(command.identity).length, 64);
  const reordered = normalizeTransitionPreparation(input({ intent: { ...intent, positionIds: [...intent.positionIds].reverse() } }), actor.uid);
  assert.deepEqual(reordered.identity, command.identity);
  for (const other of [normalizeTransitionPreparation(input({ intent: { ...intent, reason: 'Different' } }), actor.uid), normalizeTransitionPreparation(input({ reviewEnvelope: envelope + 'x' }), actor.uid)]) {
    assert.equal(transitionOperationKey(other.identity), transitionOperationKey(command.identity)); assert.notEqual(other.identity.commandDigest, command.identity.commandDigest);
  }
  const otherActor = normalizeTransitionPreparation(input(), 'different'); assert.notEqual(transitionOperationKey(otherActor.identity), transitionOperationKey(command.identity));
  for (const raw of [input({ actorUid: 'forged' }), input({ operationId: operationId.toUpperCase().replace('1111-4111', 'AAAA-4111') }), input({ operationId: '../bad' }), input({ schemaVersion: 2 }), input({ reviewEnvelope: 'x'.repeat(4097) }), input({ intent: { ...intent, reason: 'x'.repeat(1001) } })]) assert.throws(() => normalizeTransitionPreparation(raw, actor.uid));
  for (const raw of [{ ...marker(), reviewEnvelope: envelope }, { ...marker(), commandDigest: '' }, { ...marker(), personId: '../bad' }]) assert.throws(() => normalizeTransitionRecoveryMarker(raw));
  assert.throws(() => transitionOperationIdentity(marker(), '')); assert.throws(() => transitionOperationIdentity(marker(), 'x'.repeat(129)));
});

test('strict receipt shapes, minimal outcomes and terminal cancellation preserve identity', () => {
  const before = prepared(), frozen = structuredClone(before); Object.freeze(before);
  assert.equal(readTransitionReceipt(before, command.identity).state, 'prepared');
  const cancelled = cancelledTransitionReceipt(command.identity, before, time + 1); assert.equal(cancelled.state, 'cancelled'); assert.equal(cancelled.preparedAt, time); assert.deepEqual(before, frozen);
  assert.deepEqual(cancelledTransitionReceipt(command.identity, cancelled, time + 100), cancelled);
  assert.deepEqual(cancelledTransitionReceipt(command.identity, committed(), time + 100), committed());
  assert.equal(cancelledTransitionReceipt(command.identity, before, time - 10_000).updatedAt, time);
  assert.deepEqual(cancelledTransitionReceipt(command.identity, committed(), NaN), committed());
  assert.equal(transitionRecoveryOutcome(command.identity, null).state, 'unknown');
  for (const value of [before, cancelled, committed()]) assert.doesNotMatch(JSON.stringify(transitionRecoveryOutcome(command.identity, value)), /PRIVATE|intentHash|envelopeHash|stateHash|planHash|reviewEnvelope|actorUid/);
  for (const changes of [{ rawIntent: intent }, { preparedAt: time + 1 }, { updatedAt: time - 1 }, { review: { ...review, expiresAt: time + 1 } }, { review: { ...review, intentHash: 'f'.repeat(64) } }, { changes: [{ collection: 'users', id: 'admin', version: 1 }] }, { state: 'committed', changes: [], auditId: 'wrong' }]) assert.throws(() => readTransitionReceipt({ ...before, ...changes }, command.identity));
  const changed = committed(); changed.changes.push(changed.changes[0]); assert.throws(() => readTransitionReceipt(changed, command.identity));
  assert.throws(() => cancelledTransitionReceipt({ ...command.identity, actorUid: 'other' }, before, time + 1), /conflict/);
});

test('preparation only creates minimal receipt, duplicate is idempotent and no staffing/audit writes occur', async () => {
  const f = fixture(); const result = await preparePersonTransitionRecovery(f.firestore, input(), actor, signer, clock);
  assert.equal(result.state, 'prepared'); assert.equal(result.canCommit, false); assert.equal(f.writes.length, 1); assert.equal(f.writes[0].path, path());
  assert.deepEqual(await preparePersonTransitionRecovery(f.firestore, input(), actor, signer, () => new Date(time + 1)), result); assert.equal(f.writes.length, 1);
  assert.doesNotMatch(JSON.stringify([...f.records].filter(([p]) => p.startsWith(TRANSITION_OPERATION_COLLECTION))), /PRIVATE|ptv1\.|positionIds|responsibilities|phone|email|reason/);
  assert.deepEqual(f.reads[0].keys, ['role', 'status', 'accessScope']); assert.equal(f.reads[0].max, 2);
});

test('fresh authority and missing signing configuration deny before metadata mutation', async () => {
  for (const patch of [{ role: 'Viewer' }, { role: 'Directory Data Steward' }, { status: 'Suspended' }, { accessScope: 'Store' }, { uid: '' }]) {
    const f = fixture(), changed = { ...actor, ...patch } as Account;
    for (const action of [() => preparePersonTransitionRecovery(f.firestore, input(), changed, signer, clock), () => readPersonTransitionRecovery(f.firestore, marker(), changed), () => cancelPersonTransitionRecovery(f.firestore, marker(), changed, clock), () => listPersonTransitionPreparations(f.firestore, changed)]) await assert.rejects(action, /administrator/);
    assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
  }
  const missing = fixture(); await assert.rejects(preparePersonTransitionRecovery(missing.firestore, input(), actor, undefined, clock), /signing/); assert.equal(missing.reads.length, 0);
  for (const change of ['missing', 'revoked', 'duplicate', 'scope']) {
    const f = fixture();
    if (change === 'missing') f.records.clear();
    if (change === 'revoked') f.records.get('users/admin').status = 'Revoked';
    if (change === 'duplicate') f.records.set('users/duplicate', { ...f.records.get('users/admin') });
    if (change === 'scope') f.records.get('users/admin').accessScope = 'Store';
    for (const action of [() => preparePersonTransitionRecovery(f.firestore, input(), actor, signer, clock), () => readPersonTransitionRecovery(f.firestore, marker(), actor), () => cancelPersonTransitionRecovery(f.firestore, marker(), actor, clock), () => listPersonTransitionPreparations(f.firestore, actor)]) await assert.rejects(action, /administrator authority/);
    assert.equal(f.writes.length, 0); assert(!f.reads.some(r => r.collection === TRANSITION_OPERATION_COLLECTION || r.path));
  }
});

test('signature/freshness is enforced for preparations; terminal committed replay can outlive expiry', async () => {
  for (const override of [{ reviewEnvelope: envelope.slice(0, -3) + 'bad' }, { intent: { ...intent, reason: 'Changed' } }]) {
    const f = fixture(); await assert.rejects(preparePersonTransitionRecovery(f.firestore, input(override), actor, signer, clock)); assert.equal(f.reads.length, 0);
  }
  for (const when of [time - 1, time + TRANSITION_REVIEW_TTL_MS]) {
    const f = fixture(); await assert.rejects(preparePersonTransitionRecovery(f.firestore, input(), actor, signer, () => new Date(when))); assert.equal(f.writes.length, 0);
  }
  const existing = fixture(); existing.records.set(path(), prepared()); await assert.rejects(preparePersonTransitionRecovery(existing.firestore, input(), actor, signer, () => new Date(time + TRANSITION_REVIEW_TTL_MS))); assert.equal(existing.writes.length, 0);
  const done = fixture(); done.records.set(path(), committed()); const outcome = await preparePersonTransitionRecovery(done.firestore, input(), actor, signer, () => new Date(time + 2 * TRANSITION_REVIEW_TTL_MS)); assert.equal(outcome.state, 'committed'); assert.equal(done.writes.length, 0);
  for (const replayClock of [() => new Date(time - 10_000), () => new Date(NaN), () => { throw new Error('Clock must not be consulted for terminal replay'); }]) {
    assert.deepEqual(await preparePersonTransitionRecovery(done.firestore, input(), actor, signer, replayClock), outcome); assert.equal(done.writes.length, 0);
  }
  const invalidClock = fixture(); await assert.rejects(preparePersonTransitionRecovery(invalidClock.firestore, input(), actor, signer, () => new Date(NaN)), /clock/); assert.equal(invalidClock.writes.length, 0);
  assert.throws(() => signer.verify(envelope, claims, time + TRANSITION_REVIEW_TTL_MS)); assert.equal(signer.verifySignature(envelope, claims).planHash, claims.planHash);
});

test('status is actor-namespaced, minimal, key-independent and missing means unknown', async () => {
  const f = fixture(); assert.equal((await readPersonTransitionRecovery(f.firestore, marker(), actor)).state, 'unknown');
  f.records.set(path(), prepared()); assert.equal((await readPersonTransitionRecovery(f.firestore, marker(), actor)).state, 'prepared');
  const other = { ...actor, uid: 'other-admin' }; f.records.set('users/other', { firebaseUid: other.uid, role: other.role, status: other.status, accessScope: other.accessScope });
  assert.equal((await readPersonTransitionRecovery(f.firestore, marker(), other)).state, 'unknown');
  await assert.rejects(readPersonTransitionRecovery(f.firestore, { ...marker(), commandDigest: 'f'.repeat(64) }, actor), /conflict/);
  assert.equal(f.writes.length, 0); assert(f.reads.some(r => r.collection === 'users' && r.readOnly === true));
});

test('cancellation seals absent/prepared IDs; late or changed preparation cannot resurrect them', async () => {
  for (const hadPrepared of [false, true]) {
    const f = fixture(); if (hadPrepared) f.records.set(path(), prepared());
    const cancelled = await cancelPersonTransitionRecovery(f.firestore, marker(), actor, () => new Date(time + TRANSITION_REVIEW_TTL_MS + 1));
    assert.equal(cancelled.state, 'cancelled'); assert.equal(cancelled.changes.length, 0); assert.equal(f.writes.length, 2);
    assert.equal(cancelled.preparedAt, hadPrepared ? new Date(time).toISOString() : null);
    assert.deepEqual(await cancelPersonTransitionRecovery(f.firestore, marker(), actor, () => new Date(time + 9 * TRANSITION_REVIEW_TTL_MS)), cancelled); assert.equal(f.writes.length, 2);
    await assert.rejects(preparePersonTransitionRecovery(f.firestore, input(), actor, signer, clock), /cancelled/);
    const differentIntent = { ...intent, reason: 'Other' }, token = signer.sign({ ...claims, intentHash: personTransitionIntentHash(differentIntent) });
    await assert.rejects(preparePersonTransitionRecovery(f.firestore, input({ intent: differentIntent, reviewEnvelope: token }), actor, signer, clock), /identity conflict/); assert.equal(f.writes.length, 2);
    const audits = [...f.records].filter(([p]) => p.startsWith('audit_logs/')); assert.equal(audits.length, 1); assert.doesNotMatch(JSON.stringify(audits), /PRIVATE|ptv1\.|intentHash|reviewEnvelope/);
  }
  const f = fixture(); f.records.set(path(), committed()); const before = structuredClone([...f.records]); assert.equal((await cancelPersonTransitionRecovery(f.firestore, marker(), actor)).state, 'committed'); assert.deepEqual([...f.records], before); assert.equal(f.writes.length, 0);
  const skewed = fixture(); skewed.records.set(path(), prepared());
  const sealed = await cancelPersonTransitionRecovery(skewed.firestore, marker(), actor, () => new Date(time - 10_000));
  assert.equal(sealed.state, 'cancelled'); assert.equal(sealed.resolvedAt, new Date(time).toISOString());
  const audit = skewed.records.get(`audit_logs/${transitionCancellationAuditId(command.identity)}`); assert.equal(audit.timestamp, sealed.resolvedAt); assert.equal(skewed.writes.length, 2);
});

test('lost response recovers through status, failed transactions/audit collisions leave no partial receipt', async () => {
  const lost = fixture(); lost.loseResponse(); await assert.rejects(preparePersonTransitionRecovery(lost.firestore, input(), actor, signer, clock), /lost response/);
  assert.equal((await readPersonTransitionRecovery(lost.firestore, marker(), actor)).state, 'prepared');
  await assert.rejects(cancelPersonTransitionRecovery(lost.firestore, marker(), actor, clock), /lost response/);
  assert.equal((await readPersonTransitionRecovery(lost.firestore, marker(), actor)).state, 'cancelled'); assert.equal([...lost.records.keys()].filter(p => p.startsWith('audit_logs/')).length, 1);
  for (const mode of ['failure', 'collision']) {
    const f = fixture(); if (mode === 'failure') f.failCommit(); else f.records.set(`audit_logs/${transitionCancellationAuditId(command.identity)}`, { unexpected: true });
    const before = structuredClone([...f.records]); await assert.rejects(cancelPersonTransitionRecovery(f.firestore, marker(), actor, clock)); assert.deepEqual([...f.records], before); assert.equal(f.writes.length, 0);
  }
});

test('serialized late preparation/cancellation permutations have one terminal seal and one audit', async () => {
  for (const cancelFirst of [false, true]) {
    const f = fixture(); const prepare = () => preparePersonTransitionRecovery(f.firestore, input(), actor, signer, clock), cancel = () => cancelPersonTransitionRecovery(f.firestore, marker(), actor, clock);
    await Promise.allSettled(cancelFirst ? [cancel(), prepare(), cancel()] : [prepare(), cancel(), prepare(), cancel()]);
    assert.equal((await readPersonTransitionRecovery(f.firestore, marker(), actor)).state, 'cancelled'); assert.equal([...f.records.keys()].filter(p => p.startsWith('audit_logs/')).length, 1);
  }
});

test('own-prepared recovery query is complete and bounded; overflow/corrupt inventory fails closed', async () => {
  const f = fixture(); f.records.set(path(), prepared());
  const other = { ...command.identity, actorUid: 'other-admin' }; f.records.set(path(other), { ...prepared(), ...other });
  const list = await listPersonTransitionPreparations(f.firestore, actor); assert.equal(list.complete, true); assert.equal(list.operations.length, 1); assert.equal(list.operations[0].operationId, operationId); assert.equal(list.canCommit, false);
  const query = f.reads.find(r => r.collection === TRANSITION_OPERATION_COLLECTION); assert.deepEqual(query.filters, [['actorUid', actor.uid], ['state', 'prepared']]); assert.equal(query.max, 51); assert.equal(query.readOnly, true);
  assert.doesNotMatch(JSON.stringify(list), /PRIVATE|reviewEnvelope|envelopeHash|intentHash|actorUid/);
  f.overflow(); await assert.rejects(listPersonTransitionPreparations(f.firestore, actor), /capacity/);
  const corrupt = fixture(); corrupt.records.set(path(), { ...prepared(), reason: 'PRIVATE' }); await assert.rejects(listPersonTransitionPreparations(corrupt.firestore, actor));
  const badPath = fixture(); badPath.records.set(path(), prepared()); badPath.badSource(); await assert.rejects(listPersonTransitionPreparations(badPath.firestore, actor), /inventory/); await assert.rejects(readPersonTransitionRecovery(badPath.firestore, marker(), actor), /source/);
  const boundary = fixture();
  for (let index = 0; index < 51; index++) {
    if (index === 50) assert.equal((await listPersonTransitionPreparations(boundary.firestore, actor)).operations.length, 50);
    const identity = { ...command.identity, operationId: `11111111-1111-4111-8111-${index.toString().padStart(12, '0')}` };
    boundary.records.set(path(identity), newPreparedTransitionReceipt(identity, review, time));
  }
  await assert.rejects(listPersonTransitionPreparations(boundary.firestore, actor), /capacity/); assert.equal(boundary.writes.length, 0);
  assert.equal(f.writes.length, 0);
});

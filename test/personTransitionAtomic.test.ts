import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Firestore } from '@google-cloud/firestore';
import type { Account } from '../server/authAuthority';
import { commitPersonTransitionAtomic } from '../server/firestorePersonTransitionAtomic';
import { personTransitionIntentHash } from '../server/personTransitionPlanner';
import { PersonTransitionReviewSigner } from '../server/personTransitionReviewEnvelope';
import { normalizeTransitionPreparation, newPreparedTransitionReceipt, storedTransitionReview, transitionCommitAuditId, cancelledTransitionReceipt } from '../server/personTransitionOperation';

const time = Date.parse('2026-10-23T23:00:00Z');
const actor: Account = { uid: 'synthetic-admin', name: 'Synthetic Admin', email: null, emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
const signer = new PersonTransitionReviewSigner({ activeKeyId: 'synthetic', keys: [{ id: 'synthetic', secret: Buffer.alloc(32, 0x74).toString('base64url') }] });
const intent = { schemaVersion: 1, personId: 'subject', positionIds: ['store-manager', 'district-manager'], lifecycle: 'keep', reason: 'Synthetic review', responsibilities: [], primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: [] };
const claims = { actorUid: actor.uid, personId: intent.personId, intentHash: personTransitionIntentHash(intent), stateHash: 'a'.repeat(64), planHash: 'b'.repeat(64), issuedAt: time, expiresAt: time + 300_000 };
const reviewEnvelope = signer.sign(claims), input = { schemaVersion: 1, operationId: '11111111-1111-4111-8111-111111111111', intent, reviewEnvelope };
const command = normalizeTransitionPreparation(input, actor.uid);
const prepared = newPreparedTransitionReceipt(command.identity, storedTransitionReview(signer.verify(reviewEnvelope, claims, time), command.envelopeHash), time);
function fixture() {
  const reads: string[] = []; const state: { receipt: any; active: boolean; transactions: number } = { receipt: null, active: true, transactions: 0 };
  const db = { collection: (name: string) => ({ name, where() { return this; }, select() { return this; }, limit(n: number) { assert.equal(n, 2); return this; }, doc(id: string) { return { path: `${name}/${id}` }; } }), runTransaction: async (callback: any) => {
    state.transactions++;
    return callback({ get: async (target: any) => {
      if (target.name === 'users') { reads.push('authority'); return { size: 1, docs: [{ data: () => ({ role: actor.role, status: state.active ? 'Active' : 'Revoked', accessScope: actor.accessScope }) }] }; }
      reads.push('receipt'); return { exists: state.receipt !== null, ref: { path: target.path }, data: () => structuredClone(state.receipt) };
    }, getAll: () => assert.fail('No later inventory should be read'), create: () => assert.fail('No writes admitted'), update: () => assert.fail('No writes admitted') });
  } } as unknown as Firestore;
  return { db, reads, state };
}

test('atomic entry denies wrong actor/role/scope before any SDK call', async () => {
  for (const changed of [{ role: 'Viewer' }, { role: 'Directory Data Steward' }, { status: 'Suspended' }, { accessScope: 'Store' }, { uid: '' }, { uid: 'x'.repeat(129) }]) {
    const f = fixture(); await assert.rejects(commitPersonTransitionAtomic(f.db, input, { ...actor, ...changed } as Account, signer), /administrator/); assert.equal(f.state.transactions, 0);
  }
});
test('atomic entry rejects arbitrary patches/invalid intent or missing key before inventory', async () => {
  for (const raw of [{ ...input, writes: [] }, { ...input, actorId: 'forged' }, { ...input, operationId: '../bad' }, { ...input, intent: { ...intent, unexpected: 'value' } }]) {
    const f = fixture(); await assert.rejects(commitPersonTransitionAtomic(f.db, raw, actor, signer)); assert.equal(f.state.transactions, 0);
  }
  const f = fixture(); await assert.rejects(commitPersonTransitionAtomic(f.db, input, actor, undefined), /signing/); assert.equal(f.state.transactions, 0);
});
test('atomic entry rejects tampered/cross-actor/changed-intent signatures before inventory', async () => {
  for (const raw of [{ ...input, reviewEnvelope: reviewEnvelope.slice(0, -3) + 'bad' }, { ...input, intent: { ...intent, reason: 'Changed' } }, { ...input, reviewEnvelope: signer.sign({ ...claims, actorUid: 'other' }) }]) {
    const f = fixture(); await assert.rejects(commitPersonTransitionAtomic(f.db, raw, actor, signer)); assert.equal(f.state.transactions, 0);
  }
});
test('atomic entry requires an existing preparation and current authority without silently creating an operation', async () => {
  const f = fixture(); await assert.rejects(commitPersonTransitionAtomic(f.db, input, actor, signer), /Prepare/); assert.deepEqual(f.reads, ['authority', 'receipt']);
  const denied = fixture(); denied.state.active = false; await assert.rejects(commitPersonTransitionAtomic(denied.db, input, actor, signer), /authority/); assert.deepEqual(denied.reads, ['authority']);
});
test('atomic terminal replay is identity-bound, fresh-authority checked and independent of clock/later inventory', async () => {
  const f = fixture(); f.state.receipt = { ...prepared, state: 'committed', updatedAt: time + 1, auditId: transitionCommitAuditId(command.identity), changes: [{ collection: 'people', id: intent.personId, version: 1 }] };
  const result = await commitPersonTransitionAtomic(f.db, input, actor, signer, () => { throw new Error('Terminal replay must not consult clock'); }); assert.equal(result.state, 'committed'); assert.deepEqual(f.reads, ['authority', 'receipt']);
  const cancelled = fixture(); cancelled.state.receipt = cancelledTransitionReceipt(command.identity, prepared, time + 1); await assert.rejects(commitPersonTransitionAtomic(cancelled.db, input, actor, signer), /cancelled/);
  const foreign = fixture(); foreign.state.receipt = { ...f.state.receipt, commandDigest: 'f'.repeat(64) }; await assert.rejects(commitPersonTransitionAtomic(foreign.db, input, actor, signer), /identity conflict/);
});

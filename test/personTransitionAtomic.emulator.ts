import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Firestore, Timestamp, GeoPoint } from '@google-cloud/firestore';
import type { Account } from '../server/authAuthority';
import { previewPersonTransitionCommand } from '../server/personTransitionCommandPreview';
import { PersonTransitionReviewSigner } from '../server/personTransitionReviewEnvelope';
import { preparePersonTransitionRecovery, readPersonTransitionRecovery, cancelPersonTransitionRecovery } from '../server/firestorePersonTransitionRecovery';
import { commitPersonTransitionAtomic } from '../server/firestorePersonTransitionAtomic';
import { normalizeTransitionPreparation, TRANSITION_OPERATION_COLLECTION, transitionCommitAuditId } from '../server/personTransitionOperation';

// Deliberately outside *.test.ts: explicit opt-in only. Fail BEFORE any SDK instance/RPC.
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('This integration suite requires the isolated loopback emulator at 127.0.0.1:8089.');
const PROJECT = 'demo-directory-transitions';
const actor: Account = { uid: 'synthetic-admin', name: 'Synthetic Admin', email: null, emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
const signer = new PersonTransitionReviewSigner({ activeKeyId: 'synthetic', keys: [{ id: 'synthetic', secret: Buffer.alloc(32, 0x73).toString('base64url') }] });

async function fixture() {
  const db = new Firestore({ projectId: PROJECT, databaseId: `test-${randomUUID()}` });
  const time = Date.now(), clock = () => new Date(time);
  const records: Record<string, any> = {
    'users/admin': { firebaseUid: actor.uid, role: actor.role, status: actor.status, accessScope: actor.accessScope },
    'people/subject': { fullName: 'Synthetic Subject', positionIds: ['store-manager', 'district-manager'], status: 'Active', activeStatus: true, version: 0, workEmail: 'PRIVATE_PERSON_EMAIL', workPhone: '+19095550100', phonePrivacy: 'Internal', jobTitle: 'Preserved title', primaryLocationId: 'store', supportedLocationIds: [] },
    'people/replacement': { fullName: 'Synthetic Replacement', positionIds: ['store-manager', 'district-manager'], status: 'Active', workPhone: '+19095550101', phonePrivacy: 'Restricted' },
    'regions/region': { name: 'Synthetic Region', status: 'Active', version: 0 },
    'districts/district': { name: 'Synthetic District', regionId: 'region', status: 'Active', districtManagerId: 'subject', version: 0 },
    'locations/store': { name: 'Synthetic Store', storeNumber: '007', type: 'Enclosed Mall', recordStatus: 'Active', districtId: 'district', regionId: 'region', storeManagerId: 'subject', storeManagerName: 'Synthetic Subject', storeManagerPhone: '+19095550100', storeManagerPhonePrivacy: 'Internal', districtManagerId: 'subject', districtManagerName: 'Synthetic Subject', version: 0, address: 'PRIVATE_UNRELATED_ADDRESS', locationInboxEmail: 'PRIVATE_LOCATION_EMAIL', temporaryClosure: { id: 'synthetic-closure', reason: 'PRIVATE_INCIDENT' } },
    'locations/retired': { name: 'Synthetic Retired Store', storeNumber: '008', type: 'Enclosed Mall', recordStatus: 'Retired', districtId: 'district', regionId: 'region', districtManagerId: 'subject', districtManagerName: 'Synthetic Subject', version: 0 },
  };
  const batch = db.batch(); for (const [path, data] of Object.entries(records)) batch.create(db.doc(path), data); await batch.commit();
  const intent: any = { schemaVersion: 1, personId: 'subject', positionIds: ['store-manager'], lifecycle: 'keep', reason: 'Synthetic leadership review', responsibilities: [{ owner: 'locations', id: 'store', field: 'storeManagerId', action: 'retain' }, { owner: 'districts', id: 'district', field: 'districtManagerId', action: 'vacate' }], primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: [] };
  const review = async () => {
    const preview = await previewPersonTransitionCommand(db, intent, actor, signer, clock); assert.equal(preview.ready, true, preview.review.blockers.join('; '));
    const input = { schemaVersion: 1, operationId: randomUUID(), intent: structuredClone(intent), reviewEnvelope: preview.reviewEnvelope };
    const parsed = normalizeTransitionPreparation(input, actor.uid);
    const marker = { schemaVersion: 1 as const, operationId: input.operationId, personId: intent.personId, commandDigest: parsed.identity.commandDigest };
    await preparePersonTransitionRecovery(db, input, actor, signer, clock);
    return { preview, input, marker, identity: parsed.identity };
  };
  return { db, time, clock, records, intent, review };
}

test('actual SDK: nested masks/native metadata and atomic District+Person+retired-copy updates preserve unrelated fields', { timeout: 60_000 }, async () => {
  const f = await fixture();
  try {
    const originalTime = Timestamp.now();
    await f.db.doc('people/subject').update({ customMetadata: { savedTime: originalTime, reference: f.db.doc('locations/store'), point: new GeoPoint(34, -118), bytes: Buffer.from('synthetic') } });
    await f.db.doc('requests/pending').create({ status: 'Pending', targetType: 'Location', targetId: 'unrelated', changeType: 'Leadership', requestedChanges: { districtManagerId: 'subject', email: 'PRIVATE_PROPOSAL_EMAIL', reason: 'PRIVATE_PROSE' }, currentSnapshot: {} });
    f.intent.acknowledgedRequestIds = ['pending'];
    const command = await f.review(); assert.doesNotMatch(JSON.stringify(command.preview), /PRIVATE/);
    const result = await commitPersonTransitionAtomic(f.db, command.input, actor, signer, f.clock);
    assert.equal(result.state, 'committed'); assert.equal(result.changes.length, 4);
    const subject = (await f.db.doc('people/subject').get()).data()!; assert.deepEqual(subject.positionIds, ['store-manager']); assert.equal(subject.version, 1); assert.equal(subject.workEmail, 'PRIVATE_PERSON_EMAIL'); assert.equal(subject.jobTitle, 'Preserved title');
    assert(subject.customMetadata.savedTime.isEqual(originalTime)); assert.equal(subject.customMetadata.reference.path, 'locations/store'); assert.equal(subject.customMetadata.point.latitude, 34); assert.equal(subject.customMetadata.bytes.toString(), 'synthetic');
    assert.equal((await f.db.doc('districts/district').get()).data()!.districtManagerId, null);
    for (const id of ['store', 'retired']) { const saved = (await f.db.doc(`locations/${id}`).get()).data()!; assert.equal(saved.districtManagerId, ''); assert.equal(saved.districtManagerName, ''); assert.equal(saved.version, 1); }
    const store = (await f.db.doc('locations/store').get()).data()!; for (const key of ['storeManagerId', 'storeManagerPhone', 'address', 'locationInboxEmail', 'temporaryClosure']) assert.deepEqual(store[key], f.records['locations/store'][key]);
    const audits = await f.db.collection('audit_logs').get(); assert.equal(audits.size, 1); assert.doesNotMatch(JSON.stringify(audits.docs[0].data()), /PRIVATE|19095550100/);
    assert.equal((await f.db.collection(TRANSITION_OPERATION_COLLECTION).get()).size, 1);
    assert.equal((await f.db.doc('users/admin').get()).data()!.role, actor.role);
  } finally { await f.db.terminate(); }
});

test('actual SDK: concurrent duplicate commit creates one effect/audit and terminal replay ignores expiry/later changes', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const command = await f.review();
    const results = await Promise.all([commitPersonTransitionAtomic(f.db, command.input, actor, signer, f.clock), commitPersonTransitionAtomic(f.db, command.input, actor, signer, f.clock)]);
    assert.deepEqual(results[0], results[1]); assert.equal((await f.db.collection('audit_logs').get()).size, 1); assert.equal((await f.db.doc('people/subject').get()).data()!.version, 1);
    await f.db.doc('locations/store').update({ districtManagerName: 'Later synthetic edit', version: 2 });
    const replay = await commitPersonTransitionAtomic(f.db, command.input, actor, signer, () => { throw new Error('Terminal replay must not consult clock'); }); assert.deepEqual(replay, results[0]);
    assert.equal((await f.db.doc('locations/store').get()).data()!.districtManagerName, 'Later synthetic edit');
    const cancelled = await cancelPersonTransitionRecovery(f.db, command.marker, actor, () => new Date(f.time + 600_000)); assert.deepEqual(cancelled, replay);
  } finally { await f.db.terminate(); }
});

test('actual SDK: commit/cancel race has one terminal outcome and never partial business changes', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const command = await f.review(); await Promise.allSettled([commitPersonTransitionAtomic(f.db, command.input, actor, signer, f.clock), cancelPersonTransitionRecovery(f.db, command.marker, actor, f.clock)]);
    const final = await readPersonTransitionRecovery(f.db, command.marker, actor); assert(['committed', 'cancelled'].includes(final.state));
    const didCommit = final.state === 'committed';
    assert.equal((await f.db.doc('people/subject').get()).data()!.version, didCommit ? 1 : 0);
    for (const id of ['store', 'retired']) assert.equal((await f.db.doc(`locations/${id}`).get()).data()!.version, didCommit ? 1 : 0);
    assert.equal((await f.db.doc('districts/district').get()).data()!.districtManagerId, didCommit ? null : 'subject'); assert.equal((await f.db.collection('audit_logs').get()).size, 1);
  } finally { await f.db.terminate(); }
});

test('actual SDK: unversioned edits and inserted dependency/absence changes require a new review with zero command writes', { timeout: 90_000 }, async () => {
  for (const kind of ['name', 'member', 'user', 'request', 'new-district', 'recreated']) {
    const f = await fixture();
    try {
      const command = await f.review();
      if (kind === 'name') await f.db.doc('people/subject').update({ fullName: 'Changed without version bump' });
      if (kind === 'member') await f.db.doc('locations/new-member').create({ ...f.records['locations/retired'], storeNumber: '009' });
      if (kind === 'user') await f.db.doc('users/new-link').create({ personId: 'subject', role: 'Viewer', status: 'Revoked' });
      if (kind === 'request') await f.db.doc('requests/new-request').create({ status: 'Pending', targetType: 'Person', targetId: 'subject', changeType: 'Phone', requestedChanges: {} });
      if (kind === 'new-district') await f.db.doc('districts/new-district').create({ ...f.records['districts/district'], name: 'New responsibility' });
      if (kind === 'recreated') { await f.db.doc('people/subject').delete(); await f.db.doc('people/subject').create(f.records['people/subject']); }
      await assert.rejects(commitPersonTransitionAtomic(f.db, command.input, actor, signer, f.clock), /fresh preview/);
      assert.equal((await f.db.doc('locations/store').get()).data()!.version, 0); assert.equal((await f.db.doc('districts/district').get()).data()!.version, 0);
      assert.equal((await f.db.collection('audit_logs').get()).size, 0); assert.equal((await readPersonTransitionRecovery(f.db, command.marker, actor)).state, 'prepared');
    } finally { await f.db.terminate(); }
  }
});

test('actual SDK: full-document capacity and create-only audit collision abort without partial effects', { timeout: 90_000 }, async () => {
  for (const kind of ['capacity', 'audit-collision']) {
    const f = await fixture();
    try {
      if (kind === 'capacity') { const batch = f.db.batch(); for (let i = 0; i < 7; i++) batch.create(f.db.doc(`locations/big-${i}`), { ...f.records['locations/retired'], storeNumber: `10${i}`, unrelatedBlob: 'x'.repeat(700_000) }); await batch.commit(); }
      const command = await f.review(); if (kind === 'audit-collision') await f.db.doc(`audit_logs/${transitionCommitAuditId(command.identity)}`).create({ unexpected: true });
      await assert.rejects(commitPersonTransitionAtomic(f.db, command.input, actor, signer, f.clock));
      assert.equal((await f.db.doc('people/subject').get()).data()!.version, 0); assert.equal((await f.db.doc('locations/store').get()).data()!.version, 0); assert.equal((await readPersonTransitionRecovery(f.db, command.marker, actor)).state, 'prepared');
      assert.equal((await f.db.collection('audit_logs').get()).size, kind === 'audit-collision' ? 1 : 0);
    } finally { await f.db.terminate(); }
  }
});

test('actual SDK: missing preparation, expired review, lost authority and cancellation never admit a staffing commit', { timeout: 60_000 }, async () => {
  const f = await fixture();
  try {
    const command = await f.review();
    const unprepared = { ...command.input, operationId: randomUUID() }; await assert.rejects(commitPersonTransitionAtomic(f.db, unprepared, actor, signer, f.clock), /Prepare/);
    await assert.rejects(commitPersonTransitionAtomic(f.db, command.input, actor, signer, () => new Date(f.time + 600_000)), /envelope/);
    await f.db.doc('users/admin').update({ status: 'Revoked' }); await assert.rejects(commitPersonTransitionAtomic(f.db, command.input, actor, signer, f.clock), /authority/);
    await f.db.doc('users/admin').update({ status: 'Active' }); await cancelPersonTransitionRecovery(f.db, command.marker, actor, f.clock); await assert.rejects(commitPersonTransitionAtomic(f.db, command.input, actor, signer, f.clock), /cancelled/);
    assert.equal((await f.db.doc('people/subject').get()).data()!.version, 0); assert.equal((await f.db.doc('districts/district').get()).data()!.version, 0);
  } finally { await f.db.terminate(); }
});

test('actual SDK: explicit SM/DM replacement refreshes only allowed copies and keeps replacement contacts out of audit/receipt', { timeout: 60_000 }, async () => {
  const f = await fixture();
  try {
    f.intent.positionIds = [];
    f.intent.responsibilities = f.intent.responsibilities.map(d => ({ ...d, action: 'replace', replacementId: 'replacement' }));
    const command = await f.review(), result = await commitPersonTransitionAtomic(f.db, command.input, actor, signer, f.clock);
    assert.equal(result.state, 'committed'); const store = (await f.db.doc('locations/store').get()).data()!;
    assert.equal(store.storeManagerId, 'replacement'); assert.equal(store.districtManagerId, 'replacement'); assert.equal(store.storeManagerPhonePrivacy, 'Restricted'); assert.equal(store.storeManagerPhone.replace(/\D/g, ''), '9095550101');
    assert.equal(store.locationInboxEmail, 'PRIVATE_LOCATION_EMAIL'); assert.equal((await f.db.doc('people/replacement').get()).data()!.version, undefined);
    const audit = (await f.db.collection('audit_logs').get()).docs[0].data(); assert.doesNotMatch(JSON.stringify([audit, result]), /19095550101|555-0101|PRIVATE/);
    assert.equal(audit.review.counts.businessDocuments, 4); assert(audit.review.counts.businessBytesEstimate > 0);
  } finally { await f.db.terminate(); }
});

test('actual SDK: lost response after commit recovers the original receipt without repeating business effects', { timeout: 60_000 }, async () => {
  const f = await fixture();
  try {
    const command = await f.review();
    const lost = new Proxy(f.db, { get(target, key) {
      if (key === 'runTransaction') return async (callback: any, options: any) => { await target.runTransaction(callback, options); throw new Error('Synthetic lost response after actual SDK commit'); };
      const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
    await assert.rejects(commitPersonTransitionAtomic(lost, command.input, actor, signer, f.clock), /lost response/);
    const recovered = await readPersonTransitionRecovery(f.db, command.marker, actor); assert.equal(recovered.state, 'committed');
    assert.deepEqual(await commitPersonTransitionAtomic(f.db, command.input, actor, signer, () => new Date(f.time + 600_000)), recovered);
    assert.equal((await f.db.doc('people/subject').get()).data()!.version, 1); assert.equal((await f.db.collection('audit_logs').get()).size, 1);
  } finally { await f.db.terminate(); }
});

test('actual SDK: in-flight linked-User insertion and Person inactivation cannot both commit', { timeout: 120_000 }, async () => {
  const f = await fixture();
  const gate = () => { let release!: () => void; const promise = new Promise<void>(r => { release = r; }); return { promise, release }; };
  const primaryRead = gate(), linkRead = gate(), proceed = gate(); let held = false, primaryAttempts = 0, linkAttempts = 0;
  try {
    f.intent.positionIds = []; f.intent.lifecycle = 'inactive'; f.intent.responsibilities = f.intent.responsibilities.map(d => ({ ...d, action: 'vacate' }));
    const command = await f.review();
    const paused = new Proxy(f.db, { get(target, key) {
      if (key === 'runTransaction') return (callback: any, options: any) => target.runTransaction(async transaction => {
        primaryAttempts++;
        const wrapper = new Proxy(transaction, { get(tx, member) {
          if (member === 'getAll') return async (...args: any[]) => {
            const result = await (tx.getAll as any)(...args);
            if (!held && args.some(a => typeof a?.path === 'string' && a.path.startsWith('people/'))) { held = true; primaryRead.release(); await proceed.promise; }
            return result;
          };
          const value = Reflect.get(tx, member, tx); return typeof value === 'function' ? value.bind(tx) : value;
        } });
        return callback(wrapper);
      }, options);
      const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
    const primary = commitPersonTransitionAtomic(paused, command.input, actor, signer, f.clock);
    await primaryRead.promise;
    const link = f.db.runTransaction(async tx => {
      linkAttempts++; const person = await tx.get(f.db.doc('people/subject')); const data = person.data()!;
      if (data.status !== 'Active' || data.activeStatus !== true) throw new Error('Concurrent linking denied for inactive Person');
      linkRead.release(); await proceed.promise;
      tx.create(f.db.doc('users/inserted-link'), { firebaseUid: 'synthetic-other', personId: 'subject', role: 'Viewer', status: 'Active', accessScope: 'Store' });
    });
    await linkRead.promise; proceed.release();
    const results = await Promise.allSettled([primary, link]);
    const person = (await f.db.doc('people/subject').get()).data()!, linked = (await f.db.doc('users/inserted-link').get()).exists;
    assert(!(person.status === 'Inactive' && linked), 'Serializable SDK transactions must not leave an inactive Person with a newly linked User');
    assert(results.some(r => r.status === 'rejected')); assert(primaryAttempts > 1 || linkAttempts > 1, 'The actual SDK must retry a conflicted transaction');
    const outcome = await readPersonTransitionRecovery(f.db, command.marker, actor);
    if (person.status === 'Inactive') { assert.equal(outcome.state, 'committed'); assert.equal(linked, false); }
    else { assert.equal(linked, true); assert.equal(outcome.state, 'prepared'); assert.equal((await f.db.collection('audit_logs').get()).size, 0); }
  } finally { proceed.release(); await f.db.terminate(); }
});

test('actual SDK: in-flight retail member insertion follows current District ownership or invalidates the old reviewed plan', { timeout: 120_000 }, async () => {
  const f = await fixture();
  const gate = () => { let release!: () => void; const promise = new Promise<void>(r => { release = r; }); return { promise, release }; };
  const read = gate(), memberRead = gate(), proceed = gate(); let held = false, attempts = 0, memberAttempts = 0;
  try {
    const command = await f.review();
    const paused = new Proxy(f.db, { get(target, key) {
      if (key === 'runTransaction') return (callback: any, options: any) => target.runTransaction(async transaction => {
        attempts++;
        return callback(new Proxy(transaction, { get(tx, member) {
          if (member === 'getAll') return async (...args: any[]) => { const result = await (tx.getAll as any)(...args); if (!held && args.some(a => typeof a?.path === 'string' && a.path.startsWith('people/'))) { held = true; read.release(); await proceed.promise; } return result; };
          const value = Reflect.get(tx, member, tx); return typeof value === 'function' ? value.bind(tx) : value;
        } }));
      }, options);
      const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
    const primary = commitPersonTransitionAtomic(paused, command.input, actor, signer, f.clock); await read.promise;
    const insert = f.db.runTransaction(async tx => {
      memberAttempts++; const district = (await tx.get(f.db.doc('districts/district'))).data()!;
      memberRead.release(); await proceed.promise;
      tx.create(f.db.doc('locations/inserted-member'), { ...f.records['locations/retired'], storeNumber: '010', recordStatus: 'Active', districtManagerId: district.districtManagerId ?? '', districtManagerName: district.districtManagerId ? 'Synthetic Subject' : '' });
    });
    await memberRead.promise; proceed.release(); await Promise.allSettled([primary, insert]);
    const district = (await f.db.doc('districts/district').get()).data()!, member = (await f.db.doc('locations/inserted-member').get()).data()!;
    assert(member); assert.equal(member.districtManagerId, district.districtManagerId ?? ''); assert(attempts > 1 || memberAttempts > 1);
    const outcome = await readPersonTransitionRecovery(f.db, command.marker, actor);
    assert.equal(outcome.state, district.districtManagerId === null ? 'committed' : 'prepared');
  } finally { proceed.release(); await f.db.terminate(); }
});

test('actual SDK: concurrent absent preparation/cancellation seals the ID against late preparation', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const original = await f.review(), input = { ...original.input, operationId: randomUUID() };
    const command = normalizeTransitionPreparation(input, actor.uid), marker = { schemaVersion: 1 as const, operationId: input.operationId, personId: input.intent.personId, commandDigest: command.identity.commandDigest };
    await Promise.allSettled([preparePersonTransitionRecovery(f.db, input, actor, signer, f.clock), cancelPersonTransitionRecovery(f.db, marker, actor, f.clock)]);
    assert.equal((await readPersonTransitionRecovery(f.db, marker, actor)).state, 'cancelled');
    await assert.rejects(preparePersonTransitionRecovery(f.db, input, actor, signer, f.clock), /cancelled/);
    assert.equal((await f.db.doc('people/subject').get()).data()!.version, 0); assert.equal((await f.db.collection('audit_logs').get()).size, 1);
  } finally { await f.db.terminate(); }
});

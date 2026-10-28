import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { leadershipFixture, leadershipActor as actor, leadershipNow } from './helpers/organizationLeadershipFixture';
import { prepareOrganizationLeadership, commitOrganizationLeadership } from '../server/organizationLeadershipOperations';
import { previewPersonTransitionCommand } from '../server/personTransitionCommandPreview';
import { preparePersonTransitionRecovery } from '../server/firestorePersonTransitionRecovery';
import { commitPersonTransitionAtomic } from '../server/firestorePersonTransitionAtomic';
import { PersonTransitionReviewSigner } from '../server/personTransitionReviewEnvelope';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('Use only the isolated loopback emulator at 127.0.0.1:8089.');
const signer = new PersonTransitionReviewSigner({ activeKeyId: 'synthetic', keys: [{ id: 'synthetic', secret: Buffer.alloc(32, 0x61).toString('base64url') }] });
const clock = () => new Date(leadershipNow);

test('SDK staged journey: concurrent store/DM/RM positions, explicit handover, vacancy, account review and inactivation', { timeout: 90_000 }, async () => {
  const db = new Firestore({ projectId: 'demo-directory-transitions', databaseId: `staff-journey-${randomUUID()}` });
  const f = leadershipFixture(), store = new FirestoreDirectoryStore(db);
  f.records.get('people/new-hire').positionIds = ['store-manager', 'district-manager', 'regional-manager'];
  f.records.get('people/incumbent').positionIds = ['district-manager', 'regional-manager'];
  f.records.get('locations/corporate').storeNumber = 'CORP';
  Object.assign(f.records.get('locations/007'), { storeManagerId: 'new-hire', storeManagerName: 'New Manager', storeManagerPhone: '', storeManagerPhonePrivacy: 'Internal' });
  f.records.set('users/member', { firebaseUid: 'synthetic-member', name: 'Synthetic Member', email: 'member@example.test', role: 'Viewer', status: 'Active', accessScope: 'Company-wide', personId: 'new-hire', version: 1 });
  const seed = db.batch(); for (const [path, data] of f.records) seed.create(db.doc(path), data); await seed.commit();

  const roster = async (type: 'district' | 'region', members: string[], primary: string | null) => {
    const row = (await db.doc(`${type === 'district' ? 'districts' : 'regions'}/01`).get()).data()!;
    const prepared = await prepareOrganizationLeadership(db, { operationId: randomUUID(), units: [{ unitType: type, unitId: '01', expectedVersion: row.version, expectedLeadershipVersion: row.leadershipVersion ?? 0,
      activateLegacy: row.leadershipModelVersion === undefined, memberPersonIds: members, primaryPersonId: primary, reason: 'Explicit synthetic staff journey' }] }, actor, clock);
    assert('reviewHash' in prepared); return commitOrganizationLeadership(db, { operationId: prepared.operationId, reviewHash: prepared.reviewHash }, actor, clock);
  };
  const personIntent = (positions: string[], duties: any[]) => ({ schemaVersion: 1, personId: 'new-hire', positionIds: positions, lifecycle: 'keep', reason: 'Explicit synthetic staff journey', responsibilities: duties,
    primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: [] });
  const personCommand = async (intent: unknown) => {
    const preview = await previewPersonTransitionCommand(db, intent, actor, signer, clock); assert.equal(preview.ready, true, preview.review.blockers.join('; '));
    const command = { schemaVersion: 1, operationId: randomUUID(), intent, reviewEnvelope: preview.reviewEnvelope };
    await preparePersonTransitionRecovery(db, command, actor, signer, clock);
    const saved = await commitPersonTransitionAtomic(db, command, actor, signer, clock);
    assert.equal(saved.state, 'committed'); assert.deepEqual(await commitPersonTransitionAtomic(db, command, actor, signer, clock), saved);
  };
  try {
    // Eligibility and workplace do not assign a unit; explicit Additional retains the District incumbent.
    await roster('district', ['incumbent', 'new-hire'], 'incumbent');
    await roster('region', ['new-hire'], 'new-hire');
    assert.equal((await db.doc('districts/01').get()).data()!.districtManagerId, 'incumbent');
    assert.equal((await db.doc('locations/007').get()).data()!.storeManagerId, 'new-hire');
    assert.equal((await db.doc('people/new-hire').get()).data()!.primaryLocationId, 'corporate');
    assert.equal((await db.doc('users/member').get()).data()!.status, 'Active');
    await assert.rejects(previewPersonTransitionCommand(db, personIntent(['store-manager', 'regional-manager'], []), actor, signer, clock), /roster-aware/);

    // End Additional DM first, then remove only its position while retaining Region/store duties.
    await roster('district', ['incumbent'], 'incumbent');
    await personCommand(personIntent(['store-manager', 'regional-manager'], [
      { owner: 'locations', id: '007', field: 'storeManagerId', action: 'retain' },
      { owner: 'locations', id: '007', field: 'regionalManagerId', action: 'retain' },
    ]));
    assert.equal((await db.doc('regions/01').get()).data()!.regionalManagerId, 'new-hire');
    assert.equal((await db.doc('locations/007').get()).data()!.storeManagerId, 'new-hire');

    // Explicit Region handover preserves unit IDs and the Person's Corporate workplace.
    await roster('region', ['incumbent'], 'incumbent');
    await personCommand(personIntent(['regional-manager'], [{ owner: 'locations', id: '007', field: 'storeManagerId', action: 'vacate' }]));
    assert.equal((await db.doc('locations/007').get()).data()!.storeManagerId, '');
    assert.equal((await db.doc('locations/007').get()).data()!.regionalManagerId, 'incumbent');
    assert.equal((await db.doc('locations/007').get()).data()!.districtId, '01');
    assert.equal((await db.doc('districts/01').get()).data()!.regionId, '01');

    const inactiveWrite = async () => {
      const p = (await db.doc('people/new-hire').get()).data()!;
      return store.commit([{ collection: 'people', id: 'new-hire', operation: 'set', expectedVersion: p.version, data: { ...p, status: 'Inactive', activeStatus: false } }], { action: 'Person Inactivated', entityType: 'Person', entityId: 'new-hire', entityName: 'New Manager', details: 'Explicit synthetic inactivation after handover.' }, actor);
    };
    await assert.rejects(inactiveWrite(), /linked user account/);
    assert.equal((await db.doc('people/new-hire').get()).data()!.status, 'Active');
    const account = (await db.doc('users/member').get()).data()!;
    await store.commit([{ collection: 'users', id: 'member', operation: 'set', expectedVersion: 1, data: { ...account, personId: null } }], { action: 'User Link Reviewed', entityType: 'User', entityId: 'member', entityName: 'Synthetic Member', details: 'Explicit synthetic unlink; no access revocation.' }, actor);
    await inactiveWrite();
    const person = (await db.doc('people/new-hire').get()).data()!;
    assert.equal(person.status, 'Inactive'); assert.equal(person.activeStatus, false); assert.equal(person.primaryLocationId, 'corporate');
    const active = (await db.collection('leadership_assignments').where('personId', '==', 'new-hire').where('status', '==', 'active').get()).size;
    assert.equal(active, 0);
    assert.equal((await db.collection('leadership_assignments').where('personId', '==', 'new-hire').where('status', '==', 'ended').get()).size, 2);
    const access = (await db.doc('users/member').get()).data()!;
    assert.equal(access.status, 'Active'); assert.equal(access.role, 'Viewer'); assert.equal(access.firebaseUid, 'synthetic-member');
    assert.equal((await db.collection('audit_logs').get()).size, 8); // Four roster, two Person, explicit unlink and inactivation.
  } finally { await db.terminate(); }
});

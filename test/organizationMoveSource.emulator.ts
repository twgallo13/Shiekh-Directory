import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor, leadershipNow } from './helpers/organizationLeadershipFixture';
import { readPersonTransitionAuthority } from '../server/personTransitionAuthority';
import { readOrganizationMovePlan } from '../server/organizationMoveSource';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('Use only the isolated loopback emulator at 127.0.0.1:8089.');
async function fixture() {
  const db = new Firestore({ projectId: 'demo-directory-transitions', databaseId: `move-source-${randomUUID()}` });
  const f = moveFixture(), batch = db.batch();
  for (const [path, data] of f.records) batch.create(db.doc(path), data); await batch.commit();
  const read = () => db.runTransaction(async tx => { await readPersonTransitionAuthority(db, tx, actor); return readOrganizationMovePlan(db, tx, f.intent, leadershipNow); }, { readOnly: true });
  return { ...f, db, read };
}

test('SDK coherent move source reads current masked dependencies without business writes', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const before = (await f.db.doc('locations/007').get()).data();
    const result = await f.read();
    assert.equal(result.plan.review.after.regionId, '02');
    assert.equal(result.plan.review.after.districtManager.id, 'new-hire');
    assert(result.native.get('people/new-hire')!.updateTime.seconds);
    assert.doesNotMatch(JSON.stringify([...result.native]), /PRIVATE|workEmail|primaryLocationId|firebaseUid/);
    assert.deepEqual((await f.db.doc('locations/007').get()).data(), before);
    assert.equal((await f.db.collection('audit_logs').get()).size, 0);
    assert.equal((await f.db.collection('organization_leadership_operations').get()).size, 0);
  } finally { await f.db.terminate(); }
});
test('SDK fresh membership, hierarchy and live authority are re-read rather than cached', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const first = await f.read();
    await f.db.doc('locations/008').create({ ...(await f.db.doc('locations/007').get()).data(), storeNumber: '008' });
    const second = await f.read(); assert.notEqual(first.plan.preconditions.storeMembership, second.plan.preconditions.storeMembership);
    await f.db.doc('districts/02').update({ regionId: '01' });
    const third = await f.read(); assert.equal(third.plan.review.after.regionId, '01'); assert.notDeepEqual(second.plan.preconditions.units, third.plan.preconditions.units);
    await f.db.doc('users/admin').update({ status: 'Inactive' });
    await assert.rejects(f.read(), /authority/);
    assert.equal((await f.db.collection('audit_logs').get()).size, 0);
  } finally { await f.db.terminate(); }
});

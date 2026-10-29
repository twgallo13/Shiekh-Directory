import test from 'node:test';
import assert from 'node:assert/strict';
import type { DirectoryWrite } from '../server/firestoreDirectory';
import { validateManagedPersonRename } from '../server/managedPersonRename';
import { reconcileLocationLeadershipCopy } from '../src/lib/personLocationRelationships';
import type { LocationRecord, PersonRecord } from '../src/types';

function fixture() {
  const person = { id: 'subject', fullName: 'Before', status: 'Active', positionIds: ['district-manager'], version: 1, workEmail: 'person@example.test' };
  const location = { id: '007', districtManagerId: 'subject', districtManagerName: 'Before', storeManagerId: 'subject', storeManagerName: 'Before', storeManagerPhone: 'Preserve', storeManagerPhonePrivacy: 'Restricted', assistantStoreManagerIds: ['subject', 'other'], assistantStoreManagerNames: ['Before', 'Preserved Other'], version: 3 };
  const next = { ...person, fullName: 'After', name: 'After' };
  const changed = reconcileLocationLeadershipCopy(location as unknown as LocationRecord, 'subject', next as unknown as PersonRecord, 'Must not replace phone', () => 'Must not replace other', ['fullName']);
  const writes: DirectoryWrite[] = [{ collection: 'people', id: 'subject', operation: 'set', expectedVersion: 1, data: next }, { collection: 'locations', id: '007', operation: 'set', expectedVersion: 3, data: changed as unknown as Record<string, unknown> }];
  return { person, location, next, writes, previous: [person, location] };
}
test('name-only copy preserves contacts and unrelated names and validates against full inventory', () => {
  const f = fixture();
  assert.deepEqual(validateManagedPersonRename(f.writes, f.previous, 'subject', [f.location]), { personId: 'subject', fullName: 'After', affectedLocations: 1 });
  assert.equal(f.writes[1].data!.storeManagerPhone, 'Preserve');
  assert.deepEqual(f.writes[1].data!.assistantStoreManagerNames, ['After', 'Preserved Other']);
  assert.equal(f.location.districtManagerName, 'Before');
});
test('omissions, unrelated writes and stale source cannot produce a partial name save', () => {
  const f = fixture();
  assert.throws(() => validateManagedPersonRename(f.writes.slice(0, 1), f.previous.slice(0, 1), 'subject', [f.location]));
  assert.throws(() => validateManagedPersonRename(f.writes, f.previous, 'subject', undefined));
  assert.throws(() => validateManagedPersonRename(f.writes, f.previous, 'subject', [{ ...f.location, version: 4 }]));
  assert.throws(() => validateManagedPersonRename([...f.writes, { collection: 'users', id: 'other', operation: 'delete' }], [...f.previous, {}], 'subject', [f.location]));
});
test('name save refuses status, eligibility, account/contact, membership and unrelated-name changes', () => {
  for (const changes of [{ status: 'Inactive' }, { positionIds: [] }, { workEmail: 'changed@example.test' }, { extra: true }, { name: 'Different' }, { fullName: ' Bad ' }]) {
    const f = fixture(); Object.assign(f.writes[0].data!, changes); assert.throws(() => validateManagedPersonRename(f.writes, f.previous, 'subject', [f.location]));
  }
  for (const changes of [{ districtManagerId: 'other' }, { storeManagerPhone: 'Changed' }, { assistantStoreManagerNames: ['After', 'Changed Other'] }, { unrelated: true }]) {
    const f = fixture(); Object.assign(f.writes[1].data!, changes); assert.throws(() => validateManagedPersonRename(f.writes, f.previous, 'subject', [f.location]));
  }
});
test('ambiguous lists and unsafe versions fail closed; Additional with no Location copy remains renameable', () => {
  const f = fixture();
  assert.throws(() => validateManagedPersonRename(f.writes, [f.person, { ...f.location, assistantStoreManagerNames: ['Before'] }], 'subject', [{ ...f.location, assistantStoreManagerNames: ['Before'] }]));
  assert.throws(() => validateManagedPersonRename(f.writes, [{ ...f.person, version: Number.MAX_SAFE_INTEGER }, f.location], 'subject', [f.location]));
  assert.equal(validateManagedPersonRename(f.writes.slice(0, 1), [f.person], 'subject', []).affectedLocations, 0);
});

test('command-written null vacancy remains equivalent to ordinary omitted ID normalization',()=>{
  const f=fixture();Object.assign(f.location,{regionalManagerId:null});Object.assign(f.previous[1],{regionalManagerId:null});
  delete f.writes[1].data!.regionalManagerId;
  assert.doesNotThrow(()=>validateManagedPersonRename(f.writes,f.previous,'subject',[f.location]));
  f.writes[1].data!.regionalManagerId='other';assert.throws(()=>validateManagedPersonRename(f.writes,f.previous,'subject',[f.location]));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Account } from '../server/authAuthority';
import { DirectoryConflict, DirectoryValidationError, validateMetadataWrites, type DirectoryWrite } from '../server/firestoreDirectory';

const actor: Account = { uid: 'synthetic-viewer', email: 'viewer@example.test', emailVerified: true, name: 'Synthetic Viewer', role: 'Viewer', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };

/** Build detached synthetic Location, Person and request records for submission validation. */
function fixture() {
  const target = { id: 'loc-synthetic', storeNumber: '007', storeManagerId: 'person-old', storeManagerName: 'Previous Manager', storeManagerPhone: '+12135550101' };
  const people = [{ id: 'person-new', fullName: 'New Manager', status: 'Active', activeStatus: true, workPhone: '+12135550102' }];
  const request = { targetType: 'Location', targetId: target.id, changeType: 'Store Manager Change', status: 'Pending', requestedChanges: { storeManagerId: people[0].id, storeManagerName: people[0].fullName, storeManagerPhone: people[0].workPhone }, currentSnapshot: { storeManagerId: target.storeManagerId, storeManagerName: target.storeManagerName, storeManagerPhone: target.storeManagerPhone } };
  const validate = (data: Record<string, unknown> = request, roster = people) => validateMetadataWrites([{ collection: 'requests', id: 'req-synthetic', operation: 'set', data } satisfies DirectoryWrite], [undefined], [], actor, roster, [target]);
  return { target, people, request, validate };
}

for (const order of ['location-first', 'request-first'] as const) {
  for (const scenario of ['manager-change', 'unrelated-edit'] as const) {
    test(`leadership submission rejects a simultaneous target write: ${scenario}, ${order}`, () => {
      const f = fixture();
      const data = scenario === 'manager-change' ? { ...f.target, ...f.request.requestedChanges } : { ...f.target, name: 'Renamed store' };
      const locationWrite: DirectoryWrite = { collection: 'locations', id: f.target.id, operation: 'set', data, expectedVersion: 0 };
      const requestWrite: DirectoryWrite = { collection: 'requests', id: 'req-synthetic', operation: 'set', data: f.request };
      const writes = order === 'location-first' ? [locationWrite, requestWrite] : [requestWrite, locationWrite];
      const previous = order === 'location-first' ? [f.target, undefined] : [undefined, f.target];
      assert.throws(() => validateMetadataWrites(writes, previous, [], { ...actor, role: 'System Administrator' }, f.people, [f.target]), /separately from changes to its Location/);
    });
  }
}

for (const order of ['person-first', 'request-first'] as const) {
  for (const scenario of ['inactive', 'deleted', 'renamed', 'phone-changed', 'matching-final-details'] as const) {
    test(`leadership request checks final batched Person state for ${scenario} in ${order} order`, () => {
      const f = fixture();
      const person = f.people[0];
      const proposedPerson = { ...person };
      if (scenario === 'inactive') { proposedPerson.status = 'Inactive'; proposedPerson.activeStatus = false; }
      if (scenario === 'renamed' || scenario === 'matching-final-details') proposedPerson.fullName = 'Renamed Manager';
      if (scenario === 'phone-changed' || scenario === 'matching-final-details') proposedPerson.workPhone = '+12135550103';
      const request = structuredClone(f.request);
      if (scenario === 'matching-final-details') {
        request.requestedChanges.storeManagerName = proposedPerson.fullName;
        request.requestedChanges.storeManagerPhone = proposedPerson.workPhone;
      }
      const personWrite: DirectoryWrite = { collection: 'people', id: person.id, operation: scenario === 'deleted' ? 'delete' : 'set', expectedVersion: 0, ...(scenario !== 'deleted' ? { data: proposedPerson } : {}) };
      const requestWrite: DirectoryWrite = { collection: 'requests', id: 'req-synthetic', operation: 'set', data: request };
      const writes = order === 'person-first' ? [personWrite, requestWrite] : [requestWrite, personWrite];
      const previous = order === 'person-first' ? [person, undefined] : [undefined, person];
      const validate = () => validateMetadataWrites(writes, previous, [], { ...actor, role: 'System Administrator' }, f.people, [f.target]);
      if (scenario === 'matching-final-details') {
        const result = validate();
        assert.equal(result.find(write => write.collection === 'requests')?.data?.status, 'Pending');
      } else {
        assert.throws(validate, DirectoryValidationError);
      }
    });
  }
}

test('leadership request accepts a changed canonical active manager without mutating its target', () => {
  const f = fixture(); const before = structuredClone(f.target);
  const [write] = f.validate();
  assert.equal(write.data?.status, 'Pending');
  assert.deepEqual(write.data?.requestedChanges, f.request.requestedChanges);
  assert.deepEqual(f.target, before);
});

for (const order of ['person-first', 'request-first'] as const) {
  for (const scenario of ['raw-formatted', 'normalized', 'extension', 'legacy-phone', 'omitted-work-phone', 'unchanged-history'] as const) {
    test(`leadership request compares saved phone details for ${scenario} in ${order} order`, () => {
      const f = fixture();
      const person: Record<string, unknown> = { ...f.people[0] };
      if (scenario === 'unchanged-history') person.workPhone = '(213) 555-0102';
      const proposedPerson = { ...person };
      const request = structuredClone(f.request);
      if (scenario === 'omitted-work-phone') {
        delete proposedPerson.workPhone;
      } else if (scenario === 'unchanged-history') {
        request.requestedChanges.storeManagerPhone = String(person.workPhone);
      } else if (scenario === 'legacy-phone') {
        proposedPerson.workPhone = '';
        proposedPerson.phone = '(213) 555-0103';
        request.requestedChanges.storeManagerPhone = '+12135550103';
      } else {
        proposedPerson.workPhone = scenario === 'extension' ? '(213) 555-0103 ext. 42' : '(213) 555-0103';
        request.requestedChanges.storeManagerPhone = scenario === 'raw-formatted' ? String(proposedPerson.workPhone) : '+12135550103';
      }
      const personWrite: DirectoryWrite = { collection: 'people', id: String(person.id), operation: 'set', expectedVersion: 0, data: proposedPerson };
      const requestWrite: DirectoryWrite = { collection: 'requests', id: 'req-synthetic', operation: 'set', data: request };
      const writes = order === 'person-first' ? [personWrite, requestWrite] : [requestWrite, personWrite];
      const previous = order === 'person-first' ? [person, undefined] : [undefined, person];
      const originalWrites = structuredClone(writes);
      const validate = () => validateMetadataWrites(writes, previous, [], { ...actor, role: 'System Administrator' }, [person as typeof f.people[number]], [f.target]);
      if (scenario === 'raw-formatted') {
        assert.throws(validate, /selected manager details changed/);
      } else {
        const result = validate();
        const savedPerson = result.find(write => write.collection === 'people')!.data!;
        const savedRequest = result.find(write => write.collection === 'requests')!.data!;
        const changes = savedRequest.requestedChanges as Record<string, unknown>;
        assert.equal(changes.storeManagerPhone, savedPerson.workPhone || savedPerson.phone || '');
        if (scenario === 'extension') assert.equal(savedPerson.workPhoneExtension, '42');
      }
      assert.deepEqual(writes, originalWrites, 'validation does not mutate input writes');
    });
  }
}

for (const scenario of ['empty', 'missing', 'inactive', 'ambiguous', 'same-manager', 'missing-baseline', 'stale', 'extra-field', 'forged-name', 'forged-phone', 'wrong-target'] as const) {
  test(`leadership request rejects ${scenario} before persistence`, () => {
    const f = fixture();
    const request: Record<string, unknown> = structuredClone(f.request);
    const changes = request.requestedChanges as Record<string, unknown>;
    const baseline = request.currentSnapshot as Record<string, unknown>;
    if (scenario === 'empty') delete changes.storeManagerId;
    if (scenario === 'missing') changes.storeManagerId = 'missing-person';
    if (scenario === 'inactive') { f.people[0].status = 'Inactive'; f.people[0].activeStatus = false; }
    if (scenario === 'ambiguous') f.people[0].activeStatus = false;
    if (scenario === 'same-manager') f.target.storeManagerId = changes.storeManagerId as string;
    if (scenario === 'missing-baseline') delete baseline.storeManagerId;
    if (scenario === 'stale') baseline.storeManagerName = 'Stale Name';
    if (scenario === 'extra-field') changes.districtManagerId = 'unrelated-manager';
    if (scenario === 'forged-name') changes.storeManagerName = 'Unrelated Person';
    if (scenario === 'forged-phone') changes.storeManagerPhone = '+12135550999';
    if (scenario === 'wrong-target') request.targetType = 'Person';
    assert.throws(() => f.validate(request), scenario === 'stale' ? DirectoryConflict : DirectoryValidationError);
  });
}

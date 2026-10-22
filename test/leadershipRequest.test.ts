import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Account } from '../server/authAuthority';
import { DirectoryConflict, DirectoryValidationError, validateMetadataWrites, type DirectoryWrite } from '../server/firestoreDirectory';

const actor: Account = { uid: 'synthetic-viewer', email: 'viewer@example.test', emailVerified: true, name: 'Synthetic Viewer', role: 'Viewer', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };

function fixture() {
  const target = { id: 'loc-synthetic', storeNumber: '007', storeManagerId: 'person-old', storeManagerName: 'Previous Manager', storeManagerPhone: '+12135550101' };
  const people = [{ id: 'person-new', fullName: 'New Manager', status: 'Active', activeStatus: true, workPhone: '+12135550102' }];
  const request = { targetType: 'Location', targetId: target.id, changeType: 'Store Manager Change', status: 'Pending', requestedChanges: { storeManagerId: people[0].id, storeManagerName: people[0].fullName, storeManagerPhone: people[0].workPhone }, currentSnapshot: { storeManagerId: target.storeManagerId, storeManagerName: target.storeManagerName, storeManagerPhone: target.storeManagerPhone } };
  const validate = (data: Record<string, unknown> = request, roster = people) => validateMetadataWrites([{ collection: 'requests', id: 'req-synthetic', operation: 'set', data } satisfies DirectoryWrite], [undefined], [], actor, roster, [target]);
  return { target, people, request, validate };
}

test('leadership request accepts a changed canonical active manager without mutating its target', () => {
  const f = fixture(); const before = structuredClone(f.target);
  const [write] = f.validate();
  assert.equal(write.data?.status, 'Pending');
  assert.deepEqual(write.data?.requestedChanges, f.request.requestedChanges);
  assert.deepEqual(f.target, before);
});

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

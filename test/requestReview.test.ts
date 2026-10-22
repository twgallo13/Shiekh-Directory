import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Account } from '../server/authAuthority';
import { DirectoryConflict, DirectoryValidationError, DirectoryWriteDenied, validateMetadataWrites, type DirectoryWrite } from '../server/firestoreDirectory';

const actor: Account = { uid: 'reviewer', name: 'Synthetic Reviewer', email: 'reviewer@example.test', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
const original = { id: 'req-review', version: 3, status: 'Pending', targetType: 'Location', targetId: 'loc-review', targetName: 'Synthetic Store', targetStoreNumber: '007', changeType: 'Phone Number Correction', requestedAt: '2026-10-22T00:00:00Z', requestedBy: { id: 'requester', name: 'Synthetic Requester', role: 'Viewer', email: 'requester@example.test' }, reason: 'Original reason', currentSnapshot: { phone: '+12135550101' }, requestedChanges: { phone: '+12135550102' } };

function review(data: Record<string, unknown>, previous: Record<string, unknown> = original, role = actor.role) {
  return validateMetadataWrites([{ collection: 'requests', id: original.id, operation: 'set', expectedVersion: previous.version as number, data }], [previous], [], { ...actor, role });
}

const replacements: Record<string, unknown> = {
  requestedChanges: { phone: '+12135550103' }, currentSnapshot: { phone: null }, targetType: 'Person', targetId: 'another-store',
  targetName: 'Another store', targetStoreNumber: '999', changeType: 'Store Manager Change',
  requestedBy: { ...original.requestedBy, id: 'forged-requester' }, requestedAt: '2026-10-23T00:00:00Z', reason: 'Rewritten reason', unexpectedField: 'injected',
};
for (const [field, value] of Object.entries(replacements)) {
  test(`request review cannot rewrite submitted ${field}`, () => {
    for (const status of ['Approved', 'Rejected']) {
      assert.throws(() => review({ ...original, status, [field]: value }), /immutable/);
    }
  });
}

test('request rejection preserves omitted submission fields for older review clients', () => {
  const [write] = review({ status: 'Rejected', reviewerNotes: 'Submit a replacement' });
  for (const field of Object.keys(original).filter(field => !['version', 'status'].includes(field))) {
    assert.deepEqual(write.data?.[field], Reflect.get(original, field));
  }
  assert.equal(write.data?.version, 4);
  assert.equal(write.data?.reviewerNotes, 'Submit a replacement');
});

test('request history cannot be reopened, edited while pending, or deleted', () => {
  assert.throws(() => review({ ...original, reason: 'changed' }), DirectoryConflict);
  for (const terminal of ['Approved', 'Rejected']) {
    assert.throws(() => review({ ...original, status: 'Pending' }, { ...original, status: terminal }), DirectoryConflict);
    assert.throws(() => review({ ...original, status: terminal }, { ...original, status: terminal }), DirectoryConflict);
  }
  assert.throws(() => validateMetadataWrites([{ collection: 'requests', id: original.id, operation: 'delete', expectedVersion: 3 } satisfies DirectoryWrite], [original], [], actor), /retained as history/);
  assert.throws(() => review({ ...original, id: 'different-id', status: 'Rejected' }), /IDs cannot change/);
});

test('review permissions and exact request version still apply', () => {
  assert.throws(() => review({ ...original, status: 'Rejected' }, original, 'Viewer'), DirectoryWriteDenied);
  assert.throws(() => validateMetadataWrites([{ collection: 'requests', id: original.id, operation: 'set', expectedVersion: 2, data: { ...original, status: 'Rejected' } }], [original], [], actor), DirectoryConflict);
  assert.throws(() => validateMetadataWrites([{ collection: 'requests', id: 'new', operation: 'set', data: { ...original, id: 'new', status: 'Rejected' } }], [undefined], [], actor), DirectoryValidationError);
});

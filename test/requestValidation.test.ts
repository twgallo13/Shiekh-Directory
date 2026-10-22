import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateRequestProposal } from '../src/lib/requestValidation';
import { DEFAULT_WEEKLY_HOURS } from '../src/lib/defaultHours';
import { loadSubmission, submissionStorageKey } from '../src/lib/requestSubmission';
import { validateMetadataWrites } from '../server/firestoreDirectory';
import type { Account } from '../server/authAuthority';

const target = { phone: '(213) 555-0101', phoneExtension: '12', standardHours: DEFAULT_WEEKLY_HOURS, hoursMode: 'template', hoursTemplateId: 'template-1', operationalStatus: 'Open — Normal Operations', locationInboxEmail: 'store@example.test' };
const proposal = { changeType: 'Phone Number Correction', targetType: 'Location', requestedChanges: { phone: '(213) 555-0102', phoneExtension: null }, currentSnapshot: { phone: target.phone, phoneExtension: '12' } };
test('phone proposals normalize once and reject formatting-only no-ops including extensions', () => {
  assert.deepEqual(validateRequestProposal(proposal, target), { changes: { phone: '+12135550102', phoneExtension: null } });
  assert.match(validateRequestProposal({ ...proposal, requestedChanges: { phone: '+12135550101', phoneExtension: '12' } }, target).error!, /No change/);
});
for (const [label, changes] of Object.entries({ empty: {}, injected: { phone: '+12135550102', districtManagerId: 'forged' }, invalid: { phone: '123' }, extension: { phone: '+12135550102', phoneExtension: 'abc' } })) {
  test(`invalid phone proposal rejected: ${label}`, () => assert.ok(validateRequestProposal({ ...proposal, requestedChanges: changes }, target).error));
}
test('all proposed fields need present, current baselines', () => {
  for (const currentSnapshot of [{ phone: target.phone }, { phone: 'stale', phoneExtension: '12' }]) assert.ok(validateRequestProposal({ ...proposal, currentSnapshot }, target).error);
});
test('unknown categories, Person targets, and oversized notes are rejected', () => {
  for (const patch of [{ changeType: 'Holiday Hours Exception' }, { changeType: 'constructor' }, { changeType: 'toString' }, { changeType: '__proto__' }, { targetType: 'Person' }, { reason: 'x'.repeat(2001) }]) assert.ok(validateRequestProposal({ ...proposal, ...patch }, target).error);
});
test('hours require complete baseline, valid seven-day shape, and an actual change', () => {
  const request = { changeType: 'Standard Hours Adjustment', targetType: 'Location', currentSnapshot: { standardHours: target.standardHours, hoursMode: target.hoursMode, hoursTemplateId: target.hoursTemplateId }, requestedChanges: { standardHours: { ...DEFAULT_WEEKLY_HOURS, monday: { open: '09:00', close: '20:00', isClosed: false } } } };
  assert.equal(validateRequestProposal(request, target).error, undefined);
  for (const patch of [{ currentSnapshot: { standardHours: target.standardHours } }, { requestedChanges: { standardHours: DEFAULT_WEEKLY_HOURS } }, { requestedChanges: { standardHours: { ...DEFAULT_WEEKLY_HOURS, monday: { open: '25:00', close: '20:00', isClosed: false } } } }]) assert.ok(validateRequestProposal({ ...request, ...patch }, target).error);
});
test('status notices require a baseline and valid text/dates without hidden keys', () => {
  const request = { changeType: 'Operational Status Change', targetType: 'Location', currentSnapshot: { operationalStatus: target.operationalStatus, activeNotice: null }, requestedChanges: { operationalStatus: target.operationalStatus, activeNotice: { shortDescription: 'Use north entrance', effectiveDate: '2026-10-22' } } };
  assert.equal(validateRequestProposal(request, target).error, undefined);
  for (const effectiveDate of ['2026-99-99', '2026-02-30']) assert.ok(validateRequestProposal({ ...request, requestedChanges: { ...request.requestedChanges, activeNotice: { ...request.requestedChanges.activeNotice, effectiveDate } } }, target).error);
});
test('inbox correction preserves explicit clearing and rejects extra fields', () => {
  const request = { changeType: 'Other Store Info Update', targetType: 'Location', currentSnapshot: { locationInboxEmail: target.locationInboxEmail }, requestedChanges: { locationInboxEmail: null } };
  assert.equal(validateRequestProposal(request, target).error, undefined);
  assert.ok(validateRequestProposal({ ...request, requestedChanges: { ...request.requestedChanges, email: 'private@example.test' } }, target).error);
});
test('recovery is account-bound and malformed stored operations fail closed', () => {
  const pending = { ...proposal, id: 'req-12345678-1234-1234-1234-123456789abc', status: 'Pending', targetId: 'loc-test' };
  const values = new Map([[submissionStorageKey('actor-1'), JSON.stringify(pending)]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null };
  assert.deepEqual(loadSubmission(storage, 'actor-1'), pending);
  assert.equal(loadSubmission(storage, 'actor-2'), null);
  values.set(submissionStorageKey('actor-1'), '{broken');
  assert.throws(() => loadSubmission(storage, 'actor-1'));
});

test('Person proposal checks unchanged Supports and respects explicit Works at clearing', () => {
  const actor: Account = { uid: 'test', email: null, name: 'Synthetic', emailVerified: true, role: 'Viewer', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  const person = { id: 'person', fullName: 'Synthetic', status: 'Active', primaryLocationId: 'loc-old', supportedLocationIds: ['loc-support'] };
  const locations = ['loc-old', 'loc-support'].map(id => ({ id, recordStatus: 'Active' }));
  const validate = (requestedChanges: Record<string, unknown>, currentSnapshot: Record<string, unknown>) => validateMetadataWrites([{ collection: 'requests', id: 'req-person', operation: 'set', data: { status: 'Pending', targetType: 'Person', targetId: person.id, changeType: 'Other Store Info Update', requestedChanges, currentSnapshot } }], [undefined], [], actor, [person], locations);
  assert.throws(() => validate({ primaryLocationId: 'loc-support' }, { primaryLocationId: 'loc-old' }), /Works at|Supports/);
  assert.doesNotThrow(() => validate({ primaryLocationId: null, supportedLocationIds: ['loc-old'] }, { primaryLocationId: 'loc-old', supportedLocationIds: ['loc-support'] }));
});

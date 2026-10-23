import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DistrictRecord, LocationRecord, PersonRecord, UpdateRequest, UserProfile } from '../src/types';
import { personTransitionReview } from '../src/lib/personTransitionReview';

const person: PersonRecord = { id: 'person', version: 3, fullName: 'Synthetic Person', status: 'Active', activeStatus: true, email: 'shared@example.test' };
const location = (id: string, extra = {}) => ({ id, version: 2, storeNumber: '007', name: 'Synthetic Store', type: 'Enclosed Mall', recordStatus: 'Active', ...extra } as LocationRecord);
const district = (id: string, extra = {}) => ({ id, version: 2, name: 'Synthetic District', regionId: 'west', status: 'Active', ...extra } as DistrictRecord);
const request = (id: string, extra = {}) => ({ id, status: 'Pending', targetType: 'Location', targetId: 'unrelated', changeType: 'Store Manager Change', requestedChanges: {}, currentSnapshot: {}, ...extra } as UpdateRequest);
const region = { id: 'west', name: 'West', status: 'Active' as const };

test('transition review distinguishes authoritative District DM, inherited stores and stale copies including vacancy', () => {
  const locations = [location('inherited', { districtId: 'owned', districtManagerId: 'other' }), location('stale', { districtId: 'vacant', districtManagerId: person.id }), location('legacy', { districtId: 'legacy', districtManagerId: person.id }), location('nonretail', { type: 'Corporate Office', districtId: 'vacant', districtManagerId: person.id })];
  const rows = personTransitionReview(person, locations, [district('owned', { districtManagerId: person.id }), district('vacant', { districtManagerId: null }), district('legacy'), district('zero', { districtManagerId: person.id })], [region], [], []);
  assert.deepEqual(rows.responsibilities.map(r => r.key), ['district:owned', 'district:zero', 'legacy:districtManagerId', 'nonretail:districtManagerId']);
  assert.deepEqual(rows.inheritedStores.map(r => r.locationId), ['inherited']);
  assert.deepEqual(rows.historicalCopies.map(r => r.id), ['stale']);
  assert(rows.responsibilities.some(r => r.key === 'district:zero' && r.label.includes('0 linked stores')));
});

test('all Location-owned roles and retired links remain reviewable without conferring access', () => {
  const rows = personTransitionReview({ ...person, status: 'Inactive', activeStatus: false, primaryLocationId: 'missing', supportedLocationIds: ['retired'] }, [location('retired', { recordStatus: 'Retired', storeManagerId: person.id, assistantStoreManagerIds: [person.id], keyHolderIds: [person.id], regionalManagerId: person.id })], [], [], [], []);
  assert.equal(rows.responsibilities.length, 4);
  assert.equal(rows.workplaces.length, 2);
  assert(rows.workplaces.every(r => r.unavailable));
  assert.equal(rows.accounts.length, 0);
});

test('all explicitly linked account states are retained minimally; names/email matches never link accounts', () => {
  const users = ['Active', 'Suspended', 'Revoked', undefined].map((status, n) => ({ id: 'u' + n, personId: person.id, role: 'Viewer', status, email: 'private@example.test', name: 'Private user name' } as UserProfile));
  users.push({ id: 'email-match', email: person.email, name: person.fullName, role: 'Viewer' } as UserProfile);
  const rows = personTransitionReview(person, [], [], [], users, []);
  assert.equal(rows.accounts.length, 4);
  assert(rows.accounts.every(row => !Object.hasOwn(row, 'email') && !Object.hasOwn(row, 'name')));
});

test('pending requests use exact IDs in targets, proposals and baselines without copying private payloads/history', () => {
  const requests = [request('target', { targetType: 'Person', targetId: person.id }), request('store', { targetId: 'sm' }), request('proposal', { requestedChanges: { assistantStoreManagerIds: [person.id], privateNote: 'secret' } }), request('baseline', { currentSnapshot: { regionalManagerId: person.id } }), request('copy', { targetId: 'stale' }), request('name-email', { targetName: person.fullName, requestedChanges: { storeManagerName: person.fullName, email: person.email } }), request('approved', { status: 'Approved', targetType: 'Person', targetId: person.id }), request('rejected', { status: 'Rejected', requestedChanges: { storeManagerId: person.id } })];
  const rows = personTransitionReview(person, [location('sm', { storeManagerId: person.id }), location('stale', { districtId: 'vacant', districtManagerId: person.id })], [district('vacant', { districtManagerId: null })], [region], [], requests);
  assert.deepEqual(rows.pendingRequests.map(r => r.id), ['target', 'store', 'proposal', 'baseline', 'copy']);
  assert(rows.pendingRequests.find(r => r.id === 'baseline')!.reasons.some(r => r.includes('historical context')));
  assert(!JSON.stringify(rows.pendingRequests).includes('secret'));
});

test('review does not mutate frozen source data and recomputes when assignments or requests change', () => {
  const loc = Object.freeze(location('sm', { storeManagerId: person.id }));
  const req = Object.freeze(request('pending', { targetId: 'sm' }));
  const p = Object.freeze({ ...person });
  const first = personTransitionReview(p, [loc], [], [], [], [req]);
  assert.equal(first.responsibilities.length, 1); assert.equal(first.pendingRequests.length, 1);
  const next = personTransitionReview(p, [{ ...loc, storeManagerId: undefined }], [], [], [], [{ ...req, status: 'Approved' }]);
  assert.equal(next.responsibilities.length, 0); assert.equal(next.pendingRequests.length, 0);
  assert.equal(loc.storeManagerId, person.id); assert.equal(req.status, 'Pending');
});

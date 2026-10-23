import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEADERSHIP_POSITION_FIELDS, PERSON_POSITIONS } from '../src/lib/personPositions';
import { leadershipCandidates, leadershipPickerOptions } from '../src/lib/leadershipPicker';
import { validatePersonPositionState } from '../server/personPositionValidation';
import { validateMetadataWrites } from '../server/firestoreDirectory';
import { previewDistrictLeadership } from '../src/lib/districtLeadership';
import { buildLocationImportPlan } from '../src/lib/locationImportPreview';
import type { Account } from '../server/authAuthority';
import type { Person, DistrictRecord, RegionRecord } from '../src/types';

for (const [field, role] of Object.entries(LEADERSHIP_POSITION_FIELDS)) test(`${role}: explicit eligibility for new grants, no automatic remapping of retained records`, () => {
  const legacy = { id: 'person', fullName: 'Synthetic Person', jobTitle: role, status: 'Active', activeStatus: true };
  const mapped = { ...legacy, positionIds: [PERSON_POSITIONS.find(p => p.label === role)!.id] };
  const value = field.endsWith('Ids') ? [legacy.id] : legacy.id;
  const location = { id: 'location', type: 'Corporate Office', [field]: value };
  const write = { collection: 'locations', operation: 'set', id: location.id, data: location };
  const before = { ...location, [field]: field.endsWith('Ids') ? [] : null };
  assert.deepEqual(leadershipCandidates([legacy], role, true), []);
  assert.deepEqual(leadershipCandidates([mapped], role).map(p => p.id), [legacy.id]);
  assert.equal(leadershipPickerOptions([legacy], role, true, legacy.id)[0].currentOnly, true);
  assert.throws(() => validatePersonPositionState([write], [before], [legacy], [before], []), new RegExp(role));
  assert.doesNotThrow(() => validatePersonPositionState([write], [before], [mapped], [before], []));
  assert.doesNotThrow(() => validatePersonPositionState([write], [location], [legacy], [location], []));
  assert.equal(Object.hasOwn(legacy, 'positionIds'), false);
});

test('a District grant, including zero-store setup, cannot use a matching legacy title', () => {
  const person = { id: 'person', fullName: 'Synthetic', jobTitle: 'District Manager', status: 'Active' } as Person;
  const district = { id: 'district', name: 'District', regionId: 'region', status: 'Active' } as DistrictRecord;
  const regions: RegionRecord[] = [{ id: 'region', name: 'Region', status: 'Active' }];
  assert.throws(() => previewDistrictLeadership(district, person.id, 'Explicit test only', [], [person], regions), /Add the District Manager position/);
  const write = { collection: 'districts', operation: 'set', id: district.id, data: { ...district, districtManagerId: person.id } };
  assert.throws(() => validatePersonPositionState([write], [{ ...district }], [person], [], [district]), /District Manager/);
  assert.doesNotThrow(() => validatePersonPositionState([write], [{ ...district }], [{ ...person, positionIds: ['district-manager'] }], [], [district]));
});

test('leadership correction proposals cannot use legacy title eligibility', () => {
  const person = { id: 'new-person', fullName: 'Synthetic New Manager', jobTitle: 'Store Manager', status: 'Active', workPhone: '+12135550101' };
  const location = { id: 'location', storeNumber: '007', storeManagerId: 'old', storeManagerName: 'Old', storeManagerPhone: '' };
  const request = { status: 'Pending', targetType: 'Location', targetId: location.id, changeType: 'Store Manager Change', requestedChanges: { storeManagerId: person.id, storeManagerName: person.fullName, storeManagerPhone: person.workPhone }, currentSnapshot: { storeManagerId: 'old', storeManagerName: 'Old', storeManagerPhone: '' } };
  const actor = { uid: 'viewer', role: 'Viewer', accessScope: 'Company-wide' } as Account;
  const run = (candidate: typeof person & { positionIds?: string[] }) => validateMetadataWrites([{ collection: 'requests', operation: 'set', id: 'request', data: request }], [undefined], [], actor, [candidate], [location]);
  assert.throws(() => run(person), /active Store Manager/);
  assert.doesNotThrow(() => run({ ...person, positionIds: ['store-manager'] }));
});

test('CSV checks new array members only for position eligibility, retaining existing active legacy members and order', () => {
  const old = { id: 'old', fullName: 'Old', status: 'Active', jobTitle: 'Assistant Manager' };
  const added = { id: 'new', fullName: 'New', status: 'Active', positionIds: ['assistant-store-manager'] };
  const location = { id: 'location', storeNumber: '007', name: 'Synthetic', type: 'Corporate Office', hierarchyApplicability: 'Not Applicable', recordStatus: 'Active', assistantStoreManagerIds: ['old'] };
  const snapshot = { locations: [location], people: [old, added], regions: [], districts: [] } as any;
  const csv = 'LocationId,AssistantStoreManagerIds\r\nlocation,old;new\r\n';
  assert.equal(buildLocationImportPlan(csv, snapshot).preview.summary.blocked, 0);
  const withoutMapping = { ...snapshot, people: [old, { ...added, positionIds: undefined }] };
  assert.equal(buildLocationImportPlan(csv, withoutMapping).preview.summary.blocked, 1);
  const inactiveOld = { ...snapshot, people: [{ ...old, status: 'Inactive' }, added] };
  assert.equal(buildLocationImportPlan(csv, inactiveOld).preview.summary.blocked, 1, 'Do not weaken existing lifecycle guards');
  assert.deepEqual(location.assistantStoreManagerIds, ['old']);
});

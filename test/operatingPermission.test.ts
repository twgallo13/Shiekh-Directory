import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canManageOperatingState } from '../src/lib/operatingPermission';
import type { DistrictRecord, LocationRecord, Person, RegionRecord } from '../src/types';

const location = { id: 'store', storeNumber: '007', recordStatus: 'Active', type: 'Enclosed Mall', regionId: 'region', districtId: 'district', storeManagerId: 'sm', districtManagerId: 'old-dm' } as LocationRecord;
const people: Person[] = [{ id: 'sm', fullName: 'SM', status: 'Active' }, { id: 'dm', fullName: 'DM', status: 'Active' }, { id: 'old-dm', fullName: 'Prior', status: 'Active' }];
const districts: DistrictRecord[] = [{ id: 'district', name: 'District', regionId: 'region', status: 'Active', districtManagerId: 'dm' }];
const regions: RegionRecord[] = [{ id: 'region', name: 'Region', status: 'Active' }];
const can = (personId: string, scope = 'Company-wide', roster = people, registry = districts) => canManageOperatingState({ role: 'Viewer', accessScope: scope, personId }, location, roster, registry, regions);
test('assigned SM and District-owned DM can operate, but copied DM/title cannot grant authority', () => {
  assert.equal(can('sm'), true); assert.equal(can('dm'), true); assert.equal(can('old-dm'), false);
  assert.equal(canManageOperatingState({ role: 'Viewer', accessScope: 'Company-wide', personId: 'pretend' }, location, [{ id: 'pretend', fullName: 'Typed DM', jobTitle: 'District Manager', status: 'Active' }], districts, regions), false);
});
test('scope, lifecycle and registry uncertainty fail closed while admin scope remains separate', () => {
  assert.equal(can('dm', 'Store 008'), false); assert.equal(can('dm', 'Store 007'), true);
  assert.equal(can('sm', 'Unknown'), false);
  assert.equal(can('dm', 'Company-wide', people.map(p => ({ ...p, status: 'Inactive' }))), false);
  assert.equal(can('dm', 'Company-wide', people, [{ ...districts[0], districtManagerId: null }]), false);
  assert.equal(can('dm', 'Company-wide', people, [{ ...districts[0], regionId: 'missing' }]), false);
  assert.equal(canManageOperatingState({ role: 'System Administrator', accessScope: 'Company-wide' }, location, [], [], []), true);
  assert.equal(canManageOperatingState({ role: 'System Administrator', accessScope: 'Store 008' }, location, [], [], []), false);
});

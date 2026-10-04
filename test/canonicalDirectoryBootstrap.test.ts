import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalDirectoryBootstrap } from '../src/lib/canonicalDirectoryBootstrap';
import { preserveUnchangedStaffing } from '../src/lib/locationStaffingEdit';
import { buildLocationReadProjection, resolveActivePerson } from '../src/lib/readProjectionContract';
import { reconcileLocationLeadershipCopy } from '../src/lib/personLocationRelationships';
import type { LocationRecord, Person } from '../src/types';
import { DEFAULT_WEEKLY_HOURS } from '../src/lib/defaultHours';
import { validateMetadataWrites } from '../server/firestoreDirectory';
import type { Account } from '../server/authAuthority';

const location = {
  id: 'loc-synthetic', storeNumber: '07', name: 'Synthetic Store', type: 'Enclosed Mall',
  recordStatus: 'Active', standardHours: DEFAULT_WEEKLY_HOURS, storeManagerId: 'missing',
  storeManagerName: 'Copied Manager', assistantStoreManagerIds: ['missing-assistant'],
  assistantStoreManagerNames: ['Copied Assistant'], keyHolderNames: ['Copied Key Holder'],
  districtManagerName: 'Copied District Manager', regionalManagerId: 'regional',
  regionalManagerName: 'Stale Regional Name',
} as LocationRecord;
const people: Person[] = [{ id: 'regional', fullName: 'Canonical Regional', status: 'Active' }];

test('bootstrap preserves persisted roster and every role exactly, including missing IDs and legacy-only; hours compatibility only', () => {
  const before = JSON.stringify({ location, people });
  const templates = [{ id: 'hours-synthetic', name: 'Synthetic Hours', description: 'Synthetic template', schedule: DEFAULT_WEEKLY_HOURS }];
  const loaded = canonicalDirectoryBootstrap([location], people, templates);
  assert.equal(loaded.people, people);
  const next = loaded.locations[0];
  assert.equal(next.hoursTemplateId, 'hours-synthetic');
  assert.equal(next.hoursMode, 'template');
  for (const key of ['storeManagerId', 'storeManagerName', 'assistantStoreManagerIds', 'assistantStoreManagerNames', 'keyHolderIds', 'keyHolderNames', 'districtManagerId', 'districtManagerName', 'regionalManagerId', 'regionalManagerName'] as const) {
    assert.deepEqual(next[key], location[key]);
    assert.equal(Object.hasOwn(next, key), Object.hasOwn(location, key));
  }
  assert.equal(JSON.stringify({ location, people }), before);
  const diagnostics = buildLocationReadProjection(next, people);
  assert.ok(diagnostics.warnings.some(warning => warning.includes('missing')));
  assert.ok(diagnostics.warnings.some(warning => warning.includes('legacy copied')));
  assert.equal(diagnostics.regionalManager, 'Canonical Regional');
});

test('unrelated Location save does not infer/delete assignments or refresh legacy copies; explicit change can refresh its role', () => {
  const raw = { ...location, keyHolderIds: [], name: 'Renamed Store' };
  const sanitized = { ...raw, storeManagerName: '', assistantStoreManagerIds: [], assistantStoreManagerNames: [], keyHolderIds: [], keyHolderNames: [], districtManagerName: '', regionalManagerName: 'Canonical Regional' };
  const saved = preserveUnchangedStaffing(raw, location, sanitized);
  assert.equal(saved.name, 'Renamed Store');
  assert.equal(saved.storeManagerName, 'Copied Manager');
  assert.deepEqual(saved.assistantStoreManagerIds, ['missing-assistant']);
  assert.equal('keyHolderIds' in saved, false);
  assert.deepEqual(saved.keyHolderNames, ['Copied Key Holder']);
  assert.equal(saved.regionalManagerName, 'Stale Regional Name');
  const explicit = preserveUnchangedStaffing({ ...raw, regionalManagerId: undefined }, location, { ...sanitized, regionalManagerId: undefined, regionalManagerName: '' });
  assert.equal(explicit.regionalManagerId, undefined);
  assert.equal(explicit.regionalManagerName, '');
});

test('regional-only Person name edit copies regional field only and does not remove unrelated legacy names', () => {
  const edited = reconcileLocationLeadershipCopy(location, 'regional', { ...people[0], fullName: 'Renamed Regional' }, '', () => undefined, ['fullName']);
  assert.equal(edited.regionalManagerName, 'Renamed Regional');
  assert.equal(edited.storeManagerId, 'missing');
  assert.deepEqual(edited.assistantStoreManagerNames, ['Copied Assistant']);
  assert.deepEqual(edited.keyHolderNames, ['Copied Key Holder']);
  assert.equal(reconcileLocationLeadershipCopy(location, 'regional', people[0], '', () => undefined, ['supportedLocationIds']), location);
});

test('strict UI read does not present unknown/conflicting status as active or fall back to a duplicate name', () => {
  assert.equal(resolveActivePerson('regional', [{ ...people[0], activeStatus: false }]), undefined);
  assert.equal(resolveActivePerson('regional', [{ ...people[0], status: 'Other' }]), undefined);
  assert.equal(resolveActivePerson('regional', [{ ...people[0], status: undefined }]), undefined);
  assert.equal(resolveActivePerson('missing', [{ ...people[0], fullName: 'Copied Manager' }]), undefined);
});

test('server full-document unrelated save preserves unchanged broken staffing references and legacy-only copies', () => {
  const actor: Account = { uid: 'synthetic-editor', email: 'editor@example.test', emailVerified: true, name: 'Synthetic Editor', role: 'Editor', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  const current = { ...location, version: 0 };
  const proposed = { ...current, name: 'Unrelated Store Rename' };
  const saved = validateMetadataWrites([{ collection: 'locations', id: current.id, operation: 'set', data: proposed, expectedVersion: 0 }], [current], [], actor, people, [current], [], { regions: [], districts: [] })[0].data!;
  assert.equal(saved.storeManagerId, 'missing');
  assert.deepEqual(saved.assistantStoreManagerIds, ['missing-assistant']);
  assert.deepEqual(saved.keyHolderNames, ['Copied Key Holder']);
  assert.equal(Object.hasOwn(saved, 'keyHolderIds'), false);
  assert.equal(saved.regionalManagerId, 'regional');
  assert.equal(saved.regionalManagerName, 'Stale Regional Name');
  assert.equal(saved.name, 'Unrelated Store Rename');
});

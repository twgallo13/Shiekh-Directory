import assert from 'node:assert/strict';
import { test } from 'node:test';
import { personPositions, allowsLeadershipPosition, validPositionIds, personPositionLabel } from '../src/lib/personPositions';
import { leadershipCandidates } from '../src/lib/leadershipPicker';
import { personProfileImpact } from '../src/lib/personProfileImpact';
import { buildPersonLocationRelationships } from '../src/lib/personLocationRelationships';
import { validatePersonPositionState } from '../server/personPositionValidation';
import { validateMetadataWrites } from '../server/firestoreDirectory';
import { validPersonCommit } from '../src/lib/personCommit';
import { projectPerson } from '../server/personnelProjection';
import { buildLocationImportPlan } from '../src/lib/locationImportPreview';
import type { Person, LocationRecord, DistrictRecord, RegionRecord } from '../src/types';
import type { Account } from '../server/authAuthority';

const person: Person = { id: 'synthetic-person', version: 2, fullName: 'Synthetic Manager', jobTitle: 'SM', role: 'Historic unrelated alias', status: 'Active', activeStatus: true };
const store = { id: 'loc-007', version: 2, storeNumber: '007', name: 'Synthetic store', type: 'Street / Standalone Location', recordStatus: 'Active', regionId: 'west', districtId: 'north', storeManagerId: person.id, districtManagerId: 'old-dm' } as LocationRecord;
const region: RegionRecord = { id: 'west', name: 'West', status: 'Active' };
const district: DistrictRecord = { id: 'north', name: 'North', regionId: 'west', status: 'Active', districtManagerId: person.id };
const actor = { uid: 'admin', role: 'System Administrator', accessScope: 'Company-wide' } as Account;

test('explicit concurrent positions override descriptive titles without deriving assignments or permissions', () => {
  const mapped = { ...person, positionIds: ['store-manager', 'district-manager'] };
  assert.deepEqual(personPositions(mapped).ids, ['store-manager', 'district-manager']);
  for (const role of ['Store Manager', 'District Manager'] as const) assert(allowsLeadershipPosition(mapped, role));
  assert(!allowsLeadershipPosition(mapped, 'Regional Manager'));
  assert.deepEqual(leadershipCandidates([mapped], 'District Manager').map(p => p.id), [person.id]);
  assert.deepEqual(leadershipCandidates([mapped], 'Regional Manager', true), []);
  assert.equal(personPositions(person).source, 'legacy');
  assert.deepEqual(personPositions(person).ids, ['store-manager']);
  assert(!allowsLeadershipPosition({ jobTitle: 'Unusual cross-role coverage' }, 'District Manager'));
  assert(!allowsLeadershipPosition({ jobTitle: 'District Manager' }, 'District Manager'), 'A matching title is not an explicit position');
});

test('invalid and explicitly empty mappings never fall back to a legacy title', () => {
  for (const positionIds of [null, 'district-manager', ['invented'], ['store-manager', 'store-manager']]) {
    assert(!validPositionIds(positionIds)); assert.equal(personPositions({ ...person, positionIds }).source, 'invalid');
    assert(!allowsLeadershipPosition({ ...person, positionIds }, 'Store Manager'));
  }
  assert(validPositionIds([])); assert(!allowsLeadershipPosition({ ...person, positionIds: [] }, 'Store Manager'));
});

test('controlled display labels never hide concurrent positions or fall back from invalid mappings', () => {
  assert.equal(personPositionLabel({ ...person, positionIds: ['store-manager', 'district-manager'] }), 'Store Manager · District Manager');
  assert.equal(personPositionLabel({ ...person, positionIds: [] }), 'No linked positions');
  assert.equal(personPositionLabel({ ...person, positionIds: ['invented'] }), 'Positions need review');
  assert.equal(personPositionLabel(person), 'SM');
});

test('preview includes District ownership even with no stores; copied DMs are not authority', () => {
  const zero = personProfileImpact(person, [], [district], [region], []);
  assert.equal(zero.responsibilities[0].requiredPosition, 'district-manager');
  assert.match(zero.responsibilities[0].label, /0 linked stores/);
  const rows = buildPersonLocationRelationships(person, [store], [district]);
  assert(rows[0].labels.includes('District Manager'));
  const old = { ...person, id: 'old-dm' };
  assert.deepEqual(buildPersonLocationRelationships(old, [store], [district]), []);
  assert.match(personProfileImpact(old, [store], [district], [region], []).issues[0], /not current authority/);
});

test('server blocks removing required positions and supports explicitly retained multiple positions', () => {
  const write = (positionIds: unknown) => ({ collection: 'people' as const, operation: 'set' as const, id: person.id, expectedVersion: 2, data: { ...person, positionIds } });
  const run = (ids: unknown) => validateMetadataWrites([write(ids)], [person as any], [], actor, [person], [store as any], [], { regions: [region], districts: [district] });
  assert.throws(() => run(['district-manager']), /Store Manager.*Synthetic store/);
  assert.throws(() => run(['store-manager']), /District Manager.*North/);
  const result = run(['store-manager', 'district-manager']);
  assert.deepEqual(result[0].data?.positionIds, ['store-manager', 'district-manager']);
  assert.equal(result[0].data?.role, person.role);
  assert.throws(() => run(['invented']), /approved position list/);
  assert.throws(() => run(['store-manager', 'store-manager']), /approved position list/);
});

test('old writers preserve mapped positions and unrelated unmapped titles remain untouched', () => {
  const current = { ...person, positionIds: ['store-manager'] };
  const write = { collection: 'people' as const, operation: 'set' as const, id: person.id, expectedVersion: 2, data: { ...person, department: 'Finance' } };
  const result = validateMetadataWrites([write], [current as any], [], actor, [current], [], []);
  assert.deepEqual(result[0].data?.positionIds, current.positionIds);
  assert.equal(result[0].data?.role, person.role);
  const legacy = validateMetadataWrites([write], [person as any], [], actor, [person], [], []);
  assert(!Object.hasOwn(legacy[0].data!, 'positionIds'));
});

test('all Location assignment writers reject mapped-ineligible people but permit unchanged legacy conflicts', () => {
  const dm = { ...person, positionIds: ['district-manager'] };
  const next = { ...store, storeManagerId: person.id } as any;
  const write = { collection: 'locations', operation: 'set', id: store.id, data: next };
  assert.throws(() => validatePersonPositionState([write], [{ ...store, storeManagerId: 'previous' } as any], [dm], [store as any], []), /Store Manager/);
  assert.doesNotThrow(() => validatePersonPositionState([write], [store as any], [dm], [store as any], []));
  assert.throws(() => validatePersonPositionState([write], [{ ...store, storeManagerId: 'previous' } as any], [person], [store as any], []), /Store Manager/);
  assert.doesNotThrow(() => validatePersonPositionState([write], [store as any], [person], [store as any], []), 'Unchanged legacy responsibility remains preserved');
});

test('simultaneous position and assignment changes validate final state regardless of write order', () => {
  const mapped = { ...person, positionIds: ['district-manager'] };
  const pw = { collection: 'people', operation: 'set', id: person.id, data: mapped };
  const lw = { collection: 'locations', operation: 'set', id: store.id, data: { ...store, storeManagerId: null } };
  assert.doesNotThrow(() => validatePersonPositionState([pw, lw], [person as any, store as any], [mapped], [store as any], [district]));
  assert.doesNotThrow(() => validatePersonPositionState([lw, pw], [store as any, person as any], [mapped], [store as any], [district]));
  assert.throws(() => validatePersonPositionState([pw], [person as any], [mapped], [store as any], [district]), /Store Manager/);
});

test('District-owned vacancies suppress stale store copies without bypassing zero-store District responsibilities', () => {
  const mapped = { ...person, id: 'old-dm', positionIds: ['other'] };
  const pw = { collection: 'people', operation: 'set', id: mapped.id, data: mapped };
  assert.doesNotThrow(() => validatePersonPositionState([pw], [{ ...mapped, positionIds: undefined }], [mapped], [store as any], [{ ...district, districtManagerId: null }]));
  assert.throws(() => validatePersonPositionState([pw], [{ ...mapped, positionIds: undefined }], [mapped], [], [{ ...district, districtManagerId: mapped.id }]), /District Manager/);
});

test('profile saves require an exact complete versioned response, never empty partial duplicate or mismatched success', () => {
  const write = { collection: 'people' as const, operation: 'set' as const, id: person.id, expectedVersion: 2, data: person as any };
  const record = { collection: 'people' as const, operation: 'set' as const, id: person.id, data: { ...person, version: 3 } };
  assert(validPersonCommit({ records: [record] }, [write]));
  for (const records of [[], [record, record], [{ ...record, id: 'wrong' }], [{ ...record, data: { ...record.data, version: 2 } }], [{ ...record, data: null }]]) assert(!validPersonCommit({ records }, [write]));
  const locationWrite = { collection: 'locations' as const, operation: 'set' as const, id: store.id, expectedVersion: 2 };
  assert(!validPersonCommit({ records: [record] }, [write, locationWrite]));
  assert(validPersonCommit({ records: [record, { collection: 'locations', operation: 'set', id: store.id, data: { id: store.id, version: 3 } }] }, [write, locationWrite]));
});

test('internal linked positions and contacts do not change the frozen contact-free personnel wire allowlist', () => {
  const before = projectPerson({ id: person.id, data: person as any }, []);
  const after = projectPerson({ id: person.id, data: { ...person, positionIds: ['store-manager', 'district-manager'], workEmail: 'private@example.test' } }, []);
  assert.deepEqual(after, before);
  assert(!Object.hasOwn(after, 'positionIds'));
});

test('CSV preview blocks a newly assigned mapped-ineligible manager and preserves unchanged historical assignments', () => {
  const mapped = { ...person, positionIds: ['district-manager'] } as Person;
  const current = { ...store, type: 'Other Company Location', hierarchyApplicability: 'Not Applicable', regionId: undefined, districtId: undefined, storeManagerId: undefined } as LocationRecord;
  const snapshot = { locations: [current], people: [mapped], regions: [], districts: [] };
  const plan = buildLocationImportPlan('LocationId,StoreManagerId\r\nloc-007,synthetic-person\r\n', snapshot);
  assert.equal(plan.preview.summary.blocked, 1);
  assert(plan.preview.rows[0].issues.some(i => /required linked position/.test(i.reason)));
  const historical = buildLocationImportPlan('LocationId,StoreManagerId\r\nloc-007,synthetic-person\r\n', { ...snapshot, locations: [{ ...current, storeManagerId: person.id }] });
  assert.equal(historical.preview.summary.blocked, 0);
});

test('CSV reconciles inherited DM copies without treating canonical historical ownership as a new assignment', () => {
  const mapped = { ...person, positionIds: ['store-manager'] } as Person;
  for (const districtManagerId of [undefined, 'old-dm', person.id]) {
    const current = { ...store, districtManagerId };
    const plan = buildLocationImportPlan('LocationId,StoreName\r\nloc-007,Updated store name\r\n', { locations: [current], people: [mapped], regions: [region], districts: [district] });
    assert.equal(plan.preview.summary.blocked, 0);
    assert(plan.preview.rows[0].changes.some(c => c.field === 'name'));
    if (districtManagerId !== person.id) assert(plan.preview.rows[0].changes.some(c => c.field === 'districtManagerId' && c.after === person.id));
  }
});

test('phone visibility omitted by old writers is retained and changed invalid values are rejected', () => {
  const current = { ...person, phonePrivacy: 'Restricted' };
  const write = { collection: 'people' as const, operation: 'set' as const, id: person.id, expectedVersion: 2, data: { ...person, department: 'Finance' } };
  assert.equal(validateMetadataWrites([write], [current], [], actor, [person], [], [])[0].data?.phonePrivacy, 'Restricted');
  assert.throws(() => validateMetadataWrites([{ ...write, data: { ...write.data, phonePrivacy: 'unknown' } }], [current], [], actor, [person], [], []), /Phone visibility/);
});

test('controlled new assignments fail closed on unknown or contradictory lifecycle', () => {
  const mapped = { ...person, positionIds: ['store-manager'], status: undefined, activeStatus: undefined };
  const write = { collection: 'locations', operation: 'set', id: store.id, data: store as any };
  for (const p of [mapped, { ...mapped, status: 'Active', activeStatus: false }]) assert.throws(() => validatePersonPositionState([write], [{ ...store, storeManagerId: null } as any], [p], [store as any], []), /clearly Active/);
});

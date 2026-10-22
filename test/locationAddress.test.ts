import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from 'csv-parse/sync';
import { normalizeAddressValues, publicAddressText } from '../src/lib/locationAddress';
import { validateRequestProposal } from '../src/lib/requestValidation';
import { validateMetadataWrites } from '../server/firestoreDirectory';
import { buildLocationEditingExport } from '../server/locationEditingExport';
import { buildLocationImportPlan } from '../src/lib/locationImportPreview';
import type { DirectorySeed } from '../src/lib/directorySeed';
import type { Account } from '../server/authAuthority';
const location = { id: 'loc-007', version: 3, storeNumber: '007', name: 'Synthetic', type: 'Other Company Location', hierarchyApplicability: 'Not Applicable', recordStatus: 'Active', operationalStatus: 'Open — Normal Operations', phone: '+12135550100', address: '7 Main Street', city: 'Example', state: 'CA', zipCode: '09001', timeZone: 'America/Los_Angeles', suite: 'Space 2148', mallOrCenterName: 'Example Mall', wayfindingDirections: 'Second floor, next to Macy’s.\nNorth entrance.', standardHours: {} } as DirectorySeed['locations'][number];
const actor = { uid: 'admin', name: 'Admin', role: 'System Administrator', accessScope: 'Company-wide' } as Account;

test('address values normalize without losing ZIP zeroes; optional clears never clear required fields', () => {
  const normalized = normalizeAddressValues({ address: ' 8 Main Street ', state: ' ca ', zipCode: '09001', suite: '', wayfindingDirections: null });
  assert.deepEqual(normalized.issues, []); assert.equal(normalized.values.state, 'CA'); assert.equal(normalized.values.zipCode, '09001'); assert.equal(normalized.values.suite, null);
  for (const value of [{ address: '' }, { city: null }, { state: 'California' }, { zipCode: '9001' }, { suite: 'x'.repeat(101) }, { wayfindingDirections: 'x'.repeat(1001) }, { address: 'Bad\u0000address' }]) assert.ok(normalizeAddressValues(value).issues.length);
  assert.equal(publicAddressText('wayfindingDirections', { private: true }), null);
  assert.equal(publicAddressText('suite', ''), null);
});

test('address proposals enforce field allowlists, current baseline, normalization and no-op rejection', () => {
  const proposal = { targetType: 'Location', changeType: 'Address Update', requestedChanges: { suite: null, wayfindingDirections: 'Use east entrance' }, currentSnapshot: { suite: location.suite, wayfindingDirections: location.wayfindingDirections } };
  assert.equal(validateRequestProposal(proposal, location as any).error, undefined);
  assert.ok(validateRequestProposal({ ...proposal, currentSnapshot: { suite: location.suite } }, location as any).error);
  assert.ok(validateRequestProposal(proposal, { ...location, suite: 'Changed' }).error);
  assert.ok(validateRequestProposal({ ...proposal, requestedChanges: { districtManagerId: 'forged' } }, location as any).error);
  assert.ok(validateRequestProposal({ ...proposal, requestedChanges: { suite: location.suite } }, location as any).error);
  assert.ok(validateRequestProposal({ ...proposal, requestedChanges: { address: '' }, currentSnapshot: { address: location.address } }, location as any).error);
});

test('server direct writes preserve omitted optional address fields and reject invalid changed values', () => {
  const write = { collection: 'locations' as const, id: location.id, operation: 'set' as const, data: { storeNumber: '007', name: 'Renamed' }, expectedVersion: 3 };
  const saved = validateMetadataWrites([write], [location as any], [], actor)[0].data!;
  assert.equal(saved.suite, location.suite); assert.equal(saved.wayfindingDirections, location.wayfindingDirections);
  assert.equal(validateMetadataWrites([{ ...write, data: { ...write.data, suite: null } }], [location as any], [], actor)[0].data?.suite, null);
  assert.throws(() => validateMetadataWrites([{ ...write, data: { ...write.data, wayfindingDirections: 'x'.repeat(1001) } }], [location as any], [], actor), /wayfindingDirections/);
});

test('editing CSV round-trips optional address text including Unicode, commas/newlines and explicit null', () => {
  for (const clear of [false, true]) {
    const record = { ...location, ...(clear ? { suite: null, wayfindingDirections: null, mallOrCenterName: null } : {}) };
    const snapshot = { locations: [record], people: [], regions: [], districts: [] };
    const exported = buildLocationEditingExport(snapshot);
    const plan = buildLocationImportPlan(exported.parts[0].csv, snapshot);
    assert.equal(plan.preview.summary.unchanged, 1); assert.equal(plan.preview.summary.blocked, 0);
    const rows = parse(exported.parts[0].csv, { bom: true, columns: true }) as Record<string, string>[];
    assert.equal(rows[0].SuiteAction, clear ? 'clear' : 'set');
    assert.equal(rows[0].WayfindingDirections, clear ? '' : location.wayfindingDirections);
    assert.equal(rows[0].StoreNumber, '007');
  }
});

test('CSV blank optional address preserves; explicit clears succeed; mixed/invalid actions block', () => {
  const snapshot = { locations: [location], people: [], regions: [], districts: [] };
  for (const [value, action, expected] of [['', '', 'unchanged'], ['', 'keep', 'unchanged'], ['', 'clear', 'update'], ['Space 2', 'set', 'update'], ['Space 2', 'clear', 'blocked'], ['', 'set', 'blocked'], ['Space 2', 'keep', 'blocked'], ['', 'invalid', 'blocked']] as const) {
    const csv = `LocationId,Suite,SuiteAction\r\nloc-007,${value},${action}\r\n`;
    const plan = buildLocationImportPlan(csv, snapshot);
    assert.equal(plan.preview.rows[0].action, expected, `${value}/${action}`);
    if (action === 'clear' && !value) assert.equal(plan.writes[0].data.suite, null);
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Firestore } from '@google-cloud/firestore';
import type { Account } from '../server/authAuthority';
import { FirestoreDirectoryStore, DirectoryConflict, DirectoryValidationError, validateMetadataWrites } from '../server/firestoreDirectory';
import type { CustomFieldDefinition } from '../src/lib/customFields';

function databaseFixture() {
  const records = new Map<string, Record<string, unknown>>();
  const snapshot = (path: string) => ({ id: path.split('/')[1], exists: records.has(path), data: () => records.has(path) ? structuredClone(records.get(path)) : undefined });
  class Query {
    field?: string;
    value?: unknown;
    maximum = Infinity;
    constructor(readonly collection: string) {}
    doc(id: string) { return { path: `${this.collection}/${id}` }; }
    limit(maximum: number) { this.maximum = maximum; return this; }
    where(field: string, operator: string, value: unknown) { assert.equal(operator, '=='); this.field = field; this.value = value; return this; }
    async get() {
      const docs = [...records].filter(([path, data]) => path.startsWith(`${this.collection}/`) && (!this.field || data[this.field] === this.value)).slice(0, this.maximum).map(([path]) => snapshot(path));
      return { docs, size: docs.length, empty: !docs.length };
    }
  }
  const firestore = {
    collection: (name: string) => new Query(name),
    async runTransaction(callback: (transaction: unknown) => Promise<void>) {
      const pending: (() => void)[] = [];
      await callback({
        get: async (target: Query | { path: string }) => { assert.equal(pending.length, 0, 'all reads precede writes'); return target instanceof Query ? target.get() : snapshot(target.path); },
        set: (target: { path: string }, value: Record<string, unknown>) => pending.push(() => records.set(target.path, structuredClone(value))),
        delete: (target: { path: string }) => pending.push(() => records.delete(target.path)),
      });
      pending.forEach(write => write());
    },
  };
  return { records, store: new FirestoreDirectoryStore(firestore as unknown as Firestore) };
}

test('custom definitions and values round-trip through transactional storage, bootstrap and audit history', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  const field: CustomFieldDefinition = { id: 'yelpUrl', label: 'Yelp', type: 'url', helpText: '', options: [], order: 0, apiVisible: false, retired: false };
  const audit = { action: 'Custom Field Created', entityType: 'Setting', entityId: field.id, entityName: field.label, details: 'Created Yelp field.' };
  await store.commit([{ collection: 'custom_field_definitions', id: field.id, operation: 'set', data: { ...field }, expectedDefinition: null }], audit, actor);
  const location = { id: 'loc-07', storeNumber: '07', name: 'Test Store', customMetadata: { yelpUrl: 'https://example.test/yelp' } };
  await store.commit([{ collection: 'locations', id: location.id, operation: 'set', data: location, expectedCustomMetadata: {} }], { ...audit, entityType: 'Location', entityId: location.id, action: 'Location Updated' }, actor);
  const reloaded = await store.read();
  assert.deepEqual(reloaded.customFieldDefinitions, [field]);
  assert.deepEqual(reloaded.locations[0].customMetadata, location.customMetadata);
  assert.equal(reloaded.auditLogs.length, 2);
  assert.ok(reloaded.auditLogs.some(entry => entry.newState?.customMetadata?.yelpUrl === location.customMetadata.yelpUrl));
  await store.commit([{ collection: 'custom_field_definitions', id: field.id, operation: 'set', data: { ...field, retired: true }, expectedDefinition: field }], audit, actor);
  await store.commit([{ collection: 'locations', id: location.id, operation: 'set', data: { storeNumber: '07', name: 'Renamed' }, expectedVersion: 0 }], { ...audit, entityType: 'Location' }, actor);
  assert.deepEqual((await store.read()).locations[0].customMetadata, location.customMetadata);
  const count = records.size;
  await assert.rejects(store.commit([{ collection: 'locations', id: location.id, operation: 'set', data: { ...location, customMetadata: {} }, expectedCustomMetadata: {}, expectedVersion: 1 }], audit, actor), DirectoryConflict);
  assert.equal(records.size, count);
  assert.deepEqual(records.get('locations/loc-07')?.customMetadata, location.customMetadata);
});

test('directory commit rejects stale correction approvals without partial target changes', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('locations/loc-07', { id: 'loc-07', storeNumber: '07', name: 'Original Store', version: 2, recordStatus: 'Active' });
  records.set('requests/req-1', { id: 'req-1', targetType: 'Location', targetId: 'loc-07', status: 'Pending', version: 3, requestedChanges: { name: 'Approved Name' } });

  await assert.rejects(store.commit([
    { collection: 'requests', id: 'req-1', operation: 'set', expectedVersion: 2, data: { targetType: 'Location', targetId: 'loc-07', status: 'Approved', requestedChanges: { name: 'Approved Name' } } },
    { collection: 'locations', id: 'loc-07', operation: 'set', expectedVersion: 2, data: { storeNumber: '07', name: 'Approved Name' } },
  ], { action: 'Request Approved', entityType: 'Request', entityId: 'req-1', entityName: 'Name Change', details: 'Approved request.' }, actor), DirectoryConflict);

  assert.equal(records.get('requests/req-1')?.status, 'Pending');
  assert.equal(records.get('locations/loc-07')?.name, 'Original Store');
  assert.equal([...records.keys()].filter(key => key.startsWith('audit_logs/')).length, 0);
});

test('directory commit validates combined Person and Location state and writes multi-record audit evidence', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('people/per-1', { id: 'per-1', fullName: 'Existing Manager', status: 'Active', version: 0 });
  records.set('locations/loc-07', { id: 'loc-07', storeNumber: '07', name: 'Original Store', storeManagerId: 'per-1', version: 0, recordStatus: 'Active' });

  await assert.rejects(store.commit([
    { collection: 'people', id: 'per-1', operation: 'delete', expectedVersion: 0 },
  ], { action: 'Person Deleted', entityType: 'Person', entityId: 'per-1', entityName: 'Existing Manager', details: 'Delete person.' }, actor), DirectoryValidationError);
  assert.ok(records.has('people/per-1'));
  assert.equal(records.get('locations/loc-07')?.storeManagerId, 'per-1');

  await store.commit([
    { collection: 'people', id: 'per-1', operation: 'delete', expectedVersion: 0 },
    { collection: 'locations', id: 'loc-07', operation: 'set', expectedVersion: 0, data: { storeNumber: '07', name: 'Original Store', storeManagerId: '' } },
  ], { action: 'Person Deleted', entityType: 'Person', entityId: 'per-1', entityName: 'Existing Manager', details: 'Delete person and clear assignment.' }, actor);

  assert.ok(!records.has('people/per-1'));
  assert.equal(records.get('locations/loc-07')?.storeManagerId, '');
  const auditRecord = [...records.entries()].find(([key]) => key.startsWith('audit_logs/'))?.[1];
  assert.equal(Array.isArray(auditRecord?.previousStates), true);
  assert.equal(Array.isArray(auditRecord?.newStates), true);
  assert.equal((auditRecord?.previousStates as unknown[]).length, 2);
  assert.equal((auditRecord?.newStates as unknown[]).length, 2);
});

test('directory commit allows person-only changes when unrelated location manager remains valid', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('people/per-1', { id: 'per-1', fullName: 'Edited Person', status: 'Active', version: 0 });
  records.set('people/per-2', { id: 'per-2', fullName: 'Valid Manager', status: 'Active', version: 0 });
  records.set('locations/loc-07', { id: 'loc-07', storeNumber: '07', name: 'Store 7', storeManagerId: 'per-2', version: 0, recordStatus: 'Active' });

  await store.commit([
    { collection: 'people', id: 'per-1', operation: 'set', expectedVersion: 0, data: { fullName: 'Edited Person', status: 'Active', workPhone: '2125550100' } },
  ], { action: 'Person Updated', entityType: 'Person', entityId: 'per-1', entityName: 'Edited Person', details: 'Updated unrelated person.' }, actor);

  assert.equal(records.get('people/per-1')?.workPhone, '+12125550100');
  assert.equal(records.get('locations/loc-07')?.storeManagerId, 'per-2');
});

test('directory commit persists a complete Person create, update, and versioned delete lifecycle', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('locations/corp-1', { id: 'corp-1', storeNumber: 'HQ', name: 'Corporate Office', type: 'Corporate Office', version: 0, recordStatus: 'Active' });

  await store.commit([
    { collection: 'people', id: 'per-new', operation: 'set', data: { fullName: 'New Employee', jobTitle: 'Accountant', department: 'Finance', workPhone: '2125550100', workPhoneExtension: '42', workEmail: 'employee@example.test', status: 'Active', activeStatus: true, phonePrivacy: 'Internal', primaryLocationId: 'corp-1', supportedLocationIds: [] } },
  ], { action: 'Person Created', entityType: 'Person', entityId: 'per-new', entityName: 'New Employee', details: 'Create full Person.' }, actor);

  assert.equal(records.get('people/per-new')?.version, undefined);
  assert.equal(records.get('people/per-new')?.workPhone, '+12125550100');
  assert.equal(records.get('people/per-new')?.department, 'Finance');

  await store.commit([
    { collection: 'people', id: 'per-new', operation: 'set', expectedVersion: 0, data: { fullName: 'Updated Employee', jobTitle: 'Senior Accountant', department: 'Finance', workPhone: '+12125550100', workPhoneExtension: '84', workEmail: 'updated@example.test', status: 'Active', activeStatus: true, phonePrivacy: 'Restricted', primaryLocationId: 'corp-1', supportedLocationIds: [] } },
  ], { action: 'Person Updated', entityType: 'Person', entityId: 'per-new', entityName: 'New Employee', details: 'Update full Person.' }, actor);

  assert.equal(records.get('people/per-new')?.version, 1);
  assert.equal(records.get('people/per-new')?.fullName, 'Updated Employee');
  assert.equal(records.get('people/per-new')?.workPhoneExtension, '84');

  await store.commit([
    { collection: 'people', id: 'per-new', operation: 'delete', expectedVersion: 1 },
  ], { action: 'Person Deleted', entityType: 'Person', entityId: 'per-new', entityName: 'Updated Employee', details: 'Delete unlinked Person.' }, actor);

  assert.equal(records.has('people/per-new'), false);
  assert.ok([...records.values()].some(record => record.action === 'Person Deleted' && record.entityId === 'per-new'));
});

test('directory commit rejects an unchanged manager reference when its Person is deleted in the same transaction, but allows the reference to be cleared', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('people/p1', { id: 'p1', fullName: 'Active Manager', status: 'Active', version: 0 });
  records.set('locations/l1', { id: 'l1', storeNumber: '01', name: 'Original Name', storeManagerId: 'p1', version: 0, recordStatus: 'Active' });

  const countBefore = records.size;
  await assert.rejects(store.commit([
    { collection: 'people', id: 'p1', operation: 'delete', expectedVersion: 0 },
    { collection: 'locations', id: 'l1', operation: 'set', expectedVersion: 0, data: { storeNumber: '01', name: 'Renamed Name' } },
  ], { action: 'Person Deleted', entityType: 'Person', entityId: 'p1', entityName: 'Active Manager', details: 'Delete manager without reassigning the location.' }, actor), DirectoryValidationError);

  assert.equal(records.size, countBefore);
  assert.ok(records.has('people/p1'));
  assert.equal(records.get('locations/l1')?.name, 'Original Name');
  assert.equal(records.get('locations/l1')?.storeManagerId, 'p1');

  await store.commit([
    { collection: 'people', id: 'p1', operation: 'delete', expectedVersion: 0 },
    { collection: 'locations', id: 'l1', operation: 'set', expectedVersion: 0, data: { storeNumber: '01', name: 'Renamed Name', storeManagerId: '' } },
  ], { action: 'Person Deleted', entityType: 'Person', entityId: 'p1', entityName: 'Active Manager', details: 'Delete manager and clear the location reference.' }, actor);

  assert.ok(!records.has('people/p1'));
  assert.equal(records.get('locations/l1')?.name, 'Renamed Name');
  assert.equal(records.get('locations/l1')?.storeManagerId, '');
});

test('directory commit preserves unrelated legacy hierarchy defects but rejects newly introduced canonical hierarchy', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('locations/loc-legacy', { id: 'loc-legacy', storeNumber: '07', name: 'Legacy Store', type: 'Corporate Office', hierarchyApplicability: 'Applicable', regionId: 'legacy-region', districtId: 'legacy-district', version: 0, recordStatus: 'Active' });

  await store.commit([
    { collection: 'locations', id: 'loc-legacy', operation: 'set', expectedVersion: 0, data: { storeNumber: '07', name: 'Renamed Legacy Store', type: 'Corporate Office', hierarchyApplicability: 'Applicable', regionId: 'legacy-region', districtId: 'legacy-district' } },
  ], { action: 'Location Updated', entityType: 'Location', entityId: 'loc-legacy', entityName: 'Legacy Store', details: 'Rename only.' }, actor);
  assert.equal(records.get('locations/loc-legacy')?.name, 'Renamed Legacy Store');

  await assert.rejects(store.commit([
    { collection: 'locations', id: 'loc-legacy', operation: 'set', expectedVersion: 1, data: { storeNumber: '07', name: 'Renamed Legacy Store', type: 'Corporate Office', hierarchyApplicability: 'Applicable', regionId: 'new-region', districtId: 'legacy-district' } },
  ], { action: 'Location Updated', entityType: 'Location', entityId: 'loc-legacy', entityName: 'Legacy Store', details: 'Change hierarchy.' }, actor), DirectoryValidationError);
  assert.equal(records.get('locations/loc-legacy')?.regionId, 'legacy-region');
});

test('directory commit binds approval to persisted location target and requested changes', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('locations/loc-07', { id: 'loc-07', storeNumber: '07', name: 'Original Store', version: 0, recordStatus: 'Active' });
  records.set('locations/loc-08', { id: 'loc-08', storeNumber: '08', name: 'Other Store', version: 0, recordStatus: 'Active' });
  records.set('requests/req-1', { id: 'req-1', targetType: 'Location', targetId: 'loc-07', status: 'Pending', version: 0, requestedChanges: { name: 'Approved Name' } });

  await assert.rejects(store.commit([
    { collection: 'requests', id: 'req-1', operation: 'set', expectedVersion: 0, data: { targetType: 'Location', targetId: 'loc-07', status: 'Approved', requestedChanges: { name: 'Approved Name' } } },
    { collection: 'locations', id: 'loc-07', operation: 'set', expectedVersion: 0, data: { storeNumber: '07', name: 'Original Store' } },
  ], { action: 'Request Approved', entityType: 'Request', entityId: 'req-1', entityName: 'Name Change', details: 'No-op approval.' }, actor), DirectoryValidationError);

  await assert.rejects(store.commit([
    { collection: 'requests', id: 'req-1', operation: 'set', expectedVersion: 0, data: { targetType: 'Location', targetId: 'loc-08', status: 'Approved', requestedChanges: { name: 'Approved Name' } } },
    { collection: 'locations', id: 'loc-08', operation: 'set', expectedVersion: 0, data: { storeNumber: '08', name: 'Approved Name' } },
  ], { action: 'Request Approved', entityType: 'Request', entityId: 'req-1', entityName: 'Name Change', details: 'Wrong target.' }, actor), DirectoryValidationError);

  await store.commit([
    { collection: 'requests', id: 'req-1', operation: 'set', expectedVersion: 0, data: { targetType: 'Location', targetId: 'loc-07', status: 'Approved', requestedChanges: { name: 'Approved Name' } } },
    { collection: 'locations', id: 'loc-07', operation: 'set', expectedVersion: 0, data: { storeNumber: '07', name: 'Approved Name' } },
  ], { action: 'Request Approved', entityType: 'Request', entityId: 'req-1', entityName: 'Name Change', details: 'Valid approval.' }, actor);

  assert.equal(records.get('requests/req-1')?.status, 'Approved');
  assert.equal(records.get('locations/loc-07')?.name, 'Approved Name');
});

test('directory commit supports person approval and handles linked users when inactivating people', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('people/per-1', { id: 'per-1', fullName: 'Original Person', status: 'Active', version: 0 });
  records.set('users/usr-1', { id: 'usr-1', name: 'Linked User', email: 'linked@example.test', role: 'Viewer', status: 'Active', accessScope: 'Company-wide', personId: 'per-1', version: 0 });
  records.set('requests/req-person', { id: 'req-person', targetType: 'Person', targetId: 'per-1', status: 'Pending', version: 0, requestedChanges: { fullName: 'Approved Person' } });

  await store.commit([
    { collection: 'requests', id: 'req-person', operation: 'set', expectedVersion: 0, data: { targetType: 'Person', targetId: 'per-1', status: 'Approved', requestedChanges: { fullName: 'Approved Person' } } },
    { collection: 'people', id: 'per-1', operation: 'set', expectedVersion: 0, data: { fullName: 'Approved Person', status: 'Active' } },
  ], { action: 'Request Approved', entityType: 'Request', entityId: 'req-person', entityName: 'Person Name', details: 'Approve person update.' }, actor);
  assert.equal(records.get('people/per-1')?.fullName, 'Approved Person');

  await assert.rejects(store.commit([
    { collection: 'people', id: 'per-1', operation: 'set', expectedVersion: 1, data: { fullName: 'Approved Person', status: 'Inactive' } },
  ], { action: 'Person Updated', entityType: 'Person', entityId: 'per-1', entityName: 'Approved Person', details: 'Inactivate person.' }, actor), DirectoryValidationError);

  await store.commit([
    { collection: 'people', id: 'per-1', operation: 'set', expectedVersion: 1, data: { fullName: 'Approved Person', status: 'Inactive' } },
    { collection: 'users', id: 'usr-1', operation: 'set', expectedVersion: 0, data: { name: 'Linked User', email: 'linked@example.test', role: 'Viewer', status: 'Active', accessScope: 'Company-wide', personId: '' } },
  ], { action: 'Person Updated', entityType: 'Person', entityId: 'per-1', entityName: 'Approved Person', details: 'Inactivate person and unlink user.' }, actor);
  assert.equal(records.get('people/per-1')?.status, 'Inactive');
  assert.equal(records.get('users/usr-1')?.personId, '');
});

test('Person employment relationships support ordinary Corporate/DC assignments, omission, explicit clears, and approval', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('locations/corp-1', { id: 'corp-1', storeNumber: 'HQ', name: 'Corporate Office', type: 'Corporate Office', recordStatus: 'Active', version: 0 });
  records.set('locations/dc-1', { id: 'dc-1', storeNumber: 'DC-1', name: 'Distribution Center', type: 'Warehouse / Distribution Center', recordStatus: 'Active', version: 0 });
  records.set('locations/store-1', { id: 'store-1', storeNumber: '01', name: 'Store One', type: 'Mall / Shopping Center', recordStatus: 'Active', version: 0 });
  records.set('people/per-corp', { id: 'per-corp', fullName: 'Corporate Employee', jobTitle: 'Accountant', status: 'Active', version: 0 });

  await store.commit([{ collection: 'people', id: 'per-corp', operation: 'set', expectedVersion: 0, data: { fullName: 'Corporate Employee', jobTitle: 'Accountant', status: 'Active', primaryLocationId: 'corp-1', supportedLocationIds: ['dc-1', 'store-1'] } }], { action: 'Person Updated', entityType: 'Person', entityId: 'per-corp', entityName: 'Corporate Employee', details: 'Set employment relationships.' }, actor);
  assert.equal(records.get('people/per-corp')?.primaryLocationId, 'corp-1');
  assert.deepEqual(records.get('people/per-corp')?.supportedLocationIds, ['dc-1', 'store-1']);
  const firstReload = await store.read();
  assert.equal(firstReload.people.find(person => person.id === 'per-corp')?.primaryLocationId, 'corp-1');
  assert.deepEqual(firstReload.people.find(person => person.id === 'per-corp')?.supportedLocationIds, ['dc-1', 'store-1']);

  await store.commit([{ collection: 'people', id: 'per-corp', operation: 'set', expectedVersion: 1, data: { fullName: 'Renamed Employee', jobTitle: 'Accountant', status: 'Active' } }], { action: 'Person Updated', entityType: 'Person', entityId: 'per-corp', entityName: 'Corporate Employee', details: 'Older client rename.' }, actor);
  assert.equal(records.get('people/per-corp')?.primaryLocationId, 'corp-1');
  assert.deepEqual(records.get('people/per-corp')?.supportedLocationIds, ['dc-1', 'store-1']);
  assert.equal(records.get('people/per-corp')?.version, 2);

  records.set('requests/req-employment', { id: 'req-employment', targetType: 'Person', targetId: 'per-corp', status: 'Pending', version: 0, requestedChanges: { primaryLocationId: null, supportedLocationIds: [] } });
  await store.commit([
    { collection: 'requests', id: 'req-employment', operation: 'set', expectedVersion: 0, data: { targetType: 'Person', targetId: 'per-corp', status: 'Approved', requestedChanges: { primaryLocationId: null, supportedLocationIds: [] } } },
    { collection: 'people', id: 'per-corp', operation: 'set', expectedVersion: 2, data: { fullName: 'Renamed Employee', jobTitle: 'Accountant', status: 'Active', primaryLocationId: null, supportedLocationIds: [] } },
  ], { action: 'Request Approved', entityType: 'Request', entityId: 'req-employment', entityName: 'Employment Relationships', details: 'Clear employment relationships.' }, actor);
  assert.equal(Object.hasOwn(records.get('people/per-corp') || {}, 'primaryLocationId'), false);
  assert.deepEqual(records.get('people/per-corp')?.supportedLocationIds, []);
});

test('Person employment relationships reject duplicate, overlapping, invalid, and stale assignments without mutation', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('locations/corp-1', { id: 'corp-1', storeNumber: 'HQ', name: 'Corporate Office', type: 'Corporate Office', recordStatus: 'Active', version: 0 });
  records.set('locations/retired-1', { id: 'retired-1', storeNumber: '99', name: 'Retired Store', type: 'Mall / Shopping Center', recordStatus: 'Retired', version: 0 });
  records.set('people/per-1', { id: 'per-1', fullName: 'Employee', status: 'Active', version: 3 });
  const original = structuredClone(records.get('people/per-1'));

  const cases = [
    { primaryLocationId: 'corp-1', supportedLocationIds: ['corp-1'] },
    { supportedLocationIds: ['corp-1', 'corp-1'] },
    { primaryLocationId: 'missing-location', supportedLocationIds: [] },
    { primaryLocationId: 'retired-1', supportedLocationIds: [] },
  ];
  for (const relationship of cases) {
    await assert.rejects(store.commit([{ collection: 'people', id: 'per-1', operation: 'set', expectedVersion: 3, data: { fullName: 'Employee', status: 'Active', ...relationship } }], { action: 'Person Updated', entityType: 'Person', entityId: 'per-1', entityName: 'Employee', details: 'Invalid employment relationship.' }, actor), DirectoryValidationError);
    assert.deepEqual(records.get('people/per-1'), original);
  }
  await assert.rejects(store.commit([{ collection: 'people', id: 'per-1', operation: 'set', expectedVersion: 2, data: { fullName: 'Employee', status: 'Active', primaryLocationId: 'corp-1', supportedLocationIds: [] } }], { action: 'Person Updated', entityType: 'Person', entityId: 'per-1', entityName: 'Employee', details: 'Stale employment relationship.' }, actor), DirectoryConflict);
  assert.deepEqual(records.get('people/per-1'), original);
});

test('unrelated Person edits preserve unchanged legacy employment relationship defects', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('people/per-legacy', { id: 'per-legacy', fullName: 'Legacy Employee', status: 'Active', primaryLocationId: 'missing-primary', supportedLocationIds: ['missing-support', 'missing-support'], version: 0 });

  await store.commit([{ collection: 'people', id: 'per-legacy', operation: 'set', expectedVersion: 0, data: { fullName: 'Renamed Legacy Employee', status: 'Active' } }], { action: 'Person Updated', entityType: 'Person', entityId: 'per-legacy', entityName: 'Legacy Employee', details: 'Rename only.' }, actor);

  assert.equal(records.get('people/per-legacy')?.fullName, 'Renamed Legacy Employee');
  assert.equal(records.get('people/per-legacy')?.primaryLocationId, 'missing-primary');
  assert.deepEqual(records.get('people/per-legacy')?.supportedLocationIds, ['missing-support', 'missing-support']);
});

test('Location lifecycle rejects incoming employment references and allows same-transaction reassignment', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('locations/corp-old', { id: 'corp-old', storeNumber: 'HQ-1', name: 'Old Office', type: 'Corporate Office', recordStatus: 'Active', version: 0 });
  records.set('locations/corp-new', { id: 'corp-new', storeNumber: 'HQ-2', name: 'New Office', type: 'Corporate Office', recordStatus: 'Active', version: 0 });
  records.set('people/per-primary', { id: 'per-primary', fullName: 'Primary Employee', status: 'Active', primaryLocationId: 'corp-old', supportedLocationIds: [], version: 0 });
  records.set('people/per-support', { id: 'per-support', fullName: 'Support Employee', status: 'Active', supportedLocationIds: ['corp-old'], version: 0 });

  await assert.rejects(store.commit([{ collection: 'locations', id: 'corp-old', operation: 'set', expectedVersion: 0, data: { storeNumber: 'HQ-1', name: 'Old Office', type: 'Corporate Office', recordStatus: 'Retired' } }], { action: 'Location Retired', entityType: 'Location', entityId: 'corp-old', entityName: 'Old Office', details: 'Retire referenced office.' }, actor), DirectoryValidationError);
  assert.equal(records.get('locations/corp-old')?.recordStatus, 'Active');
  await assert.rejects(store.commit([{ collection: 'locations', id: 'corp-old', operation: 'delete', expectedVersion: 0 }], { action: 'Location Deleted', entityType: 'Location', entityId: 'corp-old', entityName: 'Old Office', details: 'Delete referenced office.' }, actor), DirectoryValidationError);
  assert.equal(records.has('locations/corp-old'), true);

  await store.commit([
    { collection: 'locations', id: 'corp-old', operation: 'set', expectedVersion: 0, data: { storeNumber: 'HQ-1', name: 'Old Office', type: 'Corporate Office', recordStatus: 'Retired' } },
    { collection: 'people', id: 'per-primary', operation: 'set', expectedVersion: 0, data: { fullName: 'Primary Employee', status: 'Active', primaryLocationId: 'corp-new', supportedLocationIds: [] } },
    { collection: 'people', id: 'per-support', operation: 'set', expectedVersion: 0, data: { fullName: 'Support Employee', status: 'Active', primaryLocationId: null, supportedLocationIds: [] } },
  ], { action: 'Location Retired', entityType: 'Location', entityId: 'corp-old', entityName: 'Old Office', details: 'Reassign employees and retire office.' }, actor);
  assert.equal(records.get('locations/corp-old')?.recordStatus, 'Retired');
  assert.equal(records.get('people/per-primary')?.primaryLocationId, 'corp-new');
  assert.deepEqual(records.get('people/per-support')?.supportedLocationIds, []);

  await store.commit([
    { collection: 'locations', id: 'corp-new', operation: 'delete', expectedVersion: 0 },
    { collection: 'people', id: 'per-primary', operation: 'set', expectedVersion: 1, data: { fullName: 'Primary Employee', status: 'Active', primaryLocationId: null, supportedLocationIds: [] } },
  ], { action: 'Location Deleted', entityType: 'Location', entityId: 'corp-new', entityName: 'New Office', details: 'Unlink employee and delete office.' }, actor);
  assert.equal(records.has('locations/corp-new'), false);
  assert.equal(Object.hasOwn(records.get('people/per-primary') || {}, 'primaryLocationId'), false);
});

test('CASE 1 — an unrelated rename on a legacy record must not be blocked by a pre-existing invalid manager reference', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('locations/loc-01', { id: 'loc-01', storeNumber: '01', name: 'Original', version: 0, recordStatus: 'Active', storeManagerId: 'legacy-missing-person' });

  await store.commit([
    { collection: 'locations', id: 'loc-01', operation: 'set', expectedVersion: 0, data: { storeNumber: '01', name: 'Renamed' } },
  ], { action: 'Location Updated', entityType: 'Location', entityId: 'loc-01', entityName: 'Original', details: 'Rename only, manager field omitted.' }, actor);

  assert.equal(records.get('locations/loc-01')?.name, 'Renamed');
  assert.equal(records.get('locations/loc-01')?.storeManagerId, 'legacy-missing-person');
});

test('CASE 2 — approval must validate every persisted requested field against the final proposed target state', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('locations/loc-approve', { id: 'loc-approve', storeNumber: '09', name: 'Original', city: 'Approved City', version: 0, recordStatus: 'Active' });
  records.set('requests/req-approve', { id: 'req-approve', targetType: 'Location', targetId: 'loc-approve', status: 'Pending', version: 0, requestedChanges: { name: 'Requested Name', city: 'Approved City' } });

  const countBefore = records.size;
  await assert.rejects(store.commit([
    { collection: 'requests', id: 'req-approve', operation: 'set', expectedVersion: 0, data: { targetType: 'Location', targetId: 'loc-approve', status: 'Approved', requestedChanges: { name: 'Requested Name', city: 'Approved City' } } },
    { collection: 'locations', id: 'loc-approve', operation: 'set', expectedVersion: 0, data: { storeNumber: '09', name: 'Requested Name', city: 'Wrong City' } },
  ], { action: 'Request Approved', entityType: 'Request', entityId: 'req-approve', entityName: 'Name Change', details: 'Approval paired with an untouched-field mismatch.' }, actor), DirectoryValidationError);

  assert.equal(records.size, countBefore);
  assert.equal(records.get('requests/req-approve')?.status, 'Pending');
  assert.equal(records.get('locations/loc-approve')?.name, 'Original');
  assert.equal(records.get('locations/loc-approve')?.city, 'Approved City');
});

test('directory commit validates canonical location hierarchy against saved Region and District records', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };

  await store.commit([
    { collection: 'regions', id: 'region-west', operation: 'set', expectedVersion: null, data: { name: 'West Region', status: 'Active' } },
    { collection: 'districts', id: 'district-west-1', operation: 'set', expectedVersion: null, data: { name: 'West District 1', regionId: 'region-west', status: 'Active' } },
  ], { action: 'Hierarchy Registry Created', entityType: 'Setting', entityId: 'region-west', entityName: 'West Region', details: 'Created Region and District.' }, actor);

  await store.commit([
    { collection: 'locations', id: 'loc-hierarchy', operation: 'set', data: { storeNumber: '91', name: 'Hierarchy Store', type: 'Street / Standalone Location', hierarchyApplicability: 'Applicable', regionId: 'region-west', districtId: 'district-west-1' } },
  ], { action: 'Location Created', entityType: 'Location', entityId: 'loc-hierarchy', entityName: 'Hierarchy Store', details: 'Assigned controlled hierarchy.' }, actor);
  assert.equal(records.get('locations/loc-hierarchy')?.districtId, 'district-west-1');

  await assert.rejects(store.commit([
    { collection: 'locations', id: 'loc-invalid-hierarchy', operation: 'set', data: { storeNumber: '92', name: 'Invalid Store', type: 'Street / Standalone Location', hierarchyApplicability: 'Applicable', regionId: 'region-west', districtId: 'missing-district' } },
  ], { action: 'Location Created', entityType: 'Location', entityId: 'loc-invalid-hierarchy', entityName: 'Invalid Store', details: 'Invalid hierarchy.' }, actor), DirectoryValidationError);

  await assert.rejects(store.commit([
    { collection: 'districts', id: 'district-west-1', operation: 'set', expectedVersion: 1, data: { name: 'West District 1', regionId: 'region-west', status: 'Retired' } },
  ], { action: 'District Retired', entityType: 'Setting', entityId: 'district-west-1', entityName: 'West District 1', details: 'Attempt retirement.' }, actor), DirectoryValidationError);
  assert.equal(records.get('districts/district-west-1')?.status, 'Active');
});

test('directory commit serializes canonical clears and clears District when Region changes', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('regions/region-west', { id: 'region-west', name: 'West', status: 'Active', version: 0 });
  records.set('regions/region-east', { id: 'region-east', name: 'East', status: 'Active', version: 0 });
  records.set('districts/district-west', { id: 'district-west', name: 'West District', regionId: 'region-west', status: 'Active', version: 0 });
  records.set('districts/district-east', { id: 'district-east', name: 'East District', regionId: 'region-east', status: 'Active', version: 0 });
  records.set('locations/loc-clear', { id: 'loc-clear', storeNumber: '93', name: 'Clearable Store', type: 'Street / Standalone Location', regionId: 'region-west', districtId: 'district-west', regionalManagerId: 'rm-1', hierarchyApplicability: 'Applicable', version: 0 });

  const result = validateMetadataWrites(
    [{ collection: 'locations', id: 'loc-clear', operation: 'set', expectedVersion: 0, data: { storeNumber: '93', name: 'Clearable Store', regionId: 'region-east', districtId: null, regionalManagerId: null, hierarchyApplicability: 'Applicable' } }],
    [records.get('locations/loc-clear')],
    [],
    actor,
    [],
    [records.get('locations/loc-clear')!],
    [],
    { regions: [{ id: 'region-west', name: 'West', status: 'Active' }, { id: 'region-east', name: 'East', status: 'Active' }], districts: [{ id: 'district-west', name: 'West District', regionId: 'region-west', status: 'Active' }, { id: 'district-east', name: 'East District', regionId: 'region-east', status: 'Active' }] },
  );

  assert.equal(Object.hasOwn(result[0].data || {}, 'districtId'), false);
  assert.equal(Object.hasOwn(result[0].data || {}, 'regionalManagerId'), false);
  assert.equal(result[0].data?.regionId, 'region-east');
});

test('registry Add rejects an existing ID without mutation and Update remains version-protected', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('regions/region-west', { id: 'region-west', name: 'West', status: 'Active', version: 1 });

  const original = structuredClone(records.get('regions/region-west'));
  await assert.rejects(store.commit([{ collection: 'regions', id: 'region-west', operation: 'set', expectedVersion: null, data: { name: 'Replacement West', status: 'Retired' } }], { action: 'Region Created', entityType: 'Setting', entityId: 'region-west', entityName: 'Replacement West', details: 'Duplicate Add attempt.' }, actor), DirectoryConflict);
  assert.deepEqual(records.get('regions/region-west'), original);
  assert.equal([...records.keys()].filter(key => key.startsWith('audit_logs/')).length, 0);

  await store.commit([{ collection: 'regions', id: 'region-west', operation: 'set', expectedVersion: 1, data: { name: 'Updated West', status: 'Active' } }], { action: 'Region Updated', entityType: 'Setting', entityId: 'region-west', entityName: 'Updated West', details: 'Intentional update.' }, actor);
  assert.equal(records.get('regions/region-west')?.name, 'Updated West');
  assert.equal(records.get('regions/region-west')?.version, 2);

  await assert.rejects(store.commit([{ collection: 'regions', id: 'region-west', operation: 'set', expectedVersion: 1, data: { name: 'Stale West', status: 'Active' } }], { action: 'Region Updated', entityType: 'Setting', entityId: 'region-west', entityName: 'Stale West', details: 'Stale expected version.' }, actor), DirectoryConflict);
  assert.equal(records.get('regions/region-west')?.name, 'Updated West');
  assert.equal(records.get('regions/region-west')?.version, 2);
});

test('District parent changes validate affected Location final state and allow same-transaction resolution', async () => {
  const { store, records } = databaseFixture();
  const actor: Account = { uid: 'admin-test', email: 'admin@example.test', name: 'Administrator', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  records.set('regions/region-west', { id: 'region-west', name: 'West', status: 'Active', version: 0 });
  records.set('regions/region-east', { id: 'region-east', name: 'East', status: 'Active', version: 0 });
  records.set('districts/district-shared', { id: 'district-shared', name: 'Shared District', regionId: 'region-west', status: 'Active', version: 0 });
  records.set('locations/loc-parent', { id: 'loc-parent', storeNumber: '94', name: 'Parent Store', type: 'Street / Standalone Location', regionId: 'region-west', districtId: 'district-shared', hierarchyApplicability: 'Applicable', version: 0 });

  await assert.rejects(store.commit([{ collection: 'districts', id: 'district-shared', operation: 'set', expectedVersion: 0, data: { name: 'Shared District', regionId: 'region-east', status: 'Active' } }], { action: 'District Updated', entityType: 'Setting', entityId: 'district-shared', entityName: 'Shared District', details: 'Change parent only.' }, actor), DirectoryValidationError);
  assert.equal(records.get('districts/district-shared')?.regionId, 'region-west');

  await store.commit([
    { collection: 'districts', id: 'district-shared', operation: 'set', expectedVersion: 0, data: { name: 'Shared District', regionId: 'region-east', status: 'Active' } },
    { collection: 'locations', id: 'loc-parent', operation: 'set', expectedVersion: 0, data: { storeNumber: '94', name: 'Parent Store', regionId: 'region-east', districtId: 'district-shared', hierarchyApplicability: 'Applicable' } },
  ], { action: 'Hierarchy Reassigned', entityType: 'Setting', entityId: 'district-shared', entityName: 'Shared District', details: 'Change parent and resolve Location in one transaction.' }, actor);
  assert.equal(records.get('districts/district-shared')?.regionId, 'region-east');
  assert.equal(records.get('locations/loc-parent')?.regionId, 'region-east');
});
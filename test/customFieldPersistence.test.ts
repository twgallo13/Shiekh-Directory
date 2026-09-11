import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Firestore } from '@google-cloud/firestore';
import type { Account } from '../server/authAuthority';
import { FirestoreDirectoryStore, DirectoryConflict, DirectoryValidationError } from '../server/firestoreDirectory';
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
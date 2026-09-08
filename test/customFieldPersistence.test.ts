import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Firestore } from '@google-cloud/firestore';
import type { Account } from '../server/authAuthority';
import { FirestoreDirectoryStore, DirectoryConflict } from '../server/firestoreDirectory';
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
  await store.commit([{ collection: 'locations', id: location.id, operation: 'set', data: { storeNumber: '07', name: 'Renamed' } }], { ...audit, entityType: 'Location' }, actor);
  assert.deepEqual((await store.read()).locations[0].customMetadata, location.customMetadata);
  const count = records.size;
  await assert.rejects(store.commit([{ collection: 'locations', id: location.id, operation: 'set', data: { ...location, customMetadata: {} }, expectedCustomMetadata: {} }], audit, actor), DirectoryConflict);
  assert.equal(records.size, count);
  assert.deepEqual(records.get('locations/loc-07')?.customMetadata, location.customMetadata);
});
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { transactionDatabase } from './fixtures/transactionDatabase';

test('periodic operating refresh reads only bounded business collections, not growing histories', async () => {
  const f = transactionDatabase(), reads: string[] = [];
  f.records.set('locations/store', { storeNumber: '007', name: 'Synthetic' });
  f.records.set('audit_logs/audit', { privateHistory: true });
  f.records.set('outbox_logs/outbox', { privateHistory: true });
  const original = f.firestore.collection.bind(f.firestore);
  f.firestore.collection = ((name: string) => { reads.push(name); return original(name); }) as typeof f.firestore.collection;
  const snapshot = await new FirestoreDirectoryStore(f.firestore).readOperatingDirectory();
  assert.deepEqual(reads.sort(), ['districts', 'hours_templates', 'locations', 'people', 'regions']);
  assert.equal(snapshot.locations[0].id, 'store'); assert.equal(snapshot.locations[0].storeNumber, '007');
  assert.ok(Number.isFinite(Date.parse(snapshot.serverNow!)));
  assert.ok(!Object.hasOwn(snapshot, 'auditLogs')); assert.ok(!JSON.stringify(snapshot).includes('privateHistory'));
});

test('operating refresh rejects capacity overflow rather than returning a partial directory', async () => {
  const f = transactionDatabase();
  for (let index = 0; index < 1001; index++) f.records.set(`locations/store-${index}`, { storeNumber: String(index) });
  await assert.rejects(new FirestoreDirectoryStore(f.firestore).readOperatingDirectory(), /capacity exceeded/);
});

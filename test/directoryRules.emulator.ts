import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Firestore } from '@google-cloud/firestore';
import { DIRECTORY_COLLECTIONS } from '../server/firestoreDirectory';
import { TRANSITION_OPERATION_COLLECTION } from '../server/personTransitionOperation';

// Explicit opt-in, outside *.test.ts. Reject nonlocal targets BEFORE SDK setup.
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') {
  throw new Error('Rules acceptance requires the isolated loopback emulator at 127.0.0.1:8089.');
}
const PROJECT = 'demo-directory-transitions';
const collections = [...new Set([...Object.values(DIRECTORY_COLLECTIONS),
  TRANSITION_OPERATION_COLLECTION, 'api_clients', 'api_client_tokens',
  'request_submission_receipts', 'location_import_receipts', 'system',
  'future_collection', 'locations/synthetic/children'])];

test('server-only Directory rules deny client operations regardless of client claims; server SDK remains usable', { timeout: 60_000 }, async () => {
  const env = await initializeTestEnvironment({ projectId: PROJECT,
    firestore: { host: '127.0.0.1', port: 8089,
      rules: await readFile(new URL('../security/directory.firestore.rules', import.meta.url), 'utf8') } });
  const server = new Firestore({ projectId: PROJECT });
  try {
    // Synthetic demo data only. Do not clear/import/export any production database.
    const batch = server.batch();
    for (const collection of collections) batch.set(server.doc(`${collection}/rules-existing`), { synthetic: true, version: 1 });
    await batch.commit();
    const clients = [env.unauthenticatedContext(), env.authenticatedContext('synthetic-staff'),
      env.authenticatedContext('synthetic-admin', { email: 'synthetic@shiekhshoes.org', email_verified: true, role: 'System Administrator', admin: true })];
    let denials = 0;
    for (const client of clients) {
      const db = client.firestore();
      for (const collection of collections) {
        const existing = db.doc(`${collection}/rules-existing`);
        const absent = db.doc(`${collection}/rules-absent`);
        for (const operation of [() => existing.get({ source: 'server' }),
          () => db.collection(collection).limit(1).get({ source: 'server' }),
          () => absent.set({ synthetic: true }), () => existing.update({ version: 2 }), () => existing.delete()]) {
          await assert.rejects(operation(), (error: any) => error?.code === 'permission-denied');
          denials++;
        }
      }
    }
    assert.equal(denials, collections.length * clients.length * 5);
    // Distinct proof: real server SDK bypasses client Rules in the emulator.
    // This is NOT evidence of production IAM or production rule activation.
    for (const collection of collections) {
      const ref = server.doc(`${collection}/rules-existing`);
      assert.equal((await ref.get()).get('version'), 1);
      await ref.update({ version: 2 });
      assert.equal((await ref.get()).get('version'), 2);
    }
  } finally { await env.cleanup(); await server.terminate(); }
});

// Explicit test-only process. Not an app import or production authentication bypass.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { FirestoreDirectoryStore, DIRECTORY_COLLECTIONS } from '../server/firestoreDirectory';
import { createDirectoryDataRouter } from '../server/directoryDataApi';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('Isolated loopback demo emulator required before SDK initialization.');
let input = '';
for await (const chunk of process.stdin) { input += chunk; if (Buffer.byteLength(input) > 8 * 1024 * 1024) throw new Error('Synthetic seed exceeds test capacity.'); }
const seed = JSON.parse(input), db = new Firestore({ projectId: 'demo-directory-transitions', databaseId: `browser-${randomUUID()}` });
const actor: any = { uid: 'synthetic-uid', name: 'Synthetic User', email: null, emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'test' };
const batch = db.batch();
for (const [field, collection] of Object.entries(DIRECTORY_COLLECTIONS)) for (const row of seed[field] || []) batch.create(db.collection(collection).doc(row.id), row);
batch.create(db.doc('users/synthetic-admin'), { firebaseUid: actor.uid, role: actor.role, status: actor.status, accessScope: actor.accessScope }); await batch.commit();
process.env.PERSON_TRANSITION_REVIEW_KEYRING = JSON.stringify({ activeKeyId: 'synthetic', keys: [{ id: 'synthetic', secret: Buffer.alloc(32, 0x79).toString('base64url') }] });
process.env.PERSON_TRANSITION_COMMANDS_ENABLED = 'true'; process.env.PERSON_TRANSITION_RECOVERY_ENABLED = 'true';
const store = new FirestoreDirectoryStore(db), app = express();
app.use('/api/directory', createDirectoryDataRouter(async token => { if (token !== 'synthetic-token') throw new Error('Synthetic token required.'); return actor; }, store));
app.get('/api/auth/bootstrap', async (_request, response) => response.json(await store.read()));
app.get('/__synthetic_result', async (_request, response) => {
  const person = (await db.doc('people/person-profile').get()).data()!, district = (await db.doc('districts/north').get()).data()!;
  const locations = await db.collection('locations').get();
  response.json({ positionIds: person.positionIds, version: person.version, districtManagerId: district.districtManagerId,
    locations: locations.docs.map(doc => ({ id: doc.id, districtManagerId: doc.data().districtManagerId, storeManagerId: doc.data().storeManagerId ?? null, recordStatus: doc.data().recordStatus })), auditCount: (await db.collection('audit_logs').get()).size });
});
const server = app.listen(0, '127.0.0.1', () => process.stdout.write(`http://127.0.0.1:${(server.address() as any).port}\n`));
process.on('SIGTERM', () => { server.closeAllConnections(); server.close(() => { void db.terminate().finally(() => process.exit()); }); });

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';

const TEST_PORT = 3098;
const baseUrl = `http://localhost:${TEST_PORT}`;

describe('Closures API', () => {
  let app: FirebaseApp;
  let auth: ReturnType<typeof getAuth>;
  let db: ReturnType<typeof getFirestore>;
  let adminToken: string;
  let testLocationId: string;

  before(async () => {
    app = initializeApp({
      apiKey: 'fake-api-key',
      projectId: 'demo-shiekh',
    }, `test-closures-${Date.now()}`);
    
    auth = getAuth(app);
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    
    db = getFirestore(app);
    connectFirestoreEmulator(db, 'localhost', 8080);

    // Create admin user
    const adminUserRef = doc(db, 'users', 'closures-admin-user');
    await setDoc(adminUserRef, {
      email: 'closures-admin@test.com',
      displayName: 'Closures Admin',
      role: 'Admin',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
      version: 1,
    });

    // Create test location
    testLocationId = `closures-test-loc-${Date.now()}`;
    const locationRef = doc(db, 'locations', testLocationId);
    await setDoc(locationRef, {
      storeNumber: '999',
      name: 'Closures Test Store',
      kind: 'store',
      lifecycle: 'active',
      address: {
        street: '123 Test St',
        city: 'Test City',
        state: 'CA',
        zip: '90210',
        country: 'US',
      },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+15551234567',
      phonePublic: true,
      regionId: 'reg-test',
      districtId: 'dist-test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
      version: 1,
    });

    // Sign in
    const userCred = await signInWithEmailAndPassword(auth, 'closures-admin@test.com', 'password123');
    adminToken = await userCred.user.getIdToken();
  });

  after(async () => {
    // Cleanup
    try {
      await deleteDoc(doc(db, 'users', 'closures-admin-user'));
      await deleteDoc(doc(db, 'locations', testLocationId));
    } catch {
      // Ignore cleanup errors
    }
    await deleteApp(app);
  });

  describe('POST /api/app/edit/locations/:id/closures', () => {
    it('creates a same-day closure with reason code', async () => {
      const response = await fetch(`${baseUrl}/api/app/edit/locations/${testLocationId}/closures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          reason: 'AC failure',
          reasonCode: 'ac_hvac',
          type: 'same_day',
        }),
      });

      assert.strictEqual(response.status, 200);
      const { data } = await response.json();
      assert.ok(data.id);
      assert.strictEqual(data.reason, 'AC failure');
      assert.strictEqual(data.reasonCode, 'ac_hvac');
      assert.strictEqual(data.type, 'same_day');
      assert.strictEqual(data.status, 'active');
      assert.ok(data.endsAt, 'Same-day closure should have endsAt set to local midnight');
    });

    it('requires note for "other" reason code', async () => {
      const response = await fetch(`${baseUrl}/api/app/edit/locations/${testLocationId}/closures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          reason: 'Something else',
          reasonCode: 'other',
        }),
      });

      assert.strictEqual(response.status, 400);
      const { error } = await response.json();
      assert.strictEqual(error.code, 'note_required');
    });

    it('accepts "other" reason code with note', async () => {
      const response = await fetch(`${baseUrl}/api/app/edit/locations/${testLocationId}/closures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          reason: 'Something else',
          reasonCode: 'other',
          reasonNote: 'Detailed explanation for other closure',
        }),
      });

      assert.strictEqual(response.status, 200);
      const { data } = await response.json();
      assert.strictEqual(data.reasonCode, 'other');
      assert.strictEqual(data.reasonNote, 'Detailed explanation for other closure');
    });

    it('requires next review date for unknown_end closures', async () => {
      const response = await fetch(`${baseUrl}/api/app/edit/locations/${testLocationId}/closures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          reason: 'Long-term renovation',
          type: 'unknown_end',
        }),
      });

      assert.strictEqual(response.status, 400);
      const { error } = await response.json();
      assert.strictEqual(error.code, 'review_date_required');
    });
  });

  describe('POST /api/app/edit/locations/:locationId/closures/:closureId/renew', () => {
    it('renews a same-day closure', async () => {
      // Create a closure first
      const createResp = await fetch(`${baseUrl}/api/app/edit/locations/${testLocationId}/closures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          reason: 'Staffing issue',
          reasonCode: 'staffing',
          type: 'same_day',
        }),
      });
      const { data: created } = await createResp.json();

      // Renew it
      const renewResp = await fetch(`${baseUrl}/api/app/edit/locations/${testLocationId}/closures/${created.id}/renew`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(renewResp.status, 200);
      const { data } = await renewResp.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.newEndsAt);
    });
  });
});

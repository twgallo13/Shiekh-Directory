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

describe('Corrections API - New Features', () => {
  let app: FirebaseApp;
  let auth: ReturnType<typeof getAuth>;
  let db: ReturnType<typeof getFirestore>;
  let viewerToken: string;
  let adminToken: string;
  let testLocationId: string;

  before(async () => {
    app = initializeApp({
      apiKey: 'fake-api-key',
      projectId: 'demo-shiekh',
    }, `test-corrections-new-${Date.now()}`);
    
    auth = getAuth(app);
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    
    db = getFirestore(app);
    connectFirestoreEmulator(db, 'localhost', 8080);

    // Create viewer user (any signed-in user should be able to report problems)
    const viewerUserRef = doc(db, 'users', 'corrections-viewer-user');
    await setDoc(viewerUserRef, {
      email: 'corrections-viewer@test.com',
      displayName: 'Viewer User',
      role: 'Viewer',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
      version: 1,
    });

    // Create admin user
    const adminUserRef = doc(db, 'users', 'corrections-admin-user');
    await setDoc(adminUserRef, {
      email: 'corrections-admin@test.com',
      displayName: 'Admin User',
      role: 'Admin',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
      version: 1,
    });

    // Create test location
    testLocationId = `corrections-test-loc-${Date.now()}`;
    const locationRef = doc(db, 'locations', testLocationId);
    await setDoc(locationRef, {
      storeNumber: '888',
      name: 'Corrections Test Store',
      kind: 'store',
      lifecycle: 'active',
      address: {
        street: '456 Test Ave',
        city: 'Test City',
        state: 'CA',
        zip: '90211',
        country: 'US',
      },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+15559876543',
      phonePublic: true,
      regionId: 'reg-test',
      districtId: 'dist-test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
      version: 1,
    });

    // Sign in as both users
    const viewerCred = await signInWithEmailAndPassword(auth, 'corrections-viewer@test.com', 'password123');
    viewerToken = await viewerCred.user.getIdToken();
    
    const adminCred = await signInWithEmailAndPassword(auth, 'corrections-admin@test.com', 'password123');
    adminToken = await adminCred.user.getIdToken();
  });

  after(async () => {
    try {
      await deleteDoc(doc(db, 'users', 'corrections-viewer-user'));
      await deleteDoc(doc(db, 'users', 'corrections-admin-user'));
      await deleteDoc(doc(db, 'locations', testLocationId));
    } catch {
      // Ignore cleanup errors
    }
    await deleteApp(app);
  });

  describe('POST /api/app/corrections (Report a Problem)', () => {
    it('allows Viewer to submit a correction request', async () => {
      const response = await fetch(`${baseUrl}/api/app/corrections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${viewerToken}`,
        },
        body: JSON.stringify({
          locationId: testLocationId,
          category: 'phone',
          proposedNote: 'The phone number is wrong',
        }),
      });

      assert.strictEqual(response.status, 201);
      const { data } = await response.json();
      assert.ok(data.id);
      assert.strictEqual(data.category, 'phone');
      assert.strictEqual(data.status, 'pending');
      assert.strictEqual(data.proposedNote, 'The phone number is wrong');
    });

    it('requires category', async () => {
      const response = await fetch(`${baseUrl}/api/app/corrections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${viewerToken}`,
        },
        body: JSON.stringify({
          locationId: testLocationId,
        }),
      });

      assert.strictEqual(response.status, 400);
      const { error } = await response.json();
      assert.strictEqual(error.code, 'category_required');
    });

    it('validates category values', async () => {
      const response = await fetch(`${baseUrl}/api/app/corrections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${viewerToken}`,
        },
        body: JSON.stringify({
          locationId: testLocationId,
          category: 'invalid-category',
        }),
      });

      assert.strictEqual(response.status, 400);
      const { error } = await response.json();
      assert.strictEqual(error.code, 'invalid_category');
    });

    it('supports all valid categories', async () => {
      const categories = ['address', 'suite', 'directions', 'phone', 'hours', 'manager', 'other'];
      
      for (const category of categories) {
        const response = await fetch(`${baseUrl}/api/app/corrections`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${viewerToken}`,
          },
          body: JSON.stringify({
            locationId: testLocationId,
            category,
          }),
        });

        assert.strictEqual(response.status, 201, `Category ${category} should be valid`);
      }
    });
  });

  describe('POST /api/app/corrections/:id/cancel', () => {
    it('allows user to cancel their own pending request', async () => {
      // Create a request
      const createResp = await fetch(`${baseUrl}/api/app/corrections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${viewerToken}`,
        },
        body: JSON.stringify({
          locationId: testLocationId,
          category: 'address',
        }),
      });
      const { data: created } = await createResp.json();

      // Cancel it
      const cancelResp = await fetch(`${baseUrl}/api/app/corrections/${created.id}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${viewerToken}`,
        },
      });

      assert.strictEqual(cancelResp.status, 200);
      const { data } = await cancelResp.json();
      assert.strictEqual(data.success, true);
    });

    it('prevents canceling someone else\'s request', async () => {
      // Create a request as viewer
      const createResp = await fetch(`${baseUrl}/api/app/corrections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${viewerToken}`,
        },
        body: JSON.stringify({
          locationId: testLocationId,
          category: 'hours',
        }),
      });
      const { data: created } = await createResp.json();

      // Try to cancel as admin
      const cancelResp = await fetch(`${baseUrl}/api/app/corrections/${created.id}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      assert.strictEqual(cancelResp.status, 403);
      const { error } = await cancelResp.json();
      assert.strictEqual(error.code, 'forbidden');
    });
  });

  describe('GET /api/app/corrections?myRequests=true', () => {
    it('returns only the user\'s own requests', async () => {
      const response = await fetch(`${baseUrl}/api/app/corrections?status=pending&myRequests=true`, {
        headers: {
          Authorization: `Bearer ${viewerToken}`,
        },
      });

      assert.strictEqual(response.status, 200);
      const { data } = await response.json();
      assert.ok(Array.isArray(data));
      // All returned requests should be from the viewer
      for (const correction of data) {
        assert.strictEqual(correction.submittedByEmail, 'corrections-viewer@test.com');
      }
    });
  });
});

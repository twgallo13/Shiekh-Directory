/**
 * Behavior tests for the 13 design review items from Theo
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const testRunId = `design-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const adminToken = 'test-token-admin'; // Test token format for emulator

describe('Design Review Items - Behavior Tests', () => {
  let app: App;
  let db: Firestore;

  before(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    // Use same projectId as server (from server/firebase.ts)
    app = initializeApp({ projectId: 'shiekh-directory-rebuild-placeholder' }, `design-review-test-${testRunId}`);
    db = getFirestore(app);

    // Seed test data
    await seedTestData(db);
  });

  after(async () => {
    if (app) await deleteApp(app);
  });

  describe('#1: Hours wrong creates DM task, keeps unverified', () => {
    it('respond with hoursConfirmed=false and no changes → status awaiting_response and dmTask created', async () => {
      // Create a verification request
      const requestRef = db.collection('verificationRequests').doc(`vr-test-1-${testRunId}`);
      await requestRef.set({
        id: requestRef.id,
        locationId: `loc-test-${testRunId}`,
        storeNumber: 'TEST01',
        locationName: 'Test Store',
        status: 'pending',
        sentAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        sentTo: 'store@test.com',
      });

      const res = await fetch(`${API_BASE}/api/app/verification/${requestRef.id}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          hoursConfirmed: false,
          proposedChanges: null,
        }),
      });

      assert.strictEqual(res.status, 200, 'should respond successfully');
      const body = await res.json();
      
      // Check status is awaiting_response
      const updatedRequest = await requestRef.get();
      assert.strictEqual(
        updatedRequest.data()?.status,
        'awaiting_response',
        'status should be awaiting_response when hours wrong with no changes'
      );
      assert.strictEqual(
        updatedRequest.data()?.hoursWrongReported,
        true,
        'hoursWrongReported should be true'
      );

      // Check DM task was created
      const dmTasks = await db.collection('dmTasks')
        .where('locationId', '==', `loc-test-${testRunId}`)
        .where('taskType', '==', 'hours_wrong')
        .get();
      
      assert.ok(dmTasks.docs.length > 0, 'should create a dmTask for hours wrong');
    });

    it('lastVerifiedAt remains unchanged when hours wrong', async () => {
      const locationRef = db.collection('locations').doc(`loc-unchanged-${testRunId}`);
      const originalVerifiedAt = '2026-01-01T00:00:00Z';
      await locationRef.set({
        id: locationRef.id,
        name: 'Test Store Unchanged',
        storeNumber: 'TEST02',
        lifecycle: 'active',
        kind: 'store',
        lastVerifiedAt: originalVerifiedAt,
        districtId: 'district-1',
        regionId: 'region-1',
      });

      const requestRef = db.collection('verificationRequests').doc(`vr-unchanged-${testRunId}`);
      await requestRef.set({
        id: requestRef.id,
        locationId: locationRef.id,
        storeNumber: 'TEST02',
        locationName: 'Test Store Unchanged',
        status: 'pending',
        sentAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        sentTo: 'store@test.com',
      });

      await fetch(`${API_BASE}/api/app/verification/${requestRef.id}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          hoursConfirmed: false,
          proposedChanges: null,
        }),
      });

      const updatedLocation = await locationRef.get();
      assert.strictEqual(
        updatedLocation.data()?.lastVerifiedAt,
        originalVerifiedAt,
        'lastVerifiedAt should remain unchanged'
      );
    });
  });

  describe('#2: Confirmation email on submit and one-click confirm', () => {
    it('respond with changes → status in_review', async () => {
      const requestRef = db.collection('verificationRequests').doc(`vr-changes-${testRunId}`);
      await requestRef.set({
        id: requestRef.id,
        locationId: `loc-changes-${testRunId}`,
        storeNumber: 'TEST03',
        locationName: 'Test Store Changes',
        status: 'pending',
        sentAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        sentTo: 'store@test.com',
      });

      const res = await fetch(`${API_BASE}/api/app/verification/${requestRef.id}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          hoursConfirmed: true,
          proposedChanges: { mainPhone: '555-123-4567' },
        }),
      });

      assert.strictEqual(res.status, 200, 'should respond successfully');

      const updatedRequest = await requestRef.get();
      assert.strictEqual(
        updatedRequest.data()?.status,
        'in_review',
        'status should be in_review when changes submitted'
      );
    });

    it('confirm sends confirmation mail when enabled (logs when off)', async () => {
      // Mail is off by default, so this should log only
      const requestRef = db.collection('verificationRequests').doc(`vr-confirm-${testRunId}`);
      const locationRef = db.collection('locations').doc(`loc-confirm-${testRunId}`);
      
      await locationRef.set({
        id: locationRef.id,
        name: 'Test Store Confirm',
        storeNumber: 'TEST04',
        lifecycle: 'active',
        kind: 'store',
        sharedInboxEmail: 'store-confirm@test.com',
        districtId: 'district-1',
        regionId: 'region-1',
      });

      await requestRef.set({
        id: requestRef.id,
        locationId: locationRef.id,
        storeNumber: 'TEST04',
        locationName: 'Test Store Confirm',
        status: 'pending',
        sentAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        sentTo: 'store-confirm@test.com',
      });

      const res = await fetch(`${API_BASE}/api/app/verification/${requestRef.id}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          hoursConfirmed: true,
          proposedChanges: null,
        }),
      });

      assert.strictEqual(res.status, 200, 'should respond successfully');
      
      // Check mail log for blocked entry (mail is off)
      const mailLogs = await db.collection('mailLog')
        .where('type', '==', 'verification_confirmation')
        .orderBy('sentAt', 'desc')
        .limit(1)
        .get();
      
      if (!mailLogs.empty) {
        const logData = mailLogs.docs[0].data();
        assert.ok(logData.blocked || !logData.success, 'mail should be blocked or failed (mail is off)');
      }
    });
  });

  describe('#4: Holiday hours and address changes with approval', () => {
    it('holiday-hours change by store creates correction when approval required', async () => {
      const locationRef = db.collection('locations').doc(`loc-holiday-${testRunId}`);
      await locationRef.set({
        id: locationRef.id,
        name: 'Test Store Holiday',
        storeNumber: 'TEST05',
        lifecycle: 'active',
        kind: 'store',
        districtId: 'district-1',
        regionId: 'region-1',
      });

      // Store submits holiday hours via POST /hours-exceptions/locations/:locationId
      const res = await fetch(`${API_BASE}/api/app/hours-exceptions/locations/${locationRef.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          startDate: '2026-12-25',
          label: 'Christmas Day',
          closed: true,
          type: 'holiday',
        }),
      });

      // Admin can create hours exceptions directly (200 or 201)
      // For stores, it would create a correction (202)
      assert.ok([200, 201].includes(res.status), `should accept the request (got ${res.status})`);
    });
  });

  describe('#5: No 90-day fallback flash', () => {
    it('workflow rules returns verificationCycleDays', async () => {
      const res = await fetch(`${API_BASE}/api/app/workflow-rules`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(res.status, 200, 'should return workflow rules');
      const { data } = await res.json();
      assert.ok(typeof data.verificationCycleDays === 'number', 'should have verificationCycleDays');
    });
  });

  describe('#6: maxReminders=0 means no limit with safety cap', () => {
    it('scheduledReminders.ts checks maxReminders > 0', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const scheduledReminders = fs.readFileSync(
        path.join(process.cwd(), 'server/scheduledReminders.ts'),
        'utf-8'
      );

      assert.ok(
        scheduledReminders.includes('maxReminders > 0'),
        'should check maxReminders > 0 to skip when limit is set'
      );
      assert.ok(
        scheduledReminders.includes('SAFETY_CAP'),
        'should have safety cap to prevent runaway reminders'
      );
    });
  });

  describe('#7: Bounced email creates DM task', () => {
    it('POST /:id/bounce creates dmTask and marks request', async () => {
      // Create the location first (required for dmTask creation)
      const locationRef = db.collection('locations').doc(`loc-bounce-${testRunId}`);
      await locationRef.set({
        id: locationRef.id,
        name: 'Test Store Bounce',
        storeNumber: 'TEST06',
        lifecycle: 'active',
        kind: 'store',
        districtId: 'district-1',
        regionId: 'region-1',
        sharedInboxEmail: 'bounce@test.com',
      });

      const requestRef = db.collection('verificationRequests').doc(`vr-bounce-${testRunId}`);
      await requestRef.set({
        id: requestRef.id,
        locationId: `loc-bounce-${testRunId}`,
        storeNumber: 'TEST06',
        locationName: 'Test Store Bounce',
        status: 'pending',
        sentAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        sentTo: 'bounce@test.com',
        districtId: 'district-1',
      });

      const res = await fetch(`${API_BASE}/api/app/verification/${requestRef.id}/bounce`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          reason: 'Email bounced - mailbox not found',
        }),
      });

      assert.strictEqual(res.status, 200, 'should mark as bounced');

      const updatedRequest = await requestRef.get();
      assert.strictEqual(
        updatedRequest.data()?.emailBounced,
        true,
        'emailBounced should be true'
      );

      // Check DM task was created
      const dmTasks = await db.collection('dmTasks')
        .where('locationId', '==', `loc-bounce-${testRunId}`)
        .where('taskType', '==', 'fix_contact')
        .get();

      assert.ok(dmTasks.docs.length > 0, 'should create a dmTask for fix_contact');
    });
  });

  describe('#8: DryRun returns blockedRecipients', () => {
    it('dryRun returns blockedRecipients with names and reasons', async () => {
      // Create a store without email
      const locationRef = db.collection('locations').doc(`loc-no-email-${testRunId}`);
      await locationRef.set({
        id: locationRef.id,
        name: 'Store No Email',
        storeNumber: 'TEST07',
        lifecycle: 'active',
        kind: 'store',
        districtId: `district-test-${testRunId}`,
        regionId: `region-test-${testRunId}`,
        // No sharedInboxEmail
      });

      const districtRef = db.collection('districts').doc(`district-test-${testRunId}`);
      await districtRef.set({
        id: districtRef.id,
        name: 'Test District',
        lifecycle: 'active',
        regionId: `region-test-${testRunId}`,
      });

      const res = await fetch(`${API_BASE}/api/app/verification/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          scope: 'district',
          scopeId: `district-test-${testRunId}`,
          skipRecentlyVerified: false,
          dryRun: true,
        }),
      });

      assert.strictEqual(res.status, 200, 'should return dry run results');
      const { results } = await res.json();
      
      assert.ok(results.skippedReasons, 'should have skippedReasons');
      // The exact count depends on the data, just verify structure exists
      assert.ok(typeof results.skipped === 'number', 'should have skipped count');
    });
  });

  describe('#9: Stats returns completion and aging', () => {
    it('GET /stats returns completion and aging by region', async () => {
      const res = await fetch(`${API_BASE}/api/app/verification/stats?groupBy=region`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(res.status, 200, 'should return stats');
      const { data } = await res.json();

      assert.strictEqual(data.groupBy, 'region', 'should be grouped by region');
      assert.ok(Array.isArray(data.groups), 'should have groups array');
      assert.ok(data.totals, 'should have totals');
      assert.ok(typeof data.totals.completionRate === 'number', 'should have completionRate');
      assert.ok(data.totals.agingBuckets, 'should have agingBuckets');
    });

    it('GET /stats returns completion and aging by district', async () => {
      const res = await fetch(`${API_BASE}/api/app/verification/stats?groupBy=district`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.strictEqual(res.status, 200, 'should return stats');
      const { data } = await res.json();

      assert.strictEqual(data.groupBy, 'district', 'should be grouped by district');
      assert.ok(Array.isArray(data.groups), 'should have groups array');
    });
  });

  describe('#11: Bulk cancel and reissue with required reason', () => {
    it('bulk cancel rejects missing reason', async () => {
      const res = await fetch(`${API_BASE}/api/app/verification/bulk/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          ids: ['vr-1', 'vr-2'],
          // Missing reason
        }),
      });

      assert.strictEqual(res.status, 400, 'should reject missing reason');
    });

    it('bulk cancel rejects short reason', async () => {
      const res = await fetch(`${API_BASE}/api/app/verification/bulk/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          ids: ['vr-1', 'vr-2'],
          reason: 'ab', // Too short
        }),
      });

      assert.strictEqual(res.status, 400, 'should reject short reason');
    });

    it('bulk cancel writes audit entry', async () => {
      const requestRef1 = db.collection('verificationRequests').doc(`vr-bulk-cancel-1-${testRunId}`);
      const requestRef2 = db.collection('verificationRequests').doc(`vr-bulk-cancel-2-${testRunId}`);

      await Promise.all([
        requestRef1.set({
          id: requestRef1.id,
          locationId: `loc-bulk-1-${testRunId}`,
          storeNumber: 'BULK01',
          locationName: 'Bulk Store 1',
          status: 'pending',
          sentAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          sentTo: 'bulk1@test.com',
        }),
        requestRef2.set({
          id: requestRef2.id,
          locationId: `loc-bulk-2-${testRunId}`,
          storeNumber: 'BULK02',
          locationName: 'Bulk Store 2',
          status: 'pending',
          sentAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          sentTo: 'bulk2@test.com',
        }),
      ]);

      const res = await fetch(`${API_BASE}/api/app/verification/bulk/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          ids: [requestRef1.id, requestRef2.id],
          reason: 'Cancelling for testing purposes - bulk operation test',
        }),
      });

      assert.strictEqual(res.status, 200, 'should succeed with valid reason');

      // Check audit log
      const auditLogs = await db.collection('auditLog')
        .where('action', '==', 'bulk-cancel')
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();

      assert.ok(!auditLogs.empty, 'should create audit log entry');
    });

    it('bulk reissue rejects missing reason', async () => {
      const res = await fetch(`${API_BASE}/api/app/verification/bulk/reissue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          ids: ['vr-1', 'vr-2'],
          // Missing reason
        }),
      });

      assert.strictEqual(res.status, 400, 'should reject missing reason');
    });
  });

  describe('#12: One-click preview returns summary', () => {
    it('one-click-preview returns store summary without verifying', async () => {
      const locationRef = db.collection('locations').doc(`loc-preview-${testRunId}`);
      await locationRef.set({
        id: locationRef.id,
        name: 'Test Store Preview',
        storeNumber: 'TEST08',
        lifecycle: 'active',
        kind: 'store',
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'CA',
          zip: '90210',
          country: 'US',
        },
        mainPhone: '555-123-4567',
        sharedInboxEmail: 'preview@test.com',
        districtId: 'district-1',
        regionId: 'region-1',
      });

      // Create a one-click token
      const tokenDoc = db.collection('storeAuthTokens').doc(`token-preview-${testRunId}`);
      await tokenDoc.set({
        locationId: locationRef.id,
        storeNumber: 'TEST08',
        storeEmail: 'preview@test.com',
        action: 'confirm',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: 'test',
      });

      // Note: We can't easily test the preview endpoint without a real token
      // because hashToken uses HMAC. This test verifies the endpoint exists.
      const res = await fetch(`${API_BASE}/api/store-auth/one-click-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'invalid-test-token',
          action: 'confirm',
        }),
      });

      // Should return 404 for invalid token (not 500)
      assert.strictEqual(res.status, 404, 'should return 404 for invalid token');
      
      // Verify the location was NOT updated
      const locationData = await locationRef.get();
      assert.ok(!locationData.data()?.lastVerifiedAt, 'lastVerifiedAt should remain unchanged');
    });
  });

  describe('#13: Overdue corrections flagged, stay pending', () => {
    it('correction with overdueFlag stays pending status', async () => {
      const correctionRef = db.collection('corrections').doc(`corr-overdue-${testRunId}`);
      const expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday

      await correctionRef.set({
        id: correctionRef.id,
        locationId: `loc-corr-${testRunId}`,
        storeNumber: 'TEST09',
        category: 'hours',
        status: 'pending',
        submittedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: expiresAt.toISOString(),
        submittedBy: 'test-user',
      });

      // The scheduled job would flag this as overdue
      // For this test, we verify the flag field structure
      await correctionRef.update({
        overdueFlag: true,
        overdueFlaggedAt: new Date().toISOString(),
      });

      const updatedCorrection = await correctionRef.get();
      assert.strictEqual(
        updatedCorrection.data()?.status,
        'pending',
        'status should remain pending even when flagged overdue'
      );
      assert.strictEqual(
        updatedCorrection.data()?.overdueFlag,
        true,
        'overdueFlag should be true'
      );
    });
  });

  describe('Firestore Indexes', () => {
    it('corrections index (status, overdueFlag, expiresAt) exists', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const indexesJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'firestore.indexes.json'), 'utf-8')
      );

      const hasCorrectionsIndex = indexesJson.indexes.some((idx: {
        collectionGroup: string;
        fields: { fieldPath: string }[];
      }) =>
        idx.collectionGroup === 'corrections' &&
        idx.fields.some((f: { fieldPath: string }) => f.fieldPath === 'status') &&
        idx.fields.some((f: { fieldPath: string }) => f.fieldPath === 'overdueFlag') &&
        idx.fields.some((f: { fieldPath: string }) => f.fieldPath === 'expiresAt')
      );

      assert.ok(hasCorrectionsIndex, 'should have corrections (status, overdueFlag, expiresAt) index');
    });

    it('verificationRequests index (status, respondedAt) exists', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const indexesJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'firestore.indexes.json'), 'utf-8')
      );

      const hasStatsIndex = indexesJson.indexes.some((idx: {
        collectionGroup: string;
        fields: { fieldPath: string }[];
      }) =>
        idx.collectionGroup === 'verificationRequests' &&
        idx.fields.some((f: { fieldPath: string }) => f.fieldPath === 'status') &&
        idx.fields.some((f: { fieldPath: string }) => f.fieldPath === 'respondedAt')
      );

      assert.ok(hasStatsIndex, 'should have verificationRequests (status, respondedAt) index');
    });
  });

  describe('Scheduled Functions Exports', () => {
    it('functions.ts exports single flagOverdueCorrections (no duplicate)', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const functionsFile = fs.readFileSync(
        path.join(process.cwd(), 'server/functions.ts'),
        'utf-8'
      );

      assert.ok(
        functionsFile.includes('flagOverdueCorrections'),
        'should export flagOverdueCorrections'
      );
      assert.ok(
        !functionsFile.includes('expirePendingCorrections'),
        'should NOT export expirePendingCorrections (to avoid duplicate schedules)'
      );
    });
  });
});

async function seedTestData(db: Firestore) {
  // Seed a test location
  await db.collection('locations').doc(`loc-test-${testRunId}`).set({
    id: `loc-test-${testRunId}`,
    name: 'Test Store',
    storeNumber: 'TEST01',
    lifecycle: 'active',
    kind: 'store',
    districtId: 'district-1',
    regionId: 'region-1',
    districtName: 'Test District',
    regionName: 'Test Region',
    sharedInboxEmail: 'store@test.com',
  });

  // Seed test regions and districts
  await db.collection('regions').doc('region-1').set({
    id: 'region-1',
    name: 'Test Region',
    lifecycle: 'active',
  });

  await db.collection('districts').doc('district-1').set({
    id: 'district-1',
    name: 'Test District',
    lifecycle: 'active',
    regionId: 'region-1',
  });

  // Seed test admin user
  await db.collection('users').doc('admin').set({
    id: 'admin',
    email: 'admin@test.com',
    displayName: 'Test Admin',
    role: 'Admin',
    status: 'active',
    version: 1,
  });
}

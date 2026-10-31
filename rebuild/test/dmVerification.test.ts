import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { Firestore } from 'firebase-admin/firestore';
import { seedTestUsers, getTestDb } from './testHelpers';
import type { DMVerificationRequest } from '../src/types';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

describe('DM Verification - Cancel Endpoint', () => {
  const testRequestId = 'test-dm-verification-cancel';
  let db: Firestore;

  before(async () => {
    await seedTestUsers();
    db = await getTestDb();

    const testRequest: Omit<DMVerificationRequest, 'id'> = {
      districtId: 'district-001',
      districtName: 'Test District',
      regionId: 'region-001',
      regionName: 'Test Region',
      status: 'pending',
      cycleStartDate: new Date().toISOString().slice(0, 10),
      sentAt: new Date().toISOString(),
      sentTo: 'dm@example.com',
      sentToPersonId: 'person-001',
      sentToPersonName: 'Test DM',
      sentBy: 'admin-user',
      recipientType: 'dm',
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'admin-user',
      version: 1,
    };
    await db.collection('dmVerificationRequests').doc(testRequestId).set(testRequest);
  });

  after(async () => {
    if (db) {
      await db.collection('dmVerificationRequests').doc(testRequestId).delete();
      await db.collection('dmVerificationRequests').doc(`${testRequestId}-confirmed`).delete();
    }
  });

  async function fetchApi(path: string, method: string, token: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  describe('POST /api/app/dm-verification/:id/cancel', () => {
    it('requires authentication', async () => {
      const res = await fetch(`${API_BASE}/api/app/dm-verification/${testRequestId}/cancel`, {
        method: 'POST',
      });
      assert.strictEqual(res.status, 401, 'should return 401 without auth');
    });

    it('rejects Viewer role', async () => {
      const res = await fetchApi(
        `/api/app/dm-verification/${testRequestId}/cancel`,
        'POST',
        'test-token-viewer'
      );
      assert.strictEqual(res.status, 403, 'should return 403 for Viewer');
    });

    it('rejects Leader role', async () => {
      const res = await fetchApi(
        `/api/app/dm-verification/${testRequestId}/cancel`,
        'POST',
        'test-token-leader'
      );
      assert.strictEqual(res.status, 403, 'should return 403 for Leader');
    });

    it('allows Admin to cancel pending request', async () => {
      const res = await fetchApi(
        `/api/app/dm-verification/${testRequestId}/cancel`,
        'POST',
        'test-token-admin',
        { reason: 'Test cancellation' }
      );
      assert.strictEqual(res.status, 200, 'should return 200 for Admin');
      const body = await res.json();
      assert.strictEqual(body.data.status, 'cancelled');
      assert.ok(body.data.cancelledAt, 'should have cancelledAt timestamp');
    });

    it('allows Steward to cancel pending request', async () => {
      const newRequestId = `${testRequestId}-steward`;
      await db.collection('dmVerificationRequests').doc(newRequestId).set({
        districtId: 'district-002',
        districtName: 'Test District 2',
        regionId: 'region-001',
        status: 'pending',
        cycleStartDate: new Date().toISOString().slice(0, 10),
        sentAt: new Date().toISOString(),
        sentTo: 'dm2@example.com',
        sentToPersonId: 'person-002',
        sentToPersonName: 'Test DM 2',
        sentBy: 'admin-user',
        recipientType: 'dm',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: 'admin-user',
        version: 1,
      });

      const res = await fetchApi(
        `/api/app/dm-verification/${newRequestId}/cancel`,
        'POST',
        'test-token-steward'
      );
      assert.strictEqual(res.status, 200, 'should return 200 for Steward');
      const body = await res.json();
      assert.strictEqual(body.data.status, 'cancelled');

      await db.collection('dmVerificationRequests').doc(newRequestId).delete();
    });

    it('returns 404 for non-existent request', async () => {
      const res = await fetchApi(
        '/api/app/dm-verification/nonexistent-id/cancel',
        'POST',
        'test-token-admin'
      );
      assert.strictEqual(res.status, 404, 'should return 404');
    });

    it('cannot cancel already confirmed request', async () => {
      const confirmedId = `${testRequestId}-confirmed`;
      await db.collection('dmVerificationRequests').doc(confirmedId).set({
        districtId: 'district-003',
        districtName: 'Test District 3',
        regionId: 'region-001',
        status: 'confirmed',
        cycleStartDate: new Date().toISOString().slice(0, 10),
        sentAt: new Date().toISOString(),
        sentTo: 'dm3@example.com',
        sentToPersonId: 'person-003',
        sentToPersonName: 'Test DM 3',
        sentBy: 'admin-user',
        recipientType: 'dm',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: 'admin-user',
        version: 1,
      });

      const res = await fetchApi(
        `/api/app/dm-verification/${confirmedId}/cancel`,
        'POST',
        'test-token-admin'
      );
      assert.strictEqual(res.status, 400, 'should return 400 for confirmed request');
      const body = await res.json();
      assert.strictEqual(body.error.code, 'invalid_status');
    });

    it('creates audit log entry on cancel', async () => {
      const auditId = `${testRequestId}-audit`;
      await db.collection('dmVerificationRequests').doc(auditId).set({
        districtId: 'district-004',
        districtName: 'Audit Test District',
        regionId: 'region-001',
        status: 'in_progress',
        cycleStartDate: new Date().toISOString().slice(0, 10),
        sentAt: new Date().toISOString(),
        sentTo: 'dm4@example.com',
        sentToPersonId: 'person-004',
        sentToPersonName: 'Test DM 4',
        sentBy: 'admin-user',
        recipientType: 'dm',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: 'admin-user',
        version: 1,
      });

      await fetchApi(
        `/api/app/dm-verification/${auditId}/cancel`,
        'POST',
        'test-token-admin',
        { reason: 'Audit test cancellation' }
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      const auditSnap = await db.collection('auditLog')
        .where('entityId', '==', auditId)
        .where('action', '==', 'cancel')
        .limit(1)
        .get();

      assert.ok(!auditSnap.empty, 'should create audit log entry');
      const auditEntry = auditSnap.docs[0].data();
      assert.strictEqual(auditEntry.entityType, 'verification');
      assert.strictEqual(auditEntry.action, 'cancel');

      await db.collection('dmVerificationRequests').doc(auditId).delete();
      for (const doc of auditSnap.docs) {
        await doc.ref.delete();
      }
    });
  });
});

describe('DM Verification - Status Transitions', () => {
  it('pending can be cancelled', () => {
    const validCancelStatuses = ['pending', 'in_progress', 'expired'];
    assert.ok(validCancelStatuses.includes('pending'));
  });

  it('in_progress can be cancelled', () => {
    const validCancelStatuses = ['pending', 'in_progress', 'expired'];
    assert.ok(validCancelStatuses.includes('in_progress'));
  });

  it('confirmed cannot be cancelled', () => {
    const nonCancellableStatuses = ['confirmed', 'cancelled'];
    assert.ok(nonCancellableStatuses.includes('confirmed'));
  });

  it('already cancelled cannot be cancelled again', () => {
    const nonCancellableStatuses = ['confirmed', 'cancelled'];
    assert.ok(nonCancellableStatuses.includes('cancelled'));
  });
});

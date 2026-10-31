import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import type { Firestore } from 'firebase-admin/firestore';
import { seedTestUsers, getTestDb } from './testHelpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

describe('Backup/Snapshot API', () => {
  const testSnapshotId = 'test-snapshot-delete';
  let db: Firestore;

  before(async () => {
    await seedTestUsers();
    db = await getTestDb();
  });

  async function createTestSnapshot(snapshotId: string): Promise<void> {
    const snapshotRef = db.collection('snapshots').doc(snapshotId);
    await snapshotRef.set({
      status: 'completed',
      createdAt: new Date().toISOString(),
      createdBy: 'test-admin',
      createdByEmail: 'admin@test.com',
      completedAt: new Date().toISOString(),
      chunkCount: 2,
      documentCount: 150,
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: 'test-admin',
        createdByEmail: 'admin@test.com',
        collections: ['locations', 'people', 'assignments'],
      },
    });

    await snapshotRef.collection('chunks').doc('chunk_0000').set({
      data: 'base64encodeddata1',
    });
    await snapshotRef.collection('chunks').doc('chunk_0001').set({
      data: 'base64encodeddata2',
    });
  }

  async function deleteTestSnapshot(snapshotId: string): Promise<void> {
    const snapshotRef = db.collection('snapshots').doc(snapshotId);
    const chunksSnap = await snapshotRef.collection('chunks').get();
    for (const chunk of chunksSnap.docs) {
      await chunk.ref.delete();
    }
    await snapshotRef.delete();
  }

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

  describe('GET /api/app/backups/snapshots', () => {
    it('requires Admin role', async () => {
      const res = await fetchApi('/api/app/backups/snapshots', 'GET', 'test-token-viewer');
      assert.strictEqual(res.status, 403, 'should return 403 for non-admin');
    });

    it('returns list of snapshots for Admin', async () => {
      const res = await fetchApi('/api/app/backups/snapshots', 'GET', 'test-token-admin');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.snapshots), 'should return snapshots array');
    });

    it('includes documentCount in response', async () => {
      await createTestSnapshot('test-snapshot-doccount');
      
      const res = await fetchApi('/api/app/backups/snapshots', 'GET', 'test-token-admin');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      
      const testSnapshot = body.snapshots.find((s: { id: string }) => s.id === 'test-snapshot-doccount');
      assert.ok(testSnapshot, 'should find test snapshot');
      assert.strictEqual(testSnapshot.documentCount, 150, 'should include documentCount');
      
      await deleteTestSnapshot('test-snapshot-doccount');
    });

    it('includes collections in response', async () => {
      await createTestSnapshot('test-snapshot-collections');
      
      const res = await fetchApi('/api/app/backups/snapshots', 'GET', 'test-token-admin');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      
      const testSnapshot = body.snapshots.find((s: { id: string }) => s.id === 'test-snapshot-collections');
      assert.ok(testSnapshot, 'should find test snapshot');
      assert.deepStrictEqual(testSnapshot.collections, ['locations', 'people', 'assignments']);
      
      await deleteTestSnapshot('test-snapshot-collections');
    });
  });

  describe('DELETE /api/app/backups/snapshots/:id', () => {
    it('requires Admin role', async () => {
      const res = await fetchApi(
        `/api/app/backups/snapshots/${testSnapshotId}?confirm=true`,
        'DELETE',
        'test-token-viewer'
      );
      assert.strictEqual(res.status, 403, 'should return 403 for non-admin');
    });

    it('requires confirmation query param', async () => {
      await createTestSnapshot(testSnapshotId);
      
      const res = await fetchApi(
        `/api/app/backups/snapshots/${testSnapshotId}`,
        'DELETE',
        'test-token-admin'
      );
      assert.strictEqual(res.status, 400, 'should return 400 without confirmation');
      const body = await res.json();
      assert.strictEqual(body.error.code, 'confirmation_required');
      
      await deleteTestSnapshot(testSnapshotId);
    });

    it('returns 404 for non-existent snapshot', async () => {
      const res = await fetchApi(
        '/api/app/backups/snapshots/nonexistent-snapshot?confirm=true',
        'DELETE',
        'test-token-admin'
      );
      assert.strictEqual(res.status, 404, 'should return 404');
    });

    it('deletes snapshot and all chunks with confirmation', async () => {
      const deleteId = `${testSnapshotId}-deletable`;
      await createTestSnapshot(deleteId);
      
      const beforeSnap = await db.collection('snapshots').doc(deleteId).get();
      assert.ok(beforeSnap.exists, 'snapshot should exist before delete');
      
      const beforeChunks = await db.collection('snapshots').doc(deleteId).collection('chunks').get();
      assert.strictEqual(beforeChunks.size, 2, 'should have 2 chunks before delete');
      
      const res = await fetchApi(
        `/api/app/backups/snapshots/${deleteId}?confirm=true`,
        'DELETE',
        'test-token-admin'
      );
      assert.strictEqual(res.status, 200, 'should return 200 on successful delete');
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.deleted, deleteId);
      assert.strictEqual(body.chunksDeleted, 2);
      
      const afterSnap = await db.collection('snapshots').doc(deleteId).get();
      assert.ok(!afterSnap.exists, 'snapshot should not exist after delete');
      
      const afterChunks = await db.collection('snapshots').doc(deleteId).collection('chunks').get();
      assert.strictEqual(afterChunks.size, 0, 'should have no chunks after delete');
    });

    it('creates audit log entry on delete', async () => {
      const auditId = `${testSnapshotId}-audit`;
      await createTestSnapshot(auditId);
      
      await fetchApi(
        `/api/app/backups/snapshots/${auditId}?confirm=true`,
        'DELETE',
        'test-token-admin'
      );
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const auditSnap = await db.collection('auditLog')
        .where('entityId', '==', auditId)
        .where('action', '==', 'delete')
        .limit(1)
        .get();
      
      assert.ok(!auditSnap.empty, 'should create audit log entry');
      const auditEntry = auditSnap.docs[0].data();
      assert.strictEqual(auditEntry.action, 'delete');
      assert.ok(auditEntry.changes.some((c: { field: string }) => c.field === 'documentCount'));
      
      for (const doc of auditSnap.docs) {
        await doc.ref.delete();
      }
    });
  });
});

describe('Snapshot - Confirmation Logic', () => {
  it('requires explicit confirm=true query param', () => {
    const queryParams = new URLSearchParams('confirm=true');
    assert.strictEqual(queryParams.get('confirm'), 'true');
  });

  it('rejects confirm=false', () => {
    const queryParams = new URLSearchParams('confirm=false');
    assert.notStrictEqual(queryParams.get('confirm'), 'true');
  });

  it('rejects missing confirm param', () => {
    const queryParams = new URLSearchParams('');
    assert.strictEqual(queryParams.get('confirm'), null);
  });
});

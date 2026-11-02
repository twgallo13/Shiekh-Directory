import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import type { Firestore } from 'firebase-admin/firestore';
import { seedTestUsers, getTestDb, seedTestHierarchy, seedTestLeader } from './testHelpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

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

describe('DM Tasks API', () => {
  const testRunId = `dm-tasks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let db: Firestore;
  let districtId: string;
  let district2Id: string;
  let regionId: string;
  let region2Id: string;
  let locationId: string;
  let location2Id: string;
  let taskId1: string;
  let taskId2: string;
  let taskId3: string;
  let personId: string;
  let assignmentId: string;

  before(async () => {
    await seedTestUsers();
    db = getTestDb();
    
    const hierarchy = await seedTestHierarchy(testRunId);
    districtId = hierarchy.districtId;
    district2Id = hierarchy.district2Id;
    regionId = hierarchy.regionId;
    region2Id = hierarchy.region2Id;
    
    const leaderResult = await seedTestLeader(districtId, testRunId);
    personId = leaderResult.personId;
    assignmentId = `test-assignment-${testRunId}`;
    
    const now = new Date().toISOString();
    
    const locationRef = db.collection('locations').doc(`test-loc-1-${testRunId}`);
    await locationRef.set({
      kind: 'store',
      storeNumber: 'T01',
      name: 'Test Store 1',
      lifecycle: 'active',
      districtId,
      regionId,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    locationId = locationRef.id;
    
    const location2Ref = db.collection('locations').doc(`test-loc-2-${testRunId}`);
    await location2Ref.set({
      kind: 'store',
      storeNumber: 'T02',
      name: 'Test Store 2',
      lifecycle: 'active',
      districtId: district2Id,
      regionId: region2Id,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    location2Id = location2Ref.id;
    
    taskId1 = `task-1-${testRunId}`;
    await db.collection('dmTasks').doc(taskId1).set({
      locationId,
      districtId,
      storeNumber: 'T01',
      taskType: 'verification_followup',
      status: 'pending',
      description: 'Follow up on verification',
      createdAt: now,
      updatedAt: now,
    });
    
    taskId2 = `task-2-${testRunId}`;
    await db.collection('dmTasks').doc(taskId2).set({
      locationId,
      districtId,
      storeNumber: 'T01',
      taskType: 'escalation',
      status: 'completed',
      description: 'Store escalation handled',
      createdAt: new Date(Date.now() - 1000).toISOString(),
      updatedAt: now,
      completedAt: now,
    });
    
    taskId3 = `task-3-${testRunId}`;
    await db.collection('dmTasks').doc(taskId3).set({
      locationId: location2Id,
      districtId: district2Id,
      storeNumber: 'T02',
      taskType: 'verification_followup',
      status: 'pending',
      description: 'Another district task',
      createdAt: now,
      updatedAt: now,
    });
  });

  after(async () => {
    if (db) {
      await db.collection('dmTasks').doc(taskId1).delete().catch(() => {});
      await db.collection('dmTasks').doc(taskId2).delete().catch(() => {});
      await db.collection('dmTasks').doc(taskId3).delete().catch(() => {});
      await db.collection('locations').doc(locationId).delete().catch(() => {});
      await db.collection('locations').doc(location2Id).delete().catch(() => {});
      await db.collection('districts').doc(districtId).delete().catch(() => {});
      await db.collection('districts').doc(district2Id).delete().catch(() => {});
      await db.collection('regions').doc(regionId).delete().catch(() => {});
      await db.collection('regions').doc(region2Id).delete().catch(() => {});
      await db.collection('people').doc(personId).delete().catch(() => {});
      await db.collection('assignments').doc(assignmentId).delete().catch(() => {});
      
      const auditSnap = await db.collection('auditLog')
        .where('entityId', 'in', [taskId1, taskId2, taskId3])
        .get();
      for (const doc of auditSnap.docs) {
        await doc.ref.delete().catch(() => {});
      }
    }
  });

  describe('GET /api/app/dm-tasks - Role Access', () => {
    it('requires authentication', async () => {
      const res = await fetch(`${API_BASE}/api/app/dm-tasks`);
      assert.strictEqual(res.status, 401, 'should return 401 without auth');
    });

    it('rejects Viewer role with 403', async () => {
      const res = await fetchApi('/api/app/dm-tasks', 'GET', 'test-token-viewer');
      assert.strictEqual(res.status, 403, 'should return 403 for Viewer');
    });

    it('allows Admin to see all tasks', async () => {
      const res = await fetchApi('/api/app/dm-tasks', 'GET', 'test-token-admin');
      assert.strictEqual(res.status, 200, 'should return 200 for Admin');
      const body = await res.json();
      assert.ok(Array.isArray(body.data), 'should return array of tasks');
      
      const ourTasks = body.data.filter((t: { id: string }) => 
        [taskId1, taskId2, taskId3].includes(t.id)
      );
      assert.strictEqual(ourTasks.length, 3, 'Admin should see all 3 test tasks');
    });

    it('allows Steward to see all tasks', async () => {
      const res = await fetchApi('/api/app/dm-tasks', 'GET', 'test-token-steward');
      assert.strictEqual(res.status, 200, 'should return 200 for Steward');
      const body = await res.json();
      
      const ourTasks = body.data.filter((t: { id: string }) => 
        [taskId1, taskId2, taskId3].includes(t.id)
      );
      assert.strictEqual(ourTasks.length, 3, 'Steward should see all 3 test tasks');
    });

    it('allows Leader/DM to see only own district tasks', async () => {
      const res = await fetchApi('/api/app/dm-tasks', 'GET', 'test-token-leader');
      assert.strictEqual(res.status, 200, 'should return 200 for Leader');
      const body = await res.json();
      
      const ourTasks = body.data.filter((t: { id: string }) => 
        [taskId1, taskId2, taskId3].includes(t.id)
      );
      assert.strictEqual(ourTasks.length, 2, 'Leader should see only 2 tasks from their district');
      assert.ok(ourTasks.every((t: { districtId: string }) => t.districtId === districtId), 
        'All tasks should be from leader\'s district');
    });
  });

  describe('GET /api/app/dm-tasks - locationId Filter', () => {
    it('filters by locationId with status', async () => {
      const res = await fetchApi(`/api/app/dm-tasks?locationId=${locationId}&status=pending`, 'GET', 'test-token-admin');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      
      const ourTasks = body.data.filter((t: { id: string }) => 
        [taskId1, taskId2, taskId3].includes(t.id)
      );
      assert.strictEqual(ourTasks.length, 1, 'Should see only pending tasks for locationId');
      assert.strictEqual(ourTasks[0].id, taskId1);
      assert.strictEqual(ourTasks[0].status, 'pending');
    });

    it('filters by locationId without status (All tab)', async () => {
      const res = await fetchApi(`/api/app/dm-tasks?locationId=${locationId}`, 'GET', 'test-token-admin');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      
      const ourTasks = body.data.filter((t: { id: string }) => 
        [taskId1, taskId2, taskId3].includes(t.id)
      );
      assert.strictEqual(ourTasks.length, 2, 'Should see all tasks for locationId regardless of status');
      assert.ok(ourTasks.every((t: { locationId: string }) => t.locationId === locationId));
    });

    it('filters by status only', async () => {
      const res = await fetchApi('/api/app/dm-tasks?status=pending', 'GET', 'test-token-admin');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      
      const ourTasks = body.data.filter((t: { id: string }) => 
        [taskId1, taskId2, taskId3].includes(t.id)
      );
      assert.strictEqual(ourTasks.length, 2, 'Should see only pending tasks');
      assert.ok(ourTasks.every((t: { status: string }) => t.status === 'pending'));
    });
  });

  describe('PATCH /api/app/dm-tasks/:id/status - Complete Action', () => {
    it('allows Admin to mark task as completed with note', async () => {
      const testTaskId = `complete-test-${testRunId}`;
      await db.collection('dmTasks').doc(testTaskId).set({
        locationId,
        districtId,
        storeNumber: 'T01',
        taskType: 'test',
        status: 'pending',
        description: 'Test task for completion',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      try {
        const res = await fetchApi(
          `/api/app/dm-tasks/${testTaskId}/status`,
          'PATCH',
          'test-token-admin',
          { status: 'completed', note: 'Done via test' }
        );
        assert.strictEqual(res.status, 200, 'should return 200');
        const body = await res.json();
        assert.strictEqual(body.data.status, 'completed', 'status should be completed');
        assert.ok(body.data.completedAt, 'should have completedAt');
        assert.strictEqual(body.data.completedNote, 'Done via test', 'should save note');
        assert.strictEqual(body.data.completedBy, 'admin', 'should save actor');
      } finally {
        await db.collection('dmTasks').doc(testTaskId).delete().catch(() => {});
      }
    });

    it('allows Leader/DM to complete own district task', async () => {
      const testTaskId = `leader-complete-${testRunId}`;
      await db.collection('dmTasks').doc(testTaskId).set({
        locationId,
        districtId,
        storeNumber: 'T01',
        taskType: 'test',
        status: 'pending',
        description: 'Leader completion test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      try {
        const res = await fetchApi(
          `/api/app/dm-tasks/${testTaskId}/status`,
          'PATCH',
          'test-token-leader',
          { status: 'completed', note: 'Leader completed' }
        );
        assert.strictEqual(res.status, 200, 'should return 200');
        const body = await res.json();
        assert.strictEqual(body.data.status, 'completed');
        assert.strictEqual(body.data.completedBy, 'leader');
      } finally {
        await db.collection('dmTasks').doc(testTaskId).delete().catch(() => {});
      }
    });

    it('rejects Leader/DM completing another district task', async () => {
      const res = await fetchApi(
        `/api/app/dm-tasks/${taskId3}/status`,
        'PATCH',
        'test-token-leader',
        { status: 'completed' }
      );
      assert.strictEqual(res.status, 403, 'should return 403 for other district');
    });

    it('rejects Viewer completing a task', async () => {
      const res = await fetchApi(
        `/api/app/dm-tasks/${taskId1}/status`,
        'PATCH',
        'test-token-viewer',
        { status: 'completed' }
      );
      assert.strictEqual(res.status, 403, 'should return 403 for Viewer');
    });
  });

  describe('PATCH /api/app/dm-tasks/:id/status - Cancel/Close Action', () => {
    it('allows Admin to cancel task with note', async () => {
      const testTaskId = `cancel-test-${testRunId}`;
      await db.collection('dmTasks').doc(testTaskId).set({
        locationId,
        districtId,
        storeNumber: 'T01',
        taskType: 'test',
        status: 'pending',
        description: 'Test task for cancellation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      try {
        const res = await fetchApi(
          `/api/app/dm-tasks/${testTaskId}/status`,
          'PATCH',
          'test-token-admin',
          { status: 'cancelled', note: 'Closed via test' }
        );
        assert.strictEqual(res.status, 200, 'should return 200');
        const body = await res.json();
        assert.strictEqual(body.data.status, 'cancelled', 'status should be cancelled');
        assert.ok(body.data.cancelledAt, 'should have cancelledAt');
        assert.strictEqual(body.data.cancelledReason, 'Closed via test', 'should save note as reason');
        assert.strictEqual(body.data.cancelledBy, 'admin', 'should save actor');
      } finally {
        await db.collection('dmTasks').doc(testTaskId).delete().catch(() => {});
      }
    });

    it('allows Steward to cancel task', async () => {
      const testTaskId = `steward-cancel-${testRunId}`;
      await db.collection('dmTasks').doc(testTaskId).set({
        locationId,
        districtId,
        storeNumber: 'T01',
        taskType: 'test',
        status: 'pending',
        description: 'Steward cancellation test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      try {
        const res = await fetchApi(
          `/api/app/dm-tasks/${testTaskId}/status`,
          'PATCH',
          'test-token-steward',
          { status: 'cancelled' }
        );
        assert.strictEqual(res.status, 200, 'should return 200');
        const body = await res.json();
        assert.strictEqual(body.data.status, 'cancelled');
        assert.strictEqual(body.data.cancelledBy, 'steward');
      } finally {
        await db.collection('dmTasks').doc(testTaskId).delete().catch(() => {});
      }
    });

    it('rejects Leader/DM cancelling another district task', async () => {
      const res = await fetchApi(
        `/api/app/dm-tasks/${taskId3}/status`,
        'PATCH',
        'test-token-leader',
        { status: 'cancelled' }
      );
      assert.strictEqual(res.status, 403, 'should return 403 for other district');
    });

    it('rejects Viewer cancelling a task', async () => {
      const res = await fetchApi(
        `/api/app/dm-tasks/${taskId1}/status`,
        'PATCH',
        'test-token-viewer',
        { status: 'cancelled' }
      );
      assert.strictEqual(res.status, 403, 'should return 403 for Viewer');
    });
  });

  describe('PATCH /api/app/dm-tasks/:id/status - Error Cases', () => {
    it('returns 404 for non-existent task', async () => {
      const res = await fetchApi(
        '/api/app/dm-tasks/nonexistent-task/status',
        'PATCH',
        'test-token-admin',
        { status: 'completed' }
      );
      assert.strictEqual(res.status, 404);
    });

    it('rejects invalid status', async () => {
      const res = await fetchApi(
        `/api/app/dm-tasks/${taskId1}/status`,
        'PATCH',
        'test-token-admin',
        { status: 'invalid_status' }
      );
      assert.strictEqual(res.status, 400);
    });

    it('requires authentication', async () => {
      const res = await fetch(`${API_BASE}/api/app/dm-tasks/${taskId1}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      assert.strictEqual(res.status, 401);
    });
  });
});

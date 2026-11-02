import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AuthUser, DMTask, DMTaskStatus } from '../../src/types';

interface AuditLogEntry {
  userId: string;
  userEmail: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  locationId?: string;
  changes?: { field: string; oldValue?: unknown; newValue?: unknown }[];
}

async function logAudit(
  db: Firestore,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<void> {
  const auditRef = db.collection('auditLog').doc();
  await auditRef.set({
    ...entry,
    id: auditRef.id,
    timestamp: new Date().toISOString(),
  });
}

export function createDMTasksRouter(db: Firestore): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Authentication required', requestId: res.locals.requestId },
        });
      }

      const isAdminOrSteward = authUser.role === 'Admin' || authUser.role === 'Steward';
      const isLeader = authUser.role === 'Leader';

      if (!isAdminOrSteward && !isLeader) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Access denied', requestId: res.locals.requestId },
        });
      }

      const { status, districtId } = req.query;
      
      let query: FirebaseFirestore.Query = db.collection('dmTasks')
        .orderBy('createdAt', 'desc')
        .limit(100);

      if (status) {
        query = db.collection('dmTasks')
          .where('status', '==', status)
          .orderBy('createdAt', 'desc')
          .limit(100);
      }

      if (isLeader && authUser.leaderScope?.districtIds?.length) {
        const districtIds = authUser.leaderScope.districtIds;
        const tasks: DMTask[] = [];
        
        const CHUNK_SIZE = 30;
        for (let i = 0; i < districtIds.length; i += CHUNK_SIZE) {
          const chunk = districtIds.slice(i, i + CHUNK_SIZE);
          let chunkQuery = db.collection('dmTasks')
            .where('districtId', 'in', chunk)
            .orderBy('createdAt', 'desc')
            .limit(100);
          
          if (status) {
            chunkQuery = db.collection('dmTasks')
              .where('districtId', 'in', chunk)
              .where('status', '==', status)
              .orderBy('createdAt', 'desc')
              .limit(100);
          }
          
          const snapshot = await chunkQuery.get();
          for (const doc of snapshot.docs) {
            tasks.push({ id: doc.id, ...doc.data() } as DMTask);
          }
        }
        
        tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return res.json({ data: tasks.slice(0, 100) });
      }

      if (districtId) {
        query = db.collection('dmTasks')
          .where('districtId', '==', districtId)
          .orderBy('createdAt', 'desc')
          .limit(100);
        
        if (status) {
          query = db.collection('dmTasks')
            .where('districtId', '==', districtId)
            .where('status', '==', status)
            .orderBy('createdAt', 'desc')
            .limit(100);
        }
      }

      const snapshot = await query.get();
      const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DMTask));
      
      res.json({ data: tasks });
    } catch (error) {
      console.error('List DM tasks error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to list DM tasks', requestId: res.locals.requestId },
      });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Authentication required', requestId: res.locals.requestId },
        });
      }

      const isAdminOrSteward = authUser.role === 'Admin' || authUser.role === 'Steward';
      const isLeader = authUser.role === 'Leader';

      if (!isAdminOrSteward && !isLeader) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Access denied', requestId: res.locals.requestId },
        });
      }

      const { id } = req.params;
      const taskDoc = await db.collection('dmTasks').doc(id).get();
      
      if (!taskDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'DM task not found', requestId: res.locals.requestId },
        });
      }

      const task = { id: taskDoc.id, ...taskDoc.data() } as DMTask;

      if (isLeader && authUser.leaderScope?.districtIds?.length) {
        if (!authUser.leaderScope.districtIds.includes(task.districtId)) {
          return res.status(403).json({
            error: { code: 'forbidden', message: 'You can only view tasks for your districts', requestId: res.locals.requestId },
          });
        }
      }

      res.json({ data: task });
    } catch (error) {
      console.error('Get DM task error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to get DM task', requestId: res.locals.requestId },
      });
    }
  });

  router.patch('/:id/status', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Authentication required', requestId: res.locals.requestId },
        });
      }

      const isAdminOrSteward = authUser.role === 'Admin' || authUser.role === 'Steward';
      const isLeader = authUser.role === 'Leader';

      if (!isAdminOrSteward && !isLeader) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Access denied', requestId: res.locals.requestId },
        });
      }

      const { id } = req.params;
      const { status, note } = req.body;

      const validStatuses: DMTaskStatus[] = ['pending', 'in_progress', 'completed', 'cancelled'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'Invalid status. Must be: pending, in_progress, completed, or cancelled', requestId: res.locals.requestId },
        });
      }

      const taskDoc = await db.collection('dmTasks').doc(id).get();
      
      if (!taskDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'DM task not found', requestId: res.locals.requestId },
        });
      }

      const task = { id: taskDoc.id, ...taskDoc.data() } as DMTask;

      if (isLeader && authUser.leaderScope?.districtIds?.length) {
        if (!authUser.leaderScope.districtIds.includes(task.districtId)) {
          return res.status(403).json({
            error: { code: 'forbidden', message: 'You can only update tasks for your districts', requestId: res.locals.requestId },
          });
        }
      }

      const now = new Date().toISOString();
      const updates: Partial<DMTask> = {
        status,
        updatedAt: now,
        updatedBy: authUser.uid,
      };

      if (status === 'completed') {
        updates.completedAt = now;
        updates.completedBy = authUser.uid;
        updates.completedNote = note || undefined;
      } else if (status === 'cancelled') {
        updates.cancelledAt = now;
        updates.cancelledBy = authUser.uid;
        updates.cancelledReason = note || undefined;
      }

      await taskDoc.ref.update(updates);

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'dm-task',
        entityId: id,
        entityName: `DM Task: ${task.storeNumber} - ${task.taskType}`,
        locationId: task.locationId,
        changes: [
          { field: 'status', oldValue: task.status, newValue: status },
        ],
      });

      const updatedDoc = await taskDoc.ref.get();
      res.json({ data: { id: updatedDoc.id, ...updatedDoc.data() } });
    } catch (error) {
      console.error('Update DM task status error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to update DM task', requestId: res.locals.requestId },
      });
    }
  });

  return router;
}

import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AuditLogEntry, AuthUser } from '../../src/types';

export function createAuditRouter(db: Firestore): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (authUser.role !== 'Admin' && authUser.role !== 'Steward') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward and Admin can view audit logs', requestId: res.locals.requestId },
        });
      }

      const { entityType, entityId, userId, limit: limitParam } = req.query;
      const limit = Math.min(parseInt(limitParam as string) || 50, 200);

      let query = db.collection('auditLog')
        .orderBy('timestamp', 'desc')
        .limit(limit);

      if (entityType) {
        query = query.where('entityType', '==', entityType);
      }

      if (entityId) {
        query = query.where('entityId', '==', entityId);
      }

      if (userId) {
        query = query.where('userId', '==', userId);
      }

      const snapshot = await query.get();
      
      const entries: AuditLogEntry[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as AuditLogEntry[];

      return res.json({ data: entries });
    } catch (error) {
      console.error('List audit log error:', error);
      return res.status(500).json({
        error: { code: 'list_error', message: 'Failed to list audit log', requestId: res.locals.requestId },
      });
    }
  });

  router.get('/location/:locationId', async (req: Request, res: Response) => {
    try {
      const { locationId } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const [directSnapshot, assignmentSnapshot] = await Promise.all([
        db.collection('auditLog')
          .where('entityId', '==', locationId)
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get(),
        db.collection('auditLog')
          .where('locationId', '==', locationId)
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get(),
      ]);

      const entriesMap = new Map<string, AuditLogEntry>();
      
      for (const doc of directSnapshot.docs) {
        entriesMap.set(doc.id, { id: doc.id, ...doc.data() } as AuditLogEntry);
      }
      
      for (const doc of assignmentSnapshot.docs) {
        if (!entriesMap.has(doc.id)) {
          entriesMap.set(doc.id, { id: doc.id, ...doc.data() } as AuditLogEntry);
        }
      }

      const entries = Array.from(entriesMap.values())
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 50);

      return res.json({ data: entries });
    } catch (error) {
      console.error('Get location audit log error:', error);
      return res.status(500).json({
        error: { code: 'get_error', message: 'Failed to get audit log', requestId: res.locals.requestId },
      });
    }
  });

  return router;
}

import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  Correction,
  Location,
  AuthUser,
  AuditLogEntry,
} from '../../src/types';
import { canApproveCorrections } from '../../src/lib/permissions';

export function createCorrectionsRouter(db: Firestore): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const status = req.query.status as string || 'pending';
      
      let query = db.collection('corrections')
        .where('status', '==', status)
        .orderBy('submittedAt', 'desc');

      if (!canApproveCorrections(authUser)) {
        query = query.where('submittedBy', '==', authUser.uid);
      }

      const snapshot = await query.limit(100).get();
      
      const corrections: Correction[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Correction[];

      return res.json({ data: corrections });
    } catch (error) {
      console.error('List corrections error:', error);
      return res.status(500).json({
        error: { code: 'list_error', message: 'Failed to list corrections', requestId: res.locals.requestId },
      });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const doc = await db.collection('corrections').doc(id).get();
      
      if (!doc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Correction not found', requestId: res.locals.requestId },
        });
      }

      const correction = { id: doc.id, ...doc.data() } as Correction;

      if (!canApproveCorrections(authUser) && correction.submittedBy !== authUser.uid) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'You can only view your own corrections', requestId: res.locals.requestId },
        });
      }

      return res.json({ data: correction });
    } catch (error) {
      console.error('Get correction error:', error);
      return res.status(500).json({
        error: { code: 'get_error', message: 'Failed to get correction', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/:id/approve', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;
      const { notes } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canApproveCorrections(authUser)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'You don\'t have permission to approve corrections', requestId: res.locals.requestId },
        });
      }

      const correctionRef = db.collection('corrections').doc(id);
      const correctionDoc = await correctionRef.get();

      if (!correctionDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Correction not found', requestId: res.locals.requestId },
        });
      }

      const correction = { id: correctionDoc.id, ...correctionDoc.data() } as Correction;

      if (correction.status !== 'pending') {
        return res.status(400).json({
          error: { code: 'invalid_status', message: 'Correction has already been reviewed', requestId: res.locals.requestId },
        });
      }

      const locationRef = db.collection('locations').doc(correction.locationId);
      const locationDoc = await locationRef.get();

      if (!locationDoc.exists) {
        return res.status(404).json({
          error: { code: 'location_not_found', message: 'Location no longer exists', requestId: res.locals.requestId },
        });
      }

      const location = { id: locationDoc.id, ...locationDoc.data() } as Location;

      if (location.version !== correction.locationVersion) {
        return res.status(409).json({
          error: {
            code: 'version_conflict',
            message: 'The location was modified since this correction was submitted. Please review manually.',
            requestId: res.locals.requestId,
          },
        });
      }

      const batch = db.batch();

      const updateData: Record<string, unknown> = {
        ...correction.proposedChanges,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        version: location.version + 1,
      };
      batch.update(locationRef, updateData);

      batch.update(correctionRef, {
        status: 'approved',
        reviewedBy: authUser.uid,
        reviewedByEmail: authUser.email,
        reviewedAt: new Date().toISOString(),
        reviewNotes: notes || null,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        version: correction.version + 1,
      });

      await batch.commit();

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'approve',
        entityType: 'correction',
        entityId: id,
        entityName: `Correction for ${correction.storeNumber}`,
        changes: Object.entries(correction.proposedChanges).map(([field, value]) => ({
          field,
          oldValue: correction.currentValues[field] as string,
          newValue: value as string,
        })),
      });

      return res.json({ data: { success: true, newVersion: location.version + 1 } });
    } catch (error) {
      console.error('Approve correction error:', error);
      return res.status(500).json({
        error: { code: 'approve_error', message: 'Failed to approve correction', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/:id/reject', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;
      const { notes } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canApproveCorrections(authUser)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'You don\'t have permission to reject corrections', requestId: res.locals.requestId },
        });
      }

      const correctionRef = db.collection('corrections').doc(id);
      const correctionDoc = await correctionRef.get();

      if (!correctionDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Correction not found', requestId: res.locals.requestId },
        });
      }

      const correction = correctionDoc.data() as Correction;

      if (correction.status !== 'pending') {
        return res.status(400).json({
          error: { code: 'invalid_status', message: 'Correction has already been reviewed', requestId: res.locals.requestId },
        });
      }

      await correctionRef.update({
        status: 'rejected',
        reviewedBy: authUser.uid,
        reviewedByEmail: authUser.email,
        reviewedAt: new Date().toISOString(),
        reviewNotes: notes || null,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        version: correction.version + 1,
      });

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'reject',
        entityType: 'correction',
        entityId: id,
        entityName: `Correction for ${correction.storeNumber}`,
        changes: [{ field: 'status', oldValue: 'pending', newValue: 'rejected' }],
      });

      return res.json({ data: { success: true } });
    } catch (error) {
      console.error('Reject correction error:', error);
      return res.status(500).json({
        error: { code: 'reject_error', message: 'Failed to reject correction', requestId: res.locals.requestId },
      });
    }
  });

  return router;
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

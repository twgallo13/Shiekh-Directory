import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  Notice,
  AuthUser,
  AuditLogEntry,
  Location,
} from '../../src/types';
import { hasPermission } from '../../src/lib/permissions';

async function addAuditEntry(
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

export function createNoticesRouter(db: Firestore): Router {
  const router = Router();

  // Get notices for a location
  router.get('/locations/:locationId/notices', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const { locationId } = req.params;
      const { status } = req.query;

      let query: FirebaseFirestore.Query = db.collection('locations').doc(locationId).collection('notices');
      
      if (status && typeof status === 'string') {
        query = query.where('status', '==', status);
      }
      
      query = query.orderBy('effectiveFrom', 'desc');
      
      const snap = await query.get();
      const notices = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Notice[];

      return res.json({ data: notices });
    } catch (error) {
      console.error('Get notices error:', error);
      return res.status(500).json({
        error: { code: 'get_error', message: 'Failed to get notices', requestId: res.locals.requestId },
      });
    }
  });

  // Create a notice (Steward/Admin only)
  router.post('/locations/:locationId/notices', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!hasPermission(authUser, 'edit:hours').allowed) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward or Admin can create notices', requestId: res.locals.requestId },
        });
      }

      const { locationId } = req.params;
      const { text, audience, effectiveFrom, effectiveUntil, expectedResolution } = req.body;

      // Validate location exists
      const locationDoc = await db.collection('locations').doc(locationId).get();
      if (!locationDoc.exists) {
        return res.status(404).json({
          error: { code: 'location_not_found', message: 'Location not found', requestId: res.locals.requestId },
        });
      }
      const locationData = locationDoc.data() as Location;

      if (!text?.trim()) {
        return res.status(400).json({
          error: { code: 'text_required', message: 'Notice text is required', requestId: res.locals.requestId },
        });
      }

      if (text.length > 500) {
        return res.status(400).json({
          error: { code: 'text_too_long', message: 'Notice text must be 500 characters or less', requestId: res.locals.requestId },
        });
      }

      if (audience && !['internal', 'public'].includes(audience)) {
        return res.status(400).json({
          error: { code: 'invalid_audience', message: 'Audience must be internal or public', requestId: res.locals.requestId },
        });
      }

      const now = new Date().toISOString();
      const noticeRef = db.collection('locations').doc(locationId).collection('notices').doc();
      const notice: Omit<Notice, 'id'> = {
        text: text.trim(),
        audience: audience || 'internal',
        status: 'active',
        effectiveFrom: effectiveFrom || now,
        effectiveUntil: effectiveUntil || undefined,
        expectedResolution: expectedResolution?.trim() || undefined,
        createdBy: authUser.uid,
        createdByEmail: authUser.email,
        createdAt: now,
      };

      await noticeRef.set(notice);

      await addAuditEntry(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'notice' as AuditLogEntry['entityType'],
        entityId: noticeRef.id,
        entityName: `Notice for ${locationData.storeNumber || locationData.name}`,
        locationId,
        changes: [
          { field: 'text', newValue: text.trim().slice(0, 50) + (text.length > 50 ? '...' : '') },
          { field: 'audience', newValue: audience || 'internal' },
        ],
      });

      return res.status(201).json({ data: { id: noticeRef.id, ...notice } });
    } catch (error) {
      console.error('Create notice error:', error);
      return res.status(500).json({
        error: { code: 'create_error', message: 'Failed to create notice', requestId: res.locals.requestId },
      });
    }
  });

  // Update a notice (Steward/Admin only)
  router.patch('/locations/:locationId/notices/:noticeId', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!hasPermission(authUser, 'edit:hours').allowed) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward or Admin can update notices', requestId: res.locals.requestId },
        });
      }

      const { locationId, noticeId } = req.params;
      const { text, audience, status, effectiveUntil, expectedResolution } = req.body;

      const noticeRef = db.collection('locations').doc(locationId).collection('notices').doc(noticeId);
      const noticeDoc = await noticeRef.get();

      if (!noticeDoc.exists) {
        return res.status(404).json({
          error: { code: 'notice_not_found', message: 'Notice not found', requestId: res.locals.requestId },
        });
      }

      const existingNotice = noticeDoc.data() as Notice;
      const updates: Partial<Notice> = {};
      const auditChanges: { field: string; oldValue?: unknown; newValue?: unknown }[] = [];

      if (text !== undefined) {
        if (!text.trim()) {
          return res.status(400).json({
            error: { code: 'text_required', message: 'Notice text cannot be empty', requestId: res.locals.requestId },
          });
        }
        if (text.length > 500) {
          return res.status(400).json({
            error: { code: 'text_too_long', message: 'Notice text must be 500 characters or less', requestId: res.locals.requestId },
          });
        }
        updates.text = text.trim();
        auditChanges.push({ field: 'text', oldValue: existingNotice.text?.slice(0, 50), newValue: text.trim().slice(0, 50) });
      }

      if (audience !== undefined) {
        if (!['internal', 'public'].includes(audience)) {
          return res.status(400).json({
            error: { code: 'invalid_audience', message: 'Audience must be internal or public', requestId: res.locals.requestId },
          });
        }
        updates.audience = audience;
        auditChanges.push({ field: 'audience', oldValue: existingNotice.audience, newValue: audience });
      }

      if (status !== undefined) {
        if (!['active', 'expired', 'resolved'].includes(status)) {
          return res.status(400).json({
            error: { code: 'invalid_status', message: 'Invalid status', requestId: res.locals.requestId },
          });
        }
        updates.status = status;
        auditChanges.push({ field: 'status', oldValue: existingNotice.status, newValue: status });
        if (status === 'resolved') {
          updates.resolvedAt = new Date().toISOString();
          updates.resolvedBy = authUser.uid;
        }
      }

      if (effectiveUntil !== undefined) {
        updates.effectiveUntil = effectiveUntil || undefined;
        auditChanges.push({ field: 'effectiveUntil', oldValue: existingNotice.effectiveUntil, newValue: effectiveUntil || null });
      }

      if (expectedResolution !== undefined) {
        updates.expectedResolution = expectedResolution?.trim() || undefined;
        auditChanges.push({ field: 'expectedResolution', oldValue: existingNotice.expectedResolution, newValue: expectedResolution?.trim() || null });
      }

      await noticeRef.update(updates);

      if (auditChanges.length > 0) {
        await addAuditEntry(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'update',
          entityType: 'notice' as AuditLogEntry['entityType'],
          entityId: noticeId,
          entityName: `Notice for location ${locationId}`,
          locationId,
          changes: auditChanges,
        });
      }

      const updated = await noticeRef.get();
      return res.json({ data: { id: noticeId, ...updated.data() } });
    } catch (error) {
      console.error('Update notice error:', error);
      return res.status(500).json({
        error: { code: 'update_error', message: 'Failed to update notice', requestId: res.locals.requestId },
      });
    }
  });

  // Delete a notice (Steward/Admin only)
  router.delete('/locations/:locationId/notices/:noticeId', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!hasPermission(authUser, 'edit:hours').allowed) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward or Admin can delete notices', requestId: res.locals.requestId },
        });
      }

      const { locationId, noticeId } = req.params;
      const noticeRef = db.collection('locations').doc(locationId).collection('notices').doc(noticeId);
      const noticeDoc = await noticeRef.get();

      if (!noticeDoc.exists) {
        return res.status(404).json({
          error: { code: 'notice_not_found', message: 'Notice not found', requestId: res.locals.requestId },
        });
      }

      const noticeData = noticeDoc.data() as Notice;
      await noticeRef.delete();

      await addAuditEntry(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'delete',
        entityType: 'notice' as AuditLogEntry['entityType'],
        entityId: noticeId,
        entityName: `Notice for location ${locationId}`,
        locationId,
        changes: [{ field: 'deleted', oldValue: noticeData.text?.slice(0, 50) }],
      });

      return res.json({ data: { success: true } });
    } catch (error) {
      console.error('Delete notice error:', error);
      return res.status(500).json({
        error: { code: 'delete_error', message: 'Failed to delete notice', requestId: res.locals.requestId },
      });
    }
  });

  return router;
}

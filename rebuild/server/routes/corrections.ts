import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  Correction,
  Location,
  AuthUser,
  AuditLogEntry,
} from '../../src/types';
import { canApproveCorrections } from '../../src/lib/permissions';
import { getWorkflowRules } from '../services/workflowSettings';

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

      const status = req.query.status as string;
      const category = req.query.category as string;
      const locationId = req.query.locationId as string;
      const myRequests = req.query.myRequests === 'true';
      const includeArchived = req.query.includeArchived === 'true';
      
      let query;
      
      if (myRequests) {
        query = db.collection('corrections')
          .where('submittedBy', '==', authUser.uid)
          .orderBy('submittedAt', 'desc');
      } else {
        const statusFilter = status || 'pending';
        query = db.collection('corrections')
          .where('status', '==', statusFilter)
          .orderBy('submittedAt', 'desc');
        
        if (!canApproveCorrections(authUser)) {
          query = query.where('submittedBy', '==', authUser.uid);
        }
      }

      const snapshot = await query.limit(200).get();
      
      let corrections: Correction[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Correction[];

      // Filter by locationId if specified (done in memory since Firestore has index limitations)
      if (locationId) {
        corrections = corrections.filter(c => c.locationId === locationId);
      }

      // Filter by category if specified (done in memory since Firestore has index limitations)
      if (category) {
        corrections = corrections.filter(c => c.category === category);
      }
      
      // Hide archived unless explicitly requested
      if (!includeArchived && !status) {
        corrections = corrections.filter(c => c.status !== 'archived');
      }

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

  // Create a new correction request (Report a problem)
  router.post('/', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const { locationId, category, type, proposedChanges, proposedNote } = req.body;

      if (!locationId) {
        return res.status(400).json({
          error: { code: 'location_required', message: 'Location ID is required', requestId: res.locals.requestId },
        });
      }

      if (!category) {
        return res.status(400).json({
          error: { code: 'category_required', message: 'Category is required', requestId: res.locals.requestId },
        });
      }

      const validCategories = ['address', 'suite', 'directions', 'phone', 'hours', 'manager', 'other'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          error: { code: 'invalid_category', message: 'Invalid category', requestId: res.locals.requestId },
        });
      }

      const locationDoc = await db.collection('locations').doc(locationId).get();
      if (!locationDoc.exists) {
        return res.status(404).json({
          error: { code: 'location_not_found', message: 'Location not found', requestId: res.locals.requestId },
        });
      }

      const location = locationDoc.data() as Location;

      // Determine correction type based on category
      const correctionType = 
        category === 'phone' ? 'phone' :
        ['address', 'suite', 'directions'].includes(category) ? 'address' :
        category === 'hours' ? 'hours' : 'address';

      // Get current values based on category
      const currentValues: Record<string, unknown> = {};
      if (category === 'address' || category === 'suite') {
        currentValues.address = location.address;
      } else if (category === 'directions') {
        currentValues.wayfindingDirections = location.wayfindingDirections;
      } else if (category === 'phone') {
        currentValues.mainPhone = location.mainPhone;
      } else if (category === 'hours') {
        currentValues.standardHours = location.standardHours;
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const workflowRules = await getWorkflowRules(db);
      const expiresAt = new Date(now.getTime() + workflowRules.correctionExpiryDays * 24 * 60 * 60 * 1000);
      
      const correctionRef = db.collection('corrections').doc();
      const correction: Omit<Correction, 'id'> = {
        status: 'pending',
        type: type || correctionType,
        category,
        locationId,
        locationName: location.name,
        storeNumber: location.storeNumber,
        submittedBy: authUser.uid,
        submittedByEmail: authUser.email,
        submittedByRole: authUser.role,
        submittedAt: nowIso,
        expiresAt: expiresAt.toISOString(),
        proposedChanges: proposedChanges || {},
        proposedNote: proposedNote?.trim() || undefined,
        currentValues,
        locationVersion: location.version,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: authUser.uid,
        version: 1,
      };

      await correctionRef.set(correction);

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'correction',
        entityId: correctionRef.id,
        entityName: `Correction for ${location.storeNumber}`,
        changes: [
          { field: 'category', newValue: category },
          { field: 'status', newValue: 'pending' },
        ],
      });

      return res.status(201).json({ data: { id: correctionRef.id, ...correction } });
    } catch (error) {
      console.error('Create correction error:', error);
      return res.status(500).json({
        error: { code: 'create_error', message: 'Failed to create correction', requestId: res.locals.requestId },
      });
    }
  });

  // Cancel a correction request (only by submitter if still pending)
  router.post('/:id/cancel', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
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

      // Only allow submitter to cancel their own pending requests
      if (correction.submittedBy !== authUser.uid) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'You can only cancel your own requests', requestId: res.locals.requestId },
        });
      }

      if (correction.status !== 'pending') {
        return res.status(400).json({
          error: { code: 'invalid_status', message: 'Only pending requests can be cancelled', requestId: res.locals.requestId },
        });
      }

      await correctionRef.update({
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: authUser.uid,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        version: correction.version + 1,
      });

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'cancel',
        entityType: 'correction',
        entityId: id,
        entityName: `Correction for ${correction.storeNumber}`,
        changes: [{ field: 'status', oldValue: 'pending', newValue: 'cancelled' }],
      });

      return res.json({ data: { success: true } });
    } catch (error) {
      console.error('Cancel correction error:', error);
      return res.status(500).json({
        error: { code: 'cancel_error', message: 'Failed to cancel correction', requestId: res.locals.requestId },
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

  // Archive a single correction
  router.post('/:id/archive', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canApproveCorrections(authUser)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'You don\'t have permission to archive corrections', requestId: res.locals.requestId },
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

      if (correction.status === 'archived') {
        return res.status(400).json({
          error: { code: 'already_archived', message: 'Correction is already archived', requestId: res.locals.requestId },
        });
      }

      const now = new Date().toISOString();
      await correctionRef.update({
        status: 'archived',
        archivedAt: now,
        archivedBy: authUser.uid,
        archivedByEmail: authUser.email,
        previousStatus: correction.status,
        updatedAt: now,
        updatedBy: authUser.uid,
        version: correction.version + 1,
      });

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'archive',
        entityType: 'correction',
        entityId: id,
        entityName: `Correction for ${correction.storeNumber}`,
        changes: [{ field: 'status', oldValue: correction.status, newValue: 'archived' }],
      });

      return res.json({ data: { success: true } });
    } catch (error) {
      console.error('Archive correction error:', error);
      return res.status(500).json({
        error: { code: 'archive_error', message: 'Failed to archive correction', requestId: res.locals.requestId },
      });
    }
  });

  // Bulk archive corrections
  router.post('/bulk/archive', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { ids } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canApproveCorrections(authUser)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'You don\'t have permission to archive corrections', requestId: res.locals.requestId },
        });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          error: { code: 'ids_required', message: 'Array of correction IDs is required', requestId: res.locals.requestId },
        });
      }

      if (ids.length > 100) {
        return res.status(400).json({
          error: { code: 'too_many_ids', message: 'Cannot archive more than 100 corrections at once', requestId: res.locals.requestId },
        });
      }

      const now = new Date().toISOString();
      const batch = db.batch();
      const archivedCorrections: { id: string; storeNumber: string; previousStatus: string }[] = [];
      const skippedIds: string[] = [];

      for (const id of ids) {
        const correctionRef = db.collection('corrections').doc(id);
        const correctionDoc = await correctionRef.get();
        
        if (!correctionDoc.exists) {
          skippedIds.push(id);
          continue;
        }
        
        const correction = correctionDoc.data() as Correction;
        if (correction.status === 'archived') {
          skippedIds.push(id);
          continue;
        }

        batch.update(correctionRef, {
          status: 'archived',
          archivedAt: now,
          archivedBy: authUser.uid,
          archivedByEmail: authUser.email,
          previousStatus: correction.status,
          updatedAt: now,
          updatedBy: authUser.uid,
          version: correction.version + 1,
        });
        archivedCorrections.push({ id, storeNumber: correction.storeNumber, previousStatus: correction.status });
      }

      if (archivedCorrections.length > 0) {
        await batch.commit();

        // Log one audit entry per item
        for (const { id, storeNumber, previousStatus } of archivedCorrections) {
          await logAudit(db, {
            userId: authUser.uid,
            userEmail: authUser.email,
            userRole: authUser.role,
            action: 'archive',
            entityType: 'correction',
            entityId: id,
            entityName: `Correction for ${storeNumber}`,
            changes: [{ field: 'status', oldValue: previousStatus, newValue: 'archived' }],
          });
        }

        // Plus a summary entry
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'bulk_archive',
          entityType: 'correction',
          entityId: 'bulk',
          entityName: `Bulk archive (${archivedCorrections.length} corrections)`,
          changes: [{ field: 'archived_count', newValue: archivedCorrections.length }],
        });
      }
      
      const archivedIds = archivedCorrections.map(c => c.id);

      return res.json({ 
        data: { 
          success: true, 
          archived: archivedIds.length, 
          skipped: skippedIds.length,
          archivedIds,
          skippedIds,
        } 
      });
    } catch (error) {
      console.error('Bulk archive corrections error:', error);
      return res.status(500).json({
        error: { code: 'bulk_archive_error', message: 'Failed to archive corrections', requestId: res.locals.requestId },
      });
    }
  });

  // Bulk close (reject) corrections
  router.post('/bulk/close', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { ids, notes } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canApproveCorrections(authUser)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'You don\'t have permission to close corrections', requestId: res.locals.requestId },
        });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          error: { code: 'ids_required', message: 'Array of correction IDs is required', requestId: res.locals.requestId },
        });
      }

      if (ids.length > 100) {
        return res.status(400).json({
          error: { code: 'too_many_ids', message: 'Cannot close more than 100 corrections at once', requestId: res.locals.requestId },
        });
      }

      const now = new Date().toISOString();
      const batch = db.batch();
      const closedCorrections: { id: string; storeNumber: string }[] = [];
      const skippedIds: string[] = [];

      for (const id of ids) {
        const correctionRef = db.collection('corrections').doc(id);
        const correctionDoc = await correctionRef.get();
        
        if (!correctionDoc.exists) {
          skippedIds.push(id);
          continue;
        }
        
        const correction = correctionDoc.data() as Correction;
        if (correction.status !== 'pending') {
          skippedIds.push(id);
          continue;
        }

        batch.update(correctionRef, {
          status: 'rejected',
          reviewedBy: authUser.uid,
          reviewedByEmail: authUser.email,
          reviewedAt: now,
          reviewNotes: notes || 'Bulk closed',
          updatedAt: now,
          updatedBy: authUser.uid,
          version: correction.version + 1,
        });
        closedCorrections.push({ id, storeNumber: correction.storeNumber });
      }

      if (closedCorrections.length > 0) {
        await batch.commit();

        // Log one audit entry per item
        for (const { id, storeNumber } of closedCorrections) {
          await logAudit(db, {
            userId: authUser.uid,
            userEmail: authUser.email,
            userRole: authUser.role,
            action: 'reject',
            entityType: 'correction',
            entityId: id,
            entityName: `Correction for ${storeNumber}`,
            changes: [{ field: 'status', oldValue: 'pending', newValue: 'rejected' }],
          });
        }

        // Plus a summary entry
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'bulk_close',
          entityType: 'correction',
          entityId: 'bulk',
          entityName: `Bulk close (${closedCorrections.length} corrections)`,
          changes: [{ field: 'closed_count', newValue: closedCorrections.length }],
        });
      }
      
      const closedIds = closedCorrections.map(c => c.id);

      return res.json({ 
        data: { 
          success: true, 
          closed: closedIds.length, 
          skipped: skippedIds.length,
          closedIds,
          skippedIds,
        } 
      });
    } catch (error) {
      console.error('Bulk close corrections error:', error);
      return res.status(500).json({
        error: { code: 'bulk_close_error', message: 'Failed to close corrections', requestId: res.locals.requestId },
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

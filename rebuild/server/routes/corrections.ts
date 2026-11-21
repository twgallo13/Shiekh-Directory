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
import { sanitizeLocationProposal, validateReviewUrl } from '../../src/lib/storePageValidation';
import { assertCanFileFor, assertStoredStoreOwner } from '../storePage/access';
import { approveStoreLinkRequest, transitionStoreLinkRequest } from '../storePage/approveStoreLink';
import { HttpError, isAlreadyExists } from '../storePage/httpError';

const VALID_CORRECTION_TYPES = new Set(['phone', 'address', 'inbox', 'hours', 'store-page']);

class PendingStoreLinkError extends HttpError {
  readonly existingId: string;

  constructor(existingId: string) {
    super(409, 'pending_store_link', 'A review link change is already pending for this store.');
    this.existingId = existingId;
  }
}

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
      
      let query: FirebaseFirestore.Query = db.collection('corrections');
      
      if (myRequests) {
        query = query
          .where('submittedBy', '==', authUser.uid)
          .orderBy('submittedAt', 'desc');
      } else if (locationId) {
        // Filter by locationId in query for efficiency
        const statusFilter = status || 'pending';
        query = query
          .where('locationId', '==', locationId)
          .where('status', '==', statusFilter)
          .orderBy('submittedAt', 'desc');
        
        if (!canApproveCorrections(authUser)) {
          query = query.where('submittedBy', '==', authUser.uid);
        }
      } else {
        const statusFilter = status || 'pending';
        query = query
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

      if (correction.category === 'store-link') {
        const result = await approveStoreLinkRequest(db, authUser, id, notes, res.locals.requestId);
        return res.status(result.status).json(result.body);
      }

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

      const owner = await assertStoredStoreOwner(db, correction);
      if (!owner.ok) {
        return res.status(owner.status).json({
          error: { code: owner.code, message: owner.message, requestId: res.locals.requestId },
        });
      }

      const sanitized = sanitizeLocationProposal(correction.proposedChanges);
      if (!sanitized.ok) {
        return res.status(400).json({
          error: { code: sanitized.code, message: sanitized.message, requestId: res.locals.requestId },
        });
      }

      const batch = db.batch();
      const auditChanges: { field: string; oldValue?: string | null; newValue: string | null }[] = [];

      // Handle special case: addHoursException (Item #4: Store holiday hours with approval)
      if (sanitized.changes.addHoursException) {
        const exceptionData = sanitized.changes.addHoursException as Record<string, unknown>;
        const exceptionRef = db.collection(`locations/${correction.locationId}/hoursExceptions`).doc();
        batch.set(exceptionRef, exceptionData);
        auditChanges.push({
          field: 'hoursException',
          newValue: (exceptionData.label as string) || 'Hours exception added',
        });
      }

      // Handle regular location field updates
      const regularChanges = { ...sanitized.changes };
      delete regularChanges.addHoursException;
      
      if (Object.keys(regularChanges).length > 0) {
        const updateData: Record<string, unknown> = {
          ...regularChanges,
          updatedAt: new Date().toISOString(),
          updatedBy: authUser.uid,
          version: location.version + 1,
        };
        batch.update(locationRef, updateData);

        for (const [field, value] of Object.entries(regularChanges)) {
          auditChanges.push({
            field,
            oldValue: (correction.currentValues[field] as string) ?? null,
            newValue: value as string,
          });
        }
      } else if (sanitized.changes.addHoursException) {
        // Just update the location version even if only adding an hours exception
        batch.update(locationRef, {
          updatedAt: new Date().toISOString(),
          updatedBy: authUser.uid,
          version: location.version + 1,
        });
      }

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
        changes: auditChanges.length > 0 ? auditChanges : [{ field: 'status', newValue: 'approved' }],
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

      const validCategories = ['address', 'suite', 'directions', 'phone', 'hours', 'manager', 'other', 'store-link'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          error: { code: 'invalid_category', message: 'Invalid category', requestId: res.locals.requestId },
        });
      }

      if (type !== undefined && type !== null && type !== '') {
        if (typeof type !== 'string' || !VALID_CORRECTION_TYPES.has(type)) {
          return res.status(400).json({
            error: { code: 'invalid_type', message: 'That request type is not allowed.', requestId: res.locals.requestId },
          });
        }
        if (type === 'store-page' && category !== 'store-link') {
          return res.status(400).json({
            error: { code: 'invalid_type', message: 'store-page is only valid for a store page link request.', requestId: res.locals.requestId },
          });
        }
        if (category === 'store-link' && type !== 'store-page') {
          return res.status(400).json({
            error: { code: 'invalid_type', message: 'A store page link request must use type store-page.', requestId: res.locals.requestId },
          });
        }
      }

      const locationDoc = await db.collection('locations').doc(locationId).get();
      if (!locationDoc.exists) {
        return res.status(404).json({
          error: { code: 'location_not_found', message: 'Location not found', requestId: res.locals.requestId },
        });
      }

      const location = locationDoc.data() as Location;

      const filing = assertCanFileFor(authUser, locationId);
      if (!filing.ok) {
        return res.status(filing.status).json({
          error: { code: filing.code, message: filing.message, requestId: res.locals.requestId },
        });
      }

      if (category === 'store-link') {
        if (authUser.role === 'Steward' || authUser.role === 'Admin') {
          return res.status(403).json({
            error: {
              code: 'use_direct_edit',
              message: 'Edit the review link on the store page. Stewards and Admins do not file this request.',
              requestId: res.locals.requestId,
            },
          });
        }
        if (authUser.role !== 'Store' && authUser.role !== 'Leader') {
          return res.status(403).json({
            error: { code: 'forbidden', message: 'You cannot request a review link change.', requestId: res.locals.requestId },
          });
        }
        if (authUser.role === 'Leader' && !authUser.leaderScope?.locationIds?.includes(locationId)) {
          return res.status(403).json({
            error: { code: 'out_of_scope', message: 'That store is outside your district.', requestId: res.locals.requestId },
          });
        }
        if (!proposedChanges || typeof proposedChanges !== 'object' || Array.isArray(proposedChanges)) {
          return res.status(400).json({
            error: { code: 'invalid_proposed_changes', message: 'Send a review link.', requestId: res.locals.requestId },
          });
        }
        const proposedKeys = Object.keys(proposedChanges as Record<string, unknown>);
        if (proposedKeys.length !== 1 || proposedKeys[0] !== 'reviewUrl') {
          return res.status(400).json({
            error: { code: 'invalid_proposed_changes', message: 'A store page link request can only change the review link.', requestId: res.locals.requestId },
          });
        }
        const review = validateReviewUrl((proposedChanges as Record<string, unknown>).reviewUrl);
        if (!review.ok || !review.href) {
          return res.status(400).json({
            error: { code: 'invalid_review_url', message: review.ok ? 'Enter a review link.' : review.message, requestId: res.locals.requestId },
          });
        }

        const pageSnap = await db.collection('storePages').doc(locationId).get();
        const storePageVersion = pageSnap.exists ? Number(pageSnap.data()?.version ?? 0) : 0;
        const now = new Date();
        const nowIso = now.toISOString();
        const workflowRules = await getWorkflowRules(db);
        const expiresAt = new Date(now.getTime() + workflowRules.correctionExpiryDays * 24 * 60 * 60 * 1000);
        const correctionRef = db.collection('corrections').doc();
        const lockRef = db.collection('storeLinkPending').doc(locationId);
        const correction: Omit<Correction, 'id'> = {
          status: 'pending',
          type: 'store-page',
          category: 'store-link',
          locationId,
          locationName: location.name,
          storeNumber: location.storeNumber,
          submittedBy: authUser.uid,
          submittedByEmail: authUser.email,
          submittedByRole: authUser.role,
          submittedAt: nowIso,
          expiresAt: expiresAt.toISOString(),
          proposedChanges: { reviewUrl: review.href },
          proposedNote: typeof proposedNote === 'string' ? proposedNote.trim() || undefined : undefined,
          currentValues: { reviewUrl: pageSnap.exists ? (pageSnap.data()?.reviewUrl ?? null) : null },
          locationVersion: location.version,
          storePageVersion,
          createdAt: nowIso,
          updatedAt: nowIso,
          updatedBy: authUser.uid,
          version: 1,
        };
        try {
          await db.runTransaction(async (tx) => {
            const lockSnap = await tx.get(lockRef);
            const pendingSnap = await tx.get(
              db.collection('corrections')
                .where('locationId', '==', locationId)
                .where('status', '==', 'pending')
                .orderBy('submittedAt', 'desc'),
            );
            const existing = pendingSnap.docs.find((doc) => doc.data().category === 'store-link');
            if (lockSnap.exists || existing) {
              const existingId = existing?.id
                || (typeof lockSnap.data()?.correctionId === 'string' ? lockSnap.data()?.correctionId : '');
              throw new PendingStoreLinkError(existingId);
            }
            tx.create(lockRef, { correctionId: correctionRef.id, locationId, createdAt: nowIso });
            tx.set(correctionRef, correction);
            const auditRef = db.collection('auditLog').doc();
            tx.set(auditRef, {
              id: auditRef.id,
              timestamp: nowIso,
              userId: authUser.uid,
              userEmail: authUser.email,
              userRole: authUser.role,
              action: 'create',
              entityType: 'correction',
              entityId: correctionRef.id,
              entityName: `Store page link for ${location.storeNumber}`,
              changes: [
                { field: 'category', newValue: 'store-link' },
                { field: 'status', newValue: 'pending' },
              ],
            });
          });
        } catch (error) {
          if (error instanceof PendingStoreLinkError || (error instanceof HttpError && error.code === 'pending_store_link')) {
            const existingId = error instanceof PendingStoreLinkError ? error.existingId : '';
            return res.status(409).json({
              error: {
                code: 'pending_store_link',
                message: 'A review link change is already pending for this store.',
                ...(existingId ? { existingId } : {}),
                requestId: res.locals.requestId,
              },
            });
          }
          if (isAlreadyExists(error)) {
            const lock = await lockRef.get();
            const existingId = typeof lock.data()?.correctionId === 'string' ? lock.data()?.correctionId : '';
            return res.status(409).json({
              error: {
                code: 'pending_store_link',
                message: 'A review link change is already pending for this store.',
                ...(existingId ? { existingId } : {}),
                requestId: res.locals.requestId,
              },
            });
          }
          throw error;
        }
        return res.status(201).json({ data: { id: correctionRef.id, ...correction } });
      }

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

      if (correction.category === 'store-link') {
        if (correction.submittedBy !== authUser.uid) {
          return res.status(403).json({
            error: { code: 'forbidden', message: 'You can only cancel your own requests', requestId: res.locals.requestId },
          });
        }
        const result = await transitionStoreLinkRequest(db, id, authUser, 'cancelled', undefined, res.locals.requestId);
        return res.status(result.status).json(result.body);
      }

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

      if (correction.category === 'store-link') {
        const result = await transitionStoreLinkRequest(db, id, authUser, 'rejected', notes, res.locals.requestId);
        return res.status(result.status).json(result.body);
      }

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

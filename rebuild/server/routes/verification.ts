import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { randomBytes, createHmac } from 'crypto';
import type {
  Location,
  AuthUser,
  AuditLogEntry,
  VerificationRequest,
} from '../../src/types';
import { createMailService } from '../services/mail';
import { createVerificationRequestEmail } from '../services/mailTemplates';

const APP_URL = process.env.APP_URL || 'https://directory.shiekh.com';
const TOKEN_SECRET = process.env.STORE_AUTH_TOKEN_SECRET || 'dev-token-secret-not-for-production';

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
  return createHmac('sha256', TOKEN_SECRET).update(token).digest('hex');
}

export function createVerificationRouter(db: Firestore): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { status, locationId } = req.query;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const isAdminOrSteward = authUser.role === 'Admin' || authUser.role === 'Steward';
      const isLeaderWithScope = authUser.role === 'Leader' && authUser.leaderScope?.locationIds?.length;

      if (!isAdminOrSteward && !isLeaderWithScope) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Access denied to verification requests', requestId: res.locals.requestId },
        });
      }

      let requests: VerificationRequest[] = [];

      if (isLeaderWithScope && !isAdminOrSteward) {
        const leaderLocationIds = authUser.leaderScope!.locationIds;
        
        if (locationId && !leaderLocationIds.includes(locationId as string)) {
          return res.status(403).json({
            error: { code: 'forbidden', message: 'You can only view verification requests for your stores', requestId: res.locals.requestId },
          });
        }

        const targetLocationIds = locationId 
          ? [locationId as string] 
          : leaderLocationIds;

        const CHUNK_SIZE = 30;
        const allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
        
        for (let i = 0; i < targetLocationIds.length; i += CHUNK_SIZE) {
          const chunk = targetLocationIds.slice(i, i + CHUNK_SIZE);
          let query = db.collection('verificationRequests')
            .where('locationId', 'in', chunk);

          if (status) {
            query = query.where('status', '==', status);
          }

          const chunkSnap = await query.get();
          allDocs.push(...chunkSnap.docs);
        }

        requests = allDocs
          .map(doc => ({ id: doc.id, ...doc.data() }) as VerificationRequest)
          .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
          .slice(0, 100);
      } else {
        let query = db.collection('verificationRequests')
          .orderBy('sentAt', 'desc')
          .limit(100);

        if (status) {
          query = query.where('status', '==', status);
        }

        if (locationId) {
          query = query.where('locationId', '==', locationId);
        }

        const snapshot = await query.get();
        requests = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as VerificationRequest[];
      }

      return res.json({ data: requests });
    } catch (error) {
      console.error('List verification requests error:', error);
      return res.status(500).json({
        error: { code: 'list_error', message: 'Failed to list verification requests', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { locationId } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (authUser.role !== 'Admin' && authUser.role !== 'Steward') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Admin and Steward can send verification requests', requestId: res.locals.requestId },
        });
      }

      if (!locationId) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'locationId is required', requestId: res.locals.requestId },
        });
      }

      const locationDoc = await db.collection('locations').doc(locationId).get();
      if (!locationDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Location not found', requestId: res.locals.requestId },
        });
      }

      const location = locationDoc.data() as Location;

      if (location.kind === 'facility') {
        return res.status(400).json({
          error: { code: 'facility_excluded', message: 'Verification requests cannot be created for facilities', requestId: res.locals.requestId },
        });
      }
      
      if (!location.sharedInboxEmail) {
        return res.status(400).json({
          error: { code: 'no_email', message: 'Location has no shared inbox email configured', requestId: res.locals.requestId },
        });
      }

      const pendingRequests = await db.collection('verificationRequests')
        .where('locationId', '==', locationId)
        .where('status', '==', 'pending')
        .get();

      if (!pendingRequests.empty) {
        return res.status(400).json({
          error: { code: 'pending_exists', message: 'A verification request is already pending for this location', requestId: res.locals.requestId },
        });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const requestRef = db.collection('verificationRequests').doc();
      const verificationRequest: Omit<VerificationRequest, 'id'> = {
        locationId,
        locationName: location.name,
        storeNumber: location.storeNumber,
        status: 'pending',
        sentAt: now.toISOString(),
        sentTo: location.sharedInboxEmail,
        sentBy: authUser.uid,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        updatedBy: authUser.uid,
        version: 1,
      };

      await requestRef.set(verificationRequest);

      const confirmToken = generateToken();
      const updateToken = generateToken();

      const baseTokenData = {
        locationId: location.id,
        storeNumber: location.storeNumber,
        storeEmail: location.sharedInboxEmail,
        verificationRequestId: requestRef.id,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        createdBy: authUser.uid,
      };

      await db.collection('storeAuthTokens').doc(hashToken(confirmToken)).set({
        ...baseTokenData,
        action: 'confirm',
      });

      await db.collection('storeAuthTokens').doc(hashToken(updateToken)).set({
        ...baseTokenData,
        action: 'update',
      });

      const confirmUrl = `${APP_URL}/verify-action?token=${confirmToken}&action=confirm`;
      const updateUrl = `${APP_URL}/verify-action?token=${updateToken}&action=update`;

      const mailService = createMailService(db);
      const verificationUrl = `${APP_URL}/verify/${requestRef.id}`;
      const emailData = {
        storeName: location.name,
        storeNumber: location.storeNumber,
        storeEmail: location.sharedInboxEmail,
        verificationUrl,
        expiresAt: expiresAt.toISOString(),
        confirmUrl,
        updateUrl,
        hours: location.standardHours,
        wayfindingDirections: location.wayfindingDirections,
      };

      const email = createVerificationRequestEmail(emailData);
      const mailResult = await mailService.send(email);

      if (mailResult.success && !mailResult.blocked) {
        await requestRef.update({
          emailSent: true,
          emailMessageId: mailResult.messageId,
        });
      } else if (mailResult.blocked) {
        await requestRef.update({
          emailSent: false,
          emailError: mailResult.reason,
        });
        console.log(`[Verification] Email blocked for ${location.storeNumber}: ${mailResult.reason}`);
        console.log(`[Verification] One-click confirm URL: ${confirmUrl}`);
        console.log(`[Verification] One-click update URL: ${updateUrl}`);
      } else {
        await requestRef.update({
          emailSent: false,
          emailError: mailResult.error,
        });
        console.error(`[Verification] Email failed for ${location.storeNumber}: ${mailResult.error}`);
      }

      await db.collection('mailLog').add({
        to: location.sharedInboxEmail,
        type: 'verification-request',
        verificationRequestId: requestRef.id,
        locationId: location.id,
        storeNumber: location.storeNumber,
        verificationUrl,
        confirmUrl,
        updateUrl,
        sentAt: now.toISOString(),
        sentBy: authUser.uid,
        sentByEmail: authUser.email,
        success: mailResult.success && !mailResult.blocked,
        blocked: mailResult.blocked,
        reason: mailResult.reason || mailResult.error,
        expiresAt: expiresAt.toISOString(),
      });

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'send',
        entityType: 'verification',
        entityId: requestRef.id,
        entityName: `Verification request for ${location.storeNumber}`,
        locationId,
        changes: [
          { field: 'sentTo', newValue: location.sharedInboxEmail },
          { field: 'expiresAt', newValue: expiresAt.toISOString() },
          { field: 'emailSent', newValue: mailResult.success && !mailResult.blocked },
        ],
      });

      const savedRequest = await requestRef.get();
      return res.status(201).json({
        data: { id: requestRef.id, ...savedRequest.data() },
        email: {
          sent: mailResult.success && !mailResult.blocked,
          blocked: mailResult.blocked,
          reason: mailResult.reason || mailResult.error,
        },
        testLinks: mailResult.blocked ? { confirmUrl, updateUrl, verificationUrl } : undefined,
      });
    } catch (error) {
      console.error('Create verification request error:', error);
      return res.status(500).json({
        error: { code: 'create_error', message: 'Failed to create verification request', requestId: res.locals.requestId },
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

      const requestDoc = await db.collection('verificationRequests').doc(id).get();
      if (!requestDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Verification request not found', requestId: res.locals.requestId },
        });
      }

      const request = { id: requestDoc.id, ...requestDoc.data() } as VerificationRequest;

      if (authUser.role === 'Store' && authUser.storeLocationId !== request.locationId) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'You can only view verification requests for your own store', requestId: res.locals.requestId },
        });
      }

      if (authUser.role === 'Viewer') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Viewers cannot access verification requests', requestId: res.locals.requestId },
        });
      }

      return res.json({ data: request });
    } catch (error) {
      console.error('Get verification request error:', error);
      return res.status(500).json({
        error: { code: 'get_error', message: 'Failed to get verification request', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/:id/respond', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;
      const { hoursConfirmed, proposedChanges } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const requestDoc = await db.collection('verificationRequests').doc(id).get();
      if (!requestDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Verification request not found', requestId: res.locals.requestId },
        });
      }

      const request = { id: requestDoc.id, ...requestDoc.data() } as VerificationRequest;

      if (authUser.role === 'Store' && authUser.storeLocationId !== request.locationId) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'You can only respond to verification requests for your own store', requestId: res.locals.requestId },
        });
      }

      if (authUser.role === 'Viewer') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Viewers cannot respond to verification requests', requestId: res.locals.requestId },
        });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({
          error: { code: 'invalid_status', message: 'This verification request has already been processed', requestId: res.locals.requestId },
        });
      }

      const now = new Date();
      if (new Date(request.expiresAt) < now) {
        await db.collection('verificationRequests').doc(id).update({
          status: 'expired',
          updatedAt: now.toISOString(),
          updatedBy: authUser.uid,
        });
        return res.status(400).json({
          error: { code: 'expired', message: 'This verification request has expired', requestId: res.locals.requestId },
        });
      }

      const hasProposedChanges = proposedChanges && Object.keys(proposedChanges).length > 0;
      const newStatus = hasProposedChanges ? 'pending' : 'confirmed';

      await db.collection('verificationRequests').doc(id).update({
        status: newStatus,
        respondedAt: now.toISOString(),
        respondedBy: authUser.uid,
        hoursConfirmed: hoursConfirmed === true,
        proposedChanges: proposedChanges || null,
        updatedAt: now.toISOString(),
        updatedBy: authUser.uid,
        version: (request.version || 0) + 1,
      });

      if (!hasProposedChanges && hoursConfirmed) {
        await db.collection('locations').doc(request.locationId).update({
          lastVerifiedAt: now.toISOString(),
          lastVerifiedBy: authUser.uid,
          updatedAt: now.toISOString(),
          updatedBy: authUser.uid,
        });

        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'respond',
          entityType: 'verification',
          entityId: id,
          entityName: `${request.storeNumber} verified`,
          locationId: request.locationId,
          changes: [
            { field: 'hoursConfirmed', newValue: true },
            { field: 'lastVerifiedAt', newValue: now.toISOString() },
          ],
        });
      } else if (hasProposedChanges) {
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'respond',
          entityType: 'verification',
          entityId: id,
          entityName: `${request.storeNumber} verification response`,
          locationId: request.locationId,
          changes: [
            { field: 'proposedChanges', newValue: 'submitted' },
          ],
        });
      }

      return res.json({
        data: {
          id,
          status: newStatus,
          respondedAt: now.toISOString(),
          hoursConfirmed,
          proposedChanges,
        },
      });
    } catch (error) {
      console.error('Respond to verification request error:', error);
      return res.status(500).json({
        error: { code: 'respond_error', message: 'Failed to respond to verification request', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/:id/approve', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;
      const { notes, applyChanges } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (authUser.role !== 'Admin' && authUser.role !== 'Steward') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Admin and Steward can approve verification responses', requestId: res.locals.requestId },
        });
      }

      const requestDoc = await db.collection('verificationRequests').doc(id).get();
      if (!requestDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Verification request not found', requestId: res.locals.requestId },
        });
      }

      const request = { id: requestDoc.id, ...requestDoc.data() } as VerificationRequest;

      if (request.status === 'confirmed') {
        return res.status(400).json({
          error: { code: 'invalid_status', message: 'This verification request is already confirmed', requestId: res.locals.requestId },
        });
      }

      if (request.status === 'expired') {
        return res.status(400).json({
          error: { code: 'invalid_status', message: 'This verification request has expired', requestId: res.locals.requestId },
        });
      }

      if (!request.respondedAt) {
        return res.status(400).json({
          error: { code: 'no_response', message: 'Store has not responded to this verification request', requestId: res.locals.requestId },
        });
      }

      const now = new Date();
      const locationRef = db.collection('locations').doc(request.locationId);
      const locationDoc = await locationRef.get();
      const location = locationDoc.data() as Location;

      const auditChanges: { field: string; oldValue?: string | number | boolean | null; newValue?: string | number | boolean | null }[] = [];

      if (applyChanges !== false && request.proposedChanges) {
        const updateData: Record<string, unknown> = {
          lastVerifiedAt: now.toISOString(),
          lastVerifiedBy: authUser.uid,
          updatedAt: now.toISOString(),
          updatedBy: authUser.uid,
          version: (location.version || 0) + 1,
        };

        for (const [field, value] of Object.entries(request.proposedChanges)) {
          if (field === 'mainPhone' || field === 'sharedInboxEmail' || field === 'address') {
            updateData[field] = value;
            const oldVal = location[field as keyof Location];
            auditChanges.push({ 
              field, 
              oldValue: (typeof oldVal === 'string' || typeof oldVal === 'number' || typeof oldVal === 'boolean') ? oldVal : null, 
              newValue: (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') ? value : null 
            });
          }
        }

        await locationRef.update(updateData);
        auditChanges.push({ field: 'lastVerifiedAt', newValue: now.toISOString() });
      } else {
        await locationRef.update({
          lastVerifiedAt: now.toISOString(),
          lastVerifiedBy: authUser.uid,
          updatedAt: now.toISOString(),
          updatedBy: authUser.uid,
          version: (location.version || 0) + 1,
        });
        auditChanges.push({ field: 'lastVerifiedAt', newValue: now.toISOString() });
      }

      await db.collection('verificationRequests').doc(id).update({
        status: 'confirmed',
        reviewedAt: now.toISOString(),
        reviewedBy: authUser.uid,
        reviewNotes: notes || null,
        updatedAt: now.toISOString(),
        updatedBy: authUser.uid,
        version: (request.version || 0) + 1,
      });

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'approve',
        entityType: 'verification',
        entityId: id,
        entityName: `${request.storeNumber} verification approved`,
        locationId: request.locationId,
        changes: auditChanges,
      });

      return res.json({
        data: {
          id,
          status: 'confirmed',
          reviewedAt: now.toISOString(),
          changesApplied: applyChanges !== false && !!request.proposedChanges,
        },
      });
    } catch (error) {
      console.error('Approve verification error:', error);
      return res.status(500).json({
        error: { code: 'approve_error', message: 'Failed to approve verification', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/:id/cancel', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (authUser.role !== 'Admin' && authUser.role !== 'Steward') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Admin and Steward can cancel verification requests', requestId: res.locals.requestId },
        });
      }

      const requestDoc = await db.collection('verificationRequests').doc(id).get();
      if (!requestDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Verification request not found', requestId: res.locals.requestId },
        });
      }

      const request = { id: requestDoc.id, ...requestDoc.data() } as VerificationRequest;

      if (request.status !== 'pending') {
        return res.status(400).json({
          error: { code: 'invalid_status', message: `Cannot cancel a verification request that is ${request.status}`, requestId: res.locals.requestId },
        });
      }

      const now = new Date();

      await db.collection('verificationRequests').doc(id).update({
        status: 'cancelled',
        cancelledAt: now.toISOString(),
        cancelledBy: authUser.uid,
        updatedAt: now.toISOString(),
        updatedBy: authUser.uid,
        version: (request.version || 0) + 1,
      });

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'cancel',
        entityType: 'verification',
        entityId: id,
        entityName: `${request.storeNumber} verification cancelled`,
        locationId: request.locationId,
        changes: [
          { field: 'status', oldValue: 'pending', newValue: 'cancelled' },
        ],
      });

      return res.json({
        data: {
          id,
          status: 'cancelled',
          cancelledAt: now.toISOString(),
        },
      });
    } catch (error) {
      console.error('Cancel verification error:', error);
      return res.status(500).json({
        error: { code: 'cancel_error', message: 'Failed to cancel verification request', requestId: res.locals.requestId },
      });
    }
  });

  router.get('/pending/for-store', async (_req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (authUser.role !== 'Store' || !authUser.storeLocationId) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'This endpoint is for store accounts only', requestId: res.locals.requestId },
        });
      }

      const snapshot = await db.collection('verificationRequests')
        .where('locationId', '==', authUser.storeLocationId)
        .where('status', '==', 'pending')
        .orderBy('sentAt', 'desc')
        .limit(1)
        .get();

      if (snapshot.empty) {
        return res.json({ data: null });
      }

      const request = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as VerificationRequest;
      
      const now = new Date();
      if (new Date(request.expiresAt) < now && !request.respondedAt) {
        await db.collection('verificationRequests').doc(request.id).update({
          status: 'expired',
          updatedAt: now.toISOString(),
        });
        return res.json({ data: null });
      }

      return res.json({ data: request });
    } catch (error) {
      console.error('Get pending verification for store error:', error);
      return res.status(500).json({
        error: { code: 'get_error', message: 'Failed to get pending verification', requestId: res.locals.requestId },
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

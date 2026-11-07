import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import type {
  Location,
  AuthUser,
  AuditLogEntry,
  VerificationRequest,
} from '../../src/types';
import { getStoreTypeLabel } from '../../src/types';
import { createUnifiedMailService } from '../services/unifiedMail';
import { generateToken, hashToken } from '../services/tokenAuth';
import { getWorkflowRules } from '../services/workflowSettings';
import { getAppBaseUrl } from './emailSettings';

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
      const { locationId, isTest } = req.body;

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

      if (typeof locationId !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'locationId must be a string', requestId: res.locals.requestId },
        });
      }

      const locationDoc = await db.collection('locations').doc(locationId).get();
      if (!locationDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Location not found', requestId: res.locals.requestId },
        });
      }

      const location = { id: locationDoc.id, ...locationDoc.data() } as Location;

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

      // Check for any active (non-terminal) verification requests
      const activeStatuses = ['pending', 'awaiting_response', 'in_review'];
      const existingRequests = await db.collection('verificationRequests')
        .where('locationId', '==', locationId)
        .where('status', 'in', activeStatuses)
        .get();

      if (!existingRequests.empty) {
        const existingStatus = existingRequests.docs[0].data().status;
        const statusMessage = existingStatus === 'in_review' 
          ? 'A verification request is in review for this location'
          : 'A verification request is already pending for this location';
        return res.status(400).json({
          error: { code: 'pending_exists', message: statusMessage, requestId: res.locals.requestId },
        });
      }

      const workflowRules = await getWorkflowRules(db);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + workflowRules.requestExpiryDays * 24 * 60 * 60 * 1000);

      // #10: Look up the store's DM as default assignee
      let assigneeId: string | undefined;
      let assigneeName: string | undefined;
      if (location.districtId) {
        const dmAssignment = await db.collection('assignments')
          .where('scopeType', '==', 'district')
          .where('scopeId', '==', location.districtId)
          .where('role', '==', 'DM')
          .where('capacity', '==', 'primary')
          .limit(1)
          .get();
        if (!dmAssignment.empty) {
          const dmData = dmAssignment.docs[0].data();
          assigneeId = dmData.personId;
          const personDoc = await db.collection('people').doc(dmData.personId).get();
          if (personDoc.exists) {
            assigneeName = (personDoc.data() as { fullName?: string }).fullName;
          }
        }
      }

      const requestRef = db.collection('verificationRequests').doc();
      // r27 fix #6: Only Admin can set isTest flag (Steward cannot mark as test)
      const testFlag = isTest === true && authUser.role === 'Admin' ? true : undefined;
      
      const verificationRequest: Omit<VerificationRequest, 'id'> = {
        locationId,
        locationName: location.name,
        storeNumber: location.storeNumber,
        storeType: location.storeType || undefined, // Item #10: Include store type
        assigneeId, // #10: Default to DM
        assigneeName, // #10: Default to DM
        status: 'pending',
        sentAt: now.toISOString(),
        sentTo: location.sharedInboxEmail,
        sentBy: authUser.uid,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        updatedBy: authUser.uid,
        version: 1,
        isTest: testFlag, // r27 fix #6: Only set if Admin explicitly passes isTest: true
      };

      await requestRef.set(verificationRequest);

      const confirmToken = generateToken();
      const updateToken = generateToken();
      const confirmTokenId = `tok_${randomBytes(8).toString('hex')}`;
      const updateTokenId = `tok_${randomBytes(8).toString('hex')}`;

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
        tokenId: confirmTokenId,
      });

      await db.collection('storeAuthTokens').doc(hashToken(updateToken)).set({
        ...baseTokenData,
        action: 'update',
        tokenId: updateTokenId,
      });

      // r31 #3: Store token hash (not plain text) for security
      // Test link retrieval now uses storeAuthTokens via hash lookup
      await db.collection('testTokens').doc(confirmTokenId).set({
        tokenHash: hashToken(confirmToken),
        action: 'confirm',
        verificationRequestId: requestRef.id,
        locationId: location.id,
        storeNumber: location.storeNumber,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        createdBy: authUser.uid,
      });

      await db.collection('testTokens').doc(updateTokenId).set({
        tokenHash: hashToken(updateToken),
        action: 'update',
        verificationRequestId: requestRef.id,
        locationId: location.id,
        storeNumber: location.storeNumber,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        createdBy: authUser.uid,
      });

      let appUrl: string;
      try {
        appUrl = await getAppBaseUrl(db);
      } catch (error) {
        console.error('[Verification] appBaseUrl not configured:', error);
        return res.status(503).json({
          error: { code: 'config_error', message: 'Email settings not configured. Set appBaseUrl in Admin > Email Settings.', requestId: res.locals.requestId },
        });
      }
      const confirmUrl = `${appUrl}/verify-action?token=${confirmToken}&action=confirm`;
      const updateUrl = `${appUrl}/verify-action?token=${updateToken}&action=update`;
      const confirmUrlRedacted = `${appUrl}/verify-action?token=[REDACTED:${confirmTokenId}]&action=confirm`;
      const updateUrlRedacted = `${appUrl}/verify-action?token=[REDACTED:${updateTokenId}]&action=update`;

      const mailService = createUnifiedMailService(db);
      const verificationUrl = `${appUrl}/verify/${requestRef.id}`;
      const emailData = {
        storeName: location.name,
        storeNumber: location.storeNumber,
        storeEmail: location.sharedInboxEmail,
        storeType: getStoreTypeLabel(location.storeType),
        verificationUrl,
        expiresAt: expiresAt.toISOString(),
        confirmUrl,
        updateUrl,
        hours: location.standardHours,
        wayfindingDirections: location.wayfindingDirections,
        verificationRequestId: requestRef.id, // #7: For bounce tracking
        locationId: location.id, // #7: For bounce tracking
      };

      const mailResult = await mailService.sendVerificationRequest(emailData, authUser.uid, authUser.email);

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
        console.log(`[Verification] One-click confirm token ID: ${confirmTokenId}`);
        console.log(`[Verification] One-click update token ID: ${updateTokenId}`);
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
        verificationUrl: `${appUrl}/verify/[REDACTED]`,
        confirmUrl: confirmUrlRedacted,
        updateUrl: updateUrlRedacted,
        confirmTokenId,
        updateTokenId,
        sentAt: now.toISOString(),
        sentBy: authUser.uid,
        sentByEmail: authUser.email,
        success: mailResult.success && !mailResult.blocked,
        blocked: mailResult.blocked,
        reason: mailResult.reason || mailResult.error,
        logOnly: mailResult.logOnly,
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

  // GET /campaigns must be declared BEFORE /:id to avoid being matched as an id
  router.get('/campaigns', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      
      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin or Steward access required', requestId: res.locals.requestId },
        });
      }

      const includeArchived = req.query.includeArchived === 'true';

      const campaignsSnap = await db.collection('verificationCampaigns')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

      let campaigns = campaignsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Array<{ id: string; status?: string; archived?: boolean; [key: string]: unknown }>;
      
      if (!includeArchived) {
        campaigns = campaigns.filter(c => c.status !== 'archived' && !c.archived);
      }

      res.json({ campaigns: campaigns.slice(0, 50) });
    } catch (error) {
      console.error('List campaigns error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to list campaigns', requestId: res.locals.requestId },
      });
    }
  });

  // Reserved paths that should not match /:id - handled by later routes
  const RESERVED_IDS = ['stats', 'pending', 'bulk', 'test-link'];
  
  router.get('/:id', async (req: Request, res: Response, next) => {
    const { id } = req.params;
    // Skip reserved paths - let them fall through to specific routes
    if (RESERVED_IDS.includes(id)) {
      return next('route');
    }
    
    try {
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

      // Allow responding only to pending or awaiting_response requests
      const canRespondStatuses = ['pending', 'awaiting_response'];
      if (!canRespondStatuses.includes(request.status)) {
        const statusMessage = request.status === 'in_review' 
          ? 'This verification request is already in review'
          : request.status === 'confirmed'
            ? 'This verification request has already been confirmed'
            : 'This verification request has already been processed';
        return res.status(400).json({
          error: { code: 'invalid_status', message: statusMessage, requestId: res.locals.requestId },
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
      const hoursWrongNoChanges = hoursConfirmed === false && !hasProposedChanges;
      
      // Determine new status (Item #3: distinct statuses):
      // - hoursConfirmed === true and no proposed changes => 'confirmed'
      // - hoursConfirmed === false with no proposed changes => 'awaiting_response' (DM task created, awaiting resolution)
      // - has proposed changes => 'in_review' (awaiting steward/admin review)
      let newStatus: 'confirmed' | 'awaiting_response' | 'in_review';
      if (hoursConfirmed === true && !hasProposedChanges) {
        newStatus = 'confirmed';
      } else if (hasProposedChanges) {
        newStatus = 'in_review';
      } else {
        newStatus = 'awaiting_response';
      }

      await db.collection('verificationRequests').doc(id).update({
        status: newStatus,
        respondedAt: now.toISOString(),
        respondedBy: authUser.uid,
        hoursConfirmed: hoursConfirmed === true,
        hoursWrongReported: hoursWrongNoChanges || undefined,
        proposedChanges: proposedChanges || null,
        updatedAt: now.toISOString(),
        updatedBy: authUser.uid,
        version: (request.version || 0) + 1,
      });

      const isSelfApproval = authUser.email === request.sentTo || 
        (authUser.role === 'Store' && authUser.storeLocationId === request.locationId);

      // Get location info for DM task creation
      const locationDoc = await db.collection('locations').doc(request.locationId).get();
      const location = locationDoc.exists ? { id: locationDoc.id, ...locationDoc.data() } as Location : null;

      // Item #1: Hours wrong with no proposed changes - create DM task, keep unverified
      if (hoursWrongNoChanges && location) {
        const workflowRules = await getWorkflowRules(db);
        
        if (workflowRules.hoursWrongDmTaskEnabled) {
          const taskDueAt = new Date(now.getTime() + workflowRules.hoursWrongDmTaskDueDays * 24 * 60 * 60 * 1000);
          const taskRef = db.collection('dmTasks').doc();
          await taskRef.set({
            id: taskRef.id,
            locationId: request.locationId,
            storeNumber: request.storeNumber,
            storeName: location.name,
            districtId: location.districtId,
            taskType: 'hours_wrong',
            status: 'pending',
            description: `Store ${request.storeNumber} reported their hours are incorrect (in-app verification response)`,
            reportedBy: authUser.email,
            verificationRequestId: id,
            dueAt: taskDueAt.toISOString(),
            createdAt: now.toISOString(),
            createdBy: 'system',
            updatedAt: now.toISOString(),
          });

          await logAudit(db, {
            userId: authUser.uid,
            userEmail: authUser.email,
            userRole: authUser.role,
            action: 'create',
            entityType: 'correction',
            entityId: taskRef.id,
            entityName: `DM Task: Hours wrong for ${request.storeNumber}`,
            locationId: request.locationId,
            changes: [
              { field: 'taskType', newValue: 'hours_wrong' },
              { field: 'dueAt', newValue: taskDueAt.toISOString() },
              { field: 'source', newValue: 'verification_response' },
            ],
          });
        }

        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'respond',
          entityType: 'verification',
          entityId: id,
          entityName: `${request.storeNumber} reported hours wrong${isSelfApproval ? ' (self)' : ''}`,
          locationId: request.locationId,
          changes: [
            { field: 'hoursConfirmed', newValue: false },
            { field: 'hoursWrongReported', newValue: true },
            { field: 'selfApproval', newValue: isSelfApproval },
          ],
        });
      } else if (!hasProposedChanges && hoursConfirmed) {
        // Hours confirmed, no changes - verify the store
        await db.collection('locations').doc(request.locationId).update({
          lastVerifiedAt: now.toISOString(),
          lastVerifiedBy: authUser.uid,
          updatedAt: now.toISOString(),
          updatedBy: authUser.uid,
        });

        // Item #2: Send verification confirmation email (respects mail-off flag)
        if (location?.sharedInboxEmail) {
          const mailService = createUnifiedMailService(db);
          await mailService.sendVerificationConfirmation(
            {
              storeName: location.name,
              storeNumber: request.storeNumber,
              storeEmail: location.sharedInboxEmail,
              verifiedAt: now.toISOString(),
            },
            authUser.uid,
            authUser.email
          );
        }

        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'respond',
          entityType: 'verification',
          entityId: id,
          entityName: `${request.storeNumber} verified${isSelfApproval ? ' (self-approval)' : ''}`,
          locationId: request.locationId,
          changes: [
            { field: 'hoursConfirmed', newValue: true },
            { field: 'lastVerifiedAt', newValue: now.toISOString() },
            { field: 'selfApproval', newValue: isSelfApproval },
            { field: 'approver', newValue: authUser.email },
            { field: 'requester', newValue: request.sentTo },
          ],
        });
      } else if (hasProposedChanges) {
        // Item #2: Send changes submitted acknowledgment email (respects mail-off flag)
        if (location?.sharedInboxEmail) {
          const mailService = createUnifiedMailService(db);
          await mailService.sendChangesSubmittedAcknowledgment(
            {
              storeName: location.name,
              storeNumber: request.storeNumber,
              storeEmail: location.sharedInboxEmail,
              submittedAt: now.toISOString(),
            },
            authUser.uid,
            authUser.email
          );
        }

        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'respond',
          entityType: 'verification',
          entityId: id,
          entityName: `${request.storeNumber} verification response${isSelfApproval ? ' (self)' : ''}`,
          locationId: request.locationId,
          changes: [
            { field: 'proposedChanges', newValue: 'submitted' },
            { field: 'selfApproval', newValue: isSelfApproval },
            { field: 'approver', newValue: authUser.email },
            { field: 'requester', newValue: request.sentTo },
          ],
        });
      }

      return res.json({
        data: {
          id,
          status: newStatus,
          respondedAt: now.toISOString(),
          hoursConfirmed,
          hoursWrongReported: hoursWrongNoChanges,
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
      const location = { id: locationDoc.id, ...locationDoc.data() } as Location;

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
          if (field === 'mainPhone' || field === 'sharedInboxEmail') {
            updateData[field] = value;
            const oldVal = location[field as keyof Location];
            auditChanges.push({ 
              field, 
              oldValue: (typeof oldVal === 'string' || typeof oldVal === 'number' || typeof oldVal === 'boolean') ? oldVal : null, 
              newValue: (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') ? value : null 
            });
          } else if (field === 'address' && typeof value === 'object' && value !== null) {
            // #4 FIX: Merge address changes instead of replacing - keep city, state, zip, geo
            const existingAddress = (location.address || {}) as unknown as Record<string, unknown>;
            const addressChanges = value as Record<string, string>;
            const mergedAddress = { ...existingAddress, ...addressChanges };
            updateData.address = mergedAddress;
            
            for (const [addrField, addrValue] of Object.entries(addressChanges)) {
              const oldAddrVal = existingAddress[addrField];
              auditChanges.push({
                field: `address.${addrField}`,
                oldValue: typeof oldAddrVal === 'string' ? oldAddrVal : null,
                newValue: addrValue,
              });
            }
          } else if (field === 'holidayHours' && typeof value === 'object' && value !== null) {
            // #4 FIX: Apply holiday hours by creating an hours exception
            const holidayData = value as { date: string; label: string; closed: boolean; open?: string; close?: string };
            const exceptionRef = db.collection('locations').doc(request.locationId).collection('hoursExceptions').doc();
            const hoursException = {
              id: exceptionRef.id,
              type: 'holiday' as const,
              label: holidayData.label,
              startDate: holidayData.date,
              endDate: holidayData.date,
              closed: holidayData.closed,
              intervals: holidayData.closed ? [] : [{ open: holidayData.open || '09:00', close: holidayData.close || '18:00' }],
              createdAt: now.toISOString(),
              createdBy: authUser.uid,
              updatedAt: now.toISOString(),
              updatedBy: authUser.uid,
              source: 'verification_approval',
              verificationRequestId: id,
            };
            await exceptionRef.set(hoursException);
            auditChanges.push({
              field: 'holidayHours',
              newValue: `${holidayData.label} (${holidayData.date})`,
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

  router.post('/:id/cancel', async (req: Request, res: Response, next) => {
    const { id } = req.params;
    // Skip 'bulk' - handled by /bulk/cancel route
    if (id === 'bulk') {
      return next('route');
    }
    
    try {
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

      // Can cancel any non-terminal status
      const cancellableStatuses = ['pending', 'awaiting_response', 'in_review'];
      if (!cancellableStatuses.includes(request.status)) {
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

  // Item #7: Mark email as bounced, create fix-contact task, stop reminders
  router.post('/:id/bounce', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;
      const { reason } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (authUser.role !== 'Admin' && authUser.role !== 'Steward') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Admin and Steward can mark emails as bounced', requestId: res.locals.requestId },
        });
      }

      const requestDoc = await db.collection('verificationRequests').doc(id).get();
      if (!requestDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Verification request not found', requestId: res.locals.requestId },
        });
      }

      const request = { id: requestDoc.id, ...requestDoc.data() } as VerificationRequest;
      
      if (request.emailBounced) {
        return res.status(400).json({
          error: { code: 'already_bounced', message: 'This request is already marked as bounced', requestId: res.locals.requestId },
        });
      }

      const now = new Date();
      const locationDoc = await db.collection('locations').doc(request.locationId).get();
      const location = locationDoc.exists ? { id: locationDoc.id, ...locationDoc.data() } as Location : null;

      // Mark as bounced
      await db.collection('verificationRequests').doc(id).update({
        emailBounced: true,
        emailBouncedAt: now.toISOString(),
        emailBouncedReason: reason || 'Manual bounce report',
        updatedAt: now.toISOString(),
        updatedBy: authUser.uid,
      });

      // Create fix-contact DM task if location exists
      if (location) {
        const workflowRules = await getWorkflowRules(db);
        const taskDueAt = new Date(now.getTime() + workflowRules.hoursWrongDmTaskDueDays * 24 * 60 * 60 * 1000);
        const taskRef = db.collection('dmTasks').doc();
        await taskRef.set({
          id: taskRef.id,
          locationId: request.locationId,
          storeNumber: request.storeNumber,
          storeName: location.name,
          districtId: location.districtId,
          taskType: 'fix_contact',
          status: 'pending',
          description: `Email bounced for store ${request.storeNumber}. Contact info needs correction: ${request.sentTo}`,
          reportedBy: authUser.email,
          verificationRequestId: id,
          dueAt: taskDueAt.toISOString(),
          createdAt: now.toISOString(),
          createdBy: authUser.uid,
          updatedAt: now.toISOString(),
        });
      }

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'verification',
        entityId: id,
        entityName: `${request.storeNumber} email bounced`,
        locationId: request.locationId,
        changes: [
          { field: 'emailBounced', newValue: true },
          { field: 'reason', newValue: reason || 'Manual bounce report' },
        ],
      });

      return res.json({
        data: {
          id,
          emailBounced: true,
          emailBouncedAt: now.toISOString(),
        },
      });
    } catch (error) {
      console.error('Mark bounce error:', error);
      return res.status(500).json({
        error: { code: 'bounce_error', message: 'Failed to mark email as bounced', requestId: res.locals.requestId },
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

      // Get active verification requests (pending or awaiting_response)
      const respondableStatuses = ['pending', 'awaiting_response'];
      const snapshot = await db.collection('verificationRequests')
        .where('locationId', '==', authUser.storeLocationId)
        .where('status', 'in', respondableStatuses)
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

  router.post('/test-link', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { tokenId } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (authUser.role !== 'Admin' && authUser.role !== 'Steward') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Admin and Steward can retrieve test links', requestId: res.locals.requestId },
        });
      }

      if (process.env.MAIL_CUTOVER_ENABLED === 'true') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Test link retrieval is disabled in production', requestId: res.locals.requestId },
        });
      }

      if (!tokenId || typeof tokenId !== 'string' || !tokenId.startsWith('tok_')) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'Valid tokenId required', requestId: res.locals.requestId },
        });
      }

      const tokenDoc = await db.collection('testTokens').doc(tokenId).get();

      if (!tokenDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Token not found', requestId: res.locals.requestId },
        });
      }

      const tokenData = tokenDoc.data()!;

      // r31 #3: Tokens are now stored as hashes for security
      // Test URL retrieval is no longer possible - return metadata only
      if (!tokenData.token && tokenData.tokenHash) {
        if (new Date(tokenData.expiresAt) < new Date()) {
          return res.status(400).json({
            error: { code: 'expired', message: 'Token has expired', requestId: res.locals.requestId },
          });
        }

        const authTokenDoc = await db.collection('storeAuthTokens').doc(tokenData.tokenHash).get();
        
        if (authTokenDoc.exists && authTokenDoc.data()?.usedAt) {
          return res.status(400).json({
            error: { code: 'used', message: 'Token has already been used', requestId: res.locals.requestId },
          });
        }

        return res.json({ 
          data: { 
            message: 'Test URL retrieval is disabled for security. Use the email sent to the store.',
            action: tokenData.action,
            storeNumber: tokenData.storeNumber,
            expiresAt: tokenData.expiresAt,
            used: authTokenDoc.exists && !!authTokenDoc.data()?.usedAt,
          } 
        });
      }

      // Legacy support for tokens created before r31
      if (new Date(tokenData.expiresAt) < new Date()) {
        return res.status(400).json({
          error: { code: 'expired', message: 'Token has expired', requestId: res.locals.requestId },
        });
      }

      const authTokenHash = hashToken(tokenData.token);
      const authTokenDoc = await db.collection('storeAuthTokens').doc(authTokenHash).get();
      
      if (authTokenDoc.exists && authTokenDoc.data()?.usedAt) {
        return res.status(400).json({
          error: { code: 'used', message: 'Token has already been used', requestId: res.locals.requestId },
        });
      }

      let appUrl: string;
      try {
        appUrl = await getAppBaseUrl(db);
      } catch (error) {
        console.error('[Verification] appBaseUrl not configured:', error);
        return res.status(503).json({
          error: { code: 'config_error', message: 'Email settings not configured. Set appBaseUrl in Admin > Email Settings.', requestId: res.locals.requestId },
        });
      }
      const testUrl = `${appUrl}/verify-action?token=${tokenData.token}&action=${tokenData.action}`;

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'verification',
        entityId: tokenId,
        entityName: `Test link retrieved for ${tokenData.storeNumber}`,
        locationId: tokenData.locationId,
        changes: [{ field: 'testLinkRetrieved', newValue: true }],
      });

      return res.json({ 
        data: { 
          testUrl,
          action: tokenData.action,
          storeNumber: tokenData.storeNumber,
          expiresAt: tokenData.expiresAt,
        } 
      });
    } catch (error) {
      console.error('Get test link error:', error);
      return res.status(500).json({
        error: { code: 'get_error', message: 'Failed to get test link', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/campaigns', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      
      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin or Steward access required', requestId: res.locals.requestId },
        });
      }

      const workflowRules = await getWorkflowRules(db);
      const { scope, scopeId, skipRecentlyVerified, dryRun } = req.body;
      const daysSinceVerification = req.body.daysSinceVerification ?? workflowRules.verificationCycleDays;

      if (!scope || !['district', 'region', 'all'].includes(scope)) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'scope must be district, region, or all', requestId: res.locals.requestId },
        });
      }

      if (dryRun !== undefined && typeof dryRun !== 'boolean') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'dryRun must be a boolean', requestId: res.locals.requestId },
        });
      }

      if ((scope === 'district' || scope === 'region') && !scopeId) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'scopeId is required for district or region scope', requestId: res.locals.requestId },
        });
      }

      if ((scope === 'district' || scope === 'region') && typeof scopeId !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'scopeId must be a string', requestId: res.locals.requestId },
        });
      }

      // Validate scopeId exists
      if (scope === 'district' && scopeId) {
        const districtDoc = await db.collection('districts').doc(scopeId).get();
        if (!districtDoc.exists) {
          return res.status(404).json({
            error: { code: 'not_found', message: 'District not found', requestId: res.locals.requestId },
          });
        }
      } else if (scope === 'region' && scopeId) {
        const regionDoc = await db.collection('regions').doc(scopeId).get();
        if (!regionDoc.exists) {
          return res.status(404).json({
            error: { code: 'not_found', message: 'Region not found', requestId: res.locals.requestId },
          });
        }
      }

      let locationsQuery = db.collection('locations')
        .where('lifecycle', '==', 'active')
        .where('kind', '==', 'store');

      if (scope === 'district') {
        locationsQuery = locationsQuery.where('districtId', '==', scopeId);
      } else if (scope === 'region') {
        locationsQuery = locationsQuery.where('regionId', '==', scopeId);
      }

      const locationsSnap = await locationsQuery.get();
      const locations = locationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location));

      const now = new Date();
      const cutoffDate = skipRecentlyVerified 
        ? new Date(now.getTime() - daysSinceVerification * 24 * 60 * 60 * 1000).toISOString()
        : null;

      // Item #8: Track blocked recipients with names and reasons
      const results = {
        total: locations.length,
        sent: 0,
        logOnly: 0,
        skipped: 0,
        failed: 0,
        skippedReasons: {
          noEmail: 0,
          recentlyVerified: 0,
          pendingRequest: 0,
          emailBounced: 0,
        },
        failedStores: [] as { storeNumber: string; reason: string }[],
        targetStores: [] as { storeNumber: string; name: string; email: string }[],
        blockedRecipients: [] as { storeNumber: string; name: string; reason: string }[],
      };

      const campaignId = `camp_${randomBytes(8).toString('hex')}`;
      const expiresAt = new Date(now.getTime() + workflowRules.requestExpiryDays * 24 * 60 * 60 * 1000);
      let appUrl: string;
      try {
        appUrl = await getAppBaseUrl(db);
      } catch (error) {
        console.error('[Verification] appBaseUrl not configured:', error);
        return res.status(503).json({
          error: { code: 'config_error', message: 'Email settings not configured. Set appBaseUrl in Admin > Email Settings.', requestId: res.locals.requestId },
        });
      }
      const mailService = createUnifiedMailService(db);

      for (const location of locations) {
        // Item #8: Track blocked recipients with reasons
        if (!location.sharedInboxEmail) {
          results.skipped++;
          results.skippedReasons.noEmail++;
          results.blockedRecipients.push({
            storeNumber: location.storeNumber,
            name: location.name,
            reason: 'No email configured',
          });
          continue;
        }

        if (cutoffDate && location.lastVerifiedAt && location.lastVerifiedAt > cutoffDate) {
          results.skipped++;
          results.skippedReasons.recentlyVerified++;
          results.blockedRecipients.push({
            storeNumber: location.storeNumber,
            name: location.name,
            reason: 'Recently verified',
          });
          continue;
        }

        // Check for bounced email on previous requests
        const bouncedRequest = await db.collection('verificationRequests')
          .where('locationId', '==', location.id)
          .where('emailBounced', '==', true)
          .limit(1)
          .get();

        if (!bouncedRequest.empty) {
          results.skipped++;
          results.skippedReasons.emailBounced++;
          results.blockedRecipients.push({
            storeNumber: location.storeNumber,
            name: location.name,
            reason: 'Previous email bounced',
          });
          continue;
        }

        // Skip if there's any active (non-terminal) verification request
        const activeStatuses = ['pending', 'awaiting_response', 'in_review'];
        const activeRequest = await db.collection('verificationRequests')
          .where('locationId', '==', location.id)
          .where('status', 'in', activeStatuses)
          .limit(1)
          .get();

        if (!activeRequest.empty) {
          results.skipped++;
          results.skippedReasons.pendingRequest++;
          results.blockedRecipients.push({
            storeNumber: location.storeNumber,
            name: location.name,
            reason: 'Active request pending',
          });
          continue;
        }

        results.targetStores.push({
          storeNumber: location.storeNumber,
          name: location.name,
          email: location.sharedInboxEmail,
        });

        if (dryRun) {
          continue;
        }

        try {
          const requestRef = db.collection('verificationRequests').doc();
          const verificationRequest: Omit<VerificationRequest, 'id'> = {
            locationId: location.id,
            storeNumber: location.storeNumber,
            locationName: location.name,
            storeType: location.storeType || undefined, // Item #10: Include store type
            status: 'pending',
            sentAt: now.toISOString(),
            sentBy: authUser.uid,
            sentTo: location.sharedInboxEmail,
            expiresAt: expiresAt.toISOString(),
            hoursAtSend: location.standardHours,
            hoursConfirmed: false,
            campaignId,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            updatedBy: authUser.uid,
            version: 1,
          };

          await requestRef.set(verificationRequest);

          const confirmToken = generateToken();
          const updateToken = generateToken();
          const confirmTokenId = `tok_${randomBytes(8).toString('hex')}`;
          const updateTokenId = `tok_${randomBytes(8).toString('hex')}`;

          const baseTokenData = {
            locationId: location.id,
            storeNumber: location.storeNumber,
            storeEmail: location.sharedInboxEmail,
            verificationRequestId: requestRef.id,
            expiresAt: expiresAt.toISOString(),
            createdAt: now.toISOString(),
            createdBy: authUser.uid,
            campaignId,
          };

          await db.collection('storeAuthTokens').doc(hashToken(confirmToken)).set({
            ...baseTokenData,
            action: 'confirm',
            tokenId: confirmTokenId,
          });

          await db.collection('storeAuthTokens').doc(hashToken(updateToken)).set({
            ...baseTokenData,
            action: 'update',
            tokenId: updateTokenId,
          });

          // r31 #3: Store token hash (not plain text) for security
          await db.collection('testTokens').doc(confirmTokenId).set({
            tokenHash: hashToken(confirmToken),
            action: 'confirm',
            verificationRequestId: requestRef.id,
            locationId: location.id,
            storeNumber: location.storeNumber,
            expiresAt: expiresAt.toISOString(),
            createdAt: now.toISOString(),
            createdBy: authUser.uid,
            campaignId,
          });

          await db.collection('testTokens').doc(updateTokenId).set({
            tokenHash: hashToken(updateToken),
            action: 'update',
            verificationRequestId: requestRef.id,
            locationId: location.id,
            storeNumber: location.storeNumber,
            expiresAt: expiresAt.toISOString(),
            createdAt: now.toISOString(),
            createdBy: authUser.uid,
            campaignId,
          });

          const confirmUrl = `${appUrl}/verify-action?token=${confirmToken}&action=confirm`;
          const updateUrl = `${appUrl}/verify-action?token=${updateToken}&action=update`;
          const verificationUrl = `${appUrl}/verify/${requestRef.id}`;

          const emailData = {
            storeName: location.name,
            storeNumber: location.storeNumber,
            storeEmail: location.sharedInboxEmail,
            storeType: getStoreTypeLabel(location.storeType),
            verificationUrl,
            expiresAt: expiresAt.toISOString(),
            confirmUrl,
            updateUrl,
            hours: location.standardHours,
            wayfindingDirections: location.wayfindingDirections,
            verificationRequestId: requestRef.id, // #7: For bounce tracking
            locationId: location.id, // #7: For bounce tracking
          };

          const mailResult = await mailService.sendVerificationRequest(emailData, authUser.uid, authUser.email);

          if (mailResult.success && !mailResult.blocked) {
            await requestRef.update({
              emailSent: true,
              emailMessageId: mailResult.messageId,
            });
            results.sent++;
          } else if (mailResult.blocked) {
            await requestRef.update({
              emailSent: false,
              emailBlocked: true,
              emailError: mailResult.reason,
            });
            results.logOnly++;
          } else {
            await requestRef.update({
              emailSent: false,
              emailError: mailResult.error,
            });
            results.failed++;
            results.failedStores.push({
              storeNumber: location.storeNumber,
              reason: mailResult.error || 'Email send failed',
            });
          }

        } catch (error) {
          console.error(`[Campaign] Failed to send to ${location.storeNumber}:`, error);
          results.failed++;
          results.failedStores.push({ 
            storeNumber: location.storeNumber, 
            reason: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }

      if (dryRun === true) {
        res.json({
          dryRun: true,
          results: {
            total: results.total,
            wouldSend: results.targetStores.length,
            sent: 0,
            logOnly: 0,
            skipped: results.skipped,
            failed: 0,
            skippedReasons: results.skippedReasons,
            failedStores: [],
            targetStores: results.targetStores,
            blockedRecipients: results.blockedRecipients,  // Item #8: Named list of blocked recipients
          },
        });
        return;
      }

      await db.collection('verificationCampaigns').doc(campaignId).set({
        campaignId,
        scope,
        scopeId: scopeId || null,
        skipRecentlyVerified: !!skipRecentlyVerified,
        daysSinceVerification,
        createdAt: now.toISOString(),
        createdBy: authUser.uid,
        createdByEmail: authUser.email,
        results: {
          total: results.total,
          sent: results.sent,
          logOnly: results.logOnly,
          skipped: results.skipped,
          failed: results.failed,
          skippedReasons: results.skippedReasons,
          failedStores: results.failedStores,
        },
        expiresAt: expiresAt.toISOString(),
      });

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'bulk-send',
        entityType: 'verification-campaign',
        entityId: campaignId,
        entityName: `Verification campaign for ${scope}${scopeId ? ` ${scopeId}` : ''}`,
        changes: [
          { field: 'scope', newValue: scope },
          { field: 'scopeId', newValue: scopeId || 'all' },
          { field: 'sent', newValue: results.sent },
          { field: 'logOnly', newValue: results.logOnly },
          { field: 'skipped', newValue: results.skipped },
          { field: 'failed', newValue: results.failed },
        ],
      });

      res.json({
        campaignId,
        results: {
          total: results.total,
          sent: results.sent,
          logOnly: results.logOnly,
          skipped: results.skipped,
          failed: results.failed,
          skippedReasons: results.skippedReasons,
          failedStores: results.failedStores,
        },
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error('Campaign error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to create campaign', requestId: res.locals.requestId },
      });
    }
  });

  router.delete('/campaigns/:campaignId', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { campaignId } = req.params;

      if (!authUser || authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin access required', requestId: res.locals.requestId },
        });
      }

      const campaignDoc = await db.collection('verificationCampaigns').doc(campaignId).get();
      if (!campaignDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Campaign not found', requestId: res.locals.requestId },
        });
      }

      const campaignData = campaignDoc.data()!;
      const now = new Date().toISOString();

      await db.collection('verificationCampaigns').doc(campaignId).update({
        archived: true,
        archivedAt: now,
        archivedBy: authUser.uid,
      });

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'delete',
        entityType: 'verification-campaign',
        entityId: campaignId,
        entityName: `Archived campaign ${campaignId}`,
        changes: [
          { field: 'archived', oldValue: false, newValue: true },
          { field: 'scope', newValue: campaignData.scope },
        ],
      });

      res.json({ success: true, campaignId, archivedAt: now });
    } catch (error) {
      console.error('Archive campaign error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to archive campaign', requestId: res.locals.requestId },
      });
    }
  });

  // Item #11: Bulk cancel verification requests with required reason
  router.post('/bulk/cancel', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { ids, reason } = req.body;

      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin or Steward access required', requestId: res.locals.requestId },
        });
      }

      // Require reason for bulk cancel
      if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
        return res.status(400).json({
          error: { code: 'reason_required', message: 'A reason is required for bulk cancellation (min 3 characters)', requestId: res.locals.requestId },
        });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          error: { code: 'ids_required', message: 'Array of verification request IDs is required', requestId: res.locals.requestId },
        });
      }

      if (ids.length > 100) {
        return res.status(400).json({
          error: { code: 'too_many_ids', message: 'Cannot cancel more than 100 requests at once', requestId: res.locals.requestId },
        });
      }

      const now = new Date();
      const cancelled: { id: string; storeNumber: string }[] = [];
      const skipped: string[] = [];

      for (const id of ids) {
        const requestDoc = await db.collection('verificationRequests').doc(id).get();
        
        if (!requestDoc.exists) {
          skipped.push(id);
          continue;
        }

        const request = requestDoc.data() as VerificationRequest;
        const cancellableStatuses = ['pending', 'awaiting_response', 'in_review'];
        
        if (!cancellableStatuses.includes(request.status)) {
          skipped.push(id);
          continue;
        }

        await requestDoc.ref.update({
          status: 'cancelled',
          cancelledAt: now.toISOString(),
          cancelledBy: authUser.uid,
          cancelReason: reason.trim(),
          updatedAt: now.toISOString(),
          updatedBy: authUser.uid,
          version: (request.version || 0) + 1,
        });

        cancelled.push({ id, storeNumber: request.storeNumber });

        // Log each cancellation
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'cancel',
          entityType: 'verification',
          entityId: id,
          entityName: `${request.storeNumber} verification cancelled (bulk)`,
          locationId: request.locationId,
          changes: [
            { field: 'status', oldValue: request.status, newValue: 'cancelled' },
            { field: 'reason', newValue: reason.trim() },
          ],
        });
      }

      // Log summary
      if (cancelled.length > 0) {
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'bulk-cancel',
          entityType: 'verification',
          entityId: 'bulk',
          entityName: `Bulk cancel (${cancelled.length} verification requests)`,
          changes: [
            { field: 'cancelled_count', newValue: cancelled.length },
            { field: 'reason', newValue: reason.trim() },
          ],
        });
      }

      res.json({
        data: {
          cancelled: cancelled.length,
          skipped: skipped.length,
          cancelledIds: cancelled.map(c => c.id),
          skippedIds: skipped,
        },
      });
    } catch (error) {
      console.error('Bulk cancel error:', error);
      res.status(500).json({
        error: { code: 'bulk_cancel_error', message: 'Failed to cancel verification requests', requestId: res.locals.requestId },
      });
    }
  });

  // Item #11: Bulk reissue verification requests with required reason
  router.post('/bulk/reissue', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { ids, reason } = req.body;

      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin or Steward access required', requestId: res.locals.requestId },
        });
      }

      // Require reason for bulk reissue
      if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
        return res.status(400).json({
          error: { code: 'reason_required', message: 'A reason is required for bulk reissue (min 3 characters)', requestId: res.locals.requestId },
        });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          error: { code: 'ids_required', message: 'Array of verification request IDs is required', requestId: res.locals.requestId },
        });
      }

      if (ids.length > 100) {
        return res.status(400).json({
          error: { code: 'too_many_ids', message: 'Cannot reissue more than 100 requests at once', requestId: res.locals.requestId },
        });
      }

      const workflowRules = await getWorkflowRules(db);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + workflowRules.requestExpiryDays * 24 * 60 * 60 * 1000);
      
      let appUrl: string;
      try {
        appUrl = await getAppBaseUrl(db);
      } catch (error) {
        console.error('[Verification] appBaseUrl not configured:', error);
        return res.status(503).json({
          error: { code: 'config_error', message: 'Email settings not configured', requestId: res.locals.requestId },
        });
      }

      const mailService = createUnifiedMailService(db);
      const reissued: { id: string; storeNumber: string; newRequestId: string }[] = [];
      const skipped: string[] = [];

      for (const id of ids) {
        const requestDoc = await db.collection('verificationRequests').doc(id).get();
        
        if (!requestDoc.exists) {
          skipped.push(id);
          continue;
        }

        const oldRequest = requestDoc.data() as VerificationRequest;
        
        // Can only reissue terminal statuses (expired, cancelled, confirmed)
        const reissuableStatuses = ['expired', 'cancelled', 'confirmed'];
        if (!reissuableStatuses.includes(oldRequest.status)) {
          skipped.push(id);
          continue;
        }

        const locationDoc = await db.collection('locations').doc(oldRequest.locationId).get();
        if (!locationDoc.exists) {
          skipped.push(id);
          continue;
        }

        const location = { id: locationDoc.id, ...locationDoc.data() } as Location;
        if (!location.sharedInboxEmail) {
          skipped.push(id);
          continue;
        }

        // Check for existing active request
        const activeStatuses = ['pending', 'awaiting_response', 'in_review'];
        const existingActive = await db.collection('verificationRequests')
          .where('locationId', '==', location.id)
          .where('status', 'in', activeStatuses)
          .limit(1)
          .get();

        if (!existingActive.empty) {
          skipped.push(id);
          continue;
        }

        // Create new verification request
        const newRequestRef = db.collection('verificationRequests').doc();
        const newRequest: Omit<VerificationRequest, 'id'> = {
          locationId: location.id,
          locationName: location.name,
          storeNumber: location.storeNumber,
          storeType: location.storeType || undefined, // Item #10: Include store type
          status: 'pending',
          sentAt: now.toISOString(),
          sentTo: location.sharedInboxEmail,
          sentBy: authUser.uid,
          expiresAt: expiresAt.toISOString(),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          updatedBy: authUser.uid,
          version: 1,
          // r28 fix #6a: carry isTest from old request to new request
          ...(oldRequest.isTest === true ? { isTest: true } : {}),
        };

        await newRequestRef.set(newRequest);

        // Generate tokens
        const confirmToken = generateToken();
        const updateToken = generateToken();
        const confirmTokenId = `tok_${randomBytes(8).toString('hex')}`;
        const updateTokenId = `tok_${randomBytes(8).toString('hex')}`;

        const baseTokenData = {
          locationId: location.id,
          storeNumber: location.storeNumber,
          storeEmail: location.sharedInboxEmail,
          verificationRequestId: newRequestRef.id,
          expiresAt: expiresAt.toISOString(),
          createdAt: now.toISOString(),
          createdBy: authUser.uid,
        };

        await db.collection('storeAuthTokens').doc(hashToken(confirmToken)).set({
          ...baseTokenData,
          action: 'confirm',
          tokenId: confirmTokenId,
        });

        await db.collection('storeAuthTokens').doc(hashToken(updateToken)).set({
          ...baseTokenData,
          action: 'update',
          tokenId: updateTokenId,
        });

        const confirmUrl = `${appUrl}/verify-action?token=${confirmToken}&action=confirm`;
        const updateUrl = `${appUrl}/verify-action?token=${updateToken}&action=update`;

        const emailData = {
          storeName: location.name,
          storeNumber: location.storeNumber,
          storeEmail: location.sharedInboxEmail,
          storeType: getStoreTypeLabel(location.storeType),
          verificationUrl: `${appUrl}/verify/${newRequestRef.id}`,
          expiresAt: expiresAt.toISOString(),
          confirmUrl,
          updateUrl,
          hours: location.standardHours,
          wayfindingDirections: location.wayfindingDirections,
          verificationRequestId: newRequestRef.id, // #7: For bounce tracking
          locationId: location.id, // #7: For bounce tracking
        };

        const mailResult = await mailService.sendVerificationRequest(emailData, authUser.uid, authUser.email);

        await newRequestRef.update({
          emailSent: mailResult.success && !mailResult.blocked,
          emailMessageId: mailResult.messageId,
          emailBlocked: mailResult.blocked,
          emailError: mailResult.error || mailResult.reason,
        });

        reissued.push({ id, storeNumber: location.storeNumber, newRequestId: newRequestRef.id });

        // Log reissue
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'send',
          entityType: 'verification',
          entityId: newRequestRef.id,
          entityName: `${location.storeNumber} verification reissued`,
          locationId: location.id,
          changes: [
            { field: 'previousRequestId', newValue: id },
            { field: 'reason', newValue: reason.trim() },
          ],
        });
      }

      // Log summary
      if (reissued.length > 0) {
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'bulk-send',
          entityType: 'verification',
          entityId: 'bulk-reissue',
          entityName: `Bulk reissue (${reissued.length} verification requests)`,
          changes: [
            { field: 'reissued_count', newValue: reissued.length },
            { field: 'reason', newValue: reason.trim() },
          ],
        });
      }

      res.json({
        data: {
          reissued: reissued.length,
          skipped: skipped.length,
          reissuedRequests: reissued,
          skippedIds: skipped,
        },
      });
    } catch (error) {
      console.error('Bulk reissue error:', error);
      res.status(500).json({
        error: { code: 'bulk_reissue_error', message: 'Failed to reissue verification requests', requestId: res.locals.requestId },
      });
    }
  });

  // #10: Bulk assign verification requests to a specific person
  router.post('/bulk/assign', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { ids, assigneeId } = req.body;

      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin or Steward access required', requestId: res.locals.requestId },
        });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          error: { code: 'ids_required', message: 'Array of verification request IDs is required', requestId: res.locals.requestId },
        });
      }

      if (ids.length > 100) {
        return res.status(400).json({
          error: { code: 'too_many_ids', message: 'Cannot assign more than 100 requests at once', requestId: res.locals.requestId },
        });
      }

      if (!assigneeId || typeof assigneeId !== 'string') {
        return res.status(400).json({
          error: { code: 'assignee_required', message: 'assigneeId is required', requestId: res.locals.requestId },
        });
      }

      // Look up the assignee's name
      const personDoc = await db.collection('people').doc(assigneeId).get();
      if (!personDoc.exists) {
        return res.status(404).json({
          error: { code: 'assignee_not_found', message: 'Assignee not found', requestId: res.locals.requestId },
        });
      }
      const assigneeName = (personDoc.data() as { fullName?: string }).fullName || 'Unknown';

      const now = new Date();
      const assigned: { id: string; storeNumber: string }[] = [];
      const skipped: string[] = [];

      for (const id of ids) {
        const requestDoc = await db.collection('verificationRequests').doc(id).get();
        if (!requestDoc.exists) {
          skipped.push(id);
          continue;
        }

        const request = requestDoc.data() as VerificationRequest;
        
        // Can only assign active requests
        const assignableStatuses = ['pending', 'awaiting_response', 'in_review'];
        if (!assignableStatuses.includes(request.status)) {
          skipped.push(id);
          continue;
        }

        await requestDoc.ref.update({
          assigneeId,
          assigneeName,
          updatedAt: now.toISOString(),
          updatedBy: authUser.uid,
          version: (request.version || 0) + 1,
        });

        assigned.push({ id, storeNumber: request.storeNumber });
      }

      // Log summary
      if (assigned.length > 0) {
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'bulk-assign',
          entityType: 'verification',
          entityId: 'bulk',
          entityName: `Bulk assign (${assigned.length} verification requests)`,
          changes: [
            { field: 'assigned_count', newValue: assigned.length },
            { field: 'assigneeId', newValue: assigneeId },
            { field: 'assigneeName', newValue: assigneeName },
          ],
        });
      }

      res.json({
        data: {
          assigned: assigned.length,
          skipped: skipped.length,
          assignedIds: assigned.map(a => a.id),
          skippedIds: skipped,
          assigneeName,
        },
      });
    } catch (error) {
      console.error('Bulk assign error:', error);
      res.status(500).json({
        error: { code: 'bulk_assign_error', message: 'Failed to assign verification requests', requestId: res.locals.requestId },
      });
    }
  });

  // #10: Bulk send reminders for pending verification requests
  router.post('/bulk/send', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { ids } = req.body;

      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin or Steward access required', requestId: res.locals.requestId },
        });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          error: { code: 'ids_required', message: 'Array of verification request IDs is required', requestId: res.locals.requestId },
        });
      }

      if (ids.length > 50) {
        return res.status(400).json({
          error: { code: 'too_many_ids', message: 'Cannot send more than 50 reminders at once', requestId: res.locals.requestId },
        });
      }

      let appUrl: string;
      try {
        appUrl = await getAppBaseUrl(db);
      } catch (error) {
        console.error('[Verification] appBaseUrl not configured:', error);
        return res.status(503).json({
          error: { code: 'config_error', message: 'Email settings not configured', requestId: res.locals.requestId },
        });
      }

      const mailService = createUnifiedMailService(db);
      const now = new Date();
      const sent: { id: string; storeNumber: string }[] = [];
      const skipped: string[] = [];
      const failed: string[] = [];

      for (const id of ids) {
        const requestDoc = await db.collection('verificationRequests').doc(id).get();
        if (!requestDoc.exists) {
          skipped.push(id);
          continue;
        }

        const request = requestDoc.data() as VerificationRequest;
        
        // Can only send reminders for pending/awaiting requests
        if (request.status !== 'pending' && request.status !== 'awaiting_response') {
          skipped.push(id);
          continue;
        }

        // Skip if bounced
        if (request.emailBounced) {
          skipped.push(id);
          continue;
        }

        const locationDoc = await db.collection('locations').doc(request.locationId).get();
        if (!locationDoc.exists || !locationDoc.data()?.sharedInboxEmail) {
          skipped.push(id);
          continue;
        }

        const location = locationDoc.data()!;
        const daysRemaining = Math.ceil((new Date(request.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        const emailData = {
          storeName: location.name,
          storeNumber: request.storeNumber,
          storeEmail: location.sharedInboxEmail,
          verificationUrl: `${appUrl}/verify/${id}`,
          expiresAt: request.expiresAt,
          daysRemaining,
          originalSentAt: request.sentAt,
          verificationRequestId: id,
          locationId: request.locationId,
        };

        const result = await mailService.sendVerificationReminder(emailData, authUser.uid, authUser.email);

        if (result.success && !result.blocked) {
          await requestDoc.ref.update({
            lastReminderAt: now.toISOString(),
            reminderCount: (request.reminderCount || 0) + 1,
          });
          sent.push({ id, storeNumber: request.storeNumber });
        } else if (result.blocked) {
          skipped.push(id);
        } else {
          failed.push(id);
        }
      }

      // Log summary
      if (sent.length > 0) {
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'bulk-send',
          entityType: 'verification',
          entityId: 'bulk-reminder',
          entityName: `Bulk send reminders (${sent.length} verification requests)`,
          changes: [
            { field: 'sent_count', newValue: sent.length },
            { field: 'skipped_count', newValue: skipped.length },
            { field: 'failed_count', newValue: failed.length },
          ],
        });
      }

      res.json({
        data: {
          sent: sent.length,
          skipped: skipped.length,
          failed: failed.length,
          sentIds: sent.map(s => s.id),
          skippedIds: skipped,
          failedIds: failed,
        },
      });
    } catch (error) {
      console.error('Bulk send error:', error);
      res.status(500).json({
        error: { code: 'bulk_send_error', message: 'Failed to send reminders', requestId: res.locals.requestId },
      });
    }
  });

  // Item #9: Completion rate and aging buckets by region/district
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      
      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin or Steward access required', requestId: res.locals.requestId },
        });
      }

      const { groupBy = 'region' } = req.query;
      const now = new Date();
      
      // Get all active stores with their region/district info
      const locationsSnap = await db.collection('locations')
        .where('lifecycle', '==', 'active')
        .where('kind', '==', 'store')
        .get();
      
      // Get all pending verification requests
      const pendingSnap = await db.collection('verificationRequests')
        .where('status', 'in', ['pending', 'awaiting_response', 'in_review'])
        .get();
      
      // Get all confirmed requests from last cycle
      const workflowRules = await getWorkflowRules(db);
      const cycleStart = new Date(now.getTime() - workflowRules.verificationCycleDays * 24 * 60 * 60 * 1000);
      const confirmedSnap = await db.collection('verificationRequests')
        .where('status', '==', 'confirmed')
        .where('respondedAt', '>=', cycleStart.toISOString())
        .get();
      
      // Build location map
      const locationMap = new Map<string, { regionId?: string; districtId?: string; regionName?: string; districtName?: string }>();
      locationsSnap.docs.forEach(doc => {
        const data = doc.data();
        locationMap.set(doc.id, {
          regionId: data.regionId,
          districtId: data.districtId,
          regionName: data.regionName,
          districtName: data.districtName,
        });
      });
      
      // Calculate aging buckets for pending requests
      const pendingByLocation = new Map<string, { sentAt: string; status: string }>();
      pendingSnap.docs.forEach(doc => {
        const data = doc.data();
        pendingByLocation.set(data.locationId, {
          sentAt: data.sentAt,
          status: data.status,
        });
      });
      
      // Track confirmed locations in this cycle
      const confirmedLocationIds = new Set<string>();
      confirmedSnap.docs.forEach(doc => {
        confirmedLocationIds.add(doc.data().locationId);
      });
      
      // Group stats by region or district
      interface GroupStats {
        id: string;
        name: string;
        totalStores: number;
        confirmedInCycle: number;
        pendingCount: number;
        awaitingResponseCount: number;
        inReviewCount: number;
        completionRate: number;
        agingBuckets: {
          lessThan3Days: number;
          threeTo7Days: number;
          sevenTo14Days: number;
          moreThan14Days: number;
        };
      }
      
      const groupStatsMap = new Map<string, GroupStats>();
      
      locationsSnap.docs.forEach(doc => {
        const locData = doc.data();
        const groupId = groupBy === 'district' ? locData.districtId : locData.regionId;
        const groupName = groupBy === 'district' ? locData.districtName : locData.regionName;
        
        if (!groupId) return;
        
        if (!groupStatsMap.has(groupId)) {
          groupStatsMap.set(groupId, {
            id: groupId,
            name: groupName || 'Unknown',
            totalStores: 0,
            confirmedInCycle: 0,
            pendingCount: 0,
            awaitingResponseCount: 0,
            inReviewCount: 0,
            completionRate: 0,
            agingBuckets: {
              lessThan3Days: 0,
              threeTo7Days: 0,
              sevenTo14Days: 0,
              moreThan14Days: 0,
            },
          });
        }
        
        const stats = groupStatsMap.get(groupId)!;
        stats.totalStores++;
        
        if (confirmedLocationIds.has(doc.id)) {
          stats.confirmedInCycle++;
        }
        
        const pendingData = pendingByLocation.get(doc.id);
        if (pendingData) {
          if (pendingData.status === 'awaiting_response') {
            stats.awaitingResponseCount++;
          } else if (pendingData.status === 'in_review') {
            stats.inReviewCount++;
          } else {
            stats.pendingCount++;
          }
          
          // Calculate aging
          const sentDate = new Date(pendingData.sentAt);
          const daysSinceSent = Math.floor((now.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysSinceSent < 3) {
            stats.agingBuckets.lessThan3Days++;
          } else if (daysSinceSent < 7) {
            stats.agingBuckets.threeTo7Days++;
          } else if (daysSinceSent < 14) {
            stats.agingBuckets.sevenTo14Days++;
          } else {
            stats.agingBuckets.moreThan14Days++;
          }
        }
      });
      
      // Calculate completion rates
      groupStatsMap.forEach(stats => {
        stats.completionRate = stats.totalStores > 0
          ? Math.round((stats.confirmedInCycle / stats.totalStores) * 100)
          : 0;
      });
      
      // Convert to sorted array
      const statsArray = Array.from(groupStatsMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));
      
      // Calculate overall totals
      const totals = statsArray.reduce((acc, s) => ({
        totalStores: acc.totalStores + s.totalStores,
        confirmedInCycle: acc.confirmedInCycle + s.confirmedInCycle,
        pendingCount: acc.pendingCount + s.pendingCount,
        awaitingResponseCount: acc.awaitingResponseCount + s.awaitingResponseCount,
        inReviewCount: acc.inReviewCount + s.inReviewCount,
        agingBuckets: {
          lessThan3Days: acc.agingBuckets.lessThan3Days + s.agingBuckets.lessThan3Days,
          threeTo7Days: acc.agingBuckets.threeTo7Days + s.agingBuckets.threeTo7Days,
          sevenTo14Days: acc.agingBuckets.sevenTo14Days + s.agingBuckets.sevenTo14Days,
          moreThan14Days: acc.agingBuckets.moreThan14Days + s.agingBuckets.moreThan14Days,
        },
      }), {
        totalStores: 0,
        confirmedInCycle: 0,
        pendingCount: 0,
        awaitingResponseCount: 0,
        inReviewCount: 0,
        agingBuckets: {
          lessThan3Days: 0,
          threeTo7Days: 0,
          sevenTo14Days: 0,
          moreThan14Days: 0,
        },
      });
      
      const overallCompletionRate = totals.totalStores > 0
        ? Math.round((totals.confirmedInCycle / totals.totalStores) * 100)
        : 0;

      res.json({
        data: {
          groupBy,
          cycleDays: workflowRules.verificationCycleDays,
          cycleStartDate: cycleStart.toISOString(),
          groups: statsArray,
          totals: {
            ...totals,
            completionRate: overallCompletionRate,
          },
        },
      });
    } catch (error) {
      console.error('Verification stats error:', error);
      res.status(500).json({
        error: { code: 'stats_error', message: 'Failed to get verification stats', requestId: res.locals.requestId },
      });
    }
  });

  // r27 fix #6: Admin-only endpoint to delete test data
  // Only deletes records with explicit isTest flag, logs every deletion to audit
  router.delete('/test-data', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;

      // Admin-only
      if (!authUser || authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin access required to delete test data', requestId: res.locals.requestId },
        });
      }

      const { dryRun = false } = req.body;
      const now = new Date();
      const deletedItems: { type: string; id: string; storeNumber?: string }[] = [];

      // Find test verification requests (only those with explicit isTest: true)
      const testRequestsSnap = await db.collection('verificationRequests')
        .where('isTest', '==', true)
        .get();

      // Find related mailLog entries
      const testRequestIds = testRequestsSnap.docs.map(d => d.id);
      
      // Find related dmTasks
      const testDmTasks: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      for (const requestId of testRequestIds) {
        const tasksSnap = await db.collection('dmTasks')
          .where('verificationRequestId', '==', requestId)
          .get();
        testDmTasks.push(...tasksSnap.docs);
      }

      // Find related mailLog entries
      const testMailLogs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      for (const requestId of testRequestIds) {
        const logsSnap = await db.collection('mailLog')
          .where('verificationRequestId', '==', requestId)
          .get();
        testMailLogs.push(...logsSnap.docs);
      }

      // r28 fix #6b: Find related storeAuthTokens
      const storeAuthTokens: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      for (const requestId of testRequestIds) {
        const tokensSnap = await db.collection('storeAuthTokens')
          .where('verificationRequestId', '==', requestId)
          .get();
        storeAuthTokens.push(...tokensSnap.docs);
      }

      // r31 #2: Find related testTokens (store test link tokens for retrieval)
      const testTokenDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      for (const requestId of testRequestIds) {
        const tokensSnap = await db.collection('testTokens')
          .where('verificationRequestId', '==', requestId)
          .get();
        testTokenDocs.push(...tokensSnap.docs);
      }

      if (dryRun) {
        // r28 fix #6c: Include record IDs in dry run response
        return res.json({
          dryRun: true,
          wouldDelete: {
            verificationRequests: testRequestsSnap.docs.map(d => ({
              id: d.id,
              storeNumber: d.data().storeNumber,
            })),
            dmTasks: testDmTasks.map(d => ({
              id: d.id,
              storeNumber: d.data().storeNumber,
            })),
            mailLogs: testMailLogs.map(d => ({ id: d.id })),
            storeAuthTokens: storeAuthTokens.map(d => ({ id: d.id })),
            testTokens: testTokenDocs.map(d => ({ id: d.id })),
          },
          totals: {
            verificationRequests: testRequestsSnap.size,
            dmTasks: testDmTasks.length,
            mailLogs: testMailLogs.length,
            storeAuthTokens: storeAuthTokens.length,
            testTokens: testTokenDocs.length,
          },
        });
      }

      // Delete in batches (Firestore batch limit is 500)
      const BATCH_SIZE = 400;
      const allDocs = [
        ...testRequestsSnap.docs.map(d => ({ type: 'verificationRequest', doc: d })),
        ...testDmTasks.map(d => ({ type: 'dmTask', doc: d })),
        ...testMailLogs.map(d => ({ type: 'mailLog', doc: d })),
        ...storeAuthTokens.map(d => ({ type: 'storeAuthToken', doc: d })),
        ...testTokenDocs.map(d => ({ type: 'testToken', doc: d })),
      ];

      for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const chunk = allDocs.slice(i, i + BATCH_SIZE);
        
        for (const { type, doc } of chunk) {
          batch.delete(doc.ref);
          deletedItems.push({
            type,
            id: doc.id,
            storeNumber: doc.data().storeNumber,
          });
        }
        
        await batch.commit();
      }

      // r28 fix #6c: Log the deletion to audit with record IDs per collection
      if (deletedItems.length > 0) {
        // Group deleted items by type for audit
        const deletedByType: Record<string, string[]> = {};
        for (const item of deletedItems) {
          if (!deletedByType[item.type]) deletedByType[item.type] = [];
          deletedByType[item.type].push(item.id);
        }

        // r28 fix #6c: stringify the IDs for audit (AuditChange only accepts primitives)
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'delete',
          entityType: 'test-data',
          entityId: `test-cleanup-${now.getTime()}`,
          entityName: `Test data cleanup (${deletedItems.length} items)`,
          changes: [
            { field: 'verificationRequests', newValue: `${testRequestsSnap.size} deleted: ${(deletedByType['verificationRequest'] || []).join(', ') || 'none'}` },
            { field: 'dmTasks', newValue: `${testDmTasks.length} deleted: ${(deletedByType['dmTask'] || []).join(', ') || 'none'}` },
            { field: 'mailLogs', newValue: `${testMailLogs.length} deleted: ${(deletedByType['mailLog'] || []).join(', ') || 'none'}` },
            { field: 'storeAuthTokens', newValue: `${storeAuthTokens.length} deleted: ${(deletedByType['storeAuthToken'] || []).join(', ') || 'none'}` },
            { field: 'testTokens', newValue: `${testTokenDocs.length} deleted: ${(deletedByType['testToken'] || []).join(', ') || 'none'}` },
          ],
        });
      }

      res.json({
        success: true,
        deleted: {
          verificationRequests: testRequestsSnap.size,
          dmTasks: testDmTasks.length,
          mailLogs: testMailLogs.length,
          storeAuthTokens: storeAuthTokens.length,
          testTokens: testTokenDocs.length,
          total: deletedItems.length,
        },
        items: deletedItems,
      });
    } catch (error) {
      console.error('Delete test data error:', error);
      res.status(500).json({
        error: { code: 'delete_error', message: 'Failed to delete test data', requestId: res.locals.requestId },
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

import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { randomBytes, createHmac } from 'crypto';
import type {
  AuthUser,
  AuditLogEntry,
  DMVerificationRequest,
  DMVerificationStoreResponse,
  Assignment,
  Person,
  Location,
  District,
  Region,
} from '../../src/types';
import { createMailService } from '../services/mail';
import { createDMVerificationRequestEmail } from '../services/mailTemplates';

const TOKEN_SECRET = process.env.STORE_AUTH_TOKEN_SECRET || 'dev-token-secret-not-for-production';
const DEFAULT_DM_OFFSET_DAYS = 14;

function getAppUrl(req: Request): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }
  const origin = req.get('origin') || req.get('x-forwarded-host');
  if (origin) {
    if (origin.startsWith('http')) {
      return origin;
    }
    const protocol = req.get('x-forwarded-proto') || 'https';
    return `${protocol}://${origin}`;
  }
  const host = req.get('host');
  if (host) {
    const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
    return `${protocol}://${host}`;
  }
  return 'https://directory.shiekh.com';
}
const DM_VERIFICATION_EXPIRY_DAYS = 14;

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
  return createHmac('sha256', TOKEN_SECRET).update(token).digest('hex');
}

interface PrimaryRecipient {
  personId: string;
  personName: string;
  email: string;
  recipientType: 'dm' | 'rm' | 'steward';
}

async function findPrimaryDMForDistrict(
  db: Firestore,
  districtId: string
): Promise<{ personId: string; personName: string; email: string } | null> {
  const now = new Date().toISOString().slice(0, 10);
  
  const assignmentsSnap = await db.collection('assignments')
    .where('scopeType', '==', 'district')
    .where('scopeId', '==', districtId)
    .where('role', '==', 'DM')
    .where('capacity', '==', 'primary')
    .get();

  for (const doc of assignmentsSnap.docs) {
    const assignment = doc.data() as Assignment;
    if (assignment.startDate > now) continue;
    if (assignment.endDate && assignment.endDate < now) continue;
    if (assignment.endedAt) continue;

    const personDoc = await db.collection('people').doc(assignment.personId).get();
    if (!personDoc.exists) continue;
    const person = personDoc.data() as Person;
    if (person.lifecycle !== 'active') continue;
    if (!person.workEmail) continue;

    return {
      personId: assignment.personId,
      personName: person.fullName,
      email: person.workEmail,
    };
  }

  return null;
}

async function findRMForRegion(
  db: Firestore,
  regionId: string
): Promise<{ personId: string; personName: string; email: string } | null> {
  const now = new Date().toISOString().slice(0, 10);
  
  const assignmentsSnap = await db.collection('assignments')
    .where('scopeType', '==', 'region')
    .where('scopeId', '==', regionId)
    .where('role', '==', 'RM')
    .where('capacity', '==', 'primary')
    .get();

  for (const doc of assignmentsSnap.docs) {
    const assignment = doc.data() as Assignment;
    if (assignment.startDate > now) continue;
    if (assignment.endDate && assignment.endDate < now) continue;
    if (assignment.endedAt) continue;

    const personDoc = await db.collection('people').doc(assignment.personId).get();
    if (!personDoc.exists) continue;
    const person = personDoc.data() as Person;
    if (person.lifecycle !== 'active') continue;
    if (!person.workEmail) continue;

    return {
      personId: assignment.personId,
      personName: person.fullName,
      email: person.workEmail,
    };
  }

  return null;
}

async function getStewardEmails(db: Firestore): Promise<string[]> {
  const usersSnap = await db.collection('users')
    .where('role', '==', 'Steward')
    .where('status', '==', 'active')
    .get();

  return usersSnap.docs
    .map(doc => doc.data().email)
    .filter((email): email is string => !!email);
}

async function findRecipientForDistrict(
  db: Firestore,
  districtId: string,
  regionId: string
): Promise<PrimaryRecipient | null> {
  const dm = await findPrimaryDMForDistrict(db, districtId);
  if (dm) {
    return { ...dm, recipientType: 'dm' };
  }

  const rm = await findRMForRegion(db, regionId);
  if (rm) {
    return { ...rm, recipientType: 'rm' };
  }

  const stewardEmails = await getStewardEmails(db);
  if (stewardEmails.length > 0) {
    return {
      personId: 'steward-fallback',
      personName: 'Steward Team',
      email: stewardEmails[0],
      recipientType: 'steward',
    };
  }

  return null;
}

async function getStoresInDistrict(
  db: Firestore,
  districtId: string
): Promise<Location[]> {
  const snapshot = await db.collection('locations')
    .where('districtId', '==', districtId)
    .where('kind', '==', 'store')
    .where('lifecycle', '==', 'active')
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Location);
}

export function createDMVerificationRouter(db: Firestore): Router {
  const router = Router();

  router.get('/settings', async (_req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin access required', requestId: res.locals.requestId },
        });
      }

      const settingsDoc = await db.collection('settings').doc('dmVerification').get();
      const settings = settingsDoc.exists ? settingsDoc.data() : {};

      return res.json({
        data: {
          dmOffsetDays: settings?.dmOffsetDays ?? DEFAULT_DM_OFFSET_DAYS,
        },
      });
    } catch (error) {
      console.error('Get DM verification settings error:', error);
      return res.status(500).json({
        error: { code: 'get_error', message: 'Failed to get settings', requestId: res.locals.requestId },
      });
    }
  });

  router.patch('/settings', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin access required', requestId: res.locals.requestId },
        });
      }

      const { dmOffsetDays } = req.body;
      if (typeof dmOffsetDays !== 'number' || dmOffsetDays < 0 || dmOffsetDays > 30) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'dmOffsetDays must be a number between 0 and 30', requestId: res.locals.requestId },
        });
      }

      await db.collection('settings').doc('dmVerification').set(
        { dmOffsetDays, updatedAt: new Date().toISOString(), updatedBy: authUser.uid },
        { merge: true }
      );

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'verification',
        entityId: 'dmVerification-settings',
        entityName: 'DM Verification Settings',
        changes: [{ field: 'dmOffsetDays', newValue: dmOffsetDays }],
      });

      return res.json({ data: { dmOffsetDays } });
    } catch (error) {
      console.error('Update DM verification settings error:', error);
      return res.status(500).json({
        error: { code: 'update_error', message: 'Failed to update settings', requestId: res.locals.requestId },
      });
    }
  });

  router.get('/', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Authentication required', requestId: res.locals.requestId },
        });
      }

      const { status, districtId } = req.query;
      const isAdminOrSteward = authUser.role === 'Admin' || authUser.role === 'Steward';

      if (!isAdminOrSteward && authUser.role !== 'Leader') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Access denied', requestId: res.locals.requestId },
        });
      }

      let query = db.collection('dmVerificationRequests')
        .orderBy('sentAt', 'desc')
        .limit(100);

      if (status && typeof status === 'string') {
        query = query.where('status', '==', status);
      }

      if (districtId && typeof districtId === 'string') {
        query = query.where('districtId', '==', districtId);
      } else if (authUser.role === 'Leader' && authUser.leaderScope?.districtIds?.length) {
        query = query.where('districtId', 'in', authUser.leaderScope.districtIds);
      }

      const snapshot = await query.get();
      const requests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as DMVerificationRequest[];

      return res.json({ data: requests });
    } catch (error) {
      console.error('List DM verification requests error:', error);
      return res.status(500).json({
        error: { code: 'list_error', message: 'Failed to list requests', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Authentication required', requestId: res.locals.requestId },
        });
      }

      if (authUser.role !== 'Admin' && authUser.role !== 'Steward') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Admin and Steward can send DM verification requests', requestId: res.locals.requestId },
        });
      }

      const { districtId, cycleStartDate } = req.body;

      if (!districtId) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'districtId is required', requestId: res.locals.requestId },
        });
      }

      const districtDoc = await db.collection('districts').doc(districtId).get();
      if (!districtDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'District not found', requestId: res.locals.requestId },
        });
      }
      const district = districtDoc.data() as District;

      const regionDoc = await db.collection('regions').doc(district.regionId).get();
      const region = regionDoc.exists ? (regionDoc.data() as Region) : null;

      const pendingRequests = await db.collection('dmVerificationRequests')
        .where('districtId', '==', districtId)
        .where('status', 'in', ['pending', 'in_progress'])
        .get();

      if (!pendingRequests.empty) {
        return res.status(400).json({
          error: { code: 'pending_exists', message: 'A DM verification request is already pending for this district', requestId: res.locals.requestId },
        });
      }

      const recipient = await findRecipientForDistrict(db, districtId, district.regionId);
      if (!recipient) {
        return res.status(400).json({
          error: { code: 'no_recipient', message: 'No valid recipient found for this district (no Primary DM, RM, or Steward)', requestId: res.locals.requestId },
        });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + DM_VERIFICATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      const stores = await getStoresInDistrict(db, districtId);

      const requestRef = db.collection('dmVerificationRequests').doc();
      const dmVerificationRequest: Omit<DMVerificationRequest, 'id'> = {
        districtId,
        districtName: district.name,
        regionId: district.regionId,
        regionName: region?.name,
        status: 'pending',
        cycleStartDate: cycleStartDate || now.toISOString().slice(0, 10),
        sentAt: now.toISOString(),
        sentTo: recipient.email,
        sentToPersonId: recipient.personId,
        sentToPersonName: recipient.personName,
        sentBy: authUser.uid,
        recipientType: recipient.recipientType,
        expiresAt: expiresAt.toISOString(),
        storeResponses: stores.map(store => ({
          locationId: store.id,
          storeNumber: store.storeNumber,
          storeName: store.name,
          smConfirmed: false,
        })),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        updatedBy: authUser.uid,
        version: 1,
      };

      await requestRef.set(dmVerificationRequest);

      const verifyToken = generateToken();
      await db.collection('dmAuthTokens').doc(hashToken(verifyToken)).set({
        dmVerificationRequestId: requestRef.id,
        districtId,
        personId: recipient.personId,
        email: recipient.email,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        createdBy: authUser.uid,
      });

      const appUrl = getAppUrl(req);
      const verificationUrl = `${appUrl}/dm-verify/${requestRef.id}?token=${verifyToken}`;

      const mailService = createMailService(db);
      const emailData = {
        recipientName: recipient.personName,
        recipientType: recipient.recipientType,
        districtName: district.name,
        storeCount: stores.length,
        verificationUrl,
        expiresAt: expiresAt.toISOString(),
      };

      const email = createDMVerificationRequestEmail(emailData);
      const mailResult = await mailService.send({
        ...email,
        to: recipient.email,
      });

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
        console.log(`[DM Verification] Email blocked for ${district.name}: ${mailResult.reason}`);
        console.log(`[DM Verification] Verification URL: ${verificationUrl}`);
      }

      await db.collection('mailLog').add({
        to: recipient.email,
        type: 'dm-verification-request',
        dmVerificationRequestId: requestRef.id,
        districtId,
        districtName: district.name,
        verificationUrl,
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
        entityName: `DM verification for ${district.name}`,
        changes: [
          { field: 'sentTo', newValue: recipient.email },
          { field: 'recipientType', newValue: recipient.recipientType },
          { field: 'storeCount', newValue: stores.length },
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
        testLinks: mailResult.blocked ? { verificationUrl } : undefined,
      });
    } catch (error) {
      console.error('Create DM verification request error:', error);
      return res.status(500).json({
        error: { code: 'create_error', message: 'Failed to create request', requestId: res.locals.requestId },
      });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser | undefined;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Authentication required', requestId: res.locals.requestId },
        });
      }

      const requestDoc = await db.collection('dmVerificationRequests').doc(id).get();
      if (!requestDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'DM verification request not found', requestId: res.locals.requestId },
        });
      }

      const request = { id: requestDoc.id, ...requestDoc.data() } as DMVerificationRequest;

      const isAdminOrSteward = authUser.role === 'Admin' || authUser.role === 'Steward';
      const isRecipient = authUser.personId === request.sentToPersonId;
      const isLeaderInScope = authUser.role === 'Leader' && 
        authUser.leaderScope?.districtIds?.includes(request.districtId);

      if (!isAdminOrSteward && !isRecipient && !isLeaderInScope) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Access denied', requestId: res.locals.requestId },
        });
      }

      return res.json({ data: request });
    } catch (error) {
      console.error('Get DM verification request error:', error);
      return res.status(500).json({
        error: { code: 'get_error', message: 'Failed to get request', requestId: res.locals.requestId },
      });
    }
  });

  router.get('/:id/roster', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser | undefined;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Authentication required', requestId: res.locals.requestId },
        });
      }

      const requestDoc = await db.collection('dmVerificationRequests').doc(id).get();
      if (!requestDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'DM verification request not found', requestId: res.locals.requestId },
        });
      }

      const request = { id: requestDoc.id, ...requestDoc.data() } as DMVerificationRequest;

      const stores = await getStoresInDistrict(db, request.districtId);
      const now = new Date().toISOString().slice(0, 10);

      const roster = await Promise.all(stores.map(async (store) => {
        const assignmentsSnap = await db.collection('assignments')
          .where('scopeType', '==', 'location')
          .where('scopeId', '==', store.id)
          .where('role', 'in', ['SM', 'ASM', 'KH'])
          .get();

        const holders: { role: string; personId: string; personName: string; capacity: string }[] = [];

        for (const doc of assignmentsSnap.docs) {
          const assignment = doc.data() as Assignment;
          if (assignment.startDate > now) continue;
          if (assignment.endDate && assignment.endDate < now) continue;
          if (assignment.endedAt) continue;

          const personDoc = await db.collection('people').doc(assignment.personId).get();
          if (!personDoc.exists) continue;
          const person = personDoc.data() as Person;

          holders.push({
            role: assignment.role,
            personId: assignment.personId,
            personName: person.fullName,
            capacity: assignment.capacity || 'primary',
          });
        }

        const storeResponse = request.storeResponses?.find(sr => sr.locationId === store.id);
        const verificationStatus = storeResponse?.smConfirmed 
          ? 'confirmed' 
          : storeResponse?.respondedAt 
            ? 'pending_correction' 
            : 'not_done';

        return {
          locationId: store.id,
          storeNumber: store.storeNumber,
          storeName: store.name,
          lastVerifiedAt: store.lastVerifiedAt,
          sm: holders.filter(h => h.role === 'SM'),
          asm: holders.filter(h => h.role === 'ASM'),
          kh: holders.filter(h => h.role === 'KH'),
          verificationStatus,
          storeResponse,
        };
      }));

      return res.json({ data: roster });
    } catch (error) {
      console.error('Get DM verification roster error:', error);
      return res.status(500).json({
        error: { code: 'roster_error', message: 'Failed to get roster', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/:id/respond', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { storeResponses, token } = req.body;
      const authUser = res.locals.authUser as AuthUser | undefined;

      const requestDoc = await db.collection('dmVerificationRequests').doc(id).get();
      if (!requestDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'DM verification request not found', requestId: res.locals.requestId },
        });
      }

      const request = { id: requestDoc.id, ...requestDoc.data() } as DMVerificationRequest;

      if (token) {
        const tokenDoc = await db.collection('dmAuthTokens').doc(hashToken(token)).get();
        if (!tokenDoc.exists) {
          return res.status(401).json({
            error: { code: 'invalid_token', message: 'Invalid or expired token', requestId: res.locals.requestId },
          });
        }
        const tokenData = tokenDoc.data()!;
        if (tokenData.dmVerificationRequestId !== id) {
          return res.status(401).json({
            error: { code: 'invalid_token', message: 'Token does not match this request', requestId: res.locals.requestId },
          });
        }
        if (new Date(tokenData.expiresAt) < new Date()) {
          return res.status(401).json({
            error: { code: 'expired_token', message: 'Token has expired', requestId: res.locals.requestId },
          });
        }
      } else if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Authentication required', requestId: res.locals.requestId },
        });
      } else {
        const isAdminOrSteward = authUser.role === 'Admin' || authUser.role === 'Steward';
        const isRecipient = authUser.personId === request.sentToPersonId;
        if (!isAdminOrSteward && !isRecipient) {
          return res.status(403).json({
            error: { code: 'forbidden', message: 'Access denied', requestId: res.locals.requestId },
          });
        }
      }

      if (request.status === 'confirmed') {
        return res.status(400).json({
          error: { code: 'already_confirmed', message: 'This request has already been confirmed', requestId: res.locals.requestId },
        });
      }

      if (request.status === 'cancelled') {
        return res.status(400).json({
          error: { code: 'cancelled', message: 'This request has been cancelled', requestId: res.locals.requestId },
        });
      }

      if (request.status === 'expired' || new Date(request.expiresAt) < new Date()) {
        return res.status(400).json({
          error: { code: 'expired', message: 'This request has expired', requestId: res.locals.requestId },
        });
      }

      if (!Array.isArray(storeResponses)) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'storeResponses must be an array', requestId: res.locals.requestId },
        });
      }

      const now = new Date();
      const mergedResponses: DMVerificationStoreResponse[] = (request.storeResponses || []).map(existing => {
        const update = storeResponses.find((sr: DMVerificationStoreResponse) => sr.locationId === existing.locationId);
        if (update) {
          return {
            ...existing,
            smConfirmed: update.smConfirmed,
            smCorrectionId: update.smCorrectionId,
            respondedAt: now.toISOString(),
          };
        }
        return existing;
      });

      const allConfirmed = mergedResponses.every(sr => sr.smConfirmed);
      const newStatus = allConfirmed ? 'confirmed' : 'in_progress';

      await db.collection('dmVerificationRequests').doc(id).update({
        status: newStatus,
        storeResponses: mergedResponses,
        respondedAt: now.toISOString(),
        respondedBy: authUser?.uid || request.sentToPersonId,
        updatedAt: now.toISOString(),
        updatedBy: authUser?.uid || 'token-auth',
        version: (request.version || 0) + 1,
      });

      await logAudit(db, {
        userId: authUser?.uid || request.sentToPersonId,
        userEmail: authUser?.email || request.sentTo,
        userRole: authUser?.role || 'Leader',
        action: 'respond',
        entityType: 'verification',
        entityId: id,
        entityName: `DM verification for ${request.districtName}`,
        changes: [
          { field: 'status', oldValue: request.status, newValue: newStatus },
          { field: 'confirmedStores', newValue: mergedResponses.filter(sr => sr.smConfirmed).length },
        ],
      });

      return res.json({
        data: {
          id,
          status: newStatus,
          respondedAt: now.toISOString(),
          storeResponses: mergedResponses,
        },
      });
    } catch (error) {
      console.error('Respond to DM verification error:', error);
      return res.status(500).json({
        error: { code: 'respond_error', message: 'Failed to respond', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/:id/reminder', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser | undefined;

      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Admin and Steward can send reminders', requestId: res.locals.requestId },
        });
      }

      const requestDoc = await db.collection('dmVerificationRequests').doc(id).get();
      if (!requestDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'DM verification request not found', requestId: res.locals.requestId },
        });
      }

      const request = { id: requestDoc.id, ...requestDoc.data() } as DMVerificationRequest;

      if (request.status !== 'pending' && request.status !== 'in_progress') {
        return res.status(400).json({
          error: { code: 'invalid_status', message: 'Can only send reminders for pending or in-progress requests', requestId: res.locals.requestId },
        });
      }

      const now = new Date();
      await requestDoc.ref.update({
        lastReminderAt: now.toISOString(),
        reminderCount: (request.reminderCount || 0) + 1,
        updatedAt: now.toISOString(),
        updatedBy: authUser.uid,
      });

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'send',
        entityType: 'verification',
        entityId: id,
        entityName: `DM verification reminder for ${request.districtName}`,
        changes: [{ field: 'reminderCount', newValue: (request.reminderCount || 0) + 1 }],
      });

      return res.json({ data: { reminded: true } });
    } catch (error) {
      console.error('Send DM verification reminder error:', error);
      return res.status(500).json({
        error: { code: 'reminder_error', message: 'Failed to send reminder', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/:id/cancel', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;
      const { reason } = req.body;

      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Admin and Steward can cancel DM verifications', requestId: res.locals.requestId },
        });
      }

      const requestDoc = await db.collection('dmVerificationRequests').doc(id).get();
      if (!requestDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'DM verification request not found', requestId: res.locals.requestId },
        });
      }

      const request = { id: requestDoc.id, ...requestDoc.data() } as DMVerificationRequest;

      if (request.status === 'confirmed' || request.status === 'cancelled') {
        return res.status(400).json({
          error: { code: 'invalid_status', message: `Cannot cancel a ${request.status} request`, requestId: res.locals.requestId },
        });
      }

      const now = new Date();
      await requestDoc.ref.update({
        status: 'cancelled',
        cancelledAt: now.toISOString(),
        cancelledBy: authUser.uid,
        cancelReason: reason || null,
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
        entityName: `DM verification cancelled for ${request.districtName}`,
        changes: [
          { field: 'status', oldValue: request.status, newValue: 'cancelled' },
          ...(reason ? [{ field: 'cancelReason', newValue: reason }] : []),
        ],
      });

      return res.json({
        data: {
          id,
          status: 'cancelled',
          cancelledAt: now.toISOString(),
          cancelledBy: authUser.uid,
        },
      });
    } catch (error) {
      console.error('Cancel DM verification error:', error);
      return res.status(500).json({
        error: { code: 'cancel_error', message: 'Failed to cancel DM verification', requestId: res.locals.requestId },
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

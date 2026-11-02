import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { createUnifiedMailService } from '../services/unifiedMail';
import { generateToken, generateSessionId, hashToken, hashSessionId } from '../services/tokenAuth';
import { getWorkflowRules } from '../services/workflowSettings';
import type { Location, AuditLogEntry } from '../../src/types';

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

export interface OneClickToken {
  id: string;
  locationId: string;
  storeNumber: string;
  storeEmail: string;
  action: 'confirm' | 'update';
  verificationRequestId?: string;
  expiresAt: string;
  usedAt?: string;
  usedBy?: string;
  createdAt: string;
  createdBy: string;
}

export interface StoreSession {
  locationId: string;
  storeNumber: string;
  email: string;
  role: 'Store';
  expiresAt: string;
  revoked: boolean;
  revokedAt?: string;
  revokedBy?: string;
  createdAt: string;
  createdBy: string;
  userAgent?: string;
}

function parseStoreEmail(email: string): { valid: boolean; storeNumber?: number } {
  const normalized = email.toLowerCase().trim();
  const match = normalized.match(/^store(\d+)@shiekhshoes\.com$/);
  if (!match) {
    return { valid: false };
  }
  const storeNumber = parseInt(match[1], 10);
  if (storeNumber < 1 || storeNumber > 9999) {
    return { valid: false };
  }
  return { valid: true, storeNumber };
}

function setSessionCookie(res: Response, sessionId: string, expiresAt: Date): void {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('__session', sessionId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    expires: expiresAt,
    path: '/',
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie('__session', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}

export function createStoreAuthRouter(db: Firestore): Router {
  const router = Router();

  router.post('/send-link', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'Email is required', requestId: res.locals.requestId },
        });
      }

      const parsed = parseStoreEmail(email);
      if (!parsed.valid || !parsed.storeNumber) {
        return res.status(400).json({
          error: { 
            code: 'invalid_email', 
            message: 'Only store mailboxes (store{n}@shiekhshoes.com) can use passwordless sign-in. Staff should use Google Sign-In.',
            requestId: res.locals.requestId,
          },
        });
      }

      const storeNum = parsed.storeNumber;
      const storeNumberFormats = [
        String(storeNum).padStart(2, '0'),
        String(storeNum),
        String(storeNum).padStart(3, '0'),
      ];
      const uniqueFormats = [...new Set(storeNumberFormats)];

      let locationDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
      
      for (const format of uniqueFormats) {
        const query = await db.collection('locations')
          .where('storeNumber', '==', format)
          .where('lifecycle', '==', 'active')
          .limit(1)
          .get();
        
        if (!query.empty) {
          locationDoc = query.docs[0];
          break;
        }
      }

      if (!locationDoc) {
        return res.status(404).json({
          error: { code: 'store_not_found', message: 'No active store found for this email', requestId: res.locals.requestId },
        });
      }

      const location = { id: locationDoc.id, ...locationDoc.data() } as Location;

      const workflowRules = await getWorkflowRules(db);
      const token = generateToken();
      const tokenHash = hashToken(token);
      const tokenId = `tok_${randomBytes(8).toString('hex')}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + workflowRules.signInLinkHours * 60 * 60 * 1000);

      const tokenDoc: Omit<OneClickToken, 'id'> & { tokenId: string } = {
        locationId: location.id,
        storeNumber: location.storeNumber,
        storeEmail: email.toLowerCase(),
        action: 'confirm',
        tokenId,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        createdBy: 'store-sign-in',
      };

      const tokenRef = db.collection('storeAuthTokens').doc(tokenHash);
      await tokenRef.set(tokenDoc);

      await db.collection('testTokens').doc(tokenId).set({
        token,
        action: 'signin',
        locationId: location.id,
        storeNumber: location.storeNumber,
        storeEmail: email.toLowerCase(),
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        createdBy: 'store-sign-in',
      });

      const appUrl = getAppUrl(req);
      const signInUrl = `${appUrl}/store-signin?token=${token}`;

      const mailService = createUnifiedMailService(db);
      await mailService.sendStoreSignIn(
        email.toLowerCase(),
        {
          storeNumber: location.storeNumber,
          storeName: location.name,
          signInUrl,
          expiresAt: expiresAt.toISOString(),
        },
        'system',
        email.toLowerCase()
      );

      await logAudit(db, {
        userId: 'system',
        userEmail: email.toLowerCase(),
        userRole: 'Store',
        action: 'request-signin',
        entityType: 'store-auth',
        entityId: location.id,
        entityName: `Sign-in link requested for store ${location.storeNumber}`,
        locationId: location.id,
        changes: [
          { field: 'email', newValue: email.toLowerCase() },
          { field: 'expiresAt', newValue: expiresAt.toISOString() },
        ],
      });

      res.json({
        success: true,
        message: 'If this is a valid store mailbox, a sign-in link will be sent.',
        email: email.toLowerCase(),
      });
    } catch (error) {
      console.error('Send store sign-in link error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to send sign-in link', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/verify-token', async (req: Request, res: Response) => {
    try {
      const { token } = req.body;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_token', message: 'Token is required', requestId: res.locals.requestId },
        });
      }

      const workflowRules = await getWorkflowRules(db);
      const tokenHash = hashToken(token);
      const tokenRef = db.collection('storeAuthTokens').doc(tokenHash);
      const now = new Date();
      const userAgent = req.get('user-agent');

      const result = await db.runTransaction(async (transaction) => {
        const tokenDoc = await transaction.get(tokenRef);

        if (!tokenDoc.exists) {
          return { error: 'token_not_found', status: 404, message: 'Invalid or expired link' };
        }

        const tokenData = tokenDoc.data() as Omit<OneClickToken, 'id'>;

        if (tokenData.usedAt) {
          return { error: 'token_used', status: 400, message: 'This link has already been used' };
        }

        if (new Date(tokenData.expiresAt) < now) {
          return { error: 'token_expired', status: 400, message: 'This link has expired' };
        }

        const locationRef = db.collection('locations').doc(tokenData.locationId);
        const locationDoc = await transaction.get(locationRef);
        
        if (!locationDoc.exists) {
          return { error: 'store_not_found', status: 404, message: 'Store not found' };
        }

        const location = { id: locationDoc.id, ...locationDoc.data() } as Location;

        const sessionId = generateSessionId();
        const sessionHash = hashSessionId(sessionId);
        const expiresAt = new Date(now.getTime() + workflowRules.storeSessionHours * 60 * 60 * 1000);

        const sessionData: StoreSession = {
          locationId: location.id,
          storeNumber: location.storeNumber,
          email: tokenData.storeEmail,
          role: 'Store',
          expiresAt: expiresAt.toISOString(),
          revoked: false,
          createdAt: now.toISOString(),
          createdBy: 'store-signin',
          userAgent,
        };

        const sessionRef = db.collection('storeSessions').doc(sessionHash);
        transaction.set(sessionRef, sessionData);

        transaction.update(tokenRef, {
          usedAt: now.toISOString(),
          usedBy: tokenData.storeEmail,
        });

        const userRef = db.collection('users').doc(`store_${location.id}`);
        transaction.set(userRef, {
          email: tokenData.storeEmail,
          displayName: `Store ${location.storeNumber}`,
          role: 'Store',
          storeLocationId: location.id,
          status: 'active',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          updatedBy: 'store-signin',
          version: 1,
        }, { merge: true });

        return { success: true, tokenData, location, sessionId, expiresAt };
      });

      if ('error' in result && result.error) {
        return res.status(result.status as number).json({
          error: { code: result.error, message: result.message, requestId: res.locals.requestId },
        });
      }

      const { tokenData, location, sessionId, expiresAt } = result as { 
        success: true; 
        tokenData: Omit<OneClickToken, 'id'>; 
        location: Location; 
        sessionId: string; 
        expiresAt: Date;
      };

      setSessionCookie(res, sessionId, expiresAt);

      await logAudit(db, {
        userId: `store_${location.id}`,
        userEmail: tokenData.storeEmail,
        userRole: 'Store',
        action: 'use-signin-token',
        entityType: 'store-auth',
        entityId: location.id,
        entityName: `Sign-in link used for store ${location.storeNumber}`,
        locationId: location.id,
        changes: [
          { field: 'usedAt', newValue: now.toISOString() },
        ],
      });

      res.json({
        valid: true,
        sessionId,
        locationId: location.id,
        storeNumber: location.storeNumber,
        storeName: location.name,
        email: tokenData.storeEmail,
      });
    } catch (error) {
      console.error('Verify store token error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to verify token', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/logout', async (req: Request, res: Response) => {
    try {
      const sessionId = req.cookies?.__session || 
        (req.headers.authorization?.startsWith('StoreSession ') 
          ? req.headers.authorization.slice(13) 
          : null);

      if (sessionId) {
        const sessionHash = hashSessionId(sessionId);
        const sessionRef = db.collection('storeSessions').doc(sessionHash);
        const sessionDoc = await sessionRef.get();

        if (sessionDoc.exists) {
          const sessionData = sessionDoc.data() as StoreSession;
          await sessionRef.update({
            revoked: true,
            revokedAt: new Date().toISOString(),
            revokedBy: 'logout',
          });

          await logAudit(db, {
            userId: `store_${sessionData.locationId}`,
            userEmail: sessionData.email,
            userRole: 'Store',
            action: 'logout',
            entityType: 'store-auth',
            entityId: sessionData.locationId,
            entityName: `Store ${sessionData.storeNumber} logged out`,
            locationId: sessionData.locationId,
            changes: [],
          });
        }
      }

      clearSessionCookie(res);
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      clearSessionCookie(res);
      res.json({ success: true, message: 'Logged out' });
    }
  });

  router.post('/revoke', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser;
      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin or Steward access required', requestId: res.locals.requestId },
        });
      }

      const { locationId, sessionId } = req.body;

      if (sessionId) {
        const sessionHash = hashSessionId(sessionId);
        const sessionRef = db.collection('storeSessions').doc(sessionHash);
        const sessionDoc = await sessionRef.get();

        if (!sessionDoc.exists) {
          return res.status(404).json({
            error: { code: 'not_found', message: 'Session not found', requestId: res.locals.requestId },
          });
        }

        const sessionData = sessionDoc.data() as StoreSession;
        await sessionRef.update({
          revoked: true,
          revokedAt: new Date().toISOString(),
          revokedBy: authUser.uid,
        });

        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'revoke-session',
          entityType: 'store-auth',
          entityId: sessionData.locationId,
          entityName: `Session revoked for store ${sessionData.storeNumber}`,
          locationId: sessionData.locationId,
          changes: [{ field: 'revokedBy', newValue: authUser.uid }],
        });

        return res.json({ success: true, revoked: 1 });
      }

      if (locationId) {
        const sessionsSnap = await db.collection('storeSessions')
          .where('locationId', '==', locationId)
          .where('revoked', '==', false)
          .get();

        const batch = db.batch();
        let count = 0;
        for (const doc of sessionsSnap.docs) {
          batch.update(doc.ref, {
            revoked: true,
            revokedAt: new Date().toISOString(),
            revokedBy: authUser.uid,
          });
          count++;
        }
        await batch.commit();

        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'revoke-all-sessions',
          entityType: 'store-auth',
          entityId: locationId,
          entityName: `All sessions revoked for location ${locationId}`,
          locationId,
          changes: [{ field: 'sessionsRevoked', newValue: count }],
        });

        return res.json({ success: true, revoked: count });
      }

      return res.status(400).json({
        error: { code: 'invalid_request', message: 'Either sessionId or locationId required', requestId: res.locals.requestId },
      });
    } catch (error) {
      console.error('Revoke error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to revoke session', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/create-verification-tokens', async (req: Request, res: Response) => {
    try {
      const { locationId, verificationRequestId } = req.body;
      const authUser = res.locals.authUser;

      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Admin and Steward can create verification tokens', requestId: res.locals.requestId },
        });
      }

      const locationDoc = await db.collection('locations').doc(locationId).get();
      if (!locationDoc.exists) {
        return res.status(404).json({
          error: { code: 'store_not_found', message: 'Store not found', requestId: res.locals.requestId },
        });
      }

      const location = { id: locationDoc.id, ...locationDoc.data() } as Location;

      if (!location.sharedInboxEmail) {
        return res.status(400).json({
          error: { code: 'no_email', message: 'Store has no shared inbox email', requestId: res.locals.requestId },
        });
      }

      const workflowRules = await getWorkflowRules(db);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + workflowRules.storeOneClickLinkDays * 24 * 60 * 60 * 1000);

      const confirmToken = generateToken();
      const updateToken = generateToken();

      const baseTokenData = {
        locationId: location.id,
        storeNumber: location.storeNumber,
        storeEmail: location.sharedInboxEmail,
        verificationRequestId,
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

      const appUrl = getAppUrl(req);
      const confirmUrl = `${appUrl}/verify-action?token=${confirmToken}&action=confirm`;
      const updateUrl = `${appUrl}/verify-action?token=${updateToken}&action=update`;

      res.json({
        confirmUrl,
        updateUrl,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error('Create verification tokens error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to create verification tokens', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/one-click-action', async (req: Request, res: Response) => {
    try {
      const { token, action } = req.body;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_token', message: 'Token is required', requestId: res.locals.requestId },
        });
      }

      if (action !== 'confirm' && action !== 'update') {
        return res.status(400).json({
          error: { code: 'invalid_action', message: 'Action must be confirm or update', requestId: res.locals.requestId },
        });
      }

      const tokenHash = hashToken(token);
      const tokenRef = db.collection('storeAuthTokens').doc(tokenHash);
      const now = new Date();
      const userAgent = req.get('user-agent');
      const workflowRules = await getWorkflowRules(db);

      const result = await db.runTransaction(async (transaction) => {
        const tokenDoc = await transaction.get(tokenRef);

        if (!tokenDoc.exists) {
          return { error: 'token_not_found', status: 404, message: 'Invalid or expired link' };
        }

        const tokenData = tokenDoc.data() as Omit<OneClickToken, 'id'>;

        if (tokenData.usedAt) {
          return { error: 'token_used', status: 400, message: 'This link has already been used' };
        }

        if (tokenData.action !== action) {
          return { error: 'action_mismatch', status: 400, message: 'Token action does not match' };
        }

        if (new Date(tokenData.expiresAt) < now) {
          return { error: 'token_expired', status: 400, message: 'This link has expired' };
        }

        const locationRef = db.collection('locations').doc(tokenData.locationId);
        const locationDoc = await transaction.get(locationRef);
        
        if (!locationDoc.exists) {
          return { error: 'store_not_found', status: 404, message: 'Store not found' };
        }

        const location = { id: locationDoc.id, ...locationDoc.data() } as Location;

        if (action === 'confirm') {
          transaction.update(locationRef, {
            lastVerifiedAt: now.toISOString(),
            lastVerifiedBy: tokenData.storeEmail,
            updatedAt: now.toISOString(),
            updatedBy: tokenData.storeEmail,
          });

          if (tokenData.verificationRequestId) {
            const verificationRef = db.collection('verificationRequests').doc(tokenData.verificationRequestId);
            transaction.update(verificationRef, {
              status: 'confirmed',
              respondedAt: now.toISOString(),
              respondedBy: tokenData.storeEmail,
              hoursConfirmed: true,
              updatedAt: now.toISOString(),
            });
          }
        }

        transaction.update(tokenRef, {
          usedAt: now.toISOString(),
          usedBy: tokenData.storeEmail,
        });

        if (action === 'update') {
          const sessionId = generateSessionId();
          const sessionHash = hashSessionId(sessionId);
          const expiresAt = new Date(now.getTime() + workflowRules.storeSessionHours * 60 * 60 * 1000);

          const sessionData: StoreSession = {
            locationId: location.id,
            storeNumber: location.storeNumber,
            email: tokenData.storeEmail,
            role: 'Store',
            expiresAt: expiresAt.toISOString(),
            revoked: false,
            createdAt: now.toISOString(),
            createdBy: 'one-click-update',
            userAgent,
          };

          const sessionRef = db.collection('storeSessions').doc(sessionHash);
          transaction.set(sessionRef, sessionData);

          const userRef = db.collection('users').doc(`store_${location.id}`);
          transaction.set(userRef, {
            email: tokenData.storeEmail,
            displayName: `Store ${location.storeNumber}`,
            role: 'Store',
            storeLocationId: location.id,
            status: 'active',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            updatedBy: 'one-click-update',
            version: 1,
          }, { merge: true });

          return { success: true, tokenData, location, action, sessionId, expiresAt };
        }

        return { success: true, tokenData, location, action };
      });

      if ('error' in result && result.error) {
        return res.status(result.status as number).json({
          error: { code: result.error, message: result.message, requestId: res.locals.requestId },
        });
      }

      const { tokenData, location, sessionId, expiresAt } = result as { 
        success: true; 
        tokenData: Omit<OneClickToken, 'id'>; 
        location: Location; 
        action: string;
        sessionId?: string;
        expiresAt?: Date;
      };

      if (action === 'confirm') {
        await logAudit(db, {
          userId: tokenData.storeEmail,
          userEmail: tokenData.storeEmail,
          userRole: 'Store',
          action: 'one-click-confirm',
          entityType: 'verification',
          entityId: tokenData.verificationRequestId || location.id,
          entityName: `Store ${location.storeNumber} verified (one-click)`,
          locationId: location.id,
          changes: [
            { field: 'lastVerifiedAt', newValue: now.toISOString() },
            { field: 'hoursConfirmed', newValue: true },
          ],
        });

        return res.json({
          success: true,
          action: 'confirmed',
          message: 'Store hours confirmed',
          storeNumber: location.storeNumber,
          storeName: location.name,
        });
      }

      if (sessionId && expiresAt) {
        setSessionCookie(res, sessionId, expiresAt);
      }

      await logAudit(db, {
        userId: `store_${location.id}`,
        userEmail: tokenData.storeEmail,
        userRole: 'Store',
        action: 'one-click-update',
        entityType: 'store-auth',
        entityId: location.id,
        entityName: `Store ${location.storeNumber} update requested (one-click)`,
        locationId: location.id,
        changes: [],
      });

      return res.json({
        success: true,
        action: 'update',
        sessionId,
        message: 'You have been signed in to update your store information',
        locationId: location.id,
        storeNumber: location.storeNumber,
        storeName: location.name,
        email: tokenData.storeEmail,
      });
    } catch (error) {
      console.error('One-click action error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to process action', requestId: res.locals.requestId },
      });
    }
  });

  router.get('/session', async (req: Request, res: Response) => {
    try {
      const sessionId = req.cookies?.__session || 
        (req.headers.authorization?.startsWith('StoreSession ') 
          ? req.headers.authorization.slice(13) 
          : null);

      if (!sessionId) {
        return res.json({ authenticated: false });
      }

      const sessionHash = hashSessionId(sessionId);
      const sessionDoc = await db.collection('storeSessions').doc(sessionHash).get();

      if (!sessionDoc.exists) {
        clearSessionCookie(res);
        return res.json({ authenticated: false });
      }

      const session = sessionDoc.data() as StoreSession;

      if (session.revoked || new Date(session.expiresAt) < new Date()) {
        clearSessionCookie(res);
        return res.json({ authenticated: false });
      }

      const locationDoc = await db.collection('locations').doc(session.locationId).get();
      const location = locationDoc.exists ? { id: locationDoc.id, ...locationDoc.data() } as Location : null;

      res.json({
        authenticated: true,
        locationId: session.locationId,
        storeNumber: session.storeNumber,
        storeName: location?.name,
        email: session.email,
        role: session.role,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      console.error('Get session error:', error);
      res.json({ authenticated: false });
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

export { parseStoreEmail };
export { hashSessionId } from '../services/tokenAuth';

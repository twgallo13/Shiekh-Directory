import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { createMailService } from '../services/mail';
import type { Location, AuditLogEntry } from '../../src/types';

const APP_URL = process.env.APP_URL || 'https://directory.shiekh.com';
const TOKEN_SECRET = process.env.STORE_AUTH_TOKEN_SECRET || 'dev-token-secret-not-for-production';
const TOKEN_EXPIRY_HOURS = 24;

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

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
  return createHmac('sha256', TOKEN_SECRET).update(token).digest('hex');
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

      const storeNumberPadded = String(parsed.storeNumber).padStart(3, '0');
      const locationQuery = await db.collection('locations')
        .where('storeNumber', '==', storeNumberPadded)
        .where('recordStatus', '==', 'Active')
        .limit(1)
        .get();

      if (locationQuery.empty) {
        const locationQueryNoPad = await db.collection('locations')
          .where('storeNumber', '==', String(parsed.storeNumber))
          .where('recordStatus', '==', 'Active')
          .limit(1)
          .get();

        if (locationQueryNoPad.empty) {
          return res.status(404).json({
            error: { code: 'store_not_found', message: 'No active store found for this email', requestId: res.locals.requestId },
          });
        }
      }

      const locationDoc = locationQuery.empty 
        ? (await db.collection('locations')
            .where('storeNumber', '==', String(parsed.storeNumber))
            .where('recordStatus', '==', 'Active')
            .limit(1)
            .get()).docs[0]
        : locationQuery.docs[0];

      const location = { id: locationDoc.id, ...locationDoc.data() } as Location;

      const token = generateToken();
      const tokenHash = hashToken(token);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

      const tokenDoc: Omit<OneClickToken, 'id'> = {
        locationId: location.id,
        storeNumber: location.storeNumber,
        storeEmail: email.toLowerCase(),
        action: 'confirm',
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        createdBy: 'store-sign-in',
      };

      const tokenRef = db.collection('storeAuthTokens').doc(tokenHash);
      await tokenRef.set(tokenDoc);

      const signInUrl = `${APP_URL}/store-signin?token=${token}`;

      const mailService = createMailService(db);
      const mailResult = await mailService.send({
        to: email.toLowerCase(),
        subject: `Sign in to Shiekh Directory - Store ${location.storeNumber}`,
        html: createSignInEmailHtml(location.storeNumber, location.name, signInUrl, expiresAt),
        text: createSignInEmailText(location.storeNumber, location.name, signInUrl, expiresAt),
      });

      await db.collection('mailLog').add({
        to: email.toLowerCase(),
        type: 'store-signin',
        locationId: location.id,
        storeNumber: location.storeNumber,
        signInUrl,
        sentAt: now.toISOString(),
        success: mailResult.success,
        blocked: mailResult.blocked,
        reason: mailResult.reason || mailResult.error,
      });

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
        message: 'Sign-in link sent to store mailbox',
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

      const tokenHash = hashToken(token);
      const tokenDoc = await db.collection('storeAuthTokens').doc(tokenHash).get();

      if (!tokenDoc.exists) {
        return res.status(404).json({
          error: { code: 'token_not_found', message: 'Invalid or expired link', requestId: res.locals.requestId },
        });
      }

      const tokenData = tokenDoc.data() as Omit<OneClickToken, 'id'>;

      if (tokenData.usedAt) {
        return res.status(400).json({
          error: { code: 'token_used', message: 'This link has already been used', requestId: res.locals.requestId },
        });
      }

      const now = new Date();
      if (new Date(tokenData.expiresAt) < now) {
        return res.status(400).json({
          error: { code: 'token_expired', message: 'This link has expired', requestId: res.locals.requestId },
        });
      }

      const locationDoc = await db.collection('locations').doc(tokenData.locationId).get();
      if (!locationDoc.exists) {
        return res.status(404).json({
          error: { code: 'store_not_found', message: 'Store not found', requestId: res.locals.requestId },
        });
      }

      const location = { id: locationDoc.id, ...locationDoc.data() } as Location;

      await tokenDoc.ref.update({
        usedAt: now.toISOString(),
        usedBy: tokenData.storeEmail,
      });

      await logAudit(db, {
        userId: 'system',
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

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

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

      const confirmUrl = `${APP_URL}/verify-action?token=${confirmToken}&action=confirm`;
      const updateUrl = `${APP_URL}/verify-action?token=${updateToken}&action=update`;

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
      const tokenDoc = await db.collection('storeAuthTokens').doc(tokenHash).get();

      if (!tokenDoc.exists) {
        return res.status(404).json({
          error: { code: 'token_not_found', message: 'Invalid or expired link', requestId: res.locals.requestId },
        });
      }

      const tokenData = tokenDoc.data() as Omit<OneClickToken, 'id'>;

      if (tokenData.usedAt) {
        return res.status(400).json({
          error: { code: 'token_used', message: 'This link has already been used', requestId: res.locals.requestId },
        });
      }

      if (tokenData.action !== action) {
        return res.status(400).json({
          error: { code: 'action_mismatch', message: 'Token action does not match', requestId: res.locals.requestId },
        });
      }

      const now = new Date();
      if (new Date(tokenData.expiresAt) < now) {
        return res.status(400).json({
          error: { code: 'token_expired', message: 'This link has expired', requestId: res.locals.requestId },
        });
      }

      await tokenDoc.ref.update({
        usedAt: now.toISOString(),
        usedBy: tokenData.storeEmail,
      });

      const locationDoc = await db.collection('locations').doc(tokenData.locationId).get();
      if (!locationDoc.exists) {
        return res.status(404).json({
          error: { code: 'store_not_found', message: 'Store not found', requestId: res.locals.requestId },
        });
      }

      const location = { id: locationDoc.id, ...locationDoc.data() } as Location;

      if (action === 'confirm') {
        await db.collection('locations').doc(tokenData.locationId).update({
          lastVerifiedAt: now.toISOString(),
          lastVerifiedBy: tokenData.storeEmail,
          updatedAt: now.toISOString(),
          updatedBy: tokenData.storeEmail,
        });

        if (tokenData.verificationRequestId) {
          await db.collection('verificationRequests').doc(tokenData.verificationRequestId).update({
            status: 'confirmed',
            respondedAt: now.toISOString(),
            respondedBy: tokenData.storeEmail,
            hoursConfirmed: true,
            updatedAt: now.toISOString(),
          });
        }

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

      await logAudit(db, {
        userId: tokenData.storeEmail,
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
        message: 'Please sign in to update your store information',
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

  return router;
}

function createSignInEmailHtml(storeNumber: string, storeName: string, signInUrl: string, expiresAt: Date): string {
  const expiresFormatted = expiresAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in to Shiekh Directory</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #DC2626; color: white; padding: 20px; text-align: center; }
    .content { padding: 30px 20px; background-color: #ffffff; }
    .button { display: inline-block; background-color: #DC2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #6B7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SHIEKH Store Directory</h1>
    </div>
    <div class="content">
      <h2>Sign in to Store ${storeNumber}</h2>
      <p>Hello,</p>
      <p>Click the button below to sign in to the Shiekh Store Directory for <strong>${storeNumber} - ${storeName}</strong>.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${signInUrl}" class="button">Sign In Now</a>
      </div>
      <p style="font-size: 14px; color: #6B7280;">This link expires on ${expiresFormatted}.</p>
      <p style="font-size: 14px; color: #6B7280;">If you didn't request this sign-in link, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Shiekh Shoes. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

function createSignInEmailText(storeNumber: string, storeName: string, signInUrl: string, expiresAt: Date): string {
  return `
SHIEKH Store Directory - Sign In

Hello,

Click the link below to sign in to the Shiekh Store Directory for ${storeNumber} - ${storeName}:

${signInUrl}

This link expires on ${expiresAt.toLocaleString()}.

If you didn't request this sign-in link, you can safely ignore this email.

---
Shiekh Shoes
`;
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

import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import type { UserRole } from '../../src/types';
import { createMailService } from '../services/mail';
import { isEmailDomainAllowed, getAllowedDomains } from '../config/auth';

export interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  invitedBy: string;
  invitedByEmail: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  acceptedAt?: string;
  revokedAt?: string;
  revokedBy?: string;
}

const INVITATION_EXPIRY_DAYS = 7;
const VALID_ROLES: UserRole[] = ['Admin', 'Steward', 'Leader', 'Viewer'];

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

export function createInvitationsRouter(db: Firestore): Router {
  const router = Router();

  router.use((_req: Request, res: Response, next) => {
    const authUser = res.locals.authUser;
    if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
      return res.status(403).json({
        error: {
          code: 'forbidden',
          message: 'Admin or Steward access required',
          requestId: res.locals.requestId,
        },
      });
    }
    next();
  });

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const snapshot = await db.collection('invitations')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

      const invitations = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.json({ invitations });
    } catch (error) {
      console.error('List invitations error:', error);
      res.status(500).json({
        error: {
          code: 'internal_error',
          message: 'Failed to list invitations',
          requestId: res.locals.requestId,
        },
      });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { email, role, personalMessage } = req.body;
      const authUser = res.locals.authUser;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          error: {
            code: 'invalid_request',
            message: 'Email is required',
            requestId: res.locals.requestId,
          },
        });
      }

      const normalizedEmail = email.toLowerCase().trim();

      if (!isEmailDomainAllowed(normalizedEmail)) {
        const allowedDomains = getAllowedDomains();
        return res.status(400).json({
          error: {
            code: 'invalid_domain',
            message: `Email domain is not allowed. Allowed domains: ${allowedDomains.join(', ')}`,
            requestId: res.locals.requestId,
          },
        });
      }

      if (!role || !VALID_ROLES.includes(role)) {
        return res.status(400).json({
          error: {
            code: 'invalid_role',
            message: `Role must be one of: ${VALID_ROLES.join(', ')}`,
            requestId: res.locals.requestId,
          },
        });
      }

      if (role === 'Admin' && authUser.role !== 'Admin') {
        return res.status(403).json({
          error: {
            code: 'forbidden',
            message: 'Only Admins can invite new Admins',
            requestId: res.locals.requestId,
          },
        });
      }

      const existingUser = await db.collection('users')
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();

      if (!existingUser.empty) {
        return res.status(409).json({
          error: {
            code: 'user_exists',
            message: 'A user with this email already exists',
            requestId: res.locals.requestId,
          },
        });
      }

      const pendingInvitation = await db.collection('invitations')
        .where('email', '==', normalizedEmail)
        .where('status', '==', 'pending')
        .limit(1)
        .get();

      if (!pendingInvitation.empty) {
        return res.status(409).json({
          error: {
            code: 'invitation_exists',
            message: 'A pending invitation already exists for this email',
            requestId: res.locals.requestId,
          },
        });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
      const invitationId = `inv_${randomBytes(12).toString('hex')}`;

      const invitation: Omit<Invitation, 'id'> = {
        email: normalizedEmail,
        role,
        invitedBy: authUser.uid,
        invitedByEmail: authUser.email,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        status: 'pending',
      };

      await db.collection('invitations').doc(invitationId).set(invitation);

      await db.collection('users').doc(`pre_${randomBytes(8).toString('hex')}`).set({
        email: normalizedEmail,
        displayName: normalizedEmail.split('@')[0],
        role,
        status: 'pending',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        updatedBy: authUser.uid,
        invitationId,
        version: 1,
      });

      const appUrl = getAppUrl(req);
      const signInUrl = `${appUrl}/signin`;

      const mailService = createMailService(db);
      const mailResult = await mailService.send({
        to: normalizedEmail,
        subject: `You're invited to Shiekh Directory`,
        html: createInvitationEmailHtml(authUser.displayName || authUser.email, role, signInUrl, expiresAt, personalMessage),
        text: createInvitationEmailText(authUser.displayName || authUser.email, role, signInUrl, expiresAt, personalMessage),
      });

      await db.collection('mailLog').add({
        to: normalizedEmail,
        type: 'invitation',
        invitationId,
        invitedBy: authUser.email,
        role,
        signInUrl,
        sentAt: now.toISOString(),
        success: mailResult.success,
        blocked: mailResult.blocked,
        reason: mailResult.reason || mailResult.error,
      });

      await db.collection('auditLog').add({
        timestamp: now.toISOString(),
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'invite-user',
        entityType: 'invitation',
        entityId: invitationId,
        entityName: `Invitation sent to ${normalizedEmail}`,
        changes: [
          { field: 'email', newValue: normalizedEmail },
          { field: 'role', newValue: role },
        ],
      });

      res.status(201).json({
        invitation: {
          id: invitationId,
          ...invitation,
        },
        emailSent: mailResult.success,
        emailBlocked: mailResult.blocked,
      });
    } catch (error) {
      console.error('Create invitation error:', error);
      res.status(500).json({
        error: {
          code: 'internal_error',
          message: 'Failed to create invitation',
          requestId: res.locals.requestId,
        },
      });
    }
  });

  router.post('/:id/resend', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser;

      const invDoc = await db.collection('invitations').doc(id).get();
      if (!invDoc.exists) {
        return res.status(404).json({
          error: {
            code: 'not_found',
            message: 'Invitation not found',
            requestId: res.locals.requestId,
          },
        });
      }

      const invitation = invDoc.data() as Invitation;

      if (invitation.status !== 'pending') {
        return res.status(409).json({
          error: {
            code: 'invalid_status',
            message: `Cannot resend ${invitation.status} invitation`,
            requestId: res.locals.requestId,
          },
        });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      await invDoc.ref.update({
        expiresAt: expiresAt.toISOString(),
      });

      const appUrl = getAppUrl(req);
      const signInUrl = `${appUrl}/signin`;

      const mailService = createMailService(db);
      const mailResult = await mailService.send({
        to: invitation.email,
        subject: `Reminder: You're invited to Shiekh Directory`,
        html: createInvitationEmailHtml(authUser.displayName || authUser.email, invitation.role, signInUrl, expiresAt),
        text: createInvitationEmailText(authUser.displayName || authUser.email, invitation.role, signInUrl, expiresAt),
      });

      await db.collection('mailLog').add({
        to: invitation.email,
        type: 'invitation-resend',
        invitationId: id,
        resentBy: authUser.email,
        sentAt: now.toISOString(),
        success: mailResult.success,
        blocked: mailResult.blocked,
        reason: mailResult.reason || mailResult.error,
      });

      res.json({
        success: true,
        emailSent: mailResult.success,
        emailBlocked: mailResult.blocked,
        newExpiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error('Resend invitation error:', error);
      res.status(500).json({
        error: {
          code: 'internal_error',
          message: 'Failed to resend invitation',
          requestId: res.locals.requestId,
        },
      });
    }
  });

  router.post('/:id/revoke', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser;

      const invDoc = await db.collection('invitations').doc(id).get();
      if (!invDoc.exists) {
        return res.status(404).json({
          error: {
            code: 'not_found',
            message: 'Invitation not found',
            requestId: res.locals.requestId,
          },
        });
      }

      const invitation = invDoc.data() as Invitation;

      if (invitation.status !== 'pending') {
        return res.status(409).json({
          error: {
            code: 'invalid_status',
            message: `Cannot revoke ${invitation.status} invitation`,
            requestId: res.locals.requestId,
          },
        });
      }

      const now = new Date().toISOString();

      await invDoc.ref.update({
        status: 'revoked',
        revokedAt: now,
        revokedBy: authUser.uid,
      });

      const preBootstrappedUser = await db.collection('users')
        .where('email', '==', invitation.email)
        .where('invitationId', '==', id)
        .limit(1)
        .get();

      if (!preBootstrappedUser.empty) {
        await preBootstrappedUser.docs[0].ref.delete();
      }

      await db.collection('auditLog').add({
        timestamp: now,
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'revoke-invitation',
        entityType: 'invitation',
        entityId: id,
        entityName: `Invitation revoked for ${invitation.email}`,
        changes: [
          { field: 'status', oldValue: 'pending', newValue: 'revoked' },
        ],
      });

      res.json({
        success: true,
        invitation: {
          ...invitation,
          id,
          status: 'revoked' as const,
          revokedAt: now,
          revokedBy: authUser.uid,
        },
      });
    } catch (error) {
      console.error('Revoke invitation error:', error);
      res.status(500).json({
        error: {
          code: 'internal_error',
          message: 'Failed to revoke invitation',
          requestId: res.locals.requestId,
        },
      });
    }
  });

  return router;
}

function createInvitationEmailHtml(
  inviterName: string,
  role: UserRole,
  signInUrl: string,
  expiresAt: Date,
  personalMessage?: string
): string {
  const expiresFormatted = expiresAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const roleDescriptions: Record<UserRole, string> = {
    Admin: 'full administrative access to manage users, settings, and all store data',
    Steward: 'steward access to manage verification requests and store data',
    Leader: 'leader access to view and manage stores in your assigned district',
    Viewer: 'view-only access to the store directory',
    Store: 'store access to manage your store\'s information',
  };

  const personalMessageHtml = personalMessage 
    ? `<div style="background-color: #f3f4f6; border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 20px 0; border-radius: 0 4px 4px 0;">
        <p style="margin: 0; font-style: italic; color: #4b5563;">"${personalMessage}"</p>
        <p style="margin: 8px 0 0; font-size: 14px; color: #6b7280;">— ${inviterName}</p>
      </div>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>You're Invited to Shiekh Directory</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1d4ed8; color: white; padding: 24px; text-align: center; }
    .content { padding: 30px 20px; background-color: #ffffff; }
    .button { display: inline-block; background-color: #1d4ed8; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #6B7280; }
    .role-badge { display: inline-block; background-color: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 12px; font-size: 14px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SHIEKH Store Directory</h1>
    </div>
    <div class="content">
      <h2>You're Invited!</h2>
      <p>${inviterName} has invited you to join the Shiekh Store Directory as a <span class="role-badge">${role}</span>.</p>
      
      ${personalMessageHtml}
      
      <p>As a ${role}, you'll have ${roleDescriptions[role]}.</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${signInUrl}" class="button">Accept Invitation</a>
      </div>
      
      <p style="font-size: 14px; color: #6B7280;">
        Click the button above to sign in with your company Google account. 
        Your account will be automatically set up with the appropriate permissions.
      </p>
      
      <p style="font-size: 14px; color: #6B7280;">
        This invitation expires on ${expiresFormatted}.
      </p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Shiekh Shoes. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

function createInvitationEmailText(
  inviterName: string,
  role: UserRole,
  signInUrl: string,
  expiresAt: Date,
  personalMessage?: string
): string {
  const personalMessageText = personalMessage 
    ? `\n"${personalMessage}"\n— ${inviterName}\n`
    : '';

  return `
SHIEKH Store Directory - You're Invited!

${inviterName} has invited you to join the Shiekh Store Directory as a ${role}.
${personalMessageText}

To accept this invitation, click the link below and sign in with your company Google account:

${signInUrl}

Your account will be automatically set up with the appropriate permissions.

This invitation expires on ${expiresAt.toLocaleDateString()}.

---
Shiekh Shoes
`;
}

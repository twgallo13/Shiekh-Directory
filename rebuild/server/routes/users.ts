import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { User, AuthUser, Assignment, UserRole } from '../../src/types';
import { isEmailDomainAllowed, isGoogleSignInDomainAllowed, isRegisteredUserStatus, isAdminEmail, getEmailDomain, getAllowedDomains, isSignInRestricted, isEmailOnAllowList, getSignInRestriction, type SignInRestriction } from '../config/auth';
import { emulatorAuthFault } from '../middleware/auth';
import { isAssignmentActive, getLocalDate } from '../utils/assignment';

function formatSignInRestrictedResponse(
  restriction: SignInRestriction,
  requestId: string
): { status: 403; body: { error: { code: string; message: string; requestId: string } } } {
  const restrictedUntilFormatted = restriction.restrictedUntil
    ? new Date(restriction.restrictedUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'until further notice';
  return {
    status: 403,
    body: {
      error: {
        code: 'signin_restricted',
        message: `Sign-in is currently restricted to approved users. This restriction is in effect ${restrictedUntilFormatted}. Please contact your administrator if you need access.`,
        requestId,
      },
    },
  };
}

export function createUsersRouter(db: Firestore): Router {
  const router = Router();

  router.get('/me', async (_req: Request, res: Response) => {
    try {
      const firebaseUser = res.locals.user;
      if (!firebaseUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const email = firebaseUser.email;
      if (!email) {
        return res.status(400).json({
          error: { code: 'no_email', message: 'User has no email address', requestId: res.locals.requestId },
        });
      }

      const provider: string | undefined = firebaseUser.firebase?.sign_in_provider;
      const isGoogleUser = provider === 'google.com';
      // D1 (2026-11-04): email/password and email-link users can also be linked
      const isPasswordUser = provider === 'password' || provider === 'emailLink';
      const normalizedEmail = String(email).trim().toLowerCase();

      let userDoc = await db.collection('users').doc(firebaseUser.uid).get();

      // r31/D4: approved-list mode
      const restricted = await isSignInRestricted(db);
      const onAllowList = await isEmailOnAllowList(db, normalizedEmail);

      // email_verified applies only when creating or linking a NEW record.
      // Password and email-link accounts that already have users/{uid} pass
      // regardless of domain (including @shiekhshoes.com and @shiekh.test).
      // Google sign-ins are checked again below even when the record exists.
      if (!userDoc.exists && (isGoogleUser || isPasswordUser)) {
        if (isGoogleUser && !isGoogleSignInDomainAllowed(normalizedEmail)) {
          const domain = getEmailDomain(normalizedEmail);
          return res.status(403).json({
            error: {
              code: 'domain_not_allowed',
              message: `Sign-in with Google is restricted to @shiekhshoes.org. Your domain (${domain}) is not allowed.`,
              requestId: res.locals.requestId,
            },
          });
        }
        // Password / email-link: company domain, or an Admin-approved address
        // (including @shiekhshoes.com). Existing records never reach this branch.
        const passwordNeedsDomain = isPasswordUser && !onAllowList;
        if (passwordNeedsDomain && !isEmailDomainAllowed(normalizedEmail)) {
          const allowedDomains = getAllowedDomains();
          const domain = getEmailDomain(normalizedEmail);
          return res.status(403).json({
            error: {
              code: 'domain_not_allowed',
              message: `Sign-in is restricted to company accounts. Your domain (${domain}) is not in the allowed list: ${allowedDomains.join(', ')}`,
              requestId: res.locals.requestId,
            },
          });
        }

        const emailVerified = firebaseUser.email_verified === true;
        const existingByEmail = await db.collection('users')
          .where('email', '==', normalizedEmail)
          .limit(2)
          .get();
        const candidates = existingByEmail.docs.filter(d => d.id !== firebaseUser.uid);

        if (candidates.length > 1) {
          console.error(`[me] ambiguous: ${candidates.length} user records share email ${normalizedEmail}; not linking`);
          return res.status(409).json({
            error: { code: 'ambiguous_account', message: 'More than one account uses this email. Please contact an Admin.', requestId: res.locals.requestId },
          });
        }

        if (candidates.length === 1) {
          // Google must have email_verified === true before a link. Password users
          // still link with a verified email or an approved-list entry.
          if (isGoogleUser && !emailVerified) {
            console.warn(`[me] not linking ${normalizedEmail}: Google email is not verified`);
            return res.status(403).json({
              error: { code: 'email_not_verified', message: 'Your email address has not been verified, so your account could not be linked. Please contact an Admin.', requestId: res.locals.requestId },
            });
          }
          if (!isGoogleUser && !emailVerified && !onAllowList) {
            console.warn(`[me] not linking ${normalizedEmail}: email not verified and not on approved list`);
            return res.status(403).json({
              error: { code: 'email_not_verified', message: 'Your email address has not been verified, so your account could not be linked. Please contact an Admin.', requestId: res.locals.requestId },
            });
          }
          const linked = await linkPreProvisionedUser(db, candidates[0].id, firebaseUser.uid, normalizedEmail, provider || 'unknown');
          if (!linked) {
            return res.status(409).json({
              error: { code: 'link_conflict', message: 'Your account could not be linked. Please retry or contact an Admin.', requestId: res.locals.requestId },
            });
          }
          userDoc = await db.collection('users').doc(firebaseUser.uid).get();
        } else if (isGoogleUser) {
          if (!emailVerified) {
            console.warn(`[me] not creating ${normalizedEmail}: Google email is not verified`);
            return res.status(403).json({
              error: { code: 'email_not_verified', message: 'Your email address has not been verified, so an account was not created. Please contact an Admin.', requestId: res.locals.requestId },
            });
          }
          let role: UserRole | null = null;
          if (isAdminEmail(normalizedEmail)) {
            role = 'Admin';
          } else if (restricted && onAllowList) {
            role = 'Viewer';
          } else if (!restricted) {
            role = 'Viewer';
          }
          if (role === null) {
            const restriction = await getSignInRestriction(db);
            const { status, body } = formatSignInRestrictedResponse(restriction, res.locals.requestId);
            return res.status(status).json(body);
          }
          const now = new Date().toISOString();
          const newUser: User = {
            id: firebaseUser.uid,
            email: normalizedEmail,
            displayName: firebaseUser.name || normalizedEmail.split('@')[0],
            role,
            status: 'active',
            createdAt: now,
            updatedAt: now,
            updatedBy: 'auto-provision',
            version: 1,
          };
          await db.collection('users').doc(firebaseUser.uid).set(newUser);
          console.log(`Auto-provisioned Google user: ${normalizedEmail} as ${role}`);
          userDoc = await db.collection('users').doc(firebaseUser.uid).get();
        }
      }

      if (!userDoc.exists) {
        if (restricted && !onAllowList) {
          const restriction = await getSignInRestriction(db);
          const { status, body } = formatSignInRestrictedResponse(restriction, res.locals.requestId);
          return res.status(status).json(body);
        }
        return res.status(404).json({
          error: { code: 'user_not_found', message: "Your account isn't set up yet. Please contact an Admin.", requestId: res.locals.requestId },
        });
      }

      const userData = userDoc.data() as User;
      // Record-holder Google domain check. Password and email-link records
      // pass here regardless of domain. A Google sign-in must still be exactly
      // @shiekhshoes.org, even when users/{uid} already exists.
      if (isGoogleUser && !isGoogleSignInDomainAllowed(normalizedEmail)) {
        const domain = getEmailDomain(normalizedEmail);
        return res.status(403).json({
          error: {
            code: 'domain_not_allowed',
            message: `Sign-in with Google is restricted to @shiekhshoes.org. Your domain (${domain}) is not allowed.`,
            requestId: res.locals.requestId,
          },
        });
      }
      if (!isRegisteredUserStatus(userData.status)) {
        console.warn(`[me] blocked uid=${firebaseUser.uid} status=${JSON.stringify(userData.status)}`);
        return res.status(403).json({
          error: { code: 'account_disabled', message: 'This account is disabled.', requestId: res.locals.requestId },
        });
      }
      
      const authUser: AuthUser = {
        uid: firebaseUser.uid,
        email: userData.email,
        displayName: userData.displayName,
        role: userData.role,
        storeLocationId: userData.storeLocationId,
      };

      if (userData.role === 'Leader') {
        try {
          authUser.leaderScope = await computeLeaderScope(db, firebaseUser.uid);
        } catch (error) {
          console.error('[me] leader scope lookup failed', error);
          return res.status(403).json({
            error: {
              code: 'user_lookup_failed',
              message: 'Could not verify your account. Please try again.',
              requestId: res.locals.requestId,
            },
          });
        }
      }

      return res.json({ data: authUser });
    } catch (error) {
      console.error('Get user error:', error);
      return res.status(500).json({
        error: { code: 'get_error', message: 'Failed to get user', requestId: res.locals.requestId },
      });
    }
  });

  return router;
}

/**
 * D1: Link an Admin-added (pre-provisioned) users record to a signed-in Firebase UID.
 * Runs in a transaction. Keeps all of the old record's data (role, name, store, person link),
 * writes it under the UID, and moves the placeholder to usersArchive (not lost) before
 * removing it from users so there is never a duplicate active record.
 */
export async function linkPreProvisionedUser(
  db: Firestore,
  oldId: string,
  uid: string,
  email: string,
  provider: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const oldRef = db.collection('users').doc(oldId);
  const newRef = db.collection('users').doc(uid);
  const archiveRef = db.collection('usersArchive').doc(oldId);
  const ok = await db.runTransaction(async (tx) => {
    const [oldSnap, newSnap] = await Promise.all([tx.get(oldRef), tx.get(newRef)]);
    if (newSnap.exists) return true; // already linked by a concurrent request
    if (!oldSnap.exists) return false;
    const old = oldSnap.data() as User & Record<string, unknown>;
    if (String(old.email || '').trim().toLowerCase() !== email) return false; // exact match only
    tx.set(newRef, {
      ...old,
      id: uid,
      email,
      linkedFromUserId: oldId,
      linkedAt: now,
      linkedVia: provider,
      updatedAt: now,
      updatedBy: 'pre-provisioned-link',
      version: (typeof old.version === 'number' ? old.version : 0) + 1,
    });
    tx.set(archiveRef, { ...old, archivedAt: now, archivedReason: 'linked-to-auth-uid', linkedToUid: uid });
    tx.delete(oldRef);
    return true;
  });
  if (ok) {
    console.log(`[me] linked pre-provisioned user ${oldId} -> ${uid} (${email}, ${provider})`);
    await db.collection('auditLog').add({
      timestamp: now,
      userId: uid,
      userEmail: email,
      action: 'update',
      entityType: 'user',
      entityId: uid,
      entityName: email,
      changes: [{ field: 'linkedFromUserId', newValue: oldId }, { field: 'linkedVia', newValue: provider }],
    }).catch((e) => console.error('[me] audit write failed', e));
  }
  return ok;
}

async function computeLeaderScope(
  db: Firestore,
  userId: string
): Promise<AuthUser['leaderScope']> {
  if (emulatorAuthFault(userId) === 'leader_scope') {
    throw new Error('forced leader scope failure');
  }
  const personDoc = await db.collection('people')
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (personDoc.empty) {
    const assignments = await db.collection('assignments')
      .where('personId', '==', userId)
      .get();
    
    if (assignments.empty) {
      return { districtIds: [], regionIds: [], locationIds: [] };
    }
  }

  const personId = personDoc.empty ? userId : personDoc.docs[0].id;

  const assignmentsSnap = await db.collection('assignments')
    .where('personId', '==', personId)
    .where('role', 'in', ['DM', 'RM'])
    .get();

  const districtIds: string[] = [];
  const regionIds: string[] = [];

  const localDate = getLocalDate();
  for (const doc of assignmentsSnap.docs) {
    const assignment = doc.data() as Assignment;
    if (!isAssignmentActive(assignment, localDate)) continue;

    if (assignment.role === 'DM' && assignment.scopeType === 'district') {
      districtIds.push(assignment.scopeId);
    } else if (assignment.role === 'RM' && assignment.scopeType === 'region') {
      regionIds.push(assignment.scopeId);
    }
  }

  if (regionIds.length > 0) {
    const districtsInRegions = await db.collection('districts')
      .where('regionId', 'in', regionIds)
      .where('lifecycle', '==', 'active')
      .get();
    
    for (const doc of districtsInRegions.docs) {
      if (!districtIds.includes(doc.id)) {
        districtIds.push(doc.id);
      }
    }
  }

  const locationIds: string[] = [];
  
  if (districtIds.length > 0) {
    const batchSize = 10;
    for (let i = 0; i < districtIds.length; i += batchSize) {
      const batch = districtIds.slice(i, i + batchSize);
      const locationsSnap = await db.collection('locations')
        .where('districtId', 'in', batch)
        .where('lifecycle', '==', 'active')
        .get();
      
      for (const doc of locationsSnap.docs) {
        locationIds.push(doc.id);
      }
    }
  }

  return { districtIds, regionIds, locationIds };
}

import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { User, AuthUser, Assignment, UserRole } from '../../src/types';
import { isEmailDomainAllowed, isAdminEmail, getEmailDomain, getAllowedDomains, isSignInRestricted, isEmailOnAllowList, getSignInRestriction, type SignInRestriction } from '../config/auth';
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

      // Domain rule: Google always; password users only when they would be linked/created
      // (existing password accounts with their own record, e.g. QA test accounts, keep working).
      // Email-link/password users outside the company domain (e.g. @shiekhshoes.com) are allowed
      // only when an Admin explicitly put them on the approved list.
      const passwordNeedsDomain = isPasswordUser && !userDoc.exists && !(await isEmailOnAllowList(db, normalizedEmail));
      if ((isGoogleUser || passwordNeedsDomain) && !isEmailDomainAllowed(normalizedEmail)) {
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

      // r31/D4: approved-list mode
      const restricted = await isSignInRestricted(db);
      const onAllowList = await isEmailOnAllowList(db, normalizedEmail);

      if (!userDoc.exists && (isGoogleUser || isPasswordUser)) {
        const emailVerified = isGoogleUser || firebaseUser.email_verified === true;
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
          // Admin-added record exists. Password users need a verified email or an approved-list entry.
          if (!emailVerified && !onAllowList) {
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
      
      const authUser: AuthUser = {
        uid: firebaseUser.uid,
        email: userData.email,
        displayName: userData.displayName,
        role: userData.role,
        storeLocationId: userData.storeLocationId,
      };

      if (userData.role === 'Leader') {
        authUser.leaderScope = await computeLeaderScope(db, firebaseUser.uid);
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

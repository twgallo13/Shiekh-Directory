import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { User, AuthUser, Assignment, UserRole } from '../../src/types';
import { isEmailDomainAllowed, isAdminEmail, getEmailDomain, getAllowedDomains, isSignInRestricted, isEmailOnAllowList, getSignInRestriction } from '../config/auth';
import { isAssignmentActive, getLocalDate } from '../utils/assignment';

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

      const isGoogleUser = firebaseUser.firebase?.sign_in_provider === 'google.com';
      
      if (isGoogleUser && !isEmailDomainAllowed(email)) {
        const allowedDomains = getAllowedDomains();
        const domain = getEmailDomain(email);
        return res.status(403).json({
          error: {
            code: 'domain_not_allowed',
            message: `Sign-in is restricted to company accounts. Your domain (${domain}) is not in the allowed list: ${allowedDomains.join(', ')}`,
            requestId: res.locals.requestId,
          },
        });
      }

      // r31: Check if sign-in is restricted to allow-list only (soft-launch mode)
      const restricted = await isSignInRestricted(db);
      const onAllowList = restricted ? await isEmailOnAllowList(db, email) : true;
      
      let userDoc = await db.collection('users').doc(firebaseUser.uid).get();
      
      if (!userDoc.exists && isGoogleUser) {
        // r32 fix #2: Check for pre-provisioned user FIRST (before restriction check)
        // Pre-provisioned users who have never signed in must be allowed
        const existingByEmail = await db.collection('users')
          .where('email', '==', email.toLowerCase())
          .limit(1)
          .get();
        
        // Determine role based on: pre-provisioned > admin email > allow-list > unrestricted
        let role: UserRole | null = null;
        let migratedFromPreProvisioned = false;
        
        if (!existingByEmail.empty) {
          // Pre-provisioned user - always allow, use their assigned role
          const existingUserData = existingByEmail.docs[0].data() as User;
          role = existingUserData.role;
          migratedFromPreProvisioned = true;
          
          await existingByEmail.docs[0].ref.delete();
          console.log(`Migrated pre-bootstrapped user record for: ${email}`);
        } else if (isAdminEmail(email)) {
          // ADMIN_EMAILS user - always Admin
          role = 'Admin';
        } else if (restricted && onAllowList) {
          // r32 fix #1: Allow-listed new user during restriction gets Viewer
          role = 'Viewer';
        } else if (!restricted) {
          // Not restricted - auto-provision as Viewer
          role = 'Viewer';
        }
        // else: restricted, not on allow-list, not pre-provisioned, not admin -> role stays null
        
        // r31: If no role determined, reject
        if (role === null) {
          const restriction = await getSignInRestriction(db);
          const restrictedUntilFormatted = restriction.restrictedUntil 
            ? new Date(restriction.restrictedUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : 'until further notice';
          return res.status(403).json({
            error: {
              code: 'signin_restricted',
              message: `Sign-in is currently restricted to approved users. This restriction is in effect ${restrictedUntilFormatted}. Please contact your administrator if you need access.`,
              requestId: res.locals.requestId,
            },
          });
        }
        
        const displayName = firebaseUser.name || email.split('@')[0];
        
        const newUser: User = {
          id: firebaseUser.uid,
          email,
          displayName,
          role,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: migratedFromPreProvisioned ? 'pre-provisioned-migration' : 'auto-provision',
          version: 1,
        };
        
        await db.collection('users').doc(firebaseUser.uid).set(newUser);
        console.log(`Auto-provisioned Google user: ${email} as ${role}${migratedFromPreProvisioned ? ' (migrated from pre-provisioned)' : ''}`);
        
        userDoc = await db.collection('users').doc(firebaseUser.uid).get();
      }
      
      if (!userDoc.exists) {
        // User not found and not a Google user (or some other edge case)
        // During restriction, non-allowed users get a specific message
        if (restricted && !onAllowList) {
          const restriction = await getSignInRestriction(db);
          const restrictedUntilFormatted = restriction.restrictedUntil 
            ? new Date(restriction.restrictedUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : 'until further notice';
          return res.status(403).json({
            error: {
              code: 'signin_restricted',
              message: `Sign-in is currently restricted to approved users. This restriction is in effect ${restrictedUntilFormatted}. Please contact your administrator if you need access.`,
              requestId: res.locals.requestId,
            },
          });
        }
        return res.status(404).json({
          error: { code: 'user_not_found', message: 'User profile not found', requestId: res.locals.requestId },
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

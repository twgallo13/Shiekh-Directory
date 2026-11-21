import { type Request, type Response, type NextFunction, Router } from 'express';
import { randomUUID } from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { getAuthClient } from '../firebase';
import { hashSessionId } from '../services/tokenAuth';
import { isGoogleSignInDomainAllowed, isRegisteredUserStatus } from '../config/auth';
import type { User, AuthUser, Assignment } from '../../src/types';

export type RegistrationState = 'registered' | 'no_record' | 'bad_status' | 'lookup_error';

/**
 * Emulator-only fault injection so tests can force the lookup catch.
 * Production never sets FIREBASE_AUTH_EMULATOR_HOST. A match fails closed
 * (403 user_lookup_failed) and does not grant access.
 */
function emulatorAuthFault(uid: string): 'lookup' | 'leader_scope' | null {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) return null;
  if (uid.startsWith('fault-lookup-')) return 'lookup';
  if (uid.startsWith('fault-leader-scope-')) return 'leader_scope';
  return null;
}

interface StoreSession {
  locationId: string;
  storeNumber: string;
  email: string;
  role: 'Store';
  expiresAt: string;
  revoked: boolean;
}

export function createAuthMiddleware(db?: Firestore): Router {
  const router = Router();
  
  router.use(async (req: Request, res: Response, next: NextFunction) => {
    res.locals.requestId = randomUUID();
    res.setHeader('X-Request-ID', res.locals.requestId);
    
    const sessionId = req.cookies?.__session || 
      (req.headers.authorization?.startsWith('StoreSession ') 
        ? req.headers.authorization.slice(13) 
        : null);

    if (sessionId && db) {
      try {
        const sessionHash = hashSessionId(sessionId);
        const sessionDoc = await db.collection('storeSessions').doc(sessionHash).get();

        if (sessionDoc.exists) {
          const session = sessionDoc.data() as StoreSession;

          if (!session.revoked && new Date(session.expiresAt) > new Date()) {
            res.locals.user = {
              uid: `store_${session.locationId}`,
              email: session.email,
              isStoreSession: true,
            };
            res.locals.storeSession = session;
            return next();
          }
        }
      } catch (error) {
        console.error('Store session validation error:', error);
      }
    }
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'unauthorized',
          message: 'Authentication required',
          requestId: res.locals.requestId,
        },
      });
    }
    
    const token = authHeader.slice(7);
    
    try {
      const isEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
      
      if (isEmulator && token.startsWith('test-token-')) {
        // Extended format: test-token-{uid}:{email}:{provider}
        // Examples:
        //   test-token-admin                          → uid=admin, email=test@example.com
        //   test-token-newuser:new@shiekhshoes.org    → uid=newuser, email=new@shiekhshoes.org
        //   test-token-guser:g@shiekhshoes.org:google → uid=guser, email=g@..., google.com provider
        const tokenValue = token.slice(11); // Remove 'test-token-'
        const parts = tokenValue.split(':');
        const uid = parts[0];
        const email = parts[1] || 'test@example.com';
        const provider = parts[2]; // 'google' → google.com, undefined → no provider
        
        res.locals.user = {
          uid,
          email,
          name: email.split('@')[0],
          ...(provider === 'google' && { firebase: { sign_in_provider: 'google.com' }, email_verified: parts[3] !== 'unverified' }),
          ...(provider === 'password' && { firebase: { sign_in_provider: 'password' }, email_verified: parts[3] === 'verified' }),
        };
        return next();
      }
      
      const auth = getAuthClient();
      const decodedToken = await auth.verifyIdToken(token);
      res.locals.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        email_verified: decodedToken.email_verified === true,
        firebase: decodedToken.firebase,
      };
      next();
    } catch (error) {
      console.error('Auth error:', error);
      return res.status(401).json({
        error: {
          code: 'invalid_token',
          message: 'Invalid or expired authentication token',
          requestId: res.locals.requestId,
        },
      });
    }
  });
  
  return router;
}

export function createOptionalAuthMiddleware(db?: Firestore): Router {
  const router = Router();
  
  router.use(async (req: Request, res: Response, next: NextFunction) => {
    res.locals.requestId = res.locals.requestId || randomUUID();
    if (!res.getHeader('X-Request-ID')) {
      res.setHeader('X-Request-ID', res.locals.requestId);
    }
    
    const sessionId = req.cookies?.__session || 
      (req.headers.authorization?.startsWith('StoreSession ') 
        ? req.headers.authorization.slice(13) 
        : null);

    if (sessionId && db) {
      try {
        const sessionHash = hashSessionId(sessionId);
        const sessionDoc = await db.collection('storeSessions').doc(sessionHash).get();

        if (sessionDoc.exists) {
          const session = sessionDoc.data() as StoreSession;

          if (!session.revoked && new Date(session.expiresAt) > new Date()) {
            res.locals.user = {
              uid: `store_${session.locationId}`,
              email: session.email,
              isStoreSession: true,
            };
            res.locals.storeSession = session;
            return next();
          }
        }
      } catch (error) {
        console.error('Store session validation error:', error);
      }
    }
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    
    const token = authHeader.slice(7);
    
    try {
      const isEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
      
      if (isEmulator && token.startsWith('test-token-')) {
        // Extended format: test-token-{uid}:{email}:{provider}
        const tokenValue = token.slice(11);
        const parts = tokenValue.split(':');
        const uid = parts[0];
        const email = parts[1] || 'test@example.com';
        const provider = parts[2];
        
        res.locals.user = {
          uid,
          email,
          name: email.split('@')[0],
          ...(provider === 'google' && { firebase: { sign_in_provider: 'google.com' }, email_verified: parts[3] !== 'unverified' }),
          ...(provider === 'password' && { firebase: { sign_in_provider: 'password' }, email_verified: parts[3] === 'verified' }),
        };
        return next();
      }
      
      const auth = getAuthClient();
      const decodedToken = await auth.verifyIdToken(token);
      res.locals.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        email_verified: decodedToken.email_verified === true,
        firebase: decodedToken.firebase,
      };
      next();
    } catch {
      next();
    }
  });
  
  return router;
}

export function createAuthUserMiddleware(db: Firestore): Router {
  const router = Router();
  
  router.use(async (_req: Request, res: Response, next: NextFunction) => {
    const firebaseUser = res.locals.user;
    if (!firebaseUser) {
      return next();
    }
    
    // Store sessions are server sessions (storeSessions, via the __session cookie
    // or a StoreSession header), not Firebase Auth users. Do not read users/{uid}.
    // A store is cut off by revoking its store session.
    if (res.locals.storeSession) {
      const session = res.locals.storeSession as StoreSession;
      res.locals.authUser = {
        uid: firebaseUser.uid,
        email: session.email,
        displayName: `Store ${session.storeNumber}`,
        role: 'Store',
        storeLocationId: session.locationId,
        isStoreSession: true,
      } as AuthUser;
      return next();
    }
    
    // No user-lookup cache: every request reads users/{uid} from Firestore.
    try {
      if (emulatorAuthFault(firebaseUser.uid) === 'lookup') {
        throw new Error('forced user lookup failure');
      }
      const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
      
      if (!userDoc.exists) {
        res.locals.authState = 'no_record' satisfies RegistrationState;
        return next();
      }
      
      const userData = userDoc.data() as User;
      if (!isRegisteredUserStatus(userData.status)) {
        console.warn(`[auth] blocked uid=${firebaseUser.uid} status=${JSON.stringify(userData.status)}`);
        res.locals.authState = 'bad_status' satisfies RegistrationState;
        return next();
      }
      
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
      
      res.locals.authUser = authUser;
      res.locals.authState = 'registered' satisfies RegistrationState;
      next();
    } catch (error) {
      console.error('Error loading user data:', error);
      res.locals.authState = 'lookup_error' satisfies RegistrationState;
      next();
    }
  });
  
  return router;
}

function isValidStoreSession(res: Response): boolean {
  const session = res.locals.storeSession as StoreSession | undefined;
  const authUser = res.locals.authUser as (AuthUser & { isStoreSession?: boolean }) | undefined;
  if (!session || authUser?.isStoreSession !== true) return false;
  if (session.revoked) return false;
  if (!session.expiresAt || new Date(session.expiresAt) <= new Date()) return false;
  return true;
}

/**
 * Fail closed unless the caller is a valid store session or a registered user.
 * Mounted on /api/app immediately after createAuthUserMiddleware.
 * GET /users/me (exact path, exact method) is the only exemption.
 */
export function requireRegisteredUser(): Router {
  const router = Router();

  router.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && req.path === '/users/me') {
      return next();
    }

    if (isValidStoreSession(res)) {
      return next();
    }

    const state = res.locals.authState as RegistrationState | undefined;
    if (state === 'registered') {
      return next();
    }

    const requestId = res.locals.requestId;
    if (state === 'bad_status') {
      return res.status(403).json({
        error: { code: 'account_disabled', message: 'This account is disabled.', requestId },
      });
    }
    if (state === 'lookup_error') {
      return res.status(403).json({
        error: { code: 'user_lookup_failed', message: 'Could not verify your account. Please try again.', requestId },
      });
    }

    const firebaseUser = res.locals.user as { email?: string; firebase?: { sign_in_provider?: string } } | undefined;
    const provider = firebaseUser?.firebase?.sign_in_provider;
    const email = String(firebaseUser?.email || '');
    if ((state === 'no_record' || state === undefined) && provider === 'google.com' && !isGoogleSignInDomainAllowed(email)) {
      const domain = email.trim().toLowerCase().split('@')[1] || '(none)';
      return res.status(403).json({
        error: {
          code: 'domain_not_allowed',
          message: `Sign-in with Google is restricted to @shiekhshoes.org. Your domain (${domain}) is not allowed.`,
          requestId,
        },
      });
    }

    return res.status(403).json({
      error: {
        code: 'not_registered',
        message: "Your account isn't registered. Please contact an Admin.",
        requestId,
      },
    });
  });

  return router;
}

export function requireStoreAccess(locationIdParam: string = 'id'): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    if (!authUser) {
      return res.status(401).json({
        error: { code: 'unauthorized', message: 'Authentication required', requestId: res.locals.requestId },
      });
    }

    if (authUser.role === 'Admin' || authUser.role === 'Steward') {
      return next();
    }

    const locationId = req.params[locationIdParam] || req.body?.locationId;

    if (authUser.role === 'Store') {
      if (authUser.storeLocationId === locationId) {
        return next();
      }
      return res.status(403).json({
        error: { code: 'forbidden', message: 'You can only access your own store', requestId: res.locals.requestId },
      });
    }

    if (authUser.role === 'Leader' && authUser.leaderScope?.locationIds?.includes(locationId)) {
      return next();
    }

    return res.status(403).json({
      error: { code: 'forbidden', message: 'Access denied to this location', requestId: res.locals.requestId },
    });
  };
}

async function computeLeaderScope(
  db: Firestore,
  userId: string
): Promise<AuthUser['leaderScope']> {
  if (emulatorAuthFault(userId) === 'leader_scope') {
    throw new Error('forced leader scope failure');
  }
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    return { districtIds: [], regionIds: [], locationIds: [] };
  }
  
  const userData = userDoc.data() as User;
  const personId = userData.personId || userId;
  
  const assignmentsSnap = await db.collection('assignments')
    .where('personId', '==', personId)
    .get();
  
  const districtIds: string[] = [];
  const regionIds: string[] = [];
  
  for (const doc of assignmentsSnap.docs) {
    const assignment = doc.data() as Assignment;
    const isActive = !assignment.endDate || assignment.endDate >= new Date().toISOString().slice(0, 10);
    if (!isActive) continue;
    
    if (assignment.role === 'DM' && assignment.scopeType === 'district') {
      districtIds.push(assignment.scopeId);
    } else if (assignment.role === 'RM' && assignment.scopeType === 'region') {
      regionIds.push(assignment.scopeId);
    }
  }
  
  if (regionIds.length > 0) {
    const districtsSnap = await db.collection('districts')
      .where('regionId', 'in', regionIds.slice(0, 10))
      .where('lifecycle', '==', 'active')
      .get();
    
    for (const doc of districtsSnap.docs) {
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

import { type Request, type Response, type NextFunction, Router } from 'express';
import { randomUUID, createHmac } from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { getAuthClient } from '../firebase';
import type { User, AuthUser, Assignment } from '../../src/types';

const SESSION_SECRET = process.env.STORE_SESSION_SECRET || 'dev-session-secret-not-for-production';

function hashSessionId(sessionId: string): string {
  return createHmac('sha256', SESSION_SECRET).update(sessionId).digest('hex');
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
    
    const sessionId = req.cookies?.store_session || 
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
        res.locals.user = {
          uid: token.replace('test-token-', ''),
          email: 'test@example.com',
        };
        return next();
      }
      
      const auth = getAuthClient();
      const decodedToken = await auth.verifyIdToken(token);
      res.locals.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
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
    
    const sessionId = req.cookies?.store_session || 
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
        res.locals.user = {
          uid: token.replace('test-token-', ''),
          email: 'test@example.com',
        };
        return next();
      }
      
      const auth = getAuthClient();
      const decodedToken = await auth.verifyIdToken(token);
      res.locals.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
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
    
    try {
      const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
      
      if (!userDoc.exists) {
        res.locals.authUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.email?.split('@')[0] || 'Unknown',
          role: 'Viewer',
        } as AuthUser;
        return next();
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
      
      res.locals.authUser = authUser;
      next();
    } catch (error) {
      console.error('Error loading user data:', error);
      res.locals.authUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: 'Unknown',
        role: 'Viewer',
      } as AuthUser;
      next();
    }
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

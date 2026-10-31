import { type Request, type Response, type NextFunction, Router } from 'express';
import { randomUUID, createHash, createHmac, timingSafeEqual, randomBytes } from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';

export type LegacyApiScope =
  | 'locations:read'
  | 'personnel:read'
  | 'staffing:read'
  | 'district-leadership:read'
  | 'district-leadership:contacts:read';

export interface ApiCredential {
  clientId: string;
  tokenVersionId: string;
  scopes: LegacyApiScope[];
  cursorSigningKey: string;
  grantsVersion?: number;
}

export interface ApiClientDocument {
  id: string;
  name: string;
  tokenHash: string;
  scopes: LegacyApiScope[];
  active: boolean;
  version: number;
  createdAt: string;
  lastUsedAt?: string;
  // Rate limiting: requests per minute (default: 60, 0 = unlimited)
  rateLimit?: number;
}

const DEFAULT_RATE_LIMIT = 60; // requests per minute
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

// Firestore-based rate limiting helper
async function checkRateLimit(
  db: Firestore,
  clientId: string,
  rateLimit: number
): Promise<{ allowed: boolean; count: number; windowStart: number; remaining: number }> {
  const now = Date.now();
  const windowStart = now - (now % RATE_LIMIT_WINDOW_MS); // Round down to window boundary
  const windowId = `${clientId}_${windowStart}`;
  
  const counterRef = db.collection('rateLimitCounters').doc(windowId);
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(counterRef);
      
      if (!doc.exists) {
        // First request in this window
        transaction.set(counterRef, {
          clientId,
          windowStart,
          count: 1,
          expiresAt: new Date(windowStart + RATE_LIMIT_WINDOW_MS * 2).toISOString(),
        });
        return { count: 1, windowStart };
      }
      
      const data = doc.data()!;
      const newCount = (data.count || 0) + 1;
      transaction.update(counterRef, { count: newCount });
      return { count: newCount, windowStart: data.windowStart };
    });
    
    const remaining = Math.max(0, rateLimit - result.count);
    return {
      allowed: result.count <= rateLimit,
      count: result.count,
      windowStart: result.windowStart,
      remaining,
    };
  } catch (error) {
    // On Firestore error, allow the request but don't count it
    console.error('Rate limit check error:', error);
    return { allowed: true, count: 0, windowStart, remaining: rateLimit };
  }
}

const TEST_TOKEN_SECRET = 'test-cursor-signing-key-for-rebuild';
const LAST_USED_THROTTLE_MS = 15 * 60_000;

function getTokenPepper(): string {
  return process.env.API_TOKEN_PEPPER || process.env.VITE_API_TOKEN_PEPPER || 'default-dev-pepper-not-for-production';
}

export function hashToken(token: string): string {
  const pepper = getTokenPepper();
  return createHash('sha256').update(`${pepper}:${token}`).digest('hex');
}

export function generateApiToken(): string {
  return `shk_${randomBytes(32).toString('base64url')}`;
}

export function generateCursorSigningKey(): string {
  return randomBytes(32).toString('base64url');
}

function isEmulatorEnvironment(): boolean {
  return !!(
    process.env.FUNCTIONS_EMULATOR ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    process.env.FIRESTORE_EMULATOR_HOST
  );
}

export function createLegacyApiAuthMiddleware(db: Firestore): Router {
  const router = Router();

  router.use(async (req: Request, res: Response, next: NextFunction) => {
    res.locals.requestId = randomUUID();
    res.setHeader('X-Request-ID', res.locals.requestId);
    res.setHeader('Cache-Control', 'no-store');

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendLegacyError(res, 401, 'invalid_token', 'A valid Bearer token is required.');
    }

    const token = authHeader.slice(7);
    if (token.length > 4096) {
      return sendLegacyError(res, 401, 'invalid_token', 'A valid Bearer token is required.');
    }

    if (isEmulatorEnvironment() && token.startsWith('test-api-token-')) {
      const scopePart = token.replace('test-api-token-', '');
      const scopes = parseTestScopes(scopePart);
      
      res.locals.apiCredential = {
        clientId: 'test-client',
        tokenVersionId: 'test-token-v1',
        scopes,
        cursorSigningKey: TEST_TOKEN_SECRET,
        grantsVersion: 1,
      } as ApiCredential;
      
      // Add rate limit headers for test tokens too
      const testRateLimit = DEFAULT_RATE_LIMIT;
      const now = Date.now();
      res.setHeader('X-RateLimit-Limit', testRateLimit.toString());
      res.setHeader('X-RateLimit-Remaining', (testRateLimit - 1).toString());
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + RATE_LIMIT_WINDOW_MS) / 1000).toString());
      
      return next();
    }

    try {
      const tokenHash = hashToken(token);
      const clientsRef = db.collection('apiClients');
      const snapshot = await clientsRef.where('tokenHash', '==', tokenHash).limit(1).get();

      if (snapshot.empty) {
        return sendLegacyError(res, 401, 'invalid_token', 'A valid Bearer token is required.');
      }

      const doc = snapshot.docs[0];
      const client = { id: doc.id, ...doc.data() } as ApiClientDocument;

      if (!client.active) {
        return sendLegacyError(res, 401, 'invalid_token', 'A valid Bearer token is required.');
      }

      const now = new Date();
      if (!client.lastUsedAt || now.getTime() - new Date(client.lastUsedAt).getTime() >= LAST_USED_THROTTLE_MS) {
        await doc.ref.update({ lastUsedAt: now.toISOString() });
      }

      res.locals.apiCredential = {
        clientId: client.id,
        tokenVersionId: `v${client.version}`,
        scopes: client.scopes,
        cursorSigningKey: client.tokenHash.slice(0, 43),
        grantsVersion: client.version,
      } as ApiCredential;

      // Rate limiting check
      const rateLimit = client.rateLimit ?? DEFAULT_RATE_LIMIT;
      if (rateLimit > 0) {
        const now = Date.now();
        const rateLimitResult = await checkRateLimit(db, client.id, rateLimit);
        
        // Check if over limit
        if (!rateLimitResult.allowed) {
          const retryAfterSeconds = Math.ceil((rateLimitResult.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
          
          // Log rate limit exceeded
          try {
            await db.collection('rateLimitLog').add({
              clientId: client.id,
              clientName: client.name,
              timestamp: new Date().toISOString(),
              requestCount: rateLimitResult.count,
              limit: rateLimit,
              path: req.path,
              method: req.method,
            });
          } catch {
            // Don't fail the request if logging fails
          }
          
          res.setHeader('Retry-After', retryAfterSeconds.toString());
          res.setHeader('X-RateLimit-Limit', rateLimit.toString());
          res.setHeader('X-RateLimit-Remaining', '0');
          res.setHeader('X-RateLimit-Reset', Math.ceil((rateLimitResult.windowStart + RATE_LIMIT_WINDOW_MS) / 1000).toString());
          
          return sendLegacyError(res, 429, 'rate_limit_exceeded', 
            `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`);
        }
        
        // Add rate limit headers to successful responses
        res.setHeader('X-RateLimit-Limit', rateLimit.toString());
        res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
        res.setHeader('X-RateLimit-Reset', Math.ceil((rateLimitResult.windowStart + RATE_LIMIT_WINDOW_MS) / 1000).toString());
      }

      return next();
    } catch (error) {
      console.error('API auth error:', error);
      return sendLegacyError(res, 401, 'invalid_token', 'A valid Bearer token is required.');
    }
  });

  return router;
}

function parseTestScopes(scopePart: string): LegacyApiScope[] {
  const scopeMap: Record<string, LegacyApiScope[]> = {
    'all': ['locations:read', 'personnel:read', 'staffing:read', 'district-leadership:read', 'district-leadership:contacts:read'],
    'locations': ['locations:read'],
    'personnel': ['personnel:read'],
    'staffing': ['staffing:read'],
    'district-leadership': ['district-leadership:read'],
    'district-leadership-contacts': ['district-leadership:read', 'district-leadership:contacts:read'],
  };
  return scopeMap[scopePart] || ['locations:read'];
}

export function requireLegacyScope(scope: LegacyApiScope): (req: Request, res: Response, next: NextFunction) => void {
  return (_req: Request, res: Response, next: NextFunction) => {
    const credential = res.locals.apiCredential as ApiCredential | undefined;
    if (!credential?.scopes.includes(scope)) {
      return sendLegacyError(res, 403, 'insufficient_scope', `The ${scope} scope is required.`);
    }
    next();
  };
}

export function requireAnyLegacyScope(...scopes: LegacyApiScope[]): (req: Request, res: Response, next: NextFunction) => void {
  return (_req: Request, res: Response, next: NextFunction) => {
    const credential = res.locals.apiCredential as ApiCredential | undefined;
    if (!credential || !scopes.some(scope => credential.scopes.includes(scope))) {
      return sendLegacyError(res, 403, 'insufficient_scope', `One of ${scopes.join(', ')} scope is required.`);
    }
    next();
  };
}

export function sendLegacyError(
  res: Response,
  status: number,
  code: string,
  message: string
): Response {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({
    error: {
      code,
      message,
      requestId: res.locals.requestId || 'unknown',
    },
  });
}

export function signCursor(payload: unknown, secret: string, prefix: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(`${prefix}:${encoded}`).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyCursor<T>(value: string, secret: string, prefix: string): T | null {
  if (value.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  
  const [encoded, signature] = value.split('.');
  const expected = createHmac('sha256', secret).update(`${prefix}:${encoded}`).digest();
  const supplied = Buffer.from(signature, 'base64url');
  
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return null;
  }
  
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function computeVersion(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

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

import { type Request, type Response, type NextFunction, Router } from 'express';
import { randomUUID, createHash, createHmac, timingSafeEqual } from 'crypto';
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

const TEST_TOKEN_SECRET = 'test-cursor-signing-key-for-rebuild';

export function createLegacyApiAuthMiddleware(_db: Firestore): Router {
  const router = Router();

  router.use((req: Request, res: Response, next: NextFunction) => {
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

    const isDev = process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.NODE_ENV !== 'production';
    if (isDev && token.startsWith('test-api-token-')) {
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

    return sendLegacyError(res, 401, 'invalid_token', 'A valid Bearer token is required.');
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

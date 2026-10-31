import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import type { AuthUser } from '../../src/types';
import {
  hashToken,
  generateApiToken,
  type LegacyApiScope,
  type ApiClientDocument,
} from '../middleware/legacyApiAuth';

const VALID_SCOPES: LegacyApiScope[] = [
  'locations:read',
  'personnel:read',
  'staffing:read',
  'district-leadership:read',
  'district-leadership:contacts:read',
];

export function createApiClientsRouter(db: Firestore): Router {
  const router = Router();

  router.use((_req: Request, res: Response, next) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    if (!authUser || authUser.role !== 'Admin') {
      return res.status(403).json({
        error: {
          code: 'access_denied',
          message: 'Admin access required',
          requestId: res.locals.requestId || 'unknown',
        },
      });
    }
    next();
  });

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const snapshot = await db.collection('apiClients').orderBy('createdAt', 'desc').get();
      const clients = snapshot.docs.map(doc => {
        const data = doc.data() as Omit<ApiClientDocument, 'id' | 'tokenHash'>;
        return {
          id: doc.id,
          name: data.name,
          scopes: data.scopes,
          active: data.active,
          version: data.version,
          createdAt: data.createdAt,
          lastUsedAt: data.lastUsedAt,
        };
      });
      res.json({ clients });
    } catch (error) {
      console.error('Error listing API clients:', error);
      res.status(500).json({
        error: {
          code: 'internal_error',
          message: 'Failed to list API clients',
          requestId: res.locals.requestId || 'unknown',
        },
      });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { name, scopes } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
        return res.status(400).json({
          error: {
            code: 'invalid_request',
            message: 'Name is required and must be 1-100 characters',
            requestId: res.locals.requestId || 'unknown',
          },
        });
      }

      const requestedScopes = scopes || ['locations:read'];
      if (!Array.isArray(requestedScopes) || !requestedScopes.every(s => VALID_SCOPES.includes(s))) {
        return res.status(400).json({
          error: {
            code: 'invalid_request',
            message: `Invalid scopes. Valid scopes: ${VALID_SCOPES.join(', ')}`,
            requestId: res.locals.requestId || 'unknown',
          },
        });
      }

      const token = generateApiToken();
      const tokenHash = hashToken(token);
      const clientId = `api-${randomUUID()}`;
      const now = new Date().toISOString();

      const clientDoc: Omit<ApiClientDocument, 'id'> = {
        name: name.trim(),
        tokenHash,
        scopes: requestedScopes as LegacyApiScope[],
        active: true,
        version: 1,
        createdAt: now,
      };

      await db.collection('apiClients').doc(clientId).set(clientDoc);

      const authUser = res.locals.authUser as AuthUser;
      await db.collection('audit').add({
        timestamp: now,
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'api-client',
        entityId: clientId,
        entityName: name.trim(),
        changes: [{ field: 'scopes', newValue: requestedScopes.join(', ') }],
      });

      res.status(201).json({
        client: {
          id: clientId,
          name: name.trim(),
          scopes: requestedScopes,
          active: true,
          version: 1,
          createdAt: now,
        },
        token,
      });
    } catch (error) {
      console.error('Error creating API client:', error);
      res.status(500).json({
        error: {
          code: 'internal_error',
          message: 'Failed to create API client',
          requestId: res.locals.requestId || 'unknown',
        },
      });
    }
  });

  router.post('/:id/revoke', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const docRef = db.collection('apiClients').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(404).json({
          error: {
            code: 'not_found',
            message: 'API client not found',
            requestId: res.locals.requestId || 'unknown',
          },
        });
      }

      const data = doc.data() as Omit<ApiClientDocument, 'id'>;
      if (!data.active) {
        return res.status(409).json({
          error: {
            code: 'conflict',
            message: 'API client is already revoked',
            requestId: res.locals.requestId || 'unknown',
          },
        });
      }

      const now = new Date().toISOString();
      await docRef.update({
        active: false,
        version: data.version + 1,
      });

      const authUser = res.locals.authUser as AuthUser;
      await db.collection('audit').add({
        timestamp: now,
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'api-client',
        entityId: id,
        entityName: data.name,
        changes: [{ field: 'active', oldValue: true, newValue: false }],
      });

      res.json({
        client: {
          id,
          name: data.name,
          scopes: data.scopes,
          active: false,
          version: data.version + 1,
          createdAt: data.createdAt,
          lastUsedAt: data.lastUsedAt,
        },
      });
    } catch (error) {
      console.error('Error revoking API client:', error);
      res.status(500).json({
        error: {
          code: 'internal_error',
          message: 'Failed to revoke API client',
          requestId: res.locals.requestId || 'unknown',
        },
      });
    }
  });

  router.post('/:id/rotate', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const docRef = db.collection('apiClients').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(404).json({
          error: {
            code: 'not_found',
            message: 'API client not found',
            requestId: res.locals.requestId || 'unknown',
          },
        });
      }

      const data = doc.data() as Omit<ApiClientDocument, 'id'>;
      if (!data.active) {
        return res.status(409).json({
          error: {
            code: 'conflict',
            message: 'Cannot rotate token for revoked client',
            requestId: res.locals.requestId || 'unknown',
          },
        });
      }

      const token = generateApiToken();
      const tokenHash = hashToken(token);
      const now = new Date().toISOString();

      await docRef.update({
        tokenHash,
        version: data.version + 1,
      });

      const authUser = res.locals.authUser as AuthUser;
      await db.collection('audit').add({
        timestamp: now,
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'api-client',
        entityId: id,
        entityName: data.name,
        changes: [{ field: 'token', oldValue: '[redacted]', newValue: '[rotated]' }],
      });

      res.json({
        client: {
          id,
          name: data.name,
          scopes: data.scopes,
          active: true,
          version: data.version + 1,
          createdAt: data.createdAt,
          lastUsedAt: data.lastUsedAt,
        },
        token,
      });
    } catch (error) {
      console.error('Error rotating API client token:', error);
      res.status(500).json({
        error: {
          code: 'internal_error',
          message: 'Failed to rotate API client token',
          requestId: res.locals.requestId || 'unknown',
        },
      });
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const docRef = db.collection('apiClients').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(404).json({
          error: {
            code: 'not_found',
            message: 'API client not found',
            requestId: res.locals.requestId || 'unknown',
          },
        });
      }

      const data = doc.data() as Omit<ApiClientDocument, 'id'>;

      if (data.active) {
        return res.status(400).json({
          error: {
            code: 'invalid_request',
            message: 'Cannot delete an active API client. Revoke it first.',
            requestId: res.locals.requestId || 'unknown',
          },
        });
      }

      await docRef.delete();

      const now = new Date().toISOString();
      const authUser = res.locals.authUser as AuthUser;
      await db.collection('audit').add({
        timestamp: now,
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'delete',
        entityType: 'api-client',
        entityId: id,
        entityName: data.name,
        changes: [],
      });

      res.json({ success: true, message: 'API client deleted' });
    } catch (error) {
      console.error('Error deleting API client:', error);
      res.status(500).json({
        error: {
          code: 'internal_error',
          message: 'Failed to delete API client',
          requestId: res.locals.requestId || 'unknown',
        },
      });
    }
  });

  return router;
}

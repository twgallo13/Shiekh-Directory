import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import type { User, AuthUser, UserRole, Location } from '../../src/types';

const VALID_ROLES: UserRole[] = ['Viewer', 'Store', 'Leader', 'Steward', 'Admin'];

export interface CustomFieldDefinition {
  id: string;
  name: string;
  type: 'text' | 'number' | 'boolean' | 'date' | 'select';
  options?: string[];
  required: boolean;
  description?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export function createAdminRouter(db: Firestore): Router {
  const router = Router();

  router.use((_req: Request, res: Response, next) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    if (!authUser || authUser.role !== 'Admin') {
      return res.status(403).json({
        error: { code: 'access_denied', message: 'Admin access required', requestId: res.locals.requestId },
      });
    }
    next();
  });

  router.get('/users', async (req: Request, res: Response) => {
    try {
      const { role, status, search, limit = '50', offset = '0' } = req.query;
      
      let query = db.collection('users').orderBy('email');
      
      if (role && VALID_ROLES.includes(role as UserRole)) {
        query = query.where('role', '==', role);
      }
      if (status === 'active' || status === 'disabled') {
        query = query.where('status', '==', status);
      }
      
      const snapshot = await query.get();
      let users = snapshot.docs.map(doc => {
        const data = doc.data() as User;
        return {
          id: doc.id,
          email: data.email,
          displayName: data.displayName,
          role: data.role,
          status: data.status || 'active',
          storeLocationId: data.storeLocationId,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });
      
      if (search) {
        const searchLower = String(search).toLowerCase();
        users = users.filter(u => 
          u.email.toLowerCase().includes(searchLower) ||
          u.displayName.toLowerCase().includes(searchLower)
        );
      }
      
      const total = users.length;
      const offsetNum = Math.max(0, parseInt(String(offset), 10) || 0);
      const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50));
      
      users = users.slice(offsetNum, offsetNum + limitNum);

      res.json({ users, total, limit: limitNum, offset: offsetNum });
    } catch (error) {
      console.error('List users error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to list users' } });
    }
  });

  router.post('/users', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { email, displayName, role, storeLocationId } = req.body;

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ error: { code: 'invalid_email', message: 'Valid email required' } });
      }
      if (!displayName || typeof displayName !== 'string' || displayName.length < 1) {
        return res.status(400).json({ error: { code: 'invalid_name', message: 'Display name required' } });
      }
      if (!role || !VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: { code: 'invalid_role', message: `Role must be one of: ${VALID_ROLES.join(', ')}` } });
      }
      if (role === 'Store' && !storeLocationId) {
        return res.status(400).json({ error: { code: 'store_required', message: 'Store accounts require a store location' } });
      }

      const existingUser = await db.collection('users').where('email', '==', email.toLowerCase()).get();
      if (!existingUser.empty) {
        return res.status(409).json({ error: { code: 'email_exists', message: 'A user with this email already exists' } });
      }

      if (storeLocationId) {
        const storeDoc = await db.collection('locations').doc(storeLocationId).get();
        if (!storeDoc.exists) {
          return res.status(400).json({ error: { code: 'invalid_store', message: 'Store location not found' } });
        }
      }

      const now = new Date().toISOString();
      const userId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      
      const newUser: User = {
        id: userId,
        email: email.toLowerCase(),
        displayName,
        role,
        status: 'active',
        storeLocationId: role === 'Store' ? storeLocationId : undefined,
        createdAt: now,
        updatedAt: now,
        updatedBy: authUser.uid,
        version: 1,
      };

      await db.collection('users').doc(userId).set(newUser);

      await db.collection('auditLog').add({
        timestamp: now,
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'user',
        entityId: userId,
        entityName: email,
        changes: [{ field: 'role', newValue: role }],
      });

      res.status(201).json({ user: newUser });
    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to create user' } });
    }
  });

  router.patch('/users/:id', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { id } = req.params;
      const { displayName, role, status, storeLocationId } = req.body;

      const userRef = db.collection('users').doc(id);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        return res.status(404).json({ error: { code: 'not_found', message: 'User not found' } });
      }

      const userData = userDoc.data() as User;
      const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
      const updates: Partial<User> = {
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        version: (userData.version || 1) + 1,
      };

      if (displayName !== undefined && displayName !== userData.displayName) {
        updates.displayName = displayName;
        changes.push({ field: 'displayName', oldValue: userData.displayName, newValue: displayName });
      }

      if (role !== undefined && role !== userData.role) {
        if (!VALID_ROLES.includes(role)) {
          return res.status(400).json({ error: { code: 'invalid_role', message: `Role must be one of: ${VALID_ROLES.join(', ')}` } });
        }
        updates.role = role;
        changes.push({ field: 'role', oldValue: userData.role, newValue: role });
      }

      if (status !== undefined && status !== userData.status) {
        if (status !== 'active' && status !== 'disabled') {
          return res.status(400).json({ error: { code: 'invalid_status', message: 'Status must be active or disabled' } });
        }
        updates.status = status;
        changes.push({ field: 'status', oldValue: userData.status, newValue: status });
      }

      const effectiveRole = updates.role || userData.role;
      if (effectiveRole === 'Store') {
        const newStoreId = storeLocationId !== undefined ? storeLocationId : userData.storeLocationId;
        if (!newStoreId) {
          return res.status(400).json({ error: { code: 'store_required', message: 'Store accounts require a store location' } });
        }
        if (storeLocationId !== undefined && storeLocationId !== userData.storeLocationId) {
          const storeDoc = await db.collection('locations').doc(storeLocationId).get();
          if (!storeDoc.exists) {
            return res.status(400).json({ error: { code: 'invalid_store', message: 'Store location not found' } });
          }
          updates.storeLocationId = storeLocationId;
          changes.push({ field: 'storeLocationId', oldValue: userData.storeLocationId, newValue: storeLocationId });
        }
      } else if (userData.storeLocationId) {
        updates.storeLocationId = undefined;
        changes.push({ field: 'storeLocationId', oldValue: userData.storeLocationId, newValue: null });
      }

      if (changes.length === 0) {
        return res.json({ user: userData, message: 'No changes' });
      }

      await userRef.update(updates);

      await db.collection('auditLog').add({
        timestamp: updates.updatedAt,
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'user',
        entityId: id,
        entityName: userData.email,
        changes,
      });

      res.json({ user: { ...userData, ...updates } });
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to update user' } });
    }
  });

  router.get('/custom-fields', async (_req: Request, res: Response) => {
    try {
      const snapshot = await db.collection('customFields').orderBy('name').get();
      const fields = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomFieldDefinition));
      
      const version = fields.length > 0
        ? Math.max(...fields.map(f => f.version))
        : 0;

      res.json({ version, fields });
    } catch (error) {
      console.error('Get custom fields error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to get custom fields' } });
    }
  });

  router.post('/custom-fields', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { name, type, options, required, description } = req.body;

      if (!name || typeof name !== 'string' || name.length < 1 || name.length > 50) {
        return res.status(400).json({ error: { code: 'invalid_name', message: 'Name required (1-50 chars)' } });
      }
      
      const validTypes = ['text', 'number', 'boolean', 'date', 'select'];
      if (!type || !validTypes.includes(type)) {
        return res.status(400).json({ error: { code: 'invalid_type', message: `Type must be one of: ${validTypes.join(', ')}` } });
      }

      if (type === 'select' && (!options || !Array.isArray(options) || options.length < 1)) {
        return res.status(400).json({ error: { code: 'options_required', message: 'Select type requires options array' } });
      }

      const existingField = await db.collection('customFields').where('name', '==', name).get();
      if (!existingField.empty) {
        return res.status(409).json({ error: { code: 'field_exists', message: 'A field with this name already exists' } });
      }

      const now = new Date().toISOString();
      const fieldId = `field-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
      
      const newField: CustomFieldDefinition = {
        id: fieldId,
        name,
        type,
        options: type === 'select' ? options : undefined,
        required: required === true,
        description: description || undefined,
        version: 1,
        createdAt: now,
        updatedAt: now,
        updatedBy: authUser.uid,
      };

      await db.collection('customFields').doc(fieldId).set(newField);

      await db.collection('auditLog').add({
        timestamp: now,
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'custom-field',
        entityId: fieldId,
        entityName: name,
        changes: [{ field: 'type', newValue: type }],
      });

      res.status(201).json({ field: newField });
    } catch (error) {
      console.error('Create custom field error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to create custom field' } });
    }
  });

  router.delete('/custom-fields/:id', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { id } = req.params;

      const fieldRef = db.collection('customFields').doc(id);
      const fieldDoc = await fieldRef.get();
      
      if (!fieldDoc.exists) {
        return res.status(404).json({ error: { code: 'not_found', message: 'Custom field not found' } });
      }

      const fieldData = fieldDoc.data() as CustomFieldDefinition;
      await fieldRef.delete();

      await db.collection('auditLog').add({
        timestamp: new Date().toISOString(),
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'delete',
        entityType: 'custom-field',
        entityId: id,
        entityName: fieldData.name,
        changes: [],
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Delete custom field error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to delete custom field' } });
    }
  });

  router.delete('/users/:id', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { id } = req.params;

      const userRef = db.collection('users').doc(id);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        return res.status(404).json({ error: { code: 'not_found', message: 'User not found' } });
      }

      const userData = userDoc.data() as User;

      if (userData.id === authUser.uid || userData.email === authUser.email) {
        return res.status(400).json({ error: { code: 'self_delete', message: 'Cannot delete your own account' } });
      }

      const auth = getAuth();
      try {
        const firebaseUser = await auth.getUserByEmail(userData.email);
        await auth.deleteUser(firebaseUser.uid);
      } catch (authError: unknown) {
        const errorCode = (authError as { code?: string })?.code;
        if (errorCode !== 'auth/user-not-found') {
          console.error('Firebase Auth deletion error:', authError);
        }
      }

      await userRef.delete();

      const now = new Date().toISOString();
      await db.collection('auditLog').add({
        timestamp: now,
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'delete',
        entityType: 'user',
        entityId: id,
        entityName: userData.email,
        changes: [{ field: 'deleted', oldValue: userData.role, newValue: null }],
      });

      res.json({ success: true, message: 'User deleted' });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to delete user' } });
    }
  });

  router.get('/last-drill', async (_req: Request, res: Response) => {
    try {
      const snapshot = await db.collection('drillReports')
        .orderBy('completedAt', 'desc')
        .limit(1)
        .get();

      if (snapshot.empty) {
        return res.json({ lastDrill: null });
      }

      const doc = snapshot.docs[0];
      const data = doc.data();
      
      res.json({
        lastDrill: {
          drillId: data.drillId,
          completedAt: data.completedAt,
          status: data.status,
          totalExpected: data.totalExpected,
          totalRestored: data.totalRestored,
        },
      });
    } catch (error) {
      console.error('Get last drill error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to get drill status' } });
    }
  });

  router.get('/stores', async (req: Request, res: Response) => {
    try {
      const { includeAll } = req.query;
      
      let query = db.collection('locations').orderBy('storeNumber');
      
      if (includeAll !== 'true') {
        query = query.where('lifecycle', '==', 'active');
      }
      
      const snapshot = await query.get();
      
      let stores = snapshot.docs.map(doc => {
        const data = doc.data() as Location;
        return {
          id: doc.id,
          storeNumber: data.storeNumber,
          name: data.name,
          kind: data.kind,
          lifecycle: data.lifecycle,
        };
      });

      if (includeAll !== 'true') {
        stores = stores.filter(s => s.kind !== 'facility');
      }

      res.json({ stores });
    } catch (error) {
      console.error('List stores error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to list stores' } });
    }
  });

  return router;
}

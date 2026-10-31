import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import type { User, AuthUser, UserRole, Location, HoursTemplate, StandardHours, StoreTypeCode, DayOfWeek, AuditLogEntry } from '../../src/types';
import { isValidStoreTypeCode, STORE_TYPE_CODE_FROM_LABEL } from '../../src/types';

async function addAuditEntry(
  db: Firestore,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<void> {
  const auditRef = db.collection('auditLog').doc();
  await auditRef.set({
    ...entry,
    id: auditRef.id,
    timestamp: new Date().toISOString(),
  });
}

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

  // Import hours templates from legacy JSON format
  // Expected format: { templates: [{ id, name, description, weeklySchedule, defaultForTypes, isDefault }] }
  router.post('/import/hours-templates', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { templates, dryRun } = req.body;

      if (!Array.isArray(templates)) {
        return res.status(400).json({
          error: { code: 'invalid_input', message: 'templates must be an array', requestId: res.locals.requestId },
        });
      }

      const results: { id: string; name: string; action: 'created' | 'updated' | 'skipped'; error?: string }[] = [];
      const now = new Date().toISOString();

      for (const template of templates) {
        try {
          const { id, name, description, weeklySchedule, defaultForTypes, isDefault } = template;

          if (!name?.trim()) {
            results.push({ id: id || 'unknown', name: name || 'unknown', action: 'skipped', error: 'Name is required' });
            continue;
          }

          // Parse legacy weekly schedule to StandardHours
          const hours = parseLegacyWeeklySchedule(weeklySchedule);
          if (!hours) {
            results.push({ id: id || 'unknown', name, action: 'skipped', error: 'Invalid weekly schedule' });
            continue;
          }

          // Validate and convert defaultForTypes
          let validatedDefaultForTypes: StoreTypeCode[] | undefined;
          if (defaultForTypes && Array.isArray(defaultForTypes)) {
            validatedDefaultForTypes = [];
            for (const typeLabel of defaultForTypes) {
              if (typeof typeLabel === 'string') {
                // Try direct code first, then label lookup
                if (isValidStoreTypeCode(typeLabel)) {
                  validatedDefaultForTypes.push(typeLabel);
                } else if (STORE_TYPE_CODE_FROM_LABEL[typeLabel]) {
                  validatedDefaultForTypes.push(STORE_TYPE_CODE_FROM_LABEL[typeLabel]);
                }
              }
            }
          }

          const templateData: Omit<HoursTemplate, 'id'> = {
            name: name.trim(),
            description: description?.trim() || undefined,
            hours,
            version: 1,
            createdAt: now,
            createdBy: authUser.uid,
            updatedAt: now,
            updatedBy: authUser.uid,
            lifecycle: 'active',
            defaultForTypes: validatedDefaultForTypes?.length ? validatedDefaultForTypes : undefined,
            isDefault: isDefault === true ? true : undefined,
          };

          if (!dryRun) {
            // Check if template with same name exists
            const existing = await db.collection('hoursTemplates')
              .where('name', '==', name.trim())
              .limit(1)
              .get();

            if (!existing.empty) {
              const existingDoc = existing.docs[0];
              await existingDoc.ref.update({
                ...templateData,
                createdAt: existingDoc.data().createdAt,
                createdBy: existingDoc.data().createdBy,
                version: (existingDoc.data().version || 0) + 1,
              });
              results.push({ id: existingDoc.id, name, action: 'updated' });
            } else {
              const newRef = db.collection('hoursTemplates').doc();
              await newRef.set(templateData);
              results.push({ id: newRef.id, name, action: 'created' });
            }
          } else {
            results.push({ id: id || 'new', name, action: 'created' });
          }
        } catch (err) {
          results.push({ id: template.id || 'unknown', name: template.name || 'unknown', action: 'skipped', error: String(err) });
        }
      }

      const createdCount = results.filter(r => r.action === 'created').length;
      const updatedCount = results.filter(r => r.action === 'updated').length;
      
      if (!dryRun && (createdCount > 0 || updatedCount > 0)) {
        await addAuditEntry(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'create',
          entityType: 'hours-template' as AuditLogEntry['entityType'],
          entityId: 'import-batch',
          entityName: 'Hours Templates Import',
          changes: [
            { field: 'imported', newValue: templates.length },
            { field: 'created', newValue: createdCount },
            { field: 'updated', newValue: updatedCount },
            { field: 'skipped', newValue: results.filter(r => r.action === 'skipped').length },
          ],
        });
      }

      res.json({
        data: {
          dryRun: !!dryRun,
          total: templates.length,
          created: createdCount,
          updated: updatedCount,
          skipped: results.filter(r => r.action === 'skipped').length,
          results,
        },
      });
    } catch (error) {
      console.error('Import hours templates error:', error);
      res.status(500).json({ error: { code: 'import_error', message: 'Failed to import hours templates' } });
    }
  });

  // Import per-store types from legacy JSON format
  // Expected format: { storeTypes: { "storeNumber": "type label", ... } }
  router.post('/import/store-types', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { storeTypes, dryRun } = req.body;

      if (!storeTypes || typeof storeTypes !== 'object') {
        return res.status(400).json({
          error: { code: 'invalid_input', message: 'storeTypes must be an object mapping storeNumber to type', requestId: res.locals.requestId },
        });
      }

      // Get all active locations with their kind
      const locationsSnap = await db.collection('locations').where('lifecycle', '==', 'active').get();
      const locationsByNumber = new Map<string, { id: string; storeNumber: string; kind: string }>();
      for (const doc of locationsSnap.docs) {
        const data = doc.data() as Location;
        locationsByNumber.set(data.storeNumber, { id: doc.id, storeNumber: data.storeNumber, kind: data.kind || 'store' });
        // Also index without leading zeros
        const normalized = data.storeNumber.replace(/^0+/, '');
        if (normalized !== data.storeNumber) {
          locationsByNumber.set(normalized, { id: doc.id, storeNumber: data.storeNumber, kind: data.kind || 'store' });
        }
      }

      const results: { storeNumber: string; action: 'updated' | 'skipped' | 'facility'; storeType?: string; error?: string; kind?: string }[] = [];
      const now = new Date().toISOString();
      const batch = db.batch();
      let batchCount = 0;

      for (const [storeNumber, typeLabel] of Object.entries(storeTypes)) {
        if (typeof typeLabel !== 'string') {
          results.push({ storeNumber, action: 'skipped', error: 'Type must be a string' });
          continue;
        }

        const location = locationsByNumber.get(storeNumber);
        if (!location) {
          results.push({ storeNumber, action: 'skipped', error: 'Location not found' });
          continue;
        }

        // Report facilities separately - don't count as store updates
        if (location.kind === 'facility' || location.kind === 'warehouse' || location.kind === 'office') {
          results.push({ storeNumber: location.storeNumber, action: 'facility', kind: location.kind, error: `Non-store location (${location.kind})` });
          continue;
        }

        // Convert type label to code
        let storeTypeCode: StoreTypeCode | undefined;
        if (isValidStoreTypeCode(typeLabel)) {
          storeTypeCode = typeLabel;
        } else if (STORE_TYPE_CODE_FROM_LABEL[typeLabel]) {
          storeTypeCode = STORE_TYPE_CODE_FROM_LABEL[typeLabel];
        } else {
          results.push({ storeNumber: location.storeNumber, action: 'skipped', error: `Unknown type: ${typeLabel}` });
          continue;
        }

        if (!dryRun) {
          batch.update(db.collection('locations').doc(location.id), {
            storeType: storeTypeCode,
            updatedAt: now,
            updatedBy: authUser.uid,
          });
          batchCount++;
        }
        results.push({ storeNumber: location.storeNumber, action: 'updated', storeType: storeTypeCode });
      }

      if (!dryRun && batchCount > 0) {
        await batch.commit();
      }

      const storesUpdated = results.filter(r => r.action === 'updated').length;
      const facilitiesFound = results.filter(r => r.action === 'facility').length;
      const skipped = results.filter(r => r.action === 'skipped').length;

      if (!dryRun && storesUpdated > 0) {
        await addAuditEntry(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'update',
          entityType: 'location',
          entityId: 'import-batch',
          entityName: 'Store Types Import',
          changes: [
            { field: 'storesUpdated', newValue: storesUpdated },
            { field: 'facilitiesSkipped', newValue: facilitiesFound },
            { field: 'skipped', newValue: skipped },
          ],
        });
      }

      res.json({
        data: {
          dryRun: !!dryRun,
          total: Object.keys(storeTypes).length,
          storesUpdated,
          facilitiesFound,
          skipped,
          results,
        },
      });
    } catch (error) {
      console.error('Import store types error:', error);
      res.status(500).json({ error: { code: 'import_error', message: 'Failed to import store types' } });
    }
  });

  return router;
}

// Helper to parse legacy weekly schedule format
function parseLegacyWeeklySchedule(schedule: unknown): StandardHours | null {
  if (!schedule || typeof schedule !== 'object') return null;

  const result: Partial<StandardHours> = {};
  const days: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  for (const day of days) {
    const daySchedule = (schedule as Record<string, unknown>)[day];
    if (!daySchedule || typeof daySchedule !== 'object') {
      result[day] = { closed: true, intervals: [] };
      continue;
    }

    const ds = daySchedule as Record<string, unknown>;
    if (ds.isClosed === true || ds.closed === true) {
      result[day] = { closed: true, intervals: [] };
    } else {
      const open = typeof ds.open === 'string' ? ds.open : typeof ds.openTime === 'string' ? ds.openTime : '10:00';
      const close = typeof ds.close === 'string' ? ds.close : typeof ds.closeTime === 'string' ? ds.closeTime : '21:00';
      result[day] = {
        closed: false,
        intervals: [{ open: normalizeTimeString(open), close: normalizeTimeString(close) }],
      };
    }
  }

  return result as StandardHours;
}

function normalizeTimeString(time: string): string {
  // Handle various time formats and normalize to HH:MM
  const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  return time;
}

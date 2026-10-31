import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  HoursTemplate,
  StandardHours,
  AuthUser,
  Location,
  AppliedHoursTemplate,
  StoreTypeCode,
  AuditLogEntry,
} from '../../src/types';
import { hasPermission } from '../../src/lib/permissions';
import { isValidStoreTypeCode } from '../../src/types';

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

export function createHoursTemplatesRouter(db: Firestore): Router {
  const router = Router();

  // List all hours templates
  router.get('/', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const includeArchived = req.query.includeArchived === 'true';
      
      let query = db.collection('hoursTemplates').orderBy('name');
      if (!includeArchived) {
        query = query.where('lifecycle', '==', 'active');
      }
      
      const snap = await query.get();
      const templates = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as HoursTemplate[];

      return res.json({ data: templates });
    } catch (error) {
      console.error('List hours templates error:', error);
      return res.status(500).json({
        error: { code: 'list_error', message: 'Failed to list hours templates', requestId: res.locals.requestId },
      });
    }
  });

  // Suggest templates for a store type
  router.get('/suggest/:storeType', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const { storeType } = req.params;
      if (!isValidStoreTypeCode(storeType)) {
        return res.status(400).json({
          error: { code: 'invalid_store_type', message: 'Invalid store type code', requestId: res.locals.requestId },
        });
      }

      const snap = await db.collection('hoursTemplates')
        .where('lifecycle', '==', 'active')
        .get();
      
      const templates = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as HoursTemplate[];
      
      // Find templates with this store type in defaultForTypes
      const typeMatches = templates.filter(t => 
        t.defaultForTypes?.includes(storeType as StoreTypeCode)
      );
      
      // Find default template as fallback
      const defaultTemplate = templates.find(t => t.isDefault === true);
      
      // Return suggestions: type-specific first, then default
      const suggestions = typeMatches.length > 0 
        ? typeMatches 
        : defaultTemplate ? [defaultTemplate] : [];

      return res.json({ 
        data: { 
          storeType,
          suggestions,
          hasTypeSpecific: typeMatches.length > 0,
          hasFallback: !!defaultTemplate && typeMatches.length === 0,
        } 
      });
    } catch (error) {
      console.error('Suggest hours template error:', error);
      return res.status(500).json({
        error: { code: 'suggest_error', message: 'Failed to suggest hours templates', requestId: res.locals.requestId },
      });
    }
  });

  // Get a single template
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const { id } = req.params;
      const doc = await db.collection('hoursTemplates').doc(id).get();
      
      if (!doc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Template not found', requestId: res.locals.requestId },
        });
      }

      return res.json({ data: { id: doc.id, ...doc.data() } });
    } catch (error) {
      console.error('Get hours template error:', error);
      return res.status(500).json({
        error: { code: 'get_error', message: 'Failed to get hours template', requestId: res.locals.requestId },
      });
    }
  });

  // Create a new template (Admin/Steward only)
  router.post('/', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!hasPermission(authUser, 'edit:hours').allowed) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward or Admin can create hours templates', requestId: res.locals.requestId },
        });
      }

      const { name, description, hours, defaultForTypes, isDefault } = req.body;

      if (!name?.trim()) {
        return res.status(400).json({
          error: { code: 'name_required', message: 'Template name is required', requestId: res.locals.requestId },
        });
      }

      if (!hours || typeof hours !== 'object') {
        return res.status(400).json({
          error: { code: 'hours_required', message: 'Hours schedule is required', requestId: res.locals.requestId },
        });
      }

      // Validate hours structure
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      for (const day of days) {
        if (!hours[day] || typeof hours[day].closed !== 'boolean') {
          return res.status(400).json({
            error: { code: 'invalid_hours', message: `Invalid hours for ${day}`, requestId: res.locals.requestId },
          });
        }
      }

      // Validate defaultForTypes if provided
      let validatedDefaultForTypes: StoreTypeCode[] | undefined;
      if (defaultForTypes && Array.isArray(defaultForTypes)) {
        validatedDefaultForTypes = [];
        for (const code of defaultForTypes) {
          if (typeof code === 'string' && isValidStoreTypeCode(code)) {
            validatedDefaultForTypes.push(code);
          } else {
            return res.status(400).json({
              error: { code: 'invalid_store_type', message: `Invalid store type code: ${code}`, requestId: res.locals.requestId },
            });
          }
        }
      }

      const now = new Date().toISOString();
      const templateRef = db.collection('hoursTemplates').doc();
      const template: Omit<HoursTemplate, 'id'> = {
        name: name.trim(),
        description: description?.trim() || undefined,
        hours: hours as StandardHours,
        version: 1,
        createdAt: now,
        createdBy: authUser.uid,
        updatedAt: now,
        updatedBy: authUser.uid,
        lifecycle: 'active',
        defaultForTypes: validatedDefaultForTypes,
        isDefault: isDefault === true ? true : undefined,
      };

      await templateRef.set(template);

      await addAuditEntry(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'hours-template' as AuditLogEntry['entityType'],
        entityId: templateRef.id,
        entityName: template.name,
        changes: [
          { field: 'name', newValue: template.name },
          { field: 'defaultForTypes', newValue: validatedDefaultForTypes?.join(', ') || 'none' },
          { field: 'isDefault', newValue: isDefault === true },
        ],
      });

      return res.status(201).json({ data: { id: templateRef.id, ...template } });
    } catch (error) {
      console.error('Create hours template error:', error);
      return res.status(500).json({
        error: { code: 'create_error', message: 'Failed to create hours template', requestId: res.locals.requestId },
      });
    }
  });

  // Update a template (Admin/Steward only) - increments version
  router.patch('/:id', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!hasPermission(authUser, 'edit:hours').allowed) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward or Admin can update hours templates', requestId: res.locals.requestId },
        });
      }

      const { id } = req.params;
      const { name, description, hours, defaultForTypes, isDefault } = req.body;

      const doc = await db.collection('hoursTemplates').doc(id).get();
      if (!doc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Template not found', requestId: res.locals.requestId },
        });
      }

      const existing = doc.data() as HoursTemplate;
      const updates: Partial<HoursTemplate> = {
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
      };

      if (name !== undefined) {
        if (!name.trim()) {
          return res.status(400).json({
            error: { code: 'name_required', message: 'Template name cannot be empty', requestId: res.locals.requestId },
          });
        }
        updates.name = name.trim();
      }

      if (description !== undefined) {
        updates.description = description?.trim() || undefined;
      }

      if (hours !== undefined) {
        // Validate hours structure
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        for (const day of days) {
          if (!hours[day] || typeof hours[day].closed !== 'boolean') {
            return res.status(400).json({
              error: { code: 'invalid_hours', message: `Invalid hours for ${day}`, requestId: res.locals.requestId },
            });
          }
        }
        updates.hours = hours as StandardHours;
        // Increment version when hours change
        updates.version = existing.version + 1;
      }

      // Handle defaultForTypes update
      if (defaultForTypes !== undefined) {
        if (defaultForTypes === null || (Array.isArray(defaultForTypes) && defaultForTypes.length === 0)) {
          updates.defaultForTypes = undefined;
        } else if (Array.isArray(defaultForTypes)) {
          const validated: StoreTypeCode[] = [];
          for (const code of defaultForTypes) {
            if (typeof code === 'string' && isValidStoreTypeCode(code)) {
              validated.push(code);
            } else {
              return res.status(400).json({
                error: { code: 'invalid_store_type', message: `Invalid store type code: ${code}`, requestId: res.locals.requestId },
              });
            }
          }
          updates.defaultForTypes = validated;
        }
      }

      // Handle isDefault update
      if (isDefault !== undefined) {
        updates.isDefault = isDefault === true ? true : undefined;
      }

      await db.collection('hoursTemplates').doc(id).update(updates);

      const changes: { field: string; oldValue?: unknown; newValue?: unknown }[] = [];
      if (updates.name !== undefined) changes.push({ field: 'name', oldValue: existing.name, newValue: updates.name });
      if (updates.hours !== undefined) changes.push({ field: 'hours', oldValue: 'previous schedule', newValue: 'updated schedule' });
      if (updates.defaultForTypes !== undefined) changes.push({ field: 'defaultForTypes', oldValue: existing.defaultForTypes?.join(', '), newValue: updates.defaultForTypes?.join(', ') || 'none' });
      if (updates.isDefault !== undefined) changes.push({ field: 'isDefault', oldValue: existing.isDefault, newValue: updates.isDefault });

      await addAuditEntry(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'hours-template' as AuditLogEntry['entityType'],
        entityId: id,
        entityName: updates.name || existing.name,
        changes,
        previousVersion: existing.version,
        newVersion: updates.version || existing.version,
      });

      return res.json({ data: { ...existing, ...updates, id } });
    } catch (error) {
      console.error('Update hours template error:', error);
      return res.status(500).json({
        error: { code: 'update_error', message: 'Failed to update hours template', requestId: res.locals.requestId },
      });
    }
  });

  // Archive a template (Admin/Steward only)
  router.post('/:id/archive', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!hasPermission(authUser, 'edit:hours').allowed) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward or Admin can archive hours templates', requestId: res.locals.requestId },
        });
      }

      const { id } = req.params;
      const doc = await db.collection('hoursTemplates').doc(id).get();
      
      if (!doc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Template not found', requestId: res.locals.requestId },
        });
      }

      const templateData = doc.data() as HoursTemplate;
      
      await db.collection('hoursTemplates').doc(id).update({
        lifecycle: 'archived',
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
      });

      await addAuditEntry(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'hours-template' as AuditLogEntry['entityType'],
        entityId: id,
        entityName: templateData.name,
        changes: [{ field: 'lifecycle', oldValue: templateData.lifecycle, newValue: 'archived' }],
      });

      return res.json({ data: { success: true } });
    } catch (error) {
      console.error('Archive hours template error:', error);
      return res.status(500).json({
        error: { code: 'archive_error', message: 'Failed to archive hours template', requestId: res.locals.requestId },
      });
    }
  });

  // Apply template to a single location (copy-on-apply)
  router.post('/:id/apply', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!hasPermission(authUser, 'edit:hours').allowed) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward or Admin can apply hours templates', requestId: res.locals.requestId },
        });
      }

      const { id } = req.params;
      const { locationId } = req.body;

      if (!locationId) {
        return res.status(400).json({
          error: { code: 'location_required', message: 'Location ID is required', requestId: res.locals.requestId },
        });
      }

      const templateDoc = await db.collection('hoursTemplates').doc(id).get();
      if (!templateDoc.exists) {
        return res.status(404).json({
          error: { code: 'template_not_found', message: 'Template not found', requestId: res.locals.requestId },
        });
      }

      const template = templateDoc.data() as HoursTemplate;
      if (template.lifecycle !== 'active') {
        return res.status(400).json({
          error: { code: 'template_archived', message: 'Cannot apply archived template', requestId: res.locals.requestId },
        });
      }

      const locationDoc = await db.collection('locations').doc(locationId).get();
      if (!locationDoc.exists) {
        return res.status(404).json({
          error: { code: 'location_not_found', message: 'Location not found', requestId: res.locals.requestId },
        });
      }

      const appliedTemplate: AppliedHoursTemplate = {
        templateId: id,
        templateName: template.name,
        templateVersion: template.version,
        appliedAt: new Date().toISOString(),
        appliedBy: authUser.uid,
      };

      const location = locationDoc.data() as Location;
      
      await db.collection('locations').doc(locationId).update({
        standardHours: template.hours,
        appliedTemplate,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
      });

      await addAuditEntry(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'location',
        entityId: locationId,
        entityName: location.storeNumber || location.name,
        locationId,
        changes: [
          { field: 'appliedTemplate', oldValue: location.appliedTemplate?.templateName, newValue: template.name },
          { field: 'templateVersion', newValue: template.version },
        ],
      });

      return res.json({ data: { success: true, appliedTemplate } });
    } catch (error) {
      console.error('Apply hours template error:', error);
      return res.status(500).json({
        error: { code: 'apply_error', message: 'Failed to apply hours template', requestId: res.locals.requestId },
      });
    }
  });

  // Bulk apply template to multiple locations with preview
  router.post('/:id/bulk-apply', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!hasPermission(authUser, 'edit:hours').allowed) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward or Admin can bulk apply hours templates', requestId: res.locals.requestId },
        });
      }

      const { id } = req.params;
      const { locationIds, filters, preview } = req.body;

      const templateDoc = await db.collection('hoursTemplates').doc(id).get();
      if (!templateDoc.exists) {
        return res.status(404).json({
          error: { code: 'template_not_found', message: 'Template not found', requestId: res.locals.requestId },
        });
      }

      const template = templateDoc.data() as HoursTemplate;
      if (template.lifecycle !== 'active') {
        return res.status(400).json({
          error: { code: 'template_archived', message: 'Cannot apply archived template', requestId: res.locals.requestId },
        });
      }

      // Get target locations
      let locationsQuery: FirebaseFirestore.Query = db.collection('locations')
        .where('lifecycle', '==', 'active');
      
      if (filters?.districtId) {
        locationsQuery = locationsQuery.where('districtId', '==', filters.districtId);
      }
      if (filters?.regionId) {
        locationsQuery = locationsQuery.where('regionId', '==', filters.regionId);
      }
      if (filters?.kind) {
        locationsQuery = locationsQuery.where('kind', '==', filters.kind);
      }

      const locationsSnap = await locationsQuery.get();
      let targetLocations = locationsSnap.docs.map(doc => {
        const data = doc.data() as Location;
        return { ...data, id: doc.id };
      });

      // Filter by explicit IDs if provided
      if (locationIds && Array.isArray(locationIds) && locationIds.length > 0) {
        targetLocations = targetLocations.filter(loc => locationIds.includes(loc.id));
      }

      // Preview mode - return what would change
      if (preview === true) {
        const previewData = targetLocations.map(loc => ({
          id: loc.id,
          storeNumber: loc.storeNumber,
          name: loc.name,
          currentHours: loc.standardHours,
          newHours: template.hours,
          hasChanges: JSON.stringify(loc.standardHours) !== JSON.stringify(template.hours),
        }));
        
        return res.json({
          data: {
            preview: true,
            templateName: template.name,
            templateVersion: template.version,
            totalLocations: targetLocations.length,
            locationsWithChanges: previewData.filter(p => p.hasChanges).length,
            locations: previewData,
          },
        });
      }

      // Apply to all locations
      const appliedTemplate: AppliedHoursTemplate = {
        templateId: id,
        templateName: template.name,
        templateVersion: template.version,
        appliedAt: new Date().toISOString(),
        appliedBy: authUser.uid,
      };

      const batch = db.batch();
      const results: { id: string; success: boolean; error?: string }[] = [];

      for (const loc of targetLocations) {
        try {
          const ref = db.collection('locations').doc(loc.id);
          batch.update(ref, {
            standardHours: template.hours,
            appliedTemplate,
            updatedAt: new Date().toISOString(),
            updatedBy: authUser.uid,
          });
          results.push({ id: loc.id, success: true });
        } catch (err) {
          results.push({ id: loc.id, success: false, error: (err as Error).message });
        }
      }

      await batch.commit();

      const appliedCount = results.filter(r => r.success).length;
      if (appliedCount > 0) {
        await addAuditEntry(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'update',
          entityType: 'hours-template' as AuditLogEntry['entityType'],
          entityId: id,
          entityName: template.name,
          changes: [
            { field: 'bulk-apply', newValue: `Applied to ${appliedCount} locations` },
            { field: 'templateVersion', newValue: template.version },
            { field: 'filters', newValue: JSON.stringify(filters || {}) },
          ],
        });
      }

      return res.json({
        data: {
          success: true,
          appliedCount,
          failedCount: results.filter(r => !r.success).length,
          results,
        },
      });
    } catch (error) {
      console.error('Bulk apply hours template error:', error);
      return res.status(500).json({
        error: { code: 'bulk_apply_error', message: 'Failed to bulk apply hours template', requestId: res.locals.requestId },
      });
    }
  });

  // Delete unused template (Admin/Steward only) - fails if in use
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!hasPermission(authUser, 'edit:hours').allowed) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward or Admin can delete hours templates', requestId: res.locals.requestId },
        });
      }

      const { id } = req.params;
      const doc = await db.collection('hoursTemplates').doc(id).get();
      
      if (!doc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Template not found', requestId: res.locals.requestId },
        });
      }

      // Check if any location is using this template
      const usageSnap = await db.collection('locations')
        .where('appliedTemplate.templateId', '==', id)
        .limit(1)
        .get();

      if (!usageSnap.empty) {
        const usingLocation = usageSnap.docs[0].data() as Location;
        return res.status(409).json({
          error: {
            code: 'template_in_use',
            message: `Template is in use by ${usingLocation.storeNumber || 'a location'}. Archive it instead of deleting.`,
            requestId: res.locals.requestId,
          },
        });
      }

      const templateData = doc.data() as HoursTemplate;
      
      await db.collection('hoursTemplates').doc(id).delete();

      await addAuditEntry(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'delete',
        entityType: 'hours-template' as AuditLogEntry['entityType'],
        entityId: id,
        entityName: templateData.name,
        changes: [{ field: 'deleted', oldValue: templateData.name }],
      });

      return res.json({ data: { success: true } });
    } catch (error) {
      console.error('Delete hours template error:', error);
      return res.status(500).json({
        error: { code: 'delete_error', message: 'Failed to delete hours template', requestId: res.locals.requestId },
      });
    }
  });

  return router;
}

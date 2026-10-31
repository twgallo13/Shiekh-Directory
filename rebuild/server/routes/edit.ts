import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  Location,
  Closure,
  AuthUser,
  AuditLogEntry,
  AuditChange,
  Correction,
} from '../../src/types';
import { isValidStoreTypeCode } from '../../src/types';
import { hasPermission, canEditLocation } from '../../src/lib/permissions';
import { normalizePhoneNumber } from '../utils/phone';

export function createEditRouter(db: Firestore): Router {
  const router = Router();

  router.patch('/locations/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;
      const { changes, expectedVersion } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const locationRef = db.collection('locations').doc(id);
      const locationDoc = await locationRef.get();

      if (!locationDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Location not found', requestId: res.locals.requestId },
        });
      }

      const location = { id: locationDoc.id, ...locationDoc.data() } as Location;

      if (expectedVersion !== undefined && location.version !== expectedVersion) {
        return res.status(409).json({
          error: {
            code: 'version_conflict',
            message: 'This record was modified by someone else. Please reload and try again.',
            requestId: res.locals.requestId,
          },
        });
      }

      const permissions = canEditLocation(authUser, id);
      const auditChanges: AuditChange[] = [];
      const updateData: Record<string, unknown> = {};
      let requiresApproval = false;
      const proposedChanges: Record<string, unknown> = {};
      const currentValues: Record<string, unknown> = {};

      for (const [field, value] of Object.entries(changes)) {
        switch (field) {
          case 'mainPhone':
          case 'address':
          case 'sharedInboxEmail':
            if (permissions.contactInfo === true) {
              if (field === 'mainPhone') {
                const normalized = normalizePhoneNumber(value as string);
                if (!normalized) {
                  return res.status(400).json({
                    error: { code: 'invalid_phone', message: 'Invalid phone number', requestId: res.locals.requestId },
                  });
                }
                updateData[field] = normalized;
                auditChanges.push({ field, oldValue: location.mainPhone ?? null, newValue: normalized });
              } else if (field === 'address') {
                updateData[field] = value;
                auditChanges.push({ field, oldValue: JSON.stringify(location.address ?? null), newValue: JSON.stringify(value) });
              } else {
                updateData[field] = value || null;
                auditChanges.push({ field, oldValue: location.sharedInboxEmail ?? null, newValue: (value as string) || null });
              }
            } else if (permissions.contactInfo === 'propose-only') {
              requiresApproval = true;
              proposedChanges[field] = value;
              currentValues[field] = location[field as keyof Location];
            } else {
              return res.status(403).json({
                error: { code: 'forbidden', message: `You don't have permission to edit ${field}`, requestId: res.locals.requestId },
              });
            }
            break;

          case 'standardHours':
            if (permissions.hours) {
              updateData[field] = value;
              auditChanges.push({ field, oldValue: 'hours changed', newValue: 'hours updated' });
            } else if (hasPermission(authUser, 'edit:hours', id).scope === 'propose-only') {
              requiresApproval = true;
              proposedChanges[field] = value;
              currentValues[field] = location.standardHours;
            } else {
              return res.status(403).json({
                error: { code: 'forbidden', message: `You don't have permission to edit hours`, requestId: res.locals.requestId },
              });
            }
            break;

          case 'name':
          case 'mallOrCenterName':
            if (authUser.role === 'Steward' || authUser.role === 'Admin') {
              updateData[field] = value;
              auditChanges.push({ field, oldValue: (location[field as keyof Location] as string) ?? null, newValue: value as string });
            } else {
              return res.status(403).json({
                error: { code: 'forbidden', message: `Only Steward or Admin can edit ${field}`, requestId: res.locals.requestId },
              });
            }
            break;

          case 'storeType':
            if (authUser.role === 'Steward' || authUser.role === 'Admin') {
              if (value && !isValidStoreTypeCode(value as string)) {
                return res.status(400).json({
                  error: { code: 'invalid_store_type', message: 'Invalid store type code', requestId: res.locals.requestId },
                });
              }
              updateData[field] = value || null;
              auditChanges.push({ field, oldValue: (location.storeType as string) ?? null, newValue: (value as string) || null });
            } else {
              return res.status(403).json({
                error: { code: 'forbidden', message: 'Only Steward or Admin can edit store type', requestId: res.locals.requestId },
              });
            }
            break;

          case 'wayfindingDirections':
            if (authUser.role === 'Steward' || authUser.role === 'Admin') {
              updateData[field] = value;
              auditChanges.push({ field, oldValue: (location.wayfindingDirections as string) ?? null, newValue: value as string });
            } else if (authUser.role === 'Store' && authUser.storeLocationId === id) {
              requiresApproval = true;
              proposedChanges[field] = value;
              currentValues[field] = location.wayfindingDirections;
            } else {
              return res.status(403).json({
                error: { code: 'forbidden', message: `You don't have permission to edit directions`, requestId: res.locals.requestId },
              });
            }
            break;

          case 'kind':
            if (authUser.role === 'Steward' || authUser.role === 'Admin') {
              const validKinds = ['store', 'warehouse', 'office'];
              if (!validKinds.includes(value as string)) {
                return res.status(400).json({
                  error: { code: 'invalid_kind', message: 'Kind must be store, warehouse, or office', requestId: res.locals.requestId },
                });
              }
              updateData[field] = value;
              auditChanges.push({ field, oldValue: location.kind ?? null, newValue: value as string });
            } else {
              return res.status(403).json({
                error: { code: 'forbidden', message: 'Only Steward or Admin can change location kind', requestId: res.locals.requestId },
              });
            }
            break;

          default:
            return res.status(400).json({
              error: { code: 'invalid_field', message: `Cannot edit field: ${field}`, requestId: res.locals.requestId },
            });
        }
      }

      if (requiresApproval && Object.keys(proposedChanges).length > 0) {
        const correctionRef = db.collection('corrections').doc();
        // Determine type and category from the proposed changes
        const hasPhone = Object.keys(proposedChanges).includes('mainPhone');
        const hasAddress = Object.keys(proposedChanges).includes('address');
        const hasInbox = Object.keys(proposedChanges).includes('sharedInboxEmail');
        const hasDirections = Object.keys(proposedChanges).includes('wayfindingDirections');
        const type = hasPhone ? 'phone' : hasAddress ? 'address' : hasInbox ? 'inbox' : 'hours';
        const category = hasPhone ? 'phone' : hasDirections ? 'directions' : hasAddress ? 'address' : hasInbox ? 'other' : 'hours';
        
        const correction: Omit<Correction, 'id'> = {
          status: 'pending',
          type,
          category,
          locationId: id,
          locationName: location.name,
          storeNumber: location.storeNumber,
          submittedBy: authUser.uid,
          submittedByEmail: authUser.email,
          submittedByRole: authUser.role,
          submittedAt: new Date().toISOString(),
          proposedChanges,
          currentValues,
          locationVersion: location.version,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: authUser.uid,
          version: 1,
        };

        await correctionRef.set(correction);

        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'create',
          entityType: 'correction',
          entityId: correctionRef.id,
          entityName: `Correction for ${location.storeNumber}`,
          changes: [{ field: 'status', newValue: 'pending' }],
        });

        if (Object.keys(updateData).length === 0) {
          return res.json({
            data: {
              updated: false,
              correctionCreated: true,
              correctionId: correctionRef.id,
              message: 'Your changes have been submitted for approval.',
            },
          });
        }
      }

      if (Object.keys(updateData).length > 0) {
        updateData.updatedAt = new Date().toISOString();
        updateData.updatedBy = authUser.uid;
        updateData.version = (location.version || 0) + 1;

        await locationRef.update(updateData);

        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'update',
          entityType: 'location',
          entityId: id,
          entityName: `${location.storeNumber} ${location.name}`,
          changes: auditChanges,
          previousVersion: location.version,
          newVersion: updateData.version as number,
        });

        return res.json({
          data: {
            updated: true,
            newVersion: updateData.version,
            correctionCreated: requiresApproval,
          },
        });
      }

      return res.json({ data: { updated: false } });
    } catch (error) {
      console.error('Edit location error:', error);
      return res.status(500).json({
        error: { code: 'edit_error', message: 'Failed to edit location', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/locations/:id/closures', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;
      const { reason, reasonCode, reasonNote, publicExplanation, type, endsAt, ownerId, ownerName, nextReviewDate } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const permissions = canEditLocation(authUser, id);
      if (!permissions.closure) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'You don\'t have permission to add closures', requestId: res.locals.requestId },
        });
      }

      const locationDoc = await db.collection('locations').doc(id).get();
      if (!locationDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Location not found', requestId: res.locals.requestId },
        });
      }

      const location = locationDoc.data() as Location;

      if (!reason?.trim()) {
        return res.status(400).json({
          error: { code: 'invalid_reason', message: 'Reason is required', requestId: res.locals.requestId },
        });
      }

      // Validate reasonCode if provided
      const validReasonCodes = ['ac_hvac', 'power', 'mall_landlord', 'safety', 'weather', 'staffing', 'maintenance', 'remodel', 'relocation', 'other'];
      if (reasonCode && !validReasonCodes.includes(reasonCode)) {
        return res.status(400).json({
          error: { code: 'invalid_reason_code', message: 'Invalid reason code', requestId: res.locals.requestId },
        });
      }

      // Require note for 'other' reason code
      if (reasonCode === 'other' && !reasonNote?.trim()) {
        return res.status(400).json({
          error: { code: 'note_required', message: 'A note is required when reason is "other"', requestId: res.locals.requestId },
        });
      }

      // Calculate endsAt based on closure type
      let calculatedEndsAt = endsAt;
      let expiryUnresolved = false;
      const closureType = type || 'same_day';
      
      // Fail-closed safety: require timezone for same-day closures
      if (closureType === 'same_day' && !endsAt) {
        const timeZone = location.timeZone;
        
        if (!timeZone) {
          // Fail-closed: reject closure creation if no timezone
          return res.status(400).json({
            error: { 
              code: 'missing_timezone', 
              message: 'Cannot create same-day closure: store has no timezone configured. Please set a timezone first, or use a multi-day closure with an explicit end date.',
              requestId: res.locals.requestId,
            },
          });
        }
        
        try {
          const now = new Date();
          // Get today's date in the store's timezone and calculate next midnight
          const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
          const localDate = formatter.format(now);
          const midnight = new Date(`${localDate}T23:59:59`);
          // Convert to UTC
          const tzOffset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value || '';
          const offsetMatch = tzOffset.match(/GMT([+-]\d+)/);
          const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : 0;
          const utcMidnight = new Date(midnight.getTime() - offsetHours * 60 * 60 * 1000);
          calculatedEndsAt = utcMidnight.toISOString();
        } catch {
          // If timezone is invalid, reject rather than defaulting
          return res.status(400).json({
            error: { 
              code: 'invalid_timezone', 
              message: 'Cannot create same-day closure: store timezone is invalid. Please correct the timezone first.',
              requestId: res.locals.requestId,
            },
          });
        }
      }

      // Require owner and review date for unknown_end closures
      if (closureType === 'unknown_end' && !nextReviewDate) {
        return res.status(400).json({
          error: { code: 'review_date_required', message: 'Next review date is required for unknown-end closures', requestId: res.locals.requestId },
        });
      }

      const closureRef = db.collection(`locations/${id}/closures`).doc();
      const closure: Omit<Closure, 'id'> = {
        reason: reason.trim(),
        type: closureType,
        reasonCode: reasonCode || undefined,
        reasonNote: reasonNote?.trim() || undefined,
        publicExplanation: publicExplanation?.trim() || undefined,
        startsAt: new Date().toISOString(),
        endsAt: calculatedEndsAt || undefined,
        expiryUnresolved,
        status: 'active',
        createdBy: authUser.uid,
        createdByEmail: authUser.email,
        ownerId: ownerId || undefined,
        ownerName: ownerName || undefined,
        nextReviewDate: nextReviewDate || undefined,
      };

      await closureRef.set(closure);

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'closure:start',
        entityType: 'closure',
        entityId: closureRef.id,
        entityName: `Closure for ${location.storeNumber}`,
        locationId: id,
        changes: [
          { field: 'reason', newValue: reason },
          { field: 'status', newValue: 'active' },
        ],
      });

      return res.json({ data: { id: closureRef.id, ...closure } });
    } catch (error) {
      console.error('Add closure error:', error);
      return res.status(500).json({
        error: { code: 'closure_error', message: 'Failed to add closure', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/locations/:locationId/closures/:closureId/end', async (req: Request, res: Response) => {
    try {
      const { locationId, closureId } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const permissions = canEditLocation(authUser, locationId);
      if (!permissions.closure) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'You don\'t have permission to end closures', requestId: res.locals.requestId },
        });
      }

      const closureRef = db.collection(`locations/${locationId}/closures`).doc(closureId);
      const closureDoc = await closureRef.get();

      if (!closureDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Closure not found', requestId: res.locals.requestId },
        });
      }

      const closure = closureDoc.data() as Closure;
      if (closure.status !== 'active') {
        return res.status(400).json({
          error: { code: 'invalid_status', message: 'Closure is not active', requestId: res.locals.requestId },
        });
      }

      await closureRef.update({ status: 'ended' });

      const locationDoc = await db.collection('locations').doc(locationId).get();
      const location = locationDoc.data() as Location;

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'closure:end',
        entityType: 'closure',
        entityId: closureId,
        entityName: `Closure for ${location?.storeNumber || locationId}`,
        locationId,
        changes: [{ field: 'status', oldValue: 'active', newValue: 'ended' }],
      });

      return res.json({ data: { success: true } });
    } catch (error) {
      console.error('End closure error:', error);
      return res.status(500).json({
        error: { code: 'closure_error', message: 'Failed to end closure', requestId: res.locals.requestId },
      });
    }
  });

  router.patch('/locations/:locationId/closures/:closureId', async (req: Request, res: Response) => {
    try {
      const { locationId, closureId } = req.params;
      const authUser = res.locals.authUser as AuthUser;
      const { status } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const permissions = canEditLocation(authUser, locationId);
      if (!permissions.closure) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'You don\'t have permission to edit closures', requestId: res.locals.requestId },
        });
      }

      const closureRef = db.collection(`locations/${locationId}/closures`).doc(closureId);
      const closureDoc = await closureRef.get();

      if (!closureDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Closure not found', requestId: res.locals.requestId },
        });
      }

      const closure = closureDoc.data() as Closure;

      if (status === 'ended' && closure.status === 'active') {
        await closureRef.update({ status: 'ended' });

        const locationDoc = await db.collection('locations').doc(locationId).get();
        const location = locationDoc.data() as Location;

        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'closure:end',
          entityType: 'closure',
          entityId: closureId,
          entityName: `Closure for ${location?.storeNumber || locationId}`,
          locationId,
          changes: [{ field: 'status', oldValue: 'active', newValue: 'ended' }],
        });

        return res.json({ data: { success: true } });
      }

      return res.status(400).json({
        error: { code: 'invalid_status', message: 'Invalid status transition', requestId: res.locals.requestId },
      });
    } catch (error) {
      console.error('Update closure error:', error);
      return res.status(500).json({
        error: { code: 'closure_error', message: 'Failed to update closure', requestId: res.locals.requestId },
      });
    }
  });

  // Renew a same-day closure (extends to next local midnight)
  router.post('/locations/:locationId/closures/:closureId/renew', async (req: Request, res: Response) => {
    try {
      const { locationId, closureId } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const permissions = canEditLocation(authUser, locationId);
      if (!permissions.closure) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'You don\'t have permission to renew closures', requestId: res.locals.requestId },
        });
      }

      const closureRef = db.collection(`locations/${locationId}/closures`).doc(closureId);
      const closureDoc = await closureRef.get();

      if (!closureDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Closure not found', requestId: res.locals.requestId },
        });
      }

      const closure = closureDoc.data() as Closure;
      if (closure.status !== 'active') {
        return res.status(400).json({
          error: { code: 'invalid_status', message: 'Closure is not active', requestId: res.locals.requestId },
        });
      }

      if (closure.type && closure.type !== 'same_day') {
        return res.status(400).json({
          error: { code: 'not_renewable', message: 'Only same-day closures can be renewed', requestId: res.locals.requestId },
        });
      }

      const locationDoc = await db.collection('locations').doc(locationId).get();
      const location = locationDoc.data() as Location;

      // Calculate new endsAt as next local midnight after the current expiry
      // This extends the closure by one day, not to today's midnight
      const timeZone = location?.timeZone;
      
      // Fail-closed safety: if no timezone, reject the renewal
      if (!timeZone) {
        return res.status(400).json({
          error: { 
            code: 'missing_timezone', 
            message: 'Cannot renew closure: store has no timezone configured. Please set a timezone first.',
            requestId: res.locals.requestId,
          },
        });
      }
      
      let newEndsAt: string;
      try {
        // Start from the current expiry, or now if no expiry
        const baseDate = closure.endsAt ? new Date(closure.endsAt) : new Date();
        // Add one day to get the next midnight
        const nextDay = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
        
        // Get the date in the store's timezone
        const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
        const localDate = formatter.format(nextDay);
        
        // Calculate midnight in the store's timezone
        const tzOffset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(nextDay).find(p => p.type === 'timeZoneName')?.value || '';
        const offsetMatch = tzOffset.match(/GMT([+-]\d+)/);
        const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : 0;
        
        // Create midnight in local time, then convert to UTC
        const midnightLocal = new Date(`${localDate}T23:59:59`);
        const utcMidnight = new Date(midnightLocal.getTime() - offsetHours * 60 * 60 * 1000);
        newEndsAt = utcMidnight.toISOString();
      } catch {
        return res.status(400).json({
          error: { code: 'invalid_timezone', message: 'Could not calculate midnight due to invalid timezone', requestId: res.locals.requestId },
        });
      }

      await closureRef.update({
        endsAt: newEndsAt,
        renewedAt: new Date().toISOString(),
        renewedBy: authUser.uid,
        renewalCount: (closure.renewalCount || 0) + 1,
      });

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'closure',
        entityId: closureId,
        entityName: `Closure for ${location?.storeNumber || locationId}`,
        locationId,
        changes: [
          { field: 'endsAt', oldValue: closure.endsAt, newValue: newEndsAt },
          { field: 'renewalCount', oldValue: closure.renewalCount || 0, newValue: (closure.renewalCount || 0) + 1 },
        ],
      });

      return res.json({ data: { success: true, newEndsAt } });
    } catch (error) {
      console.error('Renew closure error:', error);
      return res.status(500).json({
        error: { code: 'closure_error', message: 'Failed to renew closure', requestId: res.locals.requestId },
      });
    }
  });

  return router;
}

async function logAudit(
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

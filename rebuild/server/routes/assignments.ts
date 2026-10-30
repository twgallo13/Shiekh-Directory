import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  Assignment,
  AuthUser,
  AuditLogEntry,
  AuditChange,
  Location,
  District,
  Region,
} from '../../src/types';
import { canEditLocation } from '../../src/lib/permissions';
import { isAssignmentActive, getLocalDate } from '../utils/assignment';

export function createAssignmentsRouter(db: Firestore): Router {
  const router = Router();

  router.get('/location/:locationId', async (req: Request, res: Response) => {
    try {
      const { locationId } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const locationDoc = await db.collection('locations').doc(locationId).get();
      const location = locationDoc.exists ? (locationDoc.data() as Location) : null;
      const localDate = getLocalDate(location?.timeZone);
      
      const snapshot = await db.collection('assignments')
        .where('scopeType', '==', 'location')
        .where('scopeId', '==', locationId)
        .get();

      const assignments = [];
      for (const doc of snapshot.docs) {
        const assignment = { id: doc.id, ...doc.data() } as Assignment;
        const isActive = isAssignmentActive(assignment, localDate);
        
        const personDoc = await db.collection('people').doc(assignment.personId).get();
        const personName = personDoc.exists ? personDoc.data()?.fullName : 'Unknown';

        assignments.push({
          ...assignment,
          personName,
          isActive,
        });
      }

      return res.json({ data: assignments });
    } catch (error) {
      console.error('List assignments error:', error);
      return res.status(500).json({
        error: { code: 'list_error', message: 'Failed to list assignments', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { personId, role, scopeType, scopeId, slot, label, startDate } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!personId || !role || !scopeType || !scopeId || !slot) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'Missing required fields', requestId: res.locals.requestId },
        });
      }

      if (scopeType === 'location') {
        const editPerms = canEditLocation(authUser, scopeId);
        if (!editPerms.assignments) {
          return res.status(403).json({
            error: { code: 'forbidden', message: 'You do not have permission to manage assignments for this location', requestId: res.locals.requestId },
          });
        }
      } else if (authUser.role !== 'Steward' && authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward or Admin can manage district/region assignments', requestId: res.locals.requestId },
        });
      }

      const personDoc = await db.collection('people').doc(personId).get();
      if (!personDoc.exists) {
        return res.status(400).json({
          error: { code: 'invalid_person', message: 'Person not found', requestId: res.locals.requestId },
        });
      }

      const scopeName = await getScopeName(db, scopeType, scopeId);
      const personName = personDoc.data()?.fullName;

      const assignmentRef = db.collection('assignments').doc();
      const now = new Date().toISOString();
      const assignment: Omit<Assignment, 'id'> = {
        personId,
        role,
        scopeType,
        scopeId,
        slot,
        label: label || undefined,
        startDate: startDate || now.slice(0, 10),
        createdAt: now,
        updatedAt: now,
        updatedBy: authUser.uid,
        version: 1,
      };

      await assignmentRef.set(assignment);

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'assign',
        entityType: 'assignment',
        entityId: assignmentRef.id,
        entityName: `${personName} as ${role} at ${scopeName}`,
        locationId: scopeType === 'location' ? scopeId : null,
        changes: [
          { field: 'role', newValue: role },
          { field: 'slot', newValue: slot },
          { field: 'scope', newValue: `${scopeType}:${scopeName}` },
        ],
      });

      return res.status(201).json({
        data: { id: assignmentRef.id, ...assignment },
      });
    } catch (error) {
      console.error('Create assignment error:', error);
      return res.status(500).json({
        error: { code: 'create_error', message: 'Failed to create assignment', requestId: res.locals.requestId },
      });
    }
  });

  router.patch('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;
      const { slot, label, endDate } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const assignmentRef = db.collection('assignments').doc(id);
      const assignmentDoc = await assignmentRef.get();

      if (!assignmentDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Assignment not found', requestId: res.locals.requestId },
        });
      }

      const assignment = { id: assignmentDoc.id, ...assignmentDoc.data() } as Assignment;

      if (assignment.scopeType === 'location') {
        const editPerms = canEditLocation(authUser, assignment.scopeId);
        if (!editPerms.assignments) {
          return res.status(403).json({
            error: { code: 'forbidden', message: 'You do not have permission to manage this assignment', requestId: res.locals.requestId },
          });
        }
      } else if (authUser.role !== 'Steward' && authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward or Admin can manage district/region assignments', requestId: res.locals.requestId },
        });
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        version: (assignment.version || 0) + 1,
      };
      const changes: AuditChange[] = [];

      if (slot !== undefined && slot !== assignment.slot) {
        updates.slot = slot;
        changes.push({ field: 'slot', oldValue: assignment.slot ?? null, newValue: slot });
      }

      if (label !== undefined && label !== assignment.label) {
        updates.label = label || null;
        changes.push({ field: 'label', oldValue: assignment.label ?? null, newValue: label || null });
      }

      if (endDate !== undefined && endDate !== assignment.endDate) {
        updates.endDate = endDate || null;
        changes.push({ field: 'endDate', oldValue: assignment.endDate ?? null, newValue: endDate || null });
      }

      if (changes.length === 0) {
        return res.json({ data: assignment });
      }

      await assignmentRef.update(updates);

      const personDoc = await db.collection('people').doc(assignment.personId).get();
      const personName = personDoc.exists ? personDoc.data()?.fullName : 'Unknown';
      const scopeName = await getScopeName(db, assignment.scopeType, assignment.scopeId);

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: endDate ? 'unassign' : 'update',
        entityType: 'assignment',
        entityId: id,
        entityName: `${personName} as ${assignment.role} at ${scopeName}`,
        locationId: assignment.scopeType === 'location' ? assignment.scopeId : null,
        changes,
      });

      return res.json({
        data: { ...assignment, ...updates },
      });
    } catch (error) {
      console.error('Update assignment error:', error);
      return res.status(500).json({
        error: { code: 'update_error', message: 'Failed to update assignment', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/:id/end', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;
      const { endDate } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const assignmentRef = db.collection('assignments').doc(id);
      const assignmentDoc = await assignmentRef.get();

      if (!assignmentDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Assignment not found', requestId: res.locals.requestId },
        });
      }

      const assignment = { id: assignmentDoc.id, ...assignmentDoc.data() } as Assignment;

      if (assignment.scopeType === 'location') {
        const editPerms = canEditLocation(authUser, assignment.scopeId);
        if (!editPerms.assignments) {
          return res.status(403).json({
            error: { code: 'forbidden', message: 'You do not have permission to end this assignment', requestId: res.locals.requestId },
          });
        }
      } else if (authUser.role !== 'Steward' && authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward or Admin can end district/region assignments', requestId: res.locals.requestId },
        });
      }

      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      
      const personDoc = await db.collection('people').doc(assignment.personId).get();
      const personName = personDoc.exists ? personDoc.data()?.fullName : 'Unknown';
      const scopeName = await getScopeName(db, assignment.scopeType, assignment.scopeId);
      
      if (assignment.startDate > today) {
        await assignmentRef.delete();
        
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'delete',
          entityType: 'assignment',
          entityId: id,
          entityName: `${personName} as ${assignment.role} at ${scopeName}`,
          locationId: assignment.scopeType === 'location' ? assignment.scopeId : null,
          changes: [
            { field: 'deleted', oldValue: null, newValue: 'Assignment never started, deleted' },
          ],
        });
        
        return res.json({
          data: { deleted: true, reason: 'Assignment had not started yet' },
        });
      }
      
      const effectiveEndDate = endDate || (assignment.startDate > yesterdayStr ? assignment.startDate : yesterdayStr);
      const endedAtTimestamp = now.toISOString();
      
      await assignmentRef.update({
        endDate: effectiveEndDate,
        endedAt: endedAtTimestamp,
        updatedAt: endedAtTimestamp,
        updatedBy: authUser.uid,
        version: (assignment.version || 0) + 1,
      });

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'unassign',
        entityType: 'assignment',
        entityId: id,
        entityName: `${personName} as ${assignment.role} at ${scopeName}`,
        locationId: assignment.scopeType === 'location' ? assignment.scopeId : null,
        changes: [
          { field: 'endDate', oldValue: assignment.endDate ?? null, newValue: effectiveEndDate },
          { field: 'endedAt', oldValue: null, newValue: endedAtTimestamp },
        ],
      });

      return res.json({
        data: { ...assignment, endDate: effectiveEndDate, endedAt: endedAtTimestamp },
      });
    } catch (error) {
      console.error('End assignment error:', error);
      return res.status(500).json({
        error: { code: 'end_error', message: 'Failed to end assignment', requestId: res.locals.requestId },
      });
    }
  });

  return router;
}

async function getScopeName(db: Firestore, scopeType: string, scopeId: string): Promise<string> {
  try {
    if (scopeType === 'location') {
      const doc = await db.collection('locations').doc(scopeId).get();
      if (doc.exists) {
        const loc = doc.data() as Location;
        return `#${loc.storeNumber} ${loc.name}`;
      }
    } else if (scopeType === 'district') {
      const doc = await db.collection('districts').doc(scopeId).get();
      if (doc.exists) {
        const district = doc.data() as District;
        return district.name;
      }
    } else if (scopeType === 'region') {
      const doc = await db.collection('regions').doc(scopeId).get();
      if (doc.exists) {
        const region = doc.data() as Region;
        return region.name;
      }
    }
    return scopeId;
  } catch {
    return scopeId;
  }
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

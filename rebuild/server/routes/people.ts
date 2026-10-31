import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  Person,
  Assignment,
  AuthUser,
  PersonDetail,
  PersonAssignment,
  PersonListItem,
  Location,
  District,
  Region,
  AuditLogEntry,
} from '../../src/types';
import { isAssignmentActive, getLocalDate } from '../utils/assignment';
import { normalizePhoneNumber } from '../utils/phone';

function canManagePeople(role: string): boolean {
  return ['Steward', 'Admin'].includes(role);
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

export function createPeopleRouter(db: Firestore): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const { search, lifecycle } = req.query;
      const filterLifecycle = lifecycle === 'all' ? null : (lifecycle as string) || 'active';

      let query = db.collection('people').orderBy('fullName');

      if (filterLifecycle) {
        query = query.where('lifecycle', '==', filterLifecycle);
      }

      const snapshot = await query.get();
      const people: PersonListItem[] = [];

      for (const doc of snapshot.docs) {
        const person = { id: doc.id, ...doc.data() } as Person;

        if (search) {
          const searchLower = (search as string).toLowerCase();
          const nameMatch = person.fullName.toLowerCase().includes(searchLower);
          const emailMatch = person.workEmail?.toLowerCase().includes(searchLower);
          if (!nameMatch && !emailMatch) continue;
        }

        const assignmentSnap = await db.collection('assignments')
          .where('personId', '==', doc.id)
          .limit(1)
          .get();

        let primaryRole: string | undefined;
        let primaryScopeName: string | undefined;

        if (!assignmentSnap.empty) {
          const assignment = assignmentSnap.docs[0].data() as Assignment;
          const localDate = getLocalDate();
          
          if (isAssignmentActive(assignment, localDate)) {
            primaryRole = assignment.role;
            primaryScopeName = await getScopeName(db, assignment.scopeType, assignment.scopeId);
          }
        }

        people.push({
          id: person.id,
          fullName: person.fullName,
          workEmail: person.workEmail,
          lifecycle: person.lifecycle,
          primaryRole,
          primaryScopeName,
        });
      }

      return res.json({ data: people });
    } catch (error) {
      console.error('List people error:', error);
      return res.status(500).json({
        error: { code: 'list_error', message: 'Failed to list people', requestId: res.locals.requestId },
      });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const personDoc = await db.collection('people').doc(id).get();

      if (!personDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Person not found', requestId: res.locals.requestId },
        });
      }

      const person = { id: personDoc.id, ...personDoc.data() } as Person;
      const localDate = getLocalDate();

      const assignmentsSnap = await db.collection('assignments')
        .where('personId', '==', id)
        .get();

      const assignments: PersonAssignment[] = [];

      for (const doc of assignmentsSnap.docs) {
        const assignment = doc.data() as Assignment;
        const isActive = isAssignmentActive(assignment, localDate);
        const scopeName = await getScopeName(db, assignment.scopeType, assignment.scopeId);

        assignments.push({
          id: doc.id,
          role: assignment.role,
          scopeType: assignment.scopeType,
          scopeId: assignment.scopeId,
          scopeName,
          slot: assignment.slot,
          label: assignment.label,
          startDate: assignment.startDate,
          endDate: assignment.endDate,
          isActive,
        });
      }

      assignments.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.slot !== b.slot) return a.slot === 'primary' ? -1 : 1;
        return a.role.localeCompare(b.role);
      });

      const personDetail: PersonDetail = {
        ...person,
        assignments,
        activeAssignments: assignments.filter(a => a.isActive),
      };

      return res.json({ data: personDetail });
    } catch (error) {
      console.error('Get person error:', error);
      return res.status(500).json({
        error: { code: 'get_error', message: 'Failed to get person', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canManagePeople(authUser.role)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward and Admin can create people', requestId: res.locals.requestId },
        });
      }

      const { fullName, workEmail, workPhone, mobilePhone, homeLocationId } = req.body;

      if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'fullName is required', requestId: res.locals.requestId },
        });
      }

      if (workEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(workEmail)) {
          return res.status(400).json({
            error: { code: 'invalid_request', message: 'Invalid email format', requestId: res.locals.requestId },
          });
        }
      }

      const now = new Date().toISOString();
      const personRef = db.collection('people').doc();
      
      const normalizedWorkPhone = workPhone ? normalizePhoneNumber(workPhone) : undefined;
      const normalizedMobilePhone = mobilePhone ? normalizePhoneNumber(mobilePhone) : undefined;

      const person: Omit<Person, 'id'> = {
        fullName: fullName.trim(),
        lifecycle: 'active',
        workEmail: workEmail?.trim() || undefined,
        workPhone: normalizedWorkPhone || undefined,
        mobilePhone: normalizedMobilePhone || undefined,
        homeLocationId: homeLocationId || undefined,
        createdAt: now,
        updatedAt: now,
        updatedBy: authUser.uid,
        version: 1,
      };

      await personRef.set(person);

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'person',
        entityId: personRef.id,
        entityName: person.fullName,
        changes: [
          { field: 'fullName', newValue: person.fullName },
          { field: 'lifecycle', newValue: 'active' },
        ],
      });

      return res.status(201).json({
        data: { id: personRef.id, ...person },
      });
    } catch (error) {
      console.error('Create person error:', error);
      return res.status(500).json({
        error: { code: 'create_error', message: 'Failed to create person', requestId: res.locals.requestId },
      });
    }
  });

  router.patch('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canManagePeople(authUser.role)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward and Admin can update people', requestId: res.locals.requestId },
        });
      }

      const personDoc = await db.collection('people').doc(id).get();
      if (!personDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Person not found', requestId: res.locals.requestId },
        });
      }

      const currentPerson = personDoc.data() as Person;
      const { fullName, workEmail, workPhone, mobilePhone, homeLocationId, version } = req.body;

      if (version !== undefined && version !== currentPerson.version) {
        return res.status(409).json({
          error: { 
            code: 'version_conflict', 
            message: 'Person was modified by another user', 
            requestId: res.locals.requestId 
          },
        });
      }

      if (workEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(workEmail)) {
          return res.status(400).json({
            error: { code: 'invalid_request', message: 'Invalid email format', requestId: res.locals.requestId },
          });
        }
      }

      const changes: { field: string; oldValue?: string | null; newValue?: string | null }[] = [];
      const updateData: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        version: (currentPerson.version || 0) + 1,
      };

      if (fullName !== undefined && fullName !== currentPerson.fullName) {
        updateData.fullName = fullName.trim();
        changes.push({ field: 'fullName', oldValue: currentPerson.fullName, newValue: fullName.trim() });
      }

      if (workEmail !== undefined && workEmail !== currentPerson.workEmail) {
        updateData.workEmail = workEmail?.trim() || null;
        changes.push({ field: 'workEmail', oldValue: currentPerson.workEmail || null, newValue: workEmail?.trim() || null });
      }

      if (workPhone !== undefined) {
        const normalizedWorkPhone = workPhone ? normalizePhoneNumber(workPhone) : null;
        if (normalizedWorkPhone !== currentPerson.workPhone) {
          updateData.workPhone = normalizedWorkPhone;
          changes.push({ field: 'workPhone', oldValue: currentPerson.workPhone || null, newValue: normalizedWorkPhone });
        }
      }

      if (mobilePhone !== undefined) {
        const normalizedMobilePhone = mobilePhone ? normalizePhoneNumber(mobilePhone) : null;
        if (normalizedMobilePhone !== currentPerson.mobilePhone) {
          updateData.mobilePhone = normalizedMobilePhone;
          changes.push({ field: 'mobilePhone', oldValue: currentPerson.mobilePhone || null, newValue: normalizedMobilePhone });
        }
      }

      if (homeLocationId !== undefined && homeLocationId !== currentPerson.homeLocationId) {
        updateData.homeLocationId = homeLocationId || null;
        changes.push({ field: 'homeLocationId', oldValue: currentPerson.homeLocationId || null, newValue: homeLocationId || null });
      }

      if (changes.length === 0) {
        const { id: _id, ...personData } = currentPerson;
        return res.json({ data: { id, ...personData } });
      }

      await personDoc.ref.update(updateData);

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'person',
        entityId: id,
        entityName: (updateData.fullName as string) || currentPerson.fullName,
        previousVersion: currentPerson.version,
        newVersion: updateData.version as number,
        changes,
      });

      const updatedDoc = await db.collection('people').doc(id).get();
      return res.json({ data: { id, ...updatedDoc.data() } });
    } catch (error) {
      console.error('Update person error:', error);
      return res.status(500).json({
        error: { code: 'update_error', message: 'Failed to update person', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/:id/retire', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canManagePeople(authUser.role)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward and Admin can retire people', requestId: res.locals.requestId },
        });
      }

      const personDoc = await db.collection('people').doc(id).get();
      if (!personDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Person not found', requestId: res.locals.requestId },
        });
      }

      const currentPerson = personDoc.data() as Person;

      if (currentPerson.lifecycle === 'inactive') {
        return res.status(400).json({
          error: { code: 'already_retired', message: 'Person is already inactive', requestId: res.locals.requestId },
        });
      }

      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      const activeAssignments = await db.collection('assignments')
        .where('personId', '==', id)
        .get();

      const batch = db.batch();

      for (const doc of activeAssignments.docs) {
        const assignment = doc.data() as Assignment;
        if (isAssignmentActive(assignment, todayStr)) {
          batch.update(doc.ref, {
            endDate: todayStr,
            endedAt: now.toISOString(),
            updatedAt: now.toISOString(),
            updatedBy: authUser.uid,
          });
        }
      }

      batch.update(personDoc.ref, {
        lifecycle: 'inactive',
        updatedAt: now.toISOString(),
        updatedBy: authUser.uid,
        version: (currentPerson.version || 0) + 1,
      });

      await batch.commit();

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'person',
        entityId: id,
        entityName: currentPerson.fullName,
        changes: [
          { field: 'lifecycle', oldValue: 'active', newValue: 'inactive' },
        ],
      });

      return res.json({
        data: { id, retired: true, assignmentsEnded: activeAssignments.size },
      });
    } catch (error) {
      console.error('Retire person error:', error);
      return res.status(500).json({
        error: { code: 'retire_error', message: 'Failed to retire person', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/:id/reactivate', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canManagePeople(authUser.role)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward and Admin can reactivate people', requestId: res.locals.requestId },
        });
      }

      const personDoc = await db.collection('people').doc(id).get();
      if (!personDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Person not found', requestId: res.locals.requestId },
        });
      }

      const currentPerson = personDoc.data() as Person;

      if (currentPerson.lifecycle === 'active') {
        return res.status(400).json({
          error: { code: 'already_active', message: 'Person is already active', requestId: res.locals.requestId },
        });
      }

      const now = new Date().toISOString();

      await personDoc.ref.update({
        lifecycle: 'active',
        updatedAt: now,
        updatedBy: authUser.uid,
        version: (currentPerson.version || 0) + 1,
      });

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'person',
        entityId: id,
        entityName: currentPerson.fullName,
        changes: [
          { field: 'lifecycle', oldValue: 'inactive', newValue: 'active' },
        ],
      });

      const updatedDoc = await db.collection('people').doc(id).get();
      return res.json({ data: { id, ...updatedDoc.data() } });
    } catch (error) {
      console.error('Reactivate person error:', error);
      return res.status(500).json({
        error: { code: 'reactivate_error', message: 'Failed to reactivate person', requestId: res.locals.requestId },
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

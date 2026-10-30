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
} from '../../src/types';
import { isAssignmentActive, getLocalDate } from '../utils/assignment';

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

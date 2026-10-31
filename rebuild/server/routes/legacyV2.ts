import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import {
  requireAnyLegacyScope,
  requireLegacyScope,
  sendLegacyError,
  signCursor,
  verifyCursor,
  computeVersion,
  type ApiCredential,
} from '../middleware/legacyApiAuth';
import type { Location, Region, District, Person, Assignment } from '../../src/types';
import { isAssignmentActive, getLocalDate } from '../utils/assignment';
import { resolvePositionHolders } from '../utils/positionHolder';

const PERSONNEL_CONTRACT_VERSION = 'personnel-staffing-v2.1';
const SNAPSHOT_TTL_MS = 15 * 60_000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

interface SnapshotPayload {
  version: string;
  client: string;
  token: string;
  grants: string;
  at: string;
}

interface CursorPayload {
  snapshot: string;
  dataset: 'personnel' | 'location-staffing';
  after: string;
  limit: number;
}

export function createLegacyV2Router(db: Firestore): Router {
  const router = Router();

  router.get('/snapshot', requireAnyLegacyScope('personnel:read', 'staffing:read'), (req: Request, res: Response) => {
    if (Object.keys(req.query).length) {
      return sendLegacyError(res, 400, 'invalid_query', 'Snapshot creation takes no query parameters.');
    }

    const credential = res.locals.apiCredential as ApiCredential;
    const snapshotAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
    
    const snapshot = signCursor(
      {
        version: PERSONNEL_CONTRACT_VERSION,
        client: credential.clientId,
        token: credential.tokenVersionId,
        grants: computeVersion({ scopes: [...credential.scopes].sort(), version: credential.grantsVersion ?? 0 }),
        at: snapshotAt,
      } as SnapshotPayload,
      credential.cursorSigningKey,
      'personnel-v2'
    );

    res.json({
      snapshot,
      snapshotAt,
      expiresAt: new Date(Date.parse(snapshotAt) + SNAPSHOT_TTL_MS).toISOString(),
      contractVersion: PERSONNEL_CONTRACT_VERSION,
    });
  });

  router.get('/personnel/:id?', requireLegacyScope('personnel:read'), async (req: Request, res: Response) => {
    try {
      const isDetail = req.params.id !== undefined;
      const id = req.params.id;
      const credential = res.locals.apiCredential as ApiCredential;

      const allowed = isDetail ? ['snapshot'] : ['snapshot', 'cursor', 'limit'];
      if (Object.keys(req.query).some(key => !allowed.includes(key))) {
        return sendLegacyError(res, 400, 'invalid_query', 'A snapshot is required; only documented query parameters are accepted.');
      }
      if (typeof req.query.snapshot !== 'string') {
        return sendLegacyError(res, 400, 'invalid_query', 'A snapshot is required; only documented query parameters are accepted.');
      }

      if (isDetail && (!id || id.length > 1500)) {
        return sendLegacyError(res, 400, 'invalid_id', 'Use an exact canonical document ID.');
      }

      const limit = parsePageSize(req.query.limit);
      if (limit === null) {
        return sendLegacyError(res, 400, 'invalid_limit', 'limit must be an integer from 1 to 100.');
      }

      const snapshot = verifyCursor<SnapshotPayload>(req.query.snapshot, credential.cursorSigningKey, 'personnel-v2');
      if (!validateSnapshot(snapshot, credential)) {
        return sendLegacyError(res, 400, 'invalid_snapshot', 'Snapshot is invalid for this credential and authorization.');
      }

      const age = Date.now() - Date.parse(snapshot.at);
      if (age < 0 || age >= SNAPSHOT_TTL_MS) {
        return sendLegacyError(res, 409, 'snapshot_expired', 'Restart the complete full snapshot.');
      }

      let afterId: string | undefined;
      if (req.query.cursor !== undefined) {
        const cursor = verifyCursor<CursorPayload>(String(req.query.cursor), credential.cursorSigningKey, 'personnel-v2');
        if (!cursor || cursor.snapshot !== req.query.snapshot || cursor.dataset !== 'personnel' || cursor.limit !== limit) {
          return sendLegacyError(res, 400, 'invalid_cursor', 'Cursor does not match snapshot, dataset or page size.');
        }
        afterId = cursor.after;
      }

      if (isDetail) {
        const personDoc = await db.collection('people').doc(id!).get();
        if (!personDoc.exists) {
          return sendLegacyError(res, 404, 'record_not_found', 'No record has this canonical ID at the snapshot.');
        }
        const person = { id: personDoc.id, ...personDoc.data() } as Person;
        const locations = await getLocationsForPerson(db, person.id);
        const data = projectPerson(person, locations);
        
        return res.json({
          data,
          sync: { mode: 'full', snapshotAt: snapshot.at, contractVersion: PERSONNEL_CONTRACT_VERSION },
        });
      }

      let query = db.collection('people')
        .where('lifecycle', '==', 'active')
        .orderBy('__name__')
        .limit(limit + 1);

      if (afterId) {
        query = query.startAfter(afterId);
      }

      const peopleSnap = await query.get();
      const hasMore = peopleSnap.docs.length > limit;
      const peopleDocs = hasMore ? peopleSnap.docs.slice(0, limit) : peopleSnap.docs;

      const locationsSnap = await db.collection('locations').where('lifecycle', '==', 'active').get();
      const locations = locationsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Location));

      const data = peopleDocs.map(doc => {
        const person = { id: doc.id, ...doc.data() } as Person;
        return projectPerson(person, locations);
      });

      const nextCursor = hasMore
        ? signCursor(
            { snapshot: req.query.snapshot, dataset: 'personnel', after: peopleSnap.docs[limit].id, limit } as CursorPayload,
            credential.cursorSigningKey,
            'personnel-v2'
          )
        : null;

      res.json({
        data,
        pagination: { limit, nextCursor },
        sync: { mode: 'full', snapshotAt: snapshot.at, contractVersion: PERSONNEL_CONTRACT_VERSION },
      });
    } catch (error) {
      console.error('Legacy v2 personnel error:', error);
      sendLegacyError(res, 503, 'snapshot_unavailable', 'The pinned source snapshot could not be read. Do not reconcile partial results.');
    }
  });

  router.get('/location-staffing/:id?', requireLegacyScope('staffing:read'), async (req: Request, res: Response) => {
    try {
      const isDetail = req.params.id !== undefined;
      const id = req.params.id;
      const credential = res.locals.apiCredential as ApiCredential;

      const allowed = isDetail ? ['snapshot'] : ['snapshot', 'cursor', 'limit', 'kind'];
      if (Object.keys(req.query).some(key => !allowed.includes(key))) {
        return sendLegacyError(res, 400, 'invalid_query', 'A snapshot is required; only documented query parameters are accepted.');
      }
      if (typeof req.query.snapshot !== 'string') {
        return sendLegacyError(res, 400, 'invalid_query', 'A snapshot is required; only documented query parameters are accepted.');
      }

      if (isDetail && (!id || id.length > 1500)) {
        return sendLegacyError(res, 400, 'invalid_id', 'Use an exact canonical document ID.');
      }

      const limit = parsePageSize(req.query.limit);
      if (limit === null) {
        return sendLegacyError(res, 400, 'invalid_limit', 'limit must be an integer from 1 to 100.');
      }

      const snapshot = verifyCursor<SnapshotPayload>(req.query.snapshot, credential.cursorSigningKey, 'personnel-v2');
      if (!validateSnapshot(snapshot, credential)) {
        return sendLegacyError(res, 400, 'invalid_snapshot', 'Snapshot is invalid for this credential and authorization.');
      }

      const age = Date.now() - Date.parse(snapshot.at);
      if (age < 0 || age >= SNAPSHOT_TTL_MS) {
        return sendLegacyError(res, 409, 'snapshot_expired', 'Restart the complete full snapshot.');
      }

      let afterId: string | undefined;
      if (req.query.cursor !== undefined) {
        const cursor = verifyCursor<CursorPayload>(String(req.query.cursor), credential.cursorSigningKey, 'personnel-v2');
        if (!cursor || cursor.snapshot !== req.query.snapshot || cursor.dataset !== 'location-staffing' || cursor.limit !== limit) {
          return sendLegacyError(res, 400, 'invalid_cursor', 'Cursor does not match snapshot, dataset or page size.');
        }
        afterId = cursor.after;
      }

      const [regionsSnap, districtsSnap, peopleSnap, assignmentsSnap] = await Promise.all([
        db.collection('regions').where('lifecycle', '==', 'active').get(),
        db.collection('districts').where('lifecycle', '==', 'active').get(),
        db.collection('people').where('lifecycle', '==', 'active').get(),
        db.collection('assignments').get(),
      ]);

      const regions = new Map(regionsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Region]));
      const districts = new Map(districtsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as District]));
      const people = new Map(peopleSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Person]));
      const assignments = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment));

      if (isDetail) {
        const locationDoc = await db.collection('locations').doc(id!).get();
        if (!locationDoc.exists) {
          return sendLegacyError(res, 404, 'record_not_found', 'No record has this canonical ID at the snapshot.');
        }
        const location = { id: locationDoc.id, ...locationDoc.data() } as Location;
        const data = projectStaffing(location, people, regions, districts, assignments);
        
        return res.json({
          data,
          sync: { mode: 'full', snapshotAt: snapshot.at, contractVersion: PERSONNEL_CONTRACT_VERSION },
        });
      }

      const kindParam = req.query.kind;
      const kinds = kindParam 
        ? String(kindParam).split(',').map(k => k.trim()).filter(Boolean)
        : ['store'];
      
      const validKinds = ['store', 'warehouse', 'office'];
      if (!kinds.every(k => validKinds.includes(k))) {
        return sendLegacyError(res, 400, 'invalid_kind', `kind must be one or more of: ${validKinds.join(', ')}`);
      }

      let query = db.collection('locations')
        .where('lifecycle', '==', 'active')
        .where('kind', 'in', kinds)
        .orderBy('__name__')
        .limit(limit + 1);

      if (afterId) {
        query = query.startAfter(afterId);
      }

      const locationsSnap = await query.get();
      const hasMore = locationsSnap.docs.length > limit;
      const locationDocs = hasMore ? locationsSnap.docs.slice(0, limit) : locationsSnap.docs;

      const data = locationDocs.map(doc => {
        const location = { id: doc.id, ...doc.data() } as Location;
        return projectStaffing(location, people, regions, districts, assignments);
      });

      const nextCursor = hasMore
        ? signCursor(
            { snapshot: req.query.snapshot, dataset: 'location-staffing', after: locationsSnap.docs[limit].id, limit } as CursorPayload,
            credential.cursorSigningKey,
            'personnel-v2'
          )
        : null;

      res.json({
        data,
        pagination: { limit, nextCursor },
        sync: { mode: 'full', snapshotAt: snapshot.at, contractVersion: PERSONNEL_CONTRACT_VERSION },
      });
    } catch (error) {
      console.error('Legacy v2 location-staffing error:', error);
      sendLegacyError(res, 503, 'snapshot_unavailable', 'The pinned source snapshot could not be read. Do not reconcile partial results.');
    }
  });

  return router;
}

function validateSnapshot(snapshot: SnapshotPayload | null, credential: ApiCredential): snapshot is SnapshotPayload {
  if (!snapshot) return false;
  return (
    snapshot.version === PERSONNEL_CONTRACT_VERSION &&
    snapshot.client === credential.clientId &&
    snapshot.token === credential.tokenVersionId &&
    snapshot.grants === computeVersion({ scopes: [...credential.scopes].sort(), version: credential.grantsVersion ?? 0 }) &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(snapshot.at)
  );
}

async function getLocationsForPerson(db: Firestore, personId: string): Promise<Location[]> {
  const assignmentsSnap = await db.collection('assignments')
    .where('personId', '==', personId)
    .where('scopeType', '==', 'location')
    .get();

  const localDate = getLocalDate();
  const activeAssignments = assignmentsSnap.docs
    .map(d => ({ id: d.id, ...d.data() } as Assignment))
    .filter(a => isAssignmentActive(a, localDate));

  const locationIds = [...new Set(activeAssignments.map(a => a.scopeId))];
  if (locationIds.length === 0) return [];

  const locations: Location[] = [];
  for (const locId of locationIds) {
    const locDoc = await db.collection('locations').doc(locId).get();
    if (locDoc.exists) {
      locations.push({ id: locDoc.id, ...locDoc.data() } as Location);
    }
  }
  return locations;
}

function projectPerson(
  person: Person,
  locations: Location[]
): Record<string, unknown> {
  const issues: { code: string; field: string }[] = [];
  
  if (!person.fullName?.trim()) {
    issues.push({ code: 'invalid_name', field: 'fullName' });
  }

  const primaryLocation = person.homeLocationId
    ? locations.find(l => l.id === person.homeLocationId)
    : null;

  const supportedLocations = locations.filter(l => l.id !== person.homeLocationId);

  return {
    id: person.id,
    fullName: person.fullName?.trim() || null,
    lifecycle: person.lifecycle,
    primaryLocationId: primaryLocation?.id || null,
    supportedLocationIds: supportedLocations.map(l => l.id),
    issues,
  };
}

function projectStaffing(
  location: Location,
  people: Map<string, Person>,
  regions: Map<string, Region>,
  districts: Map<string, District>,
  assignments: Assignment[]
): Record<string, unknown> {
  const issues: { code: string; field: string }[] = [];
  const region = regions.get(location.regionId);
  const district = districts.get(location.districtId);
  const localDate = getLocalDate(location.timeZone);

  const locationAssignments = assignments.filter(a => 
    a.scopeType === 'location' && a.scopeId === location.id
  );

  const districtAssignments = assignments.filter(a =>
    a.scopeType === 'district' && a.scopeId === location.districtId
  );

  const regionAssignments = assignments.filter(a =>
    a.scopeType === 'region' && a.scopeId === location.regionId
  );

  const smAssignments = locationAssignments.filter(a => a.role === 'SM');
  const dmAssignments = districtAssignments.filter(a => a.role === 'DM');
  const rmAssignments = regionAssignments.filter(a => a.role === 'RM');
  const asmAssignments = locationAssignments.filter(a => a.role === 'ASM' && isAssignmentActive(a, localDate));
  const khAssignments = locationAssignments.filter(a => a.role === 'KH' && isAssignmentActive(a, localDate));

  const smResult = resolvePositionHolders(smAssignments, people, localDate);
  const dmResult = resolvePositionHolders(dmAssignments, people, localDate);
  const rmResult = resolvePositionHolders(rmAssignments, people, localDate);
  
  const smAssignment = smResult.primary ? smAssignments.find(a => a.personId === smResult.primary!.personId && isAssignmentActive(a, localDate)) : undefined;
  const dmAssignment = dmResult.primary ? dmAssignments.find(a => a.personId === dmResult.primary!.personId && isAssignmentActive(a, localDate)) : undefined;
  const rmAssignment = rmResult.primary ? rmAssignments.find(a => a.personId === rmResult.primary!.personId && isAssignmentActive(a, localDate)) : undefined;

  const resolvePerson = (personId: string | undefined, field: string): { personId: string; fullName: string | null; lifecycle: string; issues: { code: string; field: string }[] } | null => {
    if (!personId) return null;
    const person = people.get(personId);
    const personIssues: { code: string; field: string }[] = [];
    
    if (!person) {
      return { personId, fullName: null, lifecycle: 'unknown', issues: [{ code: 'missing_person', field }] };
    }
    
    if (!person.fullName?.trim()) {
      personIssues.push({ code: 'invalid_name', field });
    }
    if (person.lifecycle === 'inactive') {
      personIssues.push({ code: 'inactive_person', field });
    }

    return {
      personId: person.id,
      fullName: person.fullName?.trim() || null,
      lifecycle: person.lifecycle,
      issues: personIssues,
    };
  };

  const resolveHolder = (assignment: Assignment, field: string): { 
    personId: string; 
    fullName: string | null; 
    capacity: string;
    slot: string;
    issues: { code: string; field: string }[] 
  } | null => {
    const person = people.get(assignment.personId);
    const holderIssues: { code: string; field: string }[] = [];
    
    if (!person) {
      return { 
        personId: assignment.personId, 
        fullName: null, 
        capacity: assignment.capacity || 'primary',
        slot: assignment.slot,
        issues: [{ code: 'missing_person', field }] 
      };
    }
    
    if (!person.fullName?.trim()) {
      holderIssues.push({ code: 'invalid_name', field });
    }
    if (person.lifecycle === 'inactive') {
      holderIssues.push({ code: 'inactive_person', field });
    }

    return {
      personId: person.id,
      fullName: person.fullName?.trim() || null,
      capacity: assignment.capacity || 'primary',
      slot: assignment.slot,
      issues: holderIssues,
    };
  };

  const recordStatus = location.lifecycle === 'active' ? 'active' : location.lifecycle === 'retired' ? 'retired' : 'draft';

  const smHolders = smAssignments
    .filter(a => isAssignmentActive(a, localDate))
    .map(a => resolveHolder(a, 'storeManagerId'))
    .filter(Boolean)
    .sort((a, b) => (a!.capacity === 'primary' ? -1 : 1) - (b!.capacity === 'primary' ? -1 : 1));
  const asmHolders = asmAssignments.map(a => resolveHolder(a, 'assistantStoreManagerIds')).filter(Boolean);
  const khHolders = khAssignments.map(a => resolveHolder(a, 'keyHolderIds')).filter(Boolean);
  const dmHolders = dmAssignments
    .filter(a => isAssignmentActive(a, localDate))
    .map(a => resolveHolder(a, 'districtManagerId'))
    .filter(Boolean)
    .sort((a, b) => (a!.capacity === 'primary' ? -1 : 1) - (b!.capacity === 'primary' ? -1 : 1));
  const rmHolders = rmAssignments
    .filter(a => isAssignmentActive(a, localDate))
    .map(a => resolveHolder(a, 'regionalManagerId'))
    .filter(Boolean)
    .sort((a, b) => (a!.capacity === 'primary' ? -1 : 1) - (b!.capacity === 'primary' ? -1 : 1));

  return {
    locationId: location.id,
    storeNumber: location.storeNumber,
    recordStatus,
    regionId: location.regionId,
    districtId: location.districtId,
    hierarchy: {
      regionName: region?.name || null,
      districtName: district?.name || null,
    },
    storeManagerId: smAssignment?.personId || null,
    districtManagerId: dmAssignment?.personId || null,
    regionalManagerId: rmAssignment?.personId || null,
    assistantStoreManagerIds: asmAssignments.map(a => a.personId),
    keyHolderIds: khAssignments.map(a => a.personId),
    staffing: {
      storeManager: resolvePerson(smAssignment?.personId, 'storeManagerId'),
      districtManager: resolvePerson(dmAssignment?.personId, 'districtManagerId'),
      regionalManager: resolvePerson(rmAssignment?.personId, 'regionalManagerId'),
      assistantStoreManagers: asmAssignments.map(a => resolvePerson(a.personId, 'assistantStoreManagerIds')).filter(Boolean),
      keyHolders: khAssignments.map(a => resolvePerson(a.personId, 'keyHolderIds')).filter(Boolean),
    },
    positionStatus: {
      sm: { status: smHolders.length > 0 ? 'filled' : 'vacant', holders: smHolders },
      asm: { status: asmHolders.length > 0 ? 'filled' : 'vacant', holders: asmHolders },
      kh: { status: khHolders.length > 0 ? 'filled' : 'vacant', holders: khHolders },
      dm: { status: dmHolders.length > 0 ? 'filled' : 'vacant', holders: dmHolders },
      rm: { status: rmHolders.length > 0 ? 'filled' : 'vacant', holders: rmHolders },
    },
    issues,
  };
}

function parsePageSize(value: unknown): number | null {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= MAX_PAGE_SIZE ? parsed : null;
}

import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import {
  requireLegacyScope,
  sendLegacyError,
  signCursor,
  verifyCursor,
  computeVersion,
  type ApiCredential,
} from '../middleware/legacyApiAuth';
import type { Location, Region, District, Person, Assignment } from '../../src/types';
import { isAssignmentActive, getLocalDate } from '../utils/assignment';

const LEADERSHIP_CONTRACT_VERSION = 'district-leadership-v3.1';
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
  dataset: 'district-leadership' | 'location-districts';
  after: string;
  limit: number;
}

export function createLegacyV3Router(db: Firestore): Router {
  const router = Router();

  router.get('/snapshot', requireLegacyScope('district-leadership:read'), (req: Request, res: Response) => {
    if (Object.keys(req.query).length) {
      return sendLegacyError(res, 400, 'invalid_query', 'Snapshot creation takes no query parameters.');
    }

    const credential = res.locals.apiCredential as ApiCredential;
    const snapshotAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
    
    const snapshot = signCursor(
      {
        version: LEADERSHIP_CONTRACT_VERSION,
        client: credential.clientId,
        token: credential.tokenVersionId,
        grants: computeVersion({ scopes: [...credential.scopes].sort(), version: credential.grantsVersion ?? 0 }),
        at: snapshotAt,
      } as SnapshotPayload,
      credential.cursorSigningKey,
      'leadership-v3'
    );

    res.json({
      snapshot,
      snapshotAt,
      expiresAt: new Date(Date.parse(snapshotAt) + SNAPSHOT_TTL_MS).toISOString(),
      contractVersion: LEADERSHIP_CONTRACT_VERSION,
    });
  });

  router.get('/district-leadership/:id?', requireLegacyScope('district-leadership:read'), async (req: Request, res: Response) => {
    try {
      const isDetail = req.params.id !== undefined;
      const id = req.params.id;
      const credential = res.locals.apiCredential as ApiCredential;
      const includeWorkEmail = credential.scopes.includes('district-leadership:contacts:read');

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

      const snapshot = verifyCursor<SnapshotPayload>(req.query.snapshot, credential.cursorSigningKey, 'leadership-v3');
      if (!validateSnapshot(snapshot, credential)) {
        return sendLegacyError(res, 400, 'invalid_snapshot', 'Snapshot is invalid for this credential and authorization.');
      }

      const age = Date.now() - Date.parse(snapshot.at);
      if (age < 0 || age >= SNAPSHOT_TTL_MS) {
        return sendLegacyError(res, 409, 'snapshot_expired', 'Restart the complete full snapshot.');
      }

      let afterId: string | undefined;
      if (req.query.cursor !== undefined) {
        const cursor = verifyCursor<CursorPayload>(String(req.query.cursor), credential.cursorSigningKey, 'leadership-v3');
        if (!cursor || cursor.snapshot !== req.query.snapshot || cursor.dataset !== 'district-leadership' || cursor.limit !== limit) {
          return sendLegacyError(res, 400, 'invalid_cursor', 'Cursor does not match snapshot, dataset or page size.');
        }
        afterId = cursor.after;
      }

      const [regionsSnap, peopleSnap, assignmentsSnap] = await Promise.all([
        db.collection('regions').where('lifecycle', '==', 'active').get(),
        db.collection('people').where('lifecycle', '==', 'active').get(),
        db.collection('assignments').where('role', '==', 'DM').get(),
      ]);

      const regions = new Map(regionsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Region]));
      const people = new Map(peopleSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Person]));
      const dmAssignments = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment));

      if (isDetail) {
        const districtDoc = await db.collection('districts').doc(id!).get();
        if (!districtDoc.exists) {
          return sendLegacyError(res, 404, 'record_not_found', 'No record has this canonical ID at the snapshot.');
        }
        const district = { id: districtDoc.id, ...districtDoc.data() } as District;
        const data = projectDistrictLeadership(district, people, regions, dmAssignments, includeWorkEmail);
        
        return res.json({
          data,
          sync: {
            mode: 'full',
            snapshotAt: snapshot.at,
            contractVersion: LEADERSHIP_CONTRACT_VERSION,
            contactAccess: includeWorkEmail ? 'work-email' : 'none',
          },
        });
      }

      let query = db.collection('districts')
        .where('lifecycle', '==', 'active')
        .orderBy('__name__')
        .limit(limit + 1);

      if (afterId) {
        query = query.startAfter(afterId);
      }

      const districtsSnap = await query.get();
      const hasMore = districtsSnap.docs.length > limit;
      const districtDocs = hasMore ? districtsSnap.docs.slice(0, limit) : districtsSnap.docs;

      const data = districtDocs.map(doc => {
        const district = { id: doc.id, ...doc.data() } as District;
        return projectDistrictLeadership(district, people, regions, dmAssignments, includeWorkEmail);
      });

      const nextCursor = hasMore
        ? signCursor(
            { snapshot: req.query.snapshot, dataset: 'district-leadership', after: districtsSnap.docs[limit].id, limit } as CursorPayload,
            credential.cursorSigningKey,
            'leadership-v3'
          )
        : null;

      res.json({
        data,
        pagination: { limit, nextCursor },
        sync: {
          mode: 'full',
          snapshotAt: snapshot.at,
          contractVersion: LEADERSHIP_CONTRACT_VERSION,
          contactAccess: includeWorkEmail ? 'work-email' : 'none',
        },
      });
    } catch (error) {
      console.error('Legacy v3 district-leadership error:', error);
      sendLegacyError(res, 503, 'snapshot_unavailable', 'The pinned source snapshot could not be read. Do not reconcile partial results.');
    }
  });

  router.get('/location-districts/:id?', requireLegacyScope('district-leadership:read'), async (req: Request, res: Response) => {
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

      const snapshot = verifyCursor<SnapshotPayload>(req.query.snapshot, credential.cursorSigningKey, 'leadership-v3');
      if (!validateSnapshot(snapshot, credential)) {
        return sendLegacyError(res, 400, 'invalid_snapshot', 'Snapshot is invalid for this credential and authorization.');
      }

      const age = Date.now() - Date.parse(snapshot.at);
      if (age < 0 || age >= SNAPSHOT_TTL_MS) {
        return sendLegacyError(res, 409, 'snapshot_expired', 'Restart the complete full snapshot.');
      }

      let afterId: string | undefined;
      if (req.query.cursor !== undefined) {
        const cursor = verifyCursor<CursorPayload>(String(req.query.cursor), credential.cursorSigningKey, 'leadership-v3');
        if (!cursor || cursor.snapshot !== req.query.snapshot || cursor.dataset !== 'location-districts' || cursor.limit !== limit) {
          return sendLegacyError(res, 400, 'invalid_cursor', 'Cursor does not match snapshot, dataset or page size.');
        }
        afterId = cursor.after;
      }

      const [regionsSnap, districtsSnap] = await Promise.all([
        db.collection('regions').where('lifecycle', '==', 'active').get(),
        db.collection('districts').where('lifecycle', '==', 'active').get(),
      ]);

      const regions = new Map(regionsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Region]));
      const districts = new Map(districtsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as District]));

      if (isDetail) {
        const locationDoc = await db.collection('locations').doc(id!).get();
        if (!locationDoc.exists) {
          return sendLegacyError(res, 404, 'record_not_found', 'No record has this canonical ID at the snapshot.');
        }
        const location = { id: locationDoc.id, ...locationDoc.data() } as Location;
        const data = projectLocationDistrict(location, districts, regions);
        
        return res.json({
          data,
          sync: {
            mode: 'full',
            snapshotAt: snapshot.at,
            contractVersion: LEADERSHIP_CONTRACT_VERSION,
            contactAccess: 'none',
          },
        });
      }

      let query = db.collection('locations')
        .where('lifecycle', '==', 'active')
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
        return projectLocationDistrict(location, districts, regions);
      });

      const nextCursor = hasMore
        ? signCursor(
            { snapshot: req.query.snapshot, dataset: 'location-districts', after: locationsSnap.docs[limit].id, limit } as CursorPayload,
            credential.cursorSigningKey,
            'leadership-v3'
          )
        : null;

      res.json({
        data,
        pagination: { limit, nextCursor },
        sync: {
          mode: 'full',
          snapshotAt: snapshot.at,
          contractVersion: LEADERSHIP_CONTRACT_VERSION,
          contactAccess: 'none',
        },
      });
    } catch (error) {
      console.error('Legacy v3 location-districts error:', error);
      sendLegacyError(res, 503, 'snapshot_unavailable', 'The pinned source snapshot could not be read. Do not reconcile partial results.');
    }
  });

  return router;
}

function validateSnapshot(snapshot: SnapshotPayload | null, credential: ApiCredential): snapshot is SnapshotPayload {
  if (!snapshot) return false;
  return (
    snapshot.version === LEADERSHIP_CONTRACT_VERSION &&
    snapshot.client === credential.clientId &&
    snapshot.token === credential.tokenVersionId &&
    snapshot.grants === computeVersion({ scopes: [...credential.scopes].sort(), version: credential.grantsVersion ?? 0 }) &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(snapshot.at)
  );
}

function projectDistrictLeadership(
  district: District,
  people: Map<string, Person>,
  regions: Map<string, Region>,
  dmAssignments: Assignment[],
  includeWorkEmail: boolean
): Record<string, unknown> {
  const issues: { code: string; field: string }[] = [];
  const region = regions.get(district.regionId);

  if (!district.name?.trim()) {
    issues.push({ code: 'invalid_name', field: 'districtName' });
  }

  const localDate = getLocalDate();
  const dmAssignment = dmAssignments.find(a => 
    a.scopeType === 'district' && a.scopeId === district.id && isAssignmentActive(a, localDate)
  );

  type AssignmentState = 'assigned' | 'vacant' | 'unmanaged' | 'invalid' | 'unresolved';
  let assignmentState: AssignmentState;
  let districtManager: Record<string, unknown> | null = null;

  if (!dmAssignment) {
    assignmentState = 'vacant';
  } else {
    const person = people.get(dmAssignment.personId);
    const personIssues: { code: string; field: string }[] = [];
    
    if (!person) {
      assignmentState = 'unresolved';
      districtManager = {
        personId: dmAssignment.personId,
        fullName: null,
        lifecycle: 'unknown',
        workEmail: null,
        workEmailStatus: 'unresolved_person',
        issues: [{ code: 'missing_person', field: 'districtManagerId' }],
      };
    } else {
      assignmentState = 'assigned';
      
      if (!person.fullName?.trim()) {
        personIssues.push({ code: 'invalid_name', field: 'fullName' });
      }
      if (person.lifecycle !== 'active') {
        personIssues.push({ 
          code: person.lifecycle === 'inactive' ? 'inactive_person' : 'unknown_person_state', 
          field: 'lifecycle' 
        });
      }

      let workEmail: string | null = null;
      let workEmailStatus: string;

      if (!includeWorkEmail) {
        workEmailStatus = 'not_granted';
      } else if (person.lifecycle !== 'active') {
        workEmailStatus = person.lifecycle === 'inactive' ? 'withheld_inactive' : 'withheld_unknown_lifecycle';
      } else if (!person.workEmail) {
        workEmailStatus = 'missing';
      } else {
        const email = person.workEmail.toLowerCase().trim();
        if (email.endsWith('@shiekhshoes.com') || email.endsWith('@shiekhshoes.org')) {
          workEmail = person.workEmail;
          workEmailStatus = 'available';
        } else {
          workEmailStatus = 'unapproved_domain';
        }
      }

      districtManager = {
        personId: person.id,
        fullName: person.fullName?.trim() || null,
        lifecycle: person.lifecycle,
        workEmail,
        workEmailStatus,
        issues: personIssues,
      };
    }
  }

  const recordStatus = district.lifecycle === 'active' ? 'active' : 'retired';

  return {
    districtId: district.id,
    districtName: district.name?.trim() || null,
    recordStatus,
    regionId: district.regionId,
    regionName: region?.name || null,
    regionStatus: region ? 'active' : null,
    assignmentState,
    districtManager,
    issues,
  };
}

function projectLocationDistrict(
  location: Location,
  districts: Map<string, District>,
  regions: Map<string, Region>
): Record<string, unknown> {
  const issues: { code: string; field: string }[] = [];
  const region = regions.get(location.regionId);
  const district = districts.get(location.districtId);

  if (!location.storeNumber) {
    issues.push({ code: 'invalid_store_number', field: 'storeNumber' });
  }

  const recordStatus = location.lifecycle === 'active' ? 'active' : location.lifecycle === 'retired' ? 'retired' : 'draft';
  const locationType = classifyLocationType(location.storeType);

  if (!location.regionId) {
    issues.push({ code: 'missing_reference', field: 'regionId' });
  } else if (!region) {
    issues.push({ code: 'missing_hierarchy', field: 'regionId' });
  }
  if (!location.districtId) {
    issues.push({ code: 'missing_reference', field: 'districtId' });
  } else if (!district) {
    issues.push({ code: 'missing_hierarchy', field: 'districtId' });
  }
  if (district && district.regionId !== location.regionId) {
    issues.push({ code: 'hierarchy_parent_mismatch', field: 'districtId' });
  }

  return {
    locationId: location.id,
    storeNumber: location.storeNumber,
    recordStatus,
    locationType,
    hierarchyApplicability: 'Applicable',
    regionId: location.regionId,
    districtId: location.districtId,
    issues,
  };
}

function classifyLocationType(storeType: string | undefined): string {
  if (!storeType) return 'unclassified';
  
  const normalized = storeType.toLowerCase();
  if (normalized.includes('mall') || normalized.includes('enclosed')) return 'enclosed-mall';
  if (normalized.includes('strip') || normalized.includes('center') || normalized.includes('shopping')) return 'strip-center';
  if (normalized.includes('street') || normalized.includes('standalone')) return 'street-standalone';
  if (normalized.includes('outlet')) return 'outlet';
  if (normalized.includes('warehouse')) return 'warehouse';
  if (normalized.includes('office')) return 'office';
  
  return 'unclassified';
}

function parsePageSize(value: unknown): number | null {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= MAX_PAGE_SIZE ? parsed : null;
}

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
import type { Location, Region, District, HoursException, Closure, StandardHours } from '../../src/types';
import { getLocalDate } from '../utils/assignment';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const SNAPSHOT_TTL_MS = 15 * 60_000;

interface V1CursorPayload {
  v: 2;
  id: string;
  updatedSince: string | null;
  snapshotAt: string;
  customFieldsVersion: string;
  hierarchyVersion: string;
}

export function createLegacyV1Router(db: Firestore): Router {
  const router = Router();

  router.use(requireLegacyScope('locations:read'));

  router.get('/location-fields', async (_req: Request, res: Response) => {
    try {
      const snapshot = await db.collection('customFields').orderBy('name').get();
      const fields = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          type: data.type,
          options: data.options,
          required: data.required,
          description: data.description,
        };
      });
      const version = computeVersion(fields);
      res.json({ version, fields });
    } catch (error) {
      console.error('Get location fields error:', error);
      res.json({ version: computeVersion([]), fields: [] });
    }
  });

  router.get('/locations', async (req: Request, res: Response) => {
    try {
      const limit = parsePageSize(req.query.limit);
      if (limit === null) {
        return sendLegacyError(res, 400, 'invalid_limit', `limit must be an integer from 1 to ${MAX_PAGE_SIZE}.`);
      }

      const updatedSince = parseUpdatedSince(req.query.updatedSince);
      if (updatedSince === undefined) {
        return sendLegacyError(res, 400, 'invalid_updated_since', 'updatedSince must be an ISO 8601 timestamp with a timezone.');
      }

      const credential = res.locals.apiCredential as ApiCredential;
      const cursor = req.query.cursor
        ? verifyCursor<V1CursorPayload>(String(req.query.cursor), credential.cursorSigningKey, 'directory-cursor-v2')
        : null;

      if (req.query.cursor && !cursor) {
        return sendLegacyError(res, 400, 'invalid_cursor', 'cursor is invalid or malformed.');
      }

      const canonicalUpdatedSince = updatedSince?.toISOString() ?? null;
      if (cursor && cursor.updatedSince !== canonicalUpdatedSince) {
        return sendLegacyError(res, 400, 'cursor_filter_mismatch', 'cursor does not match the current updatedSince filter.');
      }

      const snapshotAt = cursor ? new Date(cursor.snapshotAt) : new Date(Math.floor(Date.now() / 1000) * 1000);
      const now = Date.now();
      if (snapshotAt.getTime() > now || now - snapshotAt.getTime() > SNAPSHOT_TTL_MS) {
        return sendLegacyError(res, 400, 'snapshot_expired', 'Restart synchronization from the last completed watermark.');
      }

      const customFieldsVersion = computeVersion([]);
      if (req.query.customFieldsVersion !== undefined && req.query.customFieldsVersion !== customFieldsVersion) {
        return sendLegacyError(res, 409, 'custom_fields_changed', 'Custom fields changed. Restart a full reconciliation without a cursor, updatedSince, or customFieldsVersion.');
      }

      const [regionsSnap, districtsSnap] = await Promise.all([
        db.collection('regions').where('lifecycle', '==', 'active').get(),
        db.collection('districts').where('lifecycle', '==', 'active').get(),
      ]);
      
      const regions = new Map(regionsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Region]));
      const districts = new Map(districtsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as District]));
      const hierarchyVersion = computeVersion({
        regions: [...regions.values()].map(r => ({ id: r.id, name: r.name })),
        districts: [...districts.values()].map(d => ({ id: d.id, name: d.name, regionId: d.regionId })),
      });

      if (req.query.hierarchyVersion !== undefined && req.query.hierarchyVersion !== hierarchyVersion) {
        return sendLegacyError(res, 409, 'hierarchy_changed', 'The Region/District registry changed. Restart a full reconciliation without a cursor, updatedSince, customFieldsVersion, or hierarchyVersion.');
      }

      const kindParam = req.query.kind;
      const kinds = kindParam 
        ? String(kindParam).split(',').map(k => k.trim()).filter(Boolean)
        : ['store'];
      
      const validKinds = ['store', 'warehouse', 'office'];
      for (const k of kinds) {
        if (!validKinds.includes(k)) {
          return sendLegacyError(res, 400, 'invalid_kind', `Invalid kind "${k}". Valid kinds: ${validKinds.join(', ')}`);
        }
      }

      let query = db.collection('locations')
        .where('lifecycle', '==', 'active')
        .where('kind', 'in', kinds)
        .orderBy('__name__')
        .limit(limit + 1);

      if (cursor?.id) {
        query = query.startAfter(cursor.id);
      }

      const locationsSnap = await query.get();
      const hasMore = locationsSnap.docs.length > limit;
      const locationDocs = hasMore ? locationsSnap.docs.slice(0, limit) : locationsSnap.docs;

      const effectiveUpdatedSince = (req.query.customFieldsVersion === undefined || req.query.hierarchyVersion === undefined)
        ? null
        : updatedSince;

      let filteredDocs = locationDocs;
      if (effectiveUpdatedSince) {
        filteredDocs = locationDocs.filter(doc => {
          const data = doc.data() as Location;
          return new Date(data.updatedAt).getTime() >= effectiveUpdatedSince.getTime();
        });
      }

      const data = await Promise.all(
        filteredDocs.map(doc => mapV1Location(db, doc.id, doc.data() as Location, regions, districts))
      );

      const nextCursor = hasMore
        ? signCursor(
            {
              v: 2,
              id: locationsSnap.docs[limit].id,
              updatedSince: canonicalUpdatedSince,
              snapshotAt: snapshotAt.toISOString(),
              customFieldsVersion,
              hierarchyVersion,
            } as V1CursorPayload,
            credential.cursorSigningKey,
            'directory-cursor-v2'
          )
        : null;

      res.json({
        data,
        sync: {
          watermark: snapshotAt.toISOString(),
          mode: effectiveUpdatedSince ? 'delta' : 'full',
          customFieldsVersion,
          hierarchyVersion,
          fullReconciliationRequired: true,
        },
        pagination: {
          limit,
          nextCursor,
        },
      });
    } catch (error) {
      console.error('Legacy v1 locations error:', error);
      sendLegacyError(res, 500, 'internal_error', 'An unexpected error occurred.');
    }
  });

  router.get('/locations/:storeNumber/operating-state', async (req: Request, res: Response) => {
    try {
      const { storeNumber } = req.params;
      if (!storeNumber || storeNumber.length > 64 || Object.keys(req.query).length) {
        return sendLegacyError(res, 400, 'invalid_operating_query', 'Use an exact storeNumber without snapshot or pagination parameters.');
      }

      const locationsSnap = await db.collection('locations')
        .where('storeNumber', '==', storeNumber)
        .where('lifecycle', '==', 'active')
        .limit(1)
        .get();

      if (locationsSnap.empty) {
        return sendLegacyError(res, 404, 'location_not_found', 'Location not found.');
      }

      const doc = locationsSnap.docs[0];
      const location = { id: doc.id, ...doc.data() } as Location;
      
      const closuresSnap = await db.collection('locations').doc(doc.id)
        .collection('closures')
        .where('status', '==', 'active')
        .limit(1)
        .get();
      
      const activeClosure = closuresSnap.empty ? null : { id: closuresSnap.docs[0].id, ...closuresSnap.docs[0].data() } as Closure;

      const exceptionsSnap = await db.collection('locations').doc(doc.id)
        .collection('hoursExceptions')
        .get();
      const hoursExceptions = exceptionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as HoursException));

      const state = computeOperatingState(location, activeClosure, hoursExceptions);

      res.json({
        contract: 'location-operating-state-v1',
        data: {
          locationId: doc.id,
          storeNumber: location.storeNumber,
          state: state.state,
          reason: state.reason,
          scheduleSource: state.scheduleSource,
          hours: state.hours,
          localDate: state.localDate,
          timeZone: location.timeZone,
          evaluatedAt: state.evaluatedAt,
          nextTransitionAt: state.nextTransitionAt,
          temporaryClosure: activeClosure ? {
            id: activeClosure.id,
            reason: activeClosure.reason,
            startsAt: activeClosure.startsAt,
            expiresAt: activeClosure.endsAt || null,
            timeZone: location.timeZone,
          } : null,
          issues: [],
        },
      });
    } catch (error) {
      console.error('Legacy v1 operating-state error:', error);
      sendLegacyError(res, 500, 'internal_error', 'An unexpected error occurred.');
    }
  });

  router.get('/locations/:storeNumber', async (req: Request, res: Response) => {
    try {
      const { storeNumber } = req.params;
      if (!storeNumber || storeNumber.length > 64) {
        return sendLegacyError(res, 400, 'invalid_store_number', 'storeNumber is invalid.');
      }

      const locationsSnap = await db.collection('locations')
        .where('storeNumber', '==', storeNumber)
        .where('lifecycle', '==', 'active')
        .limit(1)
        .get();

      if (locationsSnap.empty) {
        return sendLegacyError(res, 404, 'location_not_found', 'Location not found.');
      }

      const [regionsSnap, districtsSnap] = await Promise.all([
        db.collection('regions').where('lifecycle', '==', 'active').get(),
        db.collection('districts').where('lifecycle', '==', 'active').get(),
      ]);

      const regions = new Map(regionsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Region]));
      const districts = new Map(districtsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as District]));

      const doc = locationsSnap.docs[0];
      const data = await mapV1Location(db, doc.id, doc.data() as Location, regions, districts);

      const customFieldsVersion = computeVersion([]);
      const hierarchyVersion = computeVersion({
        regions: [...regions.values()].map(r => ({ id: r.id, name: r.name })),
        districts: [...districts.values()].map(d => ({ id: d.id, name: d.name, regionId: d.regionId })),
      });

      res.json({
        data,
        customFieldsVersion,
        hierarchyVersion,
      });
    } catch (error) {
      console.error('Legacy v1 location detail error:', error);
      sendLegacyError(res, 500, 'internal_error', 'An unexpected error occurred.');
    }
  });

  return router;
}

async function mapV1Location(
  db: Firestore,
  id: string,
  location: Location,
  regions: Map<string, Region>,
  districts: Map<string, District>
): Promise<Record<string, unknown>> {
  const region = regions.get(location.regionId);
  const district = districts.get(location.districtId);

  const exceptionsSnap = await db.collection('locations').doc(id)
    .collection('hoursExceptions')
    .get();
  const hoursExceptions = exceptionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as HoursException));

  const closuresSnap = await db.collection('locations').doc(id)
    .collection('closures')
    .where('status', '==', 'active')
    .limit(1)
    .get();
  const activeClosure = closuresSnap.empty ? null : { id: closuresSnap.docs[0].id, ...closuresSnap.docs[0].data() } as Closure;

  const result: Record<string, unknown> = {
    id,
    storeNumber: location.storeNumber,
    recordStatus: 'Active',
    name: location.name,
    address: location.address.street,
    suite: location.address.suite || null,
    city: location.address.city,
    state: location.address.state,
    zipCode: location.address.zip,
    timeZone: location.timeZone,
    locationInboxEmail: location.sharedInboxEmail || null,
    customMetadata: {},
    updatedAt: location.updatedAt,
    wayfindingDirections: location.wayfindingDirections || null,
  };

  if (location.storeType) {
    result.type = location.storeType;
  }
  if (location.mallOrCenterName) {
    result.mallOrCenterName = location.mallOrCenterName;
  }

  if (location.phonePublic && location.mainPhone) {
    result.phone = location.mainPhone;
  }
  result.phonePrivacy = location.phonePublic ? 'Public' : 'Private';

  result.regionId = location.regionId;
  result.regionName = region?.name || null;
  result.regionStatus = region ? 'Active' : null;
  result.districtId = location.districtId;
  result.districtName = district?.name || null;
  result.districtStatus = district ? 'Active' : null;
  result.district = district?.name || null;

  result.hierarchyStatus = region && district ? 'resolved' : 'unassigned';
  result.hierarchyIssues = [];
  result.hierarchyApplicability = 'Applicable';

  result.operationalStatus = location.lifecycle === 'active' ? 'Active' : 'Retired';
  if (location.lastVerifiedAt) {
    result.lastVerifiedAt = location.lastVerifiedAt;
  }

  result.standardHours = mapStandardHours(location.standardHours);

  const holidayHours = hoursExceptions
    .filter(e => e.type === 'holiday')
    .map(e => ({
      id: e.id,
      holidayName: e.label,
      date: e.startDate,
      hours: mapDayHoursForException(e),
    }));
  if (holidayHours.length) {
    result.holidayHours = holidayHours;
  }

  const specialHours = hoursExceptions
    .filter(e => e.type === 'special')
    .map(e => ({
      id: e.id,
      description: e.label,
      startDate: e.startDate,
      endDate: e.endDate,
      hours: mapDayHoursForException(e),
    }));
  if (specialHours.length) {
    result.specialHours = specialHours;
  }

  if (activeClosure) {
    result.activeNotice = {
      shortDescription: activeClosure.reason,
      effectiveDate: activeClosure.startsAt.slice(0, 10),
    };
    if (activeClosure.endsAt) {
      result.activeNotice = {
        ...result.activeNotice as object,
        expectedResolutionDate: activeClosure.endsAt.slice(0, 10),
      };
    }
  }

  return result;
}

function mapStandardHours(hours: StandardHours | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
  
  if (!hours) {
    for (const day of days) {
      result[day] = { isClosed: true };
    }
    return result;
  }
  
  for (const day of days) {
    const dayHours = hours[day];
    if (dayHours) {
      const mapped: Record<string, unknown> = { isClosed: dayHours.closed };
      if (!dayHours.closed && dayHours.intervals.length > 0) {
        mapped.open = dayHours.intervals[0].open;
        mapped.close = dayHours.intervals[0].close;
      }
      result[day] = mapped;
    }
  }
  
  return result;
}

function mapDayHoursForException(exception: HoursException): Record<string, unknown> {
  const result: Record<string, unknown> = { isClosed: exception.closed };
  if (!exception.closed && exception.intervals.length > 0) {
    result.open = exception.intervals[0].open;
    result.close = exception.intervals[0].close;
  }
  return result;
}

function computeOperatingState(
  location: Location,
  activeClosure: Closure | null,
  hoursExceptions: HoursException[]
): {
  state: 'Open' | 'Closed' | 'Unknown';
  reason: string;
  scheduleSource: 'standard' | 'exception' | 'closure' | 'unknown';
  hours: { open: string; close: string; isClosed: boolean } | null;
  localDate: string;
  evaluatedAt: string;
  nextTransitionAt: string | null;
} {
  const now = new Date();
  const localDate = getLocalDate(location.timeZone);
  const evaluatedAt = now.toISOString();
  
  const localTimeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: location.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const localTime = localTimeFormatter.format(now).replace(/^24:/, '00:');

  if (activeClosure) {
    return {
      state: 'Closed',
      reason: activeClosure.reason || 'Temporarily closed',
      scheduleSource: 'closure',
      hours: null,
      localDate,
      evaluatedAt,
      nextTransitionAt: activeClosure.endsAt || null,
    };
  }

  const todayException = hoursExceptions.find(e => 
    e.startDate <= localDate && e.endDate >= localDate
  );

  const dayName = new Intl.DateTimeFormat('en-US', { 
    timeZone: location.timeZone, 
    weekday: 'long' 
  }).format(now).toLowerCase() as keyof StandardHours;
  
  const dayHours = todayException 
    ? { closed: todayException.closed, intervals: todayException.intervals }
    : location.standardHours?.[dayName];

  if (!dayHours || dayHours.closed) {
    return {
      state: 'Closed',
      reason: todayException ? todayException.label : 'Closed today',
      scheduleSource: todayException ? 'exception' : 'standard',
      hours: { open: '', close: '', isClosed: true },
      localDate,
      evaluatedAt,
      nextTransitionAt: null,
    };
  }

  if (dayHours.intervals.length === 0) {
    return {
      state: 'Unknown',
      reason: 'No hours configured',
      scheduleSource: 'unknown',
      hours: null,
      localDate,
      evaluatedAt,
      nextTransitionAt: null,
    };
  }

  const interval = dayHours.intervals[0];
  const isOpen = localTime >= interval.open && localTime < interval.close;

  return {
    state: isOpen ? 'Open' : 'Closed',
    reason: isOpen 
      ? `Open until ${interval.close}` 
      : (localTime < interval.open ? `Opens at ${interval.open}` : 'Closed for the day'),
    scheduleSource: todayException ? 'exception' : 'standard',
    hours: { open: interval.open, close: interval.close, isClosed: false },
    localDate,
    evaluatedAt,
    nextTransitionAt: null,
  };
}

function parsePageSize(value: unknown): number | null {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= MAX_PAGE_SIZE ? parsed : null;
}

function parseUpdatedSince(value: unknown): Date | null | undefined {
  if (value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!ISO_TIMESTAMP.test(value)) return undefined;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp;
}

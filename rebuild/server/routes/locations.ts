import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  Location,
  Closure,
  HoursException,
  Assignment,
  Person,
  Region,
  District,
  LocationListItem,
  LocationDetail,
  LocationLeadership,
  Notice,
} from '../../src/types';
import { resolveOperatingStatus, getWeekSchedule, getScheduleForDate } from '../../src/lib/operatingState';
import { formatPhoneNumber } from '../utils/phone';
import { formatAddress, getMapsUrl } from '../utils/address';
import { isAssignmentActive, getLocalDate } from '../utils/assignment';
import { resolvePositionHolders } from '../utils/positionHolder';

export function createLocationsRouter(db: Firestore): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const { districtId, regionId, kind, storeType } = req.query;
      
      let query = db.collection('locations')
        .where('lifecycle', '==', 'active');
      
      const kindFilter = kind as string || 'store';
      if (kindFilter !== 'all') {
        query = query.where('kind', '==', kindFilter);
      }
      
      if (districtId) {
        query = query.where('districtId', '==', districtId);
      } else if (regionId) {
        query = query.where('regionId', '==', regionId);
      }
      
      if (storeType && typeof storeType === 'string') {
        query = query.where('storeType', '==', storeType);
      }
      
      const locationsSnap = await query.get();
      const locations: LocationListItem[] = [];
      
      for (const doc of locationsSnap.docs) {
        const location = { id: doc.id, ...doc.data() } as Location;
        
        const closuresSnap = await db.collection(`locations/${doc.id}/closures`)
          .where('status', '==', 'active')
          .get();
        const closures = closuresSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Closure[];
        
        const exceptionsSnap = await db.collection(`locations/${doc.id}/hoursExceptions`).get();
        const exceptions = exceptionsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as HoursException[];
        
        const statusNow = resolveOperatingStatus(location, closures, exceptions);
        
        const smAssignment = await db.collection('assignments')
          .where('scopeType', '==', 'location')
          .where('scopeId', '==', location.id)
          .where('role', '==', 'SM')
          .where('slot', '==', 'primary')
          .limit(1)
          .get();
        
        let smName: string | undefined;
        if (!smAssignment.empty) {
          const assignment = smAssignment.docs[0].data() as Assignment;
          const personDoc = await db.collection('people').doc(assignment.personId).get();
          if (personDoc.exists) {
            smName = (personDoc.data() as Person).fullName;
          }
        }
        
        // Get district name if available
        let districtName: string | undefined;
        if (location.districtId) {
          const districtDoc = await db.collection('districts').doc(location.districtId).get();
          if (districtDoc.exists) {
            districtName = (districtDoc.data() as District).name;
          }
        }

        // Get active closure if any
        const activeClosure = closures.length > 0 ? closures[0] : undefined;

        const addr = location.address || {};
        locations.push({
          id: location.id,
          kind: location.kind,
          storeNumber: location.storeNumber,
          name: location.name,
          city: addr.city || '',
          state: addr.state || '',
          statusNow,
          phone: location.mainPhone,
          phoneFormatted: location.phonePublic ? formatPhoneNumber(location.mainPhone) : 'Private',
          smName,
          sharedInboxEmail: location.sharedInboxEmail,
          districtId: location.districtId,
          districtName,
          activeClosure,
        });
      }
      
      locations.sort((a, b) => {
        const numA = parseInt(a.storeNumber, 10) || 0;
        const numB = parseInt(b.storeNumber, 10) || 0;
        return numA - numB;
      });
      
      return res.json({ data: locations });
    } catch (error) {
      console.error('List locations error:', error);
      return res.status(500).json({
        error: {
          code: 'list_error',
          message: 'Failed to list locations',
          requestId: res.locals.requestId,
        },
      });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const locationDoc = await db.collection('locations').doc(id).get();
      
      if (!locationDoc.exists) {
        return res.status(404).json({
          error: {
            code: 'not_found',
            message: 'Location not found',
            requestId: res.locals.requestId,
          },
        });
      }
      
      const location = { id: locationDoc.id, ...locationDoc.data() } as Location;
      
      const closuresSnap = await db.collection(`locations/${id}/closures`).get();
      const allClosures = closuresSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Closure[];
      const closures = allClosures.filter(c => c.status === 'active');
      const activeClosure = closures[0] || null;
      
      const exceptionsSnap = await db.collection(`locations/${id}/hoursExceptions`)
        .orderBy('startDate', 'asc')
        .get();
      const exceptions = exceptionsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as HoursException[];
      
      const statusNow = resolveOperatingStatus(location, closures, exceptions);
      const todaySchedule = getScheduleForDate(location, exceptions, statusNow.localDate);
      const weekSchedule = getWeekSchedule(location, exceptions, new Date(), location.timeZone);
      
      const leadership = await getLocationLeadership(db, location);
      
      let regionName = '';
      let districtName = '';
      
      if (location.regionId) {
        const regionDoc = await db.collection('regions').doc(location.regionId).get();
        if (regionDoc.exists) {
          regionName = (regionDoc.data() as Region).name;
        }
      }
      
      if (location.districtId) {
        const districtDoc = await db.collection('districts').doc(location.districtId).get();
        if (districtDoc.exists) {
          districtName = (districtDoc.data() as District).name;
        }
      }
      
      // Get active notices - degrade gracefully if query fails (e.g., missing index)
      let activeNotices: Notice[] = [];
      try {
        const noticesSnap = await db.collection('locations').doc(id).collection('notices')
          .where('status', '==', 'active')
          .orderBy('effectiveFrom', 'desc')
          .get();
        activeNotices = noticesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Notice[];
      } catch (noticesError) {
        console.error('Failed to fetch notices (missing index?), continuing without notices:', noticesError);
      }
      
      const detail: LocationDetail = {
        ...location,
        statusNow,
        todaySchedule,
        weekSchedule,
        hoursExceptions: exceptions,
        activeClosure,
        activeNotices,
        leadership,
        regionName,
        districtName,
        addressFormatted: formatAddress(location.address),
        phoneFormatted: location.phonePublic ? formatPhoneNumber(location.mainPhone) : 'Private',
        mapsUrl: getMapsUrl(location.address),
      };
      
      return res.json({ data: detail });
    } catch (error) {
      console.error('Get location error:', error);
      return res.status(500).json({
        error: {
          code: 'get_error',
          message: 'Failed to get location',
          requestId: res.locals.requestId,
        },
      });
    }
  });

  return router;
}

async function getLocationLeadership(
  db: Firestore,
  location: Location
): Promise<LocationLeadership> {
  const leadership: LocationLeadership = {
    smCoverage: [],
    hasPrimarySm: false,
    smStatus: 'vacant',
    asm: [],
    asmStatus: 'vacant',
    kh: [],
    khStatus: 'vacant',
    dmStatus: 'vacant',
    rmStatus: 'vacant',
  };
  
  const locationAssignments = await db.collection('assignments')
    .where('scopeType', '==', 'location')
    .where('scopeId', '==', location.id)
    .get();
  
  const localDate = getLocalDate(location.timeZone);
  
  for (const doc of locationAssignments.docs) {
    const assignment = doc.data() as Assignment;
    if (!isAssignmentActive(assignment, localDate)) continue;
    
    const personDoc = await db.collection('people').doc(assignment.personId).get();
    if (!personDoc.exists) continue;
    const person = personDoc.data() as Person;
    if (person.lifecycle !== 'active') continue;
    
    const capacity = assignment.capacity || 'primary';
    const entry = { id: assignment.personId, name: person.fullName, slot: assignment.slot, capacity };
    
    switch (assignment.role) {
      case 'SM':
        const smEntry = { ...entry, label: assignment.label };
        leadership.smCoverage.push(smEntry);
        leadership.smStatus = 'filled';
        if (assignment.slot === 'primary') {
          leadership.sm = entry;
          leadership.hasPrimarySm = true;
        } else if (!leadership.sm) {
          leadership.sm = entry;
        }
        break;
      case 'ASM':
        leadership.asm.push(entry);
        leadership.asmStatus = 'filled';
        break;
      case 'KH':
        leadership.kh.push(entry);
        leadership.khStatus = 'filled';
        break;
    }
  }
  
  leadership.smCoverage.sort((a, b) => {
    if (a.slot === 'primary' && b.slot !== 'primary') return -1;
    if (b.slot === 'primary' && a.slot !== 'primary') return 1;
    return a.name.localeCompare(b.name);
  });
  
  if (location.districtId) {
    const dmAssignmentsSnap = await db.collection('assignments')
      .where('scopeType', '==', 'district')
      .where('scopeId', '==', location.districtId)
      .where('role', '==', 'DM')
      .get();
    
    const dmAssignments = dmAssignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment));
    
    const personIds = new Set(dmAssignments.map(a => a.personId));
    const dmPeopleMap = new Map<string, Person>();
    for (const personId of personIds) {
      const personDoc = await db.collection('people').doc(personId).get();
      if (personDoc.exists) {
        dmPeopleMap.set(personId, { id: personId, ...personDoc.data() } as Person);
      }
    }
    
    const dmResult = resolvePositionHolders(dmAssignments, dmPeopleMap, localDate);
    leadership.dmStatus = dmResult.status;
    
    if (dmResult.primary) {
      leadership.dm = { id: dmResult.primary.personId, name: dmResult.primary.fullName, capacity: dmResult.primary.capacity };
    } else if (dmResult.others.length > 0) {
      const firstOther = dmResult.others[0];
      leadership.dm = { id: firstOther.personId, name: dmResult.displayName, capacity: firstOther.capacity };
    }
    
    leadership.dmOthers = dmResult.others.map(h => ({
      id: h.personId,
      name: h.fullName,
      capacity: h.capacity,
    }));
  }
  
  if (location.regionId) {
    const rmAssignmentsSnap = await db.collection('assignments')
      .where('scopeType', '==', 'region')
      .where('scopeId', '==', location.regionId)
      .where('role', '==', 'RM')
      .get();
    
    const rmAssignments = rmAssignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignment));
    
    const personIds = new Set(rmAssignments.map(a => a.personId));
    const rmPeopleMap = new Map<string, Person>();
    for (const personId of personIds) {
      const personDoc = await db.collection('people').doc(personId).get();
      if (personDoc.exists) {
        rmPeopleMap.set(personId, { id: personId, ...personDoc.data() } as Person);
      }
    }
    
    const rmResult = resolvePositionHolders(rmAssignments, rmPeopleMap, localDate);
    leadership.rmStatus = rmResult.status;
    
    if (rmResult.primary) {
      leadership.rm = { id: rmResult.primary.personId, name: rmResult.primary.fullName, capacity: rmResult.primary.capacity };
    } else if (rmResult.others.length > 0) {
      const firstOther = rmResult.others[0];
      leadership.rm = { id: firstOther.personId, name: rmResult.displayName, capacity: firstOther.capacity };
    }
    
    leadership.rmOthers = rmResult.others.map(h => ({
      id: h.personId,
      name: h.fullName,
      capacity: h.capacity,
    }));
  }
  
  return leadership;
}

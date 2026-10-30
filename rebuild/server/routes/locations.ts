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
} from '../../src/types';
import { resolveOperatingStatus, getWeekSchedule, getScheduleForDate } from '../../src/lib/operatingState';
import { formatPhoneNumber } from '../utils/phone';
import { formatAddress, getMapsUrl } from '../utils/address';

export function createLocationsRouter(db: Firestore): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const { districtId, regionId } = req.query;
      
      let query = db.collection('locations')
        .where('lifecycle', '==', 'active')
        .where('kind', '==', 'store');
      
      if (districtId) {
        query = query.where('districtId', '==', districtId);
      } else if (regionId) {
        query = query.where('regionId', '==', regionId);
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
        
        locations.push({
          id: location.id,
          storeNumber: location.storeNumber,
          name: location.name,
          city: location.address.city,
          state: location.address.state,
          statusNow,
          phone: location.mainPhone,
          phoneFormatted: location.phonePublic ? formatPhoneNumber(location.mainPhone) : 'Private',
          smName,
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
      
      const exceptionsSnap = await db.collection(`locations/${id}/hoursExceptions`).get();
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
      
      const detail: LocationDetail = {
        ...location,
        statusNow,
        todaySchedule,
        weekSchedule,
        hoursExceptions: exceptions,
        activeClosure,
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
    asm: [],
    kh: [],
  };
  
  const locationAssignments = await db.collection('assignments')
    .where('scopeType', '==', 'location')
    .where('scopeId', '==', location.id)
    .get();
  
  for (const doc of locationAssignments.docs) {
    const assignment = doc.data() as Assignment;
    const isActive = !assignment.endDate || assignment.endDate >= new Date().toISOString().slice(0, 10);
    if (!isActive) continue;
    
    const personDoc = await db.collection('people').doc(assignment.personId).get();
    if (!personDoc.exists) continue;
    const person = personDoc.data() as Person;
    if (person.lifecycle !== 'active') continue;
    
    const entry = { id: assignment.personId, name: person.fullName, slot: assignment.slot };
    
    switch (assignment.role) {
      case 'SM':
        const smEntry = { ...entry, label: assignment.label };
        leadership.smCoverage.push(smEntry);
        if (assignment.slot === 'primary') {
          leadership.sm = entry;
          leadership.hasPrimarySm = true;
        } else if (!leadership.sm) {
          leadership.sm = entry;
        }
        break;
      case 'ASM':
        leadership.asm.push(entry);
        break;
      case 'KH':
        leadership.kh.push(entry);
        break;
    }
  }
  
  leadership.smCoverage.sort((a, b) => {
    if (a.slot === 'primary' && b.slot !== 'primary') return -1;
    if (b.slot === 'primary' && a.slot !== 'primary') return 1;
    return a.name.localeCompare(b.name);
  });
  
  if (location.districtId) {
    const dmAssignment = await db.collection('assignments')
      .where('scopeType', '==', 'district')
      .where('scopeId', '==', location.districtId)
      .where('role', '==', 'DM')
      .where('slot', '==', 'primary')
      .limit(1)
      .get();
    
    if (!dmAssignment.empty) {
      const assignment = dmAssignment.docs[0].data() as Assignment;
      const personDoc = await db.collection('people').doc(assignment.personId).get();
      if (personDoc.exists) {
        const person = personDoc.data() as Person;
        leadership.dm = { id: assignment.personId, name: person.fullName };
      }
    }
  }
  
  if (location.regionId) {
    const rmAssignment = await db.collection('assignments')
      .where('scopeType', '==', 'region')
      .where('scopeId', '==', location.regionId)
      .where('role', '==', 'RM')
      .where('slot', '==', 'primary')
      .limit(1)
      .get();
    
    if (!rmAssignment.empty) {
      const assignment = rmAssignment.docs[0].data() as Assignment;
      const personDoc = await db.collection('people').doc(assignment.personId).get();
      if (personDoc.exists) {
        const person = personDoc.data() as Person;
        leadership.rm = { id: assignment.personId, name: person.fullName };
      }
    }
  }
  
  return leadership;
}

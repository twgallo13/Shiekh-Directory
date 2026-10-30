import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { SearchResult, Location, Person } from '../../src/types';
import { resolveOperatingStatus } from '../../src/lib/operatingState';
import { formatPhoneNumber, normalizePhoneForSearch } from '../utils/phone';

export function createSearchRouter(db: Firestore): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    const query = String(req.query.q || '').trim().toLowerCase();
    
    if (!query) {
      return res.json({ data: [] });
    }
    
    if (query.length > 100) {
      return res.status(400).json({
        error: {
          code: 'invalid_query',
          message: 'Search query too long',
          requestId: res.locals.requestId,
        },
      });
    }
    
    try {
      const results: SearchResult[] = [];
      const normalizedPhone = normalizePhoneForSearch(query);
      
      const locationsRef = db.collection('locations');
      const locationsSnap = await locationsRef
        .where('lifecycle', '==', 'active')
        .get();
      
      for (const doc of locationsSnap.docs) {
        const location = { id: doc.id, ...doc.data() } as Location;
        
        const storeNumberMatch = location.storeNumber.toLowerCase().includes(query);
        const nameMatch = location.name.toLowerCase().includes(query);
        const cityMatch = location.address.city.toLowerCase().includes(query);
        const phoneMatch = normalizedPhone && 
          normalizePhoneForSearch(location.mainPhone)?.includes(normalizedPhone);
        
        if (storeNumberMatch || nameMatch || cityMatch || phoneMatch) {
          const closuresSnap = await db.collection(`locations/${doc.id}/closures`)
            .where('status', '==', 'active')
            .get();
          const closures = closuresSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
          
          const exceptionsSnap = await db.collection(`locations/${doc.id}/hoursExceptions`).get();
          const exceptions = exceptionsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
          
          const statusNow = resolveOperatingStatus(location, closures, exceptions);
          
          results.push({
            type: 'location',
            id: location.id,
            title: `#${location.storeNumber} ${location.name}`,
            subtitle: `${location.address.city}, ${location.address.state}`,
            phone: location.phonePublic ? formatPhoneNumber(location.mainPhone) : undefined,
            statusNow,
          });
        }
      }
      
      const peopleRef = db.collection('people');
      const peopleSnap = await peopleRef
        .where('lifecycle', '==', 'active')
        .get();
      
      for (const doc of peopleSnap.docs) {
        const person = { id: doc.id, ...doc.data() } as Person;
        
        const nameMatch = person.fullName.toLowerCase().includes(query);
        const phoneMatch = normalizedPhone && (
          (person.workPhone && normalizePhoneForSearch(person.workPhone)?.includes(normalizedPhone)) ||
          (person.mobilePhone && normalizePhoneForSearch(person.mobilePhone)?.includes(normalizedPhone))
        );
        
        if (nameMatch || phoneMatch) {
          results.push({
            type: 'person',
            id: person.id,
            title: person.fullName,
            subtitle: person.workEmail || 'No email on file',
            phone: person.workPhone ? formatPhoneNumber(person.workPhone) : undefined,
          });
        }
      }
      
      results.sort((a, b) => {
        const aExact = a.title.toLowerCase().startsWith(query) ? 0 : 1;
        const bExact = b.title.toLowerCase().startsWith(query) ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return a.title.localeCompare(b.title);
      });
      
      return res.json({ data: results.slice(0, 20) });
    } catch (error) {
      console.error('Search error:', error);
      return res.status(500).json({
        error: {
          code: 'search_error',
          message: 'Failed to execute search',
          requestId: res.locals.requestId,
        },
      });
    }
  });

  return router;
}

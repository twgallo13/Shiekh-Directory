import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { SearchResult, Location, Person, Closure, HoursException } from '../../src/types';
import { resolveOperatingStatus } from '../../src/lib/operatingState';
import { formatPhoneNumber } from '../utils/phone';
import {
  isStoreNumberQuery,
  rankLocationsForStoreQuery,
  filterLocationsForTextQuery,
  isPhoneLikeQuery,
  type RankableLocation,
} from '../utils/storeNumber';

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
    
    // Check for minimum length after stripping '#'
    const withoutHash = query.replace(/^#/, '');
    if (withoutHash.length < 1) {
      return res.json({ data: [] });
    }
    
    // Single character: only allow single-digit store-number queries
    if (withoutHash.length === 1 && !/^\d$/.test(withoutHash)) {
      return res.json({ data: [] });
    }
    
    try {
      const isStoreQuery = isStoreNumberQuery(query);
      const phoneQuery = isPhoneLikeQuery(query);
      
      // ========== LOCATIONS ==========
      const locationsSnap = await db.collection('locations')
        .where('lifecycle', '==', 'active')
        .get();
      
      // Build rankable locations (minimal data for ranking)
      const rankableLocations: (RankableLocation & { 
        state: string;
        mainPhoneRaw: string;
        phonePublic: boolean;
      })[] = locationsSnap.docs.map(doc => {
        const data = doc.data() as Location;
        return {
          id: doc.id,
          storeNumber: data.storeNumber || '',
          name: data.name || '',
          city: data.address?.city || '',
          mall: data.mallOrCenterName,
          mainPhone: data.mainPhone,
          state: data.address?.state || '',
          mainPhoneRaw: data.mainPhone || '',
          phonePublic: data.phonePublic ?? true,
        };
      });
      
      // Rank/filter locations (pure, no DB calls)
      let rankedLocations: typeof rankableLocations;
      
      if (isStoreQuery) {
        // Store-number-shaped query: use tiered ranking (store first, then prefix, then others)
        const ranked = rankLocationsForStoreQuery(
          query,
          rankableLocations,
          phoneQuery.isPhoneLike // Only match phones if 3+ digits
        );
        rankedLocations = ranked.map(r => r.location);
      } else {
        // Non-store-number query: use existing behavior (startsWith title, then alpha)
        // Phone matches require 3+ digits
        rankedLocations = filterLocationsForTextQuery(
          query,
          rankableLocations,
          loc => `#${loc.storeNumber} ${loc.name}`
        );
      }
      
      // ========== PEOPLE ==========
      const peopleSnap = await db.collection('people')
        .where('lifecycle', '==', 'active')
        .get();
      
      // Filter people: name match, or work phone match (3+ digits)
      // M7: Do NOT match on mobilePhone - this is a privacy fix
      const matchedPeople: Person[] = [];
      
      for (const doc of peopleSnap.docs) {
        const person = { id: doc.id, ...doc.data() } as Person;
        
        const nameMatch = person.fullName.toLowerCase().includes(query);
        
        // Phone match requires 3+ digits and uses workPhone only (not mobilePhone)
        let phoneMatch = false;
        if (phoneQuery.isPhoneLike && person.workPhone) {
          const workDigits = person.workPhone.replace(/\D/g, '');
          phoneMatch = workDigits.includes(phoneQuery.digits);
        }
        
        if (nameMatch || phoneMatch) {
          matchedPeople.push(person);
        }
      }
      
      // Sort people: startsWith first, then alphabetical
      matchedPeople.sort((a, b) => {
        const aStarts = a.fullName.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = b.fullName.toLowerCase().startsWith(query) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.fullName.localeCompare(b.fullName);
      });
      
      // ========== COMBINE AND LIMIT ==========
      // For store-number queries: locations first, then people
      // For non-store-number queries: interleave by title (existing behavior)
      
      const LIMIT = 20;
      let finalLocations: typeof rankedLocations;
      let finalPeople: Person[];
      
      if (isStoreQuery) {
        // Store-number query: locations first, then people (people are likely not what user wants)
        // Take up to 20 locations, then fill remaining with people
        finalLocations = rankedLocations.slice(0, LIMIT);
        const remainingSlots = LIMIT - finalLocations.length;
        finalPeople = remainingSlots > 0 ? matchedPeople.slice(0, remainingSlots) : [];
      } else {
        // Non-store-number query: existing behavior - interleave by title
        // Build combined list with types, sort by title, then limit
        const combined: Array<{ type: 'location' | 'person'; title: string; item: typeof rankableLocations[0] | Person }> = [];
        
        for (const loc of rankedLocations) {
          combined.push({
            type: 'location',
            title: `#${loc.storeNumber} ${loc.name}`,
            item: loc,
          });
        }
        
        for (const person of matchedPeople) {
          combined.push({
            type: 'person',
            title: person.fullName,
            item: person,
          });
        }
        
        // Sort by startsWith, then alphabetically
        combined.sort((a, b) => {
          const aStarts = a.title.toLowerCase().startsWith(query) ? 0 : 1;
          const bStarts = b.title.toLowerCase().startsWith(query) ? 0 : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
          return a.title.localeCompare(b.title);
        });
        
        // Take first 20 and separate back into locations and people
        const limited = combined.slice(0, LIMIT);
        finalLocations = limited.filter(x => x.type === 'location').map(x => x.item as typeof rankableLocations[0]);
        finalPeople = limited.filter(x => x.type === 'person').map(x => x.item as Person);
      }
      
      // ========== ENRICH LOCATIONS (M8: only for final shown rows) ==========
      const locationResults: SearchResult[] = [];
      
      for (const loc of finalLocations) {
        // Fetch closures and exceptions only for the final displayed locations
        const closuresSnap = await db.collection(`locations/${loc.id}/closures`)
          .where('status', '==', 'active')
          .get();
        const closures = closuresSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Closure[];
        
        const exceptionsSnap = await db.collection(`locations/${loc.id}/hoursExceptions`).get();
        const exceptions = exceptionsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as HoursException[];
        
        // Build a minimal Location object for resolveOperatingStatus
        const locationForStatus: Location = {
          id: loc.id,
          storeNumber: loc.storeNumber,
          name: loc.name,
          address: { city: loc.city, state: loc.state, street: '', zip: '', country: 'US' },
          mainPhone: loc.mainPhoneRaw,
          phonePublic: loc.phonePublic,
          timeZone: 'America/Los_Angeles', // Default for status calculation
        } as Location;
        
        const statusNow = resolveOperatingStatus(locationForStatus, closures, exceptions);
        
        locationResults.push({
          type: 'location',
          id: loc.id,
          title: `#${loc.storeNumber} ${loc.name}`,
          subtitle: `${loc.city}, ${loc.state}`,
          phone: loc.phonePublic ? formatPhoneNumber(loc.mainPhoneRaw) : undefined,
          statusNow,
        });
      }
      
      // ========== BUILD PEOPLE RESULTS ==========
      const peopleResults: SearchResult[] = finalPeople.map(person => ({
        type: 'person' as const,
        id: person.id,
        title: person.fullName,
        subtitle: person.workEmail || 'No email on file',
        phone: person.workPhone ? formatPhoneNumber(person.workPhone) : undefined,
      }));
      
      // ========== FINAL RESPONSE ==========
      // For store-number queries: locations first, then people
      // For non-store-number queries: interleaved order already established
      let results: SearchResult[];
      
      if (isStoreQuery) {
        results = [...locationResults, ...peopleResults];
      } else {
        // Reconstruct interleaved order based on the combined sort
        const combined: Array<{ type: 'location' | 'person'; title: string; result: SearchResult }> = [];
        for (const r of locationResults) {
          combined.push({ type: 'location', title: r.title, result: r });
        }
        for (const r of peopleResults) {
          combined.push({ type: 'person', title: r.title, result: r });
        }
        combined.sort((a, b) => {
          const aStarts = a.title.toLowerCase().startsWith(query) ? 0 : 1;
          const bStarts = b.title.toLowerCase().startsWith(query) ? 0 : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
          return a.title.localeCompare(b.title);
        });
        results = combined.map(x => x.result);
      }
      
      return res.json({ data: results });
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

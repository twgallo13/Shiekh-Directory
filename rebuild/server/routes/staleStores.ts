import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AuthUser, Location } from '../../src/types';
import { getWorkflowRules } from '../services/workflowSettings';

function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Guard against formula injection
  const needsPrefix = /^[=+\-@\t\r]/.test(str);
  const escaped = str.replace(/"/g, '""');
  return needsPrefix ? `"'${escaped}"` : `"${escaped}"`;
}

export interface StaleStoreItem {
  id: string;
  storeNumber: string;
  name: string;
  districtId: string;
  districtName?: string;
  regionId: string;
  regionName?: string;
  lastVerifiedAt?: string;
  daysSinceVerification: number | null;
}

export function createStaleStoresRouter(db: Firestore): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Authentication required', requestId: res.locals.requestId },
        });
      }

      if (!['Admin', 'Steward', 'Leader'].includes(authUser.role)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Access denied', requestId: res.locals.requestId },
        });
      }

      const { districtId, minDaysOverdue, maxDaysOverdue } = req.query;
      const minDays = minDaysOverdue ? parseInt(minDaysOverdue as string, 10) : null;
      const maxDays = maxDaysOverdue ? parseInt(maxDaysOverdue as string, 10) : null;
      
      const workflowRules = await getWorkflowRules(db);
      const verificationCycleDays = workflowRules.verificationCycleDays;
      
      const now = Date.now();
      const thresholdDate = new Date(now - verificationCycleDays * 24 * 60 * 60 * 1000);

      const baseQuery = db.collection('locations')
        .where('lifecycle', '==', 'active')
        .where('kind', '==', 'store');

      let snapshots: FirebaseFirestore.QuerySnapshot[] = [];
      
      if (authUser.role === 'Leader' && authUser.leaderScope?.districtIds?.length) {
        const uniqueDistrictIds = [...new Set(authUser.leaderScope.districtIds)];
        const BATCH_SIZE = 30;
        for (let i = 0; i < uniqueDistrictIds.length; i += BATCH_SIZE) {
          const batch = uniqueDistrictIds.slice(i, i + BATCH_SIZE);
          const batchQuery = baseQuery.where('districtId', 'in', batch);
          snapshots.push(await batchQuery.get());
        }
      } else {
        snapshots.push(await baseQuery.get());
      }
      
      const allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      for (const snapshot of snapshots) {
        allDocs.push(...snapshot.docs);
      }

      const districtIds = new Set<string>();
      const regionIds = new Set<string>();
      const locations: Location[] = [];
      const seenLocationIds = new Set<string>();

      allDocs.forEach(doc => {
        if (seenLocationIds.has(doc.id)) return;
        seenLocationIds.add(doc.id);
        const data = { id: doc.id, ...doc.data() } as Location;
        locations.push(data);
        if (data.districtId) districtIds.add(data.districtId);
        if (data.regionId) regionIds.add(data.regionId);
      });

      const districtNames = new Map<string, string>();
      const regionNames = new Map<string, string>();

      if (districtIds.size > 0) {
        const districtDocs = await Promise.all(
          Array.from(districtIds).map(id => db.collection('districts').doc(id).get())
        );
        districtDocs.forEach(doc => {
          if (doc.exists) {
            const data = doc.data();
            if (data?.name) districtNames.set(doc.id, data.name);
          }
        });
      }

      if (regionIds.size > 0) {
        const regionDocs = await Promise.all(
          Array.from(regionIds).map(id => db.collection('regions').doc(id).get())
        );
        regionDocs.forEach(doc => {
          if (doc.exists) {
            const data = doc.data();
            if (data?.name) regionNames.set(doc.id, data.name);
          }
        });
      }

      const staleStores: StaleStoreItem[] = [];

      for (const location of locations) {
        const lastVerifiedAt = location.lastVerifiedAt;
        let isStale = false;
        let daysSinceVerification: number | null = null;

        if (!lastVerifiedAt) {
          isStale = true;
          daysSinceVerification = null;
        } else {
          const verifiedDate = new Date(lastVerifiedAt);
          if (verifiedDate < thresholdDate) {
            isStale = true;
          }
          daysSinceVerification = Math.floor((now - verifiedDate.getTime()) / (24 * 60 * 60 * 1000));
        }

        if (isStale) {
          const daysOverdue = daysSinceVerification !== null 
            ? daysSinceVerification - verificationCycleDays 
            : null;
          
          // Apply filters
          if (districtId && location.districtId !== districtId) continue;
          if (minDays !== null && (daysOverdue === null || daysOverdue < minDays)) continue;
          if (maxDays !== null && daysOverdue !== null && daysOverdue > maxDays) continue;
          
          staleStores.push({
            id: location.id,
            storeNumber: location.storeNumber,
            name: location.name,
            districtId: location.districtId,
            districtName: districtNames.get(location.districtId),
            regionId: location.regionId,
            regionName: regionNames.get(location.regionId),
            lastVerifiedAt,
            daysSinceVerification,
          });
        }
      }

      staleStores.sort((a, b) => {
        if (a.daysSinceVerification === null && b.daysSinceVerification === null) {
          return a.storeNumber.localeCompare(b.storeNumber);
        }
        if (a.daysSinceVerification === null) return -1;
        if (b.daysSinceVerification === null) return 1;
        return b.daysSinceVerification - a.daysSinceVerification;
      });

      // Get unique districts for filter dropdown
      const districts = Array.from(districtNames.entries()).map(([id, name]) => ({ id, name }));
      districts.sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        staleStores,
        thresholdDays: verificationCycleDays,
        totalCount: staleStores.length,
        districts,
      });
    } catch (error) {
      console.error('Stale stores error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to fetch stale stores', requestId: res.locals.requestId },
      });
    }
  });

  // CSV export endpoint
  router.get('/export', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Authentication required', requestId: res.locals.requestId },
        });
      }

      if (!['Admin', 'Steward', 'Leader'].includes(authUser.role)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Access denied', requestId: res.locals.requestId },
        });
      }

      const { districtId, minDaysOverdue, maxDaysOverdue } = req.query;
      const minDays = minDaysOverdue ? parseInt(minDaysOverdue as string, 10) : null;
      const maxDays = maxDaysOverdue ? parseInt(maxDaysOverdue as string, 10) : null;
      
      const workflowRules = await getWorkflowRules(db);
      const verificationCycleDays = workflowRules.verificationCycleDays;
      
      const now = Date.now();
      const thresholdDate = new Date(now - verificationCycleDays * 24 * 60 * 60 * 1000);

      const baseQuery = db.collection('locations')
        .where('lifecycle', '==', 'active')
        .where('kind', '==', 'store');

      let snapshots: FirebaseFirestore.QuerySnapshot[] = [];
      
      if (authUser.role === 'Leader' && authUser.leaderScope?.districtIds?.length) {
        const uniqueDistrictIds = [...new Set(authUser.leaderScope.districtIds)];
        const BATCH_SIZE = 30;
        for (let i = 0; i < uniqueDistrictIds.length; i += BATCH_SIZE) {
          const batch = uniqueDistrictIds.slice(i, i + BATCH_SIZE);
          const batchQuery = baseQuery.where('districtId', 'in', batch);
          snapshots.push(await batchQuery.get());
        }
      } else {
        snapshots.push(await baseQuery.get());
      }
      
      const allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      for (const snapshot of snapshots) {
        allDocs.push(...snapshot.docs);
      }

      const districtIds = new Set<string>();
      const regionIds = new Set<string>();
      const locations: Location[] = [];
      const seenLocationIds = new Set<string>();

      allDocs.forEach(doc => {
        if (seenLocationIds.has(doc.id)) return;
        seenLocationIds.add(doc.id);
        const data = { id: doc.id, ...doc.data() } as Location;
        locations.push(data);
        if (data.districtId) districtIds.add(data.districtId);
        if (data.regionId) regionIds.add(data.regionId);
      });

      const districtNames = new Map<string, string>();
      const regionNames = new Map<string, string>();

      if (districtIds.size > 0) {
        const districtDocs = await Promise.all(
          Array.from(districtIds).map(id => db.collection('districts').doc(id).get())
        );
        districtDocs.forEach(doc => {
          if (doc.exists) {
            const data = doc.data();
            if (data?.name) districtNames.set(doc.id, data.name);
          }
        });
      }

      if (regionIds.size > 0) {
        const regionDocs = await Promise.all(
          Array.from(regionIds).map(id => db.collection('regions').doc(id).get())
        );
        regionDocs.forEach(doc => {
          if (doc.exists) {
            const data = doc.data();
            if (data?.name) regionNames.set(doc.id, data.name);
          }
        });
      }

      const staleStores: StaleStoreItem[] = [];

      for (const location of locations) {
        const lastVerifiedAt = location.lastVerifiedAt;
        let isStale = false;
        let daysSinceVerification: number | null = null;

        if (!lastVerifiedAt) {
          isStale = true;
          daysSinceVerification = null;
        } else {
          const verifiedDate = new Date(lastVerifiedAt);
          if (verifiedDate < thresholdDate) {
            isStale = true;
          }
          daysSinceVerification = Math.floor((now - verifiedDate.getTime()) / (24 * 60 * 60 * 1000));
        }

        if (isStale) {
          const daysOverdue = daysSinceVerification !== null 
            ? daysSinceVerification - verificationCycleDays 
            : null;
          
          if (districtId && location.districtId !== districtId) continue;
          if (minDays !== null && (daysOverdue === null || daysOverdue < minDays)) continue;
          if (maxDays !== null && daysOverdue !== null && daysOverdue > maxDays) continue;
          
          staleStores.push({
            id: location.id,
            storeNumber: location.storeNumber,
            name: location.name,
            districtId: location.districtId,
            districtName: districtNames.get(location.districtId),
            regionId: location.regionId,
            regionName: regionNames.get(location.regionId),
            lastVerifiedAt,
            daysSinceVerification,
          });
        }
      }

      staleStores.sort((a, b) => {
        if (a.daysSinceVerification === null && b.daysSinceVerification === null) {
          return a.storeNumber.localeCompare(b.storeNumber);
        }
        if (a.daysSinceVerification === null) return -1;
        if (b.daysSinceVerification === null) return 1;
        return b.daysSinceVerification - a.daysSinceVerification;
      });

      // Generate CSV with proper escaping
      const csvHeader = 'Store Number,Store Name,District,Region,Last Verified,Days Since Verification,Days Overdue\n';
      const csvRows = staleStores.map(store => {
        const daysOverdue = store.daysSinceVerification !== null 
          ? store.daysSinceVerification - verificationCycleDays
          : 'Never';
        const lastVerified = store.lastVerifiedAt 
          ? new Date(store.lastVerifiedAt).toLocaleDateString()
          : 'Never';
        return [
          escapeCsvValue(store.storeNumber),
          escapeCsvValue(store.name),
          escapeCsvValue(store.districtName),
          escapeCsvValue(store.regionName),
          escapeCsvValue(lastVerified),
          escapeCsvValue(store.daysSinceVerification),
          escapeCsvValue(daysOverdue),
        ].join(',');
      }).join('\n');
      
      const csv = csvHeader + csvRows;
      const filename = `stale-stores-${new Date().toISOString().split('T')[0]}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error('Stale stores export error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to export stale stores', requestId: res.locals.requestId },
      });
    }
  });

  return router;
}

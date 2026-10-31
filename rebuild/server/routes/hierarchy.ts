import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  Region,
  District,
  Location,
  AuthUser,
  AuditLogEntry,
  Assignment,
} from '../../src/types';
import { isAssignmentActive, getLocalDate } from '../utils/assignment';

function canManageHierarchy(role: string): boolean {
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

export function createHierarchyRouter(db: Firestore): Router {
  const router = Router();

  router.get('/tree', async (_req: Request, res: Response) => {
    try {
      const [regionsSnap, districtsSnap, locationsSnap, assignmentsSnap] = await Promise.all([
        db.collection('regions').where('lifecycle', '==', 'active').get(),
        db.collection('districts').where('lifecycle', '==', 'active').get(),
        db.collection('locations').where('lifecycle', '==', 'active').get(),
        db.collection('assignments').get(),
      ]);

      const peopleIds = new Set<string>();
      assignmentsSnap.docs.forEach(doc => {
        const a = doc.data() as Assignment;
        peopleIds.add(a.personId);
      });

      const peopleSnap = peopleIds.size > 0
        ? await db.collection('people').where('lifecycle', '==', 'active').get()
        : { docs: [] };

      const peopleMap = new Map(
        peopleSnap.docs.map(doc => [doc.id, doc.data().fullName as string])
      );

      const localDate = getLocalDate();

      const regions = regionsSnap.docs.map(doc => {
        const region = { id: doc.id, ...doc.data() } as Region;
        
        const rmAssignment = assignmentsSnap.docs.find(a => {
          const assignment = a.data() as Assignment;
          return assignment.scopeType === 'region' 
            && assignment.scopeId === doc.id 
            && assignment.role === 'RM'
            && isAssignmentActive(assignment, localDate);
        });

        return {
          id: region.id,
          code: region.code,
          name: region.name,
          rmName: rmAssignment ? peopleMap.get((rmAssignment.data() as Assignment).personId) : undefined,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      const districts = districtsSnap.docs.map(doc => {
        const district = { id: doc.id, ...doc.data() } as District;

        const dmAssignment = assignmentsSnap.docs.find(a => {
          const assignment = a.data() as Assignment;
          return assignment.scopeType === 'district' 
            && assignment.scopeId === doc.id 
            && assignment.role === 'DM'
            && isAssignmentActive(assignment, localDate);
        });

        return {
          id: district.id,
          code: district.code,
          name: district.name,
          regionId: district.regionId,
          dmName: dmAssignment ? peopleMap.get((dmAssignment.data() as Assignment).personId) : undefined,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      const locations = locationsSnap.docs.map(doc => {
        const location = { id: doc.id, ...doc.data() } as Location;

        const smAssignment = assignmentsSnap.docs.find(a => {
          const assignment = a.data() as Assignment;
          return assignment.scopeType === 'location' 
            && assignment.scopeId === doc.id 
            && assignment.role === 'SM'
            && assignment.slot === 'primary'
            && isAssignmentActive(assignment, localDate);
        });

        return {
          id: location.id,
          storeNumber: location.storeNumber,
          name: location.name,
          kind: location.kind,
          districtId: location.districtId,
          regionId: location.regionId,
          smName: smAssignment ? peopleMap.get((smAssignment.data() as Assignment).personId) : undefined,
        };
      }).sort((a, b) => {
        const numA = parseInt(a.storeNumber, 10);
        const numB = parseInt(b.storeNumber, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.storeNumber.localeCompare(b.storeNumber);
      });

      return res.json({
        data: {
          regions,
          districts,
          locations,
        },
      });
    } catch (error) {
      console.error('Get hierarchy tree error:', error);
      return res.status(500).json({
        error: { code: 'tree_error', message: 'Failed to get hierarchy tree', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/regions', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canManageHierarchy(authUser.role)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward and Admin can manage regions', requestId: res.locals.requestId },
        });
      }

      const { code, name } = req.body;

      if (!code || typeof code !== 'string' || code.trim().length === 0) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'code is required', requestId: res.locals.requestId },
        });
      }

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'name is required', requestId: res.locals.requestId },
        });
      }

      const existingCode = await db.collection('regions')
        .where('code', '==', code.trim().toUpperCase())
        .where('lifecycle', '==', 'active')
        .get();

      if (!existingCode.empty) {
        return res.status(400).json({
          error: { code: 'duplicate_code', message: 'Region code already exists', requestId: res.locals.requestId },
        });
      }

      const now = new Date().toISOString();
      const regionRef = db.collection('regions').doc();

      const region: Omit<Region, 'id'> = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
        updatedBy: authUser.uid,
        version: 1,
      };

      await regionRef.set(region);

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'location',
        entityId: regionRef.id,
        entityName: `Region: ${region.name}`,
        changes: [
          { field: 'code', newValue: region.code },
          { field: 'name', newValue: region.name },
        ],
      });

      return res.status(201).json({
        data: { id: regionRef.id, ...region },
      });
    } catch (error) {
      console.error('Create region error:', error);
      return res.status(500).json({
        error: { code: 'create_error', message: 'Failed to create region', requestId: res.locals.requestId },
      });
    }
  });

  router.patch('/regions/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canManageHierarchy(authUser.role)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward and Admin can manage regions', requestId: res.locals.requestId },
        });
      }

      const regionDoc = await db.collection('regions').doc(id).get();
      if (!regionDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Region not found', requestId: res.locals.requestId },
        });
      }

      const currentRegion = regionDoc.data() as Region;
      const { name, code } = req.body;

      const changes: { field: string; oldValue?: string | null; newValue?: string | null }[] = [];
      const updateData: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        version: (currentRegion.version || 0) + 1,
      };

      if (name !== undefined && name !== currentRegion.name) {
        updateData.name = name.trim();
        changes.push({ field: 'name', oldValue: currentRegion.name, newValue: name.trim() });
      }

      if (code !== undefined && code !== currentRegion.code) {
        const newCode = code.trim().toUpperCase();
        const existingCode = await db.collection('regions')
          .where('code', '==', newCode)
          .where('lifecycle', '==', 'active')
          .get();

        if (!existingCode.empty && existingCode.docs[0].id !== id) {
          return res.status(400).json({
            error: { code: 'duplicate_code', message: 'Region code already exists', requestId: res.locals.requestId },
          });
        }

        updateData.code = newCode;
        changes.push({ field: 'code', oldValue: currentRegion.code, newValue: newCode });
      }

      if (changes.length === 0) {
        const { id: _id, ...regionData } = currentRegion;
        return res.json({ data: { id, ...regionData } });
      }

      await regionDoc.ref.update(updateData);

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'location',
        entityId: id,
        entityName: `Region: ${updateData.name || currentRegion.name}`,
        changes,
      });

      const updatedDoc = await db.collection('regions').doc(id).get();
      return res.json({ data: { id, ...updatedDoc.data() } });
    } catch (error) {
      console.error('Update region error:', error);
      return res.status(500).json({
        error: { code: 'update_error', message: 'Failed to update region', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/regions/:id/retire', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canManageHierarchy(authUser.role)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward and Admin can retire regions', requestId: res.locals.requestId },
        });
      }

      const regionDoc = await db.collection('regions').doc(id).get();
      if (!regionDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Region not found', requestId: res.locals.requestId },
        });
      }

      const currentRegion = regionDoc.data() as Region;

      const activeDistricts = await db.collection('districts')
        .where('regionId', '==', id)
        .where('lifecycle', '==', 'active')
        .get();

      if (!activeDistricts.empty) {
        return res.status(400).json({
          error: { 
            code: 'has_children', 
            message: `Region has ${activeDistricts.size} active district(s). Move or retire them first.`,
            requestId: res.locals.requestId,
          },
        });
      }

      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      const activeAssignments = await db.collection('assignments')
        .where('scopeType', '==', 'region')
        .where('scopeId', '==', id)
        .get();

      const batch = db.batch();
      let assignmentsEnded = 0;

      for (const doc of activeAssignments.docs) {
        const assignment = doc.data() as Assignment;
        if (isAssignmentActive(assignment, todayStr)) {
          batch.update(doc.ref, {
            endDate: todayStr,
            endedAt: now.toISOString(),
            updatedAt: now.toISOString(),
            updatedBy: authUser.uid,
          });
          assignmentsEnded++;

          await logAudit(db, {
            userId: authUser.uid,
            userEmail: authUser.email,
            userRole: authUser.role,
            action: 'unassign',
            entityType: 'assignment',
            entityId: doc.id,
            entityName: `${assignment.role} assignment ended (region retired)`,
            changes: [
              { field: 'endDate', newValue: todayStr },
              { field: 'reason', newValue: 'region retired' },
            ],
          });
        }
      }

      batch.update(regionDoc.ref, {
        lifecycle: 'retired',
        updatedAt: now.toISOString(),
        updatedBy: authUser.uid,
        version: (currentRegion.version || 0) + 1,
      });

      await batch.commit();

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'location',
        entityId: id,
        entityName: `Region: ${currentRegion.name}`,
        changes: [
          { field: 'lifecycle', oldValue: 'active', newValue: 'retired' },
        ],
      });

      return res.json({ data: { id, retired: true, assignmentsEnded } });
    } catch (error) {
      console.error('Retire region error:', error);
      return res.status(500).json({
        error: { code: 'retire_error', message: 'Failed to retire region', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/districts', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canManageHierarchy(authUser.role)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward and Admin can manage districts', requestId: res.locals.requestId },
        });
      }

      const { code, name, regionId } = req.body;

      if (!code || typeof code !== 'string' || code.trim().length === 0) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'code is required', requestId: res.locals.requestId },
        });
      }

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'name is required', requestId: res.locals.requestId },
        });
      }

      if (!regionId) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'regionId is required', requestId: res.locals.requestId },
        });
      }

      const regionDoc = await db.collection('regions').doc(regionId).get();
      if (!regionDoc.exists || (regionDoc.data() as Region).lifecycle !== 'active') {
        return res.status(400).json({
          error: { code: 'invalid_region', message: 'Region not found or not active', requestId: res.locals.requestId },
        });
      }

      const existingCode = await db.collection('districts')
        .where('code', '==', code.trim().toUpperCase())
        .where('lifecycle', '==', 'active')
        .get();

      if (!existingCode.empty) {
        return res.status(400).json({
          error: { code: 'duplicate_code', message: 'District code already exists', requestId: res.locals.requestId },
        });
      }

      const now = new Date().toISOString();
      const districtRef = db.collection('districts').doc();

      const district: Omit<District, 'id'> = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        regionId,
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
        updatedBy: authUser.uid,
        version: 1,
      };

      await districtRef.set(district);

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'location',
        entityId: districtRef.id,
        entityName: `District: ${district.name}`,
        changes: [
          { field: 'code', newValue: district.code },
          { field: 'name', newValue: district.name },
          { field: 'regionId', newValue: regionId },
        ],
      });

      return res.status(201).json({
        data: { id: districtRef.id, ...district },
      });
    } catch (error) {
      console.error('Create district error:', error);
      return res.status(500).json({
        error: { code: 'create_error', message: 'Failed to create district', requestId: res.locals.requestId },
      });
    }
  });

  router.patch('/districts/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canManageHierarchy(authUser.role)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward and Admin can manage districts', requestId: res.locals.requestId },
        });
      }

      const districtDoc = await db.collection('districts').doc(id).get();
      if (!districtDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'District not found', requestId: res.locals.requestId },
        });
      }

      const currentDistrict = districtDoc.data() as District;
      const { name, code, regionId } = req.body;

      const changes: { field: string; oldValue?: string | null; newValue?: string | null }[] = [];
      const updateData: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        version: (currentDistrict.version || 0) + 1,
      };

      if (name !== undefined && name !== currentDistrict.name) {
        updateData.name = name.trim();
        changes.push({ field: 'name', oldValue: currentDistrict.name, newValue: name.trim() });
      }

      if (code !== undefined && code !== currentDistrict.code) {
        const newCode = code.trim().toUpperCase();
        const existingCode = await db.collection('districts')
          .where('code', '==', newCode)
          .where('lifecycle', '==', 'active')
          .get();

        if (!existingCode.empty && existingCode.docs[0].id !== id) {
          return res.status(400).json({
            error: { code: 'duplicate_code', message: 'District code already exists', requestId: res.locals.requestId },
          });
        }

        updateData.code = newCode;
        changes.push({ field: 'code', oldValue: currentDistrict.code, newValue: newCode });
      }

      if (regionId !== undefined && regionId !== currentDistrict.regionId) {
        const regionDoc = await db.collection('regions').doc(regionId).get();
        if (!regionDoc.exists || (regionDoc.data() as Region).lifecycle !== 'active') {
          return res.status(400).json({
            error: { code: 'invalid_region', message: 'Region not found or not active', requestId: res.locals.requestId },
          });
        }

        updateData.regionId = regionId;
        changes.push({ field: 'regionId', oldValue: currentDistrict.regionId, newValue: regionId });

        const locationsInDistrict = await db.collection('locations')
          .where('districtId', '==', id)
          .where('lifecycle', '==', 'active')
          .get();

        if (!locationsInDistrict.empty) {
          const batch = db.batch();
          for (const locDoc of locationsInDistrict.docs) {
            batch.update(locDoc.ref, { regionId });
          }
          await batch.commit();
        }
      }

      if (changes.length === 0) {
        const { id: _id, ...districtData } = currentDistrict;
        return res.json({ data: { id, ...districtData } });
      }

      await districtDoc.ref.update(updateData);

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'location',
        entityId: id,
        entityName: `District: ${updateData.name || currentDistrict.name}`,
        changes,
      });

      const updatedDoc = await db.collection('districts').doc(id).get();
      return res.json({ data: { id, ...updatedDoc.data() } });
    } catch (error) {
      console.error('Update district error:', error);
      return res.status(500).json({
        error: { code: 'update_error', message: 'Failed to update district', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/districts/:id/retire', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canManageHierarchy(authUser.role)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward and Admin can retire districts', requestId: res.locals.requestId },
        });
      }

      const districtDoc = await db.collection('districts').doc(id).get();
      if (!districtDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'District not found', requestId: res.locals.requestId },
        });
      }

      const currentDistrict = districtDoc.data() as District;

      const activeLocations = await db.collection('locations')
        .where('districtId', '==', id)
        .where('lifecycle', '==', 'active')
        .get();

      if (!activeLocations.empty) {
        return res.status(400).json({
          error: { 
            code: 'has_children', 
            message: `District has ${activeLocations.size} active location(s). Move or retire them first.`,
            requestId: res.locals.requestId,
          },
        });
      }

      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      const activeAssignments = await db.collection('assignments')
        .where('scopeType', '==', 'district')
        .where('scopeId', '==', id)
        .get();

      const batch = db.batch();
      let assignmentsEnded = 0;

      for (const doc of activeAssignments.docs) {
        const assignment = doc.data() as Assignment;
        if (isAssignmentActive(assignment, todayStr)) {
          batch.update(doc.ref, {
            endDate: todayStr,
            endedAt: now.toISOString(),
            updatedAt: now.toISOString(),
            updatedBy: authUser.uid,
          });
          assignmentsEnded++;

          await logAudit(db, {
            userId: authUser.uid,
            userEmail: authUser.email,
            userRole: authUser.role,
            action: 'unassign',
            entityType: 'assignment',
            entityId: doc.id,
            entityName: `${assignment.role} assignment ended (district retired)`,
            changes: [
              { field: 'endDate', newValue: todayStr },
              { field: 'reason', newValue: 'district retired' },
            ],
          });
        }
      }

      batch.update(districtDoc.ref, {
        lifecycle: 'retired',
        updatedAt: now.toISOString(),
        updatedBy: authUser.uid,
        version: (currentDistrict.version || 0) + 1,
      });

      await batch.commit();

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'location',
        entityId: id,
        entityName: `District: ${currentDistrict.name}`,
        changes: [
          { field: 'lifecycle', oldValue: 'active', newValue: 'retired' },
        ],
      });

      return res.json({ data: { id, retired: true, assignmentsEnded } });
    } catch (error) {
      console.error('Retire district error:', error);
      return res.status(500).json({
        error: { code: 'retire_error', message: 'Failed to retire district', requestId: res.locals.requestId },
      });
    }
  });

  router.patch('/locations/:id/move', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canManageHierarchy(authUser.role)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward and Admin can move locations', requestId: res.locals.requestId },
        });
      }

      const { districtId, regionId } = req.body;

      if (!districtId && !regionId) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'districtId or regionId is required', requestId: res.locals.requestId },
        });
      }

      const locationDoc = await db.collection('locations').doc(id).get();
      if (!locationDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Location not found', requestId: res.locals.requestId },
        });
      }

      const currentLocation = locationDoc.data() as Location;
      const now = new Date().toISOString();
      const changes: { field: string; oldValue?: string | null; newValue?: string | null }[] = [];

      let newDistrictId = currentLocation.districtId;
      let newRegionId = currentLocation.regionId;

      if (districtId) {
        const districtDoc = await db.collection('districts').doc(districtId).get();
        if (!districtDoc.exists || (districtDoc.data() as District).lifecycle !== 'active') {
          return res.status(400).json({
            error: { code: 'invalid_district', message: 'District not found or not active', requestId: res.locals.requestId },
          });
        }
        const district = districtDoc.data() as District;
        newDistrictId = districtId;
        newRegionId = district.regionId;
        changes.push({ field: 'districtId', oldValue: currentLocation.districtId, newValue: districtId });
        changes.push({ field: 'regionId', oldValue: currentLocation.regionId, newValue: district.regionId });
      } else if (regionId) {
        const regionDoc = await db.collection('regions').doc(regionId).get();
        if (!regionDoc.exists || (regionDoc.data() as Region).lifecycle !== 'active') {
          return res.status(400).json({
            error: { code: 'invalid_region', message: 'Region not found or not active', requestId: res.locals.requestId },
          });
        }
        newDistrictId = '';
        newRegionId = regionId;
        changes.push({ field: 'districtId', oldValue: currentLocation.districtId, newValue: '' });
        changes.push({ field: 'regionId', oldValue: currentLocation.regionId, newValue: regionId });
      }

      await locationDoc.ref.update({
        districtId: newDistrictId,
        regionId: newRegionId,
        updatedAt: now,
        updatedBy: authUser.uid,
        version: (currentLocation.version || 0) + 1,
      });

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'location',
        entityId: id,
        entityName: `#${currentLocation.storeNumber} ${currentLocation.name}`,
        locationId: id,
        changes,
      });

      const updatedDoc = await db.collection('locations').doc(id).get();
      return res.json({ data: { id, ...updatedDoc.data() } });
    } catch (error) {
      console.error('Move location error:', error);
      return res.status(500).json({
        error: { code: 'move_error', message: 'Failed to move location', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/locations/:id/retire', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canManageHierarchy(authUser.role)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward and Admin can retire locations', requestId: res.locals.requestId },
        });
      }

      const locationDoc = await db.collection('locations').doc(id).get();
      if (!locationDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Location not found', requestId: res.locals.requestId },
        });
      }

      const currentLocation = locationDoc.data() as Location;

      if (currentLocation.lifecycle === 'retired') {
        return res.status(400).json({
          error: { code: 'already_retired', message: 'Location is already retired', requestId: res.locals.requestId },
        });
      }

      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      const activeAssignments = await db.collection('assignments')
        .where('scopeType', '==', 'location')
        .where('scopeId', '==', id)
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

      batch.update(locationDoc.ref, {
        lifecycle: 'retired',
        updatedAt: now.toISOString(),
        updatedBy: authUser.uid,
        version: (currentLocation.version || 0) + 1,
      });

      await batch.commit();

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'location',
        entityId: id,
        entityName: `#${currentLocation.storeNumber} ${currentLocation.name}`,
        locationId: id,
        changes: [
          { field: 'lifecycle', oldValue: 'active', newValue: 'retired' },
        ],
      });

      return res.json({
        data: { id, retired: true, assignmentsEnded: activeAssignments.size },
      });
    } catch (error) {
      console.error('Retire location error:', error);
      return res.status(500).json({
        error: { code: 'retire_error', message: 'Failed to retire location', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/locations', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (!canManageHierarchy(authUser.role)) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Steward and Admin can create locations', requestId: res.locals.requestId },
        });
      }

      const { 
        storeNumber, 
        name, 
        kind = 'store', 
        districtId, 
        address, 
        timeZone = 'America/Los_Angeles',
        mainPhone,
      } = req.body;

      if (!storeNumber || typeof storeNumber !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'storeNumber is required', requestId: res.locals.requestId },
        });
      }

      if (!name || typeof name !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'name is required', requestId: res.locals.requestId },
        });
      }

      if (!districtId && !req.body.regionId) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'districtId or regionId is required', requestId: res.locals.requestId },
        });
      }

      if (!address || !address.street || !address.city || !address.state || !address.zip) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'Full address is required (street, city, state, zip)', requestId: res.locals.requestId },
        });
      }

      const existingStoreNumber = await db.collection('locations')
        .where('storeNumber', '==', storeNumber)
        .where('lifecycle', '!=', 'retired')
        .get();

      if (!existingStoreNumber.empty) {
        return res.status(400).json({
          error: { code: 'duplicate_store_number', message: 'Store number already exists', requestId: res.locals.requestId },
        });
      }

      let finalDistrictId = '';
      let finalRegionId = '';

      if (districtId) {
        const districtDoc = await db.collection('districts').doc(districtId).get();
        if (!districtDoc.exists || (districtDoc.data() as District).lifecycle !== 'active') {
          return res.status(400).json({
            error: { code: 'invalid_district', message: 'District not found or not active', requestId: res.locals.requestId },
          });
        }
        const district = districtDoc.data() as District;
        finalDistrictId = districtId;
        finalRegionId = district.regionId;
      } else if (req.body.regionId) {
        const regionDoc = await db.collection('regions').doc(req.body.regionId).get();
        if (!regionDoc.exists || (regionDoc.data() as Region).lifecycle !== 'active') {
          return res.status(400).json({
            error: { code: 'invalid_region', message: 'Region not found or not active', requestId: res.locals.requestId },
          });
        }
        finalRegionId = req.body.regionId;
      }

      const now = new Date().toISOString();
      const locationRef = db.collection('locations').doc();

      const location: Omit<Location, 'id'> = {
        storeNumber: storeNumber.trim(),
        name: name.trim(),
        kind,
        lifecycle: 'active',
        districtId: finalDistrictId,
        regionId: finalRegionId,
        address: {
          street: address.street.trim(),
          suite: address.suite?.trim() || undefined,
          city: address.city.trim(),
          state: address.state.trim().toUpperCase(),
          zip: address.zip.trim(),
          country: address.country || 'US',
        },
        timeZone,
        mainPhone: mainPhone || '',
        phonePublic: true,
        createdAt: now,
        updatedAt: now,
        updatedBy: authUser.uid,
        version: 1,
      };

      await locationRef.set(location);

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'location',
        entityId: locationRef.id,
        entityName: `#${location.storeNumber} ${location.name}`,
        locationId: locationRef.id,
        changes: [
          { field: 'storeNumber', newValue: location.storeNumber },
          { field: 'name', newValue: location.name },
          { field: 'districtId', newValue: districtId },
        ],
      });

      return res.status(201).json({
        data: { id: locationRef.id, ...location },
      });
    } catch (error) {
      console.error('Create location error:', error);
      return res.status(500).json({
        error: { code: 'create_error', message: 'Failed to create location', requestId: res.locals.requestId },
      });
    }
  });

  return router;
}

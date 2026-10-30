import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { parse } from 'csv-parse/sync';
import type {
  Location,
  Person,
  Assignment,
  Region,
  District,
  ImportPreview,
  ImportResult,
  ImportError,
  ImportWarning,
  StandardHours,
  DayOfWeek,
  Address,
} from '../../src/types';
import { normalizePhoneNumber } from '../utils/phone';

interface CsvRow {
  [key: string]: string;
}

const REQUIRED_LOCATION_COLUMNS = [
  'storeNumber', 'name', 'street', 'city', 'state', 'zip', 'mainPhone', 'timeZone'
];

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function createImportRouter(db: Firestore): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const dryRun = req.query.dryRun === 'true';
    const { csv, type } = req.body;
    
    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({
        error: {
          code: 'invalid_input',
          message: 'CSV data is required',
          requestId: res.locals.requestId,
        },
      });
    }
    
    if (!type || !['locations', 'people', 'assignments', 'all'].includes(type)) {
      return res.status(400).json({
        error: {
          code: 'invalid_type',
          message: 'Import type must be one of: locations, people, assignments, all',
          requestId: res.locals.requestId,
        },
      });
    }
    
    try {
      const records = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }) as CsvRow[];
      
      if (records.length === 0) {
        return res.status(400).json({
          error: {
            code: 'empty_csv',
            message: 'CSV file is empty or has no data rows',
            requestId: res.locals.requestId,
          },
        });
      }
      
      const errors: ImportError[] = [];
      const warnings: ImportWarning[] = [];
      
      const preview: ImportPreview = {
        valid: true,
        errors,
        warnings,
        locationsToCreate: 0,
        locationsToUpdate: 0,
        peopleToCreate: 0,
        peopleToUpdate: 0,
        assignmentsToCreate: 0,
        assignmentsToRemove: 0,
      };
      
      if (type === 'locations' || type === 'all') {
        await processLocations(db, records, preview, dryRun, res.locals.user?.uid || 'system');
      }
      
      if (type === 'people' || type === 'all') {
        await processPeople(db, records, preview, dryRun, res.locals.user?.uid || 'system');
      }
      
      if (type === 'assignments' || type === 'all') {
        await processAssignments(db, records, preview, dryRun, res.locals.user?.uid || 'system');
      }
      
      preview.valid = errors.length === 0;
      
      if (dryRun) {
        return res.json({ data: preview });
      }
      
      if (!preview.valid) {
        return res.status(400).json({
          error: {
            code: 'validation_failed',
            message: 'Import validation failed',
            fieldErrors: Object.fromEntries(
              errors.slice(0, 10).map(e => [`row_${e.row}`, e.message])
            ),
            requestId: res.locals.requestId,
          },
        });
      }
      
      const result: ImportResult = {
        success: true,
        locationsCreated: preview.locationsToCreate,
        locationsUpdated: preview.locationsToUpdate,
        peopleCreated: preview.peopleToCreate,
        peopleUpdated: preview.peopleToUpdate,
        assignmentsCreated: preview.assignmentsToCreate,
        assignmentsRemoved: preview.assignmentsToRemove,
        errors: [],
      };
      
      return res.json({ data: result });
    } catch (error) {
      console.error('Import error:', error);
      return res.status(400).json({
        error: {
          code: 'parse_error',
          message: error instanceof Error ? error.message : 'Failed to parse CSV',
          requestId: res.locals.requestId,
        },
      });
    }
  });

  return router;
}

async function processLocations(
  db: Firestore,
  records: CsvRow[],
  preview: ImportPreview,
  dryRun: boolean,
  updatedBy: string
): Promise<void> {
  const now = new Date().toISOString();
  const existingLocations = new Map<string, { id: string; data: Location }>();
  
  const locationsSnap = await db.collection('locations').get();
  for (const doc of locationsSnap.docs) {
    const data = doc.data() as Location;
    if (data.lifecycle !== 'retired') {
      existingLocations.set(data.storeNumber, { id: doc.id, data: { ...data, id: doc.id } });
    }
  }
  
  const regionsSnap = await db.collection('regions').where('lifecycle', '==', 'active').get();
  const regions = new Map<string, Region>();
  for (const doc of regionsSnap.docs) {
    const region = { id: doc.id, ...doc.data() } as Region;
    regions.set(region.code, region);
  }
  
  const districtsSnap = await db.collection('districts').where('lifecycle', '==', 'active').get();
  const districts = new Map<string, District>();
  for (const doc of districtsSnap.docs) {
    const district = { id: doc.id, ...doc.data() } as District;
    districts.set(district.code, district);
  }
  
  const batch = db.batch();
  let batchCount = 0;
  const MAX_BATCH = 500;
  
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2;
    
    if (!row.storeNumber && !row.name) continue;
    
    for (const col of REQUIRED_LOCATION_COLUMNS) {
      if (!row[col]?.trim()) {
        preview.errors.push({
          row: rowNum,
          column: col,
          message: `Missing required field: ${col}`,
        });
      }
    }
    
    if (preview.errors.some(e => e.row === rowNum)) continue;
    
    const storeNumber = row.storeNumber.trim();
    const phone = normalizePhoneNumber(row.mainPhone);
    
    if (!phone) {
      preview.errors.push({
        row: rowNum,
        column: 'mainPhone',
        message: 'Invalid phone number format',
      });
      continue;
    }
    
    const address: Address = {
      street: row.street.trim(),
      suite: row.suite?.trim() || undefined,
      city: row.city.trim(),
      state: row.state.trim().toUpperCase(),
      zip: row.zip.trim(),
      country: row.country?.trim() || 'US',
    };
    
    let regionId = '';
    let districtId = '';
    
    if (row.regionCode) {
      const region = regions.get(row.regionCode.trim());
      if (region) {
        regionId = region.id;
      } else {
        preview.warnings.push({
          row: rowNum,
          column: 'regionCode',
          message: `Region not found: ${row.regionCode}`,
        });
      }
    }
    
    if (row.districtCode) {
      const district = districts.get(row.districtCode.trim());
      if (district) {
        districtId = district.id;
        if (!regionId && district.regionId) {
          regionId = district.regionId;
        }
      } else {
        preview.warnings.push({
          row: rowNum,
          column: 'districtCode',
          message: `District not found: ${row.districtCode}`,
        });
      }
    }
    
    const standardHours = parseStandardHours(row);
    
    const kindValue = (row.kind?.trim().toLowerCase() || 'store') as Location['kind'];
    const validKinds: Location['kind'][] = ['store', 'warehouse', 'office'];
    if (!validKinds.includes(kindValue)) {
      preview.errors.push({
        row: rowNum,
        column: 'kind',
        message: `Invalid kind: ${row.kind}. Must be store, warehouse, or office.`,
      });
      continue;
    }
    
    const locationData: Omit<Location, 'id'> = {
      kind: kindValue,
      storeNumber,
      name: row.name.trim(),
      lifecycle: 'active',
      address,
      timeZone: row.timeZone.trim(),
      mainPhone: phone,
      phonePublic: row.phonePublic?.toLowerCase() !== 'false',
      sharedInboxEmail: row.sharedInboxEmail?.trim() || undefined,
      regionId,
      districtId,
      storeType: row.storeType?.trim() || undefined,
      mallOrCenterName: row.mallOrCenterName?.trim() || undefined,
      wayfindingDirections: row.wayfindingDirections?.trim().slice(0, 1000) || undefined,
      standardHours,
      createdAt: now,
      updatedAt: now,
      updatedBy,
      version: 1,
    };
    
    const existing = existingLocations.get(storeNumber);
    
    if (existing) {
      preview.locationsToUpdate++;
      if (!dryRun) {
        const updateData = {
          ...locationData,
          createdAt: existing.data.createdAt,
          version: (existing.data.version || 0) + 1,
        };
        batch.update(db.collection('locations').doc(existing.id), updateData);
        batchCount++;
      }
    } else {
      preview.locationsToCreate++;
      if (!dryRun) {
        const newRef = db.collection('locations').doc();
        batch.set(newRef, locationData);
        batchCount++;
      }
    }
    
    if (!dryRun && batchCount >= MAX_BATCH) {
      await batch.commit();
      batchCount = 0;
    }
  }
  
  if (!dryRun && batchCount > 0) {
    await batch.commit();
  }
}

async function processPeople(
  db: Firestore,
  records: CsvRow[],
  preview: ImportPreview,
  dryRun: boolean,
  updatedBy: string
): Promise<void> {
  const now = new Date().toISOString();
  const existingPeople = new Map<string, { id: string; data: Person }>();
  
  const peopleSnap = await db.collection('people').get();
  for (const doc of peopleSnap.docs) {
    const data = doc.data() as Person;
    const key = data.fullName.toLowerCase().trim();
    existingPeople.set(key, { id: doc.id, data: { ...data, id: doc.id } });
  }
  
  const batch = db.batch();
  let batchCount = 0;
  const MAX_BATCH = 500;
  
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    
    if (!row.fullName?.trim()) continue;
    
    const fullName = row.fullName.trim();
    const key = fullName.toLowerCase();
    
    const personData: Omit<Person, 'id'> = {
      fullName,
      lifecycle: row.lifecycle === 'inactive' ? 'inactive' : 'active',
      workEmail: row.workEmail?.trim() || undefined,
      workPhone: row.workPhone ? normalizePhoneNumber(row.workPhone) || undefined : undefined,
      mobilePhone: row.mobilePhone ? normalizePhoneNumber(row.mobilePhone) || undefined : undefined,
      homeLocationId: row.homeLocationId?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      updatedBy,
      version: 1,
    };
    
    const existing = existingPeople.get(key);
    
    if (existing) {
      preview.peopleToUpdate++;
      if (!dryRun) {
        const updateData = {
          ...personData,
          createdAt: existing.data.createdAt,
          version: (existing.data.version || 0) + 1,
        };
        batch.update(db.collection('people').doc(existing.id), updateData);
        batchCount++;
      }
    } else {
      preview.peopleToCreate++;
      if (!dryRun) {
        const newRef = db.collection('people').doc();
        batch.set(newRef, personData);
        batchCount++;
      }
    }
    
    if (!dryRun && batchCount >= MAX_BATCH) {
      await batch.commit();
      batchCount = 0;
    }
  }
  
  if (!dryRun && batchCount > 0) {
    await batch.commit();
  }
}

async function processAssignments(
  db: Firestore,
  records: CsvRow[],
  preview: ImportPreview,
  dryRun: boolean,
  updatedBy: string
): Promise<void> {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  
  const peopleSnap = await db.collection('people').get();
  const peopleByName = new Map<string, string>();
  for (const doc of peopleSnap.docs) {
    const data = doc.data() as Person;
    peopleByName.set(data.fullName.toLowerCase().trim(), doc.id);
  }
  
  const locationsSnap = await db.collection('locations').get();
  const locationsByNumber = new Map<string, string>();
  for (const doc of locationsSnap.docs) {
    const data = doc.data() as Location;
    if (data.lifecycle !== 'retired') {
      locationsByNumber.set(data.storeNumber, doc.id);
    }
  }
  
  const districtsSnap = await db.collection('districts').get();
  const districtsByCode = new Map<string, string>();
  for (const doc of districtsSnap.docs) {
    const data = doc.data() as District;
    districtsByCode.set(data.code, doc.id);
  }
  
  const regionsSnap = await db.collection('regions').get();
  const regionsByCode = new Map<string, string>();
  for (const doc of regionsSnap.docs) {
    const data = doc.data() as Region;
    regionsByCode.set(data.code, doc.id);
  }
  
  if (!dryRun) {
    const existingAssignments = await db.collection('assignments').get();
    const batch = db.batch();
    for (const doc of existingAssignments.docs) {
      batch.delete(doc.ref);
    }
    preview.assignmentsToRemove = existingAssignments.size;
    await batch.commit();
  }
  
  const batch = db.batch();
  let batchCount = 0;
  const MAX_BATCH = 500;
  
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2;
    
    if (!row.personName?.trim() || !row.role?.trim()) continue;
    
    const personName = row.personName.trim();
    const personId = peopleByName.get(personName.toLowerCase());
    
    if (!personId) {
      preview.errors.push({
        row: rowNum,
        column: 'personName',
        message: `Person not found: ${personName}`,
      });
      continue;
    }
    
    const role = row.role.trim().toUpperCase() as Assignment['role'];
    if (!['SM', 'ASM', 'KH', 'DM', 'RM', 'OTHER'].includes(role)) {
      preview.errors.push({
        row: rowNum,
        column: 'role',
        message: `Invalid role: ${row.role}`,
      });
      continue;
    }
    
    let scopeType: Assignment['scopeType'];
    let scopeId: string;
    
    if (['SM', 'ASM', 'KH'].includes(role)) {
      scopeType = 'location';
      const storeNumber = row.storeNumber?.trim();
      if (!storeNumber) {
        preview.errors.push({
          row: rowNum,
          column: 'storeNumber',
          message: 'Store number required for SM/ASM/KH roles',
        });
        continue;
      }
      scopeId = locationsByNumber.get(storeNumber) || '';
      if (!scopeId) {
        preview.errors.push({
          row: rowNum,
          column: 'storeNumber',
          message: `Store not found: ${storeNumber}`,
        });
        continue;
      }
    } else if (role === 'DM') {
      scopeType = 'district';
      const districtCode = row.districtCode?.trim();
      if (!districtCode) {
        preview.errors.push({
          row: rowNum,
          column: 'districtCode',
          message: 'District code required for DM role',
        });
        continue;
      }
      scopeId = districtsByCode.get(districtCode) || '';
      if (!scopeId) {
        preview.errors.push({
          row: rowNum,
          column: 'districtCode',
          message: `District not found: ${districtCode}`,
        });
        continue;
      }
    } else if (role === 'RM') {
      scopeType = 'region';
      const regionCode = row.regionCode?.trim();
      if (!regionCode) {
        preview.errors.push({
          row: rowNum,
          column: 'regionCode',
          message: 'Region code required for RM role',
        });
        continue;
      }
      scopeId = regionsByCode.get(regionCode) || '';
      if (!scopeId) {
        preview.errors.push({
          row: rowNum,
          column: 'regionCode',
          message: `Region not found: ${regionCode}`,
        });
        continue;
      }
    } else {
      scopeType = 'location';
      scopeId = row.scopeId?.trim() || '';
    }
    
    const assignment: Omit<Assignment, 'id'> = {
      personId,
      role,
      scopeType,
      scopeId,
      slot: row.slot === 'additional' ? 'additional' : 'primary',
      label: row.label?.trim() || undefined,
      startDate: row.startDate?.trim() || today,
      endDate: row.endDate?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      updatedBy,
      version: 1,
    };
    
    preview.assignmentsToCreate++;
    
    if (!dryRun) {
      const newRef = db.collection('assignments').doc();
      batch.set(newRef, assignment);
      batchCount++;
      
      if (batchCount >= MAX_BATCH) {
        await batch.commit();
        batchCount = 0;
      }
    }
  }
  
  if (!dryRun && batchCount > 0) {
    await batch.commit();
  }
}

function parseStandardHours(row: CsvRow): StandardHours {
  const defaultHours = {
    closed: false,
    intervals: [{ open: '10:00', close: '21:00' }],
  };
  
  const closedDay = { closed: true, intervals: [] };
  
  const hours: StandardHours = {
    monday: { ...defaultHours },
    tuesday: { ...defaultHours },
    wednesday: { ...defaultHours },
    thursday: { ...defaultHours },
    friday: { ...defaultHours },
    saturday: { ...defaultHours },
    sunday: { closed: false, intervals: [{ open: '11:00', close: '19:00' }] },
  };
  
  for (const day of DAYS) {
    const openKey = `${day}Open`;
    const closeKey = `${day}Close`;
    
    if (row[openKey] && row[closeKey]) {
      const open = row[openKey].trim();
      const close = row[closeKey].trim();
      
      if (open.toLowerCase() === 'closed' || close.toLowerCase() === 'closed') {
        hours[day] = closedDay;
      } else if (/^\d{1,2}:\d{2}$/.test(open) && /^\d{1,2}:\d{2}$/.test(close)) {
        hours[day] = {
          closed: false,
          intervals: [{ open: normalizeTime(open), close: normalizeTime(close) }],
        };
      }
    }
  }
  
  return hours;
}

function normalizeTime(time: string): string {
  const [hours, minutes] = time.split(':');
  return `${hours.padStart(2, '0')}:${minutes}`;
}

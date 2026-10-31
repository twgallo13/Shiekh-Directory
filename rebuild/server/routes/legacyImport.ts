import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { parse } from 'csv-parse/sync';
import type {
  Location,
  Person,
  Region,
  District,
  AuthUser,
  Address,
  Assignment,
  StandardHours,
} from '../../src/types';
import { normalizePhoneNumber } from '../utils/phone';
import { createPreImportBackup } from '../scheduledBackup';

interface CsvRow {
  [key: string]: string;
}

interface ImportRowResult {
  row: number;
  storeNumber: string;
  action: 'create' | 'update' | 'skip' | 'error';
  message?: string;
  errors?: string[];
  changes?: string[];
}

interface LegacyImportPreview {
  valid: boolean;
  totalRows: number;
  toCreate: number;
  toUpdate: number;
  toSkip: number;
  errorCount: number;
  rows: ImportRowResult[];
  timestamp: string;
}

interface LegacyImportSession {
  preview: LegacyImportPreview;
  parsedRows: ParsedLocationRow[];
  hoursData?: LegacyHoursData;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

interface ParsedLocationRow {
  row: number;
  action: 'create' | 'update' | 'skip' | 'error';
  existingId?: string;
  data: Partial<Omit<Location, 'id'>> & { hasTemporaryClosure?: boolean };
  smData?: { fullName: string; workPhone?: string; mobilePhone?: string };
  dmData?: { fullName: string };
  asmData?: { fullName: string }[];
  errors: string[];
  changes: string[];
}

interface LegacyHoursEntry {
  open: string;
  close: string;
  isClosed: boolean;
}

interface LegacyHolidayHours {
  id?: string;
  holidayName: string;
  date: string;
  hours: LegacyHoursEntry;
}

interface LegacyStoreHours {
  standardHours: Record<string, LegacyHoursEntry>;
  holidayHours?: LegacyHolidayHours[];
  hoursMode?: string;
  timeZone?: string;
}

type LegacyHoursData = Record<string, LegacyStoreHours>;

const LEGACY_COLUMN_MAP: Record<string, string> = {
  'storenumber': 'storeNumber',
  'store number': 'storeNumber',
  'store #': 'storeNumber',
  'storename': 'name',
  'store name': 'name',
  'location name': 'name',
  'name': 'name',
  'type': 'storeType',
  'storetype': 'storeType',
  'address': 'street',
  'street': 'street',
  'city': 'city',
  'state': 'state',
  'zipcode': 'zip',
  'zip code': 'zip',
  'zip': 'zip',
  'phone': 'mainPhone',
  'mainphone': 'mainPhone',
  'store phone': 'mainPhone',
  'locationinboxemail': 'sharedInboxEmail',
  'sharedinboxemail': 'sharedInboxEmail',
  'location inbox email': 'sharedInboxEmail',
  'store inbox email': 'sharedInboxEmail',
  'regionid': 'regionId',
  'region id': 'regionId',
  'districtid': 'districtId',
  'district id': 'districtId',
  'suite': 'suite',
  'mallorcentername': 'mallOrCenterName',
  'mall or center name': 'mallOrCenterName',
  'wayfindingdirections': 'wayfindingDirections',
  'wayfinding directions': 'wayfindingDirections',
  'timezone': 'timeZone',
  'time zone': 'timeZone',
  'operationalstatus': 'operationalStatus',
  'operational status': 'operationalStatus',
  'recordstatus': 'recordStatus',
  'record status': 'recordStatus',
  'googlereviewurl': 'googleReviewUrl',
  'google review url': 'googleReviewUrl',
  'storepageurl': 'storePageUrl',
  'store page url': 'storePageUrl',
  'hierarchyapplicability': 'hierarchyApplicability',
  'hierarchy applicability': 'hierarchyApplicability',
  'locationid': 'locationId',
  'location id': 'locationId',
  'kind': 'kind',
  'storemanager': 'storeManager',
  'store manager': 'storeManager',
  'storemanagername': 'storeManager',
  'storemanagerphone': 'storeManagerPhone',
  'store manager phone': 'storeManagerPhone',
  'storemanagermobile': 'storeManagerMobile',
  'store manager mobile': 'storeManagerMobile',
  'districtmanager': 'districtManager',
  'district manager': 'districtManager',
  'assistantstoremanagers': 'assistantStoreManagers',
  'assistant store managers': 'assistantStoreManagers',
  'asms': 'assistantStoreManagers',
};

const FACILITY_STORE_NUMBERS = new Set(['01', '04', '86']);

const IMPORT_SESSION_TTL_MS = 30 * 60_000;

export function normalizeStoreNumber(storeNumber: string): string {
  const cleaned = storeNumber.replace(/^#/, '').trim();
  const numeric = cleaned.replace(/^0+/, '') || '0';
  return numeric.padStart(2, '0');
}

export function storeNumbersMatch(a: string, b: string): boolean {
  return normalizeStoreNumber(a) === normalizeStoreNumber(b);
}

export function createLegacyImportRouter(db: Firestore): Router {
  const router = Router();

  router.use((_req: Request, res: Response, next) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    if (!authUser || authUser.role !== 'Admin') {
      return res.status(403).json({
        error: { code: 'access_denied', message: 'Admin access required', requestId: res.locals.requestId },
      });
    }
    next();
  });

  router.post('/preview', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { csv, hoursJson } = req.body;

      if (!csv || typeof csv !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_input', message: 'CSV data is required', requestId: res.locals.requestId },
        });
      }

      if (csv.length > 5_000_000) {
        return res.status(400).json({
          error: { code: 'file_too_large', message: 'CSV file exceeds 5MB limit', requestId: res.locals.requestId },
        });
      }

      let hoursData: LegacyHoursData | undefined;
      if (hoursJson) {
        if (typeof hoursJson === 'string') {
          try {
            hoursData = JSON.parse(hoursJson) as LegacyHoursData;
          } catch {
            return res.status(400).json({
              error: { code: 'invalid_hours', message: 'Invalid hours JSON format', requestId: res.locals.requestId },
            });
          }
        } else if (typeof hoursJson === 'object') {
          hoursData = hoursJson as LegacyHoursData;
        }
      }

      const records = parseCsv(csv);
      if (records.length === 0) {
        return res.status(400).json({
          error: { code: 'empty_csv', message: 'CSV file is empty or has no data rows', requestId: res.locals.requestId },
        });
      }

      const existingData = await loadExistingData(db);
      const parsedRows = parseAndValidateRows(records, existingData, hoursData);
      const preview = buildPreview(parsedRows);

      const sessionId = `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + IMPORT_SESSION_TTL_MS);

      const session: LegacyImportSession = {
        preview,
        parsedRows,
        hoursData,
        userId: authUser.uid,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };

      await db.collection('importSessions').doc(sessionId).set({
        ...session,
        _ttl: expiresAt,
      });

      res.json({ sessionId, preview });
    } catch (error) {
      console.error('Import preview error:', error);
      res.status(400).json({
        error: { code: 'parse_error', message: error instanceof Error ? error.message : 'Failed to parse CSV', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/apply/:sessionId', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { sessionId } = req.params;

      const sessionDoc = await db.collection('importSessions').doc(sessionId).get();
      if (!sessionDoc.exists) {
        return res.status(410).json({
          error: { code: 'session_expired', message: 'Import session expired. Please preview again.', requestId: res.locals.requestId },
        });
      }

      const session = sessionDoc.data() as LegacyImportSession;

      if (session.userId !== authUser.uid) {
        return res.status(403).json({
          error: { code: 'session_mismatch', message: 'Import session belongs to another user', requestId: res.locals.requestId },
        });
      }

      if (new Date(session.expiresAt).getTime() < Date.now()) {
        await sessionDoc.ref.delete();
        return res.status(410).json({
          error: { code: 'session_expired', message: 'Import session expired. Please preview again.', requestId: res.locals.requestId },
        });
      }

      if (!session.preview.valid) {
        return res.status(400).json({
          error: { code: 'invalid_preview', message: 'Cannot apply import with validation errors', requestId: res.locals.requestId },
        });
      }

      const backupResult = await createPreImportBackup(db, authUser.uid, authUser.email);
      if (!backupResult.success) {
        return res.status(500).json({
          error: { 
            code: 'backup_failed', 
            message: `Pre-import backup failed: ${backupResult.error}. Import blocked.`,
            requestId: res.locals.requestId,
          },
        });
      }

      const result = await applyImport(db, session.parsedRows, session.hoursData, authUser);
      await sessionDoc.ref.delete();

      await db.collection('auditLog').add({
        timestamp: new Date().toISOString(),
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'import',
        entityId: sessionId,
        entityName: 'CSV Import',
        changes: [
          { field: 'locationsCreated', newValue: result.created },
          { field: 'locationsUpdated', newValue: result.updated },
          { field: 'locationsSkipped', newValue: result.skipped },
          { field: 'assignmentsCreated', newValue: result.assignmentsCreated },
          { field: 'backupId', newValue: backupResult.backupId },
        ],
      });

      res.json({ 
        success: true, 
        result,
        backup: {
          backupId: backupResult.backupId,
          storagePath: backupResult.storagePath,
          firestoreDocId: backupResult.firestoreDocId,
        },
      });
    } catch (error) {
      console.error('Import apply error:', error);
      res.status(500).json({
        error: { code: 'apply_failed', message: 'Failed to apply import', requestId: res.locals.requestId },
      });
    }
  });

  router.get('/sessions', async (_req: Request, res: Response) => {
    const authUser = res.locals.authUser as AuthUser;
    
    const sessionsSnap = await db.collection('importSessions')
      .where('userId', '==', authUser.uid)
      .where('expiresAt', '>', new Date().toISOString())
      .orderBy('expiresAt', 'desc')
      .limit(10)
      .get();

    const sessions = sessionsSnap.docs.map(doc => {
      const s = doc.data() as LegacyImportSession;
      return {
        sessionId: doc.id,
        preview: {
          totalRows: s.preview.totalRows,
          toCreate: s.preview.toCreate,
          toUpdate: s.preview.toUpdate,
          toSkip: s.preview.toSkip,
          errorCount: s.preview.errorCount,
          valid: s.preview.valid,
        },
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      };
    });

    res.json({ sessions });
  });

  return router;
}

function parseCsv(csv: string): CsvRow[] {
  return parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as CsvRow[];
}

function normalizeColumnName(col: string): string {
  return col.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mapLegacyColumns(row: CsvRow): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase().includes('spreadsheetencoding')) continue;
    const normalizedKey = normalizeColumnName(key);
    const mappedKey = LEGACY_COLUMN_MAP[normalizedKey] || LEGACY_COLUMN_MAP[key.toLowerCase()] || key;
    mapped[mappedKey] = value;
  }
  return mapped;
}

interface ExistingData {
  locations: Map<string, { id: string; data: Location }>;
  locationsById: Map<string, { id: string; data: Location }>;
  locationsByNormalizedNum: Map<string, { id: string; data: Location }>;
  regions: Map<string, Region>;
  regionsById: Map<string, Region>;
  districts: Map<string, District>;
  districtsById: Map<string, District>;
  people: Map<string, Person>;
  peopleByName: Map<string, Person>;
  assignments: Map<string, Assignment[]>;
  districtAssignments: Map<string, Assignment[]>;
}

async function loadExistingData(db: Firestore): Promise<ExistingData> {
  const [locationsSnap, regionsSnap, districtsSnap, peopleSnap, assignmentsSnap] = await Promise.all([
    db.collection('locations').get(),
    db.collection('regions').where('lifecycle', '==', 'active').get(),
    db.collection('districts').where('lifecycle', '==', 'active').get(),
    db.collection('people').where('lifecycle', '==', 'active').get(),
    db.collection('assignments').get(),
  ]);

  const locations = new Map<string, { id: string; data: Location }>();
  const locationsById = new Map<string, { id: string; data: Location }>();
  const locationsByNormalizedNum = new Map<string, { id: string; data: Location }>();
  for (const doc of locationsSnap.docs) {
    const data = { id: doc.id, ...doc.data() } as Location;
    if (data.lifecycle !== 'retired') {
      locations.set(data.storeNumber, { id: doc.id, data });
      locationsByNormalizedNum.set(normalizeStoreNumber(data.storeNumber), { id: doc.id, data });
    }
    locationsById.set(doc.id, { id: doc.id, data });
  }

  const regions = new Map<string, Region>();
  const regionsById = new Map<string, Region>();
  for (const doc of regionsSnap.docs) {
    const region = { id: doc.id, ...doc.data() } as Region;
    regions.set(region.code, region);
    regionsById.set(doc.id, region);
  }

  const districts = new Map<string, District>();
  const districtsById = new Map<string, District>();
  for (const doc of districtsSnap.docs) {
    const district = { id: doc.id, ...doc.data() } as District;
    districts.set(district.code, district);
    districtsById.set(doc.id, district);
  }

  const people = new Map<string, Person>();
  const peopleByName = new Map<string, Person>();
  for (const doc of peopleSnap.docs) {
    const person = { id: doc.id, ...doc.data() } as Person;
    people.set(doc.id, person);
    peopleByName.set(person.fullName.toLowerCase().trim(), person);
  }

  const assignments = new Map<string, Assignment[]>();
  const districtAssignments = new Map<string, Assignment[]>();
  for (const doc of assignmentsSnap.docs) {
    const assignment = { id: doc.id, ...doc.data() } as Assignment;
    if (assignment.scopeType === 'location') {
      const existing = assignments.get(assignment.scopeId) || [];
      existing.push(assignment);
      assignments.set(assignment.scopeId, existing);
    } else if (assignment.scopeType === 'district') {
      const existing = districtAssignments.get(assignment.scopeId) || [];
      existing.push(assignment);
      districtAssignments.set(assignment.scopeId, existing);
    }
  }

  return { 
    locations, locationsById, locationsByNormalizedNum, 
    regions, regionsById, districts, districtsById, 
    people, peopleByName, assignments, districtAssignments 
  };
}

function parseAndValidateRows(
  records: CsvRow[], 
  existing: ExistingData,
  hoursData?: LegacyHoursData
): ParsedLocationRow[] {
  const results: ParsedLocationRow[] = [];
  const seenNormalizedNumbers = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const rowNum = i + 2;
    const raw = records[i];
    const row = mapLegacyColumns(raw);
    const errors: string[] = [];
    const changes: string[] = [];

    const rawStoreNumber = (row.storeNumber || '').trim();
    if (!rawStoreNumber) {
      results.push({ row: rowNum, action: 'skip', data: {}, errors: ['No store number'], changes: [] });
      continue;
    }

    const normalizedNum = normalizeStoreNumber(rawStoreNumber);
    const storeNumber = normalizedNum;

    if (seenNormalizedNumbers.has(normalizedNum)) {
      results.push({ row: rowNum, action: 'error', data: {}, errors: [`Duplicate store number in file: ${rawStoreNumber}`], changes: [] });
      continue;
    }
    seenNormalizedNumbers.add(normalizedNum);

    const locationId = (row.locationId || '').trim();
    let existingEntry = locationId 
      ? existing.locationsById.get(locationId) 
      : existing.locationsByNormalizedNum.get(normalizedNum);
    const isUpdate = !!existingEntry;

    const name = (row.name || '').trim();
    const storeType = (row.storeType || '').trim();
    const kind = mapLocationKind(storeType, normalizedNum);
    const isFacility = kind === 'facility';

    if (!name && !isUpdate) {
      errors.push('Store name is required for new locations');
    }

    const street = (row.street || row.address || '').trim();
    const city = (row.city || '').trim();
    const state = (row.state || '').trim().toUpperCase();
    const zip = (row.zip || '').trim();
    const suite = (row.suite || '').trim();

    if (!isUpdate) {
      if (!street) errors.push('Address is required');
      if (!city) errors.push('City is required');
      if (!state) errors.push('State is required');
      if (!zip) errors.push('ZIP code is required');
    }

    const mainPhone = normalizePhoneNumber(row.mainPhone || '');
    if (!mainPhone && !isUpdate) {
      errors.push('Phone number is required');
    } else if (row.mainPhone && !mainPhone) {
      errors.push('Invalid phone number format');
    }

    const timeZone = (row.timeZone || hoursData?.[normalizedNum]?.timeZone || 'America/Los_Angeles').trim();
    const validTimeZones = ['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York'];
    if (!validTimeZones.includes(timeZone)) {
      errors.push(`Invalid timezone: ${timeZone}`);
    }

    let regionId = '';
    const rawRegionId = (row.regionId || '').trim();
    if (rawRegionId) {
      const normalizedRegionId = normalizeStoreNumber(rawRegionId);
      const region = existing.regionsById.get(rawRegionId) || 
                     existing.regions.get(rawRegionId) ||
                     existing.regions.get(normalizedRegionId);
      if (region) {
        regionId = region.id;
      } else if (!isFacility) {
        errors.push(`Region not found: ${rawRegionId}`);
      }
    }

    let districtId = '';
    const rawDistrictId = (row.districtId || '').trim();
    if (rawDistrictId) {
      const normalizedDistrictId = normalizeStoreNumber(rawDistrictId);
      const district = existing.districtsById.get(rawDistrictId) || 
                       existing.districts.get(rawDistrictId) ||
                       existing.districts.get(normalizedDistrictId);
      if (district) {
        districtId = district.id;
        if (!regionId && district.regionId) {
          regionId = district.regionId;
        }
      } else if (!isFacility) {
        errors.push(`District not found: ${rawDistrictId}`);
      }
    }

    const sharedInboxEmail = (row.sharedInboxEmail || '').trim();
    const mallOrCenterName = (row.mallOrCenterName || '').trim();
    const wayfindingDirections = (row.wayfindingDirections || '').trim().slice(0, 1000);

    // Parse operational status and record status
    const operationalStatus = (row.operationalStatus || '').trim().toLowerCase();
    const recordStatus = (row.recordStatus || '').trim().toLowerCase();
    
    // Determine lifecycle from record status
    let lifecycle: 'active' | 'planned' | 'retired' = 'active';
    if (recordStatus === 'retired' || recordStatus === 'inactive' || recordStatus === 'closed permanently') {
      lifecycle = 'retired';
    } else if (recordStatus === 'draft' || recordStatus === 'planned' || recordStatus === 'pre-opening') {
      lifecycle = 'planned';
    }
    
    // Check if there's a temporary closure (operationalStatus === 'closed')
    const hasTemporaryClosure = operationalStatus === 'closed' && lifecycle === 'active';

    let smData: ParsedLocationRow['smData'] = undefined;
    const storeManagerName = (row.storeManager || '').trim();
    if (storeManagerName) {
      smData = {
        fullName: storeManagerName,
        workPhone: normalizePhoneNumber(row.storeManagerPhone || '') || undefined,
        mobilePhone: normalizePhoneNumber(row.storeManagerMobile || '') || undefined,
      };
    }

    let dmData: ParsedLocationRow['dmData'] = undefined;
    const districtManagerName = (row.districtManager || '').trim();
    if (districtManagerName && districtId) {
      dmData = { fullName: districtManagerName };
    }

    let asmData: ParsedLocationRow['asmData'] = undefined;
    const asmRaw = (row.assistantStoreManagers || '').trim();
    if (asmRaw) {
      const asmNames = asmRaw.split(',').map(n => n.trim()).filter(n => n.length > 0);
      if (asmNames.length > 0) {
        asmData = asmNames.map(fullName => ({ fullName }));
      }
    }

    if (errors.length > 0) {
      results.push({ row: rowNum, action: 'error', data: {}, errors, changes: [] });
      continue;
    }

    const address: Address = {
      street: street || existingEntry?.data.address.street || '',
      suite: suite || existingEntry?.data.address.suite,
      city: city || existingEntry?.data.address.city || '',
      state: state || existingEntry?.data.address.state || '',
      zip: zip || existingEntry?.data.address.zip || '',
      country: 'US',
    };

    let standardHours: StandardHours | undefined;
    const legacyHours = hoursData?.[normalizedNum] || hoursData?.[rawStoreNumber];
    if (legacyHours?.standardHours) {
      standardHours = convertLegacyHours(legacyHours.standardHours);
    }

    const data: Partial<Omit<Location, 'id'>> & { hasTemporaryClosure?: boolean } = {
      storeNumber,
      kind,
      name: name || existingEntry?.data.name,
      lifecycle,
      address,
      timeZone: timeZone || existingEntry?.data.timeZone || 'America/Los_Angeles',
      mainPhone: mainPhone || existingEntry?.data.mainPhone || '',
      phonePublic: true,
      sharedInboxEmail: sharedInboxEmail || existingEntry?.data.sharedInboxEmail,
      regionId: regionId || existingEntry?.data.regionId || '',
      districtId: districtId || existingEntry?.data.districtId || '',
      storeType: storeType || existingEntry?.data.storeType,
      mallOrCenterName: mallOrCenterName || existingEntry?.data.mallOrCenterName,
      wayfindingDirections: wayfindingDirections || existingEntry?.data.wayfindingDirections,
      hasTemporaryClosure,
    };

    if (standardHours) {
      data.standardHours = standardHours;
    }

    if (isUpdate && existingEntry) {
      if (!standardHours && existingEntry.data.standardHours) {
        data.standardHours = existingEntry.data.standardHours;
      }

      const existingLoc = existingEntry.data;
      if (name && name !== existingLoc.name) changes.push(`Name: "${existingLoc.name}" → "${name}"`);
      if (mainPhone && mainPhone !== existingLoc.mainPhone) changes.push(`Phone: ${existingLoc.mainPhone || '(empty)'} → ${mainPhone}`);
      if (street && street !== existingLoc.address.street) changes.push(`Street: "${existingLoc.address.street}" → "${street}"`);
      if (suite && suite !== existingLoc.address.suite) changes.push(`Suite: "${existingLoc.address.suite || ''}" → "${suite}"`);
      if (city && city !== existingLoc.address.city) changes.push(`City: "${existingLoc.address.city}" → "${city}"`);
      if (state && state !== existingLoc.address.state) changes.push(`State: ${existingLoc.address.state} → ${state}`);
      if (zip && zip !== existingLoc.address.zip) changes.push(`ZIP: ${existingLoc.address.zip} → ${zip}`);
      if (regionId && regionId !== existingLoc.regionId) changes.push(`Region updated`);
      if (districtId && districtId !== existingLoc.districtId) changes.push(`District updated`);
      if (sharedInboxEmail && sharedInboxEmail !== existingLoc.sharedInboxEmail) changes.push(`Inbox: ${existingLoc.sharedInboxEmail || '(empty)'} → ${sharedInboxEmail}`);
      if (mallOrCenterName && mallOrCenterName !== existingLoc.mallOrCenterName) changes.push(`Mall/Center: "${existingLoc.mallOrCenterName || ''}" → "${mallOrCenterName}"`);
      if (wayfindingDirections && wayfindingDirections !== existingLoc.wayfindingDirections) changes.push(`Wayfinding directions updated`);
      if (kind && kind !== existingLoc.kind) changes.push(`Kind: ${existingLoc.kind} → ${kind}`);
      if (timeZone && timeZone !== existingLoc.timeZone) changes.push(`Timezone: ${existingLoc.timeZone} → ${timeZone}`);
      if (lifecycle !== existingLoc.lifecycle) changes.push(`Lifecycle: ${existingLoc.lifecycle} → ${lifecycle}`);
      if (hasTemporaryClosure) changes.push('Temporary closure will be created');
      if (standardHours) changes.push('Hours updated from import');

      if (smData) {
        changes.push(`SM: ${smData.fullName} (will be assigned if not already)`);
      }
      if (dmData) {
        changes.push(`DM: ${dmData.fullName} (will be assigned to district if not already)`);
      }
      if (asmData && asmData.length > 0) {
        changes.push(`ASMs: ${asmData.map(a => a.fullName).join(', ')}`);
      }

      if (changes.length === 0) {
        results.push({ row: rowNum, action: 'skip', existingId: existingEntry.id, data, smData, dmData, asmData, errors: [], changes: ['No changes detected'] });
        continue;
      }

      results.push({ row: rowNum, action: 'update', existingId: existingEntry.id, data, smData, dmData, asmData, errors: [], changes });
    } else {
      changes.push('New location');
      if (isFacility) changes.push('(Facility)');
      if (lifecycle !== 'active') changes.push(`Lifecycle: ${lifecycle}`);
      if (hasTemporaryClosure) changes.push('Temporary closure will be created');
      if (smData) {
        changes.push(`SM: ${smData.fullName}`);
      }
      if (dmData) {
        changes.push(`DM: ${dmData.fullName}`);
      }
      if (asmData && asmData.length > 0) {
        changes.push(`ASMs: ${asmData.map(a => a.fullName).join(', ')}`);
      }
      if (standardHours) {
        changes.push('Hours imported');
      }
      results.push({ row: rowNum, action: 'create', data, smData, dmData, asmData, errors: [], changes });
    }
  }

  return results;
}

function mapLocationKind(type: string | undefined, normalizedStoreNumber: string): Location['kind'] {
  if (FACILITY_STORE_NUMBERS.has(normalizedStoreNumber)) {
    return 'facility';
  }
  if (!type) return 'store';
  const lower = type.toLowerCase();
  if (lower.includes('warehouse') || lower.includes('distribution')) return 'warehouse';
  if (lower.includes('office') || lower.includes('corporate')) return 'office';
  if (lower.includes('other company')) return 'facility';
  return 'store';
}

function convertLegacyHours(legacy: Record<string, LegacyHoursEntry>): StandardHours {
  const days: (keyof StandardHours)[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const result: StandardHours = {} as StandardHours;
  
  for (const day of days) {
    const entry = legacy[day];
    if (!entry || entry.isClosed) {
      result[day] = { closed: true, intervals: [] };
    } else {
      result[day] = {
        closed: false,
        intervals: [{ open: entry.open, close: entry.close }],
      };
    }
  }
  
  return result;
}

function buildPreview(rows: ParsedLocationRow[]): LegacyImportPreview {
  const toCreate = rows.filter(r => r.action === 'create').length;
  const toUpdate = rows.filter(r => r.action === 'update').length;
  const toSkip = rows.filter(r => r.action === 'skip').length;
  const errorCount = rows.filter(r => r.action === 'error').length;

  return {
    valid: errorCount === 0,
    totalRows: rows.length,
    toCreate,
    toUpdate,
    toSkip,
    errorCount,
    rows: rows.map(r => ({
      row: r.row,
      storeNumber: r.data.storeNumber || '(unknown)',
      action: r.action,
      message: r.action === 'error' ? r.errors.join('; ') : r.action === 'skip' ? r.changes[0] : undefined,
      errors: r.errors.length > 0 ? r.errors : undefined,
      changes: r.changes.length > 0 ? r.changes : undefined,
    })),
    timestamp: new Date().toISOString(),
  };
}

async function applyImport(
  db: Firestore,
  rows: ParsedLocationRow[],
  hoursData: LegacyHoursData | undefined,
  authUser: AuthUser
): Promise<{ created: number; updated: number; skipped: number; assignmentsCreated: number; hoursExceptionsCreated: number }> {
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let assignmentsCreated = 0;
  let hoursExceptionsCreated = 0;

  const actionableRows = rows.filter(r => r.action === 'create' || r.action === 'update');
  const MAX_BATCH = 500;

  const peopleByName = new Map<string, string>();
  const peopleSnap = await db.collection('people').where('lifecycle', '==', 'active').get();
  for (const doc of peopleSnap.docs) {
    const person = doc.data() as Person;
    peopleByName.set(person.fullName.toLowerCase().trim(), doc.id);
  }

  const districtDmAssigned = new Set<string>();
  const existingDmSnap = await db.collection('assignments')
    .where('scopeType', '==', 'district')
    .where('role', '==', 'DM')
    .where('slot', '==', 'primary')
    .get();
  for (const doc of existingDmSnap.docs) {
    const a = doc.data() as Assignment;
    if (!a.endDate) {
      districtDmAssigned.add(a.scopeId);
    }
  }

  for (let i = 0; i < actionableRows.length; i += MAX_BATCH) {
    const batch = db.batch();
    const chunk = actionableRows.slice(i, i + MAX_BATCH);
    const newLocationIds: { row: ParsedLocationRow; docRef: FirebaseFirestore.DocumentReference }[] = [];

    for (const row of chunk) {
      if (row.action === 'create') {
        const docRef = db.collection('locations').doc();
        batch.set(docRef, {
          ...row.data,
          createdAt: now,
          updatedAt: now,
          updatedBy: authUser.uid,
          version: 1,
        });
        created++;
        newLocationIds.push({ row, docRef });
      } else if (row.action === 'update' && row.existingId) {
        const docRef = db.collection('locations').doc(row.existingId);
        batch.update(docRef, {
          ...row.data,
          updatedAt: now,
          updatedBy: authUser.uid,
        });
        updated++;
        newLocationIds.push({ row, docRef: db.collection('locations').doc(row.existingId) });
      }
    }

    await batch.commit();

    for (const { row, docRef } of newLocationIds) {
      const locationId = docRef.id;
      const districtId = row.data.districtId || '';
      const storeNumber = row.data.storeNumber || '';
      const normalizedNum = normalizeStoreNumber(storeNumber);
      
      // Create closure if operationalStatus was "closed"
      if (row.data.hasTemporaryClosure) {
        const closureRef = db.collection(`locations/${locationId}/closures`).doc();
        await closureRef.set({
          reason: 'Imported from legacy data - temporary closure',
          type: 'unknown_end',
          reasonCode: 'other',
          reasonNote: 'Imported as closed from legacy system',
          startsAt: now,
          status: 'active',
          createdBy: authUser.uid,
          createdByEmail: authUser.email,
          ownerId: null,
          nextReviewDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 7 days from now
        });
      }

      if (row.smData) {
        let personId = peopleByName.get(row.smData.fullName.toLowerCase().trim());

        if (!personId) {
          const personRef = db.collection('people').doc();
          await personRef.set({
            fullName: row.smData.fullName,
            lifecycle: 'active',
            workPhone: row.smData.workPhone || null,
            mobilePhone: row.smData.mobilePhone || null,
            createdAt: now,
            updatedAt: now,
            updatedBy: authUser.uid,
            version: 1,
          });
          personId = personRef.id;
          peopleByName.set(row.smData.fullName.toLowerCase().trim(), personId);
        }

        const existingSmSnap = await db.collection('assignments')
          .where('scopeType', '==', 'location')
          .where('scopeId', '==', locationId)
          .where('role', '==', 'SM')
          .where('slot', '==', 'primary')
          .limit(1)
          .get();

        if (existingSmSnap.empty) {
          const assignmentRef = db.collection('assignments').doc();
          await assignmentRef.set({
            personId,
            role: 'SM',
            scopeType: 'location',
            scopeId: locationId,
            slot: 'primary',
            startDate: now.slice(0, 10),
            createdAt: now,
            updatedAt: now,
            updatedBy: authUser.uid,
            version: 1,
          });
          assignmentsCreated++;
        }
      }

      if (row.dmData && districtId && !districtDmAssigned.has(districtId)) {
        let personId = peopleByName.get(row.dmData.fullName.toLowerCase().trim());

        if (!personId) {
          const personRef = db.collection('people').doc();
          await personRef.set({
            fullName: row.dmData.fullName,
            lifecycle: 'active',
            createdAt: now,
            updatedAt: now,
            updatedBy: authUser.uid,
            version: 1,
          });
          personId = personRef.id;
          peopleByName.set(row.dmData.fullName.toLowerCase().trim(), personId);
        }

        const assignmentRef = db.collection('assignments').doc();
        await assignmentRef.set({
          personId,
          role: 'DM',
          scopeType: 'district',
          scopeId: districtId,
          slot: 'primary',
          startDate: now.slice(0, 10),
          createdAt: now,
          updatedAt: now,
          updatedBy: authUser.uid,
          version: 1,
        });
        assignmentsCreated++;
        districtDmAssigned.add(districtId);
      }

      if (row.asmData && row.asmData.length > 0) {
        for (const asm of row.asmData) {
          let personId = peopleByName.get(asm.fullName.toLowerCase().trim());

          if (!personId) {
            const personRef = db.collection('people').doc();
            await personRef.set({
              fullName: asm.fullName,
              lifecycle: 'active',
              createdAt: now,
              updatedAt: now,
              updatedBy: authUser.uid,
              version: 1,
            });
            personId = personRef.id;
            peopleByName.set(asm.fullName.toLowerCase().trim(), personId);
          }

          const existingAsmSnap = await db.collection('assignments')
            .where('scopeType', '==', 'location')
            .where('scopeId', '==', locationId)
            .where('role', '==', 'ASM')
            .where('personId', '==', personId)
            .limit(1)
            .get();

          if (existingAsmSnap.empty) {
            const assignmentRef = db.collection('assignments').doc();
            await assignmentRef.set({
              personId,
              role: 'ASM',
              scopeType: 'location',
              scopeId: locationId,
              slot: 'support',
              startDate: now.slice(0, 10),
              createdAt: now,
              updatedAt: now,
              updatedBy: authUser.uid,
              version: 1,
            });
            assignmentsCreated++;
          }
        }
      }

      const legacyHours = hoursData?.[normalizedNum] || hoursData?.[storeNumber];
      if (legacyHours?.holidayHours && legacyHours.holidayHours.length > 0) {
        for (const holiday of legacyHours.holidayHours) {
          const exceptionRef = db.collection(`locations/${locationId}/hoursExceptions`).doc();
          await exceptionRef.set({
            type: 'holiday',
            label: holiday.holidayName,
            startDate: holiday.date,
            endDate: holiday.date,
            closed: holiday.hours.isClosed,
            intervals: holiday.hours.isClosed ? [] : [{ open: holiday.hours.open, close: holiday.hours.close }],
            source: 'import',
          });
          hoursExceptionsCreated++;
        }
      }
    }
  }

  skipped = rows.filter(r => r.action === 'skip').length;
  return { created, updated, skipped, assignmentsCreated, hoursExceptionsCreated };
}

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
  userId: string;
  createdAt: string;
  expiresAt: string;
}

interface ParsedLocationRow {
  row: number;
  action: 'create' | 'update' | 'skip' | 'error';
  existingId?: string;
  data: Partial<Omit<Location, 'id'>>;
  smData?: { fullName: string; workPhone?: string; mobilePhone?: string };
  errors: string[];
  changes: string[];
}

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
};

const IMPORT_SESSION_TTL_MS = 30 * 60_000;

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
      const { csv } = req.body;

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

      const records = parseCsv(csv);
      if (records.length === 0) {
        return res.status(400).json({
          error: { code: 'empty_csv', message: 'CSV file is empty or has no data rows', requestId: res.locals.requestId },
        });
      }

      const existingData = await loadExistingData(db);
      const parsedRows = parseAndValidateRows(records, existingData);
      const preview = buildPreview(parsedRows);

      const sessionId = `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + IMPORT_SESSION_TTL_MS);

      const session: LegacyImportSession = {
        preview,
        parsedRows,
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

      const result = await applyImport(db, session.parsedRows, authUser);
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
    const normalizedKey = normalizeColumnName(key);
    const mappedKey = LEGACY_COLUMN_MAP[normalizedKey] || LEGACY_COLUMN_MAP[key.toLowerCase()] || key;
    mapped[mappedKey] = value;
  }
  return mapped;
}

interface ExistingData {
  locations: Map<string, { id: string; data: Location }>;
  locationsById: Map<string, { id: string; data: Location }>;
  regions: Map<string, Region>;
  regionsById: Map<string, Region>;
  districts: Map<string, District>;
  districtsById: Map<string, District>;
  people: Map<string, Person>;
  peopleByName: Map<string, Person>;
  assignments: Map<string, Assignment[]>;
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
  for (const doc of locationsSnap.docs) {
    const data = { id: doc.id, ...doc.data() } as Location;
    if (data.lifecycle !== 'retired') {
      locations.set(data.storeNumber, { id: doc.id, data });
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
  for (const doc of assignmentsSnap.docs) {
    const assignment = { id: doc.id, ...doc.data() } as Assignment;
    if (assignment.scopeType === 'location') {
      const existing = assignments.get(assignment.scopeId) || [];
      existing.push(assignment);
      assignments.set(assignment.scopeId, existing);
    }
  }

  return { locations, locationsById, regions, regionsById, districts, districtsById, people, peopleByName, assignments };
}

function parseAndValidateRows(records: CsvRow[], existing: ExistingData): ParsedLocationRow[] {
  const results: ParsedLocationRow[] = [];
  const seenStoreNumbers = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const rowNum = i + 2;
    const raw = records[i];
    const row = mapLegacyColumns(raw);
    const errors: string[] = [];
    const changes: string[] = [];

    const storeNumber = (row.storeNumber || '').trim();
    if (!storeNumber) {
      results.push({ row: rowNum, action: 'skip', data: {}, errors: ['No store number'], changes: [] });
      continue;
    }

    if (seenStoreNumbers.has(storeNumber)) {
      results.push({ row: rowNum, action: 'error', data: {}, errors: [`Duplicate store number in file: ${storeNumber}`], changes: [] });
      continue;
    }
    seenStoreNumbers.add(storeNumber);

    const locationId = (row.locationId || '').trim();
    let existingEntry = locationId ? existing.locationsById.get(locationId) : existing.locations.get(storeNumber);
    const isUpdate = !!existingEntry;

    const name = (row.name || '').trim();
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

    const timeZone = (row.timeZone || 'America/Los_Angeles').trim();
    const validTimeZones = ['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York'];
    if (!validTimeZones.includes(timeZone)) {
      errors.push(`Invalid timezone: ${timeZone}`);
    }

    let regionId = '';
    if (row.regionId) {
      const region = existing.regionsById.get(row.regionId) || existing.regions.get(row.regionId);
      if (region) {
        regionId = region.id;
      } else {
        errors.push(`Region not found: ${row.regionId}`);
      }
    }

    let districtId = '';
    if (row.districtId) {
      const district = existing.districtsById.get(row.districtId) || existing.districts.get(row.districtId);
      if (district) {
        districtId = district.id;
        if (!regionId && district.regionId) {
          regionId = district.regionId;
        }
      } else {
        errors.push(`District not found: ${row.districtId}`);
      }
    }

    const kind = mapLocationKind(row.kind || row.storeType);
    const sharedInboxEmail = (row.sharedInboxEmail || '').trim();
    const mallOrCenterName = (row.mallOrCenterName || '').trim();
    const wayfindingDirections = (row.wayfindingDirections || '').trim().slice(0, 1000);

    let smData: ParsedLocationRow['smData'] = undefined;
    const storeManagerName = (row.storeManager || '').trim();
    if (storeManagerName) {
      smData = {
        fullName: storeManagerName,
        workPhone: normalizePhoneNumber(row.storeManagerPhone || '') || undefined,
        mobilePhone: normalizePhoneNumber(row.storeManagerMobile || '') || undefined,
      };
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

    const data: Partial<Omit<Location, 'id'>> = {
      storeNumber,
      kind,
      name: name || existingEntry?.data.name,
      lifecycle: 'active',
      address,
      timeZone: timeZone || existingEntry?.data.timeZone || 'America/Los_Angeles',
      mainPhone: mainPhone || existingEntry?.data.mainPhone || '',
      phonePublic: true,
      sharedInboxEmail: sharedInboxEmail || existingEntry?.data.sharedInboxEmail,
      regionId: regionId || existingEntry?.data.regionId || '',
      districtId: districtId || existingEntry?.data.districtId || '',
      storeType: (row.storeType || '').trim() || existingEntry?.data.storeType,
      mallOrCenterName: mallOrCenterName || existingEntry?.data.mallOrCenterName,
      wayfindingDirections: wayfindingDirections || existingEntry?.data.wayfindingDirections,
    };

    if (isUpdate && existingEntry) {
      data.standardHours = existingEntry.data.standardHours;

      const existing = existingEntry.data;
      if (name && name !== existing.name) changes.push(`Name: "${existing.name}" → "${name}"`);
      if (mainPhone && mainPhone !== existing.mainPhone) changes.push(`Phone: ${existing.mainPhone || '(empty)'} → ${mainPhone}`);
      if (street && street !== existing.address.street) changes.push(`Street: "${existing.address.street}" → "${street}"`);
      if (suite && suite !== existing.address.suite) changes.push(`Suite: "${existing.address.suite || ''}" → "${suite}"`);
      if (city && city !== existing.address.city) changes.push(`City: "${existing.address.city}" → "${city}"`);
      if (state && state !== existing.address.state) changes.push(`State: ${existing.address.state} → ${state}`);
      if (zip && zip !== existing.address.zip) changes.push(`ZIP: ${existing.address.zip} → ${zip}`);
      if (regionId && regionId !== existing.regionId) changes.push(`Region updated`);
      if (districtId && districtId !== existing.districtId) changes.push(`District updated`);
      if (sharedInboxEmail && sharedInboxEmail !== existing.sharedInboxEmail) changes.push(`Inbox: ${existing.sharedInboxEmail || '(empty)'} → ${sharedInboxEmail}`);
      if (mallOrCenterName && mallOrCenterName !== existing.mallOrCenterName) changes.push(`Mall/Center: "${existing.mallOrCenterName || ''}" → "${mallOrCenterName}"`);
      if (wayfindingDirections && wayfindingDirections !== existing.wayfindingDirections) changes.push(`Wayfinding directions updated`);
      if (kind && kind !== existing.kind) changes.push(`Kind: ${existing.kind} → ${kind}`);
      if (timeZone && timeZone !== existing.timeZone) changes.push(`Timezone: ${existing.timeZone} → ${timeZone}`);

      if (smData && existingEntry) {
        changes.push(`SM: ${smData.fullName} (will be assigned if not already)`);
      }

      if (changes.length === 0) {
        results.push({ row: rowNum, action: 'skip', existingId: existingEntry.id, data, smData, errors: [], changes: ['No changes detected'] });
        continue;
      }

      results.push({ row: rowNum, action: 'update', existingId: existingEntry.id, data, smData, errors: [], changes });
    } else {
      changes.push('New location');
      if (smData) {
        changes.push(`SM: ${smData.fullName}`);
      }
      results.push({ row: rowNum, action: 'create', data, smData, errors: [], changes });
    }
  }

  return results;
}

function mapLocationKind(type: string | undefined): Location['kind'] {
  if (!type) return 'store';
  const lower = type.toLowerCase();
  if (lower.includes('warehouse') || lower.includes('distribution')) return 'warehouse';
  if (lower.includes('office') || lower.includes('corporate')) return 'office';
  return 'store';
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
  authUser: AuthUser
): Promise<{ created: number; updated: number; skipped: number; assignmentsCreated: number }> {
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let assignmentsCreated = 0;

  const actionableRows = rows.filter(r => r.action === 'create' || r.action === 'update');
  const MAX_BATCH = 500;

  const peopleByName = new Map<string, string>();
  const peopleSnap = await db.collection('people').where('lifecycle', '==', 'active').get();
  for (const doc of peopleSnap.docs) {
    const person = doc.data() as Person;
    peopleByName.set(person.fullName.toLowerCase().trim(), doc.id);
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
        if (row.smData) {
          newLocationIds.push({ row, docRef });
        }
      } else if (row.action === 'update' && row.existingId) {
        const docRef = db.collection('locations').doc(row.existingId);
        batch.update(docRef, {
          ...row.data,
          updatedAt: now,
          updatedBy: authUser.uid,
        });
        updated++;
        if (row.smData) {
          newLocationIds.push({ row, docRef: db.collection('locations').doc(row.existingId) });
        }
      }
    }

    await batch.commit();

    for (const { row, docRef } of newLocationIds) {
      if (!row.smData) continue;

      const locationId = docRef.id;
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
  }

  skipped = rows.filter(r => r.action === 'skip').length;
  return { created, updated, skipped, assignmentsCreated };
}

/**
 * Seed script to load sample data into Firebase
 * 
 * USAGE:
 *   npm run seed -- --emulator              # Seed local emulator (safe)
 *   npm run seed -- --project=PROJECT_ID    # Seed a real project (requires confirmation)
 * 
 * Never defaults to a production project - requires explicit targeting.
 */

import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parsePhoneNumber } from 'libphonenumber-js';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const useEmulator = args.includes('--emulator');
const projectArg = args.find(a => a.startsWith('--project='));
const projectId = projectArg?.split('=')[1];

if (!useEmulator && !projectId) {
  console.error(`
ERROR: You must specify a target.

Usage:
  npm run seed -- --emulator              # Seed local emulator (safe, recommended for dev)
  npm run seed -- --project=PROJECT_ID    # Seed a real Firebase project (DESTRUCTIVE!)

The seed script never defaults to production to prevent accidental data loss.
`);
  process.exit(1);
}

async function confirmRealProject(): Promise<boolean> {
  if (useEmulator) return true;
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    console.warn(`\n⚠️  WARNING: You are about to seed data to a REAL Firebase project: ${projectId}`);
    console.warn('This will CLEAR and REPLACE all data in: locations, people, assignments, regions, districts\n');
    rl.question('Type the project ID to confirm: ', (answer) => {
      rl.close();
      resolve(answer === projectId);
    });
  });
}

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
}

const effectiveProjectId = useEmulator 
  ? (process.env.GCLOUD_PROJECT || 'shiekh-directory-rebuild-placeholder')
  : projectId!;

if (getApps().length === 0) {
  if (useEmulator) {
    initializeApp({ projectId: effectiveProjectId });
  } else {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credPath && existsSync(credPath)) {
      initializeApp({
        credential: cert(JSON.parse(readFileSync(credPath, 'utf-8')) as ServiceAccount),
        projectId: effectiveProjectId,
      });
    } else {
      initializeApp({ projectId: effectiveProjectId });
    }
  }
}

const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = getAuth();

type CsvRow = Record<string, string>;
type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

function parseCsv(filename: string): CsvRow[] {
  const path = join(__dirname, '../data', filename);
  const content = readFileSync(path, 'utf-8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  try {
    const parsed = parsePhoneNumber(phone, 'US');
    return parsed?.format('E.164') || null;
  } catch {
    return null;
  }
}

function normalizeTime(time: string): string {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  return `${hours.padStart(2, '0')}:${minutes || '00'}`;
}

async function clearCollections() {
  console.log('Clearing existing data...');
  
  const collections = ['locations', 'people', 'assignments', 'regions', 'districts'];
  
  for (const collection of collections) {
    const snapshot = await db.collection(collection).get();
    const batch = db.batch();
    
    for (const doc of snapshot.docs) {
      const subcollections = await doc.ref.listCollections();
      for (const subcol of subcollections) {
        const subDocs = await subcol.get();
        for (const subDoc of subDocs.docs) {
          batch.delete(subDoc.ref);
        }
      }
      batch.delete(doc.ref);
    }
    
    if (snapshot.size > 0) {
      await batch.commit();
      console.log(`  Deleted ${snapshot.size} documents from ${collection}`);
    }
  }
}

async function seedRegions(): Promise<Map<string, string>> {
  console.log('Seeding regions...');
  const rows = parseCsv('sample-regions.csv');
  const regionMap = new Map<string, string>();
  
  for (const row of rows) {
    const ref = db.collection('regions').doc();
    await ref.set({
      code: row.code,
      name: row.name,
      lifecycle: row.lifecycle || 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'seed-script',
      version: 1,
    });
    regionMap.set(row.code, ref.id);
    console.log(`  Created region: ${row.name} (${row.code})`);
  }
  
  return regionMap;
}

async function seedDistricts(regionMap: Map<string, string>): Promise<Map<string, string>> {
  console.log('Seeding districts...');
  const rows = parseCsv('sample-districts.csv');
  const districtMap = new Map<string, string>();
  
  for (const row of rows) {
    const regionId = regionMap.get(row.regionCode) || '';
    const ref = db.collection('districts').doc();
    await ref.set({
      code: row.code,
      name: row.name,
      regionId,
      lifecycle: row.lifecycle || 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'seed-script',
      version: 1,
    });
    districtMap.set(row.code, ref.id);
    console.log(`  Created district: ${row.name} (${row.code})`);
  }
  
  return districtMap;
}

async function seedLocations(
  regionMap: Map<string, string>,
  districtMap: Map<string, string>
): Promise<Map<string, string>> {
  console.log('Seeding locations...');
  const rows = parseCsv('sample-stores.csv');
  const locationMap = new Map<string, string>();
  
  for (const row of rows) {
    const regionId = regionMap.get(row.regionCode) || '';
    const districtId = districtMap.get(row.districtCode) || '';
    
    const days: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const standardHours: Record<DayOfWeek, { closed: boolean; intervals: { open: string; close: string }[] }> = {} as any;
    
    for (const day of days) {
      const openKey = `${day}Open`;
      const closeKey = `${day}Close`;
      const open = row[openKey];
      const close = row[closeKey];
      
      if (open?.toLowerCase() === 'closed' || !open || !close) {
        standardHours[day] = { closed: true, intervals: [] };
      } else {
        standardHours[day] = {
          closed: false,
          intervals: [{ open: normalizeTime(open), close: normalizeTime(close) }],
        };
      }
    }
    
    const ref = db.collection('locations').doc();
    await ref.set({
      kind: 'store',
      storeNumber: row.storeNumber,
      name: row.name,
      lifecycle: 'active',
      address: {
        street: row.street,
        suite: row.suite || undefined,
        city: row.city,
        state: row.state,
        zip: row.zip,
        country: 'US',
      },
      timeZone: row.timeZone,
      mainPhone: normalizePhone(row.mainPhone) || row.mainPhone,
      phonePublic: row.phonePublic !== 'false',
      sharedInboxEmail: row.sharedInboxEmail || undefined,
      regionId,
      districtId,
      storeType: row.storeType || undefined,
      mallOrCenterName: row.mallOrCenterName || undefined,
      wayfindingDirections: row.wayfindingDirections || undefined,
      standardHours,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'seed-script',
      version: 1,
    });
    
    locationMap.set(row.storeNumber, ref.id);
    console.log(`  Created location: #${row.storeNumber} ${row.name}`);
  }
  
  return locationMap;
}

async function seedWarehouseAndOffice(
  regionMap: Map<string, string>,
  districtMap: Map<string, string>,
  locationMap: Map<string, string>
): Promise<void> {
  console.log('Seeding warehouse and office...');
  
  const westRegionId = regionMap.get('WEST') || '';
  const laDistrictId = districtMap.get('LA-CENTRAL') || '';
  
  const officeHours: Record<DayOfWeek, { closed: boolean; intervals: { open: string; close: string }[] }> = {
    monday: { closed: false, intervals: [{ open: '09:00', close: '17:00' }] },
    tuesday: { closed: false, intervals: [{ open: '09:00', close: '17:00' }] },
    wednesday: { closed: false, intervals: [{ open: '09:00', close: '17:00' }] },
    thursday: { closed: false, intervals: [{ open: '09:00', close: '17:00' }] },
    friday: { closed: false, intervals: [{ open: '09:00', close: '17:00' }] },
    saturday: { closed: true, intervals: [] },
    sunday: { closed: true, intervals: [] },
  };
  
  const warehouseRef = db.collection('locations').doc();
  await warehouseRef.set({
    kind: 'warehouse',
    storeNumber: 'WH-001',
    name: 'Los Angeles Distribution Center',
    lifecycle: 'active',
    address: {
      street: '1234 Industrial Way',
      city: 'Commerce',
      state: 'CA',
      zip: '90040',
      country: 'US',
    },
    timeZone: 'America/Los_Angeles',
    mainPhone: '+13235551000',
    phonePublic: true,
    sharedInboxEmail: 'warehouse@shiekh.test',
    regionId: westRegionId,
    districtId: laDistrictId,
    standardHours: officeHours,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: 'seed-script',
    version: 1,
  });
  locationMap.set('WH-001', warehouseRef.id);
  console.log('  Created warehouse: WH-001 Los Angeles Distribution Center');
  
  const officeRef = db.collection('locations').doc();
  await officeRef.set({
    kind: 'office',
    storeNumber: 'HQ-001',
    name: 'Corporate Headquarters',
    lifecycle: 'active',
    address: {
      street: '5000 Executive Blvd',
      suite: 'Suite 100',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90017',
      country: 'US',
    },
    timeZone: 'America/Los_Angeles',
    mainPhone: '+12135550000',
    phonePublic: true,
    sharedInboxEmail: 'hq@shiekh.test',
    regionId: westRegionId,
    districtId: laDistrictId,
    standardHours: officeHours,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: 'seed-script',
    version: 1,
  });
  locationMap.set('HQ-001', officeRef.id);
  console.log('  Created office: HQ-001 Corporate Headquarters');
}

async function seedPeople(): Promise<Map<string, string>> {
  console.log('Seeding people...');
  const rows = parseCsv('sample-people.csv');
  const peopleMap = new Map<string, string>();
  
  for (const row of rows) {
    const ref = db.collection('people').doc();
    await ref.set({
      fullName: row.fullName,
      lifecycle: row.lifecycle || 'active',
      workEmail: row.workEmail || undefined,
      workPhone: normalizePhone(row.workPhone) || undefined,
      mobilePhone: normalizePhone(row.mobilePhone) || undefined,
      homeLocationId: row.homeLocationId || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'seed-script',
      version: 1,
    });
    
    peopleMap.set(row.fullName.toLowerCase(), ref.id);
    console.log(`  Created person: ${row.fullName}`);
  }
  
  return peopleMap;
}

async function seedAssignments(
  peopleMap: Map<string, string>,
  locationMap: Map<string, string>,
  districtMap: Map<string, string>,
  regionMap: Map<string, string>
): Promise<void> {
  console.log('Seeding assignments...');
  const rows = parseCsv('sample-assignments.csv');
  
  for (const row of rows) {
    const personId = peopleMap.get(row.personName.toLowerCase());
    if (!personId) {
      console.log(`  Warning: Person not found: ${row.personName}`);
      continue;
    }
    
    let scopeType: string;
    let scopeId: string;
    
    if (['SM', 'ASM', 'KH'].includes(row.role)) {
      scopeType = 'location';
      scopeId = locationMap.get(row.storeNumber) || '';
      if (!scopeId) {
        console.log(`  Warning: Location not found: ${row.storeNumber}`);
        continue;
      }
    } else if (row.role === 'DM') {
      scopeType = 'district';
      scopeId = districtMap.get(row.districtCode) || '';
      if (!scopeId) {
        console.log(`  Warning: District not found: ${row.districtCode}`);
        continue;
      }
    } else if (row.role === 'RM') {
      scopeType = 'region';
      scopeId = regionMap.get(row.regionCode) || '';
      if (!scopeId) {
        console.log(`  Warning: Region not found: ${row.regionCode}`);
        continue;
      }
    } else {
      console.log(`  Warning: Unknown role: ${row.role}`);
      continue;
    }
    
    const ref = db.collection('assignments').doc();
    await ref.set({
      personId,
      role: row.role,
      scopeType,
      scopeId,
      slot: row.slot || 'primary',
      startDate: row.startDate || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'seed-script',
      version: 1,
    });
    
    const scopeLabel = row.storeNumber || row.districtCode || row.regionCode;
    console.log(`  Created assignment: ${row.personName} as ${row.role} at ${scopeLabel}`);
  }
}

async function seedHoursExceptions(locationMap: Map<string, string>): Promise<void> {
  console.log('Seeding hours exceptions...');
  
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  
  const holidays = [
    { label: 'Thanksgiving', date: `${currentYear}-11-26`, closed: true },
    { label: 'Black Friday', date: `${currentYear}-11-27`, closed: false, hours: { open: '06:00', close: '23:00' } },
    { label: 'Christmas Eve', date: `${currentYear}-12-24`, closed: false, hours: { open: '10:00', close: '18:00' } },
    { label: 'Christmas Day', date: `${currentYear}-12-25`, closed: true },
    { label: 'New Year\'s Day', date: `${nextYear}-01-01`, closed: true },
  ];
  
  for (const [storeNumber, locationId] of locationMap) {
    for (const holiday of holidays) {
      const ref = db.collection(`locations/${locationId}/hoursExceptions`).doc();
      await ref.set({
        type: 'holiday',
        label: holiday.label,
        startDate: holiday.date,
        endDate: holiday.date,
        closed: holiday.closed,
        intervals: holiday.closed ? [] : [holiday.hours],
        source: 'corporate',
      });
    }
    console.log(`  Added ${holidays.length} holiday exceptions to store #${storeNumber}`);
  }
}

async function seedClosures(locationMap: Map<string, string>): Promise<void> {
  console.log('Seeding sample closures...');
  
  const santaMonicaId = locationMap.get('031');
  if (santaMonicaId) {
    const now = new Date();
    const endsAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    
    const ref = db.collection(`locations/${santaMonicaId}/closures`).doc();
    await ref.set({
      reason: 'Water damage repair',
      startsAt: now.toISOString(),
      endsAt: endsAt.toISOString(),
      status: 'active',
    });
    console.log('  Added temporary closure to store #031 (Santa Monica)');
  }
}

async function createTestUser(): Promise<void> {
  console.log('Creating test user...');
  
  try {
    const existingUsers = await auth.listUsers(1);
    if (existingUsers.users.length > 0) {
      console.log('  Test user already exists');
      return;
    }
    
    await auth.createUser({
      uid: 'test-user-1',
      email: 'test@shiekh.test',
      password: 'testpassword123',
      displayName: 'Test User',
      emailVerified: true,
    });
    console.log('  Created test user: test@shiekh.test / testpassword123');
  } catch (error) {
    console.log('  Could not create test user (may already exist)');
  }
}

async function main() {
  const confirmed = await confirmRealProject();
  if (!confirmed) {
    console.log('Aborted - project ID did not match.');
    process.exit(1);
  }

  console.log('=== Shiekh Directory Seed Script ===');
  console.log(`Project: ${effectiveProjectId}`);
  console.log(`Mode: ${useEmulator ? 'EMULATOR' : 'PRODUCTION'}`);
  if (useEmulator) {
    console.log(`Firestore: ${process.env.FIRESTORE_EMULATOR_HOST}`);
    console.log(`Auth: ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
  }
  console.log('');
  
  try {
    await clearCollections();
    
    const regionMap = await seedRegions();
    const districtMap = await seedDistricts(regionMap);
    const locationMap = await seedLocations(regionMap, districtMap);
    await seedWarehouseAndOffice(regionMap, districtMap, locationMap);
    const peopleMap = await seedPeople();
    await seedAssignments(peopleMap, locationMap, districtMap, regionMap);
    await seedHoursExceptions(locationMap);
    await seedClosures(locationMap);
    
    if (useEmulator) {
      await createTestUser();
      console.log('');
      console.log('Test user credentials:');
      console.log('  Email: test@shiekh.test');
      console.log('  Password: testpassword123');
    }
    
    console.log('');
    console.log('=== Seed Complete ===');
    console.log(`  Regions: ${regionMap.size}`);
    console.log(`  Districts: ${districtMap.size}`);
    console.log(`  Locations: ${locationMap.size}`);
    console.log(`  People: ${peopleMap.size}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

main();

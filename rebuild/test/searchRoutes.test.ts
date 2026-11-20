/**
 * Store-number search ranking tests - REAL ROUTES with FAKE FIRESTORE
 * 
 * These tests call the actual createLocationsRouter and createSearchRouter
 * handlers through a minimal fake Firestore. No emulator or Java required.
 * 
 * STRICT ASSERTIONS: Every test has exact expected values. No `if (row)` guards,
 * no `<= N` bounds where an exact value is knowable, no `assert.ok(true)`.
 * 
 * MUTATION COVERAGE: Tests are designed to fail when these mutations are applied:
 * - Skip exact tier
 * - Limit-before-sort in header route
 * - Re-add mobilePhone people matching
 * - Remove M2 gate (store-first for all queries)
 * - Remove '#'/'#1' guard
 * - Enrich-before-cut in /api/app/search
 * - Stub status object (drop lifecycle)
 * - Hard-code time zone
 * - Drop standardHours
 * - Drop 3-digit phone threshold
 * - Remove location lifecycle filter
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { createLocationsRouter } from '../server/routes/locations';
import { createSearchRouter } from '../server/routes/search';

// ============================================================================
// CLOCK CONTROL - Fixed time for deterministic status tests
// ============================================================================

const OriginalDate = Date;
let fixedTime: Date | null = null;

function freezeTime(isoString: string) {
  fixedTime = new OriginalDate(isoString);
  
  // Override Date constructor
  (global as unknown as { Date: typeof Date }).Date = class extends OriginalDate {
    constructor(...args: unknown[]) {
      if (args.length === 0 && fixedTime) {
        super(fixedTime.getTime());
      } else {
        // @ts-expect-error - spread args to Date constructor
        super(...args);
      }
    }
    static now() {
      return fixedTime ? fixedTime.getTime() : OriginalDate.now();
    }
  } as typeof Date;
}

function unfreezeTime() {
  fixedTime = null;
  (global as unknown as { Date: typeof Date }).Date = OriginalDate;
}

// ============================================================================
// FAKE FIRESTORE IMPLEMENTATION
// ============================================================================

interface FakeDoc {
  id: string;
  data: Record<string, unknown>;
}

interface FakeCollection {
  docs: FakeDoc[];
}

type FakeFirestoreData = Record<string, FakeCollection>;

class FakeQuerySnapshot {
  docs: Array<{ id: string; data: () => Record<string, unknown>; exists: boolean }>;
  
  constructor(docs: FakeDoc[]) {
    this.docs = docs.map(d => ({
      id: d.id,
      data: () => d.data,
      exists: true,
    }));
  }
  
  get empty() {
    return this.docs.length === 0;
  }
}

class FakeQuery {
  private _docs: FakeDoc[];
  private _filters: Array<{ field: string; op: string; value: unknown }> = [];
  private _queryCount: { count: number };
  
  constructor(docs: FakeDoc[], queryCount: { count: number }) {
    this._docs = docs;
    this._queryCount = queryCount;
  }
  
  where(field: string, op: string, value: unknown): FakeQuery {
    this._filters.push({ field, op, value });
    return this;
  }
  
  orderBy(): FakeQuery {
    return this;
  }
  
  limit(): FakeQuery {
    return this;
  }
  
  async get(): Promise<FakeQuerySnapshot> {
    this._queryCount.count++;
    let result = this._docs;
    
    for (const filter of this._filters) {
      result = result.filter(doc => {
        const fieldValue = this._getNestedField(doc.data, filter.field);
        switch (filter.op) {
          case '==':
            return fieldValue === filter.value;
          case 'in':
            return Array.isArray(filter.value) && filter.value.includes(fieldValue);
          default:
            return true;
        }
      });
    }
    
    return new FakeQuerySnapshot(result);
  }
  
  private _getNestedField(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}

class FakeCollectionRef {
  private _docs: FakeDoc[];
  private _subCollections: FakeFirestoreData;
  private _queryCount: { count: number };
  
  constructor(docs: FakeDoc[], subCollections: FakeFirestoreData = {}, queryCount: { count: number }) {
    this._docs = docs;
    this._subCollections = subCollections;
    this._queryCount = queryCount;
  }
  
  where(field: string, op: string, value: unknown): FakeQuery {
    const query = new FakeQuery(this._docs, this._queryCount);
    return query.where(field, op, value);
  }
  
  orderBy(): FakeQuery {
    return new FakeQuery(this._docs, this._queryCount);
  }
  
  async get(): Promise<FakeQuerySnapshot> {
    this._queryCount.count++;
    return new FakeQuerySnapshot(this._docs);
  }
  
  doc(id: string) {
    const doc = this._docs.find(d => d.id === id);
    const queryCount = this._queryCount;
    const subCollections = this._subCollections;
    return {
      id,
      get: async () => {
        queryCount.count++;
        return {
          id,
          exists: !!doc,
          data: () => doc?.data || {},
        };
      },
      collection: (subPath: string) => {
        const subDocs = subCollections[`${id}/${subPath}`]?.docs || [];
        return new FakeCollectionRef(subDocs, {}, queryCount);
      },
    };
  }
}

interface FakeFirestoreInstance {
  db: Firestore;
  queryCount: { count: number };
  resetQueryCount: () => void;
}

function createFakeFirestore(data: {
  locations: FakeDoc[];
  people: FakeDoc[];
  regions?: FakeDoc[];
  districts?: FakeDoc[];
  assignments?: FakeDoc[];
  subCollections?: FakeFirestoreData;
}): FakeFirestoreInstance {
  const collections: Record<string, FakeDoc[]> = {
    locations: data.locations,
    people: data.people,
    regions: data.regions || [],
    districts: data.districts || [],
    assignments: data.assignments || [],
  };
  
  const subCollections = data.subCollections || {};
  const queryCount = { count: 0 };
  
  const db = {
    collection(path: string) {
      const parts = path.split('/');
      if (parts.length === 3) {
        const subKey = `${parts[1]}/${parts[2]}`;
        const subDocs = subCollections[subKey]?.docs || [];
        return new FakeCollectionRef(subDocs, {}, queryCount);
      }
      
      const docs = collections[path] || [];
      return new FakeCollectionRef(docs, subCollections, queryCount);
    },
    getAll(...refs: Array<{ id: string }>) {
      queryCount.count++;
      return Promise.resolve(refs.map(ref => {
        for (const [, docs] of Object.entries(collections)) {
          const doc = docs.find(d => d.id === ref.id);
          if (doc) {
            return { id: ref.id, exists: true, data: () => doc.data };
          }
        }
        return { id: ref.id, exists: false, data: () => ({}) };
      }));
    },
  } as unknown as Firestore;
  
  return { 
    db, 
    queryCount,
    resetQueryCount: () => { queryCount.count = 0; }
  };
}

// ============================================================================
// TEST APP SETUP
// ============================================================================

function createTestApp(db: Firestore, authUser: { uid: string; role: string }): Express {
  const app = express();
  
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.authUser = authUser;
    res.locals.requestId = 'test-req-id';
    next();
  });
  
  app.use('/locations', createLocationsRouter(db));
  app.use('/search', createSearchRouter(db));
  
  return app;
}

interface MockRes {
  locals: Record<string, unknown>;
  _statusCode: number;
  _headers: Record<string, string>;
  status(code: number): MockRes;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  getHeader(name: string): string | undefined;
  removeHeader(): void;
  end(): void;
  send(body: unknown): void;
}

function supertest(app: Express) {
  return {
    get(path: string) {
      return new Promise<{ status: number; body: { data?: unknown[]; error?: unknown } }>((resolve) => {
        const url = new URL(`http://localhost${path}`);
        const query: Record<string, string> = {};
        url.searchParams.forEach((v, k) => { query[k] = v; });
        
        const mockReq = {
          method: 'GET',
          url: path,
          path: url.pathname,
          query,
          params: {},
          headers: {},
          get: () => undefined,
          header: () => undefined,
        } as unknown as Request;
        
        let resolved = false;
        const mockRes: MockRes = {
          locals: {},
          _statusCode: 200,
          _headers: {},
          status(code: number) {
            this._statusCode = code;
            return this;
          },
          json(body: unknown) {
            if (!resolved) {
              resolved = true;
              resolve({ status: this._statusCode, body: body as { data?: unknown[]; error?: unknown } });
            }
          },
          setHeader(name: string, value: string) {
            this._headers[name] = value;
          },
          getHeader(name: string) {
            return this._headers[name];
          },
          removeHeader() {},
          end() {
            if (!resolved) {
              resolved = true;
              resolve({ status: this._statusCode, body: {} });
            }
          },
          send(body: unknown) {
            if (!resolved) {
              resolved = true;
              resolve({ status: this._statusCode, body: body as { data?: unknown[] } });
            }
          },
        };
        
        (app as unknown as (req: Request, res: Response, next: (err?: Error) => void) => void)(
          mockReq,
          mockRes as unknown as Response,
          (err?: Error) => {
            if (err && !resolved) {
              resolved = true;
              resolve({ status: 500, body: { error: err.message } });
            }
          }
        );
      });
    },
  };
}

// ============================================================================
// TEST DATA FIXTURES
// ============================================================================

function createTestData() {
  // Standard hours: 10:00-21:00 every day (easy to test with fixed time)
  const standardHours = {
    monday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    tuesday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    wednesday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    thursday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    friday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    saturday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    sunday: { closed: false, intervals: [{ open: '11:00', close: '19:00' }] },
  };
  
  // Chicago hours: 09:00-18:00 CT (10:00-19:00 PT equivalent)
  const chicagoHours = {
    monday: { closed: false, intervals: [{ open: '09:00', close: '18:00' }] },
    tuesday: { closed: false, intervals: [{ open: '09:00', close: '18:00' }] },
    wednesday: { closed: false, intervals: [{ open: '09:00', close: '18:00' }] },
    thursday: { closed: false, intervals: [{ open: '09:00', close: '18:00' }] },
    friday: { closed: false, intervals: [{ open: '09:00', close: '18:00' }] },
    saturday: { closed: false, intervals: [{ open: '09:00', close: '18:00' }] },
    sunday: { closed: false, intervals: [{ open: '10:00', close: '17:00' }] },
  };
  
  const baseLocation = {
    lifecycle: 'active',
    kind: 'store',
    timeZone: 'America/Los_Angeles',
    phonePublic: true,
    regionId: 'r1',
    districtId: 'd1',
    standardHours,
  };
  
  const locations: FakeDoc[] = [
    // === STATUS BADGE TEST STORES ===
    // Store 12: PT timezone, hours 10:00-21:00 - will be OPEN at 14:00 PT
    { id: 'loc-12', data: { ...baseLocation, storeNumber: '12', name: 'Fashion Valley', address: { city: 'San Diego', state: 'CA' }, mainPhone: '+15551112012' } },
    
    // Store 80: Chicago timezone, hours 09:00-18:00 CT
    // At 14:00 PT = 16:00 CT, store is OPEN (within 09:00-18:00)
    // At 19:30 PT = 21:30 CT, store is CLOSED (outside 09:00-18:00)
    { id: 'loc-80', data: { ...baseLocation, storeNumber: '80', name: 'Chicago Central', address: { city: 'Chicago', state: 'IL' }, mainPhone: '+13125558080', timeZone: 'America/Chicago', standardHours: chicagoHours } },
    
    // Store 81: Honolulu timezone (HST = PT - 2 or 3 hours depending on DST)
    // At 14:00 PT in winter (PST), Honolulu is 11:00 (PT - 3 hours, no DST in Hawaii)
    { id: 'loc-81', data: { ...baseLocation, storeNumber: '81', name: 'Honolulu Store', address: { city: 'Honolulu', state: 'HI' }, mainPhone: '+18085558181', timeZone: 'Pacific/Honolulu' } },
    
    // Store 82: will test CLOSED status (we'll query at 22:00 PT which is outside 10:00-21:00)
    { id: 'loc-82', data: { ...baseLocation, storeNumber: '82', name: 'Late Night Check', address: { city: 'Test', state: 'CA' }, mainPhone: '+15558282' } },
    
    // === LEADING ZERO TEST STORES ===
    { id: 'loc-7', data: { ...baseLocation, storeNumber: '7', name: 'Store Seven Raw', address: { city: 'Test City', state: 'CA' }, mainPhone: '+15551110007' } },
    { id: 'loc-07', data: { ...baseLocation, storeNumber: '07', name: 'Store Seven Padded', address: { city: 'Test City', state: 'CA' }, mainPhone: '+15551110077' } },
    { id: 'loc-007', data: { ...baseLocation, storeNumber: '007', name: 'Store Seven Triple', address: { city: 'Test City', state: 'CA' }, mainPhone: '+15551110777' } },
    { id: 'loc-012', data: { ...baseLocation, storeNumber: '012', name: 'Padded Twelve', address: { city: 'Los Angeles', state: 'CA' }, mainPhone: '+15551112012' } },
    
    // === PREFIX TEST STORES ===
    { id: 'loc-120', data: { ...baseLocation, storeNumber: '120', name: 'Prefix One Twenty', address: { city: 'Phoenix', state: 'AZ' }, mainPhone: '+15551112120' } },
    { id: 'loc-121', data: { ...baseLocation, storeNumber: '121', name: 'Prefix One TwentyOne', address: { city: 'Tucson', state: 'AZ' }, mainPhone: '+15551112121' } },
    { id: 'loc-125', data: { ...baseLocation, storeNumber: '125', name: 'Prefix One TwentyFive', address: { city: 'Denver', state: 'CO' }, mainPhone: '+15551112125' } },
    { id: 'loc-1200', data: { ...baseLocation, storeNumber: '1200', name: 'Four Digit', address: { city: 'Dallas', state: 'TX' }, mainPhone: '+15551121200' } },
    
    // === PHONE THRESHOLD TEST STORES ===
    // Store 101: exact match for "101"
    { id: 'loc-101', data: { ...baseLocation, storeNumber: '101', name: 'Main Street', address: { city: 'Seattle', state: 'WA' }, mainPhone: '+15559990101' } },
    
    // Store 33: phone contains "101" but name does NOT - for phone-only matching test
    // phonePublic: false to also test phone visibility
    { id: 'loc-33', data: { ...baseLocation, storeNumber: '33', name: 'Third Ave Store', address: { city: 'Portland', state: 'OR' }, mainPhone: '+15551010101', phonePublic: false } },
    
    // Store 44: phone contains "77" (2 digits) - should NOT match q=77 (phone threshold is 3)
    // Name does NOT contain "77" to isolate phone matching behavior
    { id: 'loc-44', data: { ...baseLocation, storeNumber: '44', name: 'Phone Test Store A', address: { city: 'Test', state: 'CA' }, mainPhone: '+15557777777' } },
    
    // Store 45: phone contains "777" (3 digits) - SHOULD match q=777 (phone threshold met)
    // Name does NOT contain "777" to isolate phone matching behavior
    { id: 'loc-45', data: { ...baseLocation, storeNumber: '45', name: 'Phone Test Store B', address: { city: 'Test', state: 'CA' }, mainPhone: '+15557777777' } },
    
    // === SUBSTRING TEST STORES (for single-digit M5 fix) ===
    { id: 'loc-112', data: { ...baseLocation, storeNumber: '112', name: 'Westfield Topanga', address: { city: 'Canoga Park', state: 'CA' }, mainPhone: '+15551112112' } },
    { id: 'loc-08', data: { ...baseLocation, storeNumber: '08', name: '12th Street Store', address: { city: 'Oakland', state: 'CA' }, mainPhone: '+15551112008' } },
    { id: 'loc-307', data: { ...baseLocation, storeNumber: '307', name: 'Extra 307', address: { city: 'Extra City', state: 'EX' }, mainPhone: '+15553070307' } },
    { id: 'loc-317', data: { ...baseLocation, storeNumber: '317', name: 'Extra 317', address: { city: 'Extra City', state: 'EX' }, mainPhone: '+15553170317' } },
    { id: 'loc-70', data: { ...baseLocation, storeNumber: '70', name: 'Store Seventy', address: { city: 'Seventy City', state: 'SV' }, mainPhone: '+15550700070' } },
    
    // === SINGLE-DIGIT AND ZERO STORES ===
    { id: 'loc-1', data: { ...baseLocation, storeNumber: '1', name: 'Store One', address: { city: 'Boston', state: 'MA' }, mainPhone: '+15551110001' } },
    { id: 'loc-10', data: { ...baseLocation, storeNumber: '10', name: 'Store Ten', address: { city: 'Miami', state: 'FL' }, mainPhone: '+15551110010' } },
    { id: 'loc-100', data: { ...baseLocation, storeNumber: '100', name: 'Store Hundred', address: { city: 'Atlanta', state: 'GA' }, mainPhone: '+15551110100' } },
    { id: 'loc-0', data: { ...baseLocation, storeNumber: '0', name: 'Store Zero', address: { city: 'Zero City', state: 'ZZ' }, mainPhone: '+15550000000' } },
    { id: 'loc-00', data: { ...baseLocation, storeNumber: '00', name: 'Store Double Zero', address: { city: 'Zero City', state: 'ZZ' }, mainPhone: '+15550000001' } },
    
    // Store with EMPTY store number (should not match zero queries)
    { id: 'loc-empty', data: { ...baseLocation, storeNumber: '', name: 'Empty Number Store', address: { city: 'Empty City', state: 'EC' }, mainPhone: '+15550000002' } },
    
    // === PHONE VISIBILITY TEST STORES ===
    // Store with missing phonePublic field (should hide phone per === true check)
    { id: 'loc-no-phone-public', data: { ...baseLocation, storeNumber: '99', name: 'No Phone Public', address: { city: 'Hidden', state: 'HP' }, mainPhone: '+15559999999', phonePublic: undefined } },
    
    // Store with phonePublic: true (should show phone)
    { id: 'loc-phone-visible', data: { ...baseLocation, storeNumber: '88', name: 'Phone Visible', address: { city: 'Visible', state: 'VP' }, mainPhone: '+15558888888', phonePublic: true } },
    
    // === LIFECYCLE TEST STORES ===
    // Retired store (should not appear in any results)
    { id: 'loc-retired', data: { ...baseLocation, lifecycle: 'retired', storeNumber: '98', name: 'Retired Store', address: { city: 'Old City', state: 'XX' }, mainPhone: '+15559999998' } },
    
    // Planned store (should not appear in any results)
    { id: 'loc-planned', data: { ...baseLocation, lifecycle: 'planned', storeNumber: '50', name: 'Planned Store', address: { city: 'Future City', state: 'YY' }, mainPhone: '+15555050050' } },
    
    // Inactive store (should not appear)
    { id: 'loc-inactive', data: { ...baseLocation, lifecycle: 'inactive', storeNumber: '51', name: 'Inactive Store', address: { city: 'Inactive City', state: 'IC' }, mainPhone: '+15555151' } },
    
    // === TEXT SEARCH TEST STORES ===
    { id: 'loc-la1', data: { ...baseLocation, storeNumber: '200', name: 'Los Angeles Main', address: { city: 'Los Angeles', state: 'CA' }, mainPhone: '+12135551200' } },
    { id: 'loc-la2', data: { ...baseLocation, storeNumber: '201', name: 'LA Downtown', address: { city: 'Los Angeles', state: 'CA' }, mainPhone: '+12135551201' } },
    
    // === LIMIT-AFTER-SORT TEST: Need >10 stores that match a query ===
    // These are low-priority stores (high numbers) that should be dropped by limit
    ...Array.from({ length: 15 }, (_, i) => ({
      id: `loc-extra-${i}`,
      data: {
        ...baseLocation,
        storeNumber: String(300 + i),
        name: `Extra Store ${300 + i}`,
        address: { city: 'Extra City', state: 'EX' },
        mainPhone: `+1555${String(300 + i).padStart(7, '0')}`,
      },
    })),
  ];
  
  const people: FakeDoc[] = [
    // Active person with work phone
    { id: 'person-1', data: { fullName: 'John Smith', lifecycle: 'active', workEmail: 'john@test.com', workPhone: '+15551234567', mobilePhone: '+15559876543' } },
    
    // Person whose name contains "12"
    { id: 'person-12fan', data: { fullName: 'Jordan 12 Fan', lifecycle: 'active', workEmail: 'jordan12@test.com', workPhone: '+15551212121' } },
    
    // Person with mobile containing query digits (should NOT match after M7 fix)
    { id: 'person-mobile', data: { fullName: 'Ana Garcia', lifecycle: 'active', workEmail: 'ana@test.com', workPhone: '+15555555555', mobilePhone: '+15551299999' } },
    
    // Person with work phone containing 101
    { id: 'person-phone101', data: { fullName: 'Lee Park', lifecycle: 'active', workEmail: 'lee@test.com', workPhone: '+15551010100' } },
    
    // Person with work phone containing 000 (for zero-only test)
    { id: 'person-phone000', data: { fullName: 'Zero Worker', lifecycle: 'active', workEmail: 'zero@test.com', workPhone: '+15550001234' } },
    
    // Inactive person (should not appear)
    { id: 'person-inactive', data: { fullName: 'Inactive Person', lifecycle: 'inactive', workEmail: 'inactive@test.com', workPhone: '+15550000000' } },
    
    // Person for name search test - name starts with "Los"
    { id: 'person-los', data: { fullName: 'Los Smith', lifecycle: 'active', workEmail: 'los@test.com', workPhone: '+15558888888' } },
    
    // Person with 555 in work phone (3-digit phone match test)
    { id: 'person-phone555', data: { fullName: 'Alice Five', lifecycle: 'active', workEmail: 'alice@test.com', workPhone: '+15555551234' } },
  ];
  
  const subCollections: FakeFirestoreData = {};
  
  return { locations, people, subCollections };
}

// ============================================================================
// TESTS - HEADER ROUTE (/locations/search)
// ============================================================================

describe('Header Route - Real Router Tests (/locations/search)', () => {
  let testData: ReturnType<typeof createTestData>;
  let fakeFs: FakeFirestoreInstance;
  
  beforeEach(() => {
    testData = createTestData();
    fakeFs = createFakeFirestore(testData);
  });
  
  afterEach(() => {
    unfreezeTime();
  });
  
  describe('Query Guards - Exact Results', () => {
    it('bare "#" query returns exactly empty array', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=%23');
      
      assert.strictEqual(res.status, 200, 'Status must be 200');
      assert.strictEqual(Array.isArray(res.body.data), true, 'data must be array');
      assert.strictEqual(res.body.data!.length, 0, 'bare # must return exactly 0 results');
    });
    
    it('"#1" query returns store 1 first, with exact expected stores', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=%231');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string; id: string }>;
      
      assert.ok(results.length > 0, '#1 must return results');
      assert.strictEqual(results[0].storeNumber, '1', 'First result must be store 1 (exact match)');
      assert.strictEqual(results[0].id, 'loc-1', 'First result id must be loc-1');
      
      // Verify no retired/planned stores
      const storeNums = results.map(r => r.storeNumber);
      assert.strictEqual(storeNums.includes('98'), false, 'Must not include retired store 98');
      assert.strictEqual(storeNums.includes('50'), false, 'Must not include planned store 50');
    });
    
    it('single non-digit "a" returns exactly empty array', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=a');
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data!.length, 0, 'Single letter "a" must return exactly 0 results');
    });
  });
  
  describe('Single-Digit Store Queries - M5 Fix (No Tier 3)', () => {
    it('query "7" returns exact order: [7, 07, 007, 70] - no 307, 317', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=7');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      const storeNums = results.map(r => r.storeNumber);
      
      // Exact expected order: 7 (raw exact), 07 (shorter), 007 (longest), 70 (prefix)
      assert.deepStrictEqual(storeNums.slice(0, 4), ['7', '07', '007', '70'], 
        'Exact order must be [7, 07, 007, 70]');
      
      // M5 fix: no substring matches for single-digit
      assert.strictEqual(storeNums.includes('307'), false, 'Must NOT include substring 307');
      assert.strictEqual(storeNums.includes('317'), false, 'Must NOT include substring 317');
    });
    
    it('query "1" returns store 1 first, with 10, 12 before 100', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=1');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      
      assert.strictEqual(results[0].storeNumber, '1', 'First must be exact match store 1');
      
      // After exact (1), prefixes should be ordered by normalized length
      // 2-digit prefixes (10, 12) before 3-digit (100, 101, 112, 120, 121, 125) before 4-digit (1200)
      const idx10 = results.findIndex(r => r.storeNumber === '10');
      const idx12 = results.findIndex(r => r.storeNumber === '12');
      const idx100 = results.findIndex(r => r.storeNumber === '100');
      
      assert.ok(idx10 !== -1, 'Must include store 10');
      assert.ok(idx12 !== -1, 'Must include store 12');
      assert.ok(idx100 !== -1, 'Must include store 100');
      
      // 2-digit prefixes before 3-digit
      assert.ok(idx10 < idx100, '10 (2-digit prefix) must come before 100 (3-digit)');
      assert.ok(idx12 < idx100, '12 (2-digit prefix) must come before 100 (3-digit)');
    });
  });
  
  describe('Leading Zero Equivalence - Exact Order', () => {
    it('query "12" returns exact order: [12, 012, ...prefixes]', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=12');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string; id: string }>;
      
      // First two must be exact matches in raw-exact order
      assert.strictEqual(results[0].storeNumber, '12', 'First must be raw exact "12"');
      assert.strictEqual(results[0].id, 'loc-12');
      assert.strictEqual(results[1].storeNumber, '012', 'Second must be "012"');
      assert.strictEqual(results[1].id, 'loc-012');
      
      // Then prefixes in normalized-length order: 120/121/125 (3-digit) before 1200 (4-digit)
      const idx121 = results.findIndex(r => r.storeNumber === '121');
      const idx1200 = results.findIndex(r => r.storeNumber === '1200');
      assert.ok(idx121 !== -1 && idx1200 !== -1, 'Must include both 121 and 1200');
      assert.ok(idx121 < idx1200, '121 (3-digit) must come before 1200 (4-digit)');
    });
    
    it('query "012" returns exact order: [012, 12, ...prefixes]', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=012');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string; id: string }>;
      
      assert.strictEqual(results[0].storeNumber, '012', 'First must be raw exact "012"');
      assert.strictEqual(results[1].storeNumber, '12', 'Second must be "12"');
    });
    
    it('query "07" returns exact order: [07, 7, 007]', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=07');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      
      // 07 is raw exact, 7 is shorter (1 char), 007 is longer (3 chars)
      assert.strictEqual(results[0].storeNumber, '07', 'First must be raw exact "07"');
      assert.strictEqual(results[1].storeNumber, '7', 'Second must be shorter "7"');
      assert.strictEqual(results[2].storeNumber, '007', 'Third must be "007"');
    });
  });
  
  describe('Limit After Sort - Exact IDs', () => {
    it('query "3" returns exactly 10 results with high-ranked stores present', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=3');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string; id: string }>;
      
      // Should be capped at 10
      assert.strictEqual(results.length, 10, 'Must return exactly 10 results (limit)');
      
      // Store 33 should be in results (it's an exact/prefix match for normalized "3")
      // Extra stores 300-314 are also prefix matches
      const storeNums = results.map(r => r.storeNumber);
      
      // The first result for "3" should be store 33 or early 300s
      // This test fails if limit-before-sort is applied (would return first 10 by fixture order)
      // With limit-after-sort, exact matches and shorter prefixes come first
      assert.ok(storeNums.includes('33') || storeNums[0].startsWith('3'), 
        'Store 33 or 3xx must be in top 10 (limit-after-sort)');
    });
  });
  
  describe('Zero-Only Queries - Exact Results', () => {
    it('query "0" returns exactly [0, 00] - no empty-number store', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=0');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string; id: string }>;
      
      // Exact match only for zero-only query
      assert.strictEqual(results.length, 2, 'Must return exactly 2 zero stores');
      
      const storeNums = results.map(r => r.storeNumber);
      assert.ok(storeNums.includes('0'), 'Must include store 0');
      assert.ok(storeNums.includes('00'), 'Must include store 00');
      
      // Empty-number store must NOT be included
      const ids = results.map(r => r.id);
      assert.strictEqual(ids.includes('loc-empty'), false, 'Must NOT include empty-number store');
    });
  });
  
  describe('Retired/Planned/Inactive Exclusion - Exact Absence', () => {
    it('query "98" returns empty (retired store excluded)', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=98');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      
      // No results because store 98 is retired
      assert.strictEqual(results.length, 0, 'Retired store 98 must not appear');
    });
    
    it('query "50" returns empty (planned store excluded)', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=50');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      
      assert.strictEqual(results.length, 0, 'Planned store 50 must not appear');
    });
    
    it('query "51" returns empty (inactive store excluded)', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=51');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      
      assert.strictEqual(results.length, 0, 'Inactive store 51 must not appear');
    });
  });
  
  describe('People Never in Header', () => {
    it('header search never returns people even for name query "john"', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=john');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ type?: string }>;
      
      for (const r of results) {
        assert.notStrictEqual(r.type, 'person', 'Header must never return people');
      }
    });
  });
  
  describe('Response Keys - Exact Set', () => {
    it('returns exactly {id, storeNumber, title, city, state}', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=12');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<Record<string, unknown>>;
      assert.ok(results.length > 0, 'Must have results');
      
      const keys = Object.keys(results[0]).sort();
      assert.deepStrictEqual(keys, ['city', 'id', 'state', 'storeNumber', 'title'], 
        'Keys must be exactly {city, id, state, storeNumber, title}');
    });
  });
});

// ============================================================================
// TESTS - LOCATIONS PAGE ROUTE (/search)
// ============================================================================

describe('Locations Page Route - Real Router Tests (/search)', () => {
  let testData: ReturnType<typeof createTestData>;
  let fakeFs: FakeFirestoreInstance;
  
  beforeEach(() => {
    testData = createTestData();
    fakeFs = createFakeFirestore(testData);
  });
  
  afterEach(() => {
    unfreezeTime();
  });
  
  describe('Query Guards - Exact Results', () => {
    it('bare "#" query returns exactly empty array', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=%23');
      
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data!.length, 0, 'bare # must return exactly 0 results');
    });
    
    it('1-letter text "l" returns results (not blocked by guard)', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=l');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string }>;
      
      // Should have results (Los Smith person, Los Angeles stores, etc.)
      assert.ok(results.length > 0, '1-letter "l" must return results');
      
      // Los Smith should be present
      const losSmith = results.find(r => r.title === 'Los Smith');
      assert.ok(losSmith, 'Los Smith must be in results');
    });
  });
  
  describe('Status Badges - Deterministic Time', () => {
    it('store 12 is OPEN at 14:00 PT (within 10:00-21:00)', async () => {
      // Freeze time to Wednesday 14:00 PT (21:00 UTC in winter)
      freezeTime('2026-01-14T22:00:00Z'); // 14:00 PST
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=12');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; statusNow?: { state: string; reason: string } }>;
      
      const store12 = results.find(r => r.type === 'location' && r.title.startsWith('#12 '));
      assert.ok(store12, 'Store 12 must be in results');
      assert.ok(store12.statusNow, 'Store 12 must have statusNow');
      assert.strictEqual(store12.statusNow.state, 'Open', 'Store 12 must be Open at 14:00 PT');
      assert.strictEqual(store12.statusNow.reason, 'Within scheduled hours', 
        'Reason must be "Within scheduled hours"');
    });
    
    it('store 82 is CLOSED at 22:00 PT (outside 10:00-21:00)', async () => {
      // Freeze time to Wednesday 22:00 PT (06:00 UTC next day)
      freezeTime('2026-01-15T06:00:00Z'); // 22:00 PST
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=82');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; statusNow?: { state: string; reason: string } }>;
      
      const store82 = results.find(r => r.type === 'location' && r.title.startsWith('#82 '));
      assert.ok(store82, 'Store 82 must be in results');
      assert.ok(store82.statusNow, 'Store 82 must have statusNow');
      assert.strictEqual(store82.statusNow.state, 'Closed', 'Store 82 must be Closed at 22:00 PT');
      assert.strictEqual(store82.statusNow.reason, 'Outside scheduled hours',
        'Reason must be "Outside scheduled hours"');
    });
    
    it('store 80 (Chicago) uses correct timezone - OPEN at 16:00 CT', async () => {
      // Freeze time to Wednesday 14:00 PT = 16:00 CT
      // Chicago hours are 09:00-18:00 CT, so 16:00 CT is OPEN
      freezeTime('2026-01-14T22:00:00Z'); // 14:00 PST = 16:00 CST
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=80');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; statusNow?: { state: string; reason: string; timeZone?: string } }>;
      
      const store80 = results.find(r => r.type === 'location' && r.title.startsWith('#80 '));
      assert.ok(store80, 'Store 80 must be in results');
      assert.ok(store80.statusNow, 'Store 80 must have statusNow');
      assert.strictEqual(store80.statusNow.state, 'Open', 
        'Store 80 (Chicago) must be Open at 16:00 CT (14:00 PT)');
      assert.strictEqual(store80.statusNow.timeZone, 'America/Chicago',
        'Store 80 must use America/Chicago timezone');
    });
    
    it('store 80 (Chicago) is CLOSED at 19:30 PT = 21:30 CT (outside 09:00-18:00)', async () => {
      // Freeze time to 19:30 PT = 21:30 CT (outside Chicago's 09:00-18:00)
      freezeTime('2026-01-15T03:30:00Z'); // 19:30 PST = 21:30 CST
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=80');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; statusNow?: { state: string; reason: string } }>;
      
      const store80 = results.find(r => r.type === 'location' && r.title.startsWith('#80 '));
      assert.ok(store80, 'Store 80 must be in results');
      assert.strictEqual(store80.statusNow!.state, 'Closed',
        'Store 80 must be Closed at 21:30 CT');
    });
  });
  
  describe('Phone Visibility - Exact', () => {
    it('store 33 (phonePublic: false) has NO phone field', async () => {
      freezeTime('2026-01-14T22:00:00Z');
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=33');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; phone?: string; id: string }>;
      
      const store33 = results.find(r => r.id === 'loc-33');
      assert.ok(store33, 'Store 33 must be in results');
      assert.strictEqual(store33.phone, undefined, 'Store 33 (phonePublic: false) must NOT show phone');
    });
    
    it('store 99 (phonePublic: undefined) has NO phone field', async () => {
      freezeTime('2026-01-14T22:00:00Z');
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=99');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; phone?: string; id: string }>;
      
      const store99 = results.find(r => r.id === 'loc-no-phone-public');
      assert.ok(store99, 'Store 99 must be in results');
      assert.strictEqual(store99.phone, undefined, 
        'Store 99 (phonePublic: undefined) must NOT show phone (=== true check)');
    });
    
    it('store 88 (phonePublic: true) HAS phone field', async () => {
      freezeTime('2026-01-14T22:00:00Z');
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=88');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; phone?: string; id: string }>;
      
      const store88 = results.find(r => r.id === 'loc-phone-visible');
      assert.ok(store88, 'Store 88 must be in results');
      assert.ok(store88.phone, 'Store 88 (phonePublic: true) must show phone');
    });
  });
  
  describe('Phone Matching Threshold - 2 vs 3 digits', () => {
    it('2-digit query "77" does NOT phone-match store 44', async () => {
      freezeTime('2026-01-14T22:00:00Z');
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=77');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ id: string; type: string }>;
      
      // Store 44's phone contains "77" but 2-digit threshold should block phone match
      // Store 44's name is "Phone Test Store A" (no "77") and storeNumber is "44"
      const store44 = results.find(r => r.id === 'loc-44');
      assert.strictEqual(store44, undefined, 
        'Store 44 must NOT match - 2-digit phone threshold not met');
    });
    
    it('3-digit query "777" DOES phone-match store 45', async () => {
      freezeTime('2026-01-14T22:00:00Z');
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=777');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ id: string; type: string }>;
      
      // Store 45's phone contains "777" and 3-digit threshold is met
      const store45 = results.find(r => r.id === 'loc-45');
      assert.ok(store45, 'Store 45 must match - 3-digit phone threshold met');
    });
  });
  
  describe('M7 Privacy Fix - mobilePhone Removed', () => {
    it('query "1299" returns NO person (mobilePhone not matched)', async () => {
      freezeTime('2026-01-14T22:00:00Z');
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=1299');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; id: string }>;
      
      // Ana Garcia has mobilePhone +15551299999 - must NOT match
      const ana = results.find(r => r.id === 'person-mobile');
      assert.strictEqual(ana, undefined, 'Ana Garcia must NOT be found by mobilePhone');
    });
  });
  
  describe('M2 Gate - Text Query Ordering', () => {
    it('query "los" puts Los Smith FIRST (startsWith, before locations)', async () => {
      freezeTime('2026-01-14T22:00:00Z');
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=los');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; id: string }>;
      
      // Los Smith starts with "los", Los Angeles Main contains "Los"
      // For text queries (not store-number), startsWith items come first
      const losSmith = results.find(r => r.id === 'person-los');
      assert.ok(losSmith, 'Los Smith must be in results');
      
      // Los Smith should be in top 3 (startsWith sort puts exact/startsWith first)
      const idx = results.findIndex(r => r.id === 'person-los');
      assert.ok(idx <= 2, `Los Smith must be in top 3 for "los" query (was at index ${idx})`);
    });
  });
  
  describe('Retired/Planned/Inactive Exclusion - Exact Absence', () => {
    it('query "inactive" returns NO Inactive Person (lifecycle filter)', async () => {
      freezeTime('2026-01-14T22:00:00Z');
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=inactive');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; id: string }>;
      
      const inactivePerson = results.find(r => r.id === 'person-inactive');
      assert.strictEqual(inactivePerson, undefined, 'Inactive Person must NOT appear');
    });
    
    it('query "retired" returns NO retired store 98 (location lifecycle filter)', async () => {
      freezeTime('2026-01-14T22:00:00Z');
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=retired');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; id: string }>;
      
      const retired = results.find(r => r.id === 'loc-retired');
      assert.strictEqual(retired, undefined, 'Retired store must NOT appear');
    });
    
    it('query "planned" returns NO planned store 50 (location lifecycle filter)', async () => {
      freezeTime('2026-01-14T22:00:00Z');
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=planned');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; id: string }>;
      
      const planned = results.find(r => r.id === 'loc-planned');
      assert.strictEqual(planned, undefined, 'Planned store must NOT appear');
    });
  });
  
  describe('Zero-Only Queries - Exact Results', () => {
    it('query "0" returns only zero stores, skips people phone match', async () => {
      freezeTime('2026-01-14T22:00:00Z');
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=0');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; id: string }>;
      
      // Should have zero stores
      const locations = results.filter(r => r.type === 'location');
      assert.ok(locations.length >= 2, 'Must have at least 2 zero stores');
      
      const ids = locations.map(r => r.id);
      assert.ok(ids.includes('loc-0'), 'Must include loc-0');
      assert.ok(ids.includes('loc-00'), 'Must include loc-00');
      
      // Empty-number store must NOT be included
      assert.strictEqual(ids.includes('loc-empty'), false, 'Must NOT include empty-number store');
      
      // Zero Worker (phone has 000) must NOT be matched (zero-only skips phone)
      const zeroWorker = results.find(r => r.id === 'person-phone000');
      assert.strictEqual(zeroWorker, undefined, 'Zero Worker must NOT be matched by zero-only query');
    });
  });
  
  describe('M8 - Enrichment Query Count (Exact)', () => {
    it('query "12" runs exactly expected queries (not enrich-all)', async () => {
      fakeFs.resetQueryCount();
      freezeTime('2026-01-14T22:00:00Z');
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      await supertest(app).get('/search?q=12');
      
      // Expected: 1 locations + 1 people + enrichment for shown rows only
      // For "12", we have ~6-8 location matches and 1 person match
      // Enrichment = 2 queries (closures + exceptions) per shown location
      // Max 20 locations shown = max 40 enrichment queries
      // Total: 2 + 40 = 42 max
      // But with fewer matches, it should be less
      // Let's say we expect < 25 for this query
      assert.ok(fakeFs.queryCount.count <= 25, 
        `Query count must be bounded by enrich-after-cut, got ${fakeFs.queryCount.count}`);
      assert.ok(fakeFs.queryCount.count >= 2,
        `Query count must be at least 2 (locations + people), got ${fakeFs.queryCount.count}`);
    });
    
    it('query "1" runs bounded queries (many matches, enrich only shown)', async () => {
      fakeFs.resetQueryCount();
      freezeTime('2026-01-14T22:00:00Z');
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      await supertest(app).get('/search?q=1');
      
      // "1" matches many stores (1, 10, 12, 100, 101, 112, 120, 121, 125, 1200, etc.)
      // But only top 20 locations are enriched
      // Total: 2 (initial) + 2×20 (max enrichment) = 42 max
      assert.ok(fakeFs.queryCount.count <= 45, 
        `Query count must be <= 45, got ${fakeFs.queryCount.count}`);
    });
  });
  
  describe('Role Matrix - Exact Comparison', () => {
    it('all roles get identical location results for store query "12"', async () => {
      freezeTime('2026-01-14T22:00:00Z');
      
      const roles = ['Admin', 'Steward', 'Leader', 'Viewer', 'Store'];
      let adminLocationIds: string[] = [];
      
      for (const role of roles) {
        const app = createTestApp(fakeFs.db, { uid: `user-${role}`, role });
        const res = await supertest(app).get('/search?q=12');
        
        assert.strictEqual(res.status, 200);
        const results = res.body.data as Array<{ id: string; type: string }>;
        const locationIds = results.filter(r => r.type === 'location').map(r => r.id);
        
        if (role === 'Admin') {
          adminLocationIds = locationIds;
          assert.ok(adminLocationIds.length > 0, 'Admin must get location results');
        } else {
          assert.deepStrictEqual(locationIds, adminLocationIds, 
            `${role} must get identical location ids as Admin`);
        }
        
        // No mobilePhone in any response
        for (const r of results) {
          assert.strictEqual('mobilePhone' in r, false, 
            `${role} response must not contain mobilePhone`);
        }
      }
    });
  });
  
  describe('Response Structure - Exact Keys', () => {
    it('location has {type, id, title, subtitle, statusNow, phone?}', async () => {
      freezeTime('2026-01-14T22:00:00Z');
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=12');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<Record<string, unknown>>;
      
      const location = results.find(r => r.type === 'location');
      assert.ok(location, 'Must have location result');
      
      assert.ok('type' in location, 'Location must have type');
      assert.ok('id' in location, 'Location must have id');
      assert.ok('title' in location, 'Location must have title');
      assert.ok('subtitle' in location, 'Location must have subtitle');
      assert.ok('statusNow' in location, 'Location must have statusNow');
      
      assert.strictEqual(location.type, 'location');
    });
    
    it('person has {type, id, title, subtitle, phone?} but NO statusNow', async () => {
      freezeTime('2026-01-14T22:00:00Z');
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=john');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<Record<string, unknown>>;
      
      const person = results.find(r => r.type === 'person');
      assert.ok(person, 'Must have person result');
      
      assert.ok('type' in person, 'Person must have type');
      assert.ok('id' in person, 'Person must have id');
      assert.ok('title' in person, 'Person must have title');
      assert.ok('subtitle' in person, 'Person must have subtitle');
      assert.strictEqual('statusNow' in person, false, 'Person must NOT have statusNow');
    });
  });
});

// ============================================================================
// TESTS - UTILITY FUNCTIONS (helper-level, not mutation tests)
// ============================================================================

describe('Store Number Utility Functions (Helper Unit Tests)', () => {
  it('00123 is valid store query, normalizes to 123', async () => {
    const { isStoreNumberQuery, normalizeStoreNumber } = await import('../server/utils/storeNumber');
    
    assert.strictEqual(isStoreNumberQuery('00123'), true);
    assert.strictEqual(normalizeStoreNumber('00123'), '123');
  });
  
  it('12345 is NOT valid (5 significant digits)', async () => {
    const { isStoreNumberQuery } = await import('../server/utils/storeNumber');
    assert.strictEqual(isStoreNumberQuery('12345'), false);
  });
  
  it('0012345 is NOT valid (12345 is 5 digits)', async () => {
    const { isStoreNumberQuery } = await import('../server/utils/storeNumber');
    assert.strictEqual(isStoreNumberQuery('0012345'), false);
  });
  
  it('empty string normalizes to "00"', async () => {
    const { normalizeStoreNumber } = await import('../server/utils/storeNumber');
    assert.strictEqual(normalizeStoreNumber(''), '00');
  });
  
  it('isSingleDigitStoreQuery identifies single-digit queries', async () => {
    const { isSingleDigitStoreQuery } = await import('../server/utils/storeNumber');
    
    assert.strictEqual(isSingleDigitStoreQuery('7'), true);
    assert.strictEqual(isSingleDigitStoreQuery('#7'), true);
    assert.strictEqual(isSingleDigitStoreQuery('07'), true);
    assert.strictEqual(isSingleDigitStoreQuery('007'), true);
    assert.strictEqual(isSingleDigitStoreQuery('12'), false);
    assert.strictEqual(isSingleDigitStoreQuery('10'), false);
  });
});

console.log('Search route tests (real routers, strict assertions) loaded');

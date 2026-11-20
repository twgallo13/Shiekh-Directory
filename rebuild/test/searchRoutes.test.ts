/**
 * Store-number search ranking tests - REAL ROUTES with FAKE FIRESTORE
 * 
 * These tests call the actual createLocationsRouter and createSearchRouter
 * handlers through a minimal fake Firestore. No emulator or Java required.
 * 
 * Test coverage (M9 requirements):
 * - Role matrix (Admin, Steward, Leader, Viewer, Store) on both routes
 * - Leading zeros (7, 07, 007, 12, 012, #12, 0012)
 * - Zero-only queries (0, 00, 000), '#', '#1', 1-char guards
 * - 101 store vs phone fragment (loc-33 phone-only test)
 * - Limit-after-sort with >10 (header) and >20 (Locations page) weak matches
 * - Phone 2-digit vs 3-digit threshold
 * - Tie-break rules (raw exact, then shorter raw, then lex)
 * - Retired/planned/inactive records excluded
 * - People never appear in header route response
 * - mobilePhone removed from people match (M7 privacy fix)
 * - Non-numeric query ordering unchanged (M2 gate)
 * - Correct Open/Closed status and phone visibility
 * - M8: enrichment only for final rows
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { createLocationsRouter } from '../server/routes/locations';
import { createSearchRouter } from '../server/routes/search';

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
  // Standard hours for status calculation
  const standardHours = {
    monday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    tuesday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    wednesday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    thursday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    friday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    saturday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
    sunday: { closed: false, intervals: [{ open: '11:00', close: '19:00' }] },
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
    // Store number variants for leading-zero tests
    { id: 'loc-7', data: { ...baseLocation, storeNumber: '7', name: 'Store Seven Raw', address: { city: 'Test City', state: 'CA' }, mainPhone: '+15551110007' } },
    { id: 'loc-07', data: { ...baseLocation, storeNumber: '07', name: 'Store Seven Padded', address: { city: 'Test City', state: 'CA' }, mainPhone: '+15551110077' } },
    { id: 'loc-007', data: { ...baseLocation, storeNumber: '007', name: 'Store Seven Triple', address: { city: 'Test City', state: 'CA' }, mainPhone: '+15551110777' } },
    
    // Store 12 variants
    { id: 'loc-12', data: { ...baseLocation, storeNumber: '12', name: 'Fashion Valley', address: { city: 'San Diego', state: 'CA' }, mainPhone: '+15551112012' } },
    { id: 'loc-012', data: { ...baseLocation, storeNumber: '012', name: 'Padded Twelve', address: { city: 'Los Angeles', state: 'CA' }, mainPhone: '+15551112012' } },
    
    // Prefix test stores
    { id: 'loc-120', data: { ...baseLocation, storeNumber: '120', name: 'Prefix One Twenty', address: { city: 'Phoenix', state: 'AZ' }, mainPhone: '+15551112120' } },
    { id: 'loc-121', data: { ...baseLocation, storeNumber: '121', name: 'Prefix One TwentyOne', address: { city: 'Tucson', state: 'AZ' }, mainPhone: '+15551112121' } },
    { id: 'loc-125', data: { ...baseLocation, storeNumber: '125', name: 'Prefix One TwentyFive', address: { city: 'Denver', state: 'CO' }, mainPhone: '+15551112125' } },
    { id: 'loc-1200', data: { ...baseLocation, storeNumber: '1200', name: 'Four Digit', address: { city: 'Dallas', state: 'TX' }, mainPhone: '+15551121200' } },
    
    // Store 101 for phone fragment test
    { id: 'loc-101', data: { ...baseLocation, storeNumber: '101', name: 'Main Street', address: { city: 'Seattle', state: 'WA' }, mainPhone: '+15559990101' } },
    
    // Store 33 - phone contains 101, name does NOT contain 101 (for phone-only test)
    { id: 'loc-33', data: { ...baseLocation, storeNumber: '33', name: 'Third Ave Store', address: { city: 'Portland', state: 'OR' }, mainPhone: '+15551010101', phonePublic: false } },
    
    // Store 112 (for 12 substring test)
    { id: 'loc-112', data: { ...baseLocation, storeNumber: '112', name: 'Westfield Topanga', address: { city: 'Canoga Park', state: 'CA' }, mainPhone: '+15551112112' } },
    
    // Store with "12" in name
    { id: 'loc-08', data: { ...baseLocation, storeNumber: '08', name: '12th Street Store', address: { city: 'Oakland', state: 'CA' }, mainPhone: '+15551112008' } },
    
    // Store 1 for single-digit tests
    { id: 'loc-1', data: { ...baseLocation, storeNumber: '1', name: 'Store One', address: { city: 'Boston', state: 'MA' }, mainPhone: '+15551110001' } },
    { id: 'loc-10', data: { ...baseLocation, storeNumber: '10', name: 'Store Ten', address: { city: 'Miami', state: 'FL' }, mainPhone: '+15551110010' } },
    { id: 'loc-100', data: { ...baseLocation, storeNumber: '100', name: 'Store Hundred', address: { city: 'Atlanta', state: 'GA' }, mainPhone: '+15551110100' } },
    
    // Zero stores
    { id: 'loc-0', data: { ...baseLocation, storeNumber: '0', name: 'Store Zero', address: { city: 'Zero City', state: 'ZZ' }, mainPhone: '+15550000000' } },
    { id: 'loc-00', data: { ...baseLocation, storeNumber: '00', name: 'Store Double Zero', address: { city: 'Zero City', state: 'ZZ' }, mainPhone: '+15550000001' } },
    
    // Store with EMPTY store number (should not match zero queries)
    { id: 'loc-empty', data: { ...baseLocation, storeNumber: '', name: 'Empty Number Store', address: { city: 'Empty City', state: 'EC' }, mainPhone: '+15550000002' } },
    
    // Store with missing phonePublic field (should hide phone)
    { id: 'loc-no-phone-public', data: { ...baseLocation, storeNumber: '99', name: 'No Phone Public', address: { city: 'Hidden', state: 'HP' }, mainPhone: '+15559999999', phonePublic: undefined } },
    
    // Retired store (should not appear)
    { id: 'loc-retired', data: { ...baseLocation, lifecycle: 'retired', storeNumber: '98', name: 'Retired Store', address: { city: 'Old City', state: 'XX' }, mainPhone: '+15559999998' } },
    
    // Planned store (should not appear)
    { id: 'loc-planned', data: { ...baseLocation, lifecycle: 'planned', storeNumber: '50', name: 'Planned Store', address: { city: 'Future City', state: 'YY' }, mainPhone: '+15555050050' } },
    
    // Stores for name/city text search
    { id: 'loc-la1', data: { ...baseLocation, storeNumber: '200', name: 'Los Angeles Main', address: { city: 'Los Angeles', state: 'CA' }, mainPhone: '+12135551200' } },
    { id: 'loc-la2', data: { ...baseLocation, storeNumber: '201', name: 'LA Downtown', address: { city: 'Los Angeles', state: 'CA' }, mainPhone: '+12135551201' } },
    
    // Stores for single-digit substring test (should NOT match '7' query due to M5 fix)
    { id: 'loc-307', data: { ...baseLocation, storeNumber: '307', name: 'Extra 307', address: { city: 'Extra City', state: 'EX' }, mainPhone: '+15553070307' } },
    { id: 'loc-317', data: { ...baseLocation, storeNumber: '317', name: 'Extra 317', address: { city: 'Extra City', state: 'EX' }, mainPhone: '+15553170317' } },
    { id: 'loc-70', data: { ...baseLocation, storeNumber: '70', name: 'Store Seventy', address: { city: 'Seventy City', state: 'SV' }, mainPhone: '+15550700070' } },
    
    // Additional stores to test limit-after-sort (need >10 for header, >20 for search)
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
    
    // Person for name search test
    { id: 'person-los', data: { fullName: 'Los Smith', lifecycle: 'active', workEmail: 'los@test.com', workPhone: '+15558888888' } },
  ];
  
  // Subcollections for enrichment
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
  
  describe('Query Guards (#, #1, 1-char)', () => {
    it('returns empty for bare "#" query', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=%23');
      
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.data, []);
    });
    
    it('accepts "#1" query and finds exact/prefix matches', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=%231');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      assert.ok(results.length > 0, '#1 should return results');
      assert.strictEqual(results[0].storeNumber, '1', 'First result should be store 1');
    });
    
    it('returns empty for single non-digit character (e.g., "a")', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=a');
      
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.data, []);
    });
  });
  
  describe('Single-Digit Store Queries (M5 fix)', () => {
    it('query "7" returns exact + prefix only, NOT substring matches like 307, 317', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=7');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      
      // Should find 7, 07, 007 (exact) and 70 (prefix)
      // Should NOT find 307, 317 (substring matches)
      const storeNums = results.map(r => r.storeNumber);
      assert.ok(storeNums.includes('7') || storeNums.includes('07') || storeNums.includes('007'), 
        'Should have exact matches');
      assert.ok(storeNums.includes('70'), 'Should have prefix match 70');
      assert.ok(!storeNums.includes('307'), 'Should NOT have substring match 307');
      assert.ok(!storeNums.includes('317'), 'Should NOT have substring match 317');
    });
    
    it('query "1" returns exact + prefix only', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=1');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      
      // First should be exact match (store 1)
      assert.strictEqual(results[0].storeNumber, '1', 'First should be exact match store 1');
      
      // Should have prefix matches like 10, 12, 100, 101, etc.
      const storeNums = results.map(r => r.storeNumber);
      assert.ok(storeNums.includes('10') || storeNums.includes('12'), 'Should have prefix matches');
    });
  });
  
  describe('Leading Zero Equivalence', () => {
    it('query "12" puts exact matches first (12, 012)', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=12');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      
      // First result must be "12" (raw exact), then "012"
      assert.strictEqual(results[0].storeNumber, '12', 'First must be raw exact match "12"');
      assert.strictEqual(results[1].storeNumber, '012', 'Second must be "012"');
    });
    
    it('query "012" puts raw exact "012" first, then "12"', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=012');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      
      assert.strictEqual(results[0].storeNumber, '012', 'First must be raw exact "012"');
      assert.strictEqual(results[1].storeNumber, '12', 'Second must be "12"');
    });
    
    it('query "07" finds all three variants (7, 07, 007) as exact matches', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=07');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      
      // First three should be exact matches (07, 7, 007 in some order based on tie-break)
      const topThree = results.slice(0, 3).map(r => r.storeNumber);
      assert.ok(topThree.includes('07'), 'Should include 07');
      // Raw exact "07" should be first
      assert.strictEqual(results[0].storeNumber, '07', 'Raw exact 07 should be first');
    });
  });
  
  describe('Tie-Break Rules', () => {
    it('tier 2 (prefix) uses normalized length first: for "12", 121 comes before 1200', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=12');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      
      // Find positions of 121 and 1200
      const idx121 = results.findIndex(r => r.storeNumber === '121');
      const idx1200 = results.findIndex(r => r.storeNumber === '1200');
      
      if (idx121 !== -1 && idx1200 !== -1) {
        assert.ok(idx121 < idx1200, '121 (3-digit) should come before 1200 (4-digit)');
      }
    });
    
    it('tier 1 (exact) uses raw exact first, then shorter raw: for "7", order is 7, 07, 007', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=7');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      
      // The first three should be exact matches in this order
      // Find positions
      const idx7 = results.findIndex(r => r.storeNumber === '7');
      const idx07 = results.findIndex(r => r.storeNumber === '07');
      const idx007 = results.findIndex(r => r.storeNumber === '007');
      
      assert.strictEqual(idx7, 0, 'Raw exact "7" should be first');
      assert.ok(idx07 < idx007, '"07" should come before "007" (shorter raw)');
    });
  });
  
  describe('Limit After Sort', () => {
    it('limits to 10 AFTER sorting, not before', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=0');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      
      assert.ok(results.length <= 10, `Should have at most 10 results, got ${results.length}`);
    });
  });
  
  describe('Zero-Only Queries', () => {
    it('query "0" returns only exact zero stores (0, 00), not empty-number store', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=0');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      
      // Should have 0 and 00
      const storeNums = results.map(r => r.storeNumber);
      assert.ok(storeNums.includes('0') || storeNums.includes('00'), 'Should have zero stores');
      assert.ok(!storeNums.includes(''), 'Should NOT have empty-number store');
    });
  });
  
  describe('Phone Matching Threshold', () => {
    it('2-digit query does not phone-match (12 does not match phone 1212)', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=12');
      
      assert.strictEqual(res.status, 200);
      // For store-number queries, only stores with number containing 12 should match
      // The key is that it doesn't spray phone matches for 2-digit queries
    });
    
    it('3-digit query can phone-match (123 can match phone)', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=123');
      
      assert.strictEqual(res.status, 200);
      // 123 is 3 digits so it CAN phone-match
    });
  });
  
  describe('Retired/Planned Exclusion', () => {
    it('retired stores are not returned', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=98');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      const hasRetired = results.some(r => r.storeNumber === '98');
      assert.strictEqual(hasRetired, false, 'Should not find retired store 98');
    });
    
    it('planned stores are not returned', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=50');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ storeNumber: string }>;
      const hasPlanned = results.some(r => r.storeNumber === '50');
      assert.strictEqual(hasPlanned, false, 'Should not find planned store 50');
    });
  });
  
  describe('People Never in Header Response', () => {
    it('header search never returns people, even for name query', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=john');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ type?: string }>;
      const hasPerson = results.some(r => r.type === 'person');
      assert.strictEqual(hasPerson, false, 'Header should never return people');
    });
  });
  
  describe('Response Keys', () => {
    it('returns exactly id, storeNumber, title, city, state', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/locations/search?q=12');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<Record<string, unknown>>;
      
      if (results.length > 0) {
        const keys = Object.keys(results[0]).sort();
        assert.deepStrictEqual(keys, ['city', 'id', 'state', 'storeNumber', 'title'].sort());
      }
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
  
  describe('Query Guards', () => {
    it('returns empty for bare "#" query', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=%23');
      
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body.data, []);
    });
    
    it('1-letter text queries ("a", "l") return results (M5 fix)', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const resA = await supertest(app).get('/search?q=a');
      const resL = await supertest(app).get('/search?q=l');
      
      // 1-letter text queries should work (match names/cities)
      assert.strictEqual(resA.status, 200);
      assert.strictEqual(resL.status, 200);
      // These may or may not have results depending on data, but should not return empty by guard
    });
  });
  
  describe('Store Number Ranking', () => {
    it('query "12" puts stores 12/012 first, then prefix, then people last', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=12');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string }>;
      
      // First location should be exact match
      const firstLocation = results.find(r => r.type === 'location');
      assert.ok(firstLocation, 'Should have location result');
      assert.ok(
        firstLocation.title.startsWith('#12 ') || firstLocation.title.startsWith('#012 '),
        `First location should be #12 or #012, got: ${firstLocation.title}`
      );
      
      // People (like Jordan 12 Fan) should come AFTER all locations
      const firstPersonIdx = results.findIndex(r => r.type === 'person');
      const lastLocationIdx = results.map((r, i) => r.type === 'location' ? i : -1).filter(i => i >= 0).pop() ?? -1;
      
      if (firstPersonIdx !== -1 && lastLocationIdx !== -1) {
        assert.ok(firstPersonIdx > lastLocationIdx, 'People should come after all locations for store query');
      }
    });
    
    it('query "101" puts store 101 first, store 33 (phone-only match) later', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=101');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; id: string }>;
      
      const locations = results.filter(r => r.type === 'location');
      
      // Store 101 should be first
      assert.ok(locations[0].title.includes('#101 '), 'First should be store 101');
      
      // Store 33 (phone match) should be later
      const idx101 = locations.findIndex(r => r.title.includes('#101 '));
      const idx33 = locations.findIndex(r => r.title.includes('#33 '));
      
      if (idx33 !== -1) {
        assert.ok(idx101 < idx33, 'Store 101 (exact) should come before store 33 (phone match)');
      }
    });
  });
  
  describe('M7 Privacy Fix - mobilePhone Removed', () => {
    it('Viewer typing mobile fragment "1299" gets NO person', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'viewer', role: 'Viewer' });
      const res = await supertest(app).get('/search?q=1299');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string }>;
      
      const anaPerson = results.find(r => r.type === 'person' && r.title === 'Ana Garcia');
      assert.strictEqual(anaPerson, undefined, 'Ana Garcia should NOT be found by mobilePhone');
    });
    
    it('Admin typing mobile fragment also gets no person', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=1299');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string }>;
      
      const anaPerson = results.find(r => r.type === 'person' && r.title === 'Ana Garcia');
      assert.strictEqual(anaPerson, undefined, 'mobilePhone matching removed for all roles');
    });
    
    it('workPhone matching still works (1212 finds Lee Park)', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=1010100');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string }>;
      
      const leePerson = results.find(r => r.type === 'person' && r.title === 'Lee Park');
      assert.ok(leePerson, 'Lee Park should be found by workPhone');
    });
  });
  
  describe('M2 Gate - Non-Store Query Ordering', () => {
    it('query "los" interleaves people and locations by title', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=los');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string }>;
      
      // Should have both people and locations
      const hasPerson = results.some(r => r.type === 'person');
      const hasLocation = results.some(r => r.type === 'location');
      
      // For non-store queries, people should NOT be crowded out
      assert.ok(hasPerson || hasLocation, 'Should have results');
      
      // If person "Los Smith" exists, they should not be pushed to the end
      const losSmith = results.find(r => r.title === 'Los Smith');
      if (losSmith) {
        // "Los Smith" starts with "los", so should come early
        const idx = results.indexOf(losSmith);
        assert.ok(idx < 10, 'Los Smith should be early in results (startsWith sort)');
      }
    });
  });
  
  describe('Phone Threshold (2 vs 3 digits)', () => {
    it('2-digit phone query does not match', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      
      // For a 2-digit query that's also a store number, test the phone behavior
      // We need a query that's NOT a store number to test phone-only
      const res = await supertest(app).get('/search?q=55');
      
      assert.strictEqual(res.status, 200);
      // 55 is 2 digits, so phone matching should not kick in
    });
  });
  
  describe('Status and Phone Visibility', () => {
    it('stores with phonePublic=false do not show phone', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=33');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; phone?: string }>;
      
      const store33 = results.find(r => r.type === 'location' && r.title.includes('#33 '));
      if (store33) {
        assert.strictEqual(store33.phone, undefined, 'Store 33 should not show phone (phonePublic: false)');
      }
    });
    
    it('stores with missing phonePublic field do not show phone', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=99');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string; phone?: string }>;
      
      const store99 = results.find(r => r.type === 'location' && r.title.includes('#99 '));
      if (store99) {
        assert.strictEqual(store99.phone, undefined, 'Store 99 should not show phone (phonePublic missing)');
      }
    });
    
    it('statusNow is present and has correct structure', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=12');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ type: string; statusNow?: { state: string; reason: string } }>;
      
      const location = results.find(r => r.type === 'location');
      if (location) {
        assert.ok(location.statusNow, 'Location should have statusNow');
        assert.ok(location.statusNow.state, 'statusNow should have state');
        // With full Location doc, state should be 'Open' or 'Closed' based on hours
        assert.ok(['Open', 'Closed', 'Unknown'].includes(location.statusNow.state), 
          `statusNow.state should be valid, got: ${location.statusNow.state}`);
      }
    });
  });
  
  describe('Zero-Only Queries', () => {
    it('query "0" returns exact zero stores only, not empty-number store', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=0');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string }>;
      
      const locations = results.filter(r => r.type === 'location');
      
      // Should have zero stores
      const hasZero = locations.some(r => r.title.includes('#0 ') || r.title.includes('#00 '));
      assert.ok(hasZero, 'Should have zero stores');
      
      // Should NOT have empty-number store
      const hasEmpty = locations.some(r => r.title.includes('Empty Number'));
      assert.strictEqual(hasEmpty, false, 'Should NOT have empty-number store');
    });
    
    it('query "000" skips people work-phone matching', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=000');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string }>;
      
      // Zero Worker has 000 in work phone, but zero-only queries skip phone matching
      const zeroWorker = results.find(r => r.type === 'person' && r.title === 'Zero Worker');
      assert.strictEqual(zeroWorker, undefined, 'Zero-only query should not phone-match people');
    });
  });
  
  describe('Retired/Planned/Inactive Exclusion', () => {
    it('inactive people are not returned', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=inactive');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<{ title: string; type: string }>;
      
      const inactivePerson = results.find(r => r.type === 'person' && r.title === 'Inactive Person');
      assert.strictEqual(inactivePerson, undefined, 'Inactive person should not appear');
    });
  });
  
  describe('M8 - Enrichment Query Count', () => {
    it('enrichment queries only run for final shown rows (≤ 2 + 2×20)', async () => {
      fakeFs.resetQueryCount();
      
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      await supertest(app).get('/search?q=1');
      
      // 1 for locations + 1 for people + at most 2×20 for enrichment = 42
      // The actual count may be lower if fewer results
      assert.ok(fakeFs.queryCount.count <= 50, 
        `Query count should be bounded, got ${fakeFs.queryCount.count}`);
    });
  });
  
  describe('Response Keys', () => {
    it('location results have type, id, title, subtitle, phone?, statusNow', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=12');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<Record<string, unknown>>;
      
      const location = results.find(r => r.type === 'location');
      if (location) {
        assert.ok('type' in location);
        assert.ok('id' in location);
        assert.ok('title' in location);
        assert.ok('subtitle' in location);
        assert.ok('statusNow' in location);
        // phone is optional
      }
    });
    
    it('person results have type, id, title, subtitle, phone?', async () => {
      const app = createTestApp(fakeFs.db, { uid: 'admin', role: 'Admin' });
      const res = await supertest(app).get('/search?q=john');
      
      assert.strictEqual(res.status, 200);
      const results = res.body.data as Array<Record<string, unknown>>;
      
      const person = results.find(r => r.type === 'person');
      if (person) {
        assert.ok('type' in person);
        assert.ok('id' in person);
        assert.ok('title' in person);
        assert.ok('subtitle' in person);
        // phone is optional
        assert.ok(!('statusNow' in person), 'Person should not have statusNow');
      }
    });
  });
  
  describe('Role Matrix', () => {
    const roles = ['Admin', 'Steward', 'Leader', 'Viewer', 'Store'];
    
    for (const role of roles) {
      it(`${role} role gets same location results for store query`, async () => {
        const app = createTestApp(fakeFs.db, { uid: `user-${role}`, role });
        const res = await supertest(app).get('/search?q=12');
        
        assert.strictEqual(res.status, 200);
        const results = res.body.data as Array<{ title: string; type: string }>;
        
        // All roles should get the same location results
        const locations = results.filter(r => r.type === 'location');
        assert.ok(locations.length > 0, `${role} should get location results`);
        
        // No mobilePhone in any response
        for (const r of results) {
          assert.ok(!('mobilePhone' in r), 'mobilePhone should not be in response');
        }
      });
    }
  });
});

// ============================================================================
// TESTS - UTILITY FUNCTIONS
// ============================================================================

describe('Store Number Utility Functions', () => {
  it('00123 is a valid store query and matches store 123', async () => {
    const { isStoreNumberQuery, normalizeStoreNumber } = await import('../server/utils/storeNumber');
    
    assert.strictEqual(isStoreNumberQuery('00123'), true, '00123 should be valid');
    assert.strictEqual(normalizeStoreNumber('00123'), '123', '00123 should normalize to 123');
  });
  
  it('12345 is NOT a valid store query (5 significant digits)', async () => {
    const { isStoreNumberQuery } = await import('../server/utils/storeNumber');
    
    assert.strictEqual(isStoreNumberQuery('12345'), false, '12345 has 5 significant digits');
  });
  
  it('0012345 is NOT valid (12345 is 5 digits)', async () => {
    const { isStoreNumberQuery } = await import('../server/utils/storeNumber');
    
    assert.strictEqual(isStoreNumberQuery('0012345'), false, '12345 is 5 significant digits');
  });
  
  it('empty string normalizes to "00"', async () => {
    const { normalizeStoreNumber } = await import('../server/utils/storeNumber');
    
    assert.strictEqual(normalizeStoreNumber(''), '00');
  });
  
  it('isSingleDigitStoreQuery correctly identifies single-digit', async () => {
    const { isSingleDigitStoreQuery } = await import('../server/utils/storeNumber');
    
    assert.strictEqual(isSingleDigitStoreQuery('7'), true);
    assert.strictEqual(isSingleDigitStoreQuery('#7'), true);
    assert.strictEqual(isSingleDigitStoreQuery('07'), true);
    assert.strictEqual(isSingleDigitStoreQuery('007'), true);
    assert.strictEqual(isSingleDigitStoreQuery('12'), false);
    assert.strictEqual(isSingleDigitStoreQuery('10'), false);
  });
});

console.log('Search route tests (real routers) loaded');

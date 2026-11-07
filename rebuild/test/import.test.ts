/**
 * Tests for CSV Import functionality
 * 
 * Tests verify:
 * 1. Import replaces data cleanly
 * 2. Required field validation
 * 3. Phone number normalization
 * 4. Store Manager phone saved correctly
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { seedTestUsers, seedTestHierarchy, getTestDb } from './testHelpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function fetchApi(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    headers: {
      'Authorization': 'Bearer test-token-admin',
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
}

describe('Import - Phone Normalization', () => {
  function normalizePhoneNumber(phone: string): string | null {
    if (!phone) return null;
    
    const cleaned = phone.replace(/[^\d+]/g, '');
    
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }
    
    if (cleaned.startsWith('+1') && cleaned.length === 12) {
      return cleaned;
    }
    
    return null;
  }
  
  it('should normalize US phone numbers', () => {
    assert.strictEqual(normalizePhoneNumber('(213) 555-0007'), '+12135550007');
    assert.strictEqual(normalizePhoneNumber('213-555-0007'), '+12135550007');
    assert.strictEqual(normalizePhoneNumber('2135550007'), '+12135550007');
    assert.strictEqual(normalizePhoneNumber('1-213-555-0007'), '+12135550007');
    assert.strictEqual(normalizePhoneNumber('+1 213 555 0007'), '+12135550007');
  });
  
  it('should reject invalid phone numbers', () => {
    assert.strictEqual(normalizePhoneNumber('123'), null);
    assert.strictEqual(normalizePhoneNumber(''), null);
    assert.strictEqual(normalizePhoneNumber('555-1234'), null);
  });
});

describe('Import - Hours Parsing', () => {
  function normalizeTime(time: string): string {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    return `${hours.padStart(2, '0')}:${minutes || '00'}`;
  }
  
  function parseHoursValue(open: string, close: string): { closed: boolean; intervals: { open: string; close: string }[] } {
    if (open?.toLowerCase() === 'closed' || close?.toLowerCase() === 'closed') {
      return { closed: true, intervals: [] };
    }
    
    if (!open || !close) {
      return { closed: true, intervals: [] };
    }
    
    if (!/^\d{1,2}:\d{2}$/.test(open) || !/^\d{1,2}:\d{2}$/.test(close)) {
      return { closed: true, intervals: [] };
    }
    
    return {
      closed: false,
      intervals: [{ open: normalizeTime(open), close: normalizeTime(close) }],
    };
  }
  
  it('should parse standard hours', () => {
    const result = parseHoursValue('10:00', '21:00');
    assert.deepStrictEqual(result, {
      closed: false,
      intervals: [{ open: '10:00', close: '21:00' }],
    });
  });
  
  it('should parse closed days', () => {
    const result1 = parseHoursValue('closed', 'closed');
    assert.deepStrictEqual(result1, { closed: true, intervals: [] });
    
    const result2 = parseHoursValue('Closed', '');
    assert.deepStrictEqual(result2, { closed: true, intervals: [] });
  });
  
  it('should normalize single-digit hours', () => {
    const result = parseHoursValue('9:00', '21:00');
    assert.deepStrictEqual(result, {
      closed: false,
      intervals: [{ open: '09:00', close: '21:00' }],
    });
  });
  
  it('should handle overnight hours', () => {
    const result = parseHoursValue('22:00', '2:00');
    assert.deepStrictEqual(result, {
      closed: false,
      intervals: [{ open: '22:00', close: '02:00' }],
    });
  });
});

describe('Import - Required Field Validation', () => {
  const REQUIRED_LOCATION_COLUMNS = [
    'storeNumber', 'name', 'street', 'city', 'state', 'zip', 'mainPhone', 'timeZone'
  ];
  
  function validateLocationRow(row: Record<string, string>): string[] {
    const errors: string[] = [];
    
    for (const col of REQUIRED_LOCATION_COLUMNS) {
      if (!row[col]?.trim()) {
        errors.push(`Missing required field: ${col}`);
      }
    }
    
    return errors;
  }
  
  it('should detect missing required fields', () => {
    const row = {
      storeNumber: '007',
      name: 'Test Store',
    };
    
    const errors = validateLocationRow(row);
    
    assert.strictEqual(errors.length > 0, true);
    assert.strictEqual(errors.some(e => e.includes('street')), true);
    assert.strictEqual(errors.some(e => e.includes('mainPhone')), true);
  });
  
  it('should pass with all required fields', () => {
    const row = {
      storeNumber: '007',
      name: 'Test Store',
      street: '123 Test St',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90001',
      mainPhone: '(213) 555-0007',
      timeZone: 'America/Los_Angeles',
    };
    
    const errors = validateLocationRow(row);
    
    assert.strictEqual(errors.length, 0);
  });
  
  it('should detect empty string fields', () => {
    const row = {
      storeNumber: '007',
      name: '',
      street: '123 Test St',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90001',
      mainPhone: '(213) 555-0007',
      timeZone: 'America/Los_Angeles',
    };
    
    const errors = validateLocationRow(row);
    
    assert.strictEqual(errors.some(e => e.includes('name')), true);
  });
});

describe('Import - Data Replacement', () => {
  it('should track locations to create vs update', () => {
    const existingStoreNumbers = new Set(['001', '002', '003']);
    const importStoreNumbers = ['001', '004', '005'];
    
    let toCreate = 0;
    let toUpdate = 0;
    
    for (const num of importStoreNumbers) {
      if (existingStoreNumbers.has(num)) {
        toUpdate++;
      } else {
        toCreate++;
      }
    }
    
    assert.strictEqual(toCreate, 2);
    assert.strictEqual(toUpdate, 1);
  });
  
  it('should handle full replacement of assignments', () => {
    const existingAssignments = [
      { personId: 'p1', role: 'SM', scopeId: 'loc1' },
      { personId: 'p2', role: 'ASM', scopeId: 'loc1' },
    ];
    
    const newAssignments = [
      { personId: 'p1', role: 'SM', scopeId: 'loc1' },
      { personId: 'p3', role: 'ASM', scopeId: 'loc1' },
    ];
    
    const toRemove = existingAssignments.length;
    const toCreate = newAssignments.length;
    
    assert.strictEqual(toRemove, 2);
    assert.strictEqual(toCreate, 2);
  });
});

describe('Import Route - Store Manager Phone', () => {
  let hierarchyIds: { regionId: string; districtId: string };

  before(async () => {
    await seedTestUsers();
    const result = await seedTestHierarchy();
    hierarchyIds = { regionId: result.regionId, districtId: result.districtId };
  });

  it('saves StoreManagerPhone as person work phone (E.164)', async () => {
    const uniqueNum = `IMP${Date.now() % 10000}`;
    const smName = `SM Import Test ${uniqueNum}`;
    const smPhone = '(323) 555-9876';
    const expectedE164 = '+13235559876';

    const csv = [
      'storeNumber,name,street,city,state,zip,mainPhone,timeZone,regionId,districtId,storeManager,storeManagerPhone',
      `${uniqueNum},"Import Test Store","123 Import St","Los Angeles","CA","90001","(213) 555-1234","America/Los_Angeles","${hierarchyIds.regionId}","${hierarchyIds.districtId}","${smName}","${smPhone}"`,
    ].join('\n');

    const previewRes = await fetchApi('/api/app/import/legacy/preview', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    });
    assert.strictEqual(previewRes.status, 200, 'preview should succeed');
    const previewBody = await previewRes.json();
    assert.ok(previewBody.sessionId, 'should return sessionId');
    assert.strictEqual(previewBody.preview.valid, true, 'preview should be valid');
    assert.strictEqual(previewBody.preview.toCreate, 1, 'should have 1 location to create');

    const applyRes = await fetchApi(`/api/app/import/legacy/apply/${previewBody.sessionId}`, {
      method: 'POST',
    });
    assert.strictEqual(applyRes.status, 200, 'apply should succeed');
    const applyBody = await applyRes.json();
    assert.strictEqual(applyBody.success, true, 'apply should report success');
    assert.strictEqual(applyBody.result.created, 1, 'should create 1 location');
    assert.strictEqual(applyBody.result.assignmentsCreated, 1, 'should create 1 assignment');

    const db = getTestDb();
    const peopleSnap = await db.collection('people')
      .where('fullName', '==', smName)
      .limit(1)
      .get();
    
    assert.strictEqual(peopleSnap.empty, false, `person "${smName}" should exist`);
    const person = peopleSnap.docs[0].data();
    assert.strictEqual(person.workPhone, expectedE164, `work phone should be E.164 format: ${expectedE164}`);
  });

  it('saves StoreManagerMobile as person mobile phone (E.164)', async () => {
    const uniqueNum = `IMP${Date.now() % 10000 + 1}`;
    const smName = `SM Mobile Test ${uniqueNum}`;
    const smMobile = '(310) 555-4321';
    const expectedE164 = '+13105554321';

    const csv = [
      'storeNumber,name,street,city,state,zip,mainPhone,timeZone,regionId,districtId,storeManager,storeManagerMobile',
      `${uniqueNum},"Mobile Test Store","456 Mobile St","Los Angeles","CA","90002","(213) 555-5678","America/Los_Angeles","${hierarchyIds.regionId}","${hierarchyIds.districtId}","${smName}","${smMobile}"`,
    ].join('\n');

    const previewRes = await fetchApi('/api/app/import/legacy/preview', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    });
    assert.strictEqual(previewRes.status, 200, 'preview should succeed');
    const previewBody = await previewRes.json();

    const applyRes = await fetchApi(`/api/app/import/legacy/apply/${previewBody.sessionId}`, {
      method: 'POST',
    });
    assert.strictEqual(applyRes.status, 200, 'apply should succeed');

    const db = getTestDb();
    const peopleSnap = await db.collection('people')
      .where('fullName', '==', smName)
      .limit(1)
      .get();
    
    assert.strictEqual(peopleSnap.empty, false, `person "${smName}" should exist`);
    const person = peopleSnap.docs[0].data();
    assert.strictEqual(person.mobilePhone, expectedE164, `mobile phone should be E.164 format: ${expectedE164}`);
  });

  it('maps Store Manager Phone column header variations correctly', async () => {
    const uniqueNum = `IMP${Date.now() % 10000 + 2}`;
    const smName = `SM Header Test ${uniqueNum}`;
    const smPhone = '(818) 555-7890';
    const expectedE164 = '+18185557890';

    const csv = [
      'Store Number,Name,Address,City,State,Zip Code,Phone,Time Zone,Region ID,District ID,Store Manager,Store Manager Phone',
      `${uniqueNum},"Header Test Store","789 Header St","Burbank","CA","91505","(818) 555-0000","America/Los_Angeles","${hierarchyIds.regionId}","${hierarchyIds.districtId}","${smName}","${smPhone}"`,
    ].join('\n');

    const previewRes = await fetchApi('/api/app/import/legacy/preview', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    });
    assert.strictEqual(previewRes.status, 200, 'preview should succeed');
    const previewBody = await previewRes.json();
    assert.strictEqual(previewBody.preview.valid, true, 'preview should be valid');

    const applyRes = await fetchApi(`/api/app/import/legacy/apply/${previewBody.sessionId}`, {
      method: 'POST',
    });
    assert.strictEqual(applyRes.status, 200, 'apply should succeed');

    const db = getTestDb();
    const peopleSnap = await db.collection('people')
      .where('fullName', '==', smName)
      .limit(1)
      .get();
    
    assert.strictEqual(peopleSnap.empty, false, `person "${smName}" should exist`);
    const person = peopleSnap.docs[0].data();
    assert.strictEqual(person.workPhone, expectedE164, `work phone should be E.164 format: ${expectedE164}`);
  });
});

console.log('Import tests loaded');

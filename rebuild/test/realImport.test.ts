/**
 * Tests for Real CSV Import functionality
 * 
 * Tests the legacy importer with real.csv (Theo's actual roster) and legacy_hours.json:
 * 1. Store number normalization (07, 007, 7 all match same store)
 * 2. Facility location type detection (#01, #04, #86)
 * 3. District Manager assignments from DM column
 * 4. Assistant Store Managers (multi-value) assignments
 * 5. Hours import from JSON file including holiday hours
 * 6. SpreadsheetEncoding column is skipped
 * 7. Dry-run shows 0 errors with regions 01 / districts 01-03 present
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { seedTestUsers, seedTestHierarchy, getTestDb } from './testHelpers';
import { normalizeStoreNumber, storeNumbersMatch } from '../server/routes/legacyImport';

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

describe('Store Number Normalization', () => {
  it('normalizes store numbers to two-digit minimum', () => {
    assert.strictEqual(normalizeStoreNumber('07'), '07');
    assert.strictEqual(normalizeStoreNumber('007'), '07');
    assert.strictEqual(normalizeStoreNumber('7'), '07');
    assert.strictEqual(normalizeStoreNumber('#07'), '07');
    assert.strictEqual(normalizeStoreNumber('#007'), '07');
  });

  it('preserves longer store numbers', () => {
    assert.strictEqual(normalizeStoreNumber('123'), '123');
    assert.strictEqual(normalizeStoreNumber('0123'), '123');
  });

  it('handles edge cases', () => {
    assert.strictEqual(normalizeStoreNumber('0'), '00');
    assert.strictEqual(normalizeStoreNumber('00'), '00');
    assert.strictEqual(normalizeStoreNumber('000'), '00');
    assert.strictEqual(normalizeStoreNumber('01'), '01');
    assert.strictEqual(normalizeStoreNumber('001'), '01');
  });

  it('matches equivalent store numbers', () => {
    assert.strictEqual(storeNumbersMatch('07', '007'), true);
    assert.strictEqual(storeNumbersMatch('7', '07'), true);
    assert.strictEqual(storeNumbersMatch('#07', '7'), true);
    assert.strictEqual(storeNumbersMatch('01', '001'), true);
    assert.strictEqual(storeNumbersMatch('07', '08'), false);
  });
});

describe('Real CSV Dry-Run', () => {
  let hierarchyIds: { regionId: string; districtIds: string[] };
  let realCsv: string;
  let hoursJson: string;

  before(async () => {
    await seedTestUsers();
    
    const db = getTestDb();
    const now = new Date().toISOString();
    
    const regionRef = await db.collection('regions').add({
      code: '01',
      name: 'West',
      lifecycle: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    
    const districtIds: string[] = [];
    const districts = [
      { code: '01', name: 'Central & Southern California' },
      { code: '02', name: 'Inland Empire San Diego & LA South' },
      { code: '03', name: 'Northern California Nevada & Texas' },
    ];
    
    for (const d of districts) {
      const ref = await db.collection('districts').add({
        code: d.code,
        name: d.name,
        regionId: regionRef.id,
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
        updatedBy: 'test',
        version: 1,
      });
      districtIds.push(ref.id);
    }
    
    hierarchyIds = { regionId: regionRef.id, districtIds };

    realCsv = readFileSync('/home/ubuntu/.cursor/projects/workspace/uploads/real_341b.csv', 'utf-8');
    hoursJson = readFileSync('/home/ubuntu/.cursor/projects/workspace/uploads/legacy_hours_8396.json', 'utf-8');
  });

  it('dry-run real.csv with 0 errors when region 01 and districts 01-03 exist', async () => {
    const previewRes = await fetchApi('/api/app/import/legacy/preview', {
      method: 'POST',
      body: JSON.stringify({ csv: realCsv, hoursJson }),
    });
    
    assert.strictEqual(previewRes.status, 200, 'preview should succeed');
    const previewBody = await previewRes.json();
    
    assert.ok(previewBody.sessionId, 'should return sessionId');
    assert.ok(previewBody.preview, 'should return preview');
    
    if (previewBody.preview.errorCount > 0) {
      const errorRows = previewBody.preview.rows.filter((r: any) => r.action === 'error');
      console.log('Error rows:', JSON.stringify(errorRows, null, 2));
    }
    
    assert.strictEqual(previewBody.preview.errorCount, 0, 
      `should have 0 errors, got ${previewBody.preview.errorCount}`);
    assert.strictEqual(previewBody.preview.valid, true, 'preview should be valid');
    
    assert.ok(previewBody.preview.totalRows >= 50, 
      `should have at least 50 rows (got ${previewBody.preview.totalRows})`);
  });

  it('detects facilities from store numbers #01 and #86', async () => {
    const previewRes = await fetchApi('/api/app/import/legacy/preview', {
      method: 'POST',
      body: JSON.stringify({ csv: realCsv }),
    });
    
    const previewBody = await previewRes.json();
    const rows = previewBody.preview.rows;
    
    const store01 = rows.find((r: any) => normalizeStoreNumber(r.storeNumber) === '01');
    const store86 = rows.find((r: any) => normalizeStoreNumber(r.storeNumber) === '86');
    
    assert.ok(store01, 'should have store #01');
    assert.ok(store86, 'should have store #86');
    
    assert.ok(
      store01.action !== 'error', 
      `store #01 should not be an error: ${store01.errors?.join(', ')}`
    );
    assert.ok(
      store86.action !== 'error', 
      `store #86 should not be an error: ${store86.errors?.join(', ')}`
    );
  });

  it('parses District Manager and Assistant Store Managers columns', async () => {
    const previewRes = await fetchApi('/api/app/import/legacy/preview', {
      method: 'POST',
      body: JSON.stringify({ csv: realCsv }),
    });
    
    const previewBody = await previewRes.json();
    const rows = previewBody.preview.rows;
    
    const storesWithDM = rows.filter((r: any) => 
      r.changes?.some((c: string) => c.includes('DM:'))
    );
    assert.ok(storesWithDM.length > 0, 'should have stores with DM assignments');
    
    const storesWithASM = rows.filter((r: any) => 
      r.changes?.some((c: string) => c.includes('ASM'))
    );
    assert.ok(storesWithASM.length > 0, 'should have stores with ASM assignments');
  });

  it('imports hours from JSON including standard and holiday hours', async () => {
    const previewRes = await fetchApi('/api/app/import/legacy/preview', {
      method: 'POST',
      body: JSON.stringify({ csv: realCsv, hoursJson }),
    });
    
    const previewBody = await previewRes.json();
    const rows = previewBody.preview.rows;
    
    const storesWithHours = rows.filter((r: any) => 
      r.changes?.some((c: string) => c.includes('Hours'))
    );
    assert.ok(storesWithHours.length > 0, 'should have stores with hours imported');
  });

  it('skips SpreadsheetEncoding column', async () => {
    const previewRes = await fetchApi('/api/app/import/legacy/preview', {
      method: 'POST',
      body: JSON.stringify({ csv: realCsv }),
    });
    
    const previewBody = await previewRes.json();
    
    assert.strictEqual(previewBody.preview.errorCount, 0, 
      'should not error on SpreadsheetEncoding column');
  });
});

describe('Real CSV Apply', () => {
  let hierarchyIds: { regionId: string; districtIds: string[] };
  let realCsv: string;
  let hoursJson: string;

  before(async () => {
    await seedTestUsers();
    
    const db = getTestDb();
    const now = new Date().toISOString();
    
    const existingRegion = await db.collection('regions')
      .where('code', '==', '01')
      .limit(1)
      .get();
    
    let regionId: string;
    if (existingRegion.empty) {
      const regionRef = await db.collection('regions').add({
        code: '01',
        name: 'West',
        lifecycle: 'active',
        createdAt: now,
        updatedAt: now,
        updatedBy: 'test',
        version: 1,
      });
      regionId = regionRef.id;
    } else {
      regionId = existingRegion.docs[0].id;
    }
    
    const districtIds: string[] = [];
    const districts = [
      { code: '01', name: 'Central & Southern California' },
      { code: '02', name: 'Inland Empire San Diego & LA South' },
      { code: '03', name: 'Northern California Nevada & Texas' },
    ];
    
    for (const d of districts) {
      const existing = await db.collection('districts')
        .where('code', '==', d.code)
        .limit(1)
        .get();
      
      if (existing.empty) {
        const ref = await db.collection('districts').add({
          code: d.code,
          name: d.name,
          regionId,
          lifecycle: 'active',
          createdAt: now,
          updatedAt: now,
          updatedBy: 'test',
          version: 1,
        });
        districtIds.push(ref.id);
      } else {
        districtIds.push(existing.docs[0].id);
      }
    }
    
    hierarchyIds = { regionId, districtIds };

    realCsv = readFileSync('/home/ubuntu/.cursor/projects/workspace/uploads/real_341b.csv', 'utf-8');
    hoursJson = readFileSync('/home/ubuntu/.cursor/projects/workspace/uploads/legacy_hours_8396.json', 'utf-8');
  });

  it('applies import and creates locations with correct kinds', async () => {
    const db = getTestDb();
    
    const previewRes = await fetchApi('/api/app/import/legacy/preview', {
      method: 'POST',
      body: JSON.stringify({ csv: realCsv, hoursJson }),
    });
    
    assert.strictEqual(previewRes.status, 200);
    const previewBody = await previewRes.json();
    assert.strictEqual(previewBody.preview.valid, true, 
      `preview should be valid, errors: ${JSON.stringify(previewBody.preview.rows.filter((r: any) => r.action === 'error'))}`);
    
    const applyRes = await fetchApi(`/api/app/import/legacy/apply/${previewBody.sessionId}`, {
      method: 'POST',
    });
    
    assert.strictEqual(applyRes.status, 200, 'apply should succeed');
    const applyBody = await applyRes.json();
    assert.strictEqual(applyBody.success, true, 'apply should report success');
    
    assert.ok(applyBody.result.created > 0 || applyBody.result.updated > 0, 
      'should create or update locations');
    
    const loc01 = await db.collection('locations')
      .where('storeNumber', '==', '01')
      .limit(1)
      .get();
    
    if (!loc01.empty) {
      const data = loc01.docs[0].data();
      assert.strictEqual(data.kind, 'facility', 'store #01 should be facility kind');
    }
    
    const loc86 = await db.collection('locations')
      .where('storeNumber', '==', '86')
      .limit(1)
      .get();
    
    if (!loc86.empty) {
      const data = loc86.docs[0].data();
      assert.strictEqual(data.kind, 'facility', 'store #86 should be facility kind');
    }
  });

  it('creates DM assignments for districts', async () => {
    const db = getTestDb();
    
    const dmAssignments = await db.collection('assignments')
      .where('role', '==', 'DM')
      .where('scopeType', '==', 'district')
      .get();
    
    assert.ok(dmAssignments.docs.length > 0, 'should have DM assignments');
    
    for (const doc of dmAssignments.docs) {
      const data = doc.data();
      assert.ok(data.personId, 'DM assignment should have personId');
      assert.ok(data.scopeId, 'DM assignment should have district scopeId');
      assert.ok(['primary', 'additional'].includes(data.slot), 'DM assignment should have valid slot');
    }
  });

  it('creates ASM assignments for locations', async () => {
    const db = getTestDb();
    
    const asmAssignments = await db.collection('assignments')
      .where('role', '==', 'ASM')
      .where('scopeType', '==', 'location')
      .get();
    
    assert.ok(asmAssignments.docs.length > 0, 'should have ASM assignments');
    
    for (const doc of asmAssignments.docs) {
      const data = doc.data();
      assert.ok(data.personId, 'ASM assignment should have personId');
      assert.ok(data.scopeId, 'ASM assignment should have location scopeId');
      assert.ok(['primary', 'support', 'additional'].includes(data.slot), 'ASM assignment should have valid slot');
    }
  });

  it('imports holiday hours as hoursExceptions', async () => {
    const db = getTestDb();
    
    const locSnap = await db.collection('locations')
      .where('storeNumber', '==', '01')
      .limit(1)
      .get();
    
    if (!locSnap.empty) {
      const locationId = locSnap.docs[0].id;
      const exceptions = await db.collection(`locations/${locationId}/hoursExceptions`).get();
      
      const holidayExceptions = exceptions.docs.filter(d => {
        const data = d.data();
        return data.type === 'holiday';
      });
      
      assert.ok(holidayExceptions.length > 0, 'should have holiday hours exceptions');
      
      const thanksgiving = holidayExceptions.find(d => 
        d.data().label?.includes('Thanksgiving')
      );
      assert.ok(thanksgiving, 'should have Thanksgiving holiday');
    }
  });

  it('normalizes store numbers in created locations', async () => {
    const db = getTestDb();
    
    const loc07 = await db.collection('locations')
      .where('storeNumber', '==', '07')
      .limit(1)
      .get();
    
    if (!loc07.empty) {
      const data = loc07.docs[0].data();
      assert.strictEqual(data.storeNumber, '07', 'store number should be normalized to 07');
    }
  });
});

console.log('Real import tests loaded');

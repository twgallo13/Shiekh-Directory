import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { parse } from 'csv-parse/sync';
import type { Account } from '../server/authAuthority';
import { createLocationImportPreviewRouter, type LocationImportPreviewStore } from '../server/locationImportPreview';
import type { DirectorySeed } from '../src/lib/directorySeed';
import { LOCATION_IMPORT_COLUMNS, LOCATION_IMPORT_MAX_BYTES, LOCATION_IMPORT_SPREADSHEET_ENCODING_HEADER } from '../src/lib/locationImportSchema';
import type { LocationRecord } from '../src/types';

const account: Account = { uid: 'admin', email: 'admin@example.test', emailVerified: true, name: 'Admin', role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
const snapshotReadAt = '2026-09-13T12:00:00.000Z';

function location(index: number, overrides: Partial<LocationRecord> = {}): LocationRecord {
  return {
    id: `loc-${String(index).padStart(3, '0')}`,
    version: index,
    storeNumber: String(index).padStart(4, '0'),
    name: `Store ${index}`,
    type: 'Other Company Location',
    address: `${index} Main Street`,
    city: 'Los Angeles',
    state: 'CA',
    zipCode: '90001',
    phone: '+12135550100',
    timeZone: 'America/Los_Angeles',
    hierarchyApplicability: 'Not Applicable',
    operationalStatus: 'Open — Normal Operations',
    recordStatus: 'Active',
    standardHours: {} as LocationRecord['standardHours'],
    ...overrides,
  };
}

function seed(locations: LocationRecord[]): Pick<DirectorySeed, 'locations' | 'people' | 'regions' | 'districts'> {
  return { locations, people: [], regions: [], districts: [] };
}

test('editing export returns every bounded part from one authoritative snapshot without writes', async () => {
  let reads = 0;
  let writes = 0;
  const locations = Array.from({ length: 101 }, (_, index) => location(index + 1, {
    recordStatus: index === 0 ? 'Draft' : index === 1 ? 'Retired' : 'Active',
  }));
  const store = {
    async readLocationImportSnapshot() { reads += 1; return structuredClone(seed(locations)); },
    async commit() { writes += 1; throw new Error('write must not be called'); },
    async migrate() { writes += 1; throw new Error('migration must not be called'); },
  };
  const app = await harness(store);
  try {
    const preparedResponse = await prepare(app.baseUrl);
    assert.equal(preparedResponse.status, 200);
    const prepared = await preparedResponse.json();
    assert.equal(prepared.schemaVersion, 'locations-v1');
    assert.equal(prepared.snapshotReadAt, snapshotReadAt);
    assert.equal(prepared.totalRecords, 101);
    assert.deepEqual(prepared.lifecycleCounts, { Active: 99, Draft: 1, Retired: 1, unrecognized: 0 });
    assert.deepEqual(prepared.parts.map((part: { recordCount: number }) => part.recordCount), [100, 1]);
    assert.ok(prepared.parts.every((part: { byteCount: number; csv?: string }) => part.byteCount <= LOCATION_IMPORT_MAX_BYTES && typeof part.csv === 'string'));
    assert.equal(reads, 1);
    assert.equal(writes, 0);

    const downloadedIds: string[] = [];
    for (const part of prepared.parts) {
      const bytes = new TextEncoder().encode(part.csv);
      assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      const rows = parse(new TextDecoder().decode(bytes), { bom: true, columns: true }) as Array<Record<string, string>>;
      assert.deepEqual(Object.keys(rows[0]), LOCATION_IMPORT_COLUMNS.map(column => column === 'SpreadsheetEncoding' ? LOCATION_IMPORT_SPREADSHEET_ENCODING_HEADER : column));
      downloadedIds.push(...rows.map(row => row.LocationId));
    }
    assert.equal(downloadedIds.length, locations.length);
    assert.deepEqual(new Set(downloadedIds), new Set(locations.map(item => item.id)));
    assert.equal(reads, 1);
    assert.equal(writes, 0);
  } finally { await app.close(); }
});

test('editing export applies every company-wide import role before returning CSV data', async () => {
  for (const role of ['System Administrator', 'Directory Data Steward', 'Editor'] as const) {
    const app = await harness({ async readLocationImportSnapshot() { return seed([location(1)]); } }, { account: { ...account, role } });
    try { assert.equal((await prepare(app.baseUrl)).status, 200); }
    finally { await app.close(); }
  }

  const viewer = await harness({ async readLocationImportSnapshot() { throw new Error('must not read'); } }, { account: { ...account, role: 'Viewer' } });
  try {
    const response = await prepare(viewer.baseUrl);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'preview_not_allowed');
  } finally { await viewer.close(); }

  const scoped = await harness({ async readLocationImportSnapshot() { throw new Error('must not read'); } }, { account: { ...account, role: 'Editor', accessScope: 'Store 0001' } });
  try {
    const response = await prepare(scoped.baseUrl);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'unsupported_preview_scope');
  } finally { await scoped.close(); }

});

test('editing export identifies oversized source records', async () => {
  const oversized = await harness({ async readLocationImportSnapshot() { return seed([location(7, { name: 'é'.repeat(1_000_100) })]); } });
  try {
    const response = await prepare(oversized.baseUrl);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, 'editing_export_record_too_large');
    assert.equal(body.error.locationId, 'loc-007');
    assert.ok(body.error.fields.includes('StoreName'));
  } finally { await oversized.close(); }
});

async function harness(
  store: LocationImportPreviewStore,
  options: { account?: Account; authenticate?: (token: string) => Promise<Account>; now?: () => Date } = {},
) {
  const app = express();
  app.use('/api/imports', express.json(), createLocationImportPreviewRouter(
    options.authenticate || (async () => options.account || account),
    store,
    { rateLimit: false, now: options.now || (() => new Date(snapshotReadAt)), tokenSecret: 'test-location-import-secret' },
  ));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

function prepare(baseUrl: string) {
  return fetch(`${baseUrl}/api/imports/locations/editing-export/prepare`, {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: '{}',
  });
}

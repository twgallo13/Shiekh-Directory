import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { parse } from 'csv-parse/sync';
import type { Account } from '../server/authAuthority';
import { createLocationImportPreviewRouter, type LocationImportPreviewStore } from '../server/locationImportPreview';
import { LOCATION_IMPORT_COLUMNS } from '../src/lib/locationImportPreview';
import type { DirectorySeed } from '../src/lib/directorySeed';

const account: Account = { uid: 'admin', email: 'admin@example.test', emailVerified: true, name: 'Admin', role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
const seed = {
  locations: [{ id: 'loc-1', storeNumber: '001', name: 'Original', type: 'Street / Standalone Location', address: '1 Main', city: 'LA', state: 'CA', zipCode: '90001', phone: '555-0100', timeZone: 'America/Los_Angeles', hierarchyApplicability: 'Applicable', regionId: 'reg-west', districtId: 'dist-1', operationalStatus: 'Open — Normal Operations', recordStatus: 'Active', standardHours: {} }],
  people: [{ id: 'person-1', fullName: 'Reference Person', status: 'Inactive', email: 'private@example.test', workPhone: '+12135550199' }],
  regions: [{ id: 'reg-west', name: 'West', status: 'Active' }],
  districts: [{ id: 'dist-1', name: 'District 1', regionId: 'reg-west', status: 'Active' }],
  users: [], requests: [], auditLogs: [], hoursTemplates: [], corporateHolidays: [], emailTemplates: [], notificationRules: [], outboxLogs: [], sopRunbooks: [],
} as DirectorySeed;

test('Location import template and preview are authenticated, read-only operations', async () => {
  let reads = 0;
  let writes = 0;
  const store = {
    async readLocationImportSnapshot() { reads += 1; return structuredClone(seed); },
    async commit() { writes += 1; throw new Error('write must not be called'); },
    async migrate() { writes += 1; throw new Error('migration must not be called'); },
  };
  const app = await harness(account, store);
  try {
    const template = await fetch(`${app.baseUrl}/api/imports/locations/template`, { headers: { Authorization: 'Bearer token' } });
    assert.equal(template.status, 200);
    assert.match(template.headers.get('content-disposition') || '', /shiekh_locations_import_v1\.csv/);
    assert.deepEqual((parse(await template.text()) as string[][])[0], LOCATION_IMPORT_COLUMNS);

    const example = await fetch(`${app.baseUrl}/api/imports/locations/example`, { headers: { Authorization: 'Bearer token' } });
    assert.equal(example.status, 200);
    assert.equal((parse(await example.text(), { columns: true }) as unknown[]).length, 4);

    const fields = await fetch(`${app.baseUrl}/api/imports/locations/fields`, { headers: { Authorization: 'Bearer token' } });
    assert.equal(fields.status, 200);
    assert.deepEqual((parse(await fields.text(), { columns: true }) as Array<{ Header: string }>).map(field => field.Header), LOCATION_IMPORT_COLUMNS);

    const references = await fetch(`${app.baseUrl}/api/imports/locations/references`, { headers: { Authorization: 'Bearer token' } });
    assert.equal(references.status, 200);
    assert.equal(references.headers.get('x-snapshot-read-at'), '2026-09-13T12:00:00.000Z');
    const referenceText = await references.text();
    const referenceRows = parse(referenceText, { columns: true }) as Array<Record<string, string>>;
    assert.deepEqual(referenceRows.find(row => row.RecordType === 'Location'), { RecordType: 'Location', Id: 'loc-1', Name: 'Original', LifecycleStatus: 'Active', StoreNumber: '001', ParentRegionId: '', ParentRegionName: '' });
    assert.deepEqual(referenceRows.find(row => row.RecordType === 'Person'), { RecordType: 'Person', Id: 'person-1', Name: 'Reference Person', LifecycleStatus: 'Inactive', StoreNumber: '', ParentRegionId: '', ParentRegionName: '' });
    assert.deepEqual(referenceRows.find(row => row.RecordType === 'Region'), { RecordType: 'Region', Id: 'reg-west', Name: 'West', LifecycleStatus: 'Active', StoreNumber: '', ParentRegionId: '', ParentRegionName: '' });
    assert.deepEqual(referenceRows.find(row => row.RecordType === 'District'), { RecordType: 'District', Id: 'dist-1', Name: 'District 1', LifecycleStatus: 'Active', StoreNumber: '', ParentRegionId: 'reg-west', ParentRegionName: 'West' });
    assert.doesNotMatch(referenceText, /private@example\.test|\+12135550199|email|phone|firebase/i);

    const csv = row({ LocationId: 'loc-1', StoreNumber: '001', StoreName: 'Preview Name' });
    const response = await fetch(`${app.baseUrl}/api/imports/locations/preview`, { method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }) });
    assert.equal(response.status, 200);
    const preview = await response.json();
    assert.equal(preview.summary.updates, 1);
    assert.deepEqual(preview.rows[0].changes, [{ field: 'name', before: 'Original', after: 'Preview Name' }]);
    assert.equal(preview.snapshotReadAt, '2026-09-13T12:00:00.000Z');
    assert.equal(reads, 2);
    assert.equal(writes, 0);
    assert.equal(seed.locations[0].name, 'Original');
  } finally { await app.close(); }
});

test('Location import preview rejects viewers, invalid templates, and unavailable snapshots', async () => {
  const viewer = await harness({ ...account, role: 'Viewer' }, { async readLocationImportSnapshot() { return seed; } });
  try {
    const response = await fetch(`${viewer.baseUrl}/api/imports/locations/preview`, { method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: 'bad' }) });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'preview_not_allowed');
  } finally { await viewer.close(); }

  const storeEditor = await harness({ ...account, role: 'Editor', accessScope: 'Store 001' }, { async readLocationImportSnapshot() { return seed; } });
  try {
    const response = await fetch(`${storeEditor.baseUrl}/api/imports/locations/preview`, { method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: row({ StoreNumber: '001' }) }) });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'unsupported_preview_scope');
  } finally { await storeEditor.close(); }

  const authorized = await harness(account, { async readLocationImportSnapshot() { return seed; } });
  try {
    const response = await fetch(`${authorized.baseUrl}/api/imports/locations/preview`, { method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: 'StoreNumber,StoreName\r\n001,Unsupported\r\n' }) });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'unsupported_template');
  } finally { await authorized.close(); }

  let oversizedReads = 0;
  const oversized = await harness(account, { async readLocationImportSnapshot() { oversizedReads += 1; return seed; } });
  try {
    const csv = `${LOCATION_IMPORT_COLUMNS.join(',')}\r\n${'é'.repeat(1_000_001)}`;
    assert.ok(csv.length < 2_000_000);
    assert.ok(Buffer.byteLength(csv, 'utf8') > 2_000_000);
    const response = await fetch(`${oversized.baseUrl}/api/imports/locations/preview`, { method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }) });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'invalid_csv');
    assert.equal(oversizedReads, 0);
  } finally { await oversized.close(); }

  const broken = await harness(account, { async readLocationImportSnapshot() { throw new Error('offline'); } });
  try {
    const response = await fetch(`${broken.baseUrl}/api/imports/locations/preview`, { method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: row({ StoreNumber: '002' }) }) });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'preview_unavailable');
  } finally { await broken.close(); }
});

async function harness(authenticatedAccount: Account, store: LocationImportPreviewStore) {
  const app = express();
  app.use('/api/imports', express.json({ limit: '12mb' }), createLocationImportPreviewRouter(async () => authenticatedAccount, store, { rateLimit: false, now: () => new Date('2026-09-13T12:00:00.000Z') }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

function row(overrides: Partial<Record<typeof LOCATION_IMPORT_COLUMNS[number], string>>) {
  const values = { SchemaVersion: 'locations-v1', ...overrides };
  return `${LOCATION_IMPORT_COLUMNS.join(',')}\r\n${LOCATION_IMPORT_COLUMNS.map(column => JSON.stringify(values[column] || '')).join(',')}\r\n`;
}
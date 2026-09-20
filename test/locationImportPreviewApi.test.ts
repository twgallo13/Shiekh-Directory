import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { parse } from 'csv-parse/sync';
import type { Account } from '../server/authAuthority';
import { createLocationImportPreviewRouter, type LocationImportPreviewStore } from '../server/locationImportPreview';
import { LOCATION_IMPORT_MAX_TOKEN_BYTES, LocationImportConfirmationError, expiredConfirmation, loadLocationImportTokenSecret, verifyLocationImportManifest, type LocationImportManifest, type LocationImportReceipt } from '../server/locationImportConfirmation';
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
    const templateBytes = new Uint8Array(await template.arrayBuffer());
    assert.deepEqual([...templateBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.deepEqual((parse(new TextDecoder().decode(templateBytes), { bom: true }) as string[][])[0], LOCATION_IMPORT_COLUMNS);

    const example = await fetch(`${app.baseUrl}/api/imports/locations/example`, { headers: { Authorization: 'Bearer token' } });
    assert.equal(example.status, 200);
    const exampleBytes = new Uint8Array(await example.arrayBuffer());
    assert.deepEqual([...exampleBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal((parse(new TextDecoder().decode(exampleBytes), { bom: true, columns: true }) as unknown[]).length, 4);

    const fields = await fetch(`${app.baseUrl}/api/imports/locations/fields`, { headers: { Authorization: 'Bearer token' } });
    assert.equal(fields.status, 200);
    const fieldBytes = new Uint8Array(await fields.arrayBuffer());
    assert.deepEqual([...fieldBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.deepEqual((parse(new TextDecoder().decode(fieldBytes), { bom: true, columns: true }) as Array<{ Header: string }>).map(field => field.Header), LOCATION_IMPORT_COLUMNS);

    const references = await fetch(`${app.baseUrl}/api/imports/locations/references`, { headers: { Authorization: 'Bearer token' } });
    assert.equal(references.status, 200);
    assert.equal(references.headers.get('x-snapshot-read-at'), '2026-09-13T12:00:00.000Z');
    const referenceBytes = new Uint8Array(await references.arrayBuffer());
    assert.deepEqual([...referenceBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const referenceText = new TextDecoder().decode(referenceBytes);
    const referenceRows = parse(referenceText, { bom: true, columns: true }) as Array<Record<string, string>>;
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
    const response = await fetch(`${authorized.baseUrl}/api/imports/locations/preview`, { method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: 'StoreNumber,StoreName,Type,Address,City,State,ZipCode,Phone,District,StoreManager,StoreManagerPhone,DistrictManager,AssistantStoreManagers,OperationalStatus,RecordStatus,GoogleReviewUrl,StorePageUrl\r\n' }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.summary.totalRows, 0);
    assert.equal(body.mappings.find((mapping: { sourceHeader: string }) => mapping.sourceHeader === 'District').kind, 'informational');
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

test('eligible previews issue bound tokens and confirmation rejects tampering, mismatches, warnings, expiry, and revoked authority', async () => {
  let confirmed: LocationImportManifest | undefined;
  let committedReceipt: LocationImportReceipt | undefined;
  let currentAccount = account;
  let clock = new Date('2026-09-13T12:00:00.000Z');
  const store: LocationImportPreviewStore = {
    async readLocationImportSnapshot() { return structuredClone(seed); },
    async confirmLocationImport(manifest, _actor, options) {
      if (options?.replayOnly && !committedReceipt) throw expiredConfirmation();
      confirmed = manifest;
      if (committedReceipt) return { ...committedReceipt, replayed: true };
      committedReceipt = receipt(manifest);
      return committedReceipt;
    },
  };
  const app = await harness(account, store, { now: () => clock, authenticate: async () => currentAccount });
  try {
    const csv = row({ LocationId: 'loc-1', StoreNumber: '001', StoreName: 'Confirmed Name' });
    const previewResponse = await post(app.baseUrl, 'preview', { csv });
    assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json();
    assert.equal(typeof preview.confirmationToken, 'string');
    assert.equal(preview.rows[0].locationId, 'loc-1');

    const tampered = await post(app.baseUrl, 'confirm', confirmationRequest(preview, csv, { confirmationToken: `${preview.confirmationToken}x` }));
    assert.equal(tampered.status, 400);
    assert.equal((await tampered.json()).error.code, 'confirmation_tampered');

    const mismatched = await post(app.baseUrl, 'confirm', confirmationRequest(preview, `${csv}\r\n`));
    assert.equal(mismatched.status, 409);
    assert.equal((await mismatched.json()).error.code, 'confirmation_mismatch');

    const wrongOperation = await post(app.baseUrl, 'confirm', confirmationRequest(preview, csv, { operationId: 'locimp-other' }));
    assert.equal(wrongOperation.status, 409);
    assert.equal((await wrongOperation.json()).error.code, 'confirmation_mismatch');

    const confirmedResponse = await post(app.baseUrl, 'confirm', confirmationRequest(preview, csv));
    assert.equal(confirmedResponse.status, 200);
    assert.equal((await confirmedResponse.json()).operationId, preview.operationId);
    assert.equal(confirmed?.sourceDigest.length, 43);
    assert.equal(confirmed?.writes[0].expectedVersion, 0);
    assert.deepEqual(confirmed?.unchanged, []);

    currentAccount = { ...account, role: 'Directory Data Steward' };
    const changedAuthority = await post(app.baseUrl, 'confirm', confirmationRequest(preview, csv));
    assert.equal(changedAuthority.status, 409);
    assert.equal((await changedAuthority.json()).error.code, 'confirmation_mismatch');
    currentAccount = account;

    currentAccount = { ...account, role: 'Viewer' };
    const revoked = await post(app.baseUrl, 'confirm', confirmationRequest(preview, csv));
    assert.equal(revoked.status, 403);
    assert.equal(confirmed?.operationId, preview.operationId);
    currentAccount = account;

    clock = new Date('2026-09-13T12:10:00.001Z');
    const expired = await post(app.baseUrl, 'confirm', confirmationRequest(preview, csv));
    assert.equal(expired.status, 200);
    assert.equal((await expired.json()).replayed, true);

    clock = new Date('2026-09-13T12:20:00.000Z');
    committedReceipt = undefined;
    const freshCsv = row({ LocationId: 'loc-1', StoreNumber: '001', StoreName: 'Another Name' });
    const freshPreview = await (await post(app.baseUrl, 'preview', { csv: freshCsv })).json();
    clock = new Date('2026-09-13T12:30:00.001Z');
    const expiredUncommitted = await post(app.baseUrl, 'confirm', confirmationRequest(freshPreview, freshCsv));
    assert.equal(expiredUncommitted.status, 409);
    assert.equal((await expiredUncommitted.json()).error.code, 'confirmation_expired');
  } finally { await app.close(); }

  const warningApp = await harness(account, store);
  try {
    const csv = row({ StoreNumber: '0001', StoreName: 'Warning Rename' });
    const preview = await (await post(warningApp.baseUrl, 'preview', { csv })).json();
    assert.equal(preview.summary.warnings, 1);
    const response = await post(warningApp.baseUrl, 'confirm', confirmationRequest(preview, csv, { warningsReviewed: false }));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'warnings_not_reviewed');
  } finally { await warningApp.close(); }
});

test('preview reserves generated addition IDs, enforces batch limits, and only requires a secret for eligible changes', async () => {
  const unavailable = await harness(account, { async readLocationImportSnapshot() { return structuredClone(seed); } }, { tokenSecret: '' });
  try {
    const blocked = await post(unavailable.baseUrl, 'preview', { csv: row({ StoreNumber: '002' }) });
    assert.equal(blocked.status, 200);
    assert.equal((await blocked.json()).summary.blocked, 1);
    const eligible = await post(unavailable.baseUrl, 'preview', { csv: row({ LocationId: 'loc-1', StoreName: 'Rename' }) });
    assert.equal(eligible.status, 200);
    const readOnlyPreview = await eligible.json();
    assert.equal(readOnlyPreview.summary.updates, 1);
    assert.match(readOnlyPreview.confirmationDisabledReason, /not configured/);
    assert.equal(readOnlyPreview.confirmationToken, undefined);
  } finally { await unavailable.close(); }

  const noExecutor = await harness(account, { async readLocationImportSnapshot() { return structuredClone(seed); } }, { confirmationExecutor: false });
  try {
    const response = await post(noExecutor.baseUrl, 'preview', { csv: row({ LocationId: 'loc-1', StoreName: 'Rename' }) });
    assert.equal(response.status, 200);
    const readOnlyPreview = await response.json();
    assert.equal(readOnlyPreview.summary.updates, 1);
    assert.match(readOnlyPreview.confirmationDisabledReason, /not configured/);
    assert.equal(readOnlyPreview.operationId, undefined);
  } finally { await noExecutor.close(); }

  const app = await harness(account, { async readLocationImportSnapshot() { return structuredClone(seed); } });
  try {
    const addition = validAdditionRow('002');
    const preview = await (await post(app.baseUrl, 'preview', { csv: addition })).json();
    assert.match(preview.rows[0].locationId, /^loc-[0-9a-f-]{36}$/);
    const suppliedCsv = row({ ...additionValues('003'), LocationId: 'loc-supplied' });
    const suppliedPreview = await (await post(app.baseUrl, 'preview', { csv: suppliedCsv })).json();
    const suppliedManifest = verifyLocationImportManifest(suppliedPreview.confirmationToken, 'test-location-import-secret', new Date('2026-09-13T12:00:00.000Z'));
    assert.equal(suppliedPreview.rows[0].locationId, 'loc-supplied');
    assert.equal(suppliedManifest.writes[0].id, 'loc-supplied');
    assert.equal(suppliedManifest.writes[0].data.id, 'loc-supplied');
    const tooManyRows = csvRows(Array.from({ length: 101 }, (_, index) => ({ StoreNumber: String(index + 1000) })));
    const response = await post(app.baseUrl, 'preview', { csv: tooManyRows });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'batch_too_large');
    const tooManyChanges = csvRows(Array.from({ length: 41 }, (_, index) => additionValues(String(index + 2000))));
    const changedResponse = await post(app.baseUrl, 'preview', { csv: tooManyChanges });
    assert.equal(changedResponse.status, 200);
    const changedPreview = await changedResponse.json();
    assert.deepEqual(changedPreview.selectedRowNumbers, []);
    assert.equal(changedPreview.confirmationToken, undefined);
    assert.match(changedPreview.confirmationDisabledReason, /Select up to 40 rows/);
    const selectedTooMany = await post(app.baseUrl, 'preview', { csv: tooManyChanges, selectedRowNumbers: Array.from({ length: 41 }, (_, index) => index + 2) });
    assert.equal(selectedTooMany.status, 400);
    assert.equal((await selectedTooMany.json()).error.code, 'batch_too_large');
  } finally { await app.close(); }
});

test('preview manifest binds unchanged Location identity and version alongside changed rows', async () => {
  const snapshot = structuredClone(seed);
  snapshot.locations.push({ ...snapshot.locations[0], id: 'loc-2', storeNumber: '002', name: 'Unchanged', version: 7 });
  let confirmed: LocationImportManifest | undefined;
  const app = await harness(account, {
    async readLocationImportSnapshot() { return snapshot; },
    async confirmLocationImport(manifest) { confirmed = manifest; return receipt(manifest); },
  });
  try {
    const csv = csvRows([
      { LocationId: 'loc-1', StoreNumber: '001', StoreName: 'Changed' },
      { LocationId: 'loc-2', StoreNumber: '002' },
    ]);
    const preview = await (await post(app.baseUrl, 'preview', { csv })).json();
    assert.deepEqual(preview.summary, { totalRows: 2, additions: 0, updates: 1, unchanged: 1, blocked: 0, warnings: 0 });
    const response = await post(app.baseUrl, 'confirm', confirmationRequest(preview, csv));
    assert.equal(response.status, 200);
    assert.deepEqual(confirmed?.unchanged, [{ id: 'loc-2', expectedVersion: 7, storeNumber: '002' }]);
  } finally { await app.close(); }
});

test('selected ready rows can be confirmed while blocked rows remain unchanged', async () => {
  let confirmed: LocationImportManifest | undefined;
  const app = await harness(account, {
    async readLocationImportSnapshot() { return structuredClone(seed); },
    async confirmLocationImport(manifest) { confirmed = manifest; return receipt(manifest); },
  });
  try {
    const csv = csvRows([
      { LocationId: 'loc-1', StoreName: 'Selected Rename' },
      { StoreNumber: '002', StoreName: 'Incomplete Addition' },
    ]);
    const preview = await (await post(app.baseUrl, 'preview', { csv, selectedRowNumbers: [2] })).json();
    assert.equal(preview.summary.updates, 1);
    assert.equal(preview.summary.blocked, 1);
    assert.deepEqual(preview.selectedRowNumbers, [2]);
    assert.equal(typeof preview.confirmationToken, 'string');

    const changedSelection = await post(app.baseUrl, 'confirm', confirmationRequest(preview, csv, { selectedRowNumbers: [] }));
    assert.equal(changedSelection.status, 409);
    assert.equal((await changedSelection.json()).error.code, 'confirmation_mismatch');
    const changedMode = await post(app.baseUrl, 'confirm', confirmationRequest(preview, csv, { mode: 'update-existing-only' }));
    assert.equal(changedMode.status, 409);
    assert.equal((await changedMode.json()).error.code, 'confirmation_mismatch');
    const changedMappings = preview.mappings.map((mapping: Record<string, unknown>) => mapping.sourceHeader === 'StoreName' ? { ...mapping, target: null } : mapping);
    const mappingMismatch = await post(app.baseUrl, 'confirm', confirmationRequest(preview, csv, { mappings: changedMappings }));
    assert.equal(mappingMismatch.status, 409);
    assert.equal((await mappingMismatch.json()).error.code, 'confirmation_mismatch');

    const response = await post(app.baseUrl, 'confirm', confirmationRequest(preview, csv));
    assert.equal(response.status, 200);
    assert.deepEqual(confirmed?.selectedRowNumbers, [2]);
    assert.deepEqual(confirmed?.writes.map(write => write.rowNumber), [2]);
    assert.equal(confirmed?.writes[0].data.name, 'Selected Rename');
  } finally { await app.close(); }
});

test('a valid row beside a recoverable malformed row can be selected and committed', async () => {
  let confirmed: LocationImportManifest | undefined;
  const app = await harness(account, {
    async readLocationImportSnapshot() { return structuredClone(seed); },
    async confirmLocationImport(manifest) { confirmed = manifest; return receipt(manifest); },
  });
  try {
    const csv = 'LocationId,StoreName\r\nloc-1,Valid Rename\r\nloc-other,Malformed,Extra value\r\n';
    const preview = await (await post(app.baseUrl, 'preview', { csv, selectedRowNumbers: [2] })).json();
    assert.deepEqual(preview.summary, { totalRows: 2, additions: 0, updates: 1, unchanged: 0, blocked: 1, warnings: 0 });
    assert.deepEqual(preview.rows[1].sourceValues, ['loc-other', 'Malformed', 'Extra value']);
    assert.ok(preview.rows[1].issues.some((issue: { code: string }) => issue.code === 'invalid_row_shape'));

    const response = await post(app.baseUrl, 'confirm', confirmationRequest(preview, csv));
    assert.equal(response.status, 200);
    assert.deepEqual(confirmed?.writes.map(write => [write.rowNumber, write.id]), [[2, 'loc-1']]);
  } finally { await app.close(); }
});

test('excluding one side of a full-file identity collision cannot make it selectable', async () => {
  const app = await harness(account, { async readLocationImportSnapshot() { return structuredClone(seed); } });
  try {
    const csv = csvRows([
      { LocationId: 'loc-1', StoreName: 'First' },
      { StoreNumber: '001', StoreName: 'Second' },
    ]);
    const response = await post(app.baseUrl, 'preview', { csv, selectedRowNumbers: [2] });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'invalid_selection');
  } finally { await app.close(); }
});

test('confirmation verifier rejects tokens above the signed-token byte limit', () => {
  assert.throws(
    () => verifyLocationImportManifest('x'.repeat(LOCATION_IMPORT_MAX_TOKEN_BYTES + 1), 'secret', new Date()),
    (error: unknown) => error instanceof LocationImportConfirmationError && error.code === 'confirmation_too_large',
  );
});

test('confirmation secret configuration fails closed for weak values', () => {
  assert.equal(loadLocationImportTokenSecret('x'.repeat(32)), 'x'.repeat(32));
  assert.throws(() => loadLocationImportTokenSecret('too-short'), /at least 32 bytes/);
});

async function harness(
  authenticatedAccount: Account,
  store: LocationImportPreviewStore,
  options: { now?: () => Date; tokenSecret?: string; authenticate?: (token: string) => Promise<Account>; confirmationExecutor?: false } = {},
) {
  const app = express();
  const capableStore: LocationImportPreviewStore = {
    ...store,
    ...(options.confirmationExecutor === false ? {} : { confirmLocationImport: store.confirmLocationImport || (async manifest => receipt(manifest)) }),
  };
  app.use('/api/imports', express.json({ limit: '12mb' }), createLocationImportPreviewRouter(options.authenticate || (async () => authenticatedAccount), capableStore, {
    rateLimit: false,
    now: options.now || (() => new Date('2026-09-13T12:00:00.000Z')),
    tokenSecret: options.tokenSecret === undefined ? 'test-location-import-secret' : options.tokenSecret,
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

function post(baseUrl: string, action: 'preview' | 'confirm', body: unknown) {
  return fetch(`${baseUrl}/api/imports/locations/${action}`, { method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

function confirmationRequest(preview: Record<string, any>, csv: string, overrides: Record<string, unknown> = {}) {
  return {
    csv,
    confirmationToken: preview.confirmationToken,
    operationId: preview.operationId,
    warningsReviewed: true,
    mappings: preview.mappings,
    mode: preview.mode,
    selectedRowNumbers: preview.selectedRowNumbers,
    ...overrides,
  };
}

function receipt(manifest: LocationImportManifest): LocationImportReceipt {
  return { operationId: manifest.operationId, batchId: manifest.batchId, committedAt: '2026-09-13T12:00:01.000Z', additions: manifest.summary.additions, updates: manifest.summary.updates, unchanged: manifest.summary.unchanged, locations: manifest.writes.map(write => ({ id: write.id, name: String(write.data.name || ''), storeNumber: String(write.data.storeNumber || ''), record: { ...write.data, id: write.id } })), replayed: false };
}

function validAdditionRow(storeNumber: string) {
  return row(additionValues(storeNumber));
}

function additionValues(storeNumber: string) {
  return { StoreNumber: storeNumber, StoreName: `Store ${storeNumber}`, Type: 'Street / Standalone Location', Address: '2 Main', City: 'LA', State: 'CA', ZipCode: '90002', Phone: '2135550100', TimeZone: 'America/Los_Angeles', HierarchyApplicability: 'Applicable', RegionId: 'reg-west', DistrictId: 'dist-1', OperationalStatus: 'Open — Normal Operations', RecordStatus: 'Active' };
}

function csvRows(rows: Array<Partial<Record<typeof LOCATION_IMPORT_COLUMNS[number], string>>>) {
  const values = rows.map(overrides => ({ SchemaVersion: 'locations-v1', ...overrides }));
  return `${LOCATION_IMPORT_COLUMNS.join(',')}\r\n${values.map(value => LOCATION_IMPORT_COLUMNS.map(column => JSON.stringify(value[column] || '')).join(',')).join('\r\n')}\r\n`;
}

function row(overrides: Partial<Record<typeof LOCATION_IMPORT_COLUMNS[number], string>>) {
  const values = { SchemaVersion: 'locations-v1', ...overrides };
  return `${LOCATION_IMPORT_COLUMNS.join(',')}\r\n${LOCATION_IMPORT_COLUMNS.map(column => JSON.stringify(values[column] || '')).join(',')}\r\n`;
}
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { confirmLocationImport, LocationImportRequestError, prepareLocationEditingExport, previewLocationImport } from '../src/lib/locationImportPreviewClient';

const user = { getIdToken: async () => 'token' } as never;
const originalFetch = globalThis.fetch;

afterEach(() => { globalThis.fetch = originalFetch; });

test('editing export client accepts bounded CSV parts with exact UTF-8 byte counts', async () => {
  const csv = '\ufeffSchemaVersion\r\nlocations-v1\r\n';
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.method, 'POST');
    return Response.json({
      schemaVersion: 'locations-v1', snapshotReadAt: '2026-09-13T12:00:00.000Z',
      totalRecords: 1, lifecycleCounts: { Active: 1, Draft: 0, Retired: 0, unrecognized: 0 },
      roundTrip: { additions: 0, updates: 0, unchanged: 1, blocked: 0, warnings: 0 },
      parts: [{ partNumber: 1, filename: 'shiekh_locations_editing_v1_part_001_of_001.csv', recordCount: 1, byteCount: new TextEncoder().encode(csv).byteLength, csv }],
      diagnostics: [],
    });
  };

  const prepared = await prepareLocationEditingExport(user);
  assert.equal(prepared.parts[0].filename, 'shiekh_locations_editing_v1_part_001_of_001.csv');
  assert.equal(prepared.roundTrip.unchanged, 1);

  globalThis.fetch = async () => Response.json({ ...prepared, roundTrip: { unchanged: 1 } });
  await assert.rejects(() => prepareLocationEditingExport(user), /invalid Location editing export/);

  globalThis.fetch = async () => Response.json({ ...prepared, totalRecords: 2 });
  await assert.rejects(() => prepareLocationEditingExport(user), /invalid Location editing export/);

  globalThis.fetch = async () => Response.json({ ...prepared, parts: [{ ...prepared.parts[0], partNumber: 2 }] });
  await assert.rejects(() => prepareLocationEditingExport(user), /invalid Location editing export/);
});

test('preview retains the exact CSV text and validates confirmation metadata', async () => {
  const csv = '\ufeffSchemaVersion\r\nlocations-v1\r\n';
  let requestBody: unknown;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json({
      schemaVersion: 'locations-v1',
      snapshotReadAt: '2026-09-13T12:00:00.000Z',
      confirmationToken: 'signed-token', operationId: 'operation-1', batchId: 'batch-1', expiresAt: '2026-09-13T12:10:00.000Z',
      summary: { totalRows: 1, additions: 1, updates: 0, unchanged: 0, blocked: 0, warnings: 0 },
      rows: [],
    });
  };

  const result = await previewLocationImport(user, new File([csv], 'locations.csv', { type: 'text/csv' }));
  assert.deepEqual(requestBody, { csv: result.csv });
  assert.equal(result.csv, 'SchemaVersion\r\nlocations-v1\r\n');
  assert.equal(result.preview.confirmationToken, 'signed-token');
});

test('confirm sends only the bound confirmation fields and validates authoritative records', async () => {
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json({
      operationId: 'operation-1', batchId: 'batch-1', committedAt: '2026-09-13T12:01:00.000Z',
      additions: 1, updates: 0, unchanged: 2, replayed: false,
      locations: [{ id: 'loc-2', name: 'New Store', storeNumber: '002', record: { id: 'loc-2', name: 'New Store', storeNumber: '002', version: 0 } }],
    });
  };

  const result = await confirmLocationImport(user, { csv: 'exact', confirmationToken: 'signed-token', operationId: 'operation-1', warningsReviewed: true });
  assert.deepEqual(Object.keys(requestBody).sort(), ['confirmationToken', 'csv', 'operationId', 'warningsReviewed']);
  assert.equal(result.locations[0].record.id, 'loc-2');

  globalThis.fetch = async () => Response.json({ ...result, locations: [{ id: 'loc-2', name: 'New Store', storeNumber: '002' }] });
  await assert.rejects(
    () => confirmLocationImport(user, { csv: 'exact', confirmationToken: 'signed-token', operationId: 'operation-1', warningsReviewed: true }),
    (error: unknown) => error instanceof LocationImportRequestError && error.code === 'confirmation_uncertain',
  );

  globalThis.fetch = async () => Response.json({ ...result, operationId: 'different-operation' });
  await assert.rejects(
    () => confirmLocationImport(user, { csv: 'exact', confirmationToken: 'signed-token', operationId: 'operation-1', warningsReviewed: true }),
    (error: unknown) => error instanceof LocationImportRequestError && error.code === 'confirmation_uncertain',
  );
});

test('client rejects invalid preview metadata and preserves uncertain confirmation errors', async () => {
  globalThis.fetch = async () => Response.json({
    schemaVersion: 'locations-v1', snapshotReadAt: '2026-09-13T12:00:00.000Z', confirmationToken: 123,
    summary: { totalRows: 0, additions: 0, updates: 0, unchanged: 0, blocked: 0, warnings: 0 }, rows: [],
  });
  await assert.rejects(
    () => previewLocationImport(user, new File(['csv'], 'locations.csv', { type: 'text/csv' })),
    /invalid Location import preview/,
  );

  globalThis.fetch = async () => Response.json(
    { error: { code: 'confirmation_uncertain', message: 'Retry the same operation.' } },
    { status: 503 },
  );
  await assert.rejects(
    () => confirmLocationImport(user, { csv: 'exact', confirmationToken: 'signed-token', operationId: 'operation-1', warningsReviewed: false }),
    (error: unknown) => error instanceof LocationImportRequestError
      && error.code === 'confirmation_uncertain'
      && error.message === 'Retry the same operation.',
  );

  globalThis.fetch = async () => { throw new TypeError('network unavailable'); };
  await assert.rejects(
    () => confirmLocationImport(user, { csv: 'exact', confirmationToken: 'signed-token', operationId: 'operation-1', warningsReviewed: true }),
    (error: unknown) => error instanceof LocationImportRequestError
      && error.code === 'confirmation_uncertain',
  );

  globalThis.fetch = async () => new Response('{not-json', { status: 200, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(
    () => confirmLocationImport(user, { csv: 'exact', confirmationToken: 'signed-token', operationId: 'operation-1', warningsReviewed: true }),
    (error: unknown) => error instanceof LocationImportRequestError && error.code === 'confirmation_uncertain',
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new TypeError('body stream failed'); } }) as unknown as Response;
  await assert.rejects(
    () => confirmLocationImport(user, { csv: 'exact', confirmationToken: 'signed-token', operationId: 'operation-1', warningsReviewed: true }),
    (error: unknown) => error instanceof LocationImportRequestError && error.code === 'confirmation_uncertain',
  );
});

test('lost confirmation response can retry the exact operation and receive its receipt', async () => {
  const request = { csv: 'exact', confirmationToken: 'signed-token', operationId: 'operation-1', warningsReviewed: true };
  const requestBodies: unknown[] = [];
  let attempts = 0;
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)));
    attempts += 1;
    if (attempts === 1) throw new TypeError('connection lost after request');
    return Response.json({
      operationId: 'operation-1', batchId: 'batch-1', committedAt: '2026-09-13T12:01:00.000Z',
      additions: 1, updates: 0, unchanged: 0, replayed: true,
      locations: [{ id: 'loc-2', name: 'New Store', storeNumber: '002', record: { id: 'loc-2', name: 'New Store', storeNumber: '002', version: 1 } }],
    });
  };

  await assert.rejects(
    () => confirmLocationImport(user, request),
    (error: unknown) => error instanceof LocationImportRequestError && error.code === 'confirmation_uncertain',
  );
  const receipt = await confirmLocationImport(user, request);
  assert.equal(receipt.replayed, true);
  assert.deepEqual(requestBodies, [request, request]);
});
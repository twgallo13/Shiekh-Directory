import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { apiErrorHandler, createDirectoryApiRouter, digestApiToken } from '../server/directoryApi';
import type { CustomFieldDefinition } from '../src/lib/customFields';

test('both API routes publish approved metadata and enforce schema reconciliation on visibility changes', async () => {
  let definitions: CustomFieldDefinition[] = [{ id: 'yelpUrl', label: 'Yelp', type: 'url', helpText: '', options: [], order: 0, apiVisible: true, retired: false }];
  const now = new Date('2026-09-08T12:00:00Z');
  const record = { id: 'loc-07', updatedAt: new Date('2026-09-01T00:00:00Z'), data: { storeNumber: '07', recordStatus: 'Active', googleReviewUrl: 'https://example.test/review', storePageUrl: 'https://example.test/store', customMetadata: { yelpUrl: 'https://example.test/yelp', secret: 'private' } } };
  const app = express();
  app.use('/api/v1', createDirectoryApiRouter({ tokenHmacSecret: 'test-secret', credentials: [{ id: 'test', digest: digestApiToken('test-token', 'test-secret'), scopes: ['locations:read'] }], now: () => now, rateLimit: false,
    locations: { readCustomFieldDefinitions: async () => definitions, readPage: async () => ({ records: [record], nextId: 'loc-07' }), findActiveByStoreNumber: async () => record } }));
  app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const request = (path: string, authenticated = true, headers = {}) => fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/${path}`, { headers: { ...(authenticated ? { Authorization: 'Bearer test-token' } : {}), ...headers } });
  try {
    assert.equal((await request('location-fields', false)).status, 401);
    const schema = await (await request('location-fields')).json();
    assert.equal(schema.fields[0].id, 'yelpUrl');
    const list = await (await request('locations?limit=1')).json();
    assert.deepEqual(list.data[0].customMetadata, { yelpUrl: 'https://example.test/yelp' });
    const detail = await request('locations/07');
    assert.equal(detail.headers.get('cache-control'), 'no-store');
    const body = await detail.json();
    assert.deepEqual(body.data.customMetadata, list.data[0].customMetadata);
    assert.equal(body.data.googleReviewUrl, record.data.googleReviewUrl);
    assert.equal(body.data.storePageUrl, record.data.storePageUrl);
    const full = await (await request('locations?updatedSince=2026-09-07T00:00:00Z')).json();
    assert.equal(full.sync.mode, 'full'); assert.equal(full.data.length, 1);
    const delta = await (await request(`locations?updatedSince=2026-09-07T00:00:00Z&customFieldsVersion=${schema.version}`)).json();
    assert.equal(delta.sync.mode, 'delta'); assert.equal(delta.data.length, 0);
    definitions = [{ ...definitions[0], apiVisible: false }];
    assert.equal((await request(`locations?cursor=${list.pagination.nextCursor}`)).status, 409);
    assert.equal((await request(`locations?customFieldsVersion=${schema.version}`)).status, 409);
    const hidden = await request('locations/07', true, { 'If-None-Match': detail.headers.get('etag')! });
    assert.equal(hidden.status, 200);
    assert.deepEqual((await hidden.json()).data.customMetadata, {});
    assert.deepEqual((await (await request('location-fields')).json()).fields, []);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
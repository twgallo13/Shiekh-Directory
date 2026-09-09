import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Account } from '../server/authAuthority';
import { DirectoryValidationError, validateMetadataWrites, type DirectoryWrite } from '../server/firestoreDirectory';
import type { CustomFieldDefinition } from '../src/lib/customFields';

const actor: Account = { uid: 'admin', email: 'admin@example.test', emailVerified: true, name: 'Admin', role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
const urlField: CustomFieldDefinition = { id: 'yelpUrl', label: 'Yelp', type: 'url', helpText: '', options: [], order: 0, apiVisible: false, retired: false };

test('server canonicalizes changed location phones and URLs, including custom URLs', () => {
  const write: DirectoryWrite = { collection: 'locations', id: 'loc-1', operation: 'set', data: { storeNumber: '01', phone: '(212) 555-0100 x123', storePageUrl: 'example.com', customMetadata: { yelpUrl: 'example.test' } }, expectedCustomMetadata: {} };
  assert.deepEqual(validateMetadataWrites([write], [undefined], [urlField], actor)[0].data, {
    storeNumber: '01', phone: '+12125550100', phoneExtension: '123', storePageUrl: 'https://example.com', customMetadata: { yelpUrl: 'https://example.test' },
  });
});

test('server preserves explicitly-entered HTTP and rejects invalid bypass attempts', () => {
  const httpWrite: DirectoryWrite = { collection: 'locations', id: 'loc-1', operation: 'set', data: { storeNumber: '01', phone: '2125550100', storePageUrl: 'http://example.com' } };
  assert.equal(validateMetadataWrites([httpWrite], [undefined], [], actor)[0].data?.storePageUrl, 'http://example.com');
  const invalidPhone = { ...httpWrite, data: { ...httpWrite.data, phone: 'not a phone' } };
  const invalidUrl = { ...httpWrite, data: { ...httpWrite.data, storePageUrl: 'javascript:alert(1)' } };
  assert.throws(() => validateMetadataWrites([invalidPhone], [undefined], [], actor), DirectoryValidationError);
  assert.throws(() => validateMetadataWrites([invalidUrl], [undefined], [], actor), DirectoryValidationError);
});

test('unchanged legacy phones remain writable during unrelated saves', () => {
  const current = { storeNumber: '01', phone: 'legacy extension 42', phoneExtension: '42' };
  const write: DirectoryWrite = { collection: 'locations', id: 'loc-1', operation: 'set', data: { ...current, name: 'Renamed store' } };
  assert.deepEqual(validateMetadataWrites([write], [current], [], actor)[0].data, write.data);
});

test('unchanged legacy custom URLs remain writable during unrelated saves', () => {
  const current = { storeNumber: '01', phone: '+12125550100', customMetadata: { yelpUrl: 'not a URL' } };
  const write: DirectoryWrite = { collection: 'locations', id: 'loc-1', operation: 'set', data: { ...current, name: 'Renamed store' }, expectedCustomMetadata: current.customMetadata };
  assert.deepEqual(validateMetadataWrites([write], [current], [urlField], actor)[0].data, write.data);
});

test('server independently validates person phone fields', () => {
  const write: DirectoryWrite = { collection: 'people', id: 'per-1', operation: 'set', data: { phone: '2125550100', workPhone: '+12125550101 x9' } };
  assert.deepEqual(validateMetadataWrites([write], [undefined], [], actor)[0].data, { phone: '+12125550100', workPhone: '+12125550101', workPhoneExtension: '9' });
  assert.throws(() => validateMetadataWrites([{ ...write, data: { phone: 'invalid' } }], [undefined], [], actor), DirectoryValidationError);
});
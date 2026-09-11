import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Account } from '../server/authAuthority';
import { DirectoryConflict, DirectoryValidationError, DirectoryWriteDenied, validateMetadataWrites, type DirectoryWrite } from '../server/firestoreDirectory';
import type { CustomFieldDefinition } from '../src/lib/customFields';

const actor: Account = { uid: 'test-admin', name: 'Test', email: 'test@example.test', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
const field: CustomFieldDefinition = { id: 'yelpUrl', label: 'Yelp', type: 'url', helpText: '', options: [], order: 0, apiVisible: false, retired: false };
const write: DirectoryWrite = { collection: 'custom_field_definitions', id: field.id, operation: 'set', data: { ...field }, expectedDefinition: null };

test('definition writes require administrator, stable type, and current expected definition', () => {
  assert.equal(validateMetadataWrites([write], [undefined], [], actor)[0].data?.id, 'yelpUrl');
  assert.throws(() => validateMetadataWrites([write], [undefined], [], { ...actor, role: 'Editor' }), DirectoryWriteDenied);
  assert.throws(() => validateMetadataWrites([write], [{ ...field }], [field], actor), DirectoryConflict);
  assert.throws(() => validateMetadataWrites([{ ...write, operation: 'delete' }], [{ ...field }], [field], actor), DirectoryValidationError);
  assert.throws(() => validateMetadataWrites([{ ...write, expectedDefinition: field, data: { ...field, type: 'text' } }], [{ ...field }], [field], actor), DirectoryValidationError);
  assert.equal(validateMetadataWrites([{ ...write, expectedDefinition: field, data: { ...field, retired: true } }], [{ ...field }], [field], actor)[0].data?.retired, true);
});

test('metadata writes enforce permissions, expected values, definitions and URL validation', () => {
  const location: DirectoryWrite = { collection: 'locations', id: 'loc-07', operation: 'set', data: { storeNumber: '07', customMetadata: { yelpUrl: 'https://example.test' } }, expectedCustomMetadata: {}, expectedVersion: 0 };
  const current = { storeNumber: '07', version: 0 };
  assert.deepEqual(validateMetadataWrites([location], [current], [field], actor)[0].data?.customMetadata, location.data?.customMetadata);
  assert.throws(() => validateMetadataWrites([location], [current], [], actor), DirectoryValidationError);
  assert.throws(() => validateMetadataWrites([{ ...location, expectedCustomMetadata: undefined }], [current], [field], actor), DirectoryConflict);
  assert.throws(() => validateMetadataWrites([location], [current], [field], { ...actor, role: 'Viewer' }), DirectoryWriteDenied);
  assert.throws(() => validateMetadataWrites([location], [current], [field], { ...actor, role: 'Editor', accessScope: 'Store 08' }), DirectoryWriteDenied);
  assert.doesNotThrow(() => validateMetadataWrites([location], [current], [field], { ...actor, role: 'Editor', accessScope: 'Store 07' }));
  assert.throws(() => validateMetadataWrites([{ ...location, data: { storeNumber: '07', storePageUrl: 'javascript:alert(1)' } }], [current], [field], actor), DirectoryValidationError);
});

test('ordinary location saves preserve omitted metadata and retired values', () => {
  const current = { storeNumber: '07', customMetadata: { yelpUrl: 'https://example.test' }, version: 0 };
  const location: DirectoryWrite = { collection: 'locations', id: 'loc-07', operation: 'set', data: { storeNumber: '07', name: 'Updated' }, expectedVersion: 0 };
  assert.deepEqual(validateMetadataWrites([location], [current], [{ ...field, retired: true }], actor)[0].data?.customMetadata, current.customMetadata);
  assert.throws(() => validateMetadataWrites([{ ...location, data: { ...location.data, customMetadata: {} }, expectedCustomMetadata: {} }], [current], [field], actor), DirectoryConflict);
});
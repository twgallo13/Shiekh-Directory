import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isWebUrl, parseCustomFieldDefinition, publicCustomMetadata, validateCustomMetadata, type CustomFieldDefinition } from '../src/lib/customFields';

const field: CustomFieldDefinition = { id: 'yelpUrl', label: 'Yelp', type: 'url', helpText: '', options: [], order: 0, apiVisible: false, retired: false };

test('custom field definitions reject unsafe keys and malformed choices', () => {
  assert.deepEqual(parseCustomFieldDefinition(field), field);
  for (const id of ['constructor', '__proto__', 'storePageUrl', 'googleReviewUrl', 'nested.key', '']) {
    assert.throws(() => parseCustomFieldDefinition({ ...field, id }));
  }
  for (const change of [{ type: 'script' }, { type: 'select', options: [] }, { options: ['unused'] }, { type: 'select', options: ['Same', 'Same'] }, { extra: true }]) {
    assert.throws(() => parseCustomFieldDefinition({ ...field, ...change }));
  }
});

test('URL validation rejects executable schemes and credentials', () => {
  assert.equal(isWebUrl('https://www.yelp.com/biz/example'), true);
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.test', 'not a URL', ' https://example.test']) assert.equal(isWebUrl(value), false);
});

test('metadata validates values and retains retired history without permitting edits', () => {
  assert.deepEqual(validateCustomMetadata({ yelpUrl: 'https://example.test' }, [field]), { yelpUrl: 'https://example.test' });
  assert.throws(() => validateCustomMetadata({ unknown: 'value' }, [field]));
  assert.throws(() => validateCustomMetadata({ yelpUrl: false }, [field]));
  const retired = { ...field, retired: true };
  const previous = { yelpUrl: 'https://example.test' };
  assert.deepEqual(validateCustomMetadata({}, [retired], previous), previous);
  assert.throws(() => validateCustomMetadata({ yelpUrl: 'https://other.test' }, [retired], previous));
});

test('only active API-approved valid values are published, including false and zero', () => {
  const fields: CustomFieldDefinition[] = [field, { ...field, id: 'count', type: 'number', apiVisible: true }, { ...field, id: 'enabled', type: 'boolean', apiVisible: true }];
  assert.deepEqual(publicCustomMetadata({ yelpUrl: 'https://example.test', count: 0, enabled: false, secret: 'hidden' }, fields), { count: 0, enabled: false });
  assert.deepEqual(publicCustomMetadata({ yelpUrl: 'javascript:alert(1)' }, [{ ...field, apiVisible: true }]), {});
  assert.deepEqual(publicCustomMetadata({ yelpUrl: 'https://example.test' }, [{ ...field, apiVisible: true, retired: true }]), {});
});
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isWebUrl, parseCustomFieldDefinition, publicCustomMetadata, validateCustomMetadata, type CustomFieldDefinition } from '../src/lib/customFields';
import { normalizeUsPhone, normalizeWebUrl } from '../src/lib/contactNormalization';

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

test('phone and URL normalization use canonical safe formats', () => {
  for (const value of ['(212) 555-0100', '212-555-0100', '12125550100', '+12125550100']) {
    assert.deepEqual(normalizeUsPhone(value), { e164: '+12125550100', display: '(212) 555-0100' });
  }
  assert.deepEqual(normalizeUsPhone('(212) 555-0100 x123'), { e164: '+12125550100', extension: '123', display: '(212) 555-0100 ext. 123' });
  for (const value of ['12345', 'call me']) assert.equal(normalizeUsPhone(value), null);
  assert.equal(normalizeWebUrl('example.com'), 'https://example.com');
  assert.equal(normalizeWebUrl('http://example.com'), 'http://example.com');
  assert.equal(normalizeWebUrl('not a URL'), null);
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

test('URL custom metadata is normalized before storage', () => {
  assert.deepEqual(validateCustomMetadata({ yelpUrl: 'example.com' }, [field]), { yelpUrl: 'https://example.com' });
});

test('only active API-approved valid values are published, including false and zero', () => {
  const fields: CustomFieldDefinition[] = [field, { ...field, id: 'count', type: 'number', apiVisible: true }, { ...field, id: 'enabled', type: 'boolean', apiVisible: true }];
  assert.deepEqual(publicCustomMetadata({ yelpUrl: 'https://example.test', count: 0, enabled: false, secret: 'hidden' }, fields), { count: 0, enabled: false });
  assert.deepEqual(publicCustomMetadata({ yelpUrl: 'javascript:alert(1)' }, [{ ...field, apiVisible: true }]), {});
  assert.deepEqual(publicCustomMetadata({ yelpUrl: 'https://example.test' }, [{ ...field, apiVisible: true, retired: true }]), {});
});
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeLocationWriteValues } from '../src/lib/locationWriteContract';

describe('Location write normalization contract', () => {
  it('normalizes changed Location phone and URL values exactly as manual saves propose to persist them', () => {
    const result = normalizeLocationWriteValues({
      phone: '(213) 555-0100 ext. 42',
      googleReviewUrl: 'maps.example.test/location',
      storePageUrl: 'https://example.test/stores/1',
    });

    assert.deepEqual(result.issues, []);
    assert.equal(result.values.phone, '+12135550100');
    assert.equal(result.values.phoneExtension, '42');
    assert.equal(result.values.googleReviewUrl, 'https://maps.example.test/location');
    assert.equal(result.values.storePageUrl, 'https://example.test/stores/1');
  });

  it('does not revalidate unchanged legacy values during an unrelated edit', () => {
    const current = { phone: 'legacy phone', googleReviewUrl: 'legacy url' };
    const result = normalizeLocationWriteValues({ ...current, name: 'Renamed' }, current);

    assert.deepEqual(result.issues, []);
    assert.equal(result.values.phone, 'legacy phone');
    assert.equal(result.values.googleReviewUrl, 'legacy url');
  });
});
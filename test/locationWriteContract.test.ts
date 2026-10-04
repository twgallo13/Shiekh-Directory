import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeLocationWriteValues } from '../src/lib/locationWriteContract';
import { suggestedLocationInboxEmail } from '../src/lib/locationInboxEmail';

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

  it('normalizes changed location inboxes while preserving local-part case and rejecting malformed input', () => {
    const normalized = normalizeLocationWriteValues({ locationInboxEmail: '  Store.Team@EXAMPLE.TEST  ' });
    assert.deepEqual(normalized.issues, []);
    assert.equal(normalized.values.locationInboxEmail, 'Store.Team@example.test');

    for (const value of ['two@example.test,other@example.test', 'missing-at.example.test', 'bad\n@example.test', 'a..b@example.test']) {
      assert.equal(normalizeLocationWriteValues({ locationInboxEmail: value }).issues[0]?.field, 'locationInboxEmail');
    }
  });

  it('allows unrelated writes to preserve unchanged invalid historical inbox values', () => {
    const current = { locationInboxEmail: 'invalid historic value' };
    const result = normalizeLocationWriteValues({ ...current, name: 'Renamed' }, current);
    assert.deepEqual(result.issues, []);
    assert.equal(result.values.locationInboxEmail, current.locationInboxEmail);
  });

  it('suggests retail inboxes from numeric store numbers without changing stored identities', () => {
    assert.equal(suggestedLocationInboxEmail('007'), 'store7@shiekhshoes.com');
    assert.equal(suggestedLocationInboxEmail('101'), 'store101@shiekhshoes.com');
    assert.equal(suggestedLocationInboxEmail(''), null);
    assert.equal(suggestedLocationInboxEmail('A07'), null);
    assert.equal(suggestedLocationInboxEmail('000'), null);
  });
});
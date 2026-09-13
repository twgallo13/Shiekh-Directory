import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolvePersonEmail, resolvePersonPhone, serializePersonContactEdits, serializePersonUpdate } from '../src/lib/personContacts';
import type { PersonRecord } from '../src/types';

const personWithDifferentContacts: PersonRecord = {
  id: 'per-contact',
  fullName: 'Contact Person',
  phone: '+12125550100',
  phoneExtension: '10',
  workPhone: '+13105550100',
  workPhoneExtension: '20',
  email: 'legacy@example.test',
  workEmail: 'work@example.test',
};

test('Person contact display and editing consistently prefer complete work contact fields', () => {
  assert.deepEqual(resolvePersonPhone(personWithDifferentContacts), {
    value: '+13105550100',
    extension: '20',
    source: 'work',
  });
  assert.deepEqual(resolvePersonEmail(personWithDifferentContacts), {
    value: 'work@example.test',
    source: 'work',
  });
});

test('name-only Person edits preserve every phone, extension, and email value', () => {
  const contactUpdates = serializePersonContactEdits(
    personWithDifferentContacts,
    { e164: '+13105550100', extension: '20', display: '(310) 555-0100' },
    'work@example.test',
    false,
    false,
  );
  assert.deepEqual(contactUpdates, {});
  const serialized = serializePersonUpdate(personWithDifferentContacts, { fullName: 'Renamed Person', ...contactUpdates });
  assert.deepEqual(serialized.data, {
    ...personWithDifferentContacts,
    fullName: 'Renamed Person',
  });
});

test('editing a displayed work contact does not collapse differing legacy contact values', () => {
  const contactUpdates = serializePersonContactEdits(
    personWithDifferentContacts,
    { e164: '+14155550100', extension: '30', display: '(415) 555-0100' },
    'new-work@example.test',
    true,
    true,
  );
  assert.deepEqual(contactUpdates, {
    workPhone: '+14155550100',
    workPhoneExtension: '30',
    workEmail: 'new-work@example.test',
  });
  assert.equal(Object.hasOwn(contactUpdates, 'phone'), false);
  assert.equal(Object.hasOwn(contactUpdates, 'phoneExtension'), false);
  assert.equal(Object.hasOwn(contactUpdates, 'email'), false);
});

test('new Person contacts populate both compatibility aliases', () => {
  assert.deepEqual(serializePersonContactEdits(
    undefined,
    { e164: '+12125550100', extension: '42', display: '(212) 555-0100' },
    'new@example.test',
    false,
    false,
  ), {
    phone: '+12125550100',
    workPhone: '+12125550100',
    phoneExtension: '42',
    workPhoneExtension: '42',
    email: 'new@example.test',
    workEmail: 'new@example.test',
  });
});

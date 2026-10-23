import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legacyIndividualEmailCandidate, personEmailEditChangesValue, resolvePersonEmail, resolvePersonPhone, serializePersonContactEdits, serializePersonUpdate } from '../src/lib/personContacts';
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

test('legacy individual mapping is opt-in eligible only with an absent canonical email and a valid non-shared alias', () => {
  const person = { id: 'legacy', fullName: 'Synthetic Legacy', email: ' Individual@SHIEKHSHOES.COM ' };
  assert.equal(legacyIndividualEmailCandidate(person, []), 'Individual@shiekhshoes.com');
  for (const workEmail of ['', 'existing@shiekhshoes.com', null, undefined]) {
    assert.equal(legacyIndividualEmailCandidate({ ...person, workEmail } as PersonRecord, []), null);
  }
  for (const email of ['', 'invalid', 'store007@shiekhshoes.com', 'TEAM@EXAMPLE.test']) {
    assert.equal(legacyIndividualEmailCandidate({ ...person, email }, [{ locationInboxEmail: 'team@example.test' }]), null);
  }
  assert.equal(legacyIndividualEmailCandidate(undefined, []), null);
  assert.equal(personEmailEditChangesValue(person, 'Individual@shiekhshoes.com'), false);
  const updates = serializePersonContactEdits(person, null, legacyIndividualEmailCandidate(person, [])!, false, true);
  assert.deepEqual(updates, { workEmail: 'Individual@shiekhshoes.com' });
  assert.equal(person.email, ' Individual@SHIEKHSHOES.COM ');
});

test('restored shared or invalid legacy contact is a no-op without promoting aliases or rewriting stored casing', () => {
  for (const fields of [{ email: 'store7@shiekhshoes.com' }, { email: 'other@example.test', workEmail: 'STORE7@shiekhshoes.com' }, { email: 'invalid legacy' }]) {
    const person = { id: 'roundtrip', fullName: 'Roundtrip', ...fields };
    const saved = resolvePersonEmail(person).value;
    assert.equal(personEmailEditChangesValue(person, saved), false);
    assert.deepEqual(serializePersonContactEdits(person, null, saved, false, personEmailEditChangesValue(person, saved)), {});
    assert.equal(personEmailEditChangesValue(person, 'individual@example.test'), true);
    assert.equal(personEmailEditChangesValue(person, ''), true);
  }
  assert.equal(personEmailEditChangesValue({ id: 'p', fullName: 'Name', email: 'store7@shiekhshoes.com' }, ' STORE7@SHIEKHSHOES.COM '), false);
  assert.equal(personEmailEditChangesValue(undefined, ''), true);
  assert.equal(personEmailEditChangesValue({ id: 'p', fullName: 'Name', workEmail: '', email: 'old@example.test' }, ''), false);
});

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

  test('email resolution respects an explicitly present blank workEmail instead of falling back to the legacy alias', () => {
    const cleared = { ...personWithDifferentContacts, workEmail: '' };
    assert.deepEqual(resolvePersonEmail(cleared), { value: '', source: 'work' });
    assert.deepEqual(serializePersonContactEdits(personWithDifferentContacts, null, '', false, true), { workEmail: '' });
  });
});

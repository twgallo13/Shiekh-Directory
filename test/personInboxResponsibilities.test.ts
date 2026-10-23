import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Account } from '../server/authAuthority';
import { validateMetadataWrites, type DirectoryWrite } from '../server/firestoreDirectory';
import type { LocationRecord, PersonRecord } from '../src/types';
import { personInboxResponsibilities, sharedPersonEmailKind } from '../src/lib/personInboxResponsibilities';
import { serializePersonContactEdits } from '../src/lib/personContacts';

const actor: Account = { uid: 'admin', email: 'admin@example.test', emailVerified: true, name: 'Admin', role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
const person: PersonRecord = { id: 'p', fullName: 'Synthetic Manager', status: 'Active', activeStatus: true };
const location = (id: string, extra: Record<string, unknown> = {}) => ({ id, storeNumber: '007', name: 'Synthetic Store', type: 'Enclosed Mall', recordStatus: 'Active', locationInboxEmail: 'store7@shiekhshoes.com', ...extra } as LocationRecord);

test('inbox responsibility uses canonical SM/AM assignments, never title, email, workplace or support', () => {
  const locations = [location('sm', { storeManagerId: 'p' }), location('am', { assistantStoreManagerIds: ['p', 'p'] }), location('both', { storeManagerId: 'p', assistantStoreManagerIds: ['p'] }), location('workplace'), location('dm', { districtManagerId: 'p' })];
  const rows = personInboxResponsibilities({ ...person, jobTitle: 'DM', workEmail: 'store7@shiekhshoes.com', primaryLocationId: 'workplace', supportedLocationIds: ['dm'] }, locations);
  assert.deepEqual(rows.map(r => [r.location.id, r.roles]), [['am', ['Assistant Manager']], ['both', ['Store Manager', 'Assistant Manager']], ['sm', ['Store Manager']]]);
  assert(rows.every(r => r.location.storeNumber === '007' && r.inbox === 'store7@shiekhshoes.com'));
  assert.equal(personInboxResponsibilities({ ...person, id: 'other' }, locations).length, 0);
  // Transfer/vacancy is reflected by source references, not stale email or title.
  assert.equal(personInboxResponsibilities(person, [location('old', { storeManagerId: 'other', assistantStoreManagerIds: [] })]).length, 0);
});

test('shared inboxes do not merge people; missing, invalid, retired, unclassified and inactive states stay explicit', () => {
  const shared = location('shared', { storeManagerId: 'p', assistantStoreManagerIds: ['other'] });
  assert.equal(personInboxResponsibilities(person, [shared]).length, 1);
  assert.equal(personInboxResponsibilities({ ...person, id: 'other' }, [shared]).length, 1);
  for (const [value, expected] of [[null, 'No store inbox recorded'], ['bad', 'Saved inbox needs review']] as const) {
    const row = personInboxResponsibilities(person, [location('missing', { storeManagerId: 'p', locationInboxEmail: value })])[0];
    assert.equal(row.inbox, null); assert(row.issues.includes(expected));
  }
  const row = personInboxResponsibilities({ ...person, status: 'Inactive', activeStatus: false }, [location('retired', { storeManagerId: 'p', recordStatus: 'Retired', type: 'Other Company Location' })])[0];
  assert(row.issues.includes('Retired Location — review assignment'));
  assert(row.issues.includes('Inactive Person — review assignment'));
  assert(row.issues.some(i => i.includes('Non-retail')));
});

test('shared contact classification is case-insensitive and respects missing data without guessing aliases or IDs', () => {
  assert.equal(sharedPersonEmailKind(' STORE007@SHIEKHSHOES.COM ', []), 'conventional');
  assert.equal(sharedPersonEmailKind(' Team@EXAMPLE.test ', [{ locationInboxEmail: 'team@example.test' }]), 'saved_location');
  for (const value of ['', null, 'invalid', 'individual@shiekhshoes.com', 'store.operations@shiekhshoes.com']) assert.equal(sharedPersonEmailKind(value, []), null);
  assert.deepEqual(serializePersonContactEdits({ ...person, workEmail: 'store7@shiekhshoes.com' }, null, 'store7@shiekhshoes.com', false, false), {});
  assert.deepEqual(serializePersonContactEdits(person, null, '', false, true), { workEmail: '' });
});

test('server rejects new/changed shared Person contacts independently for canonical and compatibility fields', () => {
  for (const field of ['email', 'workEmail']) {
    for (const email of ['STORE007@SHIEKHSHOES.COM', 'team@example.test']) {
      const write: DirectoryWrite = { collection: 'people', id: 'p', operation: 'set', data: { fullName: person.fullName, [field]: email } };
      assert.throws(() => validateMetadataWrites([write], [undefined], [], actor, [], [location('shared', { locationInboxEmail: 'Team@example.test' }) as unknown as Record<string, unknown>]), /Shared store inboxes belong on Location/);
    }
  }
});

test('server preserves untouched legacy contacts, accepts optional clears and individual address alongside SM responsibility', () => {
  const current = { ...person, email: 'legacy@example.test', workEmail: 'store7@shiekhshoes.com', version: 0 };
  const sm = location('sm', { storeManagerId: 'p' });
  for (const data of [{ fullName: 'Renamed' }, { ...current, fullName: 'Renamed' }]) {
    const saved = validateMetadataWrites([{ collection: 'people', id: 'p', operation: 'set', expectedVersion: 0, data }], [current], [], actor, [current], [sm as unknown as Record<string, unknown>])[0].data!;
    assert.equal(saved.workEmail, current.workEmail); assert.equal(saved.email, current.email);
  }
  for (const workEmail of ['', 'individual@shiekhshoes.com']) {
    const saved = validateMetadataWrites([{ collection: 'people', id: 'p', operation: 'set', expectedVersion: 0, data: { workEmail } }], [current], [], actor, [current], [sm as unknown as Record<string, unknown>])[0].data!;
    assert.equal(saved.workEmail, workEmail); assert.equal(saved.email, current.email);
  }
});

test('same-transaction Location changes cannot launder old or proposed shared inboxes into a Person', () => {
  const old = { id: 'loc', version: 0, storeNumber: '007', locationInboxEmail: 'old-team@example.test' };
  for (const [nextInbox, workEmail] of [[null, 'old-team@example.test'], ['new-team@example.test', 'new-team@example.test']] as const) {
    const writes: DirectoryWrite[] = [
      { collection: 'people', id: 'p', operation: 'set', data: { fullName: person.fullName, workEmail } },
      { collection: 'locations', id: 'loc', operation: 'set', expectedVersion: 0, data: { storeNumber: '007', locationInboxEmail: nextInbox } },
    ];
    assert.throws(() => validateMetadataWrites(writes, [undefined, old], [], actor, [], [old]), /Shared store inboxes belong on Location/);
  }
  assert.throws(() => validateMetadataWrites([
    { collection: 'people', id: 'p', operation: 'set', data: { fullName: person.fullName, workEmail: old.locationInboxEmail } },
    { collection: 'locations', id: 'loc', operation: 'delete', expectedVersion: 0 },
  ], [undefined, old], [], actor, [], [old]), /Shared store inboxes belong on Location/);
});

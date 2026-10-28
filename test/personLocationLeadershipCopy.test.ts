import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileLocationLeadershipCopy } from '../src/lib/personLocationRelationships';
import type { LocationRecord, PersonRecord } from '../src/types';
import { DirectoryCommitError } from '../src/lib/directoryClient';

const baseLocation: LocationRecord = {
  id: 'loc-1', storeNumber: '01', name: 'Store One', type: 'Street / Standalone Location',
  address: '1 Main', city: 'LA', state: 'CA', zipCode: '90001', phone: '555-0100',
  timeZone: 'America/Los_Angeles', operationalStatus: 'Open — Normal Operations', recordStatus: 'Active',
  district: 'Legacy District Text', storeManagerId: 'person-1',
} as LocationRecord;

const person: PersonRecord = { id: 'person-1', fullName: 'Updated Name', status: 'Active', district: 'Some Territory Text' } as PersonRecord;

test('copies leadership name/phone fields but never writes district or canonical hierarchy references', () => {
  const updated = reconcileLocationLeadershipCopy(baseLocation, 'person-1', person, '555-0199', () => undefined, ['fullName', 'workPhone']);
  assert.equal(updated.storeManagerName, 'Updated Name');
  assert.equal(updated.storeManagerPhone, '555-0199');
  assert.equal(updated.district, 'Legacy District Text');
  assert.equal('districtId' in updated ? updated.districtId : undefined, baseLocation.districtId);
});

test('a territory-only Person edit does not touch the affected Location at all', () => {
  const updated = reconcileLocationLeadershipCopy(baseLocation, 'person-1', person, '555-0199', () => undefined, ['district']);
  assert.equal(updated, baseLocation);
  assert.equal(updated.district, 'Legacy District Text');
});

test('an unrelated Person is never copied onto a Location it does not lead', () => {
  const updated = reconcileLocationLeadershipCopy(baseLocation, 'person-2', person, '555-0199', () => undefined, ['fullName']);
  assert.equal(updated, baseLocation);
});

test('unrelated attribute edits on the correct person do not trigger a leadership copy', () => {
  const updated = reconcileLocationLeadershipCopy(baseLocation, 'person-1', person, '555-0199', () => undefined, ['email']);
  assert.equal(updated, baseLocation);
});

test('name-only legacy lists rebuild missing or misaligned copies without dropping members', () => {
  for (const field of ['assistantStoreManagerIds', 'keyHolderIds'] as const) for (const names of [undefined, ['Stale']]) {
    const namesField = field === 'assistantStoreManagerIds' ? 'assistantStoreManagerNames' : 'keyHolderNames';
    const source = { ...baseLocation, [field]: ['other', 'person-1'], ...(names ? { [namesField]: names } : {}) };
    const changed = reconcileLocationLeadershipCopy(source, 'person-1', person, '', id => id === 'other' ? 'Resolved Other' : undefined, ['fullName']);
    assert.deepEqual(changed[namesField], ['Resolved Other', 'Updated Name']);
    assert.deepEqual(changed[field], ['other', 'person-1']);
    assert.equal(source[namesField], names);
  }
});

test('an unresolved legacy member stops the rename with a known preflight error', () => {
  const source = { ...baseLocation, assistantStoreManagerIds: ['person-1', 'missing'] };
  assert.throws(() => reconcileLocationLeadershipCopy(source, 'person-1', person, '', () => undefined, ['fullName']), error => error instanceof DirectoryCommitError && error.code === 'invalid_metadata');
  assert.equal(source.storeManagerName, undefined);
});

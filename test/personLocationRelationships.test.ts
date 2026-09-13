import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PersonLocationRelationshipFields, reconcileSupportedLocationIds } from '../src/components/people/PersonLocationRelationshipFields';
import { buildPersonLocationRelationships, getPersonDeletionBlockers } from '../src/lib/personLocationRelationships';
import type { LocationRecord, PersonRecord, UserProfile } from '../src/types';

test('employment selector reconciliation removes duplicates and the primary Location', () => {
  assert.deepEqual(reconcileSupportedLocationIds('corp-1', ['store-1', 'corp-1', 'store-1', 'dc-1']), ['store-1', 'dc-1']);
  assert.deepEqual(reconcileSupportedLocationIds(undefined, ['store-1', 'store-1']), ['store-1']);
});

test('employment selectors include all non-retired company Location types and retain unavailable current references', () => {
  const locations = [
    { id: 'corp-1', storeNumber: 'HQ', name: 'Corporate Office', type: 'Corporate Office', recordStatus: 'Active' },
    { id: 'dc-1', storeNumber: 'DC-1', name: 'Distribution Center', type: 'Warehouse / Distribution Center', recordStatus: 'Active' },
    { id: 'store-1', storeNumber: '01', name: 'Retail Store', type: 'Mall / Shopping Center', recordStatus: 'Active' },
    { id: 'other-1', storeNumber: 'OTHER', name: 'Other Site', type: 'Other Company Location', recordStatus: 'Active' },
    { id: 'retired-1', storeNumber: '99', name: 'Retired Store', type: 'Street / Standalone Location', recordStatus: 'Retired' },
  ] as LocationRecord[];

  const html = renderToStaticMarkup(React.createElement(PersonLocationRelationshipFields, {
    locations,
    primaryLocationId: 'retired-1',
    supportedLocationIds: ['corp-1', 'missing-location'],
    onPrimaryLocationChange() {},
    onSupportedLocationIdsChange() {},
  }));

  for (const text of ['Works at', 'Supports', 'Corporate Office', 'Distribution Center', 'Retail Store', 'Other Site', 'Retired Store', 'missing-location', 'Unavailable']) {
    assert.ok(html.includes(text), text);
  }
  assert.equal(html.includes('value="retired-1" selected=""'), true);
});

test('Person Locations groups one Location row with every employment and leadership label', () => {
  const person = { id: 'per-arturo', fullName: 'Arturo', primaryLocationId: 'loc-29', supportedLocationIds: ['loc-29', 'missing-location'] } as PersonRecord;
  const locations = [{
    id: 'loc-29',
    storeNumber: '29',
    name: 'Moreno Valley Mall',
    type: 'Mall / Shopping Center',
    recordStatus: 'Active',
    assistantStoreManagerIds: ['per-arturo'],
    keyHolderIds: ['per-arturo'],
  }] as unknown as LocationRecord[];

  const rows = buildPersonLocationRelationships(person, locations);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    locationId: 'loc-29',
    location: locations[0],
    labels: ['Primary workplace', 'Supports', 'Assistant Manager', 'Key Holder'],
    unavailable: false,
  });
  assert.deepEqual(rows[1], {
    locationId: 'missing-location',
    labels: ['Supports'],
    unavailable: true,
  });
});

test('Person deletion blockers include leadership Locations and linked users but not employment-only relationships', () => {
  const person = { id: 'per-1', fullName: 'Employee', primaryLocationId: 'loc-work', supportedLocationIds: ['loc-support'] } as PersonRecord;
  const locations = [
    { id: 'loc-work', storeNumber: '01', name: 'Workplace', type: 'Corporate Office', recordStatus: 'Active' },
    { id: 'loc-support', storeNumber: '02', name: 'Support Site', type: 'Other Company Location', recordStatus: 'Active' },
    { id: 'loc-lead', storeNumber: '29', name: 'Leadership Store', type: 'Mall / Shopping Center', recordStatus: 'Active', storeManagerId: 'per-1' },
  ] as LocationRecord[];
  const users = [{ id: 'usr-1', name: 'Employee Login', email: 'employee@example.test', personId: 'per-1' }] as UserProfile[];

  const blockers = getPersonDeletionBlockers(person, locations, users);
  assert.deepEqual(blockers.locations.map(row => [row.locationId, row.labels]), [['loc-lead', ['Store Manager']]]);
  assert.deepEqual(blockers.users.map(user => user.id), ['usr-1']);
});

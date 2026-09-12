import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PersonLocationRelationshipFields, reconcileSupportedLocationIds } from '../src/components/people/PersonLocationRelationshipFields';
import type { LocationRecord } from '../src/types';

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

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  beginDistrictEdit,
  beginRegionEdit,
  discardRegistryDraft,
  reapplyRegistryDraft,
  registryEditRecord,
  reviewRegistryConflict,
} from '../src/lib/hierarchyRegistryEditing';
import { buildRegistryWrite, fetchHierarchyRegistry } from '../src/lib/directoryClient';

describe('hierarchy registry edit sessions', () => {
  it('preserves a draft and its opening version while reviewing a conflict', () => {
    const editing = { ...beginRegionEdit({ id: 'west', name: 'West', status: 'Active', version: 2 }), name: 'Western' };
    const reviewing = reviewRegistryConflict(editing, { id: 'west', name: 'West Coast', status: 'Active', version: 3 });

    assert.equal(reviewing.name, 'Western');
    assert.equal(reviewing.expectedVersion, 2);
    assert.equal(reviewing.original.name, 'West');
    assert.equal(reviewing.review?.latest?.name, 'West Coast');
  });

  it('requires an explicit choice to discard or reapply a District draft', () => {
    const editing = {
      ...beginDistrictEdit({ id: '01', name: 'District One', regionId: 'west', status: 'Active', version: 4 }),
      name: 'One North',
      regionId: 'north',
    };
    const reviewing = reviewRegistryConflict(editing, { id: '01', name: 'District 1', regionId: 'west', status: 'Active', version: 5 });
    const discarded = discardRegistryDraft(reviewing);
    const reapplied = reapplyRegistryDraft(reviewing);

    assert.deepEqual(discarded && registryEditRecord(discarded), { id: '01', name: 'District 1', regionId: 'west', status: 'Active', version: 5 });
    assert.deepEqual(reapplied && registryEditRecord(reapplied), { id: '01', name: 'One North', regionId: 'north', status: 'Active', version: 5 });
    assert.equal(reapplied?.expectedVersion, 5);
  });

  it('preserves legacy version 0 and prevents unavailable records from being rebased into creates', () => {
    const editing = beginRegionEdit({ id: 'legacy', name: 'Legacy Region', status: 'Active' });
    const unavailable = reviewRegistryConflict({ ...editing, name: 'Draft Name' }, null);

    assert.equal(editing.expectedVersion, 0);
    assert.equal(unavailable.name, 'Draft Name');
    assert.equal(discardRegistryDraft(unavailable), null);
    assert.equal(reapplyRegistryDraft(unavailable), null);
  });

  it('keeps create-only and exact expected-version write intents distinct', () => {
    const record = { id: 'legacy', name: 'Legacy Region', status: 'Active' as const };

    assert.equal(buildRegistryWrite('regions', record, { create: true }).expectedVersion, null);
    assert.equal(buildRegistryWrite('regions', record, { create: false, expectedVersion: 0 }).expectedVersion, 0);
  });

  it('refreshes hierarchy records through the authorized read-only bootstrap endpoint', async () => {
    let requestInput: string | URL | Request = '';
    let requestInit: RequestInit | undefined;
    const request = async (input: string | URL | Request, init?: RequestInit) => {
      requestInput = input;
      requestInit = init;
      return Response.json({
        regions: [{ id: 'west', name: 'West', status: 'Active', version: 3 }],
        districts: [{ id: '01', name: 'District One', regionId: 'west', status: 'Active', version: 4 }],
      });
    };

    const registry = await fetchHierarchyRegistry({ uid: 'admin', getIdToken: async () => 'test-token' }, request);

    assert.equal(requestInput, '/api/auth/bootstrap');
    assert.equal(requestInit?.method, undefined);
    assert.deepEqual(requestInit?.headers, { Authorization: 'Bearer test-token' });
    assert.equal(registry.districts[0].id, '01');
  });
});
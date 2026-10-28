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
import { requiresManagedHierarchyReview } from '../src/lib/managedHierarchyEditing';

describe('hierarchy registry edit sessions', () => {
  it('keeps managed and unknown future parent edits out of generic metadata saves', () => {
    for (const model of [1, 2, null, undefined]) {
      const record = { id: '01', name: 'Central', regionId: 'west', status: 'Active' as const, version: 3, leadershipModelVersion: model };
      assert.equal(requiresManagedHierarchyReview(record), true);
      const draft = { ...beginDistrictEdit(record), name: 'Central Coast' };
      assert.equal(registryEditRecord(draft).name, 'Central Coast');
      assert.throws(() => registryEditRecord({ ...draft, regionId: 'east' }), /reviewed District move/);
    }
    assert.equal(requiresManagedHierarchyReview({ id: 'legacy' }), false);
  });

  it('does not replay a legacy parent draft after the District becomes managed', () => {
    const draft = { ...beginDistrictEdit({ id: '01', name: 'Central', regionId: 'west', status: 'Active', version: 1 }), name: 'Draft name', regionId: 'east' };
    const latest = { ...draft.original, version: 2, leadershipModelVersion: 1 };
    const review = reviewRegistryConflict(draft, latest), reapplied = reapplyRegistryDraft(review)!;
    assert(reapplied.kind === 'district');
    assert.throws(() => registryEditRecord(reapplied), /reviewed District move/);
    assert.equal(reapplied.name, 'Draft name');
    assert.equal(registryEditRecord({ ...reapplied, regionId: 'west' }).name, 'Draft name');
  });
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
        districts: [
          { id: '01', name: 'District One', regionId: 'west', status: 'Active', version: 4, districtManagerId: 'dm-1' },
          { id: '02', name: 'Vacant District', regionId: 'west', status: 'Active', districtManagerId: null },
          { id: '03', name: 'Legacy District', regionId: 'west', status: 'Active' },
        ],
      });
    };

    const registry = await fetchHierarchyRegistry({ uid: 'admin', getIdToken: async () => 'test-token' }, request);

    assert.equal(requestInput, '/api/auth/bootstrap');
    assert.equal(requestInit?.method, undefined);
    assert.deepEqual(requestInit?.headers, { Authorization: 'Bearer test-token' });
    assert.equal(registry.districts[0].id, '01');
    assert.equal(registry.districts[0].districtManagerId, 'dm-1');
    assert.equal(registry.districts[1].districtManagerId, null);
    assert.equal(Object.hasOwn(registry.districts[2], 'districtManagerId'), false);
  });
});

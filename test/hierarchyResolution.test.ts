import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hierarchyDistrictLabel, resolveLocationHierarchy } from '../src/lib/hierarchyResolution';

const activeDistrict = { id: '01', name: 'District One', regionId: 'west', status: 'Active' as const };

describe('hierarchy display resolution', () => {
  it('shows an active District under a retired Region as unavailable', () => {
    const hierarchy = resolveLocationHierarchy(
      { regionId: 'west', districtId: '01' },
      { regions: [{ id: 'west', name: 'West', status: 'Retired' }], districts: [activeDistrict] },
    );

    assert.equal(hierarchy.regionName, 'West');
    assert.equal(hierarchy.districtName, 'District One');
    assert.match(hierarchyDistrictLabel(hierarchy), /Region west is retired/);
  });

  it('shows a resolved District with a missing Region', () => {
    const hierarchy = resolveLocationHierarchy(
      { regionId: 'west', districtId: '01' },
      { regions: [], districts: [activeDistrict] },
    );

    assert.equal(hierarchy.districtName, 'District One');
    assert.match(hierarchyDistrictLabel(hierarchy), /Region west is missing/);
  });

  it('shows every issue when a District parent differs from the Location Region', () => {
    const hierarchy = resolveLocationHierarchy(
      { regionId: 'missing-region', districtId: '01' },
      { regions: [], districts: [activeDistrict] },
    );
    const label = hierarchyDistrictLabel(hierarchy);

    assert.match(label, /Region missing-region is missing/);
    assert.match(label, /District 01 belongs to Region west, not missing-region/);
    assert.equal(hierarchy.hierarchyStatus, 'parent-mismatch');
  });

  it('distinguishes unassigned and unresolved Districts without legacy fallback', () => {
    assert.equal(hierarchyDistrictLabel(resolveLocationHierarchy({}, { regions: [], districts: [] })), 'Unassigned District');
    assert.match(
      hierarchyDistrictLabel(resolveLocationHierarchy({ districtId: 'missing' }, { regions: [], districts: [] })),
      /^Unresolved District \(missing\).*District missing is missing/,
    );
  });
});
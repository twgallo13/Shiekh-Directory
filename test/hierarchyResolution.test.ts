import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canSelectNotApplicableHierarchy, hierarchyDistrictLabel, hierarchyGroupId, hierarchyGroupLabel, isRetailHierarchyType, resolveHierarchyApplicability, resolveHierarchyGroupKey, resolveLocationHierarchy, applyLocationRegionSelection, applyLocationDistrictSelection, applyQuickAddRegionSelection, applyQuickAddDistrictSelection } from '../src/lib/hierarchyResolution';

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
    assert.equal(
      hierarchyDistrictLabel(resolveLocationHierarchy({ type: 'Enclosed Mall' }, { regions: [], districts: [] }), true),
      'Unassigned District',
    );
    assert.equal(
      hierarchyDistrictLabel(resolveLocationHierarchy({}, { regions: [], districts: [] }), false),
      'No retail district',
    );
    assert.match(
      hierarchyDistrictLabel(resolveLocationHierarchy({ districtId: 'missing' }, { regions: [], districts: [] })),
      /^Unresolved District \(missing\).*District missing is missing/,
    );
  });

  it('derives effective applicability without hiding saved inconsistencies', () => {
    assert.deepEqual(resolveHierarchyApplicability({ type: 'Enclosed Mall' }), { value: 'Applicable', issues: [] });
    assert.deepEqual(resolveHierarchyApplicability({ type: 'Warehouse / Distribution Center' }), { value: 'Not Applicable', issues: [] });
    assert.deepEqual(resolveHierarchyApplicability({ type: 'Warehouse / Distribution Center', districtId: '01' }), { value: 'Applicable', issues: [] });
    assert.deepEqual(resolveHierarchyApplicability({ type: 'Enclosed Mall', hierarchyApplicability: 'Unknown' }), { value: 'Unknown', issues: [] });
    assert.match(resolveHierarchyApplicability({ type: 'Enclosed Mall', hierarchyApplicability: 'Not Applicable' }).issues.join(' '), /Retail/);
    assert.match(resolveHierarchyApplicability({ hierarchyApplicability: 'invalid' }).issues.join(' '), /Unsupported/);
  });

  it('shared Quick Add/Location Edit control restriction matches the retail applicability contract', () => {
    for (const type of ['Enclosed Mall', 'Strip Center / Shopping Center', 'Street / Standalone Location']) {
      assert.equal(isRetailHierarchyType(type), true);
      assert.equal(canSelectNotApplicableHierarchy(type), false);
    }
    for (const type of ['Warehouse / Distribution Center', 'Other Company Location', 'Corporate Office', undefined]) {
      assert.equal(isRetailHierarchyType(type), false);
      assert.equal(canSelectNotApplicableHierarchy(type), true);
    }
  });

  it('separates business type from hierarchy applicability when grouping and labeling (reproduced cases)', () => {
    const activeRegistry = { regions: [{ id: 'reg-west', name: 'West', status: 'Active' as const }], districts: [] };

    // Warehouse / Distribution Center with a valid Region and no District: non-retail, incomplete assignment, never a retail store.
    const dcWithRegion = resolveLocationHierarchy({ type: 'Warehouse / Distribution Center', regionId: 'reg-west' }, activeRegistry);
    const dcKey = resolveHierarchyGroupKey(dcWithRegion, isRetailHierarchyType('Warehouse / Distribution Center'));
    assert.deepEqual(dcKey, { kind: 'needs-review' });
    assert.match(hierarchyDistrictLabel(dcWithRegion, false), /^Needs Review/);

    // Enclosed Mall with explicit Unknown applicability: remains a retail Location, in a separate Needs Review state.
    const mallUnknown = resolveLocationHierarchy({ type: 'Enclosed Mall', hierarchyApplicability: 'Unknown' }, activeRegistry);
    const mallKey = resolveHierarchyGroupKey(mallUnknown, isRetailHierarchyType('Enclosed Mall'));
    assert.deepEqual(mallKey, { kind: 'needs-review' });
    assert.equal(isRetailHierarchyType('Enclosed Mall'), true);
    assert.match(hierarchyDistrictLabel(mallUnknown, true), /^Needs Review - Hierarchy applicability is Unknown\./);

    // Warehouse / Distribution Center explicit Not Applicable with no references: healthy center, "No retail district".
    const dcCenter = resolveLocationHierarchy({ type: 'Warehouse / Distribution Center', hierarchyApplicability: 'Not Applicable' }, activeRegistry);
    const dcCenterKey = resolveHierarchyGroupKey(dcCenter, isRetailHierarchyType('Warehouse / Distribution Center'));
    assert.deepEqual(dcCenterKey, { kind: 'operational-centers' });
    assert.equal(hierarchyDistrictLabel(dcCenter, false), 'No retail district');
  });

  it('a District group heading never borrows a single member\'s warning; only per-row diagnostics carry it', () => {
    const registry = { regions: [{ id: 'reg-west', name: 'West', status: 'Retired' as const }], districts: [{ id: '01', name: 'District One', regionId: 'reg-west', status: 'Active' as const }] };
    const healthyMember = resolveLocationHierarchy({ type: 'Enclosed Mall', regionId: 'reg-west', districtId: '01' }, registry);
    const key = resolveHierarchyGroupKey(healthyMember, true);
    assert.deepEqual(key, { kind: 'district', districtId: '01' });
    // The group heading uses only the shared registry name/ID, never a member's hierarchyIssues/applicabilityIssues.
    assert.equal(hierarchyGroupLabel(key, healthyMember), 'District One (01)');
    // The same member's row-level diagnostic remains available for per-row display.
    assert.ok(healthyMember.hierarchyIssues.length > 0);
  });

  it('a selected District ID group remains selected after the District is renamed', () => {
    const before = { regions: [{ id: 'reg-west', name: 'West', status: 'Active' as const }], districts: [{ id: '01', name: 'District One', regionId: 'reg-west', status: 'Active' as const }] };
    const after = { regions: before.regions, districts: [{ ...before.districts[0], name: 'District One Renamed' }] };
    const location = { type: 'Enclosed Mall', regionId: 'reg-west', districtId: '01' };
    const keyBefore = resolveHierarchyGroupKey(resolveLocationHierarchy(location, before), true);
    const keyAfter = resolveHierarchyGroupKey(resolveLocationHierarchy(location, after), true);
    assert.equal(hierarchyGroupId(keyBefore), hierarchyGroupId(keyAfter));
    assert.equal(hierarchyGroupLabel(keyBefore, resolveLocationHierarchy(location, before)), 'District One (01)');
    assert.equal(hierarchyGroupLabel(keyAfter, resolveLocationHierarchy(location, after)), 'District One Renamed (01)');
  });

  it('mixed retail/non-retail/Unknown Locations produce correct type-based counts and distinct groups', () => {
    const registry = { regions: [{ id: 'reg-west', name: 'West', status: 'Active' as const }], districts: [{ id: '01', name: 'District One', regionId: 'reg-west', status: 'Active' as const }] };
    const fixture = [
      { type: 'Enclosed Mall', regionId: 'reg-west', districtId: '01' }, // retail, resolved district
      { type: 'Enclosed Mall' }, // retail, unassigned-retail
      { type: 'Enclosed Mall', hierarchyApplicability: 'Unknown' as const }, // retail, needs-review
      { type: 'Warehouse / Distribution Center', hierarchyApplicability: 'Not Applicable' as const }, // non-retail, operational-centers
      { type: 'Warehouse / Distribution Center', regionId: 'reg-west' }, // non-retail, incomplete assignment, needs-review
    ];
    const retailCount = fixture.filter(location => isRetailHierarchyType(location.type)).length;
    assert.equal(retailCount, 3);
    assert.equal(fixture.length - retailCount, 2);

    const groupCounts = fixture.reduce((totals, location) => {
      const key = resolveHierarchyGroupKey(resolveLocationHierarchy(location, registry), isRetailHierarchyType(location.type));
      const id = hierarchyGroupId(key);
      totals[id] = (totals[id] || 0) + 1;
      return totals;
    }, {} as Record<string, number>);
    assert.deepEqual(groupCounts, { 'district:01': 1, 'unassigned-retail': 1, 'needs-review': 2, 'operational-centers': 1 });
  });

  it('Region selection clears the prior District and non-empty selections become explicitly Applicable', () => {
    const withDistrict = { regionId: 'reg-west', districtId: '01', hierarchyApplicability: 'Applicable' as const };
    const regionCleared = applyLocationRegionSelection(withDistrict, '');
    assert.equal(regionCleared.regionId, undefined);
    assert.equal(regionCleared.districtId, undefined);
    assert.equal(regionCleared.hierarchyApplicability, 'Applicable'); // unrelated field preserved, not silently reset

    const regionChanged = applyLocationRegionSelection(withDistrict, 'reg-east');
    assert.equal(regionChanged.regionId, 'reg-east');
    assert.equal(regionChanged.districtId, undefined); // Region change always clears the prior District
    assert.equal(regionChanged.hierarchyApplicability, 'Applicable');

    const districtChanged = applyLocationDistrictSelection({ regionId: 'reg-west' } as { regionId?: string; districtId?: string; hierarchyApplicability?: 'Applicable' | 'Not Applicable' | 'Unknown' }, '02');
    assert.equal(districtChanged.districtId, '02');
    assert.equal(districtChanged.hierarchyApplicability, 'Applicable');
  });

  it('Quick Add Region/District selection mirrors Location Edit semantics using its required-string draft shape', () => {
    const draft = { regionId: 'reg-west', districtId: '01', hierarchyApplicability: '' as const };
    const afterRegion = applyQuickAddRegionSelection(draft, 'reg-east');
    assert.equal(afterRegion.districtId, ''); // Region change clears the prior District
    assert.equal(afterRegion.hierarchyApplicability, 'Applicable');

    const afterDistrict = applyQuickAddDistrictSelection({ regionId: 'reg-west', districtId: '', hierarchyApplicability: '' as const }, '02');
    assert.equal(afterDistrict.districtId, '02');
    assert.equal(afterDistrict.hierarchyApplicability, 'Applicable');
  });

  it('selecting Not Applicable never erases an existing Region/District reference', () => {
    // Matches the LocationEditModal/Quick Add applicability <select>, which only ever assigns
    // hierarchyApplicability and never touches regionId/districtId.
    const withReferences = { regionId: 'reg-west', districtId: '01', hierarchyApplicability: 'Applicable' as const };
    const afterNotApplicable = { ...withReferences, hierarchyApplicability: 'Not Applicable' as const };
    assert.equal(afterNotApplicable.regionId, 'reg-west');
    assert.equal(afterNotApplicable.districtId, '01');
    // The resulting inconsistency remains visible rather than silently resolved.
    const registry = { regions: [{ id: 'reg-west', name: 'West', status: 'Active' as const }], districts: [{ id: '01', name: 'District One', regionId: 'reg-west', status: 'Active' as const }] };
    const hierarchy = resolveLocationHierarchy(afterNotApplicable, registry);
    assert.match(hierarchy.applicabilityIssues.join(' '), /retains canonical hierarchy references/);
  });
});
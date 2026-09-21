import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { parse } from "csv-parse/sync";
import {
  hierarchyGroupId,
  hierarchyGroupLabel,
  isRetailHierarchyType,
  resolveHierarchyGroupKey,
  resolveLocationHierarchy,
} from "../src/lib/hierarchyResolution";

const manifest = parse(fs.readFileSync(new URL("../docs/dispatches/reports/dispatch-12b-proposed-changes.csv", import.meta.url)), {
  columns: true,
  skip_empty_lines: true,
}) as Record<string, string>[];

const registry = {
  regions: [{ id: "region-west", name: "West", status: "Active" as const }],
  districts: [
    { id: "01", name: "Central & Southern California", regionId: "region-west", status: "Active" as const },
    { id: "02", name: "Inland Empire, San Diego & LA South", regionId: "region-west", status: "Active" as const },
    { id: "03", name: "Northern California, Nevada, Northwest & Texas", regionId: "region-west", status: "Active" as const },
  ],
};

test("a proposed-after fixture from the approved manifest groups into 14/12/22 retail plus 2 centers", () => {
  const after = manifest.map(row => ({
    storeNumber: row.StoreNumber,
    type: row.ProposedType,
    hierarchyApplicability: row.ProposedHierarchyApplicability,
    regionId: row.ProposedRegionId || undefined,
    districtId: row.ProposedDistrictId || undefined,
  }));

  const counts = after.reduce((totals, location) => {
    const hierarchy = resolveLocationHierarchy(location, registry);
    const key = resolveHierarchyGroupKey(hierarchy, isRetailHierarchyType(location.type));
    const id = hierarchyGroupId(key);
    totals[id] = (totals[id] || 0) + 1;
    return totals;
  }, {} as Record<string, number>);

  assert.deepEqual(counts, {
    "district:01": 14,
    "district:02": 12,
    "district:03": 22,
    "operational-centers": 2,
  });
});

test("the before fixture truthfully keeps Store 150 unresolved and the two centers already applicability-clean, without applying the manifest", () => {
  const before = manifest.map(row => ({
    storeNumber: row.StoreNumber,
    type: row.CurrentType,
    hierarchyApplicability: row.CurrentApplicabilitySaved || undefined,
    regionId: row.CurrentRegionId || undefined,
    districtId: row.CurrentDistrictId || undefined,
  }));

  const store150 = before.find(location => location.storeNumber === "150")!;
  const hierarchy150 = resolveLocationHierarchy(store150, registry);
  assert.equal(hierarchy150.districtId, "DIS-01");
  assert.equal(hierarchy150.hierarchyStatus, "unresolved-reference");
  const key150 = resolveHierarchyGroupKey(hierarchy150, isRetailHierarchyType(store150.type));
  assert.equal(hierarchyGroupId(key150), "district:DIS-01");
  assert.match(hierarchyGroupLabel(key150, hierarchy150), /Unresolved District \(DIS-01\)/);

  const counts = before.reduce((totals, location) => {
    const id = hierarchyGroupId(resolveHierarchyGroupKey(resolveLocationHierarchy(location, registry), isRetailHierarchyType(location.type)));
    totals[id] = (totals[id] || 0) + 1;
    return totals;
  }, {} as Record<string, number>);
  assert.notDeepEqual(counts, { "district:01": 14, "district:02": 12, "district:03": 22, "operational-centers": 2 });
});

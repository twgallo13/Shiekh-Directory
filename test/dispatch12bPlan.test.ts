import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { parse } from "csv-parse/sync";

const manifest = parse(fs.readFileSync(new URL("../docs/dispatches/reports/dispatch-12b-proposed-changes.csv", import.meta.url)), {
  columns: true,
  skip_empty_lines: true,
}) as Record<string, string>[];

test("Dispatch 12B manifest preserves raw before-values, actual diffs, and fixed batches", () => {
  assert.equal(manifest.length, 50);
  assert.equal(new Set(manifest.map(row => row.LocationId)).size, 50);
  assert.deepEqual(manifest.reduce((counts, row) => {
    counts[row.ProposedDistrictId || "center"] = (counts[row.ProposedDistrictId || "center"] || 0) + 1;
    return counts;
  }, {} as Record<string, number>), { "01": 14, "02": 12, "03": 22, center: 2 });

  const store150 = manifest.find(row => row.StoreNumber === "150")!;
  assert.equal(store150.CurrentApplicabilityPresence, "true");
  assert.equal(store150.CurrentApplicabilitySaved, "Applicable");
  assert.equal(store150.CurrentRegionId, "region-west");
  assert.equal(store150.ChangedFields, "districtId");
  assert.equal(store150.CurrentDistrictId, "DIS-01");
  assert.equal(store150.ProposedDistrictId, "02");

  const missingSavedApplicability = manifest.filter(row => row.CurrentApplicabilityPresence === "false");
  assert.equal(missingSavedApplicability.length, 49);
  assert.ok(missingSavedApplicability.every(row => row.CurrentApplicabilitySaved === ""));
  assert.equal(manifest.filter(row => row.BatchId === "B1").length, 40);
  assert.equal(manifest.filter(row => row.BatchId === "B2").length, 10);
  const b1 = manifest.filter(row => row.BatchId === "B1").map(row => row.LocationId);
  assert.deepEqual(b1, [...b1].sort());
  const b2 = manifest.filter(row => row.BatchId === "B2");
  assert.deepEqual(b2.slice(-2).map(row => row.LocationId), ["loc-86", "loc-d4c2f939-bcd5-4263-bdc8-e7f293afe84a"]);
});

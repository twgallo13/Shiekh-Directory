import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildHierarchyReconciliationReport,
  collectHierarchyReconciliationIssues,
  type HierarchyRegistry,
  validateLocationHierarchyFields,
  validateUserPersonLink,
} from "../src/lib/hierarchyAssignmentContract";
import { validateMetadataWrites, DirectoryValidationError, DirectoryConflict } from "../server/firestoreDirectory";

const testRegistry: HierarchyRegistry = {
  regions: [
    { id: "reg-west", name: "West Region" },
    { id: "reg-east", name: "East Region" },
  ],
  districts: [
    { id: "dist-01", name: "District 1", regionId: "reg-west" },
    { id: "dist-03", name: "District 3", regionId: "reg-east" },
  ],
};

describe("hierarchy assignment contract", () => {
  it("allows non-retail locations to have optional controlled hierarchy assignments", () => {
    const result = validateLocationHierarchyFields({
      type: "Corporate Office",
      hierarchyApplicability: "Applicable",
      districtId: "dist-01",
      regionId: "reg-west",
    }, testRegistry);

    assert.equal(result.length, 0);
  });

  it("rejects mismatched district and region relationships", () => {
    const result = validateLocationHierarchyFields({
      type: "Street / Standalone Location",
      hierarchyApplicability: "Applicable",
      districtId: "dist-03", // belongs to reg-east
      regionId: "reg-west", // mismatch!
    }, testRegistry);

    assert.ok(result.some(issue => issue.includes("does not match")));
  });

  it("rejects retail locations marked as Not Applicable", () => {
    const result = validateLocationHierarchyFields({
      type: "Street / Standalone Location",
      hierarchyApplicability: "Not Applicable",
    });

    assert.ok(result.some(issue => issue.includes("retail location") && issue.includes("Not Applicable")));
  });

  it("blocks new canonical hierarchy assignments when no authoritative registry is supplied", () => {
    const result = validateLocationHierarchyFields({
      type: "Street / Standalone Location",
      hierarchyApplicability: "Applicable",
      districtId: "dist-01",
      regionId: "reg-west",
    });

    assert.ok(result.some(issue => issue.includes("approved Region/District roster")));
  });

  it("rejects duplicate assignment ids within the same leadership arrays", () => {
    const result = validateLocationHierarchyFields({
      type: "Street / Standalone Location",
      hierarchyApplicability: "Applicable",
      assistantStoreManagerIds: ["person-1", "person-1"],
      keyHolderIds: ["person-2", "person-3", "person-2"],
    });

    assert.ok(result.some(issue => issue.includes("duplicate")));
  });

  it("flags missing person references and stale copied leadership values in reconciliation", () => {
    const issues = collectHierarchyReconciliationIssues(
      [
        {
          id: "loc-1",
          storeNumber: "07",
          name: "Test Store",
          type: "Street / Standalone Location",
          district: "Legacy District",
          storeManagerId: "person-missing",
          assistantStoreManagerIds: ["person-1", "person-1"],
          districtManagerId: "person-missing-dm",
        },
      ],
      [
        { id: "person-1", fullName: "Existing Person", status: "Active" },
      ],
    );

    assert.ok(issues.some(issue => issue.kind === "missing-person-reference"));
    assert.ok(issues.some(issue => issue.kind === "duplicate-assignment"));
    assert.ok(issues.some(issue => issue.kind === "stale-copied-relationship"));
  });

  it("validates user-to-person links handling optional links, missing targets, duplicates, and activeStatus: false", () => {
    // Optional links pass cleanly
    assert.doesNotThrow(() => validateUserPersonLink(undefined, []));
    assert.doesNotThrow(() => validateUserPersonLink("", []));
    assert.doesNotThrow(() => validateUserPersonLink(null, []));

    // Missing person throws
    assert.throws(() => {
      validateUserPersonLink("missing-person", [
        { id: "person-1", fullName: "Active Person", status: "Active" },
      ]);
    });

    // Inactive status throws
    assert.throws(() => {
      validateUserPersonLink("person-1", [
        { id: "person-1", fullName: "Inactive Person", status: "Inactive" },
      ]);
    });

    // activeStatus: false throws
    assert.throws(() => {
      validateUserPersonLink("person-1", [
        { id: "person-1", fullName: "Inactive Person", activeStatus: false },
      ]);
    });

    // Duplicate Person records for same ID throws
    assert.throws(() => {
      validateUserPersonLink("person-dup", [
        { id: "person-dup", fullName: "Dup Person 1", status: "Active" },
        { id: "person-dup", fullName: "Dup Person 2", status: "Active" },
      ]);
    });
  });

  it("builds a read-only reconciliation report with all expanded counts", () => {
    const report = buildHierarchyReconciliationReport(
      [
        {
          id: "loc-1",
          storeNumber: "07",
          name: "Test Store",
          type: "Street / Standalone Location",
          district: "Legacy District",
          regionId: "reg-west",
          districtId: "dist-03", // mismatch
          storeManagerId: "person-missing",
          assistantStoreManagerIds: ["person-1", "person-1"],
          districtManagerId: "person-missing-dm",
        },
        {
          id: "loc-2",
          storeNumber: "07", // duplicate store number!
          name: "Test Store 2",
          type: "Street / Standalone Location",
        },
      ],
      [
        { id: "person-1", fullName: "Existing Person", status: "Active", assignedLocations: ["missing-loc-99"] },
      ],
      [{ userId: "user-1", personId: "person-missing" }],
      testRegistry,
    );

    assert.equal(report.source, "read-only hierarchy reconciliation report");
    assert.equal(report.counts.totalLocations, 2);
    assert.ok(report.counts.missingPersonReferences >= 2);
    assert.ok(report.counts.duplicateAssignments >= 1);
    assert.ok(report.counts.invalidHierarchyReferences >= 1);
    assert.ok(report.counts.duplicateIdentities >= 1);
    assert.ok(report.counts.reverseAssignmentMismatches >= 1);
    assert.ok(report.counts.invalidUserLinks >= 1);
  });

  it("validates combined transactions, concurrency control, and omitted field preservation at server boundary", () => {
    const actor = {
      uid: "actor-1",
      email: "admin@example.com",
      emailVerified: true,
      name: "Admin",
      role: "System Administrator",
      status: "Active",
      accessScope: "Company",
      personId: null,
      authenticationMethod: "password",
    } as const;

    // 1. Combined transaction: create person and assign in same write batch
    const combinedWrites = validateMetadataWrites(
      [
        {
          collection: "people",
          id: "p-new",
          operation: "set",
          data: { fullName: "New Manager", status: "Active" },
        },
        {
          collection: "locations",
          id: "loc-1",
          operation: "set",
          data: {
            storeNumber: "07",
            name: "Test Store",
            type: "Street / Standalone Location",
            storeManagerId: "p-new",
          },
        },
      ],
      [undefined, undefined],
      [],
      actor,
      [],
    );
    assert.equal(combinedWrites.length, 2);

    // 2. Concurrency conflict check
    assert.throws(() => {
      validateMetadataWrites(
        [{
          collection: "locations",
          id: "loc-1",
          operation: "set",
          expectedVersion: 1,
          data: { storeNumber: "07", name: "Updated Name" },
        }],
        [{ id: "loc-1", storeNumber: "07", version: 2 }],
        [],
        actor,
        [],
      );
    }, DirectoryConflict);

    // 3. Preserving omitted canonical fields
    const preserved = validateMetadataWrites(
      [{
        collection: "locations",
        id: "loc-1",
        operation: "set",
        expectedVersion: 1,
        data: {
          storeNumber: "07",
          name: "Updated Store Name",
        },
      }],
      [{
        id: "loc-1",
        storeNumber: "07",
        storeManagerId: "p-existing",
        districtId: "dist-01",
        regionId: "reg-west",
        version: 1,
      }],
      [],
      actor,
      [{ id: "p-existing", fullName: "Existing Person", status: "Active" }],
    );

    assert.equal(preserved[0].data?.storeManagerId, "p-existing");
    assert.equal(preserved[0].data?.districtId, "dist-01");
    assert.equal(preserved[0].data?.regionId, "reg-west");
  });
});

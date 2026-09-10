import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildHierarchyReconciliationReport,
  collectHierarchyReconciliationIssues,
  validateLocationHierarchyFields,
  validateUserPersonLink,
} from "../src/lib/hierarchyAssignmentContract";
import { validateMetadataWrites, DirectoryValidationError } from "../server/firestoreDirectory";

describe("hierarchy assignment contract", () => {
  it("rejects non-retail locations when the hierarchy is marked as applicable", () => {
    const result = validateLocationHierarchyFields({
      type: "Corporate Office",
      hierarchyApplicability: "Applicable",
      districtId: "dist-1",
      regionId: "reg-1",
    });

    assert.ok(result.some(issue => issue.includes("Corporate Office") && issue.includes("Not Applicable")));
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

  it("rejects invalid user-to-person links when the target Person is missing or inactive", () => {
    assert.throws(() => {
      validateUserPersonLink("missing-person", [
        { id: "person-1", fullName: "Active Person", status: "Active" },
      ]);
    });

    assert.throws(() => {
      validateUserPersonLink("person-1", [
        { id: "person-1", fullName: "Inactive Person", status: "Inactive" },
      ]);
    });
  });

  it("builds a read-only reconciliation report with the expected counts", () => {
    const report = buildHierarchyReconciliationReport(
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
      [{ userId: "user-1", personId: "person-missing" }],
    );

    assert.equal(report.source, "read-only hierarchy reconciliation report");
    assert.equal(report.counts.totalLocations, 1);
    assert.ok(report.counts.missingPersonReferences >= 2);
    assert.ok(report.counts.duplicateAssignments >= 1);
    assert.ok(report.counts.invalidUserLinks >= 1);
  });

  it("rejects invalid hierarchy assignment writes and invalid user-to-person links at the server boundary", () => {
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

    assert.throws(() => {
      validateMetadataWrites(
        [{
          collection: "locations",
          id: "loc-1",
          operation: "set",
          data: {
            storeNumber: "07",
            name: "Test Store",
            type: "Corporate Office",
            hierarchyApplicability: "Applicable",
            keyHolderIds: ["person-1", "person-1"],
          },
        }],
        [undefined],
        [],
        actor,
        [{ id: "person-1", fullName: "Existing Person", status: "Active" }],
      );
    }, DirectoryValidationError);

    assert.throws(() => {
      validateMetadataWrites(
        [{
          collection: "users",
          id: "user-1",
          operation: "set",
          data: {
            email: "person@example.com",
            role: "Viewer",
            status: "Active",
            accessScope: "Company",
            personId: "missing-person",
          },
        }],
        [undefined],
        [],
        actor,
        [{ id: "person-1", fullName: "Existing Person", status: "Active" }],
      );
    }, DirectoryValidationError);
  });
});

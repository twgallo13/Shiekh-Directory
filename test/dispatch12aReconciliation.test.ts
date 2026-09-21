import assert from "node:assert/strict";
import { test } from "node:test";
import { Timestamp } from "@google-cloud/firestore";
import {
  classifyReconciliation,
  effectiveApplicability,
  readAuthoritativeSnapshot,
  type ReviewSnapshot,
} from "../scripts/dispatch12aReconciliation";

const region = (documentId: string, name = "West", status = "Active") => ({ documentId, id: documentId, name, status });
const district = (documentId: string, name: string, regionId = "region-west", status = "Active") => ({ documentId, id: documentId, name, regionId, status });
const location = (overrides: Record<string, unknown> = {}) => ({ documentId: "loc-1", id: "loc-1", storeNumber: "01", name: "Store", type: "Street / Standalone Location", recordStatus: "Active", ...overrides });
const snapshot = (locationOverrides: Record<string, unknown>, districts = [district("01", "North")], regions = [region("region-west")]): ReviewSnapshot => ({ locations: [location(locationOverrides)], regions, districts });
const row = (input: ReviewSnapshot) => classifyReconciliation(input)[0];

test("missing retail applicability defaults to Applicable and still evaluates a unique candidate", () => {
  const result = effectiveApplicability(location());
  assert.deepEqual(result, { saved: "", effective: "Applicable", issue: "" });
  assert.equal(row(snapshot({ district: " North " })).ReviewStatus, "UniqueNameCandidate");
});

test("explicit Unknown and Not Applicable remain visible and are not silently assigned", () => {
  assert.equal(row(snapshot({ hierarchyApplicability: "Unknown", district: "North" })).ReviewStatus, "UnknownApplicability");
  assert.equal(row(snapshot({ hierarchyApplicability: "Not Applicable", district: "North" })).ReviewStatus, "InvalidApplicability");
});

test("non-retail missing applicability follows the application default without forcing a District", () => {
  const result = row(snapshot({ type: "Other Company Location", district: "North" }));
  assert.equal(result.EffectiveHierarchyApplicability, "Not Applicable");
  assert.equal(result.ReviewStatus, "NonApplicable");
});

test("unique, ambiguous, and empty legacy names are distinct", () => {
  assert.equal(row(snapshot({ district: " North " })).ReviewStatus, "UniqueNameCandidate");
  assert.equal(row(snapshot({ district: "North" }, [district("01", "North"), district("02", " north ")])).ReviewStatus, "AmbiguousCandidate");
  assert.equal(row(snapshot({ district: "" })).ReviewStatus, "Unassigned");
});

test("missing and retired District references are distinguished", () => {
  assert.equal(row(snapshot({ districtId: "missing", hierarchyApplicability: "Applicable" })).ReviewStatus, "MissingReference");
  assert.equal(row(snapshot({ districtId: "01", hierarchyApplicability: "Applicable" }, [district("01", "North", "region-west", "Retired")])).ReviewStatus, "RetiredReference");
});

test("missing and retired Region parents are distinguished from mismatched parents", () => {
  assert.equal(row(snapshot({ regionId: "missing", districtId: "01", hierarchyApplicability: "Applicable" })).ReviewStatus, "ParentMismatch");
  assert.equal(row(snapshot({ regionId: "region-east", districtId: "01", hierarchyApplicability: "Applicable" }, [district("01", "North", "region-west")], [region("region-east", "East", "Retired")])).ReviewStatus, "ParentMismatch");
  const mismatch = row(snapshot({ regionId: "region-east", districtId: "01", hierarchyApplicability: "Applicable" }, [district("01", "North", "region-west")], [region("region-east", "East")]))
  assert.match(mismatch.Evidence, /belongs to Region/);
});

test("valid canonical assignments remain authoritative when legacy text conflicts", () => {
  const result = row(snapshot({ regionId: "region-west", districtId: "01", hierarchyApplicability: "Applicable", district: "Old Name" }));
  assert.equal(result.ReviewStatus, "AlreadyValid");
  assert.match(result.AdditionalIssues, /contradicts/);
});

test("identity conflicts and duplicate embedded registry IDs block lookup assumptions", () => {
  const conflict = row(snapshot({ id: "embedded-other", district: "North" }));
  assert.equal(conflict.LocationId, "loc-1");
  assert.equal(conflict.ReviewStatus, "IdentityConflict");
  const duplicate = row(snapshot({ district: "North" }, [district("01", "North"), district("02", "South")], [region("region-west"), region("region-west")]))
  assert.equal(duplicate.ReviewStatus, "IdentityConflict");
  assert.match(duplicate.AdditionalIssues, /Duplicate embedded Region id/);
});

test("absent and explicit-zero versions remain distinguishable and IDs retain leading zeros", () => {
  const absent = row(snapshot({ district: "North" }));
  const zero = row(snapshot({ version: 0, district: "North", districtId: "01", regionId: "region-west", hierarchyApplicability: "Applicable" }));
  assert.equal(absent.CurrentVersionPresent, "false");
  assert.equal(absent.CurrentVersion, "");
  assert.equal(absent.EffectiveConcurrencyVersion, "0");
  assert.equal(zero.CurrentVersionPresent, "true");
  assert.equal(zero.CurrentVersion, "0");
  assert.equal(zero.CurrentDistrictId, "01");
});

test("Store 150 remains an unapproved conflict with District 02 as a candidate", () => {
  const result = row(snapshot({ documentId: "loc-150", id: "loc-150", storeNumber: "150", name: "Broadway LA", districtId: "DIS-01", district: "Inland Empire, San Diego & LA South", regionId: "region-west", hierarchyApplicability: "Applicable" }, [district("02", "Inland Empire, San Diego & LA South")]));
  assert.equal(result.ReviewStatus, "MissingReference");
  assert.equal(result.ProposedDistrictId, "02");
  assert.equal(result.ProposedRegionId, "region-west");
  assert.match(result.Evidence, /DIS-01/);
});

test("all three collection reads use one read-only transaction", async () => {
  const names: string[] = [];
  let options: { readOnly?: boolean } | undefined;
  const fake = {
    collection(name: string) {
      names.push(name);
      return { select: (..._fields: string[]) => ({ name, get: async () => ({ docs: [] }) }) };
    },
    async runTransaction(callback: (transaction: { get(query: { get(): Promise<unknown> }): Promise<unknown> }) => Promise<unknown>, supplied: { readOnly?: boolean }) {
      options = supplied;
      await callback({ get: query => query.get() });
    },
  };
  const result = await readAuthoritativeSnapshot(fake as never);
  assert.equal(options?.readOnly, true);
  assert.deepEqual(names, ["locations", "regions", "districts"]);
  assert.deepEqual(result.snapshot, { locations: [], regions: [], districts: [] });
});

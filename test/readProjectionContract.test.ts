import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDistrictManagerGroupLabel, buildLocationReadProjection, resolveActivePerson, resolveActivePersonList } from "../src/lib/readProjectionContract";

describe("read projection contract", () => {
  it("prefers canonical person IDs over stale copied names when the reference is valid", () => {
    const result = buildLocationReadProjection(
      {
        id: "loc-1",
        storeNumber: "07",
        name: "Test Store",
        type: "Street / Standalone Location",
        district: "Legacy District",
        districtManagerId: "dm-1",
        districtManagerName: "Legacy DM",
        storeManagerId: "sm-1",
        storeManagerName: "Legacy Manager",
        assistantStoreManagerIds: ["asm-1"],
        assistantStoreManagerNames: ["Legacy ASM"],
        keyHolderIds: ["kh-1"],
        keyHolderNames: ["Legacy Key Holder"],
      },
      [
        { id: "dm-1", fullName: "Canonical District Manager", status: "Active" },
        { id: "sm-1", fullName: "Canonical Store Manager", status: "Active" },
        { id: "asm-1", fullName: "Canonical ASM", status: "Active" },
        { id: "kh-1", fullName: "Canonical Key Holder", status: "Active" },
      ],
    );

    assert.equal(result.storeManager, "Canonical Store Manager");
    assert.equal(result.districtManager, "Canonical District Manager");
    assert.equal(result.assistantStoreManagers.join(", "), "Canonical ASM");
    assert.equal(result.keyHolders.join(", "), "Canonical Key Holder");
    assert.deepEqual(result.warnings, []);
  });

  it("returns blank leadership values with warnings when canonical references are missing or inactive", () => {
    const result = buildLocationReadProjection(
      {
        id: "loc-2",
        storeNumber: "08",
        name: "Legacy Store",
        type: "Street / Standalone Location",
        district: "Legacy District",
        districtManagerId: "missing-dm",
        districtManagerName: "Legacy DM",
        storeManagerId: "inactive-sm",
        storeManagerName: "Legacy Manager",
        assistantStoreManagerIds: ["missing-asm"],
        assistantStoreManagerNames: ["Legacy ASM"],
        keyHolderIds: ["inactive-kh"],
        keyHolderNames: ["Legacy Key Holder"],
      },
      [
        { id: "active-sm", fullName: "Active Store Manager", status: "Active" },
        { id: "active-dm", fullName: "Active District Manager", status: "Active" },
        { id: "person-1", fullName: "Inactive Person", status: "Inactive" },
      ],
    );

    assert.equal(result.storeManager, "");
    assert.equal(result.districtManager, "");
    assert.equal(result.assistantStoreManagers.length, 0);
    assert.equal(result.keyHolders.length, 0);
    assert.ok(result.warnings.some(item => item.includes("missing") || item.includes("inactive")));
  });

  it("keeps the district display readable while surfacing conflicting legacy values", () => {
    const result = buildLocationReadProjection(
      {
        id: "loc-3",
        storeNumber: "09",
        name: "District Confusion",
        type: "Street / Standalone Location",
        district: "Legacy District",
      },
      [],
    );

    assert.equal(result.district, "Legacy District");
    assert.ok(result.warnings.some(item => item.includes("district")));
  });
});

describe("resolveActivePerson / resolveActivePersonList", () => {
  const people = [
    { id: "active-1", fullName: "Active Person", status: "Active" },
    { id: "inactive-status-1", fullName: "Inactive By Status", status: "Inactive" },
    { id: "inactive-flag-1", fullName: "Inactive By Flag", status: "Active", activeStatus: false },
  ];

  it("returns the Person object for a valid, active canonical reference", () => {
    assert.deepEqual(resolveActivePerson("active-1", people), people[0]);
  });

  it("returns undefined for a missing reference", () => {
    assert.equal(resolveActivePerson("missing-id", people), undefined);
    assert.equal(resolveActivePerson(undefined, people), undefined);
  });

  it("returns undefined for an inactive reference, whether by status or activeStatus flag", () => {
    assert.equal(resolveActivePerson("inactive-status-1", people), undefined);
    assert.equal(resolveActivePerson("inactive-flag-1", people), undefined);
  });

  it("filters a list of references down to only valid active People, preserving order", () => {
    const result = resolveActivePersonList(["active-1", "missing-id", "inactive-status-1"], people);
    assert.deepEqual(result, [people[0]]);
  });

  it("returns an empty list for undefined ids", () => {
    assert.deepEqual(resolveActivePersonList(undefined, people), []);
  });

  it("labels zero, one, and multiple distinct District Managers without selecting a first manager", () => {
    assert.equal(buildDistrictManagerGroupLabel([]), "No canonical District Manager");
    assert.equal(buildDistrictManagerGroupLabel(["District Manager A", undefined, "District Manager A"]), "District Manager A");
    assert.equal(buildDistrictManagerGroupLabel(["District Manager A", "District Manager B"]), "Multiple District Managers: District Manager A, District Manager B");
  });
});

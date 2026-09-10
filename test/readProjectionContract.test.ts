import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLocationReadProjection } from "../src/lib/readProjectionContract";

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

  it("falls back to legacy names with a warning when canonical references are missing or inactive", () => {
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

    assert.equal(result.storeManager, "Legacy Manager");
    assert.equal(result.districtManager, "Legacy DM");
    assert.equal(result.assistantStoreManagers.join(", "), "Legacy ASM");
    assert.equal(result.keyHolders.join(", "), "Legacy Key Holder");
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

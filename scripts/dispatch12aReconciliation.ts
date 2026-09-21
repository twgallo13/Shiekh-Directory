import { Firestore } from "@google-cloud/firestore";
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from "../server/firestoreLocations";

const fields = [
  "LocationId", "StoreNumber", "LocationName", "LocationType", "HierarchyApplicability",
  "LifecycleStatus", "CurrentVersion", "UpdatedAt", "CurrentRegionId", "CurrentRegionName",
  "CurrentRegionStatus", "CurrentDistrictId", "CurrentDistrictName", "CurrentDistrictStatus",
  "LegacyDistrict", "ProposedRegionId", "ProposedRegionName", "ProposedDistrictId",
  "ProposedDistrictName", "ReviewStatus", "Evidence", "DecisionNeeded",
];

type RecordValue = Record<string, unknown> & { id: string };

const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase();
const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

async function readCollection(firestore: Firestore, name: string): Promise<RecordValue[]> {
  const snapshot = await firestore.collection(name).get();
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

const firestore = new Firestore({
  projectId: DEFAULT_GOOGLE_CLOUD_PROJECT,
  databaseId: DEFAULT_FIRESTORE_DATABASE,
});

const [locations, regions, districts] = await Promise.all([
  readCollection(firestore, "locations"),
  readCollection(firestore, "regions"),
  readCollection(firestore, "districts"),
]);
const regionsById = new Map(regions.map(region => [region.id, region]));
const districtsById = new Map(districts.map(district => [district.id, district]));

const rows = locations.map(location => {
  const region = regionsById.get(String(location.regionId || ""));
  const district = districtsById.get(String(location.districtId || ""));
  const candidates = districts.filter(candidate => candidate.status === "Active"
    && regionsById.get(String(candidate.regionId || ""))?.status === "Active"
    && normalize(candidate.name) === normalize(location.district));
  let reviewStatus = "UnknownApplicability";
  let evidence = "HierarchyApplicability is missing; do not infer applicability from Location type";
  let decisionNeeded = "Owner must confirm applicability before hierarchy assignment";
  let proposedRegion = "";
  let proposedRegionName = "";
  let proposedDistrict = "";
  let proposedDistrictName = "";

  if (location.hierarchyApplicability === "Applicable") {
    if (location.districtId && !district) {
      reviewStatus = candidates.length === 1 ? "CanonicalConflict" : "MissingReference";
      evidence = candidates.length === 1
        ? `Current DistrictId ${location.districtId} is not in registry; legacy text uniquely matches active District ${candidates[0].id}`
        : `Current DistrictId ${location.districtId} is not in registry`;
      decisionNeeded = "Theo must confirm whether the canonical reference is corrected to the named candidate or another District";
    } else if (district && region?.status === "Active" && district.status === "Active" && district.regionId === location.regionId) {
      reviewStatus = "AlreadyValid";
      evidence = "Canonical DistrictId resolves to an Active District with an Active matching parent Region";
      decisionNeeded = "No assignment decision; retain canonical values";
    } else if (!location.districtId && candidates.length === 1) {
      reviewStatus = "UniqueNameCandidate";
      evidence = `Legacy text uniquely matches active District ${candidates[0].id}; candidate only`;
      decisionNeeded = "Theo must approve candidate before assignment";
    } else if (!location.districtId) {
      reviewStatus = "Unassigned";
      evidence = location.district ? "No unique active registry name match" : "No canonical or legacy District value";
      decisionNeeded = "Theo must decide District";
    } else {
      reviewStatus = "ParentMismatch";
      evidence = "Canonical District reference exists but parent Region is missing, retired, or mismatched";
      decisionNeeded = "Theo must review hierarchy parent before any change";
    }
  }

  const candidate = candidates.length === 1 ? candidates[0] : undefined;
  if (candidate && (reviewStatus === "CanonicalConflict" || reviewStatus === "UniqueNameCandidate")) {
    proposedRegion = String(candidate.regionId || "");
    proposedRegionName = String(regionsById.get(proposedRegion)?.name || "");
    proposedDistrict = candidate.id;
    proposedDistrictName = String(candidate.name || "");
  }

  return [
    location.id, location.storeNumber, location.name, location.type || location.locationType,
    location.hierarchyApplicability, location.recordStatus || location.status,
    typeof location.version === "number" ? location.version : 0,
    location.updatedAt || location.updatedTimestamp, location.regionId, region?.name, region?.status,
    location.districtId, district?.name, district?.status, location.district,
    proposedRegion, proposedRegionName, proposedDistrict, proposedDistrictName, reviewStatus,
    evidence, decisionNeeded,
  ].map(csv).join(",");
});

process.stdout.write(`${fields.join(",")}\n${rows.join("\n")}\n`);
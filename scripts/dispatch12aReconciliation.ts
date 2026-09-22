import { Firestore } from "@google-cloud/firestore";
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from "../server/firestoreLocations";

export const REPORT_FIELDS = [
  "LocationId", "EmbeddedLocationId", "LocationName", "StoreNumber", "LocationType",
  "SavedHierarchyApplicability", "EffectiveHierarchyApplicability", "ApplicabilityIssue",
  "LifecycleStatus", "CurrentVersionPresent", "CurrentVersion", "EffectiveConcurrencyVersion",
  "VersionIssue", "UpdatedAt", "CurrentRegionId", "CurrentRegionName", "CurrentRegionStatus",
  "CurrentDistrictId", "CurrentDistrictName", "CurrentDistrictStatus", "LegacyDistrict",
  "ProposedRegionId", "ProposedRegionName", "ProposedDistrictId", "ProposedDistrictName",
  "ReviewStatus", "AdditionalIssues", "Evidence", "DecisionNeeded",
] as const;

export type ReviewRecord = Record<string, unknown> & { documentId: string };
export type ReviewSnapshot = { locations: ReviewRecord[]; regions: ReviewRecord[]; districts: ReviewRecord[] };
export type ReviewRow = Record<(typeof REPORT_FIELDS)[number], string>;

const retailTypes = new Set(["Enclosed Mall", "Strip Center / Shopping Center", "Street / Standalone Location"]);
const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase();
const has = (record: ReviewRecord, field: string) => Object.prototype.hasOwnProperty.call(record, field);
const text = (value: unknown) => String(value ?? "");
const csv = (value: unknown) => `"${text(value).replaceAll('"', '""')}"`;

export function effectiveApplicability(location: ReviewRecord): { saved: string; effective: string; issue: string } {
  const saved = has(location, "hierarchyApplicability") ? text(location.hierarchyApplicability) : "";
  if (saved === "Unknown") return { saved, effective: "Unknown", issue: "" };
  if (retailTypes.has(text(location.type))) {
    if (saved === "Not Applicable") return { saved, effective: "Not Applicable", issue: "Retail location is explicitly marked Not Applicable under the application contract" };
    return { saved, effective: saved || "Applicable", issue: "" };
  }
  const hasReference = Boolean(location.regionId || location.districtId);
  const effective = saved || (hasReference ? "Applicable" : "Not Applicable");
  const issue = saved === "Applicable" && !hasReference
    ? "Non-retail location is Applicable but has no controlled hierarchy reference"
    : saved === "Not Applicable" && hasReference
      ? "Non-retail location has hierarchy references but is marked Not Applicable"
      : "";
  return { saved, effective, issue };
}

function identityIssues(records: ReviewRecord[], label: string): string[] {
  const embedded = new Map<string, string[]>();
  for (const record of records) {
    if (!has(record, "id")) continue;
    const value = text(record.id);
    embedded.set(value, [...(embedded.get(value) || []), record.documentId]);
  }
  return [...embedded.entries()].flatMap(([id, documents]) => documents.length > 1
    ? [`Duplicate embedded ${label} id ${id} in documents ${documents.join(", ")}`] : []);
}

export function classifyReconciliation(snapshot: ReviewSnapshot): ReviewRow[] {
  const regionIdentityIssues = identityIssues(snapshot.regions, "Region");
  const districtIdentityIssues = identityIssues(snapshot.districts, "District");
  const regionById = new Map(snapshot.regions.map(record => [record.documentId, record]));
  const districtById = new Map(snapshot.districts.map(record => [record.documentId, record]));
  const rows: ReviewRow[] = [];

  for (const location of snapshot.locations) {
    const applicability = effectiveApplicability(location);
    const region = regionById.get(text(location.regionId));
    const district = districtById.get(text(location.districtId));
    const candidates = snapshot.districts.filter(candidate => candidate.status === "Active"
      && regionById.get(text(candidate.regionId))?.status === "Active"
      && normalize(candidate.name) !== ""
      && normalize(candidate.name) === normalize(location.district));
    const additional: string[] = [
      ...regionIdentityIssues,
      ...districtIdentityIssues,
      ...(has(location, "id") && text(location.id) !== location.documentId
        ? [`Embedded Location id ${text(location.id)} conflicts with document id ${location.documentId}`] : []),
      ...(applicability.issue ? [applicability.issue] : []),
    ];
    const versionPresent = has(location, "version");
    const version = text(location.version);
    const versionIssue = versionPresent && (!Number.isInteger(location.version) || Number(location.version) < 0)
      ? "Version is present but is not a non-negative integer" : "";
    if (versionIssue) additional.push(versionIssue);

    let status = "Unassigned";
    let evidence = "No canonical DistrictId or legacy District value";
    let decision = "Theo must decide District";
    let proposedRegion = "";
    let proposedRegionName = "";
    let proposedDistrict = "";
    let proposedDistrictName = "";
    const conflict = has(location, "id") && text(location.id) !== location.documentId;
    const canonicalReference = Boolean(location.districtId);
    const candidate = candidates.length === 1 ? candidates[0] : undefined;
    if (candidate) {
      const candidateRegion = regionById.get(text(candidate.regionId));
      proposedRegion = candidateRegion?.documentId || text(candidate.regionId);
      proposedRegionName = text(candidateRegion?.name);
      proposedDistrict = candidate.documentId;
      proposedDistrictName = text(candidate.name);
    }

    if (conflict || additional.some(issue => issue.startsWith("Duplicate embedded"))) {
      status = "IdentityConflict";
      evidence = "Document identity conflicts with embedded identity; do not construct an assignment from this row";
      decision = "Resolve the identity conflict before any reconciliation decision";
    } else if (applicability.effective === "Not Applicable") {
      status = applicability.issue ? "InvalidApplicability" : "NonApplicable";
      evidence = applicability.issue || "Effective application contract treats this record as Not Applicable";
      decision = applicability.issue ? "Theo must correct applicability intent" : "No hierarchy assignment unless owner changes applicability";
    } else if (applicability.effective === "Unknown") {
      status = "UnknownApplicability";
      evidence = "Explicit Unknown applicability; do not infer hierarchy intent from type or legacy text";
      decision = "Theo must decide whether hierarchy applies before assignment review";
    } else if (canonicalReference && !district) {
      status = "MissingReference";
      evidence = candidate
        ? `Current DistrictId ${text(location.districtId)} is not in the registry; legacy text uniquely matches active District ${candidate.documentId}`
        : `Current DistrictId ${text(location.districtId)} is not in the registry`;
      decision = "Theo must identify the intended District; no ID conversion is permitted";
    } else if (canonicalReference && district?.status === "Retired") {
      status = "RetiredReference";
      evidence = `Current DistrictId ${text(location.districtId)} resolves to a Retired District`;
      decision = "Theo must select an active replacement District";
    } else if (canonicalReference && (!region || region.status === "Retired")) {
      status = "ParentMismatch";
      evidence = `Current RegionId ${text(location.regionId)} is missing or Retired for the canonical District reference`;
      decision = "Theo must review the Region parent before any change";
    } else if (canonicalReference && district && district.regionId !== text(location.regionId)) {
      status = "ParentMismatch";
      evidence = `District ${district.documentId} belongs to Region ${text(district.regionId)}, not Location Region ${text(location.regionId)}`;
      decision = "Theo must review both Region values before any change";
    } else if (canonicalReference && district) {
      status = "AlreadyValid";
      evidence = "Canonical DistrictId resolves to an Active District with an Active matching parent Region";
      decision = "No assignment decision; retain canonical values";
      if (normalize(location.district) && normalize(location.district) !== normalize(district.name)) {
        additional.push("Legacy District text contradicts the valid canonical District name");
      }
    } else if (candidates.length > 1) {
      status = "AmbiguousCandidate";
      evidence = `Legacy text matches ${candidates.length} Active District names after trim/case normalization`;
      decision = "Theo must choose the intended District";
    } else if (candidates.length === 1) {
      status = "UniqueNameCandidate";
      evidence = `Legacy text uniquely matches Active District ${candidate.documentId} with Active parent Region; candidate only`;
      decision = "Theo must approve the candidate before assignment";
    } else if (text(location.district).trim()) {
      status = "Unassigned";
      evidence = "Legacy District text has no exact active registry name match";
    }

    rows.push({
      LocationId: location.documentId,
      EmbeddedLocationId: text(location.id),
      LocationName: text(location.name),
      StoreNumber: text(location.storeNumber),
      LocationType: text(location.type || location.locationType),
      SavedHierarchyApplicability: applicability.saved,
      EffectiveHierarchyApplicability: applicability.effective,
      ApplicabilityIssue: applicability.issue,
      LifecycleStatus: text(location.recordStatus || location.status),
      CurrentVersionPresent: versionPresent ? "true" : "false",
      CurrentVersion: versionPresent ? version : "",
      EffectiveConcurrencyVersion: versionPresent && !versionIssue ? version : "0",
      VersionIssue: versionIssue,
      UpdatedAt: text(location.updatedAt || location.updatedTimestamp),
      CurrentRegionId: text(location.regionId),
      CurrentRegionName: text(region?.name),
      CurrentRegionStatus: text(region?.status),
      CurrentDistrictId: text(location.districtId),
      CurrentDistrictName: text(district?.name),
      CurrentDistrictStatus: text(district?.status),
      LegacyDistrict: text(location.district),
      ProposedRegionId: proposedRegion,
      ProposedRegionName: proposedRegionName,
      ProposedDistrictId: proposedDistrict,
      ProposedDistrictName: proposedDistrictName,
      ReviewStatus: status,
      AdditionalIssues: additional.join(" | "),
      Evidence: evidence,
      DecisionNeeded: decision,
    });
  }
  return rows;
}

export function renderCsv(rows: ReviewRow[]): string {
  return `${REPORT_FIELDS.join(",")}\n${rows.map(row => REPORT_FIELDS.map(field => csv(row[field])).join(",")).join("\n")}\n`;
}

const fields = ["id", "storeNumber", "name", "type", "locationType", "hierarchyApplicability", "regionId", "districtId", "district", "recordStatus", "status", "version", "updatedAt", "updatedTimestamp"];
async function readCollection(transaction: { get(query: unknown): Promise<{ docs: Array<{ id: string; data(): Record<string, unknown> }> }> }, firestore: Firestore, name: string) {
  const snapshot = await transaction.get(firestore.collection(name).select(...fields));
  return snapshot.docs.map(document => ({ documentId: document.id, ...document.data() }));
}

export async function readAuthoritativeSnapshot(firestore: Firestore): Promise<{ snapshot: ReviewSnapshot; readStartedAt: string; readCompletedAt: string }> {
  const readStartedAt = new Date().toISOString();
  let snapshot!: ReviewSnapshot;
  await firestore.runTransaction(async transaction => {
    const [locations, regions, districts] = await Promise.all([
      readCollection(transaction, firestore, "locations"),
      readCollection(transaction, firestore, "regions"),
      readCollection(transaction, firestore, "districts"),
    ]);
    snapshot = { locations, regions, districts };
  }, { readOnly: true });
  return { snapshot, readStartedAt, readCompletedAt: new Date().toISOString() };
}

async function main() {
  const firestore = new Firestore({ projectId: DEFAULT_GOOGLE_CLOUD_PROJECT, databaseId: DEFAULT_FIRESTORE_DATABASE });
  const { snapshot } = await readAuthoritativeSnapshot(firestore);
  process.stdout.write(renderCsv(classifyReconciliation(snapshot)));
}

if (process.argv[1]?.endsWith("dispatch12aReconciliation.ts")) await main();

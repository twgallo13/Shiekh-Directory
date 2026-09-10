export type HierarchyApplicability = "Applicable" | "Not Applicable" | "Unknown";

export interface HierarchyFieldContract {
  type: string;
  hierarchyApplicability?: HierarchyApplicability;
  regionId?: string;
  districtId?: string;
  storeManagerId?: string;
  assistantStoreManagerIds?: string[];
  keyHolderIds?: string[];
  districtManagerId?: string;
  regionalManagerId?: string;
}

export interface PersonReference {
  id: string;
  fullName: string;
  status?: string;
  activeStatus?: boolean;
}

export interface RegionDefinition {
  id: string;
  name: string;
  code?: string;
}

export interface DistrictDefinition {
  id: string;
  name: string;
  regionId: string;
}

export const CONTROLLED_REGIONS: RegionDefinition[] = [
  { id: "reg-west", name: "West Region", code: "WEST" },
  { id: "reg-east", name: "East Region", code: "EAST" },
  { id: "reg-central", name: "Central Region", code: "CENT" },
  { id: "reg-corp", name: "Corporate & Administrative", code: "CORP" },
];

export const CONTROLLED_DISTRICTS: DistrictDefinition[] = [
  { id: "dist-01", name: "District 1", regionId: "reg-west" },
  { id: "dist-02", name: "District 2", regionId: "reg-west" },
  { id: "dist-03", name: "District 3", regionId: "reg-east" },
  { id: "dist-04", name: "District 4", regionId: "reg-central" },
  { id: "dist-corp", name: "Corporate District", regionId: "reg-corp" },
];

export function getControlledRegions(): RegionDefinition[] {
  return [...CONTROLLED_REGIONS];
}

export function getControlledDistricts(): DistrictDefinition[] {
  return [...CONTROLLED_DISTRICTS];
}

export function findRegionById(id: string): RegionDefinition | undefined {
  return CONTROLLED_REGIONS.find(r => r.id === id);
}

export function findDistrictById(id: string): DistrictDefinition | undefined {
  return CONTROLLED_DISTRICTS.find(d => d.id === id);
}

export function validateHierarchyRegistryReferences(
  regionId?: string,
  districtId?: string,
): string[] {
  const issues: string[] = [];
  let region: RegionDefinition | undefined;
  let district: DistrictDefinition | undefined;

  if (regionId) {
    region = findRegionById(regionId);
    if (!region) {
      issues.push(`regionId ${regionId} is not a recognized controlled region ID.`);
    }
  }

  if (districtId) {
    district = findDistrictById(districtId);
    if (!district) {
      issues.push(`districtId ${districtId} is not a recognized controlled district ID.`);
    }
  }

  if (regionId && districtId && district) {
    if (district.regionId !== regionId) {
      issues.push(
        `districtId ${districtId} belongs to region ${district.regionId}, which does not match provided regionId ${regionId}.`,
      );
    }
  }

  return issues;
}

export interface HierarchyReconciliationIssue {
  kind: string;
  locationId: string;
  detail: string;
}

export interface HierarchyReconciliationReport {
  generatedAt: string;
  source: string;
  counts: {
    totalLocations: number;
    totalPeople: number;
    missingPersonReferences: number;
    duplicateAssignments: number;
    invalidHierarchyReferences: number;
    duplicateIdentities: number;
    staleCopiedRelationships: number;
    reverseAssignmentMismatches: number;
    invalidUserLinks: number;
  };
  issues: HierarchyReconciliationIssue[];
}

export function validateLocationHierarchyFields(input: HierarchyFieldContract): string[] {
  const issues: string[] = [];
  const retailTypes = new Set([
    "Enclosed Mall",
    "Strip Center / Shopping Center",
    "Street / Standalone Location",
  ]);

  if (retailTypes.has(input.type)) {
    const applicable = input.hierarchyApplicability ?? "Applicable";
    if (applicable === "Not Applicable") {
      issues.push(`${input.type} is a retail location and must not be marked Not Applicable.`);
    }
  }

  const registryIssues = validateHierarchyRegistryReferences(input.regionId, input.districtId);
  issues.push(...registryIssues);

  const arrays = [
    ["assistantStoreManagerIds", input.assistantStoreManagerIds || []],
    ["keyHolderIds", input.keyHolderIds || []],
  ] as const;

  for (const [field, values] of arrays) {
    const seen = new Set<string>();
    for (const value of values) {
      if (!value) continue;
      if (seen.has(value)) {
        issues.push(`${field} contains a duplicate assignment: ${value}`);
      }
      seen.add(value);
    }
  }

  const leadership = [
    ["storeManagerId", input.storeManagerId],
    ["districtManagerId", input.districtManagerId],
    ["regionalManagerId", input.regionalManagerId],
  ] as const;

  for (const [field, value] of leadership) {
    if (value && value.trim() === "") {
      issues.push(`${field} is blank and should be omitted.`);
    }
  }

  return issues;
}

export function validateUserPersonLink(
  personId: string | undefined | null,
  allPeople: PersonReference[],
): void {
  if (!personId || personId.trim() === "") return;
  const matches = allPeople.filter(person => person.id === personId);
  if (matches.length === 0) {
    throw new Error(`Invalid user-to-Person link: ${personId} does not exist.`);
  }
  if (matches.length > 1) {
    throw new Error(`Invalid user-to-Person link: duplicate Person records found for ID ${personId}.`);
  }
  const match = matches[0];
  const isInactive = (match.status && match.status !== "Active") || match.activeStatus === false;
  if (isInactive) {
    throw new Error(`Invalid user-to-Person link: ${match.fullName} is not active.`);
  }
}

export interface LocationReconciliationInput {
  id: string;
  storeNumber: string;
  name: string;
  type: string;
  district?: string;
  regionId?: string;
  districtId?: string;
  storeManagerId?: string;
  storeManagerName?: string;
  storeManagerPhone?: string;
  assistantStoreManagerIds?: string[];
  assistantStoreManagerNames?: string[];
  districtManagerId?: string;
  districtManagerName?: string;
  regionalManagerId?: string;
  regionalManagerName?: string;
  keyHolderIds?: string[];
  keyHolderNames?: string[];
}

export interface PersonReconciliationInput extends PersonReference {
  email?: string;
  phone?: string;
  workPhone?: string;
  assignedLocations?: string[];
  locationsOverseen?: string[];
}

export function collectHierarchyReconciliationIssues(
  locations: LocationReconciliationInput[],
  people: PersonReconciliationInput[],
): HierarchyReconciliationIssue[] {
  const issues: HierarchyReconciliationIssue[] = [];

  const locationIds = new Set<string>();
  const storeNumbers = new Set<string>();
  for (const loc of locations) {
    if (locationIds.has(loc.id)) {
      issues.push({
        kind: "duplicate-identity",
        locationId: loc.id,
        detail: `duplicate location ID ${loc.id} found`,
      });
    }
    locationIds.add(loc.id);

    const normStore = loc.storeNumber ? loc.storeNumber.trim().replace(/^0+(?=\d)/, "") : "";
    if (normStore) {
      if (storeNumbers.has(normStore)) {
        issues.push({
          kind: "duplicate-identity",
          locationId: loc.id,
          detail: `duplicate store number ${loc.storeNumber} found on location ${loc.name} (${loc.id})`,
        });
      }
      storeNumbers.add(normStore);
    }
  }

  const personMap = new Map<string, PersonReconciliationInput>();
  const personIdsSeen = new Set<string>();
  for (const p of people) {
    if (personIdsSeen.has(p.id)) {
      issues.push({
        kind: "duplicate-identity",
        locationId: p.id,
        detail: `duplicate Person ID ${p.id} found for ${p.fullName}`,
      });
    }
    personIdsSeen.add(p.id);
    personMap.set(p.id, p);
  }

  for (const location of locations) {
    const hierarchyIssues = validateHierarchyRegistryReferences(location.regionId, location.districtId);
    for (const hIssue of hierarchyIssues) {
      issues.push({
        kind: "invalid-hierarchy-reference",
        locationId: location.id,
        detail: `location ${location.name} (${location.storeNumber}): ${hIssue}`,
      });
    }

    const singleLeadership = [
      ["storeManagerId", location.storeManagerId, location.storeManagerName],
      ["districtManagerId", location.districtManagerId, location.districtManagerName],
      ["regionalManagerId", location.regionalManagerId, location.regionalManagerName],
    ] as const;

    for (const [field, id, legacyName] of singleLeadership) {
      if (id) {
        const p = personMap.get(id);
        if (!p) {
          issues.push({
            kind: "missing-person-reference",
            locationId: location.id,
            detail: `${field} references missing person ${id} on ${location.name} (${location.storeNumber})`,
          });
        } else if ((p.status && p.status !== "Active") || p.activeStatus === false) {
          issues.push({
            kind: "missing-person-reference",
            locationId: location.id,
            detail: `${field} references inactive person ${p.fullName} (${id}) on ${location.name} (${location.storeNumber})`,
          });
        }
      } else if (legacyName && legacyName.trim()) {
        issues.push({
          kind: "stale-copied-relationship",
          locationId: location.id,
          detail: `${field} has legacy copied name "${legacyName}" without canonical person ID on ${location.name} (${location.storeNumber})`,
        });
      }
    }

    const listLeadership = [
      ["assistantStoreManagerIds", location.assistantStoreManagerIds || [], location.assistantStoreManagerNames || []],
      ["keyHolderIds", location.keyHolderIds || [], location.keyHolderNames || []],
    ] as const;

    for (const [field, ids, legacyNames] of listLeadership) {
      const seenInList = new Set<string>();
      for (const id of ids) {
        if (!id) continue;
        if (seenInList.has(id)) {
          issues.push({
            kind: "duplicate-assignment",
            locationId: location.id,
            detail: `duplicate assignment ID ${id} in ${field} on ${location.name} (${location.storeNumber})`,
          });
        }
        seenInList.add(id);

        const p = personMap.get(id);
        if (!p) {
          issues.push({
            kind: "missing-person-reference",
            locationId: location.id,
            detail: `${field} references missing person ${id} on ${location.name} (${location.storeNumber})`,
          });
        } else if ((p.status && p.status !== "Active") || p.activeStatus === false) {
          issues.push({
            kind: "missing-person-reference",
            locationId: location.id,
            detail: `${field} references inactive person ${p.fullName} (${id}) on ${location.name} (${location.storeNumber})`,
          });
        }
      }

      if (legacyNames.length > ids.length) {
        for (let i = ids.length; i < legacyNames.length; i += 1) {
          const extraName = legacyNames[i];
          if (extraName && extraName.trim()) {
            issues.push({
              kind: "stale-copied-relationship",
              locationId: location.id,
              detail: `${field} has extra legacy copied name "${extraName}" without matching canonical ID on ${location.name} (${location.storeNumber})`,
            });
          }
        }
      }
    }

    if (location.storeManagerId && location.storeManagerName) {
      const p = personMap.get(location.storeManagerId);
      if (p && p.fullName !== location.storeManagerName) {
        issues.push({
          kind: "stale-copied-relationship",
          locationId: location.id,
          detail: `storeManagerName "${location.storeManagerName}" differs from canonical person name "${p.fullName}" on ${location.name} (${location.storeNumber})`,
        });
      }
    }

    if (location.district && location.storeManagerId && !personMap.has(location.storeManagerId)) {
      issues.push({
        kind: "stale-copied-relationship",
        locationId: location.id,
        detail: `legacy district ${location.district} and missing store-manager reference ${location.storeManagerId} require review for stale copied values`,
      });
    }
  }

  for (const person of people) {
    if (person.assignedLocations && person.assignedLocations.length > 0) {
      for (const locRef of person.assignedLocations) {
        const matchedLoc = locations.find(
          loc => loc.id === locRef || loc.storeNumber === locRef || loc.storeNumber.replace(/^0+/, "") === locRef.replace(/^0+/, ""),
        );
        if (!matchedLoc) {
          issues.push({
            kind: "reverse-assignment-mismatch",
            locationId: person.id,
            detail: `Person ${person.fullName} (${person.id}) claims assigned location ${locRef}, which does not exist`,
          });
        }
      }
    }
  }

  return issues;
}

export function buildHierarchyReconciliationReport(
  locations: LocationReconciliationInput[],
  people: PersonReconciliationInput[],
  userLinks: Array<{ userId: string; personId: string }> = [],
): HierarchyReconciliationReport {
  const issues = collectHierarchyReconciliationIssues(locations, people);

  const invalidUserLinks = userLinks.filter(link => {
    const matches = people.filter(person => person.id === link.personId);
    if (matches.length !== 1) return true;
    const match = matches[0];
    return (match.status && match.status !== "Active") || match.activeStatus === false;
  });

  for (const link of invalidUserLinks) {
    issues.push({
      kind: "invalid-user-link",
      locationId: link.userId,
      detail: `user ${link.userId} links to invalid or inactive person ${link.personId}`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    source: "read-only hierarchy reconciliation report",
    counts: {
      totalLocations: locations.length,
      totalPeople: people.length,
      missingPersonReferences: issues.filter(issue => issue.kind === "missing-person-reference").length,
      duplicateAssignments: issues.filter(issue => issue.kind === "duplicate-assignment").length,
      invalidHierarchyReferences: issues.filter(issue => issue.kind === "invalid-hierarchy-reference").length,
      duplicateIdentities: issues.filter(issue => issue.kind === "duplicate-identity").length,
      staleCopiedRelationships: issues.filter(issue => issue.kind === "stale-copied-relationship").length,
      reverseAssignmentMismatches: issues.filter(issue => issue.kind === "reverse-assignment-mismatch").length,
      invalidUserLinks: invalidUserLinks.length,
    },
    issues,
  };
}

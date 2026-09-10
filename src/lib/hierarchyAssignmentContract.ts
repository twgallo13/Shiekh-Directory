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
    staleCopiedRelationships: number;
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
  } else {
    const applicable = input.hierarchyApplicability ?? "Not Applicable";
    if (applicable === "Applicable") {
      issues.push(`${input.type} is a non-retail location and must be marked Not Applicable or Unknown.`);
    }
  }

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

export function validateUserPersonLink(personId: string | undefined, allPeople: PersonReference[]): void {
  if (!personId) return;
  const match = allPeople.find(person => person.id === personId);
  if (!match) {
    throw new Error(`Invalid user-to-Person link: ${personId} does not exist.`);
  }
  if (match.status && match.status !== "Active") {
    throw new Error(`Invalid user-to-Person link: ${match.fullName} is not active.`);
  }
}

export function collectHierarchyReconciliationIssues(
  locations: Array<{
    id: string;
    storeNumber: string;
    name: string;
    type: string;
    district?: string;
    storeManagerId?: string;
    assistantStoreManagerIds?: string[];
    districtManagerId?: string;
    keyHolderIds?: string[];
  }>,
  people: PersonReference[],
): HierarchyReconciliationIssue[] {
  const issues: HierarchyReconciliationIssue[] = [];

  for (const location of locations) {
    const personMap = new Map(people.map(person => [person.id, person]));

    const leadershipRefs = [
      ["storeManagerId", location.storeManagerId],
      ["districtManagerId", location.districtManagerId],
      ...((location.assistantStoreManagerIds || []).map(id => [`assistantStoreManagerIds`, id] as const)),
      ...((location.keyHolderIds || []).map(id => [`keyHolderIds`, id] as const)),
    ] as const;

    for (const [field, id] of leadershipRefs) {
      if (!id) continue;
      if (!personMap.has(id)) {
        issues.push({
          kind: "missing-person-reference",
          locationId: location.id,
          detail: `${field} references missing person ${id} on ${location.name} (${location.storeNumber})`,
        });
      }
    }

    const seen = new Set<string>();
    const duplicateIds = [
      ...(location.assistantStoreManagerIds || []),
      ...(location.keyHolderIds || []),
    ];
    for (const id of duplicateIds) {
      if (!id) continue;
      if (seen.has(id)) {
        issues.push({
          kind: "duplicate-assignment",
          locationId: location.id,
          detail: `duplicate assignment id ${id} on ${location.name} (${location.storeNumber})`,
        });
      }
      seen.add(id);
    }

    if (location.district && location.storeManagerId && !personMap.has(location.storeManagerId)) {
      issues.push({
        kind: "stale-copied-relationship",
        locationId: location.id,
        detail: `legacy district ${location.district} and missing store-manager reference ${location.storeManagerId} require review for stale copied values`,
      });
    }
  }

  return issues;
}

export function buildHierarchyReconciliationReport(
  locations: Array<{
    id: string;
    storeNumber: string;
    name: string;
    type: string;
    district?: string;
    storeManagerId?: string;
    assistantStoreManagerIds?: string[];
    districtManagerId?: string;
    keyHolderIds?: string[];
  }>,
  people: PersonReference[],
  userLinks: Array<{ userId: string; personId: string }> = [],
): HierarchyReconciliationReport {
  const issues = collectHierarchyReconciliationIssues(locations, people);

  const invalidUserLinks = userLinks.filter(link => {
    const match = people.find(person => person.id === link.personId);
    return !match || (match.status && match.status !== "Active");
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
      staleCopiedRelationships: issues.filter(issue => issue.kind === "stale-copied-relationship").length,
      invalidUserLinks: invalidUserLinks.length,
    },
    issues,
  };
}

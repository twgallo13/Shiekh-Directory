export interface ReadProjectionPerson {
  id: string;
  fullName: string;
  status?: string;
}

export interface LocationReadProjectionInput {
  id: string;
  storeNumber: string;
  name: string;
  type: string;
  district?: string;
  districtManagerId?: string;
  districtManagerName?: string;
  storeManagerId?: string;
  storeManagerName?: string;
  assistantStoreManagerIds?: string[];
  assistantStoreManagerNames?: string[];
  keyHolderIds?: string[];
  keyHolderNames?: string[];
}

export interface LocationReadProjection {
  storeManager: string;
  districtManager: string;
  assistantStoreManagers: string[];
  keyHolders: string[];
  district: string;
  warnings: string[];
}

function resolveCanonicalName(
  id: string | undefined,
  legacyName: string | undefined,
  people: ReadProjectionPerson[],
  field: string,
): { value: string; warning?: string } {
  if (!id) {
    return {
      value: legacyName || "",
      warning: legacyName ? `${field} is using legacy copied value` : undefined,
    };
  }

  const person = people.find(candidate => candidate.id === id);
  if (!person) {
    return {
      value: legacyName || "",
      warning: `${field} references missing person ${id}; using legacy copied value`,
    };
  }

  if (person.status && person.status !== "Active") {
    return {
      value: legacyName || "",
      warning: `${field} references inactive person ${person.fullName}; using legacy copied value`,
    };
  }

  return { value: person.fullName };
}

function resolveCanonicalList(
  ids: string[] | undefined,
  legacyNames: string[] | undefined,
  people: ReadProjectionPerson[],
  field: string,
): { values: string[]; warnings: string[] } {
  const values: string[] = [];
  const warnings: string[] = [];

  const canonicalIds = ids || [];
  const legacyValues = legacyNames || [];
  const fallback = canonicalIds.length > 0 ? legacyValues : legacyValues;

  for (let index = 0; index < Math.max(canonicalIds.length, legacyValues.length); index += 1) {
    const id = canonicalIds[index];
    const legacyName = legacyValues[index];
    const resolved = resolveCanonicalName(id, legacyName, people, field);
    if (resolved.value) {
      values.push(resolved.value);
    }
    if (resolved.warning) {
      warnings.push(resolved.warning);
    }
  }

  if (values.length === 0 && fallback.length > 0) {
    values.push(...fallback.filter(Boolean));
  }

  return { values, warnings };
}

export function buildLocationReadProjection(
  location: LocationReadProjectionInput,
  people: ReadProjectionPerson[],
): LocationReadProjection {
  const warnings: string[] = [];

  const storeManager = resolveCanonicalName(
    location.storeManagerId,
    location.storeManagerName,
    people,
    "storeManager",
  );
  const districtManager = resolveCanonicalName(
    location.districtManagerId,
    location.districtManagerName,
    people,
    "districtManager",
  );

  const assistantResult = resolveCanonicalList(
    location.assistantStoreManagerIds,
    location.assistantStoreManagerNames,
    people,
    "assistantStoreManager",
  );
  const keyHolderResult = resolveCanonicalList(
    location.keyHolderIds,
    location.keyHolderNames,
    people,
    "keyHolder",
  );

  if (storeManager.warning) warnings.push(storeManager.warning);
  if (districtManager.warning) warnings.push(districtManager.warning);
  warnings.push(...assistantResult.warnings);
  warnings.push(...keyHolderResult.warnings);

  const district = location.district || "";
  const canonicalLeadershipRefs = [location.districtManagerId, location.storeManagerId].filter((id): id is string => Boolean(id));
  const validCanonicalLeadership = canonicalLeadershipRefs.filter(id =>
    people.some(person => person.id === id && (!person.status || person.status === "Active")),
  );

  if (district && (canonicalLeadershipRefs.length === 0 || validCanonicalLeadership.length !== canonicalLeadershipRefs.length)) {
    warnings.push(`district uses legacy copied value while canonical assignment references are missing or stale: ${district}`);
  }

  return {
    storeManager: storeManager.value,
    districtManager: districtManager.value,
    assistantStoreManagers: assistantResult.values,
    keyHolders: keyHolderResult.values,
    district,
    warnings,
  };
}

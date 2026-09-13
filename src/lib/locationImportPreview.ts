import { parse } from 'csv-parse/sync';
import type { DirectorySeed } from './directorySeed';
import { validateLocationHierarchyFields, type HierarchyFieldContract, type HierarchyRegistry } from './hierarchyAssignmentContract';
import {
  LOCATION_HIERARCHY_APPLICABILITY,
  LOCATION_IMPORT_COLUMNS,
  LOCATION_IMPORT_FIELDS,
  LOCATION_IMPORT_SCHEMA_VERSION,
  LOCATION_OPERATIONAL_STATUSES,
  LOCATION_RECORD_STATUSES,
  LOCATION_TIME_ZONES,
  LOCATION_TYPES,
  buildLocationImportFieldDictionary,
  buildLocationImportTemplate,
  buildLocationImportWorkedExample,
} from './locationImportSchema';
import { normalizeLocationWriteValues } from './locationWriteContract';

export {
  LOCATION_IMPORT_COLUMNS,
  LOCATION_IMPORT_FIELDS,
  LOCATION_IMPORT_SCHEMA_VERSION,
  buildLocationImportFieldDictionary,
  buildLocationImportTemplate,
  buildLocationImportWorkedExample,
} from './locationImportSchema';

type ImportRow = Record<string, string>;
type PreviewSnapshot = Pick<DirectorySeed, 'locations' | 'people' | 'regions' | 'districts'>;

export type LocationImportIssueCode =
  | 'invalid_schema_version'
  | 'missing_identity'
  | 'duplicate_csv_identity'
  | 'duplicate_existing_identity'
  | 'conflicting_identity'
  | 'invalid_attribute'
  | 'missing_required_field'
  | 'invalid_hierarchy'
  | 'missing_person_reference'
  | 'ambiguous_person_reference'
  | 'inactive_person_reference'
  | 'retirement_dependency'
  | 'leading_zero_match'
  | 'new_id_not_reserved';

export interface LocationImportIssue {
  severity: 'error' | 'warning';
  code: LocationImportIssueCode;
  field: string;
  suppliedValue: unknown;
  currentValue: unknown;
  reason: string;
  correction: string;
  candidates?: string[];
}

export interface LocationImportChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface LocationImportPreviewRow {
  rowNumber: number;
  action: 'add' | 'update' | 'unchanged' | 'blocked';
  locationId: string | null;
  currentVersion: number | null;
  matchedBy: 'LocationId' | 'StoreNumber' | null;
  storeNumber: string;
  displayName: string;
  changes: LocationImportChange[];
  issues: LocationImportIssue[];
}

export interface LocationImportPreview {
  schemaVersion: typeof LOCATION_IMPORT_SCHEMA_VERSION;
  snapshotReadAt: string;
  summary: {
    totalRows: number;
    additions: number;
    updates: number;
    unchanged: number;
    blocked: number;
    warnings: number;
  };
  rows: LocationImportPreviewRow[];
}

export class LocationImportPreviewError extends Error {
  constructor(public readonly code: 'invalid_csv' | 'unsupported_template', message: string) {
    super(message);
  }
}

const scalarFields = {
  StoreNumber: 'storeNumber',
  StoreName: 'name',
  Type: 'type',
  Address: 'address',
  City: 'city',
  State: 'state',
  ZipCode: 'zipCode',
  Phone: 'phone',
  TimeZone: 'timeZone',
  HierarchyApplicability: 'hierarchyApplicability',
  RegionId: 'regionId',
  DistrictId: 'districtId',
  StoreManagerId: 'storeManagerId',
  DistrictManagerId: 'districtManagerId',
  RegionalManagerId: 'regionalManagerId',
  OperationalStatus: 'operationalStatus',
  RecordStatus: 'recordStatus',
  GoogleReviewUrl: 'googleReviewUrl',
  StorePageUrl: 'storePageUrl',
} as const;

const listFields = {
  AssistantStoreManagerIds: 'assistantStoreManagerIds',
  KeyHolderIds: 'keyHolderIds',
} as const;

const requiredAdditionFields = [
  ['StoreNumber', 'storeNumber'],
  ['StoreName', 'name'],
  ['Type', 'type'],
  ['Address', 'address'],
  ['City', 'city'],
  ['State', 'state'],
  ['ZipCode', 'zipCode'],
  ['Phone', 'phone'],
  ['TimeZone', 'timeZone'],
  ['OperationalStatus', 'operationalStatus'],
  ['RecordStatus', 'recordStatus'],
] as const;

const hierarchyColumns = ['Type', 'HierarchyApplicability', 'RegionId', 'DistrictId'] as const;
const personColumns = {
  StoreManagerId: 'storeManagerId',
  DistrictManagerId: 'districtManagerId',
  RegionalManagerId: 'regionalManagerId',
  AssistantStoreManagerIds: 'assistantStoreManagerIds',
  KeyHolderIds: 'keyHolderIds',
} as const;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function previewLocationImport(
  csv: string,
  snapshot: PreviewSnapshot,
  snapshotReadAt = new Date().toISOString(),
): LocationImportPreview {
  const rows = parseImportRows(csv);
  const locationsById = groupBy(snapshot.locations, location => location.id);
  const locationsByStore = groupBy(snapshot.locations, location => normalizeStoreNumber(location.storeNumber));
  const peopleById = groupBy(snapshot.people, person => person.id);
  const duplicateCsvIds = duplicateValues(rows.map(row => row.LocationId).filter(Boolean));
  const duplicateCsvStores = duplicateValues(rows.map(row => normalizeStoreNumber(row.StoreNumber)).filter(Boolean));
  const registry: HierarchyRegistry = { regions: snapshot.regions, districts: snapshot.districts };

  const previewRows = rows.map((row, index) => {
    const rowNumber = index + 2;
    const issues: LocationImportIssue[] = [];
    const normalizedStore = normalizeStoreNumber(row.StoreNumber);
    validateRowIdentitySyntax(row, issues);

    if (row.LocationId && duplicateCsvIds.has(row.LocationId)) {
      const candidates = rows.flatMap((candidate, candidateIndex) => candidate.LocationId === row.LocationId ? [`CSV row ${candidateIndex + 2}`] : []);
      issues.push(issue('error', 'duplicate_csv_identity', 'LocationId', row.LocationId, null, 'The same Location ID appears in multiple CSV rows.', 'Keep one row per Location ID and preview again.', candidates));
    }
    if (normalizedStore && duplicateCsvStores.has(normalizedStore)) {
      const candidates = rows.flatMap((candidate, candidateIndex) => normalizeStoreNumber(candidate.StoreNumber) === normalizedStore ? [`CSV row ${candidateIndex + 2}: ${candidate.StoreNumber}`] : []);
      issues.push(issue('error', 'duplicate_csv_identity', 'StoreNumber', row.StoreNumber, null, 'Multiple CSV rows have the same numeric store number after leading zeros are removed.', 'Give each row a unique numeric store number or remove the duplicate row.', candidates));
    }

    const idMatches = row.LocationId ? locationsById.get(row.LocationId) || [] : [];
    const storeMatches = normalizedStore ? locationsByStore.get(normalizedStore) || [] : [];
    if (idMatches.length > 1) {
      issues.push(issue('error', 'duplicate_existing_identity', 'LocationId', row.LocationId, null, 'The directory contains multiple Locations with this ID.', 'Repair the duplicate directory records before previewing again.', idMatches.map(locationCandidate)));
    }
    if (storeMatches.length > 1) {
      issues.push(issue('error', 'duplicate_existing_identity', 'StoreNumber', row.StoreNumber, null, 'The directory contains multiple Locations with this numeric store number.', 'Repair the duplicate directory records before previewing again.', storeMatches.map(locationCandidate)));
    }

    const idMatch = idMatches.length === 1 ? idMatches[0] : undefined;
    const storeMatch = storeMatches.length === 1 ? storeMatches[0] : undefined;
    let existing = row.LocationId ? idMatch : storeMatch;
    let matchedBy: LocationImportPreviewRow['matchedBy'] = row.LocationId && idMatch ? 'LocationId' : !row.LocationId && storeMatch ? 'StoreNumber' : null;

    if (row.LocationId && !idMatch && storeMatch) {
      issues.push(issue('error', 'conflicting_identity', 'LocationId', row.LocationId, storeMatch.id, 'The supplied Location ID does not match the existing Location with this store number.', 'Use the existing Location ID shown in Candidates, or use a different unique store number for a new Location.', [locationCandidate(storeMatch)]));
      existing = undefined;
      matchedBy = null;
    } else if (idMatch && storeMatch && idMatch.id !== storeMatch.id) {
      issues.push(issue('error', 'conflicting_identity', 'StoreNumber', row.StoreNumber, idMatch.storeNumber, 'LocationId and StoreNumber resolve to different existing Locations.', 'Correct one identity so both values identify the same Location.', [locationCandidate(idMatch), locationCandidate(storeMatch)]));
    }

    if (!row.LocationId && !row.StoreNumber) {
      issues.push(issue('error', 'missing_identity', 'LocationId / StoreNumber', '', null, 'The row has no identity for matching or addition.', 'Provide an existing LocationId, or provide a numeric StoreNumber.'));
    }
    if (existing && matchedBy === 'StoreNumber' && row.StoreNumber !== existing.storeNumber) {
      issues.push(issue('warning', 'leading_zero_match', 'StoreNumber', row.StoreNumber, existing.storeNumber, 'The row matched after leading zeros were removed; the supplied text is still proposed as the new stored value.', 'Confirm the displayed StoreNumber change, or copy the current StoreNumber exactly.'));
    }

    const proposedInput: Record<string, unknown> = existing ? { ...existing } : {};
    if (row.LocationId && !existing) proposedInput.id = row.LocationId;
    for (const [column, field] of Object.entries(scalarFields)) {
      if (row[column]) proposedInput[field] = row[column];
    }
    for (const [column, field] of Object.entries(listFields)) {
      if (row[column]) proposedInput[field] = parseIdList(row[column]);
    }

    validateImportedAttributes(row, proposedInput, issues);
    const intendedAddition = !existing && !issues.some(item => ['conflicting_identity', 'duplicate_existing_identity'].includes(item.code));
    if (intendedAddition) {
      for (const [column, field] of requiredAdditionFields) {
        if (!proposedInput[field]) issues.push(issue('error', 'missing_required_field', column, row[column], null, `${column} is required for a new Location.`, `Enter ${fieldDefinition(column)?.format || 'a valid value'} and preview again.`));
      }
      if (row.LocationId) {
        issues.push(issue('warning', 'new_id_not_reserved', 'LocationId', row.LocationId, null, 'Preview does not reserve a new Location ID.', 'Before any future save, revalidate that the ID is still available.'));
      }
    }

    const normalized = normalizeLocationWriteValues(proposedInput, existing as unknown as Record<string, unknown> | undefined);
    for (const normalizationIssue of normalized.issues) {
      const column = columnForField(normalizationIssue.field);
      issues.push(issue('error', 'invalid_attribute', column, row[column], existing?.[normalizationIssue.field as keyof typeof existing] ?? null, normalizationIssue.message, `Use ${fieldDefinition(column)?.format || 'an accepted value'} and preview again.`));
    }
    const proposed = normalized.values;

    const hierarchyTouched = !existing || hierarchyColumns.some(column => Boolean(row[column]));
    const assignmentListsTouched = Boolean(row.AssistantStoreManagerIds || row.KeyHolderIds);
    if (hierarchyTouched || assignmentListsTouched) {
      const validationInput: HierarchyFieldContract = hierarchyTouched
        ? proposed as unknown as HierarchyFieldContract
        : {
          type: String(proposed.type),
          assistantStoreManagerIds: row.AssistantStoreManagerIds ? proposed.assistantStoreManagerIds as string[] : undefined,
          keyHolderIds: row.KeyHolderIds ? proposed.keyHolderIds as string[] : undefined,
        };
      const hierarchyIssues = validateLocationHierarchyFields(validationInput, registry);
      for (const reason of hierarchyIssues) {
        const duplicateAssignment = reason.includes('duplicate assignment');
        issues.push(issue(
          'error',
          'invalid_hierarchy',
          duplicateAssignment ? (reason.startsWith('assistantStoreManagerIds') ? 'AssistantStoreManagerIds' : 'KeyHolderIds') : 'RegionId / DistrictId',
          duplicateAssignment ? (reason.startsWith('assistantStoreManagerIds') ? row.AssistantStoreManagerIds : row.KeyHolderIds) : `${row.RegionId || '(blank)'} / ${row.DistrictId || '(blank)'}`,
          duplicateAssignment ? null : existing ? `${existing.regionId || '(blank)'} / ${existing.districtId || '(blank)'}` : null,
          reason,
          duplicateAssignment ? 'Remove the repeated Person ID and preview again.' : 'Correct the CSV IDs using Reference IDs, or intentionally repair the hierarchy registry and affected records before previewing again.',
        ));
      }
    }

    for (const [column, field] of Object.entries(personColumns)) {
      if (existing && !row[column]) continue;
      const ids = Array.isArray(proposed[field]) ? proposed[field] as string[] : proposed[field] ? [String(proposed[field])] : [];
      for (const personId of ids) {
        const matches = peopleById.get(personId) || [];
        if (matches.length === 0) {
          issues.push(issue('error', 'missing_person_reference', column, personId, existing?.[field as keyof typeof existing] ?? null, 'No Person has this canonical ID.', 'Correct the ID or create the real Person separately, then preview again.'));
        } else if (matches.length > 1) {
          issues.push(issue('error', 'ambiguous_person_reference', column, personId, existing?.[field as keyof typeof existing] ?? null, 'Multiple People have this canonical ID.', 'Repair the duplicate Person identities and explicitly correct the CSV before previewing again.', matches.map(person => `${person.id} — ${person.fullName} (${personStatus(person)})`)));
        } else if (!isActivePerson(matches[0])) {
          issues.push(issue('error', 'inactive_person_reference', column, personId, existing?.[field as keyof typeof existing] ?? null, `The referenced Person is ${personStatus(matches[0])}.`, 'Choose an Active Person ID, or intentionally correct the Person lifecycle separately, then preview again.', [`${matches[0].id} — ${matches[0].fullName}`]));
        }
      }
    }

    if (existing && row.RecordStatus === 'Retired' && existing.recordStatus !== 'Retired') {
      const incoming = snapshot.people.filter(person => person.primaryLocationId === existing.id || person.supportedLocationIds?.includes(existing.id));
      if (incoming.length > 0) {
        issues.push(issue('error', 'retirement_dependency', 'RecordStatus', row.RecordStatus, existing.recordStatus, 'This Location has incoming Works at or Supports relationships.', 'Reassign or clear those Person relationships separately, then rebuild the preview.', incoming.map(person => `${person.id} — ${person.fullName}`)));
      }
    }

    const changes = importedChanges(row, proposed, existing as unknown as Record<string, unknown> | undefined);
    const action = issues.some(item => item.severity === 'error') ? 'blocked' : existing ? changes.length ? 'update' : 'unchanged' : 'add';
    return {
      rowNumber,
      action,
      locationId: existing?.id || row.LocationId || null,
      currentVersion: existing && typeof existing.version === 'number' ? existing.version : existing ? 0 : null,
      matchedBy,
      storeNumber: String(proposed.storeNumber || row.StoreNumber),
      displayName: String(proposed.name || row.StoreName || `Row ${rowNumber}`),
      changes,
      issues,
    } satisfies LocationImportPreviewRow;
  });

  const resolvedRowsByLocationId = groupBy(
    previewRows.filter(row => row.matchedBy && row.locationId),
    row => row.locationId || '',
  );
  const evaluatedRows = previewRows.map(row => {
    if (!row.locationId || (resolvedRowsByLocationId.get(row.locationId)?.length || 0) < 2) return row;
    const candidates = resolvedRowsByLocationId.get(row.locationId)!.map(candidate => `CSV row ${candidate.rowNumber}`);
    const collision = issue(
      'error',
      'duplicate_csv_identity',
      'LocationId / StoreNumber',
      `${row.locationId} / ${row.storeNumber || '(blank)'}`,
      row.locationId,
      'Multiple CSV rows resolve to the same existing Location, including through different identity fields.',
      'Keep one row for this Location and preview again.',
      candidates,
    );
    return {
      ...row,
      action: 'blocked' as const,
      issues: row.issues.some(item => item.code === collision.code && item.reason === collision.reason)
        ? row.issues
        : [...row.issues, collision],
    };
  });

  return {
    schemaVersion: LOCATION_IMPORT_SCHEMA_VERSION,
    snapshotReadAt,
    summary: {
      totalRows: evaluatedRows.length,
      additions: evaluatedRows.filter(row => row.action === 'add').length,
      updates: evaluatedRows.filter(row => row.action === 'update').length,
      unchanged: evaluatedRows.filter(row => row.action === 'unchanged').length,
      blocked: evaluatedRows.filter(row => row.action === 'blocked').length,
      warnings: evaluatedRows.flatMap(row => row.issues).filter(item => item.severity === 'warning').length,
    },
    rows: evaluatedRows,
  };
}

function parseImportRows(csv: string): ImportRow[] {
  let matrix: string[][];
  try {
    matrix = parse(csv, { bom: true, skip_empty_lines: true, trim: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Malformed row.';
    throw new LocationImportPreviewError('invalid_csv', `The file is not valid CSV: ${detail}`);
  }
  if (matrix.length === 0) throw new LocationImportPreviewError('invalid_csv', 'The CSV file is empty. Download the blank template and try again.');
  const headers = matrix[0].map(value => value.trim());
  const duplicateHeaders = [...duplicateValues(headers)];
  const missingColumns = LOCATION_IMPORT_COLUMNS.filter(column => !headers.includes(column));
  const extraColumns = headers.filter(column => !LOCATION_IMPORT_COLUMNS.includes(column));
  if (duplicateHeaders.length || missingColumns.length || extraColumns.length || headers.length !== LOCATION_IMPORT_COLUMNS.length) {
    throw new LocationImportPreviewError('unsupported_template', [
      `Use the supported ${LOCATION_IMPORT_SCHEMA_VERSION} template.`,
      `Duplicate headers: ${duplicateHeaders.join(', ') || 'none'}.`,
      `Missing headers: ${missingColumns.join(', ') || 'none'}.`,
      `Unsupported headers: ${extraColumns.join(', ') || 'none'}.`,
    ].join(' '));
  }
  return matrix.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function validateRowIdentitySyntax(row: ImportRow, issues: LocationImportIssue[]): void {
  if (row.SchemaVersion !== LOCATION_IMPORT_SCHEMA_VERSION) {
    issues.push(issue('error', 'invalid_schema_version', 'SchemaVersion', row.SchemaVersion, LOCATION_IMPORT_SCHEMA_VERSION, 'The row uses an unsupported schema version.', `Set SchemaVersion to ${LOCATION_IMPORT_SCHEMA_VERSION}.`));
  }
  if (row.LocationId && !ID_PATTERN.test(row.LocationId)) {
    issues.push(issue('error', 'invalid_attribute', 'LocationId', row.LocationId, null, 'LocationId has an unsupported format.', `Use ${fieldDefinition('LocationId')?.format}.`));
  }
  if (row.StoreNumber && !/^\d+$/.test(row.StoreNumber)) {
    issues.push(issue('error', 'invalid_attribute', 'StoreNumber', row.StoreNumber, null, 'Only numeric store numbers can be matched by this preview.', 'Use digits only. Non-numeric Location identities are not supported in locations-v1.'));
  }
}

function validateImportedAttributes(row: ImportRow, proposed: Record<string, unknown>, issues: LocationImportIssue[]): void {
  validateAllowed(row, 'Type', LOCATION_TYPES, issues);
  validateAllowed(row, 'OperationalStatus', LOCATION_OPERATIONAL_STATUSES, issues);
  validateAllowed(row, 'RecordStatus', LOCATION_RECORD_STATUSES, issues);
  validateAllowed(row, 'TimeZone', LOCATION_TIME_ZONES, issues);
  validateAllowed(row, 'HierarchyApplicability', LOCATION_HIERARCHY_APPLICABILITY, issues);
  if (row.State && !/^[A-Z]{2}$/.test(row.State)) {
    issues.push(issue('error', 'invalid_attribute', 'State', row.State, proposed.state, 'State must be a two-letter uppercase abbreviation.', 'Use a value such as CA.'));
  }
  if (row.ZipCode && !/^\d{5}(?:-\d{4})?$/.test(row.ZipCode)) {
    issues.push(issue('error', 'invalid_attribute', 'ZipCode', row.ZipCode, proposed.zipCode, 'ZipCode must be 5 digits or ZIP+4.', 'Use a value such as 90001 or 90001-1234.'));
  }
  for (const column of Object.keys(personColumns)) {
    if (!row[column]) continue;
    for (const personId of parseIdList(row[column])) {
      if (!ID_PATTERN.test(personId)) issues.push(issue('error', 'invalid_attribute', column, personId, null, 'Person IDs may contain only letters, numbers, periods, underscores, and hyphens.', 'Copy the canonical ID from Reference IDs.'));
    }
  }
}

function validateAllowed(row: ImportRow, column: string, allowed: readonly string[], issues: LocationImportIssue[]): void {
  if (!row[column] || allowed.includes(row[column])) return;
  issues.push(issue('error', 'invalid_attribute', column, row[column], null, `${column} is not an accepted value.`, `Use one of: ${allowed.join(' | ')}.`));
}

function importedChanges(row: ImportRow, proposed: Record<string, unknown>, existing?: Record<string, unknown>): LocationImportChange[] {
  const fields = [
    ...(row.LocationId && !existing ? ['id'] : []),
    ...Object.entries(scalarFields).filter(([column]) => row[column]).map(([, field]) => field),
    ...Object.entries(listFields).filter(([column]) => row[column]).map(([, field]) => field),
    ...(row.Phone && proposed.phoneExtension !== existing?.phoneExtension ? ['phoneExtension'] : []),
  ];
  return [...new Set(fields)]
    .filter(field => !sameValue(existing?.[field], proposed[field]))
    .map(field => ({ field, before: existing?.[field] ?? null, after: proposed[field] ?? null }));
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function parseIdList(value: string): string[] {
  return value.split(';').map(item => item.trim()).filter(Boolean);
}

function normalizeStoreNumber(value: unknown): string {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return '';
  return value.trim().replace(/^0+(?=\d)/, '');
}

function duplicateValues(values: string[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return duplicates;
}

function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const identity = key(value);
    if (!identity) continue;
    grouped.set(identity, [...(grouped.get(identity) || []), value]);
  }
  return grouped;
}

function fieldDefinition(column: string) {
  return LOCATION_IMPORT_FIELDS.find(field => field.column === column);
}

function columnForField(field: string): string {
  return LOCATION_IMPORT_FIELDS.find(definition => definition.field === field)?.column || field;
}

function locationCandidate(location: PreviewSnapshot['locations'][number]): string {
  return `${location.id} — Store ${location.storeNumber} — ${location.name}`;
}

function isActivePerson(person: PreviewSnapshot['people'][number]): boolean {
  return (!person.status || person.status === 'Active') && person.activeStatus !== false;
}

function personStatus(person: PreviewSnapshot['people'][number]): string {
  return isActivePerson(person) ? 'Active' : 'Inactive';
}

function issue(
  severity: LocationImportIssue['severity'],
  code: LocationImportIssueCode,
  field: string,
  suppliedValue: unknown,
  currentValue: unknown,
  reason: string,
  correction: string,
  candidates?: string[],
): LocationImportIssue {
  return { severity, code, field, suppliedValue, currentValue, reason, correction, ...(candidates?.length ? { candidates } : {}) };
}
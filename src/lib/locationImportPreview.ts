import { parse } from 'csv-parse/sync';
import type { LocationRecord } from '../types';
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
  restoreSpreadsheetSafeCsvValue,
  suggestLocationImportHeaderMappings,
  type LocationImportHeaderMapping,
  type LocationImportMode,
} from './locationImportSchema';
import { normalizeLocationWriteValues } from './locationWriteContract';

export {
  LOCATION_IMPORT_COLUMNS,
  LOCATION_IMPORT_FIELDS,
  LOCATION_IMPORT_SCHEMA_VERSION,
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
  | 'new_id_not_reserved'
  | 'new_location_not_allowed';

export interface LocationImportIssue {
  severity: 'error' | 'warning';
  code: LocationImportIssueCode;
  field: string;
  suppliedValue: unknown;
  currentValue: unknown;
  proposedValue: unknown;
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
  sourceValues: string[];
}

export interface LocationImportPreview {
  schemaVersion: typeof LOCATION_IMPORT_SCHEMA_VERSION;
  snapshotReadAt: string;
  confirmationToken?: string;
  operationId?: string;
  batchId?: string;
  expiresAt?: string;
  confirmationDisabledReason?: string;
  mode?: LocationImportMode;
  mappings?: LocationImportHeaderMapping[];
  selectedRowNumbers?: number[];
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

export interface LocationImportReceiptLocation {
  id: string;
  name: string;
  storeNumber: string;
  record: LocationRecord;
}

export interface LocationImportReceipt {
  operationId: string;
  batchId: string;
  committedAt: string;
  additions: number;
  updates: number;
  unchanged: number;
  locations: LocationImportReceiptLocation[];
  replayed: boolean;
}

export interface LocationImportPlannedWrite {
  rowNumber?: number;
  id: string;
  action: 'add' | 'update';
  expectedVersion: number | null;
  data: Record<string, unknown>;
}

export interface LocationImportUnchangedAssertion {
  id: string;
  expectedVersion: number;
  storeNumber: string;
}

export interface LocationImportPlan {
  preview: LocationImportPreview;
  writes: LocationImportPlannedWrite[];
  unchanged: LocationImportUnchangedAssertion[];
}

export interface LocationImportPlanOptions {
  mappings?: LocationImportHeaderMapping[];
  mode?: LocationImportMode;
}

export class LocationImportPreviewError extends Error {
  constructor(public readonly code: 'invalid_csv' | 'unsupported_template' | 'directory_export_not_importable', message: string) {
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

const hierarchyFields = ['type', 'hierarchyApplicability', 'regionId', 'districtId'] as const;
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
  return buildLocationImportPlan(csv, snapshot, snapshotReadAt).preview;
}

export function buildLocationImportPlan(
  csv: string,
  snapshot: PreviewSnapshot,
  snapshotReadAt = new Date().toISOString(),
  createLocationId: () => string = () => '',
  options: LocationImportPlanOptions = {},
): LocationImportPlan {
  const parsed = parseImportRows(csv, options.mappings);
  const rows = parsed.rows;
  const mode = options.mode ?? 'add-and-update';
  const proposedWrites = new Map<number, Record<string, unknown>>();
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
      if (!row[column]) continue;
      const ids = parseIdList(row[column]);
      if (ids.length === 0) {
        issues.push(issue(
          'error',
          'invalid_attribute',
          column,
          row[column],
          existing?.[field as keyof typeof existing] ?? null,
          'A populated assignment-list cell must contain at least one Person ID; delimiters and whitespace alone are not an explicit clear.',
          'Enter one or more canonical Person IDs separated by semicolons, or leave the cell blank to preserve the current value.',
          undefined,
          existing?.[field as keyof typeof existing] ?? null,
        ));
        continue;
      }
      proposedInput[field] = ids;
    }

    validateImportedAttributes(row, proposedInput, existing as unknown as Record<string, unknown> | undefined, issues);
    const intendedAddition = !existing && !issues.some(item => ['conflicting_identity', 'duplicate_existing_identity'].includes(item.code));
    if (intendedAddition && mode === 'update-existing-only') {
      issues.push(issue('error', 'new_location_not_allowed', 'LocationId / StoreNumber', `${row.LocationId || '(blank)'} / ${row.StoreNumber || '(blank)'}`, null, 'This row does not match an existing Location and the import is in Update existing only mode.', 'Correct the identity to match an existing Location, or explicitly switch to Add and update mode.'));
    }
    if (intendedAddition) {
      for (const [column, field] of requiredAdditionFields) {
        if (!proposedInput[field]) issues.push(issue('error', 'missing_required_field', column, row[column], null, `${column} is required for a new Location.`, `Enter ${fieldDefinition(column)?.format || 'a valid value'} and preview again.`));
      }
    }

    const normalized = normalizeLocationWriteValues(proposedInput, existing as unknown as Record<string, unknown> | undefined);
    for (const normalizationIssue of normalized.issues) {
      const column = columnForField(normalizationIssue.field);
      issues.push(issue('error', 'invalid_attribute', column, row[column], existing?.[normalizationIssue.field as keyof typeof existing] ?? null, normalizationIssue.message, `Use ${fieldDefinition(column)?.format || 'an accepted value'} and preview again.`, undefined, normalized.values[normalizationIssue.field] ?? null));
    }
    const proposed = normalized.values;
    if (intendedAddition) proposed.id = row.LocationId || createLocationId();

    const hierarchyChanged = !existing || hierarchyFields.some(field => !sameValue(existing[field], proposed[field]));
    const assignmentListsChanged = !existing || Object.values(listFields).some(field => !sameValue(existing?.[field], proposed[field]));
    if (hierarchyChanged || assignmentListsChanged) {
      const validationInput: HierarchyFieldContract = hierarchyChanged
        ? proposed as unknown as HierarchyFieldContract
        : {
          type: String(proposed.type),
          assistantStoreManagerIds: !sameValue(existing?.assistantStoreManagerIds, proposed.assistantStoreManagerIds) ? proposed.assistantStoreManagerIds as string[] : undefined,
          keyHolderIds: !sameValue(existing?.keyHolderIds, proposed.keyHolderIds) ? proposed.keyHolderIds as string[] : undefined,
        };
      const hierarchyIssues = validateLocationHierarchyFields(validationInput, registry);
      for (const reason of hierarchyIssues) {
        const duplicateAssignment = reason.includes('duplicate assignment');
        issues.push(issue(
          'error',
          'invalid_hierarchy',
          duplicateAssignment ? (reason.startsWith('assistantStoreManagerIds') ? 'AssistantStoreManagerIds' : 'KeyHolderIds') : 'RegionId / DistrictId',
          duplicateAssignment ? (reason.startsWith('assistantStoreManagerIds') ? row.AssistantStoreManagerIds : row.KeyHolderIds) : `${row.RegionId || '(blank)'} / ${row.DistrictId || '(blank)'}`,
          duplicateAssignment
            ? (reason.startsWith('assistantStoreManagerIds') ? existing?.assistantStoreManagerIds : existing?.keyHolderIds) ?? null
            : existing ? `${existing.regionId || '(blank)'} / ${existing.districtId || '(blank)'}` : null,
          reason,
          duplicateAssignment ? 'Remove the repeated Person ID and preview again.' : 'Correct the CSV IDs using Reference IDs, or intentionally repair the hierarchy registry and affected records before previewing again.',
          undefined,
          duplicateAssignment
            ? (reason.startsWith('assistantStoreManagerIds') ? proposed.assistantStoreManagerIds : proposed.keyHolderIds)
            : `${proposed.regionId || '(blank)'} / ${proposed.districtId || '(blank)'}`,
        ));
      }
    }

    for (const [column, field] of Object.entries(personColumns)) {
      if (existing && sameValue(existing[field as keyof typeof existing], proposed[field])) continue;
      const ids = Array.isArray(proposed[field]) ? proposed[field] as string[] : proposed[field] ? [String(proposed[field])] : [];
      for (const personId of ids) {
        const matches = peopleById.get(personId) || [];
        if (matches.length === 0) {
          issues.push(issue('error', 'missing_person_reference', column, personId, existing?.[field as keyof typeof existing] ?? null, 'No Person has this canonical ID.', 'Correct the ID or create the real Person separately, then preview again.', undefined, proposed[field]));
        } else if (matches.length > 1) {
          issues.push(issue('error', 'ambiguous_person_reference', column, personId, existing?.[field as keyof typeof existing] ?? null, 'Multiple People have this canonical ID.', 'Repair the duplicate Person identities and explicitly correct the CSV before previewing again.', matches.map(person => `${person.id} — ${person.fullName} (${personStatus(person)})`), proposed[field]));
        } else if (!isActivePerson(matches[0])) {
          issues.push(issue('error', 'inactive_person_reference', column, personId, existing?.[field as keyof typeof existing] ?? null, `The referenced Person is ${personStatus(matches[0])}.`, 'Choose an Active Person ID, or intentionally correct the Person lifecycle separately, then preview again.', [`${matches[0].id} — ${matches[0].fullName}`], proposed[field]));
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
    proposedWrites.set(rowNumber, proposed);
    return {
      rowNumber,
      action,
      locationId: existing?.id || (typeof proposed.id === 'string' && proposed.id ? proposed.id : null),
      currentVersion: existing && typeof existing.version === 'number' ? existing.version : existing ? 0 : null,
      matchedBy,
      storeNumber: String(proposed.storeNumber || row.StoreNumber),
      displayName: String(proposed.name || row.StoreName || `Row ${rowNumber}`),
      changes,
      issues,
      sourceValues: parsed.sourceRows[index].map(restoreSpreadsheetSafeCsvValue),
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

  const preview: LocationImportPreview = {
      schemaVersion: LOCATION_IMPORT_SCHEMA_VERSION,
      snapshotReadAt,
      mode,
      mappings: parsed.mappings,
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
  return {
    preview,
    writes: evaluatedRows.flatMap(row => {
      if ((row.action !== 'add' && row.action !== 'update') || !row.locationId) return [];
      return [{
        rowNumber: row.rowNumber,
        id: row.locationId,
        action: row.action,
        expectedVersion: row.action === 'add' ? null : row.currentVersion,
        data: proposedWrites.get(row.rowNumber) || {},
      } satisfies LocationImportPlannedWrite];
    }),
    unchanged: evaluatedRows.flatMap(row => row.action === 'unchanged' && row.locationId
      ? [{ id: row.locationId, expectedVersion: row.currentVersion ?? 0, storeNumber: row.storeNumber }]
      : []),
  };
}

function parseImportRows(csv: string, suppliedMappings?: LocationImportHeaderMapping[]): { rows: ImportRow[]; mappings: LocationImportHeaderMapping[]; sourceRows: string[][] } {
  let matrix: string[][];
  try {
    matrix = parse(csv, { bom: true, skip_empty_lines: true, trim: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Malformed row.';
    throw new LocationImportPreviewError('invalid_csv', `The file is not valid CSV: ${detail}`);
  }
  if (matrix.length === 0) throw new LocationImportPreviewError('invalid_csv', 'The CSV file is empty. Download the blank template and try again.');
  const headers = matrix[0].map(value => value.trim());
  const suggestedMappings = suggestLocationImportHeaderMappings(headers);
  const mappings = suppliedMappings ?? suggestedMappings;
  if (mappings.length !== headers.length || mappings.some((mapping, index) => mapping.sourceIndex !== index || mapping.sourceHeader.trim() !== headers[index])) {
    throw new LocationImportPreviewError('unsupported_template', 'The reviewed header mapping does not match this CSV file. Review the headings again.');
  }
  const invalidTargets = mappings.filter(mapping => mapping.target !== null && !LOCATION_IMPORT_COLUMNS.includes(mapping.target));
  const duplicateTargets = [...duplicateValues(mappings.flatMap(mapping => mapping.target ? [mapping.target] : []))];
  const unsupportedWithoutReview = suppliedMappings === undefined
    ? mappings.filter(mapping => mapping.kind === 'unsupported').map(mapping => mapping.sourceHeader)
    : [];
  const identityColumns = mappings.flatMap(mapping => mapping.target && ['LocationId', 'StoreNumber'].includes(mapping.target) ? [mapping.target] : []);
  if (invalidTargets.length || duplicateTargets.length || unsupportedWithoutReview.length || identityColumns.length === 0) {
    throw new LocationImportPreviewError('unsupported_template', [
      `Map supported ${LOCATION_IMPORT_SCHEMA_VERSION} columns and include LocationId or StoreNumber.`,
      `Duplicate target mappings: ${duplicateTargets.join(', ') || 'none'}.`,
      `Unsupported headings needing explicit Ignore: ${unsupportedWithoutReview.join(', ') || 'none'}.`,
    ].join(' '));
  }
  const sourceRows = matrix.slice(1);
  const rows = sourceRows.map((values, index) => {
    if (values.length !== headers.length) {
      throw new LocationImportPreviewError('invalid_csv', `CSV row ${index + 2} has ${values.length} values for ${headers.length} headings. Correct the row boundaries and preview again.`);
    }
    const suggestedSchemaMapping = suggestedMappings.find(mapping => mapping.target === 'SchemaVersion');
    const suppliedSchemaVersion = suggestedSchemaMapping
      ? restoreSpreadsheetSafeCsvValue(values[suggestedSchemaMapping.sourceIndex] || '')
      : '';
    const row: ImportRow = { SchemaVersion: suppliedSchemaVersion || LOCATION_IMPORT_SCHEMA_VERSION };
    mappings.forEach(mapping => {
      if (mapping.target && (mapping.target !== 'SchemaVersion' || !suppliedSchemaVersion)) {
        row[mapping.target] = restoreSpreadsheetSafeCsvValue(values[mapping.sourceIndex] || '');
      }
    });
    if (!row.SchemaVersion) row.SchemaVersion = LOCATION_IMPORT_SCHEMA_VERSION;
    return row;
  });
  return { rows, mappings, sourceRows };
}

function validateRowIdentitySyntax(row: ImportRow, issues: LocationImportIssue[]): void {
  if (row.SchemaVersion && row.SchemaVersion !== LOCATION_IMPORT_SCHEMA_VERSION) {
    issues.push(issue('error', 'invalid_schema_version', 'SchemaVersion', row.SchemaVersion, LOCATION_IMPORT_SCHEMA_VERSION, 'The row uses an unsupported schema version.', `Set SchemaVersion to ${LOCATION_IMPORT_SCHEMA_VERSION}.`));
  }
  if (row.LocationId && !ID_PATTERN.test(row.LocationId)) {
    issues.push(issue('error', 'invalid_attribute', 'LocationId', row.LocationId, null, 'LocationId has an unsupported format.', `Use ${fieldDefinition('LocationId')?.format}.`));
  }
  if (row.StoreNumber && !/^\d+$/.test(row.StoreNumber)) {
    issues.push(issue('error', 'invalid_attribute', 'StoreNumber', row.StoreNumber, null, 'Only numeric store numbers can be matched by this preview.', 'Use digits only. Non-numeric Location identities are not supported in locations-v1.'));
  }
}

function validateImportedAttributes(row: ImportRow, proposed: Record<string, unknown>, existing: Record<string, unknown> | undefined, issues: LocationImportIssue[]): void {
  validateAllowed(row, 'Type', LOCATION_TYPES, proposed, existing, issues, true);
  validateAllowed(row, 'OperationalStatus', LOCATION_OPERATIONAL_STATUSES, proposed, existing, issues);
  validateAllowed(row, 'RecordStatus', LOCATION_RECORD_STATUSES, proposed, existing, issues);
  validateAllowed(row, 'TimeZone', LOCATION_TIME_ZONES, proposed, existing, issues);
  validateAllowed(row, 'HierarchyApplicability', LOCATION_HIERARCHY_APPLICABILITY, proposed, existing, issues, true);
  if (row.State && !/^[A-Z]{2}$/.test(row.State)) {
    issues.push(issue('error', 'invalid_attribute', 'State', row.State, existing?.state ?? null, 'State must be a two-letter uppercase abbreviation.', 'Use a value such as CA.', undefined, proposed.state));
  }
  if (row.ZipCode && !/^\d{5}(?:-\d{4})?$/.test(row.ZipCode)) {
    issues.push(issue('error', 'invalid_attribute', 'ZipCode', row.ZipCode, existing?.zipCode ?? null, 'ZipCode must be 5 digits or ZIP+4.', 'Use a value such as 90001 or 90001-1234.', undefined, proposed.zipCode));
  }
  for (const column of Object.keys(personColumns)) {
    if (!row[column]) continue;
    const field = personColumns[column as keyof typeof personColumns];
    if (existing && sameValue(existing[field], proposed[field])) continue;
    for (const personId of parseIdList(row[column])) {
      if (!ID_PATTERN.test(personId)) issues.push(issue('error', 'invalid_attribute', column, personId, existing?.[field] ?? null, 'Person IDs may contain only letters, numbers, periods, underscores, and hyphens.', 'Copy the canonical ID from Reference IDs.', undefined, proposed[field]));
    }
  }
}

function validateAllowed(
  row: ImportRow,
  column: string,
  allowed: readonly string[],
  proposed: Record<string, unknown>,
  existing: Record<string, unknown> | undefined,
  issues: LocationImportIssue[],
  onlyWhenChanged = false,
): void {
  if (!row[column] || allowed.includes(row[column])) return;
  const field = fieldDefinition(column)?.field;
  if (onlyWhenChanged && field && existing && sameValue(existing[field], proposed[field])) return;
  issues.push(issue('error', 'invalid_attribute', column, row[column], field ? existing?.[field] ?? null : null, `${column} is not an accepted value.`, `Use one of: ${allowed.join(' | ')}.`, undefined, field ? proposed[field] : row[column]));
}

function importedChanges(row: ImportRow, proposed: Record<string, unknown>, existing?: Record<string, unknown>): LocationImportChange[] {
  const fields = [
    ...(!existing && proposed.id ? ['id'] : []),
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
  proposedValue: unknown = suppliedValue,
): LocationImportIssue {
  return { severity, code, field, suppliedValue, currentValue, proposedValue, reason, correction, ...(candidates?.length ? { candidates } : {}) };
}
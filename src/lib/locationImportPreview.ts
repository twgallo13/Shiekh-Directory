import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import type { DirectorySeed } from './directorySeed';
import { validateLocationHierarchyFields, type HierarchyFieldContract, type HierarchyRegistry } from './hierarchyAssignmentContract';

export const LOCATION_IMPORT_SCHEMA_VERSION = 'locations-v1';

export const LOCATION_IMPORT_COLUMNS = [
  'SchemaVersion',
  'LocationId',
  'StoreNumber',
  'StoreName',
  'Type',
  'Address',
  'City',
  'State',
  'ZipCode',
  'Phone',
  'TimeZone',
  'HierarchyApplicability',
  'RegionId',
  'DistrictId',
  'StoreManagerId',
  'DistrictManagerId',
  'RegionalManagerId',
  'AssistantStoreManagerIds',
  'KeyHolderIds',
  'OperationalStatus',
  'RecordStatus',
  'GoogleReviewUrl',
  'StorePageUrl',
] as const;

type ImportColumn = typeof LOCATION_IMPORT_COLUMNS[number];
type ImportRow = Record<ImportColumn, string>;

export type LocationImportIssueCode =
  | 'duplicate_csv_identity'
  | 'duplicate_existing_identity'
  | 'conflicting_identity'
  | 'invalid_schema_version'
  | 'missing_required_field'
  | 'invalid_hierarchy'
  | 'missing_person_reference'
  | 'inactive_person_reference';

export interface LocationImportIssue {
  code: LocationImportIssueCode;
  field: string;
  message: string;
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
  storeNumber: string;
  displayName: string;
  changes: LocationImportChange[];
  issues: LocationImportIssue[];
}

export interface LocationImportPreview {
  schemaVersion: typeof LOCATION_IMPORT_SCHEMA_VERSION;
  summary: {
    totalRows: number;
    additions: number;
    updates: number;
    unchanged: number;
    blocked: number;
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

const personFields = ['storeManagerId', 'districtManagerId', 'regionalManagerId', 'assistantStoreManagerIds', 'keyHolderIds'] as const;

export function buildLocationImportTemplate(): string {
  return stringify([], { header: true, columns: [...LOCATION_IMPORT_COLUMNS], record_delimiter: '\r\n', bom: false });
}

export function previewLocationImport(csv: string, snapshot: Pick<DirectorySeed, 'locations' | 'people' | 'regions' | 'districts'>): LocationImportPreview {
  let sourceRows: Record<string, string>[];
  let headers: string[] = [];
  try {
    sourceRows = parse(csv, {
      bom: true,
      columns: header => {
        headers = header.map((value: string) => value.trim());
        return headers;
      },
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    throw new LocationImportPreviewError('invalid_csv', 'The file is not valid CSV.');
  }
  const missingColumns = LOCATION_IMPORT_COLUMNS.filter(column => !headers.includes(column));
  const extraColumns = headers.filter(column => !LOCATION_IMPORT_COLUMNS.includes(column as ImportColumn));
  if (missingColumns.length || extraColumns.length) {
    throw new LocationImportPreviewError('unsupported_template', `Use the supported ${LOCATION_IMPORT_SCHEMA_VERSION} template. Missing: ${missingColumns.join(', ') || 'none'}. Unexpected: ${extraColumns.join(', ') || 'none'}.`);
  }

  const rows = sourceRows.map(row => Object.fromEntries(LOCATION_IMPORT_COLUMNS.map(column => [column, row[column] || ''])) as ImportRow);
  const locationsById = groupBy(snapshot.locations, location => location.id);
  const locationsByStore = groupBy(snapshot.locations, location => normalizeStoreNumber(location.storeNumber));
  const duplicateCsvIds = duplicateValues(rows.map(row => row.LocationId).filter(Boolean));
  const duplicateCsvStores = duplicateValues(rows.map(row => normalizeStoreNumber(row.StoreNumber)).filter(Boolean));
  const peopleById = groupBy(snapshot.people, person => person.id);
  const registry: HierarchyRegistry = { regions: snapshot.regions, districts: snapshot.districts };

  const previewRows = rows.map((row, index) => {
    const issues: LocationImportIssue[] = [];
    const normalizedStore = normalizeStoreNumber(row.StoreNumber);
    if (row.SchemaVersion !== LOCATION_IMPORT_SCHEMA_VERSION) {
      issues.push(issue('invalid_schema_version', 'SchemaVersion', `Expected ${LOCATION_IMPORT_SCHEMA_VERSION}.`));
    }
    if ((row.LocationId && duplicateCsvIds.has(row.LocationId)) || (normalizedStore && duplicateCsvStores.has(normalizedStore))) {
      issues.push(issue('duplicate_csv_identity', row.LocationId && duplicateCsvIds.has(row.LocationId) ? 'LocationId' : 'StoreNumber', 'This identity appears more than once in the uploaded file.'));
    }

    const idMatches = row.LocationId ? locationsById.get(row.LocationId) || [] : [];
    const storeMatches = normalizedStore ? locationsByStore.get(normalizedStore) || [] : [];
    if (idMatches.length > 1 || storeMatches.length > 1) {
      issues.push(issue('duplicate_existing_identity', idMatches.length > 1 ? 'LocationId' : 'StoreNumber', 'The directory contains multiple matching Locations.'));
    }
    const existing = idMatches.length === 1 ? idMatches[0] : !row.LocationId && storeMatches.length === 1 ? storeMatches[0] : undefined;
    if (row.LocationId && idMatches.length === 0 && storeMatches.length > 0) {
      issues.push(issue('conflicting_identity', 'LocationId', `LocationId ${row.LocationId} does not match the existing Location with store number ${row.StoreNumber}.`));
    } else if (existing && storeMatches.length === 1 && storeMatches[0].id !== existing.id) {
      issues.push(issue('conflicting_identity', 'StoreNumber', `Store number ${row.StoreNumber} belongs to a different Location.`));
    }

    const proposed: Record<string, unknown> = existing ? { ...existing } : {};
    for (const [column, field] of Object.entries(scalarFields) as Array<[keyof typeof scalarFields, typeof scalarFields[keyof typeof scalarFields]]>) {
      if (row[column]) proposed[field] = row[column];
    }
    for (const [column, field] of Object.entries(listFields) as Array<[keyof typeof listFields, typeof listFields[keyof typeof listFields]]>) {
      if (row[column]) proposed[field] = parseIdList(row[column]);
    }

    if (!existing) {
      for (const [column, field] of requiredAdditionFields) {
        if (!proposed[field]) issues.push(issue('missing_required_field', column, `${column} is required for a new Location.`));
      }
    }

    for (const field of personFields) {
      const ids = Array.isArray(proposed[field]) ? proposed[field] as string[] : proposed[field] ? [String(proposed[field])] : [];
      for (const id of ids) {
        const matches = peopleById.get(id) || [];
        if (matches.length !== 1) {
          issues.push(issue('missing_person_reference', field, `${field} references missing or duplicate Person ID ${id}.`));
        } else if ((matches[0].status && matches[0].status !== 'Active') || matches[0].activeStatus === false) {
          issues.push(issue('inactive_person_reference', field, `${field} references inactive Person ${matches[0].fullName} (${id}).`));
        }
      }
    }

    const hierarchyIssues = validateLocationHierarchyFields(proposed as unknown as HierarchyFieldContract, registry);
    for (const message of hierarchyIssues) issues.push(issue('invalid_hierarchy', 'Hierarchy', message));

    const changes = importedChanges(row, proposed, existing as unknown as Record<string, unknown> | undefined);
    const action = issues.length ? 'blocked' : existing ? changes.length ? 'update' : 'unchanged' : 'add';
    return {
      rowNumber: index + 2,
      action,
      locationId: existing?.id || row.LocationId || null,
      storeNumber: String(proposed.storeNumber || row.StoreNumber),
      displayName: String(proposed.name || row.StoreName || `Row ${index + 2}`),
      changes,
      issues,
    } satisfies LocationImportPreviewRow;
  });

  return {
    schemaVersion: LOCATION_IMPORT_SCHEMA_VERSION,
    summary: {
      totalRows: previewRows.length,
      additions: previewRows.filter(row => row.action === 'add').length,
      updates: previewRows.filter(row => row.action === 'update').length,
      unchanged: previewRows.filter(row => row.action === 'unchanged').length,
      blocked: previewRows.filter(row => row.action === 'blocked').length,
    },
    rows: previewRows,
  };
}

function importedChanges(row: ImportRow, proposed: Record<string, unknown>, existing?: Record<string, unknown>): LocationImportChange[] {
  const fields = [
    ...Object.entries(scalarFields).filter(([column]) => row[column as keyof ImportRow]).map(([, field]) => field),
    ...Object.entries(listFields).filter(([column]) => row[column as keyof ImportRow]).map(([, field]) => field),
  ];
  return fields
    .filter(field => !sameValue(existing?.[field], proposed[field]))
    .map(field => ({ field, before: existing?.[field] ?? null, after: proposed[field] }));
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

function issue(code: LocationImportIssueCode, field: string, message: string): LocationImportIssue {
  return { code, field, message };
}
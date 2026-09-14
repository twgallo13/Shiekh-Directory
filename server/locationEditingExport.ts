import { stringify } from 'csv-stringify/sync';
import type { DirectorySeed } from '../src/lib/directorySeed';
import type { LocationEditingExportDiagnostic, LocationEditingExportManifest } from '../src/lib/locationEditingExport';
import { buildLocationImportPlan } from '../src/lib/locationImportPreview';
import {
  LOCATION_IMPORT_COLUMNS,
  LOCATION_IMPORT_FIELDS,
  LOCATION_IMPORT_MAX_BYTES,
  LOCATION_IMPORT_SCHEMA_VERSION,
} from '../src/lib/locationImportSchema';
import { LOCATION_IMPORT_MAX_ROWS } from './locationImportConfirmation';

type LocationEditingExportSnapshot = Pick<DirectorySeed, 'locations' | 'people' | 'regions' | 'districts'>;
type ExportLocation = LocationEditingExportSnapshot['locations'][number] & Record<string, unknown>;
type ExportRow = Record<string, string>;

const UNREPRESENTABLE_LOCATION_FIELDS = [
  'mallOrCenterName',
  'phonePrivacy',
  'district',
  'districtManagerName',
  'regionalManagerName',
  'storeManagerName',
  'storeManagerPhone',
  'storeManagerPhonePrivacy',
  'assistantStoreManagerNames',
  'keyHolderNames',
  'activeNotice',
  'standardHours',
  'hoursTemplateId',
  'hoursMode',
  'holidayHours',
  'specialHours',
  'lastVerifiedAt',
  'lastVerifiedBy',
  'createdAt',
  'updatedAt',
  'qrCodeUrl',
  'slug',
  'customMetadata',
] as const;
const REPRESENTED_LOCATION_FIELDS = new Set([
  ...LOCATION_IMPORT_FIELDS.flatMap(field => field.field ? [field.field] : []),
  'phoneExtension',
]);
const SERVER_MANAGED_LOCATION_FIELDS = new Set(['version']);

interface ExportEntry {
  location: ExportLocation;
  row: ExportRow;
}

export class LocationEditingExportError extends Error {
  constructor(
    public readonly code: 'editing_export_record_too_large',
    message: string,
    public readonly locationId: string,
    public readonly fields: string[],
  ) {
    super(message);
  }
}

export function buildLocationEditingExport(
  snapshot: LocationEditingExportSnapshot,
  snapshotReadAt = new Date().toISOString(),
): LocationEditingExportManifest {
  const entries = [...snapshot.locations]
    .sort(compareLocations)
    .map(location => ({ location: location as ExportLocation, row: toEditingRow(location as ExportLocation) }));
  const groupedEntries = partitionEntries(entries);
  const diagnostics: LocationEditingExportDiagnostic[] = entries.flatMap(({ location }) => unsupportedFieldDiagnostic(location));
  const roundTrip = { unchanged: 0, updates: 0, additions: 0, blocked: 0, warnings: 0 };

  const parts = groupedEntries.map((partEntries, index) => {
    const csv = serializeRows(partEntries.map(entry => entry.row));
    const plan = buildLocationImportPlan(csv, snapshot, snapshotReadAt);
    const conformancePlan = buildLocationImportPlan(csv, { ...snapshot, locations: [] }, snapshotReadAt);
    roundTrip.unchanged += plan.preview.summary.unchanged;
    roundTrip.updates += plan.preview.summary.updates;
    roundTrip.additions += plan.preview.summary.additions;
    roundTrip.blocked += plan.preview.summary.blocked;
    roundTrip.warnings += plan.preview.summary.warnings;
    plan.preview.rows.forEach((previewRow, rowIndex) => {
      const location = partEntries[rowIndex].location;
      const issues = uniqueIssues([
        ...previewRow.issues,
        ...normalizeLegacyConformanceIssues(conformancePlan.preview.rows[rowIndex].issues),
      ]);
      if (issues.length > 0) {
        diagnostics.push({
          locationId: textValue(location.id) || '(missing Location ID)',
          storeNumber: textValue(location.storeNumber),
          severity: issues.some(issue => issue.severity === 'error') ? 'error' : 'warning',
          code: 'round_trip_issue',
          fields: [...new Set(issues.map(issue => issue.field))],
          message: 'The current record contains legacy values or references that do not conform to locations-v1.',
          guidance: 'Review the listed legacy values and references. Correct the source record intentionally before relying on this row for editing.',
          issues,
        });
      }
      if (previewRow.action !== 'unchanged' && previewRow.changes.length > 0) {
        diagnostics.push({
          locationId: textValue(location.id) || '(missing Location ID)',
          storeNumber: textValue(location.storeNumber),
          severity: 'warning',
          code: 'round_trip_change',
          fields: [...new Set(previewRow.changes.map(change => change.field))],
          message: 'Immediate preview would propose normalization or another value change for this exported row.',
          guidance: 'Do not confirm the unchanged file. Review the proposed values and correct the authoritative record or CSV intentionally.',
        });
      }
    });
    return {
      partNumber: index + 1,
      filename: '',
      recordCount: partEntries.length,
      byteCount: Buffer.byteLength(csv, 'utf8'),
      csv,
    };
  });
  const partCount = parts.length;
  parts.forEach(part => {
    part.filename = `shiekh_locations_editing_v1_part_${padPart(part.partNumber)}_of_${padPart(partCount)}.csv`;
  });

  return {
    schemaVersion: LOCATION_IMPORT_SCHEMA_VERSION,
    snapshotReadAt,
    totalRecords: entries.length,
    lifecycleCounts: {
      Active: entries.filter(entry => entry.location.recordStatus === 'Active').length,
      Draft: entries.filter(entry => entry.location.recordStatus === 'Draft').length,
      Retired: entries.filter(entry => entry.location.recordStatus === 'Retired').length,
      unrecognized: entries.filter(entry => !['Active', 'Draft', 'Retired'].includes(String(entry.location.recordStatus))).length,
    },
    roundTrip,
    parts,
    diagnostics,
  };
}

function partitionEntries(entries: ExportEntry[]): ExportEntry[][] {
  if (entries.length === 0) return [[]];
  const parts: ExportEntry[][] = [];
  let current: ExportEntry[] = [];
  for (const entry of entries) {
    const candidate = [...current, entry];
    if (candidate.length <= LOCATION_IMPORT_MAX_ROWS && csvBytes(candidate) <= LOCATION_IMPORT_MAX_BYTES) {
      current = candidate;
      continue;
    }
    if (current.length === 0) {
      throw oversizedRecord(entry);
    }
    parts.push(current);
    current = [entry];
    if (csvBytes(current) > LOCATION_IMPORT_MAX_BYTES) {
      throw oversizedRecord(entry);
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

function csvBytes(entries: ExportEntry[]): number {
  return Buffer.byteLength(serializeRows(entries.map(entry => entry.row)), 'utf8');
}

function serializeRows(rows: ExportRow[]): string {
  return stringify(rows, {
    header: true,
    columns: LOCATION_IMPORT_COLUMNS,
    record_delimiter: '\r\n',
    bom: true,
  });
}

function toEditingRow(location: ExportLocation): ExportRow {
  return Object.fromEntries(LOCATION_IMPORT_FIELDS.map(field => {
    if (field.column === 'SchemaVersion') return [field.column, LOCATION_IMPORT_SCHEMA_VERSION];
    if (field.column === 'Phone') return [field.column, phoneWithExtension(location.phone, location.phoneExtension)];
    if (field.column === 'AssistantStoreManagerIds') return [field.column, serializeIdList(location.assistantStoreManagerIds)];
    if (field.column === 'KeyHolderIds') return [field.column, serializeIdList(location.keyHolderIds)];
    return [field.column, field.field ? textValue(location[field.field]) : ''];
  }));
}

function phoneWithExtension(phoneValue: unknown, extensionValue: unknown): string {
  const phone = textValue(phoneValue);
  const extension = textValue(extensionValue);
  if (!extension) return phone;
  return `${phone.replace(/\s+(?:ext\.?|x)\s*\d+\s*$/i, '')} ext. ${extension}`;
}

function serializeIdList(value: unknown): string {
  if (Array.isArray(value)) return value.map(textValue).join(';');
  return textValue(value);
}

function textValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : String(value);
}

function unsupportedFieldDiagnostic(location: ExportLocation): LocationEditingExportDiagnostic[] {
  const knownFields = UNREPRESENTABLE_LOCATION_FIELDS.filter(field => hasValue(location[field]));
  const unknownFields = Object.keys(location).filter(field => !REPRESENTED_LOCATION_FIELDS.has(field)
    && !SERVER_MANAGED_LOCATION_FIELDS.has(field)
    && !UNREPRESENTABLE_LOCATION_FIELDS.includes(field as typeof UNREPRESENTABLE_LOCATION_FIELDS[number])
    && hasValue(location[field]));
  const fields = [...knownFields, ...unknownFields].sort();
  if (fields.length === 0) return [];
  return [{
    locationId: textValue(location.id) || '(missing Location ID)',
    storeNumber: textValue(location.storeNumber),
    severity: 'warning',
    code: 'unrepresentable_fields',
    fields: [...fields],
    message: 'This Location contains fields outside the locations-v1 editing contract.',
    guidance: 'These values are not included in the editing CSV and are preserved by Location updates. This export is not a full backup.',
  }];
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function largestFields(row: ExportRow): string[] {
  return Object.entries(row)
    .map(([field, value]) => ({ field, bytes: Buffer.byteLength(value, 'utf8') }))
    .sort((left, right) => right.bytes - left.bytes || left.field.localeCompare(right.field))
    .slice(0, 3)
    .map(entry => entry.field);
}

function oversizedRecord(entry: ExportEntry): LocationEditingExportError {
  return new LocationEditingExportError(
    'editing_export_record_too_large',
    `Location ${textValue(entry.location.id) || '(missing Location ID)'} cannot fit in a ${LOCATION_IMPORT_MAX_BYTES}-byte locations-v1 CSV part.`,
    textValue(entry.location.id) || '(missing Location ID)',
    largestFields(entry.row),
  );
}

function compareLocations(left: ExportLocation, right: ExportLocation): number {
  const leftStore = textValue(left.storeNumber);
  const rightStore = textValue(right.storeNumber);
  return leftStore.localeCompare(rightStore, 'en', { numeric: true })
    || leftStore.localeCompare(rightStore)
    || textValue(left.id).localeCompare(textValue(right.id));
}

function padPart(value: number): string {
  return String(value).padStart(3, '0');
}

function uniqueIssues(issues: ReturnType<typeof buildLocationImportPlan>['preview']['rows'][number]['issues']) {
  const seen = new Set<string>();
  return issues.filter(issue => {
    const key = `${issue.code}\u0000${issue.field}\u0000${issue.reason}\u0000${String(issue.suppliedValue)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeLegacyConformanceIssues(
  issues: ReturnType<typeof buildLocationImportPlan>['preview']['rows'][number]['issues'],
) {
  return issues.map(issue => issue.code === 'missing_required_field' ? {
    ...issue,
    severity: 'warning' as const,
    reason: `The existing Location has no ${issue.field} value, which locations-v1 requires for a complete record.`,
    correction: 'Repair the authoritative Location intentionally before relying on this row for editing.',
  } : issue);
}

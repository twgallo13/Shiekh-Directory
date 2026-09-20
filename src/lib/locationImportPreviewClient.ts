import type { SessionUser } from './authSession';
import type { PreparedLocationEditingExport } from './locationEditingExport';
import type { LocationImportPreview, LocationImportReceipt } from './locationImportPreview';
import {
  LOCATION_IMPORT_MAX_BYTES,
  spreadsheetSafeCsvValue,
  suggestLocationImportHeaderMappings,
  type LocationImportHeaderMapping,
  type LocationImportMode,
} from './locationImportSchema';

export type LocationImportDownload = 'template' | 'example' | 'fields' | 'references';

export class LocationImportRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

const downloadNames: Record<LocationImportDownload, string> = {
  template: 'shiekh_locations_import_v1.csv',
  example: 'shiekh_locations_import_v1_worked_example.csv',
  fields: 'shiekh_locations_import_v1_field_dictionary.csv',
  references: 'shiekh_location_import_reference_ids.csv',
};

export async function downloadLocationImportTemplate(user: SessionUser): Promise<void> {
  return downloadLocationImportResource(user, 'template');
}

export async function downloadLocationImportResource(user: SessionUser, resource: LocationImportDownload): Promise<void> {
  const response = await fetch(`/api/imports/locations/${resource}`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw await previewRequestError(response, 'The Location import guidance could not be downloaded.');
  downloadBlob(await response.blob(), downloadNames[resource]);
}

export async function prepareLocationEditingExport(user: SessionUser): Promise<PreparedLocationEditingExport> {
  const response = await fetch('/api/imports/locations/editing-export/prepare', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw await previewRequestError(response, 'The Location editing export could not be prepared.');
  const prepared = await response.json() as PreparedLocationEditingExport;
  if (!isPreparedLocationEditingExport(prepared)) throw new Error('The server returned an invalid Location editing export.');
  return prepared;
}

export async function downloadLocationEditingExportPart(
  prepared: PreparedLocationEditingExport,
  partNumber: number,
): Promise<void> {
  const part = prepared.parts.find(candidate => candidate.partNumber === partNumber);
  if (!part) throw new Error('The requested Location editing export part does not exist.');
  downloadBlob(new Blob([part.csv], { type: 'text/csv;charset=utf-8' }), part.filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export interface LocationImportPreviewRequest {
  preview: LocationImportPreview;
  csv: string;
}

export interface InspectedLocationImportFile {
  csv: string;
  filename: string;
  mappings: LocationImportHeaderMapping[];
  mode: LocationImportMode;
}

export interface LocationImportPreviewOptions extends InspectedLocationImportFile {
  selectedRowNumbers?: number[];
}

export async function inspectLocationImportFile(file: File): Promise<InspectedLocationImportFile> {
  if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a CSV file created from the supported template.');
  if (file.size === 0 || file.size > LOCATION_IMPORT_MAX_BYTES) throw new Error('Choose a non-empty CSV file no larger than 2 MB.');
  const csv = await file.text();
  const headers = parseCsvHeader(csv);
  return {
    csv,
    filename: file.name,
    mappings: suggestLocationImportHeaderMappings(headers),
    mode: /(?:^|_)locations_editing_v\d+(?:_|\.)/i.test(file.name) ? 'update-existing-only' : 'add-and-update',
  };
}

export async function previewLocationImport(
  user: SessionUser,
  input: File | LocationImportPreviewOptions,
): Promise<LocationImportPreviewRequest> {
  const inspected = input instanceof File ? await inspectLocationImportFile(input) : input;
  const { csv, mappings, mode } = inspected;
  const selectedRowNumbers = 'selectedRowNumbers' in inspected ? inspected.selectedRowNumbers : undefined;
  const response = await fetch('/api/imports/locations/preview', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ csv, mappings, mode, ...(selectedRowNumbers === undefined ? {} : { selectedRowNumbers }) }),
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw await previewRequestError(response, 'The Location import preview could not be generated.');
  const preview = await response.json() as LocationImportPreview;
  if (!isLocationImportPreview(preview)) {
    throw new Error('The server returned an invalid Location import preview.');
  }
  return { preview, csv };
}

export async function confirmLocationImport(
  user: SessionUser,
  request: {
    csv: string;
    confirmationToken: string;
    operationId: string;
    warningsReviewed: boolean;
    mappings: LocationImportHeaderMapping[];
    mode: LocationImportMode;
    selectedRowNumbers: number[];
  },
): Promise<LocationImportReceipt> {
  const token = await user.getIdToken();
  let response: Response;
  try {
    response = await fetch('/api/imports/locations/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    throw uncertainConfirmation();
  }
  if (!response.ok) throw await confirmationRequestError(response);
  let receipt: LocationImportReceipt;
  try {
    receipt = await response.json() as LocationImportReceipt;
  } catch {
    throw uncertainConfirmation();
  }
  if (!isLocationImportReceipt(receipt) || receipt.operationId !== request.operationId) throw uncertainConfirmation();
  return receipt;
}

export function downloadLocationImportResults(preview: LocationImportPreview, receipt: LocationImportReceipt | null, filename = 'shiekh_location_import_results.csv'): void {
  downloadBlob(new Blob([buildLocationImportResultsCsv(preview, receipt)], { type: 'text/csv;charset=utf-8' }), filename);
}

export function downloadLocationImportCorrections(preview: LocationImportPreview, filename = 'shiekh_location_import_corrections.csv'): void {
  downloadBlob(new Blob([buildLocationImportCorrectionCsv(preview)], { type: 'text/csv;charset=utf-8' }), filename);
}

export function buildLocationImportResultsCsv(preview: LocationImportPreview, receipt: LocationImportReceipt | null): string {
  const selected = new Set(preview.selectedRowNumbers || []);
  const rows = preview.rows.flatMap(row => {
    const status = selected.has(row.rowNumber) && (row.action === 'add' || row.action === 'update')
      ? receipt ? 'saved' : 'ready'
      : row.action === 'unchanged' ? 'unchanged' : row.action === 'blocked' ? 'blocked' : 'not selected';
    const identity = row.locationId || row.storeNumber || '(missing identity)';
    const issues = row.issues.length ? row.issues : [null];
    return issues.map(issue => [
      row.rowNumber,
      identity,
      status,
      issue?.field || '',
      formatCsvValue(issue?.suppliedValue),
      formatCsvValue(issue?.currentValue),
      issue?.reason || '',
      issue?.correction || '',
    ]);
  });
  return serializeBrowserCsv([
    ['CsvRow', 'RecordIdentity', 'Result', 'Field', 'SuppliedValue', 'CurrentValue', 'Reason', 'CorrectionSteps'],
    ...rows,
  ]);
}

export function buildLocationImportCorrectionCsv(preview: LocationImportPreview): string {
  const selected = new Set(preview.selectedRowNumbers || []);
  const mappings = [...(preview.mappings || [])].sort((left, right) => left.sourceIndex - right.sourceIndex);
  const unsuccessful = preview.rows.filter(row => row.action === 'blocked'
    || ((row.action === 'add' || row.action === 'update') && !selected.has(row.rowNumber)));
  return serializeBrowserCsv([
    mappings.map(mapping => mapping.sourceHeader),
    ...unsuccessful.map(row => row.sourceValues),
  ]);
}

async function confirmationRequestError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
  if (body?.error?.code) return new LocationImportRequestError(body.error.code, body.error.message || 'The Location import could not be confirmed.');
  return uncertainConfirmation();
}

function uncertainConfirmation() {
  return new LocationImportRequestError('confirmation_uncertain', 'The import outcome could not be confirmed. Retry the same operation.');
}

async function previewRequestError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
  return new LocationImportRequestError(body?.error?.code || 'preview_request_failed', body?.error?.message || fallback);
}

function isLocationImportPreview(value: LocationImportPreview): boolean {
  return value?.schemaVersion === 'locations-v1'
    && typeof value.snapshotReadAt === 'string'
    && isCountSummary(value.summary)
    && Array.isArray(value.rows)
    && optionalString(value.confirmationToken)
    && optionalString(value.operationId)
    && optionalString(value.batchId)
    && optionalString(value.expiresAt)
    && optionalString(value.confirmationDisabledReason);
}

function isLocationImportReceipt(value: LocationImportReceipt): boolean {
  return Boolean(value)
    && typeof value.operationId === 'string'
    && typeof value.batchId === 'string'
    && typeof value.committedAt === 'string'
    && ['additions', 'updates', 'unchanged'].every(key => Number.isInteger(value[key as keyof LocationImportReceipt]))
    && typeof value.replayed === 'boolean'
    && Array.isArray(value.locations)
    && value.locations.every(location => typeof location?.id === 'string'
      && typeof location.name === 'string'
      && typeof location.storeNumber === 'string'
      && Boolean(location.record) && typeof location.record === 'object' && !Array.isArray(location.record));
}

function isPreparedLocationEditingExport(value: PreparedLocationEditingExport): boolean {
  if (!value
    || value.schemaVersion !== 'locations-v1'
    || typeof value.snapshotReadAt !== 'string'
    || !Number.isInteger(value.totalRecords) || value.totalRecords < 0
    || !value.lifecycleCounts
    || !['Active', 'Draft', 'Retired', 'unrecognized'].every(key => Number.isInteger(value.lifecycleCounts[key as keyof typeof value.lifecycleCounts]))
    || !isRoundTripSummary(value.roundTrip)
    || !Array.isArray(value.parts) || value.parts.length === 0
    || !Array.isArray(value.diagnostics)) return false;
  const partCount = value.parts.length;
  const partsValid = value.parts.every((part, index) => Number.isInteger(part.partNumber)
    && part.partNumber === index + 1
    && part.filename === `shiekh_locations_editing_v1_part_${String(index + 1).padStart(3, '0')}_of_${String(partCount).padStart(3, '0')}.csv`
    && Number.isInteger(part.recordCount) && part.recordCount >= 0 && part.recordCount <= 100
    && Number.isInteger(part.byteCount) && part.byteCount > 0 && part.byteCount <= LOCATION_IMPORT_MAX_BYTES
    && typeof part.csv === 'string' && new TextEncoder().encode(part.csv).byteLength === part.byteCount);
  const lifecycleTotal = Object.values(value.lifecycleCounts).reduce((total, count) => total + count, 0);
  const partTotal = value.parts.reduce((total, part) => total + part.recordCount, 0);
  const actionTotal = value.roundTrip.additions + value.roundTrip.updates + value.roundTrip.unchanged + value.roundTrip.blocked;
  return partsValid
    && lifecycleTotal === value.totalRecords
    && partTotal === value.totalRecords
    && actionTotal === value.totalRecords
    && value.diagnostics.every(diagnostic => typeof diagnostic.locationId === 'string'
      && typeof diagnostic.storeNumber === 'string' && Array.isArray(diagnostic.fields)
      && typeof diagnostic.message === 'string' && typeof diagnostic.guidance === 'string');
}

function isCountSummary(value: LocationImportPreview['summary'] | PreparedLocationEditingExport['roundTrip']): boolean {
  return Boolean(value) && ['totalRows', 'additions', 'updates', 'unchanged', 'blocked', 'warnings']
    .every(key => Number.isInteger(value[key as keyof typeof value]));
}

function isRoundTripSummary(value: PreparedLocationEditingExport['roundTrip']): boolean {
  return Boolean(value) && ['additions', 'updates', 'unchanged', 'blocked', 'warnings']
    .every(key => Number.isInteger(value[key as keyof typeof value]));
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function parseCsvHeader(csv: string): string[] {
  const source = csv.replace(/^\uFEFF/, '');
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }
    if (character === '"' && value.length === 0) quoted = true;
    else if (character === ',') {
      values.push(value.trim());
      value = '';
    } else if (character === '\r' || character === '\n') {
      values.push(value.trim());
      return values;
    } else value += character;
  }
  if (quoted) throw new Error('The CSV header has an unmatched quote. Correct the first row and try again.');
  values.push(value.trim());
  if (values.length === 1 && !values[0]) throw new Error('The CSV file does not contain a header row.');
  return values;
}

function serializeBrowserCsv(rows: Array<Array<unknown>>): string {
  return `\uFEFF${rows.map(row => row.map(value => {
    const safe = spreadsheetSafeCsvValue(String(value ?? ''));
    return `"${safe.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n')}\r\n`;
}

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return Array.isArray(value) ? value.join(';') : String(value);
}
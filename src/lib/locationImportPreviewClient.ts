import type { SessionUser } from './authSession';
import type { LocationImportPreview, LocationImportReceipt } from './locationImportPreview';
import { LOCATION_IMPORT_MAX_BYTES } from './locationImportSchema';

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
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = downloadNames[resource];
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export interface LocationImportPreviewRequest {
  preview: LocationImportPreview;
  csv: string;
}

export async function previewLocationImport(user: SessionUser, file: File): Promise<LocationImportPreviewRequest> {
  if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a CSV file created from the supported template.');
  if (file.size === 0 || file.size > LOCATION_IMPORT_MAX_BYTES) throw new Error('Choose a non-empty CSV file no larger than 2 MB.');
  const csv = await file.text();
  const response = await fetch('/api/imports/locations/preview', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ csv }),
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
  request: { csv: string; confirmationToken: string; operationId: string; warningsReviewed: boolean },
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

function isCountSummary(value: LocationImportPreview['summary']): boolean {
  return Boolean(value) && ['totalRows', 'additions', 'updates', 'unchanged', 'blocked', 'warnings']
    .every(key => Number.isInteger(value[key as keyof typeof value]));
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}
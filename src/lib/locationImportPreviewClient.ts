import type { SessionUser } from './authSession';
import type { LocationImportPreview } from './locationImportPreview';

const MAX_CSV_SIZE = 2_000_000;

export async function downloadLocationImportTemplate(user: SessionUser): Promise<void> {
  const response = await fetch('/api/imports/locations/template', {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw new Error(await previewErrorMessage(response, 'The Location import template could not be downloaded.'));
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = 'shiekh_locations_import_v1.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export async function previewLocationImport(user: SessionUser, file: File): Promise<LocationImportPreview> {
  if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a CSV file created from the supported template.');
  if (file.size === 0 || file.size > MAX_CSV_SIZE) throw new Error('Choose a non-empty CSV file no larger than 2 MB.');
  const response = await fetch('/api/imports/locations/preview', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ csv: await file.text() }),
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw new Error(await previewErrorMessage(response, 'The Location import preview could not be generated.'));
  const preview = await response.json() as LocationImportPreview;
  if (preview.schemaVersion !== 'locations-v1' || !preview.summary || !Array.isArray(preview.rows)) {
    throw new Error('The server returned an invalid Location import preview.');
  }
  return preview;
}

async function previewErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return body?.error?.message || fallback;
}
import type { SessionUser } from './authSession';

export interface LocationExportMetadata {
  exportMode: 'all-stores';
  recordCount: number;
  storeNumberSetDigest: string;
  generatedAt: string;
  appliedLifecycle: 'Active';
  authorizationScope: { type: 'company-wide'; label: string } | { type: 'exact-store'; label: string; storeNumber: string };
  missingCanonicalPersonReferences: number;
  filename: string;
  expiresAt: string;
}

export interface PreparedLocationExport {
  token: string;
  metadata: LocationExportMetadata;
}

export async function prepareLocationExport(user: SessionUser): Promise<PreparedLocationExport> {
  const response = await fetch('/api/exports/locations/prepare', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw new Error(await exportErrorMessage(response, 'The server could not prove this export is complete.'));
  const body = await response.json() as PreparedLocationExport;
  if (!body.token || !body.metadata || body.metadata.exportMode !== 'all-stores' || typeof body.metadata.recordCount !== 'number') {
    throw new Error('The export metadata response was invalid.');
  }
  return body;
}

export async function downloadPreparedLocationExport(user: SessionUser, token: string, filename: string): Promise<void> {
  const response = await fetch(`/api/exports/locations/${encodeURIComponent(token)}`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw new Error(await exportErrorMessage(response, 'The prepared export could not be downloaded.'));
  const type = response.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('text/csv')) throw new Error('The server returned an invalid export format.');
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

async function exportErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return body?.error?.message || fallback;
}
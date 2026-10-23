import type { SessionUser } from './authSession';
export type PersonTransitionPreview = Awaited<ReturnType<typeof import('../../server/personTransitionPreview').previewPersonTransition>>;

/** Internal session endpoint, never a consumer API token or a write authorization. */
export async function fetchPersonTransitionPreview(user: SessionUser, personId: string, signal: AbortSignal): Promise<PersonTransitionPreview> {
  const response = await fetch(`/api/directory/people/${encodeURIComponent(personId)}/transition-preview`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store', redirect: 'error', signal });
  if (!response.ok) throw new Error('No fresh server review is available. Reload and retry; no changes were made.');
  const result = await response.json();
  const rows = (value: unknown, check: (row: any) => boolean) => Array.isArray(value) && value.every(row => row && typeof row === 'object' && check(row));
  const strings = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === 'string');
  const optionalString = (value: unknown) => value === undefined || typeof value === 'string';
  if (result?.schemaVersion !== 1 || result.personId !== personId || result.completeWithinScope !== true || !/^[a-f0-9]{64}$/.test(result.digest)
    || !Number.isFinite(Date.parse(result.evaluatedAt)) || Date.parse(result.expiresAt) - Date.parse(result.evaluatedAt) !== 300_000
    || !result.scanned || typeof result.scanned !== 'object' || !Object.values(result.scanned).every(count => Number.isInteger(count) && Number(count) >= 0)
    || !result.review || !rows(result.review.responsibilities, row => strings([row.key, row.label, row.source])) || !strings(result.review.issues)
    || ![result.review.workplaces, result.review.inheritedStores].every(value => rows(value, row => typeof row.locationId === 'string' && strings(row.labels) && typeof row.unavailable === 'boolean' && optionalString(row.name) && optionalString(row.storeNumber)))
    || !rows(result.review.historicalCopies, row => typeof row.id === 'string' && optionalString(row.storeNumber))
    || !rows(result.review.accounts, row => strings([row.id, row.role]) && optionalString(row.status))
    || !rows(result.review.pendingRequests, row => strings([row.id, row.changeType]) && strings(row.reasons))) throw new Error('The server review could not be verified. Reload and retry; no changes were made.');
  return result;
}

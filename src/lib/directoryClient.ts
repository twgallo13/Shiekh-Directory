import type { SessionUser } from './authSession';
import type { DistrictRecord, RegionRecord } from '../types';
import type { LocationInboxAcknowledgment } from './locationInboxEmail';

export type DirectoryCollection = 'locations' | 'people' | 'users' | 'hours_templates' | 'corporate_holidays' | 'requests' | 'email_templates' | 'notification_rules' | 'sop_runbooks' | 'custom_field_definitions' | 'regions' | 'districts';
export interface DirectoryWrite { collection: DirectoryCollection; id: string; operation: 'set' | 'delete'; data?: Record<string, unknown>; expectedDefinition?: import('./customFields').CustomFieldDefinition | null; expectedCustomMetadata?: Record<string, unknown>; expectedVersion?: number | null; locationInboxAcknowledgment?: LocationInboxAcknowledgment; districtLeadershipMembers?: import('./districtLeadership').DistrictLeadershipMember[] }
export interface DirectoryAudit { action: string; entityType: 'Location' | 'Person' | 'User' | 'Setting' | 'Request' | 'Communication'; entityId: string; entityName: string; details: string }
export interface DirectoryCommittedRecord { collection: DirectoryCollection; id: string; operation: 'set' | 'delete'; data: Record<string, unknown> | null }
export interface DirectoryCommitResult { records: DirectoryCommittedRecord[]; replayed?: boolean }
export interface DirectoryDependency { type: 'Location' | 'District'; id: string; name: string; storeNumber?: string; href?: string }
export type RegistrySaveIntent = { create: true } | { create: false; expectedVersion: number };
export interface HierarchyRegistrySnapshot { regions: RegionRecord[]; districts: DistrictRecord[] }
export class DirectoryCommitError extends Error {
  constructor(message: string, public readonly code?: string, public readonly details?: { dependencies?: DirectoryDependency[]; correction?: string }) {
    super(message);
  }
}

/** Reconcile-or-seal an uncertain submission; never discard a potentially in-flight write. */
export async function cancelDirectorySubmission(user: SessionUser, write: DirectoryWrite): Promise<DirectoryCommitResult & { cancelled: boolean }> {
  const response = await fetch('/api/directory/submissions/cancel', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, cache: 'no-store', redirect: 'error', body: JSON.stringify({ write }) });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result.cancelled !== 'boolean' || !Array.isArray(result.records)
    || (result.cancelled ? result.records.length !== 0 : !validSubmissionResult(result, write.id))) throw new DirectoryCommitError(result?.error?.message || 'Submission recovery could not be confirmed. Keep this operation and try again.', result?.error?.code);
  return result;
}

function validSubmissionResult(result: DirectoryCommitResult, id: string): boolean {
  const record = result?.records?.[0];
  return Array.isArray(result?.records) && result.records.length === 1 && record?.collection === 'requests' && record.id === id && record.operation === 'set'
    && record.data?.id === id && ['Pending', 'Approved', 'Rejected'].includes(String(record.data?.status)) && (result.replayed === undefined || typeof result.replayed === 'boolean');
}

export function buildRegistryWrite(
  collection: 'regions' | 'districts',
  record: RegionRecord | DistrictRecord,
  intent: RegistrySaveIntent,
): DirectoryWrite {
  return {
    collection,
    id: record.id,
    operation: 'set',
    data: record as unknown as Record<string, unknown>,
    expectedVersion: 'expectedVersion' in intent ? intent.expectedVersion : null,
  };
}

export async function fetchHierarchyRegistry(user: SessionUser, request: typeof fetch = fetch): Promise<HierarchyRegistrySnapshot> {
  const response = await request('/api/auth/bootstrap', {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw new DirectoryCommitError(response.status === 403 ? 'Your role cannot refresh the hierarchy registry.' : 'The hierarchy registry could not be refreshed.');
  const body = await response.json() as Partial<HierarchyRegistrySnapshot>;
  if (!Array.isArray(body.regions) || !Array.isArray(body.districts)) throw new DirectoryCommitError('The hierarchy registry refresh returned an invalid response.');
  return { regions: body.regions, districts: body.districts };
}

export async function commitDirectory(user: SessionUser, writes: DirectoryWrite[], audit: DirectoryAudit): Promise<DirectoryCommitResult> {
  const response = await fetch('/api/directory/commit', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    redirect: 'error',
    body: JSON.stringify({ writes, audit }),
  });
  if (response.ok) {
    const result = await response.json().catch(() => null) as DirectoryCommitResult | null;
    if (!result || !Array.isArray(result.records) || (writes.length === 1 && writes[0].collection === 'requests' && writes[0].data?.status === 'Pending' && !validSubmissionResult(result, writes[0].id))) {
      throw new DirectoryCommitError('The save response could not be confirmed. Recover the original submission before creating another.');
    }
    return result;
  }
  const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string; details?: { dependencies?: DirectoryDependency[]; correction?: string } } } | null;
  throw new DirectoryCommitError(
    body?.error?.message || (response.status === 403 ? 'Your role cannot make this directory change.' : 'The directory database could not save this change.'),
    body?.error?.code,
    body?.error?.details,
  );
}

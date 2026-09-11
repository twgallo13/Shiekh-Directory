import type { SessionUser } from './authSession';

export type DirectoryCollection = 'locations' | 'people' | 'users' | 'hours_templates' | 'corporate_holidays' | 'requests' | 'email_templates' | 'notification_rules' | 'sop_runbooks' | 'custom_field_definitions';
export interface DirectoryWrite { collection: DirectoryCollection; id: string; operation: 'set' | 'delete'; data?: Record<string, unknown>; expectedDefinition?: import('./customFields').CustomFieldDefinition | null; expectedCustomMetadata?: Record<string, unknown>; expectedVersion?: number }
export interface DirectoryAudit { action: string; entityType: 'Location' | 'Person' | 'User' | 'Setting' | 'Request' | 'Communication'; entityId: string; entityName: string; details: string }
export interface DirectoryCommittedRecord { collection: DirectoryCollection; id: string; operation: 'set' | 'delete'; data: Record<string, unknown> | null }
export interface DirectoryCommitResult { records: DirectoryCommittedRecord[] }

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
  if (response.ok) return await response.json() as DirectoryCommitResult;
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  throw new Error(body?.error?.message || (response.status === 403 ? 'Your role cannot make this directory change.' : 'The directory database could not save this change.'));
}
import type { SessionUser } from './authSession';
import { DirectoryCommitError, type DirectoryCommitResult } from './directoryClient';
import type { OperatingCommand } from '../../server/operatingCommand';
import type { OperatingPreview } from '../../server/firestoreOperating';
import type { OperatingState } from './operatingState';

async function post(user: SessionUser, mode: 'preview' | 'commit' | 'cancel', input: unknown) {
  const response = await fetch(`/api/directory/operating/${mode}`, { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new DirectoryCommitError(body?.error?.message || 'The operating result could not be confirmed. Recover the same operation before trying another.', body?.error?.code);
  return body;
}
export async function cancelOperatingCommand(user: SessionUser, command: OperatingCommand): Promise<boolean> {
  const body = await post(user, 'cancel', command);
  if (body.operationId !== command.operationId || typeof body.cancelled !== 'boolean') throw new DirectoryCommitError('Operating recovery could not be confirmed. Keep the same operation.');
  return body.cancelled;
}
export async function fetchOperatingPreview(user: SessionUser, locationId: string, action: OperatingCommand['action']): Promise<OperatingPreview> {
  const body = await post(user, 'preview', { locationId, action });
  if (body.locationId !== locationId || body.action !== action || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0 || !Number.isFinite(Date.parse(body.evaluatedAt)) || typeof body.locationName !== 'string' || typeof body.storeNumber !== 'string' || typeof body.timeZone !== 'string' || (action !== 'reopen' && !Number.isFinite(Date.parse(body.expectedExpiresAt))) || !body.state || !['Open', 'Closed', 'Unknown'].includes(body.state.state)) throw new DirectoryCommitError('The operating preview was invalid. Refresh saved state.');
  return body;
}
export async function saveOperatingCommand(user: SessionUser, command: OperatingCommand): Promise<DirectoryCommitResult & { state: OperatingState }> {
  const body = await post(user, 'commit', command);
  if (body.operationId !== command.operationId || !Array.isArray(body.records) || body.records.length !== 1 || body.records[0].collection !== 'locations' || body.records[0].id !== command.locationId || body.records[0].operation !== 'set' || body.records[0].data?.id !== command.locationId || !body.state || !['Open', 'Closed', 'Unknown'].includes(body.state.state) || !Number.isFinite(Date.parse(body.state.evaluatedAt)) || typeof body.state.reason !== 'string') throw new DirectoryCommitError('The operating save could not be confirmed. Recover the same operation.');
  return body;
}

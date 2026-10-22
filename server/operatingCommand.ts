import { createHash } from 'node:crypto';
import { nextLocalMidnight, type OperatingLocation, type TemporaryClosure } from '../src/lib/operatingState';
import { DirectoryConflict, DirectoryValidationError } from './firestoreDirectory';

export interface OperatingCommand {
  operationId: string;
  locationId: string;
  action: 'close' | 'renew' | 'reopen';
  reason: string;
  expectedVersion: number;
  expectedClosureId: string | null;
  expectedExpiresAt: string | null;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/** Explicit immutable operation body, shared by preview confirmation and durable replay binding. */
export function parseOperatingCommand(value: unknown): OperatingCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DirectoryValidationError('An operating update is required.');
  const body = value as Record<string, unknown>;
  const keys = ['operationId', 'locationId', 'action', 'reason', 'expectedVersion', 'expectedClosureId', 'expectedExpiresAt'];
  if (Object.keys(body).length !== keys.length || Object.keys(body).some(key => !keys.includes(key))
    || typeof body.operationId !== 'string' || !uuid.test(body.operationId)
    || typeof body.locationId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(body.locationId)
    || !['close', 'renew', 'reopen'].includes(String(body.action))
    || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 500
    || typeof body.expectedVersion !== 'number' || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0
    || (body.expectedClosureId !== null && (typeof body.expectedClosureId !== 'string' || !uuid.test(body.expectedClosureId)))
    || (body.expectedExpiresAt !== null && (typeof body.expectedExpiresAt !== 'string' || !Number.isFinite(Date.parse(body.expectedExpiresAt))))) throw new DirectoryValidationError('Provide a valid operating action, original confirmation, current version and a reason of 1–500 characters.');
  return { operationId: body.operationId, locationId: body.locationId, action: body.action as OperatingCommand['action'], reason: body.reason.trim(), expectedVersion: body.expectedVersion, expectedClosureId: body.expectedClosureId as string | null, expectedExpiresAt: body.expectedExpiresAt as string | null };
}
export function operatingCommandDigest(command: OperatingCommand, actorId: string): string {
  return createHash('sha256').update(JSON.stringify([actorId, command.operationId, command.locationId, command.action, command.reason, command.expectedVersion, command.expectedClosureId, command.expectedExpiresAt])).digest('hex');
}

/** Derive only the temporary override. Never rewrite permanent status, schedules, staffing or account authority. */
export function applyOperatingCommand(location: OperatingLocation & { version?: number }, command: OperatingCommand, now: Date): TemporaryClosure | null {
  if ((location.version ?? 0) !== command.expectedVersion || (location.temporaryClosure?.id ?? null) !== command.expectedClosureId) throw new DirectoryConflict('The Location or closure changed. Refresh and review a new confirmation.');
  if (location.recordStatus !== 'Active' || ['Permanently Closed', 'Opening Soon — New Store', 'Temporarily Closed — Emergency'].includes(String(location.operationalStatus))) throw new DirectoryValidationError('Review this Location lifecycle/legacy closure before using temporary operating updates.');
  const existing = location.temporaryClosure;
  const active = existing && Date.parse(existing.startsAt) <= now.getTime() && Date.parse(existing.expiresAt) > now.getTime();
  if (command.action === 'reopen') {
    if (!active || command.expectedExpiresAt !== existing.expiresAt) throw new DirectoryConflict('No matching active temporary closure remains. Refresh saved state.');
    return null;
  }
  let expiresAt: string;
  try { if (!location.timeZone) throw new Error(); expiresAt = nextLocalMidnight(now, location.timeZone).toISOString(); }
  catch { throw new DirectoryValidationError('A valid Location time zone is required before reporting closure.'); }
  if (command.expectedExpiresAt !== expiresAt) throw new DirectoryConflict('The store-local day changed. Review the new midnight expiry before confirming.');
  if (command.action === 'close' && active) throw new DirectoryConflict('A closure is already active. Refresh saved state instead of creating another.');
  if (command.action === 'renew' && !existing) throw new DirectoryConflict('There is no prior closure to renew. Report a new closure instead.');
  if (command.action === 'renew' && active && existing.expiresAt === expiresAt) throw new DirectoryValidationError('The current closure already covers the rest of this local day. Confirm again on the next day if it must continue.');
  return { id: command.operationId, reason: command.reason, startsAt: now.toISOString(), expiresAt, timeZone: location.timeZone! };
}

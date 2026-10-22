import type { Firestore, Transaction } from '@google-cloud/firestore';
import type { Account } from './authAuthority';
import { APPLICATION_ROLES } from './authAuthority';
import { DirectoryConflict, DirectoryValidationError, DirectoryWriteDenied, type DirectoryCommitResult } from './firestoreDirectory';
import { canManageOperatingState } from '../src/lib/operatingPermission';
import { nextLocalMidnight, resolveOperatingState, type OperatingLocation } from '../src/lib/operatingState';
import type { DistrictRecord, LocationRecord, Person, RegionRecord } from '../src/types';
import { applyOperatingCommand, operatingCommandDigest, parseOperatingCommand, type OperatingCommand } from './operatingCommand';

export interface OperatingPreview {
  locationId: string; locationName: string; storeNumber: string; timeZone: string;
  action: OperatingCommand['action']; expectedVersion: number; expectedClosureId: string | null;
  expectedExpiresAt: string | null; evaluatedAt: string;
  state: ReturnType<typeof resolveOperatingState>;
}

async function context(firestore: Firestore, transaction: Transaction, id: string, actor: Account) {
  const reference = firestore.collection('locations').doc(id);
  const [snapshot, accounts] = await Promise.all([transaction.get(reference), transaction.get(firestore.collection('users').where('firebaseUid', '==', actor.uid).limit(2))]);
  const account = accounts.docs[0]?.data();
  if (!snapshot.exists) throw new DirectoryConflict('This Location no longer exists.');
  if (accounts.docs.length !== 1 || account?.status !== 'Active' || !APPLICATION_ROLES.includes(account.role)) throw new DirectoryWriteDenied('Your current Directory access cannot make operating updates.');
  const currentActor: Account = { ...actor, role: account.role, accessScope: String(account.accessScope || ''), personId: typeof account.personId === 'string' ? account.personId : null, name: String(account.name || account.displayName || actor.name) };
  const location = { ...snapshot.data(), id } as LocationRecord & OperatingLocation;
  const person = currentActor.personId ? await transaction.get(firestore.collection('people').doc(currentActor.personId)) : null;
  const district = location.districtId ? await transaction.get(firestore.collection('districts').doc(location.districtId)) : null;
  const districtData = district?.exists ? { ...district.data(), id: district.id } as DistrictRecord : null;
  const region = districtData?.regionId ? await transaction.get(firestore.collection('regions').doc(districtData.regionId)) : null;
  const people = person?.exists ? [{ ...person.data(), id: person.id } as Person] : [];
  if (!canManageOperatingState(currentActor, location, people, districtData ? [districtData] : [], region?.exists ? [{ ...region.data(), id: region.id } as RegionRecord] : [])) throw new DirectoryWriteDenied('Only scoped administrators/stewards or the currently assigned active SM/DM may update this Location. A job title alone does not grant access.');
  return { reference, location, actor: currentActor };
}

export async function previewOperating(firestore: Firestore, locationId: string, action: string, actor: Account, clock = () => new Date()): Promise<OperatingPreview> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(locationId) || !['close', 'renew', 'reopen'].includes(action)) throw new DirectoryValidationError('Choose an existing Location and supported operating action.');
  return firestore.runTransaction(async transaction => {
    const { location } = await context(firestore, transaction, locationId, actor);
    const now = clock();
    let expiresAt: string | null;
    try { expiresAt = action === 'reopen' ? location.temporaryClosure?.expiresAt ?? null : nextLocalMidnight(now, location.timeZone).toISOString(); }
    catch { throw new DirectoryValidationError('Correct the Location time zone before reporting closure.'); }
    const preview: OperatingPreview = { locationId, locationName: location.name, storeNumber: location.storeNumber, timeZone: location.timeZone, action: action as OperatingCommand['action'], expectedVersion: location.version ?? 0, expectedClosureId: location.temporaryClosure?.id ?? null, expectedExpiresAt: expiresAt, evaluatedAt: now.toISOString(), state: resolveOperatingState(location, now) };
    // Apply validation only; preview performs no writes and creates no audit or notification.
    applyOperatingCommand(location, { ...preview, operationId: '00000000-0000-0000-0000-000000000000', reason: 'Preview only' }, now);
    return preview;
  }, { readOnly: true });
}

export async function commitOperating(firestore: Firestore, input: unknown, actor: Account, clock = () => new Date()): Promise<DirectoryCommitResult & { operationId: string; state: ReturnType<typeof resolveOperatingState> }> {
  const command = parseOperatingCommand(input), digest = operatingCommandDigest(command, actor.uid);
  return firestore.runTransaction(async transaction => {
    const { reference, location, actor: authoritativeActor } = await context(firestore, transaction, command.locationId, actor);
    const receiptReference = firestore.collection('operating_command_receipts').doc(command.operationId);
    const receipt = await transaction.get(receiptReference), now = clock();
    if (receipt.exists) {
      if (receipt.data()?.digest !== digest || receipt.data()?.actorId !== actor.uid) throw new DirectoryConflict('This operating operation ID belongs to different content or another actor.');
      if (receipt.data()?.cancelled === true) throw new DirectoryConflict('This operating operation was safely cancelled. Review a new preview.');
      return { operationId: command.operationId, records: [{ collection: 'locations', id: location.id, operation: 'set', data: location as unknown as Record<string, unknown> }], replayed: true, state: resolveOperatingState(location, now) };
    }
    const temporaryClosure = applyOperatingCommand(location, command, now);
    const updated = { ...location, temporaryClosure, version: (location.version ?? 0) + 1, updatedAt: now.toISOString() };
    const event = { id: command.operationId, locationId: location.id, storeNumber: location.storeNumber, locationName: location.name, action: command.action, reason: command.reason, previousClosure: location.temporaryClosure ?? null, closure: temporaryClosure, actorId: actor.uid, actorName: authoritativeActor.name, timestamp: now.toISOString(), locationVersion: updated.version };
    transaction.set(reference, updated);
    transaction.set(firestore.collection('operating_events').doc(command.operationId), event);
    transaction.set(receiptReference, { id: command.operationId, digest, actorId: actor.uid, locationId: location.id, timestamp: event.timestamp, locationVersion: updated.version });
    const auditId = `aud-operating-${command.operationId}`;
    transaction.set(firestore.collection('audit_logs').doc(auditId), { id: auditId, timestamp: event.timestamp, userId: actor.uid, userName: authoritativeActor.name, action: 'Temporary Operating Update', entityType: 'Location', entityId: location.id, entityName: location.name, details: `${command.action}: ${command.reason}${temporaryClosure ? `; expires ${temporaryClosure.expiresAt} (${temporaryClosure.timeZone})` : '; return to applicable schedule/lifecycle, not forced open'}`, previousState: location, newState: updated });
    return { operationId: command.operationId, records: [{ collection: 'locations', id: location.id, operation: 'set', data: updated as unknown as Record<string, unknown> }], state: resolveOperatingState(updated, now) };
  });
}

/** Seal an unresolved command even after reassignment; never cancel an already committed event. */
export async function cancelOperating(firestore: Firestore, input: unknown, actor: Account, clock = () => new Date()): Promise<{ operationId: string; cancelled: boolean }> {
  const command = parseOperatingCommand(input), digest = operatingCommandDigest(command, actor.uid);
  return firestore.runTransaction(async transaction => {
    const reference = firestore.collection('operating_command_receipts').doc(command.operationId);
    const receipt = await transaction.get(reference);
    if (receipt.exists) {
      if (receipt.data()?.actorId !== actor.uid || receipt.data()?.digest !== digest) throw new DirectoryConflict('Operating operation belongs to different content or another actor.');
      return { operationId: command.operationId, cancelled: receipt.data()?.cancelled === true };
    }
    const timestamp = clock().toISOString();
    transaction.set(reference, { id: command.operationId, digest, actorId: actor.uid, locationId: command.locationId, cancelled: true, timestamp });
    const id = `aud-operating-cancel-${command.operationId}`;
    transaction.set(firestore.collection('audit_logs').doc(id), { id, timestamp, userId: actor.uid, userName: actor.name, action: 'Operating Submission Cancelled', entityType: 'Location', entityId: command.locationId, entityName: 'Unconfirmed operating update', details: 'Uncommitted operating update sealed against late arrival before a new preview.' });
    return { operationId: command.operationId, cancelled: true };
  });
}

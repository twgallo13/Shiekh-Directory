import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyOperatingCommand, parseOperatingCommand } from '../server/operatingCommand';
import type { OperatingLocation } from '../src/lib/operatingState';
const now = new Date('2026-10-22T18:00:00Z');
const location: OperatingLocation & { version: number } = { recordStatus: 'Active', operationalStatus: 'Open — Normal Operations', timeZone: 'America/Los_Angeles', version: 3 };
const command = { operationId: '12345678-1234-1234-1234-123456789abc', locationId: 'store', action: 'close', reason: 'Power outage', expectedVersion: 3, expectedClosureId: null, expectedExpiresAt: '2026-10-23T07:00:00.000Z' };
test('closure confirmation is version/identity/day bound and changes only the temporary override', () => {
  const before = structuredClone(location);
  const saved = applyOperatingCommand(location, parseOperatingCommand(command), now)!;
  assert.equal(saved.expiresAt, command.expectedExpiresAt); assert.equal(saved.reason, command.reason);
  assert.deepEqual(location, before);
  for (const patch of [{ expectedVersion: 2 }, { expectedClosureId: command.operationId }, { expectedExpiresAt: '2026-10-24T07:00:00.000Z' }]) assert.throws(() => applyOperatingCommand(location, parseOperatingCommand({ ...command, ...patch }), now));
});
test('reopening returns to schedule, renewal is explicit after midnight and same-day renewal is a no-op', () => {
  const temporaryClosure = applyOperatingCommand(location, parseOperatingCommand(command), now)!;
  const current = { ...location, temporaryClosure, version: 4 };
  assert.equal(applyOperatingCommand(current, parseOperatingCommand({ ...command, action: 'reopen', expectedVersion: 4, expectedClosureId: temporaryClosure.id }), now), null);
  assert.throws(() => applyOperatingCommand(current, parseOperatingCommand({ ...command, action: 'renew', expectedVersion: 4, expectedClosureId: temporaryClosure.id }), now), /already covers/);
  const nextDay = new Date('2026-10-23T18:00:00Z');
  assert.equal(applyOperatingCommand(current, parseOperatingCommand({ ...command, action: 'renew', expectedVersion: 4, expectedClosureId: temporaryClosure.id, expectedExpiresAt: '2026-10-24T07:00:00.000Z' }), nextDay)?.expiresAt, '2026-10-24T07:00:00.000Z');
});
test('client actor/timestamps/arbitrary status fields, missing reasons and permanent closures are rejected', () => {
  for (const patch of [{ reason: '' }, { actorId: 'forged' }, { startsAt: now.toISOString() }, { operationalStatus: 'Open' }, { action: 'force-open' }]) assert.throws(() => parseOperatingCommand({ ...command, ...patch }));
  assert.throws(() => applyOperatingCommand({ ...location, operationalStatus: 'Permanently Closed' }, parseOperatingCommand(command), now), /lifecycle/);
});

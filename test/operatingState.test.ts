import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectiveNotice, nextLocalMidnight, resolveOperatingState, type OperatingLocation } from '../src/lib/operatingState';
import { DEFAULT_WEEKLY_HOURS } from '../src/lib/defaultHours';

const loc: OperatingLocation = { recordStatus: 'Active', operationalStatus: 'Open — Normal Operations', timeZone: 'America/Los_Angeles', standardHours: structuredClone(DEFAULT_WEEKLY_HOURS) };
const state = (patch: OperatingLocation = {}, time = '2026-10-22T18:00:00Z') => resolveOperatingState({ ...loc, ...patch }, new Date(time));
test('operating state uses the store clock, schedule and strict close boundary', () => {
  assert.equal(state().state, 'Open');
  assert.equal(state({}, '2026-10-22T16:59:59Z').state, 'Closed');
  assert.equal(state({}, '2026-10-23T03:00:00Z').state, 'Closed');
  assert.equal(state({ timeZone: 'America/New_York' }, '2026-10-22T14:00:00Z').state, 'Open');
});
test('unknown data never invents default hours or infers that renovation means open', () => {
  for (const patch of [{ standardHours: undefined }, { timeZone: 'Invalid/Zone' }, { operationalStatus: 'Under Remodel / Renovation' as const }, { operationalStatus: 'Temporarily Modified Hours' as const }, { recordStatus: 'Draft' as const }]) assert.equal(state(patch).state, 'Unknown');
});
test('lifecycle closure and active incident precede scheduled opening without mutating stored status', () => {
  const temporaryClosure = { id: 'event', reason: 'Power outage', startsAt: '2026-10-22T17:00:00Z', expiresAt: '2026-10-23T07:00:00Z', timeZone: 'America/Los_Angeles' };
  assert.equal(state({ temporaryClosure }).state, 'Closed');
  assert.equal(state({ temporaryClosure }).scheduleSource, 'temporary-closure');
  assert.equal(state({ temporaryClosure, operationalStatus: 'Permanently Closed' }).scheduleSource, 'lifecycle');
  assert.equal(state({ temporaryClosure }, '2026-10-23T18:00:00Z').state, 'Open');
  assert.equal(loc.operationalStatus, 'Open — Normal Operations');
});
test('local-midnight expiry is DST safe rather than 24 elapsed hours', () => {
  assert.equal(nextLocalMidnight(new Date('2026-03-08T08:00:00Z'), 'America/Los_Angeles').toISOString(), '2026-03-09T07:00:00.000Z');
  assert.equal(nextLocalMidnight(new Date('2026-11-01T07:00:00Z'), 'America/Los_Angeles').toISOString(), '2026-11-02T08:00:00.000Z');
  assert.equal(nextLocalMidnight(new Date('2026-10-22T23:59:59Z'), 'America/New_York').toISOString(), '2026-10-23T04:00:00.000Z');
});

test('confirmed closure deadline survives a later time-zone edit; indefinite overrides fail closed', () => {
  const temporaryClosure = { id: 'event', reason: 'Power outage', startsAt: '2026-10-22T17:00:00Z', expiresAt: '2026-10-23T07:00:00Z', timeZone: 'America/Los_Angeles' };
  const changed = state({ timeZone: 'America/New_York', temporaryClosure });
  assert.equal(changed.state, 'Closed'); assert.match(changed.issues[0], /deadline is retained/);
  assert.equal(state({ temporaryClosure: { ...temporaryClosure, expiresAt: '2027-01-01T00:00:00Z' } }).state, 'Unknown');
});
test('previous-day overnight hours survive a weekly closed day but not a dated closure', () => {
  const standardHours = { ...DEFAULT_WEEKLY_HOURS, thursday: { open: '22:00', close: '02:00', isClosed: false }, friday: { open: '', close: '', isClosed: true } };
  assert.equal(state({ standardHours }, '2026-10-23T08:00:00Z').state, 'Open');
  assert.equal(state({ standardHours }, '2026-10-23T09:00:00Z').state, 'Closed');
  assert.equal(state({ standardHours, holidayHours: [{ id: 'holiday', date: '2026-10-23', holidayName: 'Closed', hours: { open: '', close: '', isClosed: true } }] }, '2026-10-23T08:00:00Z').state, 'Closed');
});
test('special/holiday hours apply on store date; conflicting overrides are unknown', () => {
  const specialHours = [{ id: 'special', description: 'Extended', startDate: '2026-10-22', endDate: '2026-10-22', hours: { open: '08:00', close: '23:00', isClosed: false } }];
  assert.equal(state({ specialHours }, '2026-10-23T05:00:00Z').state, 'Open');
  assert.equal(state({ specialHours }).scheduleSource, 'special');
  assert.equal(state({ specialHours, holidayHours: [{ id: 'holiday', date: '2026-10-22', holidayName: 'Holiday', hours: { open: '', close: '', isClosed: true } }] }).state, 'Unknown');
});
test('equal hours are ambiguous; DST gaps are unknown and folds use continuous earliest-open/latest-close', () => {
  assert.equal(state({ standardHours: { ...DEFAULT_WEEKLY_HOURS, thursday: { open: '10:00', close: '10:00', isClosed: false } } }).state, 'Unknown');
  const standardHours = { ...DEFAULT_WEEKLY_HOURS, sunday: { open: '01:00', close: '02:30', isClosed: false } };
  assert.equal(state({ standardHours }, '2026-03-08T09:30:00Z').state, 'Unknown');
  for (const time of ['2026-11-01T08:45:00Z', '2026-11-01T09:45:00Z']) assert.equal(state({ standardHours }, time).state, 'Open');
});
test('notice dates are independent of operating status and expected-resolution estimates', () => {
  const activeNotice = { shortDescription: 'North entrance', effectiveDate: '2026-10-22', expectedResolutionDate: '2026-10-22', displayUntilDate: '2026-10-23' };
  assert.ok(effectiveNotice({ ...loc, activeNotice }, new Date('2026-10-24T06:59:00Z')));
  assert.equal(effectiveNotice({ ...loc, activeNotice }, new Date('2026-10-24T07:00:00Z')), null);
  assert.equal(effectiveNotice({ ...loc, activeNotice }, new Date('2026-10-22T06:59:00Z')), null);
});

test('malformed dated input is safe and lifecycle closure does not depend on valid hours/time zone', () => {
  for (const patch of [{ holidayHours: {} }, { holidayHours: [{ date: 'invalid' }] }, { specialHours: [{ startDate: '2026-10-23', endDate: '2026-10-22' }] }, { temporaryClosure: { reason: 123 } }]) {
    assert.equal(state(patch as unknown as OperatingLocation).state, 'Unknown');
  }
  assert.equal(state({ operationalStatus: 'Permanently Closed', timeZone: 'Invalid/Zone', standardHours: undefined }).state, 'Closed');
  assert.equal(state({ recordStatus: 'Retired', timeZone: undefined }).state, 'Closed');
});

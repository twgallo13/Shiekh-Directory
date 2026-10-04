import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCorrection, correctionReview, hoursDraft, structurallyEqual } from '../src/lib/correctionRequest';
import { DEFAULT_WEEKLY_HOURS } from '../src/lib/defaultHours';
import type { LocationRecord, UpdateRequest } from '../src/types';
import { canonicalDirectoryBootstrap } from '../src/lib/canonicalDirectoryBootstrap';

test('correction equality ignores object key order but retains array order and actual values', () => {
  assert.ok(structurallyEqual({ monday: { open: '10:00', close: '20:00', isClosed: false } }, { monday: { isClosed: false, close: '20:00', open: '10:00' } }));
  assert.equal(structurallyEqual([1, 2], [2, 1]), false);
  assert.equal(structurallyEqual({ a: null }, {}), false);
});

test('selected hours drafts are detached from selected records and reset to fallback when absent', () => {
  const location = { id: 'synthetic', standardHours: structuredClone(DEFAULT_WEEKLY_HOURS) } as LocationRecord;
  const draft = hoursDraft(location, DEFAULT_WEEKLY_HOURS);
  draft.monday.open = '09:00';
  assert.notEqual(location.standardHours?.monday.open, '09:00');
  assert.deepEqual(hoursDraft(undefined, DEFAULT_WEEKLY_HOURS), DEFAULT_WEEKLY_HOURS);
});

test('review distinguishes historical baseline, live no-op, stale or missing targets and safe changed hours', () => {
  const original = structuredClone(DEFAULT_WEEKLY_HOURS);
  const proposed = { ...original, monday: { ...original.monday, open: '09:00' } };
  const request: Pick<UpdateRequest, 'requestedChanges' | 'currentSnapshot'> = { requestedChanges: { standardHours: proposed }, currentSnapshot: { standardHours: original } };
  assert.equal(correctionReview(request, { standardHours: original }).blockedReason, null);
  assert.match(correctionReview(request, { standardHours: proposed }).blockedReason!, /No change to apply/);
  assert.match(correctionReview(request, { standardHours: { ...original, monday: { ...original.monday, close: '19:00' } } }).blockedReason!, /changed since submission/);
  assert.match(correctionReview({ ...request, currentSnapshot: {} }, { standardHours: original }).blockedReason!, /baseline is missing/);
  assert.match(correctionReview(request, undefined).blockedReason!, /target is missing/);
  assert.deepEqual(correctionReview(request, { standardHours: original }).currentValues, { standardHours: original });
  assert.match(correctionReview({ requestedChanges: { standardHours: original, hoursMode: 'custom' }, currentSnapshot: { standardHours: original } }, { standardHours: original, hoursMode: 'template' }).blockedReason!, /No change to apply/);
  assert.match(correctionReview({ requestedChanges: { phone: '5550100' }, currentSnapshot: { phone: '5550101' } }, { phone: '5550102' }).blockedReason!, /phone changed since submission/);
});

test('custom hours correction clears only template linkage and preserves canonical staffing/history', () => {
  const original = { hoursMode: 'template', hoursTemplateId: 'tpl', standardHours: DEFAULT_WEEKLY_HOURS, storeManagerId: 'missing-person', keyHolderIds: ['p-1'], regionalManagerId: 'p-rm', regionId: 'r', districtId: 'd' };
  const result = applyCorrection(original, { standardHours: DEFAULT_WEEKLY_HOURS });
  assert.equal(result.hoursMode, 'custom');
  assert.equal(Object.hasOwn(result, 'hoursTemplateId'), false);
  for (const field of ['storeManagerId', 'keyHolderIds', 'regionalManagerId', 'regionId', 'districtId']) assert.deepEqual(Reflect.get(result, field), Reflect.get(original, field));
  assert.equal(applyCorrection(original, { name: 'Renamed' }).hoursTemplateId, 'tpl');
});

test('bootstrap never relinks an explicit custom schedule even if it matches a template', () => {
  const location = { id: 'synthetic', hoursMode: 'custom', standardHours: structuredClone(DEFAULT_WEEKLY_HOURS) } as LocationRecord;
  const result = canonicalDirectoryBootstrap([location], [], [{ id: 'template', name: 'Synthetic', description: '', schedule: DEFAULT_WEEKLY_HOURS }]);
  assert.deepEqual(result.locations[0], location);
  assert.equal(Object.hasOwn(result.locations[0], 'hoursTemplateId'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrganizationMoveDraft, moveStoreReady, moveUnitReady, emptyMoveSelection } from '../src/lib/organizationMoveDraft';
import { moveBrowserFixture } from './helpers/organizationMoveBrowserFixture';
const selection = () => ({ kind: 'store' as const, id: '007', regionId: '02', districtId: '02', reason: 'Reorganize coverage' });
test('natural multiline reasons normalize to the strict intent contract; other controls get an actionable error', () => {
  const f = moveBrowserFixture();
  const draft = buildOrganizationMoveDraft(f.catalog, f.locations, { ...selection(), reason: '  Reorganize\r\ncoverage\nfor\tstores  ' });
  assert.equal(draft.reason, 'Reorganize coverage for stores');
  assert.throws(() => buildOrganizationMoveDraft(f.catalog, f.locations, { ...selection(), reason: 'Invalid\u0000reason' }), /unsupported characters/);
});
test('store uses exact saved versions and preserves leading-zero IDs without inferring a destination', () => {
  const f = moveBrowserFixture(), draft = buildOrganizationMoveDraft(f.catalog, f.locations, selection());
  assert.deepEqual(draft, { schemaVersion: 1, kind: 'store', id: '007', expectedVersion: 4, targetId: '02', expectedTargetVersion: 1, reason: 'Reorganize coverage' });
  assert.throws(() => buildOrganizationMoveDraft(f.catalog, f.locations, emptyMoveSelection()), /Choose/);
  assert.throws(() => buildOrganizationMoveDraft(f.catalog, f.locations, { ...selection(), regionId: '01' }), /within/);
});
test('district parent moves use Region version and reject no-ops and missing reasons', () => {
  const f = moveBrowserFixture(), s = { ...selection(), kind: 'district' as const, id: '01' };
  const draft = buildOrganizationMoveDraft(f.catalog, f.locations, s); assert.equal(draft.expectedVersion, 3); assert.equal(draft.targetId, '02');
  assert.throws(() => buildOrganizationMoveDraft(f.catalog, f.locations, { ...s, regionId: '01' }), /different/);
  assert.throws(() => buildOrganizationMoveDraft(f.catalog, f.locations, { ...s, reason: '' }), /reason/);
});
test('fresh records rebuild versions while legacy, unresolved, retired or incompatible source blocks', () => {
  const f = moveBrowserFixture(); f.locations[0].version = 9; assert.equal(buildOrganizationMoveDraft(f.catalog, f.locations, selection()).expectedVersion, 9);
  f.catalog.units[0].ownership = 'legacy'; assert.equal(moveUnitReady(f.catalog.units[0]), false); assert.throws(() => buildOrganizationMoveDraft(f.catalog, f.locations, selection()), /completed/);
  f.catalog.units[0].ownership = 'managed'; f.locations[0].type = 'Corporate Office'; assert.equal(moveStoreReady(f.locations[0]), false);
  f.locations[0].type = 'Enclosed Mall'; f.locations[0].hierarchyApplicability = 'Not Applicable'; assert.equal(moveStoreReady(f.locations[0]), false);
});

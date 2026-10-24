import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPositionRemovalIntent, positionRemovalRows, removalCandidates } from '../src/lib/positionRemovalReview';
import type { DirectorySeed } from '../src/lib/directorySeed';
const fixture = (): DirectorySeed => ({
  serverNow: new Date().toISOString(), people: [{ id: 'subject', fullName: 'Subject', positionIds: ['store-manager', 'district-manager'], status: 'Active' }, { id: 'mapped', fullName: 'Eligible', positionIds: ['district-manager', 'store-manager'], status: 'Active' }, { id: 'title', fullName: 'Title only', jobTitle: 'District Manager', status: 'Active' }, { id: 'inactive', fullName: 'Inactive', positionIds: ['district-manager'], status: 'Inactive' }] as any,
  regions: [{ id: 'west', name: 'West', status: 'Active' }], districts: [{ id: 'north', name: 'North', status: 'Active', regionId: 'west', districtManagerId: 'subject' }],
  locations: [{ id: 'store', storeNumber: '007', name: 'Store', type: 'Enclosed Mall', recordStatus: 'Active', regionId: 'west', districtId: 'north', storeManagerId: 'subject', districtManagerId: 'subject' }, { id: 'retired', storeNumber: '008', name: 'Retired', type: 'Enclosed Mall', recordStatus: 'Retired', regionId: 'west', districtId: 'north', districtManagerId: 'subject' }] as any,
  users: [], requests: [], auditLogs: [], hoursTemplates: [], corporateHolidays: [], emailTemplates: [], notificationRules: [], outboxLogs: [], sopRunbooks: [],
});
test('removal lists one District decision including retired derived stores and retains the explicitly held SM assignment', () => {
  const seed = fixture(), rows = positionRemovalRows(seed, 'subject', ['store-manager']);
  assert.equal(rows.length, 2); assert.deepEqual(rows.map(r => [r.owner, r.required]), [['districts', true], ['locations', false]]); assert.equal(rows[0].storeCount, 2);
  assert.deepEqual(removalCandidates(seed, 'subject', rows[0]).map(p => p.id), ['mapped']);
  assert.throws(() => buildPositionRemovalIntent(seed, 'subject', ['store-manager'], {}, 'Reason', []), /Choose/);
  const intent = buildPositionRemovalIntent(seed, 'subject', ['store-manager'], { [rows[0].key]: 'mapped' }, 'Reason', []);
  assert.deepEqual(intent.responsibilities.map(r => [r.owner, r.action]), [['districts', 'replace'], ['locations', 'retain']]); assert.deepEqual(intent.primaryWorkplace, { action: 'retain' }); assert.equal(intent.lifecycle, 'keep');
});
test('vacancy must be explicit; title-only, inactive and self replacements never pass', () => {
  const seed = fixture(), row = positionRemovalRows(seed, 'subject', ['store-manager'])[0];
  for (const id of ['subject', 'title', 'inactive', 'missing']) assert.throws(() => buildPositionRemovalIntent(seed, 'subject', ['store-manager'], { [row.key]: id }, 'Reason', []), /not eligible/);
  const intent = buildPositionRemovalIntent(seed, 'subject', ['store-manager'], { [row.key]: '__vacant__' }, ' Reason ', []); assert.equal(intent.responsibilities[0].action, 'vacate'); assert.equal(intent.reason, 'Reason');
  assert.throws(() => buildPositionRemovalIntent(seed, 'subject', ['store-manager'], { [row.key]: '__vacant__' }, '', []));
});
test('retired or unresolved owners offer no new replacement, but retain an explicit vacancy path', () => {
  const seed = fixture(); seed.districts[0].status = 'Retired'; const row = positionRemovalRows(seed, 'subject', ['store-manager'])[0];
  assert.deepEqual(removalCandidates(seed, 'subject', row), []);
  assert.equal(buildPositionRemovalIntent(seed, 'subject', ['store-manager'], { [row.key]: '__vacant__' }, 'Reason', []).responsibilities[0].action, 'vacate');
});

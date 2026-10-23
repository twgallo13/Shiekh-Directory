import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leadershipCandidates, leadershipPickerOptions, matchesListedLeadershipRole, type LeadershipRole } from '../src/lib/leadershipPicker';
import { PERSON_POSITIONS } from '../src/lib/personPositions';

const person = (id: string, jobTitle: string, extra = {}) => ({ id, fullName: id, jobTitle, status: 'Active', activeStatus: true, ...extra });
for (const [role, alias] of [['District Manager', ' DM '], ['Regional Manager', 'rm'], ['Store Manager', ' SM'], ['Assistant Store Manager', 'assistant   manager'], ['Key Holder', 'keyholder']] as [LeadershipRole, string][]) {
  test(`${role} picker recognizes a limited listed-position alias, not unrelated titles`, () => {
    assert(matchesListedLeadershipRole(person('match', alias), role));
    assert(!matchesListedLeadershipRole(person('unrelated', 'Accountant'), role));
    assert(!matchesListedLeadershipRole(person('prefix', `Former ${role}`), role));
    const mapped = person('mapped', 'Unrelated display title', { positionIds: [PERSON_POSITIONS.find(p => p.label === role)!.id] });
    assert.deepEqual(leadershipCandidates([person('unrelated', 'Accountant'), person('match', alias), mapped], role).map(p => p.id), ['mapped']);
  });
}
test('explicit job title wins over a conflicting legacy role; a blank job title can use its legacy role', () => {
  assert(!matchesListedLeadershipRole(person('conflict', 'Store Manager', { role: 'District Manager' }), 'District Manager'));
  assert(matchesListedLeadershipRole(person('legacy', ' ', { role: 'District Manager' }), 'District Manager'));
});
test('inactive, unknown and duplicate identities never become new candidates, including show-all mode', () => {
  const dm = { positionIds: ['district-manager'] };
  const roster = [person('active', 'District Manager', dm), person('inactive', 'District Manager', { ...dm, status: 'Inactive', activeStatus: false }), person('unknown', 'District Manager', { ...dm, activeStatus: false }), person('duplicate', 'District Manager', dm), person('duplicate', 'District Manager', dm)];
  for (const showAll of [false, true]) assert.deepEqual(leadershipCandidates(roster, 'District Manager', showAll).map(p => p.id), ['active']);
});
test('older show-all callers cannot widen new eligibility or mutate titles and assignments', () => {
  const roster = [person('other', 'Operations Lead'), person('legacy-dm', 'District Manager'), person('mapped-dm', 'Operations Lead', { positionIds: ['district-manager'] }), person('mapped-sm', 'District Manager', { positionIds: ['store-manager'] })];
  const before = structuredClone(roster);
  assert.equal(leadershipCandidates(roster, 'District Manager').length, 1);
  assert.equal(leadershipCandidates(roster, 'District Manager', true).length, 1);
  assert.deepEqual(roster, before);
});
test('all five slots retain unmatched current IDs visibly but disable them as new choices', () => {
  const roster = [person('current', 'Operations Lead')];
  for (const role of ['District Manager', 'Regional Manager', 'Store Manager', 'Assistant Store Manager', 'Key Holder'] as LeadershipRole[]) {
    const options = leadershipPickerOptions(roster, role, false, 'current');
    assert.equal(options[0].id, 'current'); assert.equal(options[0].currentOnly, true);
    assert.match(options[0].label, /Current assignment/);
  }
});
test('missing and inactive assignments remain reviewable even without copied names', () => {
  const roster = [person('inactive', 'District Manager', { status: 'Inactive', activeStatus: false })];
  for (const id of ['inactive', 'missing']) {
    const options = leadershipPickerOptions(roster, 'District Manager', false, id);
    assert.equal(options.length, 1); assert.equal(options[0].id, id); assert(options[0].currentOnly);
    if (id === 'missing') assert.match(options[0].label, /Unresolved person \[missing\]/);
  }
});

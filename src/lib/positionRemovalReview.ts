import type { DirectorySeed } from './directorySeed';
import { isRetailHierarchyType, resolveLocationHierarchy } from './hierarchyResolution';
import { allowsLeadershipPosition, LEADERSHIP_POSITION_FIELDS, PERSON_POSITIONS, type PersonPositionId } from './personPositions';
import { personLifecycle } from './personLifecycle';
import { normalizePersonTransitionIntent, type LeadershipField, type ResponsibilityDecision } from './personTransitionIntent';

export interface RemovalRow { key: string; owner: 'districts' | 'locations'; id: string; field: LeadershipField; label: string; role: typeof LEADERSHIP_POSITION_FIELDS[LeadershipField]; required: boolean; storeCount?: number }
export function positionRemovalRows(seed: DirectorySeed, personId: string, desired: PersonPositionId[]): RemovalRow[] {
  const rows: RemovalRow[] = [];
  const add = (owner: RemovalRow['owner'], id: string, field: LeadershipField, label: string, storeCount?: number) => {
    const role = LEADERSHIP_POSITION_FIELDS[field];
    rows.push({ key: `${owner}/${id}/${field}`, owner, id, field, label, role, required: !desired.includes(PERSON_POSITIONS.find(p => p.label === role)!.id), ...(storeCount === undefined ? {} : { storeCount }) });
  };
  for (const d of seed.districts) if (d.districtManagerId === personId) add('districts', d.id, 'districtManagerId', `${d.name}${d.status === 'Retired' ? ' · Retired District' : ''}`, seed.locations.filter(l => l.districtId === d.id && isRetailHierarchyType(l.type)).length);
  for (const l of seed.locations) for (const field of Object.keys(LEADERSHIP_POSITION_FIELDS) as LeadershipField[]) {
    const district = seed.districts.find(d => d.id === l.districtId);
    if (field === 'districtManagerId' && isRetailHierarchyType(l.type) && district && Object.hasOwn(district, 'districtManagerId')) continue;
    const value = l[field];
    if (Array.isArray(value) ? value.includes(personId) : value === personId) add('locations', l.id, field, `#${l.storeNumber} · ${l.name}${l.recordStatus === 'Retired' ? ' · Retired Location' : ''}`);
  }
  return rows;
}
export function removalCandidates(seed: DirectorySeed, subjectId: string, row: RemovalRow) {
  const owner = row.owner === 'districts' ? seed.districts.find(d => d.id === row.id) : seed.locations.find(l => l.id === row.id);
  if (!owner) return [];
  if (row.owner === 'districts') { const d = seed.districts.find(d => d.id === row.id)!; if (d.status !== 'Active' || seed.regions.find(r => r.id === d.regionId)?.status !== 'Active') return []; }
  else {
    const l = seed.locations.find(l => l.id === row.id)!;
    if (l.recordStatus !== 'Active') return [];
    const h = resolveLocationHierarchy(l, seed);
    if (h.hierarchyIssues.length || h.applicabilityIssues.length || !(h.hierarchyApplicability === 'Not Applicable' && !isRetailHierarchyType(l.type) || h.hierarchyApplicability === 'Applicable' && h.hierarchyStatus === 'resolved' && h.districtStatus === 'Active' && h.regionStatus === 'Active')) return [];
  }
  const members = row.owner === 'locations' ? seed.locations.find(l => l.id === row.id)![row.field] : null;
  return seed.people.filter(p => p.id !== subjectId && !(Array.isArray(members) && members.includes(p.id)) && personLifecycle(p) === 'active' && allowsLeadershipPosition(p, row.role)).sort((a, b) => a.fullName.localeCompare(b.fullName));
}
export function buildPositionRemovalIntent(seed: DirectorySeed, personId: string, desired: PersonPositionId[], choices: Record<string, string>, reason: string, acknowledged: string[]) {
  const subject = seed.people.find(p => p.id === personId);
  if (!subject || personLifecycle(subject) !== 'active') throw new Error('Reload and resolve the saved Person lifecycle before removing a position.');
  const responsibilities = positionRemovalRows(seed, personId, desired).map((row): ResponsibilityDecision => {
    if (!row.required) return { owner: row.owner, id: row.id, field: row.field, action: 'retain' };
    const selected = choices[row.key];
    if (!selected) throw new Error('Choose an eligible replacement or explicitly leave each affected assignment vacant.');
    if (selected === '__vacant__') return { owner: row.owner, id: row.id, field: row.field, action: 'vacate' };
    if (!removalCandidates(seed, personId, row).some(p => p.id === selected)) throw new Error('The chosen replacement is not eligible for this assignment.');
    return { owner: row.owner, id: row.id, field: row.field, action: 'replace', replacementId: selected };
  });
  return normalizePersonTransitionIntent({ schemaVersion: 1, personId, positionIds: desired, lifecycle: 'keep', reason, responsibilities, primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: acknowledged });
}

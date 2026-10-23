/** Stable internal IDs. Positions describe eligibility, never account access or ownership. */
export const PERSON_POSITIONS = [
  { id: 'store-manager', label: 'Store Manager', aliases: ['store manager', 'sm'] },
  { id: 'assistant-store-manager', label: 'Assistant Store Manager', aliases: ['assistant store manager', 'assistant manager', 'asm', 'am'] },
  { id: 'key-holder', label: 'Key Holder', aliases: ['key holder', 'keyholder', 'kh'] },
  { id: 'district-manager', label: 'District Manager', aliases: ['district manager', 'dm'] },
  { id: 'regional-manager', label: 'Regional Manager', aliases: ['regional manager', 'rm'] },
  { id: 'other', label: 'Other / corporate position', aliases: [] },
] as const;
export type PersonPositionId = typeof PERSON_POSITIONS[number]['id'];
export type LeadershipRole = Exclude<typeof PERSON_POSITIONS[number]['label'], 'Other / corporate position'>;
export type PositionPerson = { positionIds?: unknown; jobTitle?: string; role?: string; status?: unknown; activeStatus?: unknown };
const known = new Set<string>(PERSON_POSITIONS.map(p => p.id));

export function validPositionIds(value: unknown): value is PersonPositionId[] {
  return Array.isArray(value) && value.length <= PERSON_POSITIONS.length
    && value.every(id => typeof id === 'string' && known.has(id)) && new Set(value).size === value.length;
}

/** Explicit empty/invalid controlled values never fall back to a legacy title. */
export function personPositions(person: PositionPerson) {
  if (Object.hasOwn(person, 'positionIds')) return { source: validPositionIds(person.positionIds) ? 'controlled' as const : 'invalid' as const, ids: validPositionIds(person.positionIds) ? person.positionIds : [] };
  const title = ((typeof person.jobTitle === 'string' ? person.jobTitle.trim() : '') || (typeof person.role === 'string' ? person.role.trim() : '')).toLowerCase().replace(/\s+/g, ' ');
  return { source: 'legacy' as const, ids: PERSON_POSITIONS.filter(p => (p.aliases as readonly string[]).includes(title)).map(p => p.id) };
}

export function listedPosition(person: PositionPerson, role: LeadershipRole) {
  return personPositions(person).ids.includes(PERSON_POSITIONS.find(p => p.label === role)!.id);
}

/** Display controlled positions without presenting a legacy title as mapped authority. */
export function personPositionLabel(person: PositionPerson): string {
  const state = personPositions(person);
  if (state.source === 'invalid') return 'Positions need review';
  if (state.source === 'controlled') return PERSON_POSITIONS.filter(p => state.ids.includes(p.id)).map(p => p.label).join(' · ') || 'No linked positions';
  return (typeof person.jobTitle === 'string' && person.jobTitle.trim()) || (typeof person.role === 'string' && person.role.trim()) || 'Team Member';
}

/** New assignment eligibility requires an explicit mapping; titles are display/discovery only.
 * Retaining an unchanged historical assignment is handled by each writer's before/after comparison.
 * Lifecycle and unique identity must also be checked by the caller.
 */
export function allowsLeadershipPosition(person: PositionPerson, role: LeadershipRole) {
  const state = personPositions(person);
  return state.source === 'controlled' && listedPosition(person, role);
}

export const LEADERSHIP_POSITION_FIELDS = {
  storeManagerId: 'Store Manager', assistantStoreManagerIds: 'Assistant Store Manager', keyHolderIds: 'Key Holder',
  districtManagerId: 'District Manager', regionalManagerId: 'Regional Manager',
} as const satisfies Record<string, LeadershipRole>;

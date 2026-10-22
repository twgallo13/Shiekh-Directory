import { personLifecycle } from './personLifecycle';

import { allowsLeadershipPosition, listedPosition, type LeadershipRole } from './personPositions';
export type { LeadershipRole } from './personPositions';
type PickerPerson = { id: string; fullName: string; jobTitle?: string; role?: string; positionIds?: unknown; status?: unknown; activeStatus?: unknown };

/** Match a descriptive position for discovery only; never use this filter to grant authority or infer assignments. */
export function matchesListedLeadershipRole(person: PickerPerson, role: LeadershipRole): boolean {
  return listedPosition(person, role);
}

/** Offer unique active IDs matching the listed position, or all unique active people after an explicit opt-in. */
export function leadershipCandidates<T extends PickerPerson>(people: T[], role?: LeadershipRole, showAll = false): T[] {
  const counts = new Map<string, number>();
  for (const person of people) counts.set(person.id, (counts.get(person.id) || 0) + 1);
  return people.filter(person => counts.get(person.id) === 1 && personLifecycle(person) === 'active'
    && (!role || (allowsLeadershipPosition(person, role) && (showAll || matchesListedLeadershipRole(person, role)))))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** Retain an unmatched current canonical ID visibly without making it a selectable new assignment. */
export function leadershipPickerOptions(people: PickerPerson[], role: LeadershipRole, showAll: boolean, currentId?: string, currentName?: string) {
  const options = leadershipCandidates(people, role, showAll).map(person => ({ id: person.id, label: `${person.fullName} (${person.jobTitle || person.role || 'Staff'})`, currentOnly: false }));
  if (currentId && !options.some(option => option.id === currentId)) {
    const current = people.filter(person => person.id === currentId);
    options.push({ id: currentId, label: `${current.length === 1 ? current[0].fullName : currentName || `Unresolved person [${currentId}]`} (Current assignment — review position/status)`, currentOnly: true });
  }
  return options;
}

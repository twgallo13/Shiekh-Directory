import type { Assignment, Person, AssignmentCapacity } from '../../src/types';
import { isAssignmentActive } from './assignment';

export interface PositionHolder {
  personId: string;
  fullName: string;
  capacity: AssignmentCapacity;
  slot?: 'primary' | 'additional';
}

export interface PositionResult {
  primary: PositionHolder | null;
  others: PositionHolder[];
  displayName: string;
  status: 'filled' | 'vacant';
}

export function resolvePositionHolders(
  assignments: Assignment[],
  people: Map<string, Person>,
  localDate: string
): PositionResult {
  const activeAssignments = assignments.filter(a => isAssignmentActive(a, localDate));
  
  const holders: PositionHolder[] = [];
  
  for (const assignment of activeAssignments) {
    const person = people.get(assignment.personId);
    if (!person || person.lifecycle !== 'active') continue;
    
    holders.push({
      personId: assignment.personId,
      fullName: person.fullName,
      capacity: assignment.capacity || 'primary',
      slot: assignment.slot,
    });
  }
  
  const primaryHolder = holders.find(h => h.capacity === 'primary');
  const otherHolders = holders.filter(h => h.capacity !== 'primary');
  
  let displayName = '';
  let status: 'filled' | 'vacant' = 'vacant';
  
  if (primaryHolder) {
    displayName = primaryHolder.fullName;
    status = 'filled';
  } else if (otherHolders.length > 0) {
    const firstOther = otherHolders[0];
    const capacityLabel = firstOther.capacity === 'training' ? 'In Training' : 'Acting';
    displayName = `Vacant (${capacityLabel}: ${firstOther.fullName})`;
    status = 'vacant';
  }
  
  return {
    primary: primaryHolder || null,
    others: otherHolders,
    displayName,
    status,
  };
}

export function formatHolderForCsv(result: PositionResult): string {
  if (result.primary) {
    return result.primary.fullName;
  }
  if (result.others.length > 0) {
    return 'VACANT';
  }
  return 'VACANT';
}

export function formatOtherHoldersForCsv(result: PositionResult): string {
  return result.others
    .map(h => {
      const label = h.capacity === 'training' ? 'In Training' : 'Acting';
      return `${h.fullName} (${label})`;
    })
    .join('; ');
}

export function formatHolderDisplayName(result: PositionResult): string {
  return result.displayName || '';
}

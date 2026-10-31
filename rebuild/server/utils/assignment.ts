import type { Assignment } from '../../src/types';

/**
 * Get the current local date for a timezone
 * @param timeZone IANA timezone string (e.g., 'America/Los_Angeles')
 * @returns Date string in YYYY-MM-DD format
 */
export function getLocalDate(timeZone: string = 'America/Los_Angeles'): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Check if an assignment is currently active
 * An assignment is active if:
 * 1. It has not been explicitly ended (endedAt is not set)
 * 2. Either has no endDate, or endDate >= today's date in the given timezone
 * 
 * @param assignment The assignment to check
 * @param localDate The local date to compare against (YYYY-MM-DD)
 * @returns true if the assignment is active
 */
export function isAssignmentActive(
  assignment: Pick<Assignment, 'endDate' | 'endedAt'>,
  localDate: string
): boolean {
  if (assignment.endedAt) {
    return false;
  }
  if (!assignment.endDate) {
    return true;
  }
  return assignment.endDate >= localDate;
}

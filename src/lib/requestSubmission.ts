import type { UpdateRequest } from '../types';

export const submissionStorageKey = (actorId: string) => `directory-request-submission:${actorId}`;

/** Recover only this account's original operation; never manufacture a new ID after an uncertain response. */
export function loadSubmission(storage: Pick<Storage, 'getItem'>, actorId: string): UpdateRequest | null {
  const raw = storage.getItem(submissionStorageKey(actorId));
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed.id !== 'string' || !/^req-[a-f0-9-]{36}$/.test(parsed.id) || parsed.status !== 'Pending'
    || typeof parsed.targetId !== 'string' || !parsed.requestedChanges || !parsed.currentSnapshot) throw new Error('Saved submission recovery data is unreadable. Do not resubmit; ask an administrator to inspect saved requests.');
  return parsed as UpdateRequest;
}

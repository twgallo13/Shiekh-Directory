import type { Firestore } from 'firebase-admin/firestore';
import type { AuthUser } from '../../src/types';

export interface FilingDecision {
  ok: true;
}

export interface FilingDenial {
  ok: false;
  status: number;
  code: string;
  message: string;
}

/**
 * Shared own-store check for every place a request is created.
 * A Store login may file only for its storeLocationId. A Store with no store is denied.
 * Store session uids are store_<locationId> and carry that location on the session.
 */
export function assertCanFileFor(authUser: AuthUser, locationId: string): FilingDecision | FilingDenial {
  if (authUser.role !== 'Store') return { ok: true };
  if (!authUser.storeLocationId || authUser.storeLocationId !== locationId) {
    return {
      ok: false,
      status: 403,
      code: 'forbidden',
      message: 'You can only submit requests for your own store.',
    };
  }
  return { ok: true };
}

export function storeSubmitterOwns(
  correction: { submittedByRole?: string; submittedBy?: string; locationId: string },
  user: { role?: string; storeLocationId?: string } | null,
): boolean {
  if (correction.submittedByRole !== 'Store') return true;
  if (correction.submittedBy && correction.submittedBy === `store_${correction.locationId}`) return true;
  return user?.role === 'Store' && user.storeLocationId === correction.locationId;
}

export async function assertStoredStoreOwner(
  db: Firestore,
  correction: { submittedByRole?: string; submittedBy?: string; locationId: string },
): Promise<FilingDecision | FilingDenial> {
  if (correction.submittedByRole !== 'Store') return { ok: true };
  if (correction.submittedBy === `store_${correction.locationId}`) return { ok: true };
  if (!correction.submittedBy) {
    return {
      ok: false,
      status: 409,
      code: 'requester_not_owner',
      message: 'The store that filed this request can no longer request changes for this location.',
    };
  }
  const userSnap = await db.collection('users').doc(correction.submittedBy).get();
  const user = userSnap.exists ? userSnap.data() as { role?: string; storeLocationId?: string } : null;
  if (storeSubmitterOwns(correction, user)) return { ok: true };
  return {
    ok: false,
    status: 409,
    code: 'requester_not_owner',
    message: 'The store that filed this request can no longer request changes for this location.',
  };
}

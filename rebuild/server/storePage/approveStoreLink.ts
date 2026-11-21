import type { Firestore } from 'firebase-admin/firestore';
import type { AuthUser, Correction } from '../../src/types';
import { validateReviewUrl } from '../../src/lib/storePageValidation';
import { computeLeaderScopeFor } from '../middleware/auth';
import { storeSubmitterOwns } from './access';
import { HttpError } from './httpError';

interface ApproveResult {
  status: number;
  body: Record<string, unknown>;
}

function fail(status: number, code: string, message: string, requestId?: string): ApproveResult {
  return { status, body: { error: { code, message, requestId } } };
}

/**
 * Store-link approval is its own transaction.
 * It writes storePages.reviewUrl and the page version, plus the request status.
 * It does not read or write the locations document and does not check locations.version.
 * A pending request that fails the store, scope, or link checks is rejected (fail closed).
 */
export async function approveStoreLinkRequest(
  db: Firestore,
  authUser: AuthUser,
  correctionId: string,
  notes: unknown,
  requestId?: string,
): Promise<ApproveResult> {
  const correctionRef = db.collection('corrections').doc(correctionId);
  const pre = await correctionRef.get();
  if (!pre.exists) return fail(404, 'not_found', 'Correction not found', requestId);
  const preData = pre.data() as Correction;
  if (preData.category !== 'store-link') {
    return fail(400, 'invalid_category', 'Not a store page link request', requestId);
  }

  let leaderInScope = true;
  if (preData.submittedByRole === 'Leader') {
    const scope = await computeLeaderScopeFor(db, preData.submittedBy);
    leaderInScope = !!scope?.locationIds.includes(preData.locationId);
  }

  try {
    const newVersion = await db.runTransaction(async (tx) => {
      const correctionSnap = await tx.get(correctionRef);
      if (!correctionSnap.exists) throw new HttpError(404, 'not_found', 'Correction not found');
      const correction = correctionSnap.data() as Correction;
      if (correction.category !== 'store-link') {
        throw new HttpError(400, 'invalid_category', 'Not a store page link request');
      }
      if (correction.status !== 'pending') {
        throw new HttpError(400, 'invalid_status', 'Correction has already been reviewed');
      }

      const proposed = correction.proposedChanges;
      if (!proposed || typeof proposed !== 'object' || Array.isArray(proposed)) {
        throw new HttpError(400, 'invalid_proposed_changes', 'Proposed changes are not valid.');
      }
      const keys = Object.keys(proposed);
      if (keys.length !== 1 || keys[0] !== 'reviewUrl') {
        throw new HttpError(400, 'invalid_proposed_changes', 'A store page link request can only change the review link.');
      }
      const url = validateReviewUrl(proposed.reviewUrl);
      if (!url.ok) throw new HttpError(400, 'invalid_review_url', url.message);

      let user: { role?: string; storeLocationId?: string } | null = null;
      if (correction.submittedByRole === 'Store' && correction.submittedBy !== `store_${correction.locationId}`) {
        if (!correction.submittedBy) {
          throw new HttpError(409, 'requester_not_owner', 'The store that filed this request can no longer request changes for this location.');
        }
        const userSnap = await tx.get(db.collection('users').doc(correction.submittedBy));
        user = userSnap.exists ? userSnap.data() as { role?: string; storeLocationId?: string } : null;
      }
      if (!storeSubmitterOwns(correction, user)) {
        throw new HttpError(409, 'requester_not_owner', 'The store that filed this request can no longer request changes for this location.');
      }
      if (correction.submittedByRole === 'Leader') {
        if (correction.submittedBy !== preData.submittedBy || !leaderInScope) {
          throw new HttpError(409, 'requester_out_of_scope', 'The leader who filed this request is no longer in scope for this store.');
        }
      }

      const pageRef = db.collection('storePages').doc(correction.locationId);
      const pageSnap = await tx.get(pageRef);
      const currentVersion = pageSnap.exists ? Number(pageSnap.data()?.version ?? 0) : 0;
      const submittedVersion = typeof correction.storePageVersion === 'number' ? correction.storePageVersion : 0;
      if (currentVersion !== submittedVersion) {
        throw new HttpError(409, 'version_conflict', 'The store page changed after this request was filed.');
      }

      const now = new Date().toISOString();
      const nextVersion = currentVersion + 1;
      if (!pageSnap.exists) {
        tx.create(pageRef, {
          reviewUrl: url.href,
          magentoStoreId: null,
          pageEnabled: false,
          version: nextVersion,
          createdAt: now,
          updatedAt: now,
          updatedBy: authUser.uid,
        });
      } else {
        tx.update(pageRef, {
          reviewUrl: url.href,
          version: nextVersion,
          updatedAt: now,
          updatedBy: authUser.uid,
        });
      }
      tx.update(correctionRef, {
        status: 'approved',
        reviewedBy: authUser.uid,
        reviewedByEmail: authUser.email,
        reviewedAt: now,
        reviewNotes: typeof notes === 'string' ? notes : null,
        updatedAt: now,
        updatedBy: authUser.uid,
        version: (correction.version || 1) + 1,
      });
      const auditRef = db.collection('auditLog').doc();
      tx.set(auditRef, {
        id: auditRef.id,
        timestamp: now,
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'approve',
        entityType: 'store-page',
        entityId: correction.locationId,
        entityName: `Store page ${correction.storeNumber}`,
        changes: [{
          field: 'reviewUrl',
          oldValue: pageSnap.exists ? (pageSnap.data()?.reviewUrl ?? null) : null,
          newValue: url.href,
        }],
        previousVersion: currentVersion,
        newVersion: nextVersion,
      });
      return nextVersion;
    });
    return { status: 200, body: { data: { success: true, newVersion } } };
  } catch (error) {
    if (error instanceof HttpError) return fail(error.status, error.code, error.message, requestId);
    console.error('Approve store-link error:', error);
    return fail(500, 'approve_error', 'Failed to approve correction', requestId);
  }
}

/** Pending-only status change. Does not write storePages or locations. */
export async function transitionStoreLinkRequest(
  db: Firestore,
  correctionId: string,
  authUser: AuthUser,
  next: 'cancelled' | 'rejected',
  notes: unknown,
  requestId?: string,
): Promise<ApproveResult> {
  const correctionRef = db.collection('corrections').doc(correctionId);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(correctionRef);
      if (!snap.exists) throw new HttpError(404, 'not_found', 'Correction not found');
      const correction = snap.data() as Correction;
      if (correction.status !== 'pending') {
        throw new HttpError(400, 'invalid_status', next === 'cancelled'
          ? 'Only pending requests can be cancelled'
          : 'Correction has already been reviewed');
      }
      const now = new Date().toISOString();
      if (next === 'cancelled') {
        tx.update(correctionRef, {
          status: 'cancelled',
          cancelledAt: now,
          cancelledBy: authUser.uid,
          updatedAt: now,
          updatedBy: authUser.uid,
          version: (correction.version || 1) + 1,
        });
      } else {
        tx.update(correctionRef, {
          status: 'rejected',
          reviewedBy: authUser.uid,
          reviewedByEmail: authUser.email,
          reviewedAt: now,
          reviewNotes: typeof notes === 'string' ? notes : null,
          updatedAt: now,
          updatedBy: authUser.uid,
          version: (correction.version || 1) + 1,
        });
      }
    });
    return { status: 200, body: { data: { success: true } } };
  } catch (error) {
    if (error instanceof HttpError) return fail(error.status, error.code, error.message, requestId);
    console.error('Store-link status error:', error);
    return fail(500, 'update_error', 'Failed to update the request', requestId);
  }
}

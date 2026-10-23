import { createHash } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import type { Account } from './authAuthority';
import { DirectoryConflict, DirectoryValidationError, DirectoryWriteDenied } from './firestoreDirectory';
import { personTransitionReview } from '../src/lib/personTransitionReview';
import { LEADERSHIP_POSITION_FIELDS } from '../src/lib/personPositions';
import type { DistrictRecord, LocationRecord, PersonRecord, RegionRecord, UpdateRequest, UserProfile } from '../src/types';

export const TRANSITION_PREVIEW_LIMITS = { locations: 1000, districts: 500, regions: 100, users: 5000, requests: 1000 } as const;
const leadership = Object.keys(LEADERSHIP_POSITION_FIELDS);
const fields = {
  locations: ['version', 'storeNumber', 'name', 'type', 'recordStatus', 'districtId', 'regionId', ...leadership],
  districts: ['version', 'name', 'regionId', 'status', 'districtManagerId'],
  regions: ['version', 'name', 'status'],
  users: ['version', 'personId', 'role', 'status'],
  requests: ['version', 'status', 'targetType', 'targetId', 'changeType', ...leadership.flatMap(key => [`requestedChanges.${key}`, `currentSnapshot.${key}`])],
};
const personFields = ['version', 'status', 'activeStatus', 'positionIds', 'jobTitle', 'primaryLocationId', 'supportedLocationIds'];
const pick = (data: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]]));
function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Internal review only: no receipt, lease, clearance, consumer grant or mutation capability. */
export async function previewPersonTransition(firestore: Firestore, personId: string, actor: Account, clock = () => new Date()) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(personId)) throw new DirectoryValidationError('Invalid Person ID.');
  const allowed = (role: unknown, status: unknown, scope: unknown) => status === 'Active' && scope === 'Company-wide' && ['System Administrator', 'Directory Data Steward'].includes(String(role));
  if (!allowed(actor.role, actor.status, actor.accessScope)) throw new DirectoryWriteDenied('Company-wide administrator or steward review is required.');
  // Start expiry before the transaction: a slow read must not manufacture a fresh lease.
  const startedAt = clock();
  return firestore.runTransaction(async transaction => {
    const accounts = await transaction.get(firestore.collection('users').where('firebaseUid', '==', actor.uid).select('role', 'status', 'accessScope').limit(2));
    const current = accounts.docs[0]?.data();
    if (accounts.size !== 1 || !allowed(current?.role, current?.status, current?.accessScope)) throw new DirectoryWriteDenied('Current Directory access does not permit this review.');
    const personSnapshot = await transaction.get(firestore.collection('people').doc(personId));
    if (!personSnapshot.exists) throw new DirectoryConflict('This Person no longer exists. Reload the directory.');
    const person = { ...pick(personSnapshot.data()!, personFields), id: personId } as unknown as PersonRecord;
    const entries = await Promise.all(Object.entries(TRANSITION_PREVIEW_LIMITS).map(async ([collection, maximum]) => {
      let query = firestore.collection(collection).select(...fields[collection as keyof typeof fields]);
      if (collection === 'requests') query = query.where('status', '==', 'Pending');
      const snapshot = await transaction.get(query.limit(maximum + 1));
      if (snapshot.size > maximum) throw new Error('Transition inventory capacity exceeded.');
      return [collection, snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })).sort((a, b) => a.id.localeCompare(b.id))] as const;
    }));
    const data = Object.fromEntries(entries);
    // Includes all scanned authority inputs, so additions/removals and unversioned edits change the digest.
    const encoded = canonical({ person, data });
    if (Buffer.byteLength(encoded) > 4_000_000 || clock().getTime() >= startedAt.getTime() + 300_000) throw new Error('Transition inventory unavailable.');
    const review = personTransitionReview(person, data.locations as unknown as LocationRecord[], data.districts as unknown as DistrictRecord[], data.regions as unknown as RegionRecord[], data.users as unknown as UserProfile[], data.requests as unknown as UpdateRequest[]);
    const summaryLocation = (row: (typeof review.workplaces)[number]) => ({ locationId: row.locationId, labels: row.labels, unavailable: row.unavailable, ...(row.location ? { name: row.location.name, storeNumber: row.location.storeNumber, version: row.location.version ?? null, recordStatus: row.location.recordStatus } : {}) });
    return {
      schemaVersion: 1, personId, personVersion: person.version ?? null,
      evaluatedAt: startedAt.toISOString(), expiresAt: new Date(startedAt.getTime() + 300_000).toISOString(),
      digest: createHash('sha256').update(encoded).digest('hex'),
      scope: 'Directory-only dependency review' as const, completeWithinScope: true,
      limits: TRANSITION_PREVIEW_LIMITS, scanned: Object.fromEntries(entries.map(([key, rows]) => [key, rows.length])),
      versions: [{ collection: 'people', id: personId, version: person.version ?? null }, ...entries.flatMap(([collection, rows]) => rows.map(row => ({ collection, id: row.id, version: (row as Record<string, unknown>).version ?? null })))],
      review: { ...review, workplaces: review.workplaces.map(summaryLocation), inheritedStores: review.inheritedStores.map(summaryLocation) },
      warnings: ['Snapshot only; records can change immediately. Refresh before any separate change.', 'No transition writer, clearance or access revocation is provided. Expiry is a display limit, not a lock.', 'Only current Directory references and Pending request targets/leadership proposals/baselines are included. Historical attribution, free text, mailboxes, Firebase and other apps are not inventoried.'],
    };
  }, { readOnly: true });
}

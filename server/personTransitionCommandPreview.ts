import { randomUUID } from 'node:crypto';
import type { DocumentSnapshot, Firestore, Transaction } from '@google-cloud/firestore';
import type { Account } from './authAuthority';
import { DirectoryValidationError } from './firestoreDirectory';
import { canonicalTransitionId, normalizePersonTransitionIntent, object, type PersonTransitionIntent } from './personTransitionIntent';
import { assertPersonTransitionActor, readPersonTransitionAuthority } from './personTransitionAuthority';
import { planPersonTransition, type TransitionPlannerSnapshot, type TransitionSourceDocument } from './personTransitionPlanner';
import { LEADERSHIP_POSITION_FIELDS } from '../src/lib/personPositions';
import { TRANSITION_REVIEW_TTL_MS, type PersonTransitionReviewSigner } from './personTransitionReviewEnvelope';
import { readOrganizationGuardState, assertOrganizationTransitionCompatibility } from './organizationLeadershipGuards';

const leaders = Object.keys(LEADERSHIP_POSITION_FIELDS);
export const COMMAND_PREVIEW_LIMITS = { locations: 1000, districts: 500, regions: 100, users: 5000, requests: 1000 } as const;
const fields = {
  locations: ['id', 'version', 'storeNumber', 'name', 'type', 'recordStatus', 'hierarchyApplicability', 'districtId', 'regionId', ...leaders,
    'storeManagerName', 'districtManagerName', 'regionalManagerName', 'assistantStoreManagerNames', 'keyHolderNames'],
  districts: ['id', 'version', 'name', 'regionId', 'status', 'districtManagerId', 'leadershipModelVersion', 'leadershipVersion'],
  regions: ['id', 'version', 'name', 'status', 'regionalManagerId', 'leadershipModelVersion', 'leadershipVersion'],
  users: ['id', 'version', 'personId', 'role', 'status'],
  requests: ['id', 'version', 'status', 'targetType', 'targetId', 'changeType', ...['requestedChanges', 'currentSnapshot'].flatMap(parent => leaders.map(field => `${parent}.${field}`))],
};
const personFields = ['id', 'version', 'fullName', 'positionIds', 'status', 'activeStatus'];
const phoneFields = ['phone', 'phoneExtension', 'workPhone', 'workPhoneExtension', 'phonePrivacy'];
// Preserve Firestore's nested field-mask shape without fetching whole request maps.
function pick(data: Record<string, unknown>, keys: string[]) {
  const result: Record<string, any> = {};
  for (const key of keys) {
    const path = key.split('.'); let value: any = data, present = true;
    for (const part of path) {
      if (!object(value) || !Object.hasOwn(value, part)) { present = false; break; }
      value = value[part];
    }
    if (!present) continue;
    let target = result;
    for (const part of path.slice(0, -1)) target = target[part] ??= {};
    target[path.at(-1)!] = value;
  }
  return result;
}
/** Internal read adapter, no writes/authority claims. Caller owns an authenticated, authority-checked SDK transaction. */
export async function readPersonTransitionCommandPlan(firestore: Firestore, transaction: Transaction, intent: PersonTransitionIntent) {
    const snapshot: TransitionPlannerSnapshot = { complete: true, coherentReadId: randomUUID(), people: [], locations: [], districts: [], regions: [], users: [], requests: [] };
    let bytes = 0;
    const source = (collection: keyof Omit<TransitionPlannerSnapshot, 'complete' | 'coherentReadId'>, doc: DocumentSnapshot, selected: string[]): TransitionSourceDocument => {
      if (!canonicalTransitionId(doc.id) || doc.ref.path !== `${collection}/${doc.id}`) throw new Error('Invalid source document identity.');
      if (!doc.exists) {
        if (collection !== 'people') throw new Error('Missing query document.');
        return { id: doc.id, data: null, updateTime: null };
      }
      const rawData = doc.data();
      if (!object(rawData) || !doc.updateTime) throw new Error('Native source metadata is required.');
      const data = pick(rawData, selected);
      if (collection === 'requests') for (const key of ['requestedChanges', 'currentSnapshot']) if (Object.hasOwn(data, key)) {
        if (!object(data[key])) throw new Error('Invalid Pending request shape.');
        data[key] = pick(data[key], leaders);
      }
      const value = { id: doc.id, data, updateTime: { seconds: String(doc.updateTime.seconds), nanoseconds: doc.updateTime.nanoseconds } };
      bytes += Buffer.byteLength(JSON.stringify(value));
      if (bytes > 8 * 1024 * 1024) throw new Error('Transition snapshot capacity exceeded.');
      return value;
    };
    for (const [collection, maximum] of Object.entries(COMMAND_PREVIEW_LIMITS) as [keyof typeof COMMAND_PREVIEW_LIMITS, number][]) {
      let query = firestore.collection(collection).select(...fields[collection]);
      if (collection === 'requests') query = query.where('status', '==', 'Pending');
      const rows = await transaction.get(query.limit(maximum + 1));
      if (rows.size > maximum) throw new Error('Transition inventory capacity exceeded.');
      snapshot[collection] = rows.docs.map(doc => source(collection, doc, fields[collection]));
    }
    // Contact compatibility copies are read only for exact SM slots the intent changes.
    const smOwners = [...new Set(intent.responsibilities.filter(d => d.owner === 'locations' && d.field === 'storeManagerId' && d.action !== 'retain').map(d => d.id))]
      .filter(id => snapshot.locations.some(doc => doc.id === id)).sort();
    const smFields = [...fields.locations, 'storeManagerPhone', 'storeManagerPhonePrivacy'];
    for (let start = 0; start < smOwners.length; start += 50) {
      const batch = smOwners.slice(start, start + 50);
      const rows = await transaction.getAll(...batch.map(id => firestore.collection('locations').doc(id)), { fieldMask: smFields });
      if (rows.length !== batch.length || new Set(rows.map(d => d.id)).size !== batch.length || rows.some(d => !batch.includes(d.id))) throw new Error('Incomplete SM compatibility reads.');
      for (const doc of rows) {
        const index = snapshot.locations.findIndex(row => row.id === doc.id);
        const extra = source('locations', doc, smFields);
        if (JSON.stringify(extra.updateTime) !== JSON.stringify(snapshot.locations[index].updateTime)) throw new Error('Inconsistent native read metadata.');
        snapshot.locations[index] = extra;
      }
    }
    const ids = [...new Set([intent.personId, ...intent.responsibilities.flatMap(d => d.action === 'replace' ? [d.replacementId!] : [])])].sort();
    if (ids.length > 5000) throw new Error('Exact Person inventory capacity exceeded.');
    // Field masks differ by need: never fetch email or a person's phone for an unrelated role change.
    const groups = new Map<string, { ids: string[]; selected: string[] }>();
    for (const personId of ids) {
      const needsPhone = intent.responsibilities.some(d => d.field === 'storeManagerId' && (d.action === 'replace' && d.replacementId === personId || d.action === 'assign' && personId === intent.personId));
      const selected = [...personFields, ...(personId === intent.personId ? ['primaryLocationId', 'supportedLocationIds'] : []), ...(needsPhone ? phoneFields : [])];
      const key = selected.join(','); const group = groups.get(key) || { ids: [], selected }; group.ids.push(personId); groups.set(key, group);
    }
    for (const { ids: groupIds, selected } of groups.values()) for (let start = 0; start < groupIds.length; start += 50) {
      const batch = groupIds.slice(start, start + 50);
      const rows = await transaction.getAll(...batch.map(id => firestore.collection('people').doc(id)), { fieldMask: selected });
      if (rows.length !== batch.length || new Set(rows.map(d => d.id)).size !== batch.length || rows.some(d => !batch.includes(d.id))) throw new Error('Incomplete exact Person reads.');
      snapshot.people.push(...rows.map(doc => source('people', doc, selected)));
    }
    const organizationState = await readOrganizationGuardState(firestore, transaction, [
      ...snapshot.regions.map(row => ({ unitType: 'region' as const, id: row.id, data: row.data! })),
      ...snapshot.districts.map(row => ({ unitType: 'district' as const, id: row.id, data: row.data! })),
    ]);
    assertOrganizationTransitionCompatibility(organizationState, intent, snapshot.locations, snapshot.people.find(row => row.id === intent.personId)?.data);
    return planPersonTransition(intent, snapshot);
}

/** Fresh read-only SDK transaction. No prepare/commit/receipt, generic writes or browser-loaded fallback. */
export async function previewPersonTransitionCommand(firestore: Firestore, raw: unknown, actor: Account, signer: PersonTransitionReviewSigner | undefined, clock = () => new Date()) {
  assertPersonTransitionActor(actor);
  let intent: ReturnType<typeof normalizePersonTransitionIntent>;
  try { intent = normalizePersonTransitionIntent(raw); } catch { throw new DirectoryValidationError('Invalid Person transition intent.'); }
  if (!signer) throw new Error('Transition review signing is unavailable.');
  const started = clock().getTime();
  if (!Number.isSafeInteger(started) || started < 0) throw new Error('Transition review clock is unavailable.');
  const expires = started + TRANSITION_REVIEW_TTL_MS;
  const result = await firestore.runTransaction(async transaction => {
    await readPersonTransitionAuthority(firestore, transaction, actor);
    return readPersonTransitionCommandPlan(firestore, transaction, intent);
  }, { readOnly: true });
  const now = clock().getTime();
  if (!Number.isSafeInteger(now) || now < started || now >= expires) throw new Error('Transition preview expired during its read.');
  const reviewEnvelope = result.ready ? signer.sign({ actorUid: actor.uid, personId: intent.personId, intentHash: result.intentHash, stateHash: result.stateHash, planHash: result.planHash, issuedAt: started, expiresAt: expires }) : undefined;
  return {
    schemaVersion: 1 as const, personId: intent.personId, ready: result.ready, canCommit: false as const,
    evaluatedAt: new Date(started).toISOString(), expiresAt: new Date(expires).toISOString(),
    review: { ...result.review, excluded: ['This preview does not prepare, commit, cancel or resolve an operation. Separate protected endpoints and explicit admission are required.', 'A signed review is not authentication, a lock, permission to write or complete offboarding.', 'No account, Firebase, mailbox, API credential, provider or consumer access changes.'] },
    ...(reviewEnvelope ? { reviewEnvelope } : {}),
  };
}

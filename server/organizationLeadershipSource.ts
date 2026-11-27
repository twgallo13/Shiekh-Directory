import type { DocumentSnapshot, Firestore, Transaction } from '@google-cloud/firestore';
import { canonicalId } from './personnelProjection';
import {
  LeadershipPlanError, leadershipUnitKey, normalizeOrganizationLeadershipIntent,
  planOrganizationLeadership, type OrganizationLeadershipSnapshot,
} from './organizationLeadershipPlanner';

export const ORGANIZATION_SOURCE_LIMITS = Object.freeze({ districts: 500, regions: 100, locations: 1000, assignmentsPerUnit: 1000, people: 5000, bytes: 8_000_000 });
const fields = {
  districts: ['id', 'version', 'name', 'status', 'regionId', 'districtManagerId', 'leadershipModelVersion', 'leadershipVersion'],
  regions: ['id', 'version', 'name', 'status', 'regionalManagerId', 'leadershipModelVersion', 'leadershipVersion'],
  locations: ['id', 'version', 'storeNumber', 'name', 'type', 'recordStatus', 'hierarchyApplicability', 'districtId', 'regionId', 'districtManagerId', 'districtManagerName', 'regionalManagerId', 'regionalManagerName'],
  leadership_assignments: ['id', 'version', 'unitType', 'unitId', 'personId', 'status', 'startedAt', 'endedAt'],
  people: ['id', 'version', 'fullName', 'positionIds', 'status', 'activeStatus'],
} as const;
type Collection = keyof typeof fields;
export interface LeadershipNativeSource {
  collection: Collection;
  id: string;
  data: Record<string, unknown>;
  updateTime: { seconds: string; nanoseconds: number };
}
function incomplete(message: string): never { throw new LeadershipPlanError('incomplete_source', message); }
function capacity(message: string): never { throw new LeadershipPlanError('capacity', message); }
function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
/** Projected business fields are finite JSON. Do not silently convert native values, dates or undefined. */
function assertJson(value: unknown, depth = 0): void {
  if (depth > 30) incomplete('Source nesting exceeds the supported shape.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) assertJson(value[i], depth + 1); return; }
  if (plain(value)) { for (const item of Object.values(value)) assertJson(item, depth + 1); return; }
  incomplete('Leadership source contains unsupported field values.');
}

/** Internal adapter only. The trusted caller must authenticate and recheck live administrator authority
 * in this same SDK transaction. No reads outside it, browser snapshots, raw paths or caller completeness flags.
 * All query results are bounded with a sentinel extra document; overflow rejects rather than truncates.
 */
export async function readOrganizationLeadershipPlan(firestore: Firestore, transaction: Transaction, raw: unknown, now: string) {
  // Validate before an operation ID, unit ID or Person ID can influence a source query.
  const intent = normalizeOrganizationLeadershipIntent(raw);
  const snapshot: OrganizationLeadershipSnapshot = {
    units: [], assignments: [], locations: [], people: [],
    complete: { hierarchy: true, locations: true, assignmentUnits: [] },
  };
  const native = new Map<string, LeadershipNativeSource>();
  let bytes = 0;
  const source = (collection: Collection, doc: DocumentSnapshot) => {
    if (!doc.exists || !canonicalId(doc.id) || doc.ref.path !== `${collection}/${doc.id}`) incomplete('Invalid leadership source identity.');
    const time = doc.updateTime, rawData = doc.data();
    if (!time || !Number.isSafeInteger(time.seconds) || !Number.isInteger(time.nanoseconds) || time.nanoseconds < 0 || time.nanoseconds >= 1_000_000_000 || !plain(rawData)) incomplete('Native source metadata is required.');
    const data: Record<string, unknown> = {};
    for (const key of fields[collection]) if (Object.hasOwn(rawData, key)) data[key] = rawData[key];
    assertJson(data);
    if (Object.hasOwn(data, 'id') && data.id !== doc.id) incomplete('Source record ID does not match its document.');
    const value: LeadershipNativeSource = { collection, id: doc.id, data, updateTime: { seconds: String(time.seconds), nanoseconds: time.nanoseconds } };
    const key = `${collection}/${doc.id}`;
    if (native.has(key)) incomplete('Duplicate source document.');
    bytes += Buffer.byteLength(JSON.stringify(value), 'utf8');
    if (bytes > ORGANIZATION_SOURCE_LIMITS.bytes) capacity('Leadership snapshot byte capacity exceeded.');
    native.set(key, value);
    return { id: doc.id, data };
  };
  for (const collection of ['districts', 'regions', 'locations'] as const) {
    const maximum = ORGANIZATION_SOURCE_LIMITS[collection];
    const rows = await transaction.get(firestore.collection(collection).select(...fields[collection]).limit(maximum + 1));
    if (rows.size !== rows.docs.length) incomplete('Inconsistent leadership inventory.');
    if (rows.size > maximum) capacity('Leadership inventory exceeds bounded capacity.');
    for (const doc of rows.docs) {
      const record = source(collection, doc);
      if (collection === 'locations') snapshot.locations.push(record);
      else snapshot.units.push({ ...record, unitType: collection === 'districts' ? 'district' : 'region' });
    }
  }
  for (const unit of intent.units) {
    const rows = await transaction.get(firestore.collection('leadership_assignments')
      .where('unitType', '==', unit.unitType).where('unitId', '==', unit.unitId)
      .select(...fields.leadership_assignments).limit(ORGANIZATION_SOURCE_LIMITS.assignmentsPerUnit + 1));
    if (rows.size !== rows.docs.length) incomplete('Inconsistent unit roster inventory.');
    if (rows.size > ORGANIZATION_SOURCE_LIMITS.assignmentsPerUnit) capacity('Unit assignment history exceeds bounded capacity.');
    for (const doc of rows.docs) {
      const record = source('leadership_assignments', doc);
      if (record.data.unitType !== unit.unitType || record.data.unitId !== unit.unitId) incomplete('Roster query returned an unrelated unit.');
      snapshot.assignments.push(record);
    }
    snapshot.complete.assignmentUnits.push(leadershipUnitKey(unit.unitType, unit.unitId));
  }
  // Fetch desired and incumbent people only. Historical ended tenures need no private Person reads.
  const ids = new Set(intent.units.flatMap(unit => unit.memberPersonIds));
  for (const row of snapshot.assignments) if (row.data.status === 'active') {
    if (!canonicalId(row.data.personId)) incomplete('Active assignment requires a canonical Person ID.');
    ids.add(row.data.personId as string);
  }
  for (const unit of intent.units) {
    const record = snapshot.units.find(row => row.unitType === unit.unitType && row.id === unit.unitId);
    const primary = record?.data[unit.unitType === 'district' ? 'districtManagerId' : 'regionalManagerId'];
    if (primary !== undefined && primary !== null) {
      if (!canonicalId(primary)) incomplete('Primary Manager must be a canonical Person ID or vacancy.');
      ids.add(primary as string);
    }
  }
  if (ids.size > ORGANIZATION_SOURCE_LIMITS.people) capacity('Exact Person inventory exceeds bounded capacity.');
  const sorted = [...ids].sort();
  for (let offset = 0; offset < sorted.length; offset += 100) {
    const batch = sorted.slice(offset, offset + 100);
    const docs = await transaction.getAll(...batch.map(id => firestore.collection('people').doc(id)), { fieldMask: [...fields.people] });
    if (docs.length !== batch.length || new Set(docs.map(doc => doc.id)).size !== batch.length || docs.some(doc => !batch.includes(doc.id))) incomplete('Exact Person reads are incomplete.');
    for (const doc of docs) snapshot.people.push(source('people', doc));
  }
  return { intent, plan: planOrganizationLeadership(intent, snapshot, now), native };
}

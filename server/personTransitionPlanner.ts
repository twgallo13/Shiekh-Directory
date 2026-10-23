import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { classifyHierarchyLocationType, isRetailHierarchyType, resolveLocationHierarchy } from '../src/lib/hierarchyResolution';
import { personLifecycle } from '../src/lib/personLifecycle';
import { LEADERSHIP_POSITION_FIELDS, listedPosition, personPositions, validPositionIds } from '../src/lib/personPositions';
import { formatPersonPhone } from '../src/lib/personContacts';
import type { PersonRecord } from '../src/types';
import { canonicalTransitionId as id, normalizePersonTransitionIntent, object, type LeadershipField } from './personTransitionIntent';

type Row = Record<string, any>;
export type TransitionSourceDocument = { id: string; data: Row | null; updateTime: { seconds: string; nanoseconds: number } | null };
/** Internal adapter contract. Metadata is a requirement, not proof of a coherent Firestore read. */
export interface TransitionPlannerSnapshot {
  complete: true; coherentReadId: string;
  people: TransitionSourceDocument[]; locations: TransitionSourceDocument[]; districts: TransitionSourceDocument[];
  regions: TransitionSourceDocument[]; users: TransitionSourceDocument[]; requests: TransitionSourceDocument[];
}
const limits = { people: 5000, locations: 1000, districts: 500, regions: 100, users: 5000, requests: 1000 } as const;
type Collection = keyof typeof limits;
type Patch = { collection: 'people' | 'locations' | 'districts'; id: string; set: Row };
const fields = Object.keys(LEADERSHIP_POSITION_FIELDS) as LeadershipField[];
const lists = new Set(['assistantStoreManagerIds', 'keyHolderIds']);
const names: Record<LeadershipField, string> = { storeManagerId: 'storeManagerName', districtManagerId: 'districtManagerName', regionalManagerId: 'regionalManagerName', assistantStoreManagerIds: 'assistantStoreManagerNames', keyHolderIds: 'keyHolderNames' };
const own = (r: Row, k: string) => Object.hasOwn(r, k);
const refs = (v: unknown) => Array.isArray(v) && v.every(id) && new Set(v).size === v.length;
const ref = (v: unknown) => v === '' || v === null || id(v);
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (object(v)) return `{${Object.keys(v).sort(compare).map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  if (v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
  throw new Error('Snapshot must contain detached JSON values only.');
}
const digest = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
function validateSnapshot(s: TransitionPlannerSnapshot) {
  if (!object(s) || s.complete !== true || typeof s.coherentReadId !== 'string' || !s.coherentReadId.trim()) throw new Error('Complete coherent adapter snapshot required.');
  for (const [collection, maximum] of Object.entries(limits) as [Collection, number][]) {
    const docs = s[collection];
    if (!Array.isArray(docs) || docs.length > maximum) throw new Error('Transition inventory capacity exceeded.');
    const seen = new Set<string>();
    for (const doc of docs) {
      if (!object(doc) || !id(doc.id) || seen.has(doc.id)) throw new Error('Invalid or duplicate source document.');
      seen.add(doc.id);
      if (doc.data === null) {
        if (collection !== 'people' || doc.updateTime !== null) throw new Error('Invalid explicit absence.');
        continue;
      }
      const t = doc.updateTime;
      if (!object(doc.data) || !object(t) || typeof t.seconds !== 'string' || !/^-?\d{1,12}$/.test(t.seconds) || !Number.isInteger(t.nanoseconds) || t.nanoseconds < 0 || t.nanoseconds >= 1e9) throw new Error('Native source update time required.');
      const r = doc.data;
      if (own(r, 'id') && r.id !== doc.id || own(r, 'version') && !(r.version === null || Number.isSafeInteger(r.version) && r.version >= 0)) throw new Error('Invalid source identity/version.');
      const optional = (k: string, check: (v: any) => boolean) => !own(r, k) || check(r[k]);
      const text = (v: unknown) => typeof v === 'string';
      const leaders = (r: Row) => fields.every(k => !own(r, k) || (lists.has(k) ? refs(r[k]) : ref(r[k])));
      let valid = true;
      if (collection === 'people') valid = text(r.fullName) && !!r.fullName.trim() && optional('positionIds', validPositionIds)
        && optional('status', text) && optional('activeStatus', v => typeof v === 'boolean') && optional('primaryLocationId', ref) && optional('supportedLocationIds', refs)
        && ['phone', 'phoneExtension', 'workPhone', 'workPhoneExtension'].every(k => optional(k, text))
        && optional('phonePrivacy', v => ['Public', 'Internal', 'Restricted'].includes(v));
      if (collection === 'locations') valid = ['storeNumber', 'name', 'type'].every(k => text(r[k])) && classifyHierarchyLocationType(r.type) !== 'unclassified'
        && ['Active', 'Retired', 'Draft'].includes(r.recordStatus) && optional('districtId', ref) && optional('regionId', ref) && leaders(r)
        && optional('hierarchyApplicability', v => ['Applicable', 'Not Applicable', 'Unknown'].includes(v))
        && fields.every(k => optional(names[k], v => lists.has(k) ? Array.isArray(v) && v.every(text) : text(v)))
        && optional('storeManagerPhone', text) && optional('storeManagerPhonePrivacy', v => ['Public', 'Internal', 'Restricted'].includes(v));
      if (collection === 'districts') valid = text(r.name) && id(r.regionId) && ['Active', 'Retired'].includes(r.status) && optional('districtManagerId', v => v === null || id(v));
      if (collection === 'regions') valid = text(r.name) && ['Active', 'Retired'].includes(r.status);
      if (collection === 'users') valid = text(r.role) && optional('personId', ref) && optional('status', text);
      if (collection === 'requests') valid = r.status === 'Pending' && ['Location', 'Person'].includes(r.targetType) && id(r.targetId) && text(r.changeType)
        && ['requestedChanges', 'currentSnapshot'].every(k => optional(k, v => object(v) && leaders(v)));
      if (!valid) throw new Error(`Invalid projected ${collection} fields.`);
    }
  }
  // Bound CPU/memory before hashing; rejects undefined, NaN, custom prototypes and cycles.
  if (Buffer.byteLength(canonical(Object.fromEntries(Object.keys(limits).map(k => [k, s[k as Collection]])))) > 8 * 1024 * 1024) throw new Error('Transition snapshot capacity exceeded.');
}

/** Pure internal dry run. No authentication, signatures, expiry, transaction, I/O or write capability.
 * Never send the internal result to a client: only `review` is contact-redacted.
 * Ready means locally consistent synthetic plan, NOT approved/current/committable.
 */
export function planPersonTransition(rawIntent: unknown, snapshot: TransitionPlannerSnapshot) {
  const intent = normalizePersonTransitionIntent(rawIntent);
  validateSnapshot(snapshot);
  const data = {} as Record<Collection, Map<string, Row>>;
  for (const c of Object.keys(limits) as Collection[]) data[c] = new Map(snapshot[c].map(d => [d.id, d.data === null ? null : { ...d.data, id: d.id }]));
  const registry = {
    regions: [...data.regions.values()].map(r => ({ id: r.id, name: r.name, status: r.status })),
    districts: [...data.districts.values()].map(d => ({ id: d.id, name: d.name, status: d.status, regionId: d.regionId })),
  };
  const person = data.people.get(intent.personId);
  if (!person) throw new Error('Subject Person must exist in exact reads.');
  const blockers = new Set<string>(); const warnings = new Set<string>();
  const block = (message: string) => { blockers.add(message); };
  const finalPerson: Row = { ...person, positionIds: intent.positionIds, ...(intent.lifecycle === 'inactive' ? { status: 'Inactive', activeStatus: false } : {}) };
  if (personLifecycle(person) === 'unknown') block('Resolve the subject lifecycle before planning a transition.');
  const patches = new Map<string, Patch>();
  const patch = (collection: Patch['collection'], record: Row, changes: Row) => {
    const key = `${collection}/${record.id}`;
    const changed = Object.fromEntries(Object.entries(changes).filter(([k, v]) => !isDeepStrictEqual(record[k], v) || !own(record, k)));
    if (!Object.keys(changed).length) return;
    patches.set(key, { collection, id: record.id, set: { ...patches.get(key)?.set, ...changed } });
  };
  const position = (p: Row, field: LeadershipField) => personPositions(p).source === 'controlled' && listedPosition(p, LEADERSHIP_POSITION_FIELDS[field]);
  const eligible = (personId: string, field: LeadershipField) => {
    if (!data.people.has(personId)) { block(`Exact Person read required: ${personId}.`); return null; }
    const p = personId === person.id ? finalPerson : data.people.get(personId);
    if (!p || personLifecycle(p) !== 'active' || !position(p, field)) { block(`Active controlled ${LEADERSHIP_POSITION_FIELDS[field]} required: ${personId}.`); return null; }
    return p;
  };
  const inherited = (l: Row) => isRetailHierarchyType(l.type) && data.districts.has(l.districtId) && own(data.districts.get(l.districtId)!, 'districtManagerId');
  const hasSubject = (r: Row, field: LeadershipField) => lists.has(field) ? r[field]?.includes(person.id) : r[field] === person.id;
  const authoritative: { owner: 'districts' | 'locations'; record: Row; field: LeadershipField }[] = [];
  for (const d of data.districts.values()) if (d.districtManagerId === person.id) authoritative.push({ owner: 'districts', record: d, field: 'districtManagerId' });
  const associated = new Set<string>([person.primaryLocationId, ...(person.supportedLocationIds || [])].filter(Boolean));
  for (const l of data.locations.values()) {
    for (const field of fields) {
      if (field === 'districtManagerId' && inherited(l)) {
        const owner = data.districts.get(l.districtId)!;
        if (owner.districtManagerId === person.id) associated.add(l.id);
        if (l.districtManagerId === person.id && owner.districtManagerId !== person.id) { warnings.add(`Historical copied DM reference: ${l.id}.`); associated.add(l.id); }
        continue;
      }
      if (hasSubject(l, field)) { authoritative.push({ owner: 'locations', record: l, field }); associated.add(l.id); }
    }
  }
  const key = (owner: string, id: string, field: string) => `${owner}/${id}/${field}`;
  const decisions = new Map(intent.responsibilities.map(d => [key(d.owner, d.id, d.field), d]));
  for (const slot of authoritative) if (!decisions.has(key(slot.owner, slot.record.id, slot.field))) block(`Explicit responsibility decision required: ${key(slot.owner, slot.record.id, slot.field)}.`);
  const slots: { owner: string; id: string; field: string; action: string; before: unknown; after: unknown; provenance: string; context: Row; contactCompatibilityCopyChanges: boolean }[] = [];
  const copies: { locationId: string; districtId: string; recordStatus: string; storeNumber: string; before: unknown; after: unknown }[] = [];
  const locationCopy = (l: Row, field: LeadershipField, next: string | string[]) => {
    const changes: Row = { [field]: next };
    if (lists.has(field)) {
      const oldIds: string[] = l[field] || []; const oldNames: string[] = l[names[field]] || [];
      // Preserve unaffected members/names/order. Never rebuild unrelated names from a partial People read.
      if (oldIds.length !== oldNames.length) { block(`Resolve ambiguous leadership name array: ${l.id}/${field}.`); return; }
      changes[names[field]] = (next as string[]).map(memberId => {
        const oldIndex = oldIds.indexOf(memberId);
        return oldIndex >= 0 ? oldNames[oldIndex] : data.people.get(memberId)?.fullName || '';
      });
    } else {
      const p = next ? data.people.get(String(next)) : null;
      changes[names[field]] = p?.fullName || '';
      if (field === 'storeManagerId') {
        changes.storeManagerPhone = p ? formatPersonPhone(p as PersonRecord) : '';
        // Existing missing privacy is never widened to Public by a replacement.
        changes.storeManagerPhonePrivacy = p?.phonePrivacy || 'Restricted';
      }
    }
    patch('locations', l, changes);
  };
  for (const decision of intent.responsibilities) {
    const r = data[decision.owner].get(decision.id); const field = decision.field;
    if (!r) { block(`Missing responsibility owner: ${decision.owner}/${decision.id}.`); continue; }
    if (decision.owner === 'locations') associated.add(r.id);
    if (decision.owner === 'locations' && field === 'districtManagerId' && inherited(r)) { block(`DM is District-owned: ${r.id}.`); continue; }
    const current = hasSubject(r, field);
    if (decision.action === 'assign' ? current : !current) { block(`Decision does not match current subject ownership: ${key(decision.owner, r.id, field)}.`); continue; }
    if (decision.action === 'retain') {
      if (personLifecycle(finalPerson) !== 'active' || !position(finalPerson, field)) block(`Retained responsibility needs its active controlled position: ${key(decision.owner, r.id, field)}.`);
    }
    let next = r[field];
    if (decision.action === 'assign') {
      if (!lists.has(field) && (r[field] || decision.owner === 'districts' && !own(r, field))) { block(`New assignment requires an explicitly vacant managed slot: ${r.id}.`); continue; }
      eligible(person.id, field);
      next = lists.has(field) ? [...(r[field] || []), person.id] : person.id;
    }
    if (decision.action === 'replace') {
      eligible(decision.replacementId!, field);
      next = lists.has(field) ? r[field].map((v: string) => v === person.id ? decision.replacementId : v) : decision.replacementId;
    }
    if (decision.action === 'vacate') next = lists.has(field) ? r[field].filter((v: string) => v !== person.id) : decision.owner === 'districts' ? null : '';
    if (Array.isArray(next) && new Set(next).size !== next.length) block(`Duplicate resulting leadership member: ${r.id}/${field}.`);
    if (decision.action === 'assign' || decision.action === 'replace') {
      if (decision.owner === 'districts') {
        if (r.status !== 'Active' || data.regions.get(r.regionId)?.status !== 'Active') block(`Valid Active District/Region required: ${r.id}.`);
      } else {
        if (r.recordStatus !== 'Active') block(`New responsibility requires an Active Location: ${r.id}.`);
        const h = resolveLocationHierarchy(r, registry);
        const noIssues = !h.hierarchyIssues.length && !h.applicabilityIssues.length;
        const notApplicable = !isRetailHierarchyType(r.type) && h.hierarchyApplicability === 'Not Applicable' && noIssues;
        const applicable = h.hierarchyApplicability === 'Applicable' && noIssues && h.hierarchyStatus === 'resolved'
          && h.districtId && h.regionId && h.districtStatus === 'Active' && h.regionStatus === 'Active';
        if (!notApplicable && !applicable) block(`Resolve Location hierarchy before granting responsibility: ${r.id}.`);
      }
    }
    const context = decision.owner === 'districts'
      ? { name: r.name, status: r.status, regionId: r.regionId, parentRegionStatus: data.regions.get(r.regionId)?.status ?? 'Missing' }
      : { name: r.name, type: r.type, recordStatus: r.recordStatus, regionId: r.regionId ?? null, districtId: r.districtId ?? null };
    slots.push({ owner: decision.owner, id: r.id, field, action: decision.action, before: r[field] ?? null, after: next ?? null, provenance: decision.owner === 'districts' ? 'District-owned' : 'Location-owned', context, contactCompatibilityCopyChanges: field === 'storeManagerId' && decision.action !== 'retain' });
    if (decision.action === 'retain') continue;
    if (decision.owner === 'locations') locationCopy(r, field, next);
    else {
      patch('districts', r, { districtManagerId: next });
      for (const l of data.locations.values()) if (l.districtId === r.id && isRetailHierarchyType(l.type)) {
        associated.add(l.id);
        if (l.regionId !== r.regionId || own(l, 'hierarchyApplicability') && l.hierarchyApplicability !== 'Applicable') block(`Resolve District member hierarchy conflict: ${l.id}.`);
        copies.push({ locationId: l.id, districtId: r.id, recordStatus: l.recordStatus, storeNumber: l.storeNumber, before: l.districtManagerId ?? null, after: next });
        locationCopy(l, 'districtManagerId', next || '');
      }
    }
  }
  for (const [field, decision] of [['primaryLocationId', intent.primaryWorkplace], ['supportedLocationIds', intent.supports]] as const) {
    if (decision.action === 'retain') continue;
    const next = field === 'primaryLocationId' ? decision.action === 'clear' ? null : decision.ids![0] : decision.action === 'clear' ? [] : decision.ids!;
    const before = field === 'primaryLocationId' ? person[field] ?? null : [...(person[field] || [])].sort();
    if (isDeepStrictEqual(before, next)) { block(`Unchanged workplace decision: ${field}.`); continue; }
    if (decision.action === 'replace') for (const locationId of decision.ids!) {
      associated.add(locationId);
      const location = data.locations.get(locationId);
      if (!location || location.recordStatus === 'Retired') block(`New workplace link must exist and not be retired: ${locationId}.`);
    }
    finalPerson[field] = next; patch('people', person, { [field]: next });
  }
  if ((intent.primaryWorkplace.action !== 'retain' || intent.supports.action !== 'retain') && finalPerson.primaryLocationId && finalPerson.supportedLocationIds?.includes(finalPerson.primaryLocationId)) block('Primary workplace cannot also be a Supports Location.');
  for (const locationId of [finalPerson.primaryLocationId, ...(finalPerson.supportedLocationIds || [])].filter(Boolean)) {
    const location = data.locations.get(locationId);
    if (!location || location.recordStatus === 'Retired') warnings.add(`Retained unavailable workplace context: ${locationId} (${location?.recordStatus || 'Missing'}).`);
  }
  patch('people', person, { ...(!own(person, 'positionIds') || !isDeepStrictEqual([...person.positionIds].sort(), intent.positionIds) ? { positionIds: finalPerson.positionIds } : {}), ...(intent.lifecycle === 'inactive' ? { status: 'Inactive', activeStatus: false } : {}) });
  const accounts = [...data.users.values()].filter(u => u.personId === person.id).map(u => ({ id: u.id, role: u.role, status: u.status ?? null }));
  if (intent.lifecycle === 'inactive' && accounts.length) block('All linked User records require separate account review/unlinking before inactivation.');
  const referencesPerson = (r: Row) => fields.some(field => lists.has(field) ? r?.[field]?.includes(person.id) : r?.[field] === person.id);
  const pending = [...data.requests.values()].flatMap(r => {
    const reasons = [r.targetType === 'Person' && r.targetId === person.id ? 'Targets this Person' : '', r.targetType === 'Location' && associated.has(r.targetId) ? 'Targets an associated Location' : '', referencesPerson(r.requestedChanges) ? 'Proposed leadership reference' : '', referencesPerson(r.currentSnapshot) ? 'Historical submission baseline reference' : ''].filter(Boolean);
    return reasons.length ? [{ id: r.id, reasons }] : [];
  }).sort((a, b) => compare(a.id, b.id));
  if (!isDeepStrictEqual(pending.map(r => r.id), intent.acknowledgedRequestIds)) block('Review and acknowledge the exact current Pending request IDs.');
  const internalPatches = [...patches.values()].sort((a, b) => compare(`${a.collection}/${a.id}`, `${b.collection}/${b.id}`));
  if (!internalPatches.length) block('The selected intent makes no business change.');
  // Conservative source+patch estimates deliberately overcount; the SDK remains authoritative.
  const businessBytes = Buffer.byteLength(canonical(internalPatches.map(p => ({ ...data[p.collection].get(p.id), ...p.set })))) * 2 + internalPatches.length * 1024;
  const auditBytes = Buffer.byteLength(canonical(internalPatches.map(p => ({ before: data[p.collection].get(p.id), after: { ...data[p.collection].get(p.id), ...p.set } })))) * 2 + 4096;
  if (internalPatches.length > 90 || businessBytes > 4 * 1024 * 1024 || auditBytes >= 900000) block('Transition exceeds conservative atomic capacity; no partial plan is available.');
  const preconditions = Object.fromEntries((Object.keys(limits) as Collection[]).map(c => [c, [...snapshot[c]].sort((a, b) => compare(a.id, b.id))]));
  const intentHash = digest(intent); const stateHash = digest(preconditions);
  const planHash = digest({ domain: 'directory-person-transition-dry-run-v1', intentHash, stateHash, internalPatches });
  const review = {
    personId: person.id, positions: { before: personPositions(person), after: intent.positionIds }, lifecycle: { before: personLifecycle(person), after: personLifecycle(finalPerson) },
    responsibilities: slots, inheritedCopies: copies.sort((a, b) => compare(a.locationId, b.locationId)),
    workplaces: { primary: { before: person.primaryLocationId ?? null, after: finalPerson.primaryLocationId ?? null }, supports: { before: person.supportedLocationIds || [], after: finalPerson.supportedLocationIds || [] } },
    accounts, pendingRequests: pending, warnings: [...warnings].sort(compare), blockers: [...blockers].sort(compare),
    counts: { businessDocuments: internalPatches.length, businessBytesEstimate: businessBytes, auditBytesEstimate: auditBytes },
    excluded: ['No account, Firebase, mailbox, consumer, API credential or provider access changes.', 'Dry run only: no authorization, freshness guarantee, signature, receipt or write capability.'],
  };
  return { schemaVersion: 1 as const, ready: blockers.size === 0, intentHash, stateHash, planHash, review: structuredClone(review),
    // No actionable partial mutation list when any blocker exists. Never a generic DirectoryWrite[].
    internal: blockers.size ? null : { intent, patches: structuredClone(internalPatches), preconditions: structuredClone(preconditions) } };
}

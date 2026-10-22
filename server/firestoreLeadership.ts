import { FieldPath, Firestore, Timestamp, type Transaction } from '@google-cloud/firestore';
import { canonicalId, type SourceRecord } from './personnelProjection';
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from './firestoreLocations';
import { normalizeLocationInboxEmail } from '../src/lib/locationInboxEmail';

export type LeadershipDataset = 'district-leadership' | 'location-districts';
export interface LeadershipReadOptions { dataset: LeadershipDataset; snapshotAt: Date; limit: number; includeWorkEmail: boolean; afterId?: string; id?: string }
export interface LeadershipPage { records: SourceRecord[]; people: SourceRecord[]; regions: SourceRecord[]; districts: SourceRecord[]; sharedInboxKeys: Set<string>; nextId: string | null }
export interface LeadershipRepository { read(options: LeadershipReadOptions): Promise<LeadershipPage> }

export const DISTRICT_LEADERSHIP_FIELDS = ['name', 'status', 'regionId', 'districtManagerId'] as const;
export const LOCATION_DISTRICT_FIELDS = ['storeNumber', 'recordStatus', 'type', 'hierarchyApplicability', 'regionId', 'districtId'] as const;
export const LEADERSHIP_PERSON_FIELDS = ['fullName', 'name', 'status', 'activeStatus'] as const;
export const MAX_LEADERSHIP_DEPENDENCIES = 300;
export const MAX_SHARED_INBOX_SCAN = 1000;

/** Independent, field-masked v3 source. Contacts are opt-in; login/accounts/other staff are never read. */
export class FirestoreLeadershipRepository implements LeadershipRepository {
  constructor(private readonly firestore: Firestore) {}
  async read(options: LeadershipReadOptions): Promise<LeadershipPage> {
    if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100 || !Number.isFinite(options.snapshotAt.getTime())) throw new Error('Invalid snapshot read bound.');
    return this.firestore.runTransaction(async (transaction: Transaction) => {
      const leadership = options.dataset === 'district-leadership';
      const collection = this.firestore.collection(leadership ? 'districts' : 'locations');
      const fields = leadership ? DISTRICT_LEADERSHIP_FIELDS : LOCATION_DISTRICT_FIELDS;
      let query = collection.orderBy(FieldPath.documentId()).select(...fields).limit(options.limit + 1);
      if (options.afterId) query = query.startAfter(options.afterId);
      const documents = options.id ? await transaction.getAll(collection.doc(options.id), { fieldMask: [...fields] }) : (await transaction.get(query)).docs;
      const records = documents.slice(0, options.limit).filter(d => d.exists).map(d => ({ id: d.id, data: d.data() || {} }));
      if (records.some(r => !canonicalId(r.id))) throw new Error('Invalid source document identity.');
      const ids = (rows: SourceRecord[], field: string) => [...new Set(rows.map(r => r.data[field]).filter(canonicalId))];
      let dependencies = 0;
      const fetch = async (name: string, ids: string[], fieldMask: readonly string[]): Promise<SourceRecord[]> => {
        dependencies += ids.length;
        if (dependencies > MAX_LEADERSHIP_DEPENDENCIES) throw new Error('Snapshot dependency bound exceeded.');
        const result: SourceRecord[] = [];
        for (let offset = 0; offset < ids.length; offset += 100) {
          const documents = await transaction.getAll(...ids.slice(offset, offset + 100).map(id => this.firestore.collection(name).doc(id)), { fieldMask: [...fieldMask] });
          result.push(...documents.filter(d => d.exists).map(d => ({ id: d.id, data: d.data() || {} })));
        }
        return result;
      };
      const districts = leadership ? records : await fetch('districts', ids(records, 'districtId'), ['name', 'status', 'regionId']);
      const [people, regions] = await Promise.all([
        leadership ? fetch('people', ids(records, 'districtManagerId'), [...LEADERSHIP_PERSON_FIELDS, ...(options.includeWorkEmail ? ['workEmail'] : [])]) : Promise.resolve([]),
        fetch('regions', [...new Set([...ids(records, 'regionId'), ...ids(districts, 'regionId')])], ['name', 'status']),
      ]);
      const sharedInboxKeys = new Set<string>();
      if (leadership && options.includeWorkEmail && people.some(p => normalizeLocationInboxEmail(p.data.workEmail))) {
        // Scan only the public inbox field, at the same readTime, so case variants cannot evade a match.
        const inboxes = await transaction.get(this.firestore.collection('locations').select('locationInboxEmail').limit(MAX_SHARED_INBOX_SCAN + 1));
        if (inboxes.docs.length > MAX_SHARED_INBOX_SCAN) throw new Error('Contact safety scan bound exceeded.');
        for (const document of inboxes.docs) {
          const normalized = normalizeLocationInboxEmail(document.data().locationInboxEmail);
          if (normalized) sharedInboxKeys.add(normalized.comparisonKey);
        }
      }
      return { records, people, regions, districts, sharedInboxKeys, nextId: !options.id && documents.length > options.limit ? records.at(-1)!.id : null };
    }, { readOnly: true, readTime: Timestamp.fromDate(options.snapshotAt) });
  }
}

export function createFirestoreLeadershipRepository(): FirestoreLeadershipRepository {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_GOOGLE_CLOUD_PROJECT;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || DEFAULT_FIRESTORE_DATABASE;
  if (databaseId === '(default)') throw new Error('A named Firestore database is required.');
  return new FirestoreLeadershipRepository(new Firestore({ projectId, databaseId }));
}

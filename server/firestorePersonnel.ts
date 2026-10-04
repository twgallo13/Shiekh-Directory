import { FieldPath, Firestore, Timestamp, type Transaction } from '@google-cloud/firestore';
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from './firestoreLocations';
import { type SourceRecord, STAFFING_LISTS, STAFFING_SCALARS } from './personnelProjection';

export type PersonnelDataset = 'personnel' | 'location-staffing';
export interface PersonnelSnapshotPage {
  records: SourceRecord[];
  people: SourceRecord[];
  locations: SourceRecord[];
  regions: SourceRecord[];
  districts: SourceRecord[];
  nextId: string | null;
}
export interface PersonnelReadOptions {
  dataset: PersonnelDataset;
  snapshotAt: Date;
  limit: number;
  afterId?: string;
  id?: string;
}
export interface PersonnelRepository {
  read(options: PersonnelReadOptions): Promise<PersonnelSnapshotPage>;
}

export const PERSONNEL_SOURCE_FIELDS = ['fullName', 'name', 'status', 'activeStatus', 'primaryLocationId', 'supportedLocationIds'] as const;
export const STAFFING_SOURCE_FIELDS = [
  'storeNumber', 'recordStatus', 'regionId', 'districtId', ...STAFFING_SCALARS, ...STAFFING_LISTS,
  'storeManagerName', 'districtManagerName', 'regionalManagerName', 'assistantStoreManagerNames', 'keyHolderNames',
] as const;

export class FirestorePersonnelRepository implements PersonnelRepository {
  constructor(private readonly firestore: Firestore) {}

  async read(options: PersonnelReadOptions): Promise<PersonnelSnapshotPage> {
    return this.firestore.runTransaction(async (transaction: Transaction) => {
      const personnel = options.dataset === 'personnel';
      const collection = this.firestore.collection(personnel ? 'people' : 'locations');
      let query = collection.orderBy(FieldPath.documentId()).select(...(personnel ? PERSONNEL_SOURCE_FIELDS : STAFFING_SOURCE_FIELDS)).limit(options.limit + 1);
      if (options.afterId) query = query.startAfter(options.afterId);
      const page = options.id ? await transaction.get(collection.doc(options.id)) : await transaction.get(query);
      const records: SourceRecord[] = 'docs' in page
        ? page.docs.slice(0, options.limit).map(document => ({ id: document.id, data: document.data() }))
        : page.exists ? [{ id: page.id, data: page.data() || {} }] : [];
      // A detail document read cannot select fields; only the projection below can publish it.
      const locations = await transaction.get(this.firestore.collection('locations').select('recordStatus'));
      const people = personnel ? null : await transaction.get(this.firestore.collection('people').select(...PERSONNEL_SOURCE_FIELDS));
      const regions = personnel ? null : await transaction.get(this.firestore.collection('regions').select('name', 'status'));
      const districts = personnel ? null : await transaction.get(this.firestore.collection('districts').select('name', 'status', 'regionId'));
      const source = (snapshot: typeof locations | null) => snapshot?.docs.map(document => ({ id: document.id, data: document.data() })) || [];
      return {
        records, people: source(people), locations: source(locations), regions: source(regions), districts: source(districts),
        nextId: 'docs' in page && page.size > options.limit ? records.at(-1)!.id : null,
      };
    }, { readOnly: true, readTime: Timestamp.fromDate(options.snapshotAt) });
  }
}

export function createFirestorePersonnelRepository(): FirestorePersonnelRepository {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_GOOGLE_CLOUD_PROJECT;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || DEFAULT_FIRESTORE_DATABASE;
  if (databaseId === '(default)') throw new Error('A named Firestore database is required.');
  return new FirestorePersonnelRepository(new Firestore({ projectId, databaseId }));
}

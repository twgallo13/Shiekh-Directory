import { FieldPath, Firestore, Timestamp, type Transaction } from '@google-cloud/firestore';
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from './firestoreLocations';
import { canonicalId, type SourceRecord, STAFFING_LISTS, STAFFING_SCALARS } from './personnelProjection';

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
export const MAX_PERSONNEL_DEPENDENCIES = 1000;
const REFERENCE_PERSON_FIELDS = ['fullName', 'name', 'status', 'activeStatus'];

export class FirestorePersonnelRepository implements PersonnelRepository {
  constructor(private readonly firestore: Firestore) {}

  async read(options: PersonnelReadOptions): Promise<PersonnelSnapshotPage> {
    if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) throw new Error('Invalid snapshot page bound.');
    return this.firestore.runTransaction(async (transaction: Transaction) => {
      const personnel = options.dataset === 'personnel';
      const collection = this.firestore.collection(personnel ? 'people' : 'locations');
      const fields = personnel ? PERSONNEL_SOURCE_FIELDS : STAFFING_SOURCE_FIELDS;
      let query = collection.orderBy(FieldPath.documentId()).select(...fields).limit(options.limit + 1);
      if (options.afterId) query = query.startAfter(options.afterId);
      const documents = options.id
        ? await transaction.getAll(collection.doc(options.id), { fieldMask: [...fields] })
        : (await transaction.get(query)).docs;
      const records = documents.slice(0, options.limit).filter(document => document.exists)
        .map(document => ({ id: document.id, data: document.data() || {} }));
      const references = (fields: readonly string[], listFields: readonly string[] = []) => {
        const ids = new Set<string>();
        for (const record of records) {
          for (const field of fields) {
            const value = record.data[field];
            const candidates = listFields.includes(field) ? Array.isArray(value) ? value : [] : [value];
            for (const id of candidates) if (canonicalId(id)) {
              ids.add(id);
              if (ids.size > MAX_PERSONNEL_DEPENDENCIES) throw new Error('Snapshot dependency bound exceeded.');
            }
          }
        }
        return [...ids];
      };
      const locationIds = personnel ? references(['primaryLocationId', 'supportedLocationIds'], ['supportedLocationIds']) : [];
      const personIds = personnel ? [] : references([...STAFFING_SCALARS, ...STAFFING_LISTS], STAFFING_LISTS);
      const regionIds = personnel ? [] : references(['regionId']);
      const districtIds = personnel ? [] : references(['districtId']);
      if (locationIds.length + personIds.length + regionIds.length + districtIds.length > MAX_PERSONNEL_DEPENDENCIES) throw new Error('Snapshot dependency bound exceeded.');
      const fetch = async (name: string, ids: string[], fieldMask: string[]): Promise<SourceRecord[]> => {
        const result: SourceRecord[] = [];
        for (let offset = 0; offset < ids.length; offset += 100) {
          const references = ids.slice(offset, offset + 100).map(id => this.firestore.collection(name).doc(id));
          const snapshots = await transaction.getAll(...references, { fieldMask });
          result.push(...snapshots.filter(document => document.exists).map(document => ({ id: document.id, data: document.data() || {} })));
        }
        return result;
      };
      const [locations, people, regions, districts] = await Promise.all([
        fetch('locations', locationIds, ['recordStatus']),
        fetch('people', personIds, REFERENCE_PERSON_FIELDS),
        fetch('regions', regionIds, ['name', 'status']),
        fetch('districts', districtIds, ['name', 'status', 'regionId']),
      ]);
      return {
        records, people, locations, regions, districts,
        nextId: !options.id && documents.length > options.limit ? records.at(-1)!.id : null,
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

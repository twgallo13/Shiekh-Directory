import { FieldPath, Firestore, Timestamp, type DocumentSnapshot, type Transaction } from "@google-cloud/firestore";
import type { LocationDocument, LocationRepository, LocationPageOptions, LocationPage } from "./directoryApi";
import { assertUniqueStoreNumbers } from "./directoryApi";
import { parseCustomFieldDefinition } from "../src/lib/customFields";
import type { HierarchyRegistry } from "../src/lib/hierarchyAssignmentContract";

export const DEFAULT_GOOGLE_CLOUD_PROJECT = "gen-lang-client-0801664258";
export const DEFAULT_FIRESTORE_DATABASE = "ai-studio-shiekhlocationco-00e1a479-af25-4ab6-9565-5c8b804c56a4";

const PUBLIC_LOCATION_FIELDS = [
  "storeNumber",
  "recordStatus",
  "name",
  "type",
  "mallOrCenterName",
  "address",
  "city",
  "state",
  "zipCode",
  "phone",
  "phonePrivacy",
  "timeZone",
  "district",
  "hierarchyApplicability",
  "regionId",
  "districtId",
  "operationalStatus",
  "activeNotice",
  "standardHours",
  "holidayHours",
  "specialHours",
  "lastVerifiedAt",
  "slug",
  "googleReviewUrl",
  "storePageUrl",
  "customMetadata",
] as const;

export class FirestoreLocationRepository implements LocationRepository {
  constructor(private readonly firestore: Firestore) {}

  async readCustomFieldDefinitions() {
    const snapshot = await this.firestore.collection('custom_field_definitions').limit(101).get();
    if (snapshot.size > 100) throw new Error('Too many custom field definitions.');
    return snapshot.docs.map(document => parseCustomFieldDefinition({ ...document.data(), id: document.id }));
  }

  async readPage({ snapshotAt, limit, afterId }: LocationPageOptions): Promise<LocationPage> {
    return this.firestore.runTransaction(async (transaction) => {
      const collection = this.firestore.collection("locations");
      if (!afterId) {
        const identities = await transaction.get(collection.select("storeNumber"));
        assertUniqueStoreNumbers(identities.docs.map((document) => ({ data: document.data() })));
      }
      let query = collection.orderBy(FieldPath.documentId()).select(...PUBLIC_LOCATION_FIELDS).limit(limit + 1);
      if (afterId) query = query.startAfter(afterId);
      const snapshot = await transaction.get(query);
      const page = snapshot.docs.slice(0, limit);
      return {
        records: page.map(toLocationDocument),
        nextId: snapshot.size > limit ? page.at(-1)!.id : null,
      };
    }, { readOnly: true, readTime: Timestamp.fromDate(snapshotAt) });
  }

  async readHierarchy(snapshotAt?: Date): Promise<HierarchyRegistry> {
    const read = async (transaction: Transaction): Promise<HierarchyRegistry> => {
      const [regions, districts] = await Promise.all([
        transaction.get(this.firestore.collection('regions').select('name', 'status')),
        transaction.get(this.firestore.collection('districts').select('name', 'regionId', 'status')),
      ]);
      return {
        regions: regions.docs.map(document => ({
          id: document.id,
          name: String(document.data().name || ''),
          status: document.data().status === 'Retired' ? 'Retired' : 'Active',
        })),
        districts: districts.docs.map(document => ({
          id: document.id,
          name: String(document.data().name || ''),
          regionId: String(document.data().regionId || ''),
          status: document.data().status === 'Retired' ? 'Retired' : 'Active',
        })),
      };
    };
    return snapshotAt
      ? this.firestore.runTransaction(read, { readOnly: true, readTime: Timestamp.fromDate(snapshotAt) })
      : this.firestore.runTransaction(read, { readOnly: true });
  }

  async findActiveByStoreNumber(storeNumber: string, snapshotAt = new Date()): Promise<LocationDocument | null> {
    const snapshot = await this.firestore.runTransaction(transaction => transaction.get(this.firestore
      .collection("locations")
      .where("storeNumber", "==", storeNumber)
      .select(...PUBLIC_LOCATION_FIELDS)
      .limit(2)), { readOnly: true, readTime: Timestamp.fromDate(snapshotAt) });

    assertUniqueStoreNumbers(snapshot.docs.map(toLocationDocument));
    return snapshot.empty ? null : toLocationDocument(snapshot.docs[0]);
  }
}

export function createFirestoreLocationRepository(): FirestoreLocationRepository {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_GOOGLE_CLOUD_PROJECT;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || DEFAULT_FIRESTORE_DATABASE;
  if (databaseId === "(default)") throw new Error("A named Firestore database is required.");

  return new FirestoreLocationRepository(new Firestore({ projectId, databaseId }));
}

function toLocationDocument(snapshot: DocumentSnapshot): LocationDocument {
  return {
    id: snapshot.id,
    data: snapshot.data() ?? {},
    updatedAt: snapshot.updateTime?.toDate() ?? new Date(0),
  };
}
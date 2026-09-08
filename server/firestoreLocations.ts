import { FieldPath, Firestore, Timestamp, type DocumentSnapshot } from "@google-cloud/firestore";
import type { LocationDocument, LocationRepository, LocationPageOptions, LocationPage } from "./directoryApi";
import { assertUniqueStoreNumbers } from "./directoryApi";

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
  "operationalStatus",
  "activeNotice",
  "standardHours",
  "holidayHours",
  "specialHours",
  "lastVerifiedAt",
  "slug",
  "googleReviewUrl",
  "storePageUrl",
] as const;

export class FirestoreLocationRepository implements LocationRepository {
  constructor(private readonly firestore: Firestore) {}

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

  async findActiveByStoreNumber(storeNumber: string): Promise<LocationDocument | null> {
    const snapshot = await this.firestore
      .collection("locations")
      .where("storeNumber", "==", storeNumber)
      .select(...PUBLIC_LOCATION_FIELDS)
      .limit(2)
      .get();

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
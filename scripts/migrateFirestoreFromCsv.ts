import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Firestore } from "@google-cloud/firestore";
import { parse } from "csv-parse/sync";
import {
  INITIAL_CORPORATE_HOLIDAYS,
  INITIAL_EMAIL_TEMPLATES,
  INITIAL_HOURS_TEMPLATES,
  INITIAL_LOCATIONS,
  INITIAL_NOTIFICATION_RULES,
  INITIAL_PEOPLE,
  INITIAL_SOP_RUNBOOKS,
} from "../src/data/initialData";
import { migrateDirectoryRelationships } from "../src/lib/directoryMigration";
import type { LocationRecord, Person } from "../src/types";

const PROJECT_ID = "gen-lang-client-0801664258";
const DATABASE_ID = "ai-studio-shiekhlocationco-00e1a479-af25-4ab6-9565-5c8b804c56a4";
const CSV_PATH = new URL("../reference-data/store-directory-2025-09-26.csv", import.meta.url);
const APPLY = process.argv.includes("--apply");

type CsvRow = {
  "District Manager": string;
  "Store #": string;
  "Store Phone #": string;
  "Location Name": string;
  "Address": string;
  City: string;
  State: string;
  "Zip Code": string;
  Manager: string;
  "Manager #": string;
  "Assistant Manager": string;
  "AM 2/3rd Key": string;
  "Store Email": string;
};

const csv = await readFile(CSV_PATH, "utf8");
const rows = parse(csv, {
  bom: true,
  columns: (headers: string[]) => headers.map(header => header.trim()),
  skip_empty_lines: true,
  trim: true,
}) as CsvRow[];

const storeNumber = (value: string) => String(Number(value)).padStart(2, "0");
const normalizedName = (value: string) => value.trim().toLocaleLowerCase();
const baselineByStore = new Map(INITIAL_LOCATIONS.map(location => [storeNumber(location.storeNumber), location]));
const duplicateCsvStores = rows.map(row => storeNumber(row["Store #"])).filter((value, index, all) => all.indexOf(value) !== index);
if (duplicateCsvStores.length) throw new Error(`CSV contains duplicate store numbers: ${duplicateCsvStores.join(", ")}`);

const sourceLocations = rows.map(row => {
  const number = storeNumber(row["Store #"]);
  const baseline = baselineByStore.get(number);
  if (!baseline) throw new Error(`No normalized baseline exists for CSV store ${number}.`);
  return compact({
    ...baseline,
    storeNumber: number,
    name: row["Location Name"].trim(),
    address: row.Address.trim(),
    city: row.City.trim(),
    state: row.State.trim(),
    zipCode: row["Zip Code"].trim(),
    phone: row["Store Phone #"].trim(),
    districtManagerId: undefined,
    districtManagerName: row["District Manager"].trim(),
    storeManagerId: undefined,
    storeManagerName: row.Manager.trim(),
    storeManagerPhone: row["Manager #"].trim(),
    assistantStoreManagerIds: undefined,
    assistantStoreManagerNames: row["Assistant Manager"] ? [row["Assistant Manager"].trim()] : [],
    keyHolderIds: undefined,
    keyHolderNames: row["AM 2/3rd Key"] ? [row["AM 2/3rd Key"].trim()] : [],
    updatedAt: new Date().toISOString(),
  }) as LocationRecord;
});

const usedNames = new Set(rows.flatMap(row => [row["District Manager"], row.Manager, row["Assistant Manager"], row["AM 2/3rd Key"]])
  .filter(Boolean).map(normalizedName));
const sourcePeople = INITIAL_PEOPLE.filter(person => usedNames.has(normalizedName(person.fullName))).map(person => ({ ...person, assignedLocations: [] }));
const migrated = migrateDirectoryRelationships(sourceLocations, sourcePeople, INITIAL_HOURS_TEMPLATES);
const managerPhones = new Map(rows.filter(row => row.Manager).map(row => [normalizedName(row.Manager), row["Manager #"].trim()]));
const people = migrated.people.map(person => {
  const phone = managerPhones.get(normalizedName(person.fullName));
  return compact({ ...person, ...(phone ? { phone, workPhone: phone } : {}) }) as Person;
});
const peopleById = new Map(people.map(person => [person.id, person]));
const locations = migrated.locations.map(location => compact({
  ...location,
  storeManagerPhone: location.storeManagerId ? peopleById.get(location.storeManagerId)?.phone || location.storeManagerPhone : location.storeManagerPhone,
}));

const db = new Firestore({ projectId: PROJECT_ID, databaseId: DATABASE_ID });
const replacementCollections: Record<string, Record<string, unknown>[]> = {
  locations,
  people,
  hours_templates: INITIAL_HOURS_TEMPLATES.map(compact),
  corporate_holidays: INITIAL_CORPORATE_HOLIDAYS.map(compact),
  requests: [],
  audit_logs: [{
    id: `aud-migration-${Date.now()}`,
    timestamp: new Date().toISOString(),
    userId: "system-migration",
    userName: "Firestore CSV migration",
    action: "Canonical CSV Import",
    entityType: "Setting",
    entityId: "directory-database",
    entityName: "Directory Database",
    details: `Replaced duplicate location generations with ${locations.length} canonical CSV-backed records.`,
  }],
  email_templates: INITIAL_EMAIL_TEMPLATES.map(compact),
  notification_rules: INITIAL_NOTIFICATION_RULES.map(compact),
  outbox_logs: [],
  sop_runbooks: INITIAL_SOP_RUNBOOKS.map(compact),
};

const existing = new Map<string, FirebaseFirestore.QuerySnapshot>();
for (const collection of Object.keys(replacementCollections)) existing.set(collection, await db.collection(collection).get());
const usersSnapshot = await db.collection("users").get();
const userGroups = Object.groupBy(usersSnapshot.docs, document => String(document.data().email || "").trim().toLowerCase());
const duplicateUserDocuments = Object.values(userGroups).flatMap(documents => documents && documents.length > 1
  ? documents.slice().sort((left, right) => userScore(right.data(), right.id) - userScore(left.data(), left.id)).slice(1)
  : []);

const deleteCount = [...existing.values()].reduce((total, snapshot) => total + snapshot.size, 0) + duplicateUserDocuments.length;
const writeCount = Object.values(replacementCollections).reduce((total, records) => total + records.length, 0);
const plan = {
  mode: APPLY ? "apply" : "dry-run",
  projectId: PROJECT_ID,
  databaseId: DATABASE_ID,
  csvSha256: createHash("sha256").update(csv).digest("hex"),
  csvStores: rows.length,
  canonicalLocations: locations.length,
  canonicalPeople: people.length,
  existingLocations: existing.get("locations")?.size,
  duplicateUserDocuments: duplicateUserDocuments.map(document => document.id),
  deleteCount,
  writeCount,
};
console.log(JSON.stringify(plan, null, 2));

if (!APPLY) {
  console.log("Dry run only. Re-run with --apply to execute this reviewed plan.");
  process.exit(0);
}
if (deleteCount + writeCount > 500) throw new Error("Migration exceeds the Firestore atomic batch limit.");

const batch = db.batch();
for (const snapshot of existing.values()) for (const document of snapshot.docs) batch.delete(document.ref);
for (const [collection, records] of Object.entries(replacementCollections)) {
  for (const record of records) {
    const id = String(record.id || "");
    if (!id) throw new Error(`A ${collection} record is missing its id.`);
    batch.set(db.collection(collection).doc(id), record);
  }
}
for (const document of duplicateUserDocuments) batch.delete(document.ref);
await batch.commit();

const [locationCheck, peopleCheck, usersCheck] = await Promise.all([
  db.collection("locations").get(),
  db.collection("people").get(),
  db.collection("users").get(),
]);
const duplicateStores = Object.values(Object.groupBy(locationCheck.docs, document => String(document.data().storeNumber))).filter(documents => (documents?.length || 0) > 1).length;
const duplicateEmails = Object.values(Object.groupBy(usersCheck.docs, document => String(document.data().email || "").toLowerCase())).filter(documents => (documents?.length || 0) > 1).length;
console.log(JSON.stringify({ applied: true, locations: locationCheck.size, people: peopleCheck.size, users: usersCheck.size, duplicateStores, duplicateEmails }, null, 2));
if (locationCheck.size !== rows.length || duplicateStores || duplicateEmails) throw new Error("Post-migration verification failed.");

function compact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function userScore(data: FirebaseFirestore.DocumentData, documentId: string) {
  return (data.firebaseUid ? 100 : 0)
    + (data.status === "Active" ? 20 : 0)
    + (documentId.startsWith("usr-") ? 5 : 0)
    + (data.invitationToken ? 0 : 1);
}

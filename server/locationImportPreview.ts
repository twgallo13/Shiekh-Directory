import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Firestore, type QueryDocumentSnapshot } from '@google-cloud/firestore';
import { AccessDenied, AuthenticationUnavailable, type Account, type Authenticate } from './authAuthority';
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from './firestoreLocations';
import type { DirectorySeed } from '../src/lib/directorySeed';
import { stringify } from 'csv-stringify/sync';
import { buildLocationImportFieldDictionary, buildLocationImportTemplate, buildLocationImportWorkedExample, LocationImportPreviewError, previewLocationImport } from '../src/lib/locationImportPreview';
import { LOCATION_IMPORT_MAX_BYTES } from '../src/lib/locationImportSchema';

const PREVIEW_ROLES: Account['role'][] = ['System Administrator', 'Directory Data Steward', 'Editor'];
export type LocationImportSnapshot = Pick<DirectorySeed, 'locations' | 'people' | 'regions' | 'districts'>;

export interface LocationImportPreviewStore {
  readLocationImportSnapshot(): Promise<LocationImportSnapshot>;
}

export function createLocationImportPreviewRouter(
  authenticate: Authenticate | null,
  store: LocationImportPreviewStore,
  options: { rateLimit?: false; now?: () => Date } = {},
) {
  const router = Router();
  const now = options.now ?? (() => new Date());
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  if (options.rateLimit !== false) router.use(rateLimit({ limit: 20, windowMs: 60_000, standardHeaders: 'draft-8', legacyHeaders: false }));

  router.get('/locations/template', async (request, response) => {
    try {
      await authorizePreview(authenticate, request.get('authorization'));
      response
        .status(200)
        .type('text/csv; charset=utf-8')
        .set('Content-Disposition', 'attachment; filename="shiekh_locations_import_v1.csv"')
        .send(buildLocationImportTemplate());
    } catch (error) {
      sendPreviewError(response, error);
    }
  });

  router.get('/locations/example', async (request, response) => {
    try {
      await authorizePreview(authenticate, request.get('authorization'));
      response.status(200).type('text/csv; charset=utf-8')
        .set('Content-Disposition', 'attachment; filename="shiekh_locations_import_v1_worked_example.csv"')
        .send(buildLocationImportWorkedExample());
    } catch (error) {
      sendPreviewError(response, error);
    }
  });

  router.get('/locations/fields', async (request, response) => {
    try {
      await authorizePreview(authenticate, request.get('authorization'));
      response.status(200).type('text/csv; charset=utf-8')
        .set('Content-Disposition', 'attachment; filename="shiekh_locations_import_v1_field_dictionary.csv"')
        .send(buildLocationImportFieldDictionary());
    } catch (error) {
      sendPreviewError(response, error);
    }
  });

  router.get('/locations/references', async (request, response) => {
    try {
      await authorizePreview(authenticate, request.get('authorization'));
      const snapshot = await store.readLocationImportSnapshot();
      const snapshotReadAt = now().toISOString();
      response.status(200).type('text/csv; charset=utf-8')
        .set('Content-Disposition', 'attachment; filename="shiekh_location_import_reference_ids.csv"')
        .set('X-Snapshot-Read-At', snapshotReadAt)
        .send(buildReferenceCsv(snapshot));
    } catch (error) {
      sendPreviewError(response, error);
    }
  });

  router.post('/locations/preview', async (request, response) => {
    try {
      await authorizePreview(authenticate, request.get('authorization'));
      const csv = request.body?.csv;
      if (typeof csv !== 'string' || !csv.trim() || Buffer.byteLength(csv, 'utf8') > LOCATION_IMPORT_MAX_BYTES) {
        throw new LocationImportPreviewError('invalid_csv', 'Upload a non-empty CSV file no larger than 2 MB.');
      }
      const snapshot = await store.readLocationImportSnapshot();
      response.status(200).json(previewLocationImport(csv, snapshot, now().toISOString()));
    } catch (error) {
      sendPreviewError(response, error);
    }
  });

  return router;
}

export class FirestoreLocationImportPreviewStore implements LocationImportPreviewStore {
  constructor(private readonly firestore: Firestore) {}

  async readLocationImportSnapshot(): Promise<LocationImportSnapshot> {
    return this.firestore.runTransaction(async transaction => {
      const [locations, people, regions, districts] = await Promise.all([
        transaction.get(this.firestore.collection('locations')),
        transaction.get(this.firestore.collection('people')),
        transaction.get(this.firestore.collection('regions')),
        transaction.get(this.firestore.collection('districts')),
      ]);
      return {
        locations: locations.docs.map(document => toRecord(document)) as unknown as LocationImportSnapshot['locations'],
        people: people.docs.map(document => toRecord(document)) as unknown as LocationImportSnapshot['people'],
        regions: regions.docs.map(document => toRecord(document)) as unknown as LocationImportSnapshot['regions'],
        districts: districts.docs.map(document => toRecord(document)) as unknown as LocationImportSnapshot['districts'],
      };
    }, { readOnly: true });
  }
}

export function createFirestoreLocationImportPreviewStore(): FirestoreLocationImportPreviewStore {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_GOOGLE_CLOUD_PROJECT;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || DEFAULT_FIRESTORE_DATABASE;
  if (databaseId === '(default)') throw new Error('A named Firestore database is required.');
  return new FirestoreLocationImportPreviewStore(new Firestore({ projectId, databaseId }));
}

export function buildReferenceCsv(snapshot: LocationImportSnapshot): string {
  const regionsById = new Map(snapshot.regions.map(region => [region.id, region.name]));
  const rows = [
    ...snapshot.locations.map(location => ({ RecordType: 'Location', Id: location.id, Name: location.name, LifecycleStatus: location.recordStatus, StoreNumber: location.storeNumber, ParentRegionId: '', ParentRegionName: '' })),
    ...snapshot.people.map(person => ({ RecordType: 'Person', Id: person.id, Name: person.fullName, LifecycleStatus: person.activeStatus === false || (person.status && person.status !== 'Active') ? 'Inactive' : 'Active', StoreNumber: '', ParentRegionId: '', ParentRegionName: '' })),
    ...snapshot.regions.map(region => ({ RecordType: 'Region', Id: region.id, Name: region.name, LifecycleStatus: region.status, StoreNumber: '', ParentRegionId: '', ParentRegionName: '' })),
    ...snapshot.districts.map(district => ({ RecordType: 'District', Id: district.id, Name: district.name, LifecycleStatus: district.status, StoreNumber: '', ParentRegionId: district.regionId, ParentRegionName: regionsById.get(district.regionId) || '' })),
  ].sort((left, right) => left.RecordType.localeCompare(right.RecordType) || left.Name.localeCompare(right.Name) || left.Id.localeCompare(right.Id));
  return stringify(rows, { header: true, columns: ['RecordType', 'Id', 'Name', 'LifecycleStatus', 'StoreNumber', 'ParentRegionId', 'ParentRegionName'], record_delimiter: '\r\n', bom: false });
}

function toRecord(snapshot: QueryDocumentSnapshot): Record<string, unknown> {
  return { ...snapshot.data(), id: snapshot.id };
}

async function authorizePreview(authenticate: Authenticate | null, authorization: string | undefined): Promise<Account> {
  const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token || token.length > 8192) throw new PreviewHttpError(401, 'invalid_token', 'A valid Firebase ID token is required.');
  if (!authenticate) throw new PreviewHttpError(503, 'auth_unavailable', 'Directory authentication is unavailable.');
  let account: Account;
  try {
    account = await authenticate(token);
  } catch (error) {
    if (error instanceof AuthenticationUnavailable) throw new PreviewHttpError(503, 'auth_unavailable', 'Directory authentication is unavailable.');
    if (error instanceof AccessDenied) throw new PreviewHttpError(403, 'access_denied', 'Your account is not authorized to preview imports.');
    throw new PreviewHttpError(401, 'invalid_token', 'A valid Firebase ID token is required.');
  }
  if (!PREVIEW_ROLES.includes(account.role)) throw new PreviewHttpError(403, 'preview_not_allowed', 'Your role cannot preview Location imports.');
  if (!['Company', 'Company-wide'].includes(account.accessScope)) {
    throw new PreviewHttpError(403, 'unsupported_preview_scope', 'Location CSV preview currently requires company-wide access.');
  }
  return account;
}

class PreviewHttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

function sendPreviewError(response: { status(code: number): { json(body: unknown): unknown } }, error: unknown) {
  if (error instanceof PreviewHttpError) return response.status(error.status).json({ error: { code: error.code, message: error.message } });
  if (error instanceof LocationImportPreviewError) return response.status(400).json({ error: { code: error.code, message: error.message } });
  return response.status(503).json({ error: { code: 'preview_unavailable', message: 'The authoritative directory snapshot could not be previewed.' } });
}
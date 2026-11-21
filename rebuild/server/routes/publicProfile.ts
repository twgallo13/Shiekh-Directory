import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { Closure, DayOfWeek, HoursException, Location, StandardHours } from '../../src/types';
import { requireLegacyScope, sendLegacyError } from '../middleware/legacyApiAuth';
import {
  COMPANY_TILE_KEYS,
  COMPANY_TILE_ORDER,
  DEFAULT_STORE_PAGE_TILES,
  type StorePageTileDefaults,
} from '../../src/constants/storePage';
import {
  cleanText,
  parseMagentoStoreId,
  validateHoursException,
  validateReviewUrl,
  validateStorePageTiles,
} from '../../src/lib/storePageValidation';

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const NOT_FOUND = { code: 'store_not_found', message: 'Store not found.' };

interface PageRecord {
  reviewUrl?: string | null;
  magentoStoreId?: string | null;
  pageEnabled?: boolean;
  updatedAt?: string;
}

/**
 * SAFEGUARD: every public field is assigned by name.
 * Do not spread a location, closure, person, or page document into the response.
 */
export function buildPublicStore(
  location: Location,
  page: PageRecord | null,
  exceptions: HoursException[],
  closure: Closure | null,
): Record<string, unknown> {
  const storeNumber = cleanText(location.storeNumber, 20);
  if (location.lifecycle === 'retired') {
    return { storeNumber, status: 'Retired' };
  }
  const status = closure ? 'Temporarily Closed' : 'Active';
  if (page?.pageEnabled !== true) {
    return { storeNumber, status, pageEnabled: false };
  }

  const address = location.address || { street: '', city: '', state: '', zip: '', country: 'US' };
  const review = validateReviewUrl(page?.reviewUrl ?? null);
  const magento = parseMagentoStoreId(page?.magentoStoreId ?? null);
  const phone = location.phonePublic === true ? cleanText(location.mainPhone, 20) : '';
  const body: Record<string, unknown> = {
    storeNumber,
    status,
    pageEnabled: true,
    updatedAt: typeof page?.updatedAt === 'string' ? page.updatedAt : null,
    name: cleanText(location.name, 100),
    mallOrCenterName: cleanText(location.mallOrCenterName, 100),
    address: {
      street: cleanText(address.street, 120),
      suite: cleanText(address.suite, 40),
      city: cleanText(address.city, 80),
      state: cleanText(address.state, 40),
      zip: cleanText(address.zip, 20),
    },
    timeZone: cleanText(location.timeZone, 64) || 'America/Los_Angeles',
    ...(phone ? { phone } : {}),
    hours: mapHours(location.standardHours, exceptions),
    temporaryClosure: mapClosure(closure),
    reviewUrl: review.ok ? review.href : null,
    magentoStoreId: magento.ok ? magento.id : null,
  };
  return body;
}

function mapHours(standard: StandardHours | undefined, exceptions: HoursException[]): Record<string, unknown> | null {
  if (!standard) return null;
  const weekly: Record<string, unknown> = {};
  for (const day of DAYS) {
    const hours = standard[day];
    if (!hours || hours.closed || !Array.isArray(hours.intervals)) {
      weekly[day] = { closed: true, intervals: [] };
      continue;
    }
    const intervals = hours.intervals
      .filter((interval) => interval && typeof interval.open === 'string' && typeof interval.close === 'string')
      .map((interval) => ({ open: interval.open, close: interval.close }));
    weekly[day] = { closed: false, intervals };
  }
  const mapped = exceptions
    .map((exception) => {
      const validated = validateHoursException(exception);
      if (!validated.ok) return null;
      return {
        type: validated.value.type,
        label: cleanText(validated.value.label, 60),
        startDate: validated.value.startDate,
        endDate: validated.value.endDate,
        closed: validated.value.closed,
        intervals: validated.value.intervals,
      };
    })
    .filter((exception): exception is NonNullable<typeof exception> => exception !== null)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.label.localeCompare(b.label));
  return { weekly, exceptions: mapped };
}

function mapClosure(closure: Closure | null): { publicExplanation: string; reopensOn: string | null } | null {
  if (!closure) return null;
  const ends = typeof closure.endsAt === 'string' ? closure.endsAt : '';
  return {
    publicExplanation: cleanText(closure.publicExplanation, 300),
    reopensOn: /^\d{4}-\d{2}-\d{2}/.test(ends) ? ends.slice(0, 10) : null,
  };
}

function companyTiles(tiles: StorePageTileDefaults): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  for (const key of COMPANY_TILE_KEYS) {
    if (key === 'app') {
      const app = tiles.app;
      if (!app.show) continue;
      const ios = app.iosUrl;
      const android = app.androidUrl;
      const url = ios || android;
      if (!url) continue;
      result.push({
        key,
        label: cleanText(app.label, 40),
        url,
        ...(ios ? { iosUrl: ios } : {}),
        ...(android ? { androidUrl: android } : {}),
        order: COMPANY_TILE_ORDER[key],
      });
      continue;
    }
    const row = tiles[key];
    if (!row.show || !row.url) continue;
    result.push({
      key,
      label: cleanText(row.label, 40),
      url: row.url,
      order: COMPANY_TILE_ORDER[key],
    });
  }
  return result;
}

async function loadTiles(db: Firestore): Promise<StorePageTileDefaults> {
  const snap = await db.collection('settings').doc('storePageDefaults').get();
  if (!snap.exists) return DEFAULT_STORE_PAGE_TILES;
  const parsed = validateStorePageTiles(snap.data()?.tiles);
  return parsed.ok ? parsed.tiles : DEFAULT_STORE_PAGE_TILES;
}

function chooseLocation(docs: FirebaseFirestore.QueryDocumentSnapshot[]): FirebaseFirestore.QueryDocumentSnapshot | null {
  const stores = docs.filter((doc) => {
    const data = doc.data() as Location;
    return data.kind === 'store' && data.lifecycle !== 'planned';
  });
  const active = stores.filter((doc) => (doc.data() as Location).lifecycle === 'active');
  const pool = active.length > 0 ? active : stores.filter((doc) => (doc.data() as Location).lifecycle === 'retired');
  if (pool.length === 0) return null;
  return [...pool].sort((a, b) => {
    const aTime = String((a.data() as Location).updatedAt || '');
    const bTime = String((b.data() as Location).updatedAt || '');
    if (aTime !== bTime) return bTime.localeCompare(aTime);
    return a.id.localeCompare(b.id);
  })[0];
}

async function loadClosure(db: Firestore, locationId: string): Promise<Closure | null> {
  const snap = await db.collection('locations').doc(locationId).collection('closures')
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Closure;
}

async function loadExceptions(db: Firestore, locationId: string): Promise<HoursException[]> {
  const snap = await db.collection('locations').doc(locationId).collection('hoursExceptions').get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as HoursException);
}

async function toPublic(db: Firestore, doc: FirebaseFirestore.QueryDocumentSnapshot): Promise<Record<string, unknown>> {
  const location = { id: doc.id, ...doc.data() } as Location;
  if (location.lifecycle === 'retired') {
    return buildPublicStore(location, null, [], null);
  }
  const pageSnap = await db.collection('storePages').doc(doc.id).get();
  const page = pageSnap.exists ? pageSnap.data() as PageRecord : null;
  if (page?.pageEnabled !== true) {
    const closure = await loadClosure(db, doc.id);
    return buildPublicStore(location, page, [], closure);
  }
  const [closure, exceptions] = await Promise.all([
    loadClosure(db, doc.id),
    loadExceptions(db, doc.id),
  ]);
  return buildPublicStore(location, page, exceptions, closure);
}

export function createPublicProfileRouter(db: Firestore): Router {
  const router = Router();
  router.use(requireLegacyScope('public-profile:read'));

  router.get('/stores', async (_req: Request, res: Response) => {
    try {
      const [locationsSnap, tiles] = await Promise.all([
        db.collection('locations').where('kind', '==', 'store').get(),
        loadTiles(db),
      ]);
      const byNumber = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
      for (const doc of locationsSnap.docs) {
        const data = doc.data() as Location;
        if (data.lifecycle === 'planned') continue;
        const number = String(data.storeNumber ?? '');
        const list = byNumber.get(number) ?? [];
        list.push(doc);
        byNumber.set(number, list);
      }
      const chosen = [...byNumber.values()]
        .map((group) => chooseLocation(group))
        .filter((doc): doc is FirebaseFirestore.QueryDocumentSnapshot => doc !== null)
        .sort((a, b) => String((a.data() as Location).storeNumber).localeCompare(String((b.data() as Location).storeNumber), undefined, { numeric: true }));
      const stores = [];
      for (const doc of chosen) stores.push(await toPublic(db, doc));
      return res.json({
        contractVersion: 'public-profile.v1',
        generatedAt: new Date().toISOString(),
        companyTiles: companyTiles(tiles),
        stores,
      });
    } catch (error) {
      console.error('Public profile list error:', error);
      return sendLegacyError(res, 500, 'internal_error', 'An unexpected error occurred.');
    }
  });

  router.get('/stores/:storeNumber', async (req: Request, res: Response) => {
    try {
      const { storeNumber } = req.params;
      if (!/^\d+$/.test(storeNumber)) {
        return sendLegacyError(res, 400, 'invalid_store_number', 'Store number must be digits only.');
      }
      const locationsSnap = await db.collection('locations').where('storeNumber', '==', storeNumber).get();
      const chosen = chooseLocation(locationsSnap.docs);
      if (!chosen) return sendLegacyError(res, 404, NOT_FOUND.code, NOT_FOUND.message);
      const tiles = await loadTiles(db);
      return res.json({
        contractVersion: 'public-profile.v1',
        generatedAt: new Date().toISOString(),
        companyTiles: companyTiles(tiles),
        stores: [await toPublic(db, chosen)],
      });
    } catch (error) {
      console.error('Public profile store error:', error);
      return sendLegacyError(res, 500, 'internal_error', 'An unexpected error occurred.');
    }
  });

  return router;
}

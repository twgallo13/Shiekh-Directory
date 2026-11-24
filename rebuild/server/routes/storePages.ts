import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AuthUser, AuditLogEntry, Location } from '../../src/types';
import { requireStoreAccess } from '../middleware/auth';
import {
  COMPANY_TILE_KEYS,
  COMPANY_TILE_ORDER,
  EMPTY_STORE_PAGE_TILES,
  storePageUrl,
  type StorePageTileDefaults,
} from '../../src/constants/storePage';
import {
  parseExpectedVersion,
  parseMagentoStoreId,
  readDefaultStoreImageUrl,
  readFindStoreUrl,
  savedCompanyTileUrl,
  validateDefaultStoreImageUrl,
  validateFindStoreUrl,
  validateReviewUrl,
  validateStorePageTiles,
  validateWebsiteUrl,
} from '../../src/lib/storePageValidation';
import { HttpError, isAlreadyExists } from '../storePage/httpError';

const MAGENTO_COLLECTION = 'storePageMagentoIds';

interface StorePageDoc {
  reviewUrl: string | null;
  websiteUrl: string | null;
  magentoStoreId: string | null;
  pageEnabled: boolean;
  version: number;
  createdAt?: string;
  updatedAt: string;
  updatedBy: string;
}

function errorBody(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({
    error: { code, message, requestId: res.locals.requestId },
  });
}

function mapTxError(error: unknown): HttpError | null {
  if (error instanceof HttpError) return error;
  if (!isAlreadyExists(error)) return null;
  const message = error instanceof Error ? error.message : '';
  if (message.includes(MAGENTO_COLLECTION)) {
    return new HttpError(409, 'magento_id_taken', 'That Magento store ID is already used by another store.');
  }
  return new HttpError(409, 'version_conflict', 'This store page was updated. Reload and try again.');
}

async function loadTiles(db: Firestore): Promise<StorePageTileDefaults> {
  const snap = await db.collection('settings').doc('storePageDefaults').get();
  if (!snap.exists) return EMPTY_STORE_PAGE_TILES;
  const parsed = validateStorePageTiles(snap.data()?.tiles);
  return parsed.ok ? parsed.tiles : EMPTY_STORE_PAGE_TILES;
}

function cardTiles(reviewUrl: string | null, shopVisible: boolean, tiles: StorePageTileDefaults) {
  const company = COMPANY_TILE_KEYS.map((key) => {
    const row = tiles[key];
    const href = savedCompanyTileUrl(key, row);
    return {
      key,
      label: row.label,
      locked: true,
      visible: !!href && row.show,
      note: href ? 'Set by Shiekh' : 'Not set',
      order: COMPANY_TILE_ORDER[key],
    };
  });
  return [
    { key: 'review', label: 'Google review', locked: false, visible: !!reviewUrl, note: null, order: 1 },
    { key: 'shop', label: 'Shop this store', locked: false, visible: shopVisible, note: null, order: 2 },
    ...company,
  ];
}

function auditEntry(
  authUser: AuthUser,
  entityId: string,
  entityName: string,
  action: AuditLogEntry['action'],
  changes: AuditLogEntry['changes'],
  previousVersion: number,
  newVersion: number,
): Omit<AuditLogEntry, 'id'> & { id: string } {
  return {
    id: '',
    timestamp: new Date().toISOString(),
    userId: authUser.uid,
    userEmail: authUser.email,
    userRole: authUser.role,
    action,
    entityType: 'store-page',
    entityId,
    entityName,
    changes,
    previousVersion,
    newVersion,
  };
}

export function createStorePagesRouter(db: Firestore): Router {
  const router = Router();

  router.get('/:locationId', requireStoreAccess('locationId'), async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { locationId } = req.params;
      const locationSnap = await db.collection('locations').doc(locationId).get();
      if (!locationSnap.exists) {
        return errorBody(res, 404, 'not_found', 'Location not found');
      }
      const location = locationSnap.data() as Location;
      const pageSnap = await db.collection('storePages').doc(locationId).get();
      const page = pageSnap.exists ? pageSnap.data() as StorePageDoc : null;
      const privileged = authUser.role === 'Admin' || authUser.role === 'Steward';
      const magentoStoreId = page?.magentoStoreId ?? null;

      const lockSnap = await db.collection('storeLinkPending').doc(locationId).get();
      const lockedId = lockSnap.exists && typeof lockSnap.data()?.correctionId === 'string'
        ? lockSnap.data()?.correctionId as string
        : '';
      const lockedDoc = lockedId ? await db.collection('corrections').doc(lockedId).get() : null;
      const lockedPending = lockedDoc?.exists
        && lockedDoc.data()?.status === 'pending'
        && lockedDoc.data()?.category === 'store-link'
        ? lockedDoc
        : null;
      const pendingSnap = lockedPending ? null : await db.collection('corrections')
        .where('locationId', '==', locationId)
        .where('status', '==', 'pending')
        .orderBy('submittedAt', 'desc')
        .get();
      const pending = lockedPending ?? pendingSnap?.docs.find((doc) => doc.data().category === 'store-link') ?? null;
      const pendingData = pending?.data();
      const tiles = await loadTiles(db);

      return res.json({
        data: {
          reviewUrl: page?.reviewUrl ?? null,
          websiteUrl: page?.websiteUrl ?? null,
          magentoStoreId: privileged ? magentoStoreId : null,
          shopTileVisible: !!magentoStoreId,
          pageEnabled: page?.pageEnabled === true,
          version: page?.version ?? 0,
          updatedAt: page?.updatedAt ?? null,
          updatedBy: privileged ? (page?.updatedBy ?? null) : null,
          pageUrl: storePageUrl(location.storeNumber),
          storeNumber: location.storeNumber,
          pendingRequest: pending ? {
            id: pending.id,
            status: 'pending',
            reviewUrl: typeof pendingData?.proposedChanges?.reviewUrl === 'string'
              ? pendingData.proposedChanges.reviewUrl
              : null,
            ...(privileged ? { submittedByEmail: pendingData?.submittedByEmail ?? null } : {}),
          } : null,
          tiles: cardTiles(page?.reviewUrl ?? null, !!magentoStoreId, tiles),
          defaultImage: {
            source: 'dynamic-qr',
            label: 'Company default image · Set by Shiekh',
          },
        },
      });
    } catch (error) {
      console.error('Get store page error:', error);
      return errorBody(res, 500, 'get_error', 'Failed to load the store page');
    }
  });

  router.patch('/:locationId', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) return errorBody(res, 401, 'unauthorized', 'Not authenticated');
      if (authUser.role !== 'Steward' && authUser.role !== 'Admin') {
        return errorBody(res, 403, 'forbidden', 'Only a Steward or Admin can edit the store page');
      }
      const { locationId } = req.params;
      const expectedVersion = parseExpectedVersion(req.body?.expectedVersion);
      if (expectedVersion === null) {
        return errorBody(res, 400, 'expected_version_required', 'expectedVersion is required');
      }
      const body = req.body ?? {};
      if (body.reviewUrl === undefined && body.websiteUrl === undefined && body.magentoStoreId === undefined) {
        return errorBody(res, 400, 'no_changes', 'Send a review link, a store website URL, or a Magento store ID');
      }
      let reviewHref: string | null | undefined;
      if (body.reviewUrl !== undefined) {
        const parsed = validateReviewUrl(body.reviewUrl);
        if (!parsed.ok) return errorBody(res, 400, 'invalid_review_url', parsed.message);
        reviewHref = parsed.href;
      }
      let websiteHref: string | null | undefined;
      if (body.websiteUrl !== undefined) {
        const parsed = validateWebsiteUrl(body.websiteUrl);
        if (!parsed.ok) return errorBody(res, 400, 'invalid_website_url', parsed.message);
        websiteHref = parsed.href;
      }
      let magentoId: string | null | undefined;
      if (body.magentoStoreId !== undefined) {
        const parsed = parseMagentoStoreId(body.magentoStoreId);
        if (!parsed.ok) return errorBody(res, 400, 'invalid_magento_id', parsed.message);
        magentoId = parsed.id;
      }

      const locationSnap = await db.collection('locations').doc(locationId).get();
      if (!locationSnap.exists) return errorBody(res, 404, 'not_found', 'Location not found');
      const location = locationSnap.data() as Location;

      const page = await writeStorePage(db, {
        locationId,
        expectedVersion,
        authUser,
        entityName: `Store page ${location.storeNumber}`,
        reviewHref,
        websiteHref,
        magentoId,
      });
      return res.json({ data: page });
    } catch (error) {
      const mapped = mapTxError(error);
      if (mapped) return errorBody(res, mapped.status, mapped.code, mapped.message);
      console.error('Patch store page error:', error);
      return errorBody(res, 500, 'update_error', 'Failed to update the store page');
    }
  });

  router.post('/:locationId/visibility', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) return errorBody(res, 401, 'unauthorized', 'Not authenticated');
      if (authUser.role !== 'Admin') {
        return errorBody(res, 403, 'forbidden', 'Only an Admin can turn a store page on or off');
      }
      const { locationId } = req.params;
      const expectedVersion = parseExpectedVersion(req.body?.expectedVersion);
      if (expectedVersion === null) {
        return errorBody(res, 400, 'expected_version_required', 'expectedVersion is required');
      }
      if (typeof req.body?.enabled !== 'boolean') {
        return errorBody(res, 400, 'invalid_enabled', 'enabled must be true or false');
      }
      const enabled = req.body.enabled as boolean;

      const page = await db.runTransaction(async (tx) => {
        const locationRef = db.collection('locations').doc(locationId);
        const pageRef = db.collection('storePages').doc(locationId);
        const locationSnap = await tx.get(locationRef);
        if (!locationSnap.exists) throw new HttpError(404, 'not_found', 'Location not found');
        const location = locationSnap.data() as Location;
        if (location.kind !== 'store' || location.lifecycle !== 'active') {
          throw new HttpError(400, 'not_a_live_store', 'Store pages can only be turned on or off for active stores.');
        }
        const pageSnap = await tx.get(pageRef);
        const currentVersion = pageSnap.exists ? Number(pageSnap.data()?.version ?? 0) : 0;
        if (currentVersion !== expectedVersion) {
          throw new HttpError(409, 'version_conflict', 'This store page was updated. Reload and try again.');
        }
        const now = new Date().toISOString();
        const nextVersion = currentVersion + 1;
        const previous = pageSnap.exists ? pageSnap.data()?.pageEnabled === true : false;
        if (!pageSnap.exists) {
          tx.create(pageRef, {
            reviewUrl: null,
            magentoStoreId: null,
            pageEnabled: enabled,
            version: nextVersion,
            createdAt: now,
            updatedAt: now,
            updatedBy: authUser.uid,
          });
        } else {
          tx.update(pageRef, {
            pageEnabled: enabled,
            version: nextVersion,
            updatedAt: now,
            updatedBy: authUser.uid,
          });
        }
        const auditRef = db.collection('auditLog').doc();
        const entry = auditEntry(
          authUser,
          locationId,
          `Store page ${location.storeNumber}`,
          'update',
          [{ field: 'pageEnabled', oldValue: previous, newValue: enabled }],
          currentVersion,
          nextVersion,
        );
        tx.set(auditRef, { ...entry, id: auditRef.id, timestamp: now });
        return { pageEnabled: enabled, version: nextVersion, updatedAt: now };
      });
      return res.json({ data: page });
    } catch (error) {
      const mapped = mapTxError(error);
      if (mapped) return errorBody(res, mapped.status, mapped.code, mapped.message);
      console.error('Store page visibility error:', error);
      return errorBody(res, 500, 'update_error', 'Failed to update the store page');
    }
  });

  return router;
}

interface WriteInput {
  locationId: string;
  expectedVersion: number;
  authUser: AuthUser;
  entityName: string;
  reviewHref?: string | null;
  websiteHref?: string | null;
  magentoId?: string | null;
}

async function writeStorePage(db: Firestore, input: WriteInput): Promise<StorePageDoc> {
  return db.runTransaction(async (tx) => {
    // Do not read or write the locations document. Unrelated store edits must not conflict.
    const pageRef = db.collection('storePages').doc(input.locationId);
    const pageSnap = await tx.get(pageRef);
    const current = pageSnap.exists ? pageSnap.data() as StorePageDoc : null;
    const currentVersion = current ? Number(current.version ?? 0) : 0;
    if (currentVersion !== input.expectedVersion) {
      throw new HttpError(409, 'version_conflict', 'This store page was updated. Reload and try again.');
    }
    const oldMagento = current?.magentoStoreId ?? null;
    const nextMagento = input.magentoId !== undefined ? input.magentoId : oldMagento;
    let claimSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    let oldClaimSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    const claimRef = nextMagento && nextMagento !== oldMagento
      ? db.collection(MAGENTO_COLLECTION).doc(nextMagento)
      : null;
    const oldClaimRef = oldMagento && oldMagento !== nextMagento
      ? db.collection(MAGENTO_COLLECTION).doc(oldMagento)
      : null;
    if (claimRef) {
      claimSnap = await tx.get(claimRef);
      if (claimSnap.exists && claimSnap.data()?.locationId !== input.locationId) {
        throw new HttpError(409, 'magento_id_taken', 'That Magento store ID is already used by another store.');
      }
    }
    if (oldClaimRef) oldClaimSnap = await tx.get(oldClaimRef);

    const now = new Date().toISOString();
    const nextVersion = currentVersion + 1;
    const reviewUrl = input.reviewHref !== undefined ? input.reviewHref : (current?.reviewUrl ?? null);
    const websiteUrl = input.websiteHref !== undefined ? input.websiteHref : (current?.websiteUrl ?? null);
    const next: StorePageDoc = {
      reviewUrl,
      websiteUrl,
      magentoStoreId: nextMagento,
      pageEnabled: current?.pageEnabled === true,
      version: nextVersion,
      updatedAt: now,
      updatedBy: input.authUser.uid,
    };
    if (!pageSnap.exists) {
      tx.create(pageRef, { ...next, createdAt: now });
    } else {
      tx.update(pageRef, {
        reviewUrl,
        websiteUrl,
        magentoStoreId: nextMagento,
        pageEnabled: next.pageEnabled,
        version: nextVersion,
        updatedAt: now,
        updatedBy: input.authUser.uid,
      });
    }
    if (claimRef && claimSnap && !claimSnap.exists) {
      tx.create(claimRef, { locationId: input.locationId, createdAt: now });
    }
    if (oldClaimRef && oldClaimSnap?.exists && oldClaimSnap.data()?.locationId === input.locationId) {
      tx.delete(oldClaimRef);
    }
    const changes: AuditLogEntry['changes'] = [];
    if (input.reviewHref !== undefined) {
      changes.push({ field: 'reviewUrl', oldValue: current?.reviewUrl ?? null, newValue: input.reviewHref });
    }
    if (input.websiteHref !== undefined) {
      changes.push({ field: 'websiteUrl', oldValue: current?.websiteUrl ?? null, newValue: input.websiteHref });
    }
    if (input.magentoId !== undefined) {
      changes.push({ field: 'magentoStoreId', oldValue: oldMagento, newValue: nextMagento });
    }
    const auditRef = db.collection('auditLog').doc();
    const entry = auditEntry(input.authUser, input.locationId, input.entityName, 'update', changes, currentVersion, nextVersion);
    tx.set(auditRef, { ...entry, id: auditRef.id, timestamp: now });
    return next;
  });
}

export function registerStorePageDefaultRoutes(router: Router, db: Firestore): void {
  router.get('/store-page-defaults', async (_req: Request, res: Response) => {
    try {
      const snap = await db.collection('settings').doc('storePageDefaults').get();
      const data = snap.data();
      const parsed = data ? validateStorePageTiles(data.tiles) : null;
      const tiles = parsed?.ok ? parsed.tiles : EMPTY_STORE_PAGE_TILES;
      const findStore = validateFindStoreUrl(data?.findStoreUrl);
      const defaultImageUrl = validateDefaultStoreImageUrl(data?.defaultStoreImageUrl);
      return res.json({
        data: {
          version: snap.exists ? Number(data?.version ?? 0) : 0,
          updatedAt: data?.updatedAt ?? null,
          updatedBy: data?.updatedBy ?? null,
          tiles,
          findStoreUrl: findStore.ok ? findStore.href : null,
          defaultStoreImageUrl: defaultImageUrl.ok ? defaultImageUrl.href : null,
          defaultImage: {
            source: 'dynamic-qr',
            label: 'Company default image · Set by Shiekh',
          },
        },
      });
    } catch (error) {
      console.error('Get store page defaults error:', error);
      return errorBody(res, 500, 'get_error', 'Failed to load store page defaults');
    }
  });

  router.put('/store-page-defaults', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const expectedVersion = parseExpectedVersion(req.body?.expectedVersion);
      if (expectedVersion === null) {
        return errorBody(res, 400, 'expected_version_required', 'expectedVersion is required');
      }
      const parsed = validateStorePageTiles(req.body?.tiles);
      if (!parsed.ok) return errorBody(res, 400, 'invalid_tiles', parsed.message);
      const findStore = readFindStoreUrl(req.body?.findStoreUrl);
      if (findStore.action === 'invalid') return errorBody(res, 400, 'invalid_url', findStore.message);
      const defaultImageUrl = readDefaultStoreImageUrl(req.body?.defaultStoreImageUrl);
      if (defaultImageUrl.action === 'invalid') return errorBody(res, 400, 'invalid_url', defaultImageUrl.message);

      const saved = await db.runTransaction(async (tx) => {
        const ref = db.collection('settings').doc('storePageDefaults');
        const snap = await tx.get(ref);
        const currentVersion = snap.exists ? Number(snap.data()?.version ?? 0) : 0;
        if (currentVersion !== expectedVersion) {
          throw new HttpError(409, 'version_conflict', 'Store page defaults were updated. Reload and try again.');
        }
        const current = snap.data();
        const previousFind = typeof current?.findStoreUrl === 'string' ? current.findStoreUrl : null;
        const previousImage = typeof current?.defaultStoreImageUrl === 'string' ? current.defaultStoreImageUrl : null;
        const nextFind = findStore.action === 'keep' ? previousFind : findStore.action === 'clear' ? null : findStore.href;
        const nextImage = defaultImageUrl.action === 'keep' ? previousImage : defaultImageUrl.action === 'clear' ? null : defaultImageUrl.href;
        const now = new Date().toISOString();
        const nextVersion = currentVersion + 1;
        const doc = {
          tiles: parsed.tiles,
          findStoreUrl: nextFind,
          defaultStoreImageUrl: nextImage,
          version: nextVersion,
          updatedAt: now,
          updatedBy: authUser.uid,
        };
        const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [
          { field: 'tiles', oldValue: null, newValue: 'updated' },
        ];
        if (nextFind !== previousFind) {
          changes.push({ field: 'findStoreUrl', oldValue: previousFind, newValue: nextFind });
        }
        if (nextImage !== previousImage) {
          changes.push({ field: 'defaultStoreImageUrl', oldValue: previousImage, newValue: nextImage });
        }
        if (!snap.exists) tx.create(ref, doc);
        else tx.update(ref, doc);
        const auditRef = db.collection('auditLog').doc();
        tx.set(auditRef, {
          id: auditRef.id,
          timestamp: now,
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'update',
          entityType: 'store-page',
          entityId: 'defaults',
          entityName: 'Store page defaults',
          changes,
          previousVersion: currentVersion,
          newVersion: nextVersion,
        });
        return { ...doc, defaultImage: { source: 'dynamic-qr', label: 'Company default image · Set by Shiekh' } };
      });
      return res.json({ data: saved });
    } catch (error) {
      const mapped = mapTxError(error);
      if (mapped) return errorBody(res, mapped.status, mapped.code, mapped.message);
      console.error('Save store page defaults error:', error);
      return errorBody(res, 500, 'update_error', 'Failed to save store page defaults');
    }
  });
}

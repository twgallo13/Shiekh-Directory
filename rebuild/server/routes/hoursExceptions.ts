import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  Location,
  HoursException,
  AuthUser,
  AuditLogEntry,
} from '../../src/types';
import { hasPermission } from '../../src/lib/permissions';

interface Holiday {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  closed: boolean;
}

interface BulkPreviewResult {
  holiday: Holiday;
  targetStores: {
    id: string;
    storeNumber: string;
    name: string;
    state: string;
    alreadyHasException: boolean;
  }[];
  storesWithExisting: number;
  storesToCreate: number;
}

interface BulkApplyResult {
  success: boolean;
  created: number;
  skipped: number;
  errors: string[];
}

export function createHoursExceptionsRouter(db: Firestore): Router {
  const router = Router();

  router.get('/holidays', async (req: Request, res: Response) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const holidays = getHolidaysForYear(year);
      return res.json({ data: holidays });
    } catch (error) {
      console.error('Get holidays error:', error);
      return res.status(500).json({
        error: { code: 'get_error', message: 'Failed to get holidays', requestId: res.locals.requestId },
      });
    }
  });

  router.get('/locations/:locationId', async (req: Request, res: Response) => {
    try {
      const { locationId } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const exceptionsSnap = await db.collection(`locations/${locationId}/hoursExceptions`)
        .orderBy('startDate', 'asc')
        .get();

      const exceptions = exceptionsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as HoursException[];

      return res.json({ data: exceptions });
    } catch (error) {
      console.error('Get hours exceptions error:', error);
      return res.status(500).json({
        error: { code: 'get_error', message: 'Failed to get hours exceptions', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/locations/:locationId', async (req: Request, res: Response) => {
    try {
      const { locationId } = req.params;
      const authUser = res.locals.authUser as AuthUser;
      const { type, label, startDate, endDate, closed, intervals } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const permission = hasPermission(authUser, 'edit:hours', locationId);
      if (!permission.allowed) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'You don\'t have permission to edit hours', requestId: res.locals.requestId },
        });
      }

      const locationDoc = await db.collection('locations').doc(locationId).get();
      if (!locationDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Location not found', requestId: res.locals.requestId },
        });
      }

      const location = locationDoc.data() as Location;

      if (!label?.trim()) {
        return res.status(400).json({
          error: { code: 'invalid_label', message: 'Label is required', requestId: res.locals.requestId },
        });
      }

      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({
          error: { code: 'invalid_date', message: 'Start date is required (YYYY-MM-DD)', requestId: res.locals.requestId },
        });
      }

      const exceptionRef = db.collection(`locations/${locationId}/hoursExceptions`).doc();
      const exception: Omit<HoursException, 'id'> = {
        type: type || 'holiday',
        label: label.trim(),
        startDate,
        endDate: endDate || startDate,
        closed: closed !== false,
        intervals: intervals || [],
        source: 'manual',
      };

      await exceptionRef.set(exception);

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'location',
        entityId: locationId,
        entityName: `${location.storeNumber} ${location.name}`,
        changes: [
          { field: 'hoursException', newValue: label.trim() },
          { field: 'date', newValue: startDate },
          { field: 'closed', newValue: closed !== false },
        ],
      });

      return res.json({ data: { id: exceptionRef.id, ...exception } });
    } catch (error) {
      console.error('Create hours exception error:', error);
      return res.status(500).json({
        error: { code: 'create_error', message: 'Failed to create hours exception', requestId: res.locals.requestId },
      });
    }
  });

  router.delete('/locations/:locationId/:exceptionId', async (req: Request, res: Response) => {
    try {
      const { locationId, exceptionId } = req.params;
      const authUser = res.locals.authUser as AuthUser;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      const permission = hasPermission(authUser, 'edit:hours', locationId);
      if (!permission.allowed) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'You don\'t have permission to edit hours', requestId: res.locals.requestId },
        });
      }

      const exceptionRef = db.collection(`locations/${locationId}/hoursExceptions`).doc(exceptionId);
      const exceptionDoc = await exceptionRef.get();

      if (!exceptionDoc.exists) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Hours exception not found', requestId: res.locals.requestId },
        });
      }

      const exception = exceptionDoc.data() as HoursException;
      const locationDoc = await db.collection('locations').doc(locationId).get();
      const location = locationDoc.data() as Location;

      await exceptionRef.delete();

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'delete',
        entityType: 'location',
        entityId: locationId,
        entityName: `${location?.storeNumber || ''} ${location?.name || ''}`.trim(),
        changes: [
          { field: 'hoursException', oldValue: exception.label },
          { field: 'date', oldValue: exception.startDate },
        ],
      });

      return res.json({ data: { success: true } });
    } catch (error) {
      console.error('Delete hours exception error:', error);
      return res.status(500).json({
        error: { code: 'delete_error', message: 'Failed to delete hours exception', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/bulk/preview', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { holidayId, states, year } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (authUser.role !== 'Admin' && authUser.role !== 'Steward') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Admin and Steward can apply bulk holidays', requestId: res.locals.requestId },
        });
      }

      const holidayYear = year || new Date().getFullYear();
      const holidays = getHolidaysForYear(holidayYear);
      const holiday = holidays.find(h => h.id === holidayId);

      if (!holiday) {
        return res.status(400).json({
          error: { code: 'invalid_holiday', message: 'Holiday not found', requestId: res.locals.requestId },
        });
      }

      let locationsQuery = db.collection('locations')
        .where('lifecycle', '==', 'active')
        .where('kind', '==', 'store');

      const locationsSnap = await locationsQuery.get();
      const locations = locationsSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }) as Location)
        .filter(loc => !states || states.length === 0 || states.includes(loc.address.state));

      const targetStores: BulkPreviewResult['targetStores'] = [];
      let storesWithExisting = 0;

      for (const location of locations) {
        const exceptionsSnap = await db.collection(`locations/${location.id}/hoursExceptions`)
          .where('startDate', '==', holiday.date)
          .get();

        const alreadyHasException = !exceptionsSnap.empty;
        if (alreadyHasException) {
          storesWithExisting++;
        }

        targetStores.push({
          id: location.id,
          storeNumber: location.storeNumber,
          name: location.name,
          state: location.address.state,
          alreadyHasException,
        });
      }

      targetStores.sort((a, b) => {
        const numA = parseInt(a.storeNumber, 10) || 0;
        const numB = parseInt(b.storeNumber, 10) || 0;
        return numA - numB;
      });

      const result: BulkPreviewResult = {
        holiday,
        targetStores,
        storesWithExisting,
        storesToCreate: targetStores.length - storesWithExisting,
      };

      return res.json({ data: result });
    } catch (error) {
      console.error('Bulk preview error:', error);
      return res.status(500).json({
        error: { code: 'preview_error', message: 'Failed to preview bulk operation', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/bulk/apply', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { holidayId, states, year, skipExisting } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (authUser.role !== 'Admin' && authUser.role !== 'Steward') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Admin and Steward can apply bulk holidays', requestId: res.locals.requestId },
        });
      }

      const holidayYear = year || new Date().getFullYear();
      const holidays = getHolidaysForYear(holidayYear);
      const holiday = holidays.find(h => h.id === holidayId);

      if (!holiday) {
        return res.status(400).json({
          error: { code: 'invalid_holiday', message: 'Holiday not found', requestId: res.locals.requestId },
        });
      }

      const locationsSnap = await db.collection('locations')
        .where('lifecycle', '==', 'active')
        .where('kind', '==', 'store')
        .get();

      const locations = locationsSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }) as Location)
        .filter(loc => !states || states.length === 0 || states.includes(loc.address.state));

      const result: BulkApplyResult = {
        success: true,
        created: 0,
        skipped: 0,
        errors: [],
      };

      const batch = db.batch();
      const storesAffected: { id: string; storeNumber: string }[] = [];

      for (const location of locations) {
        try {
          const exceptionsSnap = await db.collection(`locations/${location.id}/hoursExceptions`)
            .where('startDate', '==', holiday.date)
            .get();

          if (!exceptionsSnap.empty) {
            if (skipExisting !== false) {
              result.skipped++;
              continue;
            }
            for (const doc of exceptionsSnap.docs) {
              batch.delete(doc.ref);
            }
          }

          const exceptionRef = db.collection(`locations/${location.id}/hoursExceptions`).doc();
          const exception: Omit<HoursException, 'id'> = {
            type: 'holiday',
            label: holiday.name,
            startDate: holiday.date,
            endDate: holiday.date,
            closed: holiday.closed,
            intervals: [],
            source: 'bulk',
          };

          batch.set(exceptionRef, exception);
          storesAffected.push({ id: location.id, storeNumber: location.storeNumber });
          result.created++;
        } catch (err) {
          result.errors.push(`Failed for store ${location.storeNumber}: ${err}`);
        }
      }

      await batch.commit();

      for (const store of storesAffected) {
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'create',
          entityType: 'location',
          entityId: store.id,
          entityName: `Holiday: ${holiday.name} for #${store.storeNumber}`,
          locationId: store.id,
          changes: [
            { field: 'hoursException', newValue: holiday.name },
            { field: 'date', newValue: holiday.date },
            { field: 'closed', newValue: holiday.closed },
          ],
        });
      }

      return res.json({ data: result });
    } catch (error) {
      console.error('Bulk apply error:', error);
      return res.status(500).json({
        error: { code: 'apply_error', message: 'Failed to apply bulk operation', requestId: res.locals.requestId },
      });
    }
  });

  router.delete('/bulk', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { holidayId, states, year } = req.body;

      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Not authenticated', requestId: res.locals.requestId },
        });
      }

      if (authUser.role !== 'Admin' && authUser.role !== 'Steward') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Admin and Steward can remove bulk holidays', requestId: res.locals.requestId },
        });
      }

      const holidayYear = year || new Date().getFullYear();
      const holidays = getHolidaysForYear(holidayYear);
      const holiday = holidays.find(h => h.id === holidayId);

      if (!holiday) {
        return res.status(400).json({
          error: { code: 'invalid_holiday', message: 'Holiday not found', requestId: res.locals.requestId },
        });
      }

      const locationsSnap = await db.collection('locations')
        .where('lifecycle', '==', 'active')
        .where('kind', '==', 'store')
        .get();

      const locations = locationsSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }) as Location)
        .filter(loc => !states || states.length === 0 || states.includes(loc.address.state));

      let deleted = 0;
      const batch = db.batch();

      for (const location of locations) {
        const exceptionsSnap = await db.collection(`locations/${location.id}/hoursExceptions`)
          .where('startDate', '==', holiday.date)
          .get();

        for (const doc of exceptionsSnap.docs) {
          batch.delete(doc.ref);
          deleted++;
        }
      }

      await batch.commit();

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'delete',
        entityType: 'location',
        entityId: 'bulk',
        entityName: `Bulk holiday removal: ${holiday.name}`,
        changes: [
          { field: 'holiday', oldValue: holiday.name },
          { field: 'date', oldValue: holiday.date },
          { field: 'states', oldValue: states?.join(', ') || 'all' },
          { field: 'deleted', oldValue: deleted.toString() },
        ],
      });

      return res.json({ data: { success: true, deleted } });
    } catch (error) {
      console.error('Bulk delete error:', error);
      return res.status(500).json({
        error: { code: 'delete_error', message: 'Failed to delete bulk operation', requestId: res.locals.requestId },
      });
    }
  });

  return router;
}

function getHolidaysForYear(year: number): Holiday[] {
  return [
    { id: 'new-years-day', name: "New Year's Day", date: `${year}-01-01`, closed: true },
    { id: 'mlk-day', name: 'Martin Luther King Jr. Day', date: getThirdMonday(year, 1), closed: true },
    { id: 'presidents-day', name: "Presidents' Day", date: getThirdMonday(year, 2), closed: true },
    { id: 'memorial-day', name: 'Memorial Day', date: getLastMonday(year, 5), closed: true },
    { id: 'juneteenth', name: 'Juneteenth', date: `${year}-06-19`, closed: true },
    { id: 'independence-day', name: 'Independence Day', date: `${year}-07-04`, closed: true },
    { id: 'labor-day', name: 'Labor Day', date: getFirstMonday(year, 9), closed: true },
    { id: 'columbus-day', name: 'Columbus Day', date: getSecondMonday(year, 10), closed: false },
    { id: 'veterans-day', name: 'Veterans Day', date: `${year}-11-11`, closed: false },
    { id: 'thanksgiving', name: 'Thanksgiving Day', date: getFourthThursday(year, 11), closed: true },
    { id: 'black-friday', name: 'Black Friday', date: getDayAfterThanksgiving(year), closed: false },
    { id: 'christmas-eve', name: 'Christmas Eve', date: `${year}-12-24`, closed: false },
    { id: 'christmas-day', name: 'Christmas Day', date: `${year}-12-25`, closed: true },
    { id: 'new-years-eve', name: "New Year's Eve", date: `${year}-12-31`, closed: false },
  ];
}

function formatDateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getFirstMonday(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  while (date.getUTCDay() !== 1) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return formatDateUTC(date);
}

function getSecondMonday(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  let mondays = 0;
  while (mondays < 2) {
    if (date.getUTCDay() === 1) {
      mondays++;
      if (mondays === 2) break;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return formatDateUTC(date);
}

function getThirdMonday(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  let mondays = 0;
  while (mondays < 3) {
    if (date.getUTCDay() === 1) {
      mondays++;
      if (mondays === 3) break;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return formatDateUTC(date);
}

function getLastMonday(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 0));
  while (date.getUTCDay() !== 1) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return formatDateUTC(date);
}

function getFourthThursday(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  let thursdays = 0;
  while (thursdays < 4) {
    if (date.getUTCDay() === 4) {
      thursdays++;
      if (thursdays === 4) break;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return formatDateUTC(date);
}

function getDayAfterThanksgiving(year: number): string {
  const thanksgiving = getFourthThursday(year, 11);
  const [y, m, d] = thanksgiving.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + 1));
  return formatDateUTC(date);
}

async function logAudit(
  db: Firestore,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<void> {
  const auditRef = db.collection('auditLog').doc();
  await auditRef.set({
    ...entry,
    id: auditRef.id,
    timestamp: new Date().toISOString(),
  });
}

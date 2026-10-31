import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { createHash, randomUUID } from 'crypto';
import type { AuthUser, Location, Person, Region, District, Assignment } from '../../src/types';
import { isAssignmentActive, getLocalDate } from '../utils/assignment';


interface ExportToken {
  token: string;
  userId: string;
  userRole: string;
  generatedAt: string;
  expiresAt: string;
  locationCount: number;
  digest: string;
}

const preparedExports = new Map<string, { token: ExportToken; csv: string; locations: ExportLocation[] }>();
const EXPORT_TOKEN_TTL_MS = 5 * 60_000;

interface ExportLocation {
  id: string;
  storeNumber: string;
  name: string;
  kind: string;
  address: string;
  suite: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  phoneFormatted: string;
  sharedInboxEmail: string;
  regionId: string;
  regionName: string;
  districtId: string;
  districtName: string;
  storeManager: string;
  storeManagerPhone: string;
  storeManagerMobile: string;
  districtManager: string;
  assistantStoreManagers: string[];
  keyHolders: string[];
  lifecycle: string;
}

function canViewMobilePhones(role: string): boolean {
  return ['Leader', 'Steward', 'Admin'].includes(role);
}

export function createExportsRouter(db: Firestore): Router {
  const router = Router();

  router.post('/locations/prepare', async (_req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
      }
      
      if (!['Leader', 'Steward', 'Admin'].includes(authUser.role)) {
        return res.status(403).json({ 
          error: { code: 'access_denied', message: 'Export access requires Leader, Steward, or Admin role' } 
        });
      }

      const [locationsSnap, peopleSnap, regionsSnap, districtsSnap, assignmentsSnap] = await Promise.all([
        db.collection('locations').where('lifecycle', '==', 'active').get(),
        db.collection('people').where('lifecycle', '==', 'active').get(),
        db.collection('regions').where('lifecycle', '==', 'active').get(),
        db.collection('districts').where('lifecycle', '==', 'active').get(),
        db.collection('assignments').get(),
      ]);

      const locations = locationsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Location));
      const people = new Map(peopleSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Person]));
      const regions = new Map(regionsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Region]));
      const districts = new Map(districtsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as District]));
      const assignments = assignmentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment));

      const exportLocations = locations
        .filter(loc => loc.kind === 'store')
        .sort((a, b) => {
          const numA = parseInt(a.storeNumber, 10);
          const numB = parseInt(b.storeNumber, 10);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.storeNumber.localeCompare(b.storeNumber);
        })
        .map(loc => mapExportLocation(loc, people, regions, districts, assignments, authUser.role));

      const storeNumbers = exportLocations.map(l => l.storeNumber);
      const digest = createHash('sha256').update(JSON.stringify(storeNumbers)).digest('hex');

      const now = new Date();
      const token: ExportToken = {
        token: randomUUID(),
        userId: authUser.uid,
        userRole: authUser.role,
        generatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + EXPORT_TOKEN_TTL_MS).toISOString(),
        locationCount: exportLocations.length,
        digest,
      };

      const csv = generateCsv(exportLocations, authUser.role);
      preparedExports.set(token.token, { token, csv, locations: exportLocations });
      cleanupExpiredExports();

      res.json({
        token: token.token,
        metadata: {
          locationCount: token.locationCount,
          generatedAt: token.generatedAt,
          expiresAt: token.expiresAt,
          digest,
          filename: `shiekh_store_directory_${now.toISOString().slice(0, 10)}.csv`,
        },
      });
    } catch (error) {
      console.error('Export prepare error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to prepare export' } });
    }
  });

  router.get('/locations/:token/csv', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
      }

      const { token } = req.params;
      const prepared = preparedExports.get(token);

      if (!prepared) {
        return res.status(410).json({ error: { code: 'expired', message: 'Export expired. Please prepare again.' } });
      }

      if (prepared.token.userId !== authUser.uid) {
        return res.status(403).json({ error: { code: 'forbidden', message: 'Export belongs to another user' } });
      }

      if (new Date(prepared.token.expiresAt).getTime() < Date.now()) {
        preparedExports.delete(token);
        return res.status(410).json({ error: { code: 'expired', message: 'Export expired. Please prepare again.' } });
      }

      preparedExports.delete(token);

      const filename = `shiekh_store_directory_${new Date().toISOString().slice(0, 10)}.csv`;
      res
        .type('text/csv; charset=utf-8')
        .set('Content-Disposition', `attachment; filename="${filename}"`)
        .set('X-Location-Export-Count', String(prepared.token.locationCount))
        .send(prepared.csv);
    } catch (error) {
      console.error('Export download error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to download export' } });
    }
  });

  router.get('/locations/:token/pdf-data', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      if (!authUser) {
        return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
      }

      const { token } = req.params;
      const prepared = preparedExports.get(token);

      if (!prepared) {
        return res.status(410).json({ error: { code: 'expired', message: 'Export expired. Please prepare again.' } });
      }

      if (prepared.token.userId !== authUser.uid) {
        return res.status(403).json({ error: { code: 'forbidden', message: 'Export belongs to another user' } });
      }

      if (new Date(prepared.token.expiresAt).getTime() < Date.now()) {
        preparedExports.delete(token);
        return res.status(410).json({ error: { code: 'expired', message: 'Export expired. Please prepare again.' } });
      }

      const groupedByDistrict = new Map<string, { districtName: string; districtManager: string; stores: ExportLocation[] }>();

      for (const loc of prepared.locations) {
        const key = loc.districtId || 'unassigned';
        if (!groupedByDistrict.has(key)) {
          groupedByDistrict.set(key, {
            districtName: loc.districtName || 'Unassigned',
            districtManager: loc.districtManager,
            stores: [],
          });
        }
        groupedByDistrict.get(key)!.stores.push(loc);
      }

      const districts = Array.from(groupedByDistrict.entries())
        .sort(([a], [b]) => {
          if (a === 'unassigned') return 1;
          if (b === 'unassigned') return -1;
          return a.localeCompare(b);
        })
        .map(([id, data]) => ({
          id,
          name: data.districtName,
          districtManager: data.districtManager,
          stores: data.stores,
        }));

      res.json({
        generatedAt: prepared.token.generatedAt,
        locationCount: prepared.token.locationCount,
        canViewMobilePhones: canViewMobilePhones(authUser.role),
        districts,
      });
    } catch (error) {
      console.error('PDF data error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to get PDF data' } });
    }
  });

  return router;
}

function mapExportLocation(
  location: Location,
  people: Map<string, Person>,
  regions: Map<string, Region>,
  districts: Map<string, District>,
  assignments: Assignment[],
  userRole: string
): ExportLocation {
  const region = regions.get(location.regionId);
  const district = districts.get(location.districtId);
  const localDate = getLocalDate(location.timeZone);

  const locationAssignments = assignments.filter(a =>
    a.scopeType === 'location' && a.scopeId === location.id && isAssignmentActive(a, localDate)
  );
  const districtAssignments = assignments.filter(a =>
    a.scopeType === 'district' && a.scopeId === location.districtId && isAssignmentActive(a, localDate)
  );

  const smAssignment = locationAssignments.find(a => a.role === 'SM' && a.slot === 'primary');
  const asmAssignments = locationAssignments.filter(a => a.role === 'ASM');
  const khAssignments = locationAssignments.filter(a => a.role === 'KH');
  const dmAssignment = districtAssignments.find(a => a.role === 'DM');

  const smPerson = smAssignment ? people.get(smAssignment.personId) : undefined;
  const dmPerson = dmAssignment ? people.get(dmAssignment.personId) : undefined;

  const showMobile = canViewMobilePhones(userRole);

  return {
    id: location.id,
    storeNumber: location.storeNumber,
    name: location.name,
    kind: location.kind,
    address: location.address.street,
    suite: location.address.suite || '',
    city: location.address.city,
    state: location.address.state,
    zip: location.address.zip,
    phone: location.mainPhone,
    phoneFormatted: formatPhone(location.mainPhone),
    sharedInboxEmail: location.sharedInboxEmail || '',
    regionId: region?.code || '',
    regionName: region?.name || '',
    districtId: district?.code || '',
    districtName: district?.name || '',
    storeManager: smPerson?.fullName || '',
    storeManagerPhone: smPerson?.workPhone || '',
    storeManagerMobile: showMobile ? (smPerson?.mobilePhone || '') : '',
    districtManager: dmPerson?.fullName || '',
    assistantStoreManagers: asmAssignments
      .map(a => people.get(a.personId)?.fullName)
      .filter((name): name is string => !!name),
    keyHolders: khAssignments
      .map(a => people.get(a.personId)?.fullName)
      .filter((name): name is string => !!name),
    lifecycle: location.lifecycle,
  };
}

function formatPhone(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    const digits = cleaned.slice(1);
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

function generateCsv(locations: ExportLocation[], userRole: string): string {
  const showMobile = canViewMobilePhones(userRole);
  
  const headers = [
    'StoreNumber',
    'StoreName',
    'Type',
    'Address',
    'Suite',
    'City',
    'State',
    'ZipCode',
    'Phone',
    'LocationInboxEmail',
    'RegionId',
    'RegionName',
    'DistrictId',
    'DistrictName',
    'StoreManager',
    'StoreManagerPhone',
    ...(showMobile ? ['StoreManagerMobile'] : []),
    'DistrictManager',
    'AssistantStoreManagers',
    'KeyHolders',
    'OperationalStatus',
  ];

  const rows = locations.map(loc => [
    formatStoreNumberForExcel(loc.storeNumber),
    escapeCsvValue(loc.name),
    escapeCsvValue(loc.kind),
    escapeCsvValue(loc.address),
    escapeCsvValue(loc.suite),
    escapeCsvValue(loc.city),
    escapeCsvValue(loc.state),
    escapeCsvValue(loc.zip),
    escapeCsvValue(loc.phoneFormatted),
    escapeCsvValue(loc.sharedInboxEmail),
    escapeCsvValue(loc.regionId),
    escapeCsvValue(loc.regionName),
    escapeCsvValue(loc.districtId),
    escapeCsvValue(loc.districtName),
    escapeCsvValue(loc.storeManager),
    escapeCsvValue(formatPhoneForCsv(loc.storeManagerPhone)),
    ...(showMobile ? [escapeCsvValue(formatPhoneForCsv(loc.storeManagerMobile))] : []),
    escapeCsvValue(loc.districtManager),
    escapeCsvValue(loc.assistantStoreManagers.join('; ')),
    escapeCsvValue(loc.keyHolders.join('; ')),
    escapeCsvValue(loc.lifecycle === 'active' ? 'Active' : loc.lifecycle),
  ]);

  const bom = '\ufeff';
  return bom + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}

function formatStoreNumberForExcel(storeNumber: string): string {
  return `="${storeNumber}"`;
}

function formatPhoneForCsv(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    const digits = cleaned.slice(1);
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

function escapeCsvValue(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  if (/^[=@\-\t]/.test(value)) {
    return `"'${value}"`;
  }
  return value;
}

function cleanupExpiredExports() {
  const now = Date.now();
  for (const [token, prepared] of preparedExports) {
    if (new Date(prepared.token.expiresAt).getTime() < now) {
      preparedExports.delete(token);
    }
  }
}

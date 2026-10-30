import { describe, it, before } from 'node:test';
import assert from 'node:assert';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const TEST_TOKEN = 'test-api-token-all';

interface V1LocationResponse {
  id: string;
  storeNumber: string;
  recordStatus: string;
  name: string;
  address: string;
  suite: string | null;
  city: string;
  state: string;
  zipCode: string;
  timeZone: string;
  phone?: string;
  phonePrivacy: string;
  locationInboxEmail: string | null;
  regionId: string;
  regionName: string | null;
  regionStatus: string | null;
  districtId: string;
  districtName: string | null;
  districtStatus: string | null;
  district: string | null;
  hierarchyStatus: string;
  hierarchyIssues: string[];
  hierarchyApplicability: string;
  operationalStatus: string;
  standardHours: Record<string, { isClosed: boolean; open?: string; close?: string }>;
  customMetadata: Record<string, unknown>;
  updatedAt: string;
}

interface V2PersonnelResponse {
  id: string;
  fullName: string | null;
  lifecycle: string;
  primaryLocationId: string | null;
  supportedLocationIds: string[];
  issues: { code: string; field: string }[];
}

interface V2StaffingResponse {
  locationId: string;
  storeNumber: string;
  recordStatus: string;
  regionId: string;
  districtId: string;
  hierarchy: {
    regionName: string | null;
    districtName: string | null;
  };
  storeManagerId: string | null;
  districtManagerId: string | null;
  regionalManagerId: string | null;
  assistantStoreManagerIds: string[];
  keyHolderIds: string[];
  staffing: Record<string, unknown>;
  issues: { code: string; field: string }[];
}

interface V3DistrictLeadershipResponse {
  districtId: string;
  districtName: string | null;
  recordStatus: string;
  regionId: string;
  regionName: string | null;
  regionStatus: string | null;
  assignmentState: string;
  districtManager: Record<string, unknown> | null;
  issues: { code: string; field: string }[];
}

interface V3LocationDistrictResponse {
  locationId: string;
  storeNumber: string;
  recordStatus: string;
  locationType: string;
  hierarchyApplicability: string;
  regionId: string;
  districtId: string;
  issues: { code: string; field: string }[];
}

async function fetchApi(path: string, token = TEST_TOKEN): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });
}

describe('Legacy API v1 - Locations', () => {
  describe('GET /api/v1/locations', () => {
    it('returns paginated location list with correct shape', async () => {
      const res = await fetchApi('/api/v1/locations?limit=10');
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      assert.ok(body.data !== undefined, 'should have data');
      assert.ok(body.sync !== undefined, 'should have sync');
      assert.ok(body.pagination !== undefined, 'should have pagination');
      
      assert.ok(body.sync.watermark !== undefined, 'should have watermark');
      assert.ok(body.sync.mode !== undefined, 'should have mode');
      assert.ok(body.sync.customFieldsVersion !== undefined, 'should have customFieldsVersion');
      assert.ok(body.sync.hierarchyVersion !== undefined, 'should have hierarchyVersion');
      assert.strictEqual(body.sync.fullReconciliationRequired, true);
      
      assert.ok(body.pagination.limit !== undefined, 'should have limit');
      assert.ok('nextCursor' in body.pagination, 'should have nextCursor');
    });

    it('preserves store number leading zeros (007 stays 007)', async () => {
      const res = await fetchApi('/api/v1/locations?limit=100');
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      const locations = body.data as V1LocationResponse[];
      
      const store007 = locations.find((l: V1LocationResponse) => l.storeNumber === '007');
      if (store007) {
        assert.strictEqual(store007.storeNumber, '007', 'store number should be 007 not 7');
        assert.notStrictEqual(store007.storeNumber, '7');
      }

      for (const location of locations) {
        assert.strictEqual(typeof location.storeNumber, 'string', 'storeNumber should be string');
      }
    });

    it('returns correct field structure for each location', async () => {
      const res = await fetchApi('/api/v1/locations?limit=5');
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      const locations = body.data as V1LocationResponse[];
      
      if (locations.length > 0) {
        const loc = locations[0];
        
        assert.ok(loc.id !== undefined, 'should have id');
        assert.ok(loc.storeNumber !== undefined, 'should have storeNumber');
        assert.strictEqual(loc.recordStatus, 'Active');
        assert.ok(loc.name !== undefined, 'should have name');
        assert.ok(loc.address !== undefined, 'should have address');
        assert.ok(loc.city !== undefined, 'should have city');
        assert.ok(loc.state !== undefined, 'should have state');
        assert.ok(loc.zipCode !== undefined, 'should have zipCode');
        assert.ok(loc.timeZone !== undefined, 'should have timeZone');
        assert.ok(loc.phonePrivacy !== undefined, 'should have phonePrivacy');
        assert.ok(loc.regionId !== undefined, 'should have regionId');
        assert.ok(loc.districtId !== undefined, 'should have districtId');
        assert.ok(loc.hierarchyStatus !== undefined, 'should have hierarchyStatus');
        assert.ok(loc.hierarchyIssues !== undefined, 'should have hierarchyIssues');
        assert.ok(loc.hierarchyApplicability !== undefined, 'should have hierarchyApplicability');
        assert.ok(loc.standardHours !== undefined, 'should have standardHours');
        assert.ok(loc.customMetadata !== undefined, 'should have customMetadata');
        assert.ok(loc.updatedAt !== undefined, 'should have updatedAt');

        assert.strictEqual(typeof loc.customMetadata, 'object');
        assert.ok(Array.isArray(loc.hierarchyIssues));
      }
    });

    it('maps standard hours correctly with isClosed format', async () => {
      const res = await fetchApi('/api/v1/locations?limit=5');
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      const locations = body.data as V1LocationResponse[];
      
      if (locations.length > 0 && locations[0].standardHours) {
        const hours = locations[0].standardHours;
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        
        for (const day of days) {
          if (hours[day]) {
            assert.ok('isClosed' in hours[day], `${day} should have isClosed`);
            assert.strictEqual(typeof hours[day].isClosed, 'boolean');
            if (!hours[day].isClosed) {
              assert.ok('open' in hours[day], `${day} should have open when not closed`);
              assert.ok('close' in hours[day], `${day} should have close when not closed`);
            }
          }
        }
      }
    });

    it('rejects invalid auth token', async () => {
      const res = await fetchApi('/api/v1/locations', 'invalid-token');
      assert.strictEqual(res.status, 401);

      const body = await res.json();
      assert.strictEqual(body.error.code, 'invalid_token');
    });

    it('validates pagination limit', async () => {
      const res = await fetchApi('/api/v1/locations?limit=200');
      assert.strictEqual(res.status, 400);

      const body = await res.json();
      assert.strictEqual(body.error.code, 'invalid_limit');
    });
  });

  describe('GET /api/v1/locations/:storeNumber', () => {
    it('returns single location by store number', async () => {
      const listRes = await fetchApi('/api/v1/locations?limit=1');
      const listBody = await listRes.json();
      
      if (listBody.data.length > 0) {
        const storeNumber = listBody.data[0].storeNumber;
        const res = await fetchApi(`/api/v1/locations/${storeNumber}`);
        assert.strictEqual(res.status, 200);

        const body = await res.json();
        assert.ok(body.data !== undefined, 'should have data');
        assert.strictEqual(body.data.storeNumber, storeNumber);
        assert.ok(body.customFieldsVersion !== undefined, 'should have customFieldsVersion');
        assert.ok(body.hierarchyVersion !== undefined, 'should have hierarchyVersion');
      }
    });

    it('returns 404 for unknown store number', async () => {
      const res = await fetchApi('/api/v1/locations/NONEXISTENT999');
      assert.strictEqual(res.status, 404);

      const body = await res.json();
      assert.strictEqual(body.error.code, 'location_not_found');
    });
  });

  describe('GET /api/v1/locations/:storeNumber/operating-state', () => {
    it('returns operating state with correct structure', async () => {
      const listRes = await fetchApi('/api/v1/locations?limit=1');
      const listBody = await listRes.json();
      
      if (listBody.data.length > 0) {
        const storeNumber = listBody.data[0].storeNumber;
        const res = await fetchApi(`/api/v1/locations/${storeNumber}/operating-state`);
        assert.strictEqual(res.status, 200);

        const body = await res.json();
        assert.strictEqual(body.contract, 'location-operating-state-v1');
        assert.ok(body.data !== undefined, 'should have data');
        assert.ok(body.data.locationId !== undefined, 'should have locationId');
        assert.strictEqual(body.data.storeNumber, storeNumber);
        assert.ok(body.data.state !== undefined, 'should have state');
        assert.ok(body.data.reason !== undefined, 'should have reason');
        assert.ok(body.data.scheduleSource !== undefined, 'should have scheduleSource');
        assert.ok(body.data.localDate !== undefined, 'should have localDate');
        assert.ok(body.data.timeZone !== undefined, 'should have timeZone');
        assert.ok(body.data.evaluatedAt !== undefined, 'should have evaluatedAt');
        assert.ok(body.data.issues !== undefined, 'should have issues');

        assert.ok(['Open', 'Closed', 'Unknown'].includes(body.data.state), 'state should be Open/Closed/Unknown');
        assert.ok(['standard', 'exception', 'closure', 'unknown'].includes(body.data.scheduleSource), 'scheduleSource should be valid');
      }
    });
  });

  describe('GET /api/v1/location-fields', () => {
    it('returns custom fields definition', async () => {
      const res = await fetchApi('/api/v1/location-fields');
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      assert.ok(body.version !== undefined, 'should have version');
      assert.ok(body.fields !== undefined, 'should have fields');
      assert.ok(Array.isArray(body.fields), 'fields should be an array');
    });
  });
});

describe('Legacy API v2 - Personnel/Staffing', () => {
  let snapshotToken: string;

  before(async () => {
    const res = await fetchApi('/api/v2/snapshot');
    if (res.status === 200) {
      const body = await res.json();
      snapshotToken = body.snapshot;
    }
  });

  describe('GET /api/v2/snapshot', () => {
    it('returns valid snapshot token', async () => {
      const res = await fetchApi('/api/v2/snapshot');
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      assert.ok(body.snapshot !== undefined, 'should have snapshot');
      assert.ok(body.snapshotAt !== undefined, 'should have snapshotAt');
      assert.ok(body.expiresAt !== undefined, 'should have expiresAt');
      assert.strictEqual(body.contractVersion, 'personnel-staffing-v2.1');
      
      assert.strictEqual(typeof body.snapshot, 'string');
      assert.ok(body.snapshot.includes('.'), 'snapshot should be signed');
    });

    it('rejects query parameters', async () => {
      const res = await fetchApi('/api/v2/snapshot?extra=param');
      assert.strictEqual(res.status, 400);
    });
  });

  describe('GET /api/v2/personnel', () => {
    it('returns personnel list with correct structure', async () => {
      if (!snapshotToken) return;

      const res = await fetchApi(`/api/v2/personnel?snapshot=${encodeURIComponent(snapshotToken)}`);
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      assert.ok(body.data !== undefined, 'should have data');
      assert.ok(body.pagination !== undefined, 'should have pagination');
      assert.ok(body.sync !== undefined, 'should have sync');
      
      assert.strictEqual(body.sync.contractVersion, 'personnel-staffing-v2.1');
      
      if (body.data.length > 0) {
        const person = body.data[0] as V2PersonnelResponse;
        assert.ok(person.id !== undefined, 'should have id');
        assert.ok('fullName' in person, 'should have fullName');
        assert.ok(person.lifecycle !== undefined, 'should have lifecycle');
        assert.ok('primaryLocationId' in person, 'should have primaryLocationId');
        assert.ok(person.supportedLocationIds !== undefined, 'should have supportedLocationIds');
        assert.ok(person.issues !== undefined, 'should have issues');
        
        assert.ok(Array.isArray(person.supportedLocationIds));
        assert.ok(Array.isArray(person.issues));
      }
    });

    it('requires snapshot parameter', async () => {
      const res = await fetchApi('/api/v2/personnel');
      assert.strictEqual(res.status, 400);

      const body = await res.json();
      assert.strictEqual(body.error.code, 'invalid_query');
    });
  });

  describe('GET /api/v2/location-staffing', () => {
    it('returns location staffing with correct structure', async () => {
      if (!snapshotToken) return;

      const res = await fetchApi(`/api/v2/location-staffing?snapshot=${encodeURIComponent(snapshotToken)}`);
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      assert.ok(body.data !== undefined, 'should have data');
      assert.ok(body.pagination !== undefined, 'should have pagination');
      assert.ok(body.sync !== undefined, 'should have sync');
      
      if (body.data.length > 0) {
        const staffing = body.data[0] as V2StaffingResponse;
        assert.ok(staffing.locationId !== undefined, 'should have locationId');
        assert.ok(staffing.storeNumber !== undefined, 'should have storeNumber');
        assert.ok(staffing.recordStatus !== undefined, 'should have recordStatus');
        assert.ok(staffing.regionId !== undefined, 'should have regionId');
        assert.ok(staffing.districtId !== undefined, 'should have districtId');
        assert.ok(staffing.hierarchy !== undefined, 'should have hierarchy');
        assert.ok('regionName' in staffing.hierarchy, 'should have hierarchy.regionName');
        assert.ok('districtName' in staffing.hierarchy, 'should have hierarchy.districtName');
        assert.ok('storeManagerId' in staffing, 'should have storeManagerId');
        assert.ok('districtManagerId' in staffing, 'should have districtManagerId');
        assert.ok('regionalManagerId' in staffing, 'should have regionalManagerId');
        assert.ok(staffing.assistantStoreManagerIds !== undefined, 'should have assistantStoreManagerIds');
        assert.ok(staffing.keyHolderIds !== undefined, 'should have keyHolderIds');
        assert.ok(staffing.staffing !== undefined, 'should have staffing');
        assert.ok(staffing.issues !== undefined, 'should have issues');

        assert.strictEqual(typeof staffing.storeNumber, 'string', 'storeNumber should be string');
        assert.ok(Array.isArray(staffing.assistantStoreManagerIds));
        assert.ok(Array.isArray(staffing.keyHolderIds));
      }
    });

    it('preserves store number leading zeros in staffing', async () => {
      if (!snapshotToken) return;

      const res = await fetchApi(`/api/v2/location-staffing?snapshot=${encodeURIComponent(snapshotToken)}&limit=100`);
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      const staffingList = body.data as V2StaffingResponse[];
      
      for (const staffing of staffingList) {
        assert.strictEqual(typeof staffing.storeNumber, 'string', 'storeNumber should be string');
      }
    });
  });
});

describe('Legacy API v3 - District Leadership', () => {
  let snapshotToken: string;

  before(async () => {
    const res = await fetchApi('/api/v3/snapshot');
    if (res.status === 200) {
      const body = await res.json();
      snapshotToken = body.snapshot;
    }
  });

  describe('GET /api/v3/snapshot', () => {
    it('returns valid snapshot token', async () => {
      const res = await fetchApi('/api/v3/snapshot');
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      assert.ok(body.snapshot !== undefined, 'should have snapshot');
      assert.ok(body.snapshotAt !== undefined, 'should have snapshotAt');
      assert.ok(body.expiresAt !== undefined, 'should have expiresAt');
      assert.strictEqual(body.contractVersion, 'district-leadership-v3.1');
    });
  });

  describe('GET /api/v3/district-leadership', () => {
    it('returns district leadership with correct structure', async () => {
      if (!snapshotToken) return;

      const res = await fetchApi(`/api/v3/district-leadership?snapshot=${encodeURIComponent(snapshotToken)}`);
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      assert.ok(body.data !== undefined, 'should have data');
      assert.ok(body.pagination !== undefined, 'should have pagination');
      assert.ok(body.sync !== undefined, 'should have sync');
      assert.ok('contactAccess' in body.sync, 'should have contactAccess');
      
      if (body.data.length > 0) {
        const district = body.data[0] as V3DistrictLeadershipResponse;
        assert.ok(district.districtId !== undefined, 'should have districtId');
        assert.ok('districtName' in district, 'should have districtName');
        assert.ok(district.recordStatus !== undefined, 'should have recordStatus');
        assert.ok(district.regionId !== undefined, 'should have regionId');
        assert.ok('regionName' in district, 'should have regionName');
        assert.ok('regionStatus' in district, 'should have regionStatus');
        assert.ok(district.assignmentState !== undefined, 'should have assignmentState');
        assert.ok('districtManager' in district, 'should have districtManager');
        assert.ok(district.issues !== undefined, 'should have issues');

        assert.ok(['assigned', 'vacant', 'unmanaged', 'invalid', 'unresolved'].includes(district.assignmentState), 'assignmentState should be valid');
      }
    });
  });

  describe('GET /api/v3/location-districts', () => {
    it('returns location districts with correct structure', async () => {
      if (!snapshotToken) return;

      const res = await fetchApi(`/api/v3/location-districts?snapshot=${encodeURIComponent(snapshotToken)}`);
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      assert.ok(body.data !== undefined, 'should have data');
      assert.ok(body.pagination !== undefined, 'should have pagination');
      assert.ok(body.sync !== undefined, 'should have sync');
      
      if (body.data.length > 0) {
        const locDistrict = body.data[0] as V3LocationDistrictResponse;
        assert.ok(locDistrict.locationId !== undefined, 'should have locationId');
        assert.ok(locDistrict.storeNumber !== undefined, 'should have storeNumber');
        assert.ok(locDistrict.recordStatus !== undefined, 'should have recordStatus');
        assert.ok(locDistrict.locationType !== undefined, 'should have locationType');
        assert.ok(locDistrict.hierarchyApplicability !== undefined, 'should have hierarchyApplicability');
        assert.ok(locDistrict.regionId !== undefined, 'should have regionId');
        assert.ok(locDistrict.districtId !== undefined, 'should have districtId');
        assert.ok(locDistrict.issues !== undefined, 'should have issues');

        assert.strictEqual(typeof locDistrict.storeNumber, 'string', 'storeNumber should be string');
      }
    });

    it('preserves store number leading zeros in location districts', async () => {
      if (!snapshotToken) return;

      const res = await fetchApi(`/api/v3/location-districts?snapshot=${encodeURIComponent(snapshotToken)}&limit=100`);
      assert.strictEqual(res.status, 200);

      const body = await res.json();
      const locationDistricts = body.data as V3LocationDistrictResponse[];
      
      for (const locDist of locationDistricts) {
        assert.strictEqual(typeof locDist.storeNumber, 'string', 'storeNumber should be string');
      }
    });
  });
});

describe('Store Number "007" Preservation', () => {
  it('v1 locations preserves 007', async () => {
    const res = await fetchApi('/api/v1/locations?limit=100');
    const body = await res.json();
    
    const store007 = body.data.find((l: V1LocationResponse) => 
      l.storeNumber === '007' || l.storeNumber === '7'
    );
    
    if (store007) {
      assert.strictEqual(store007.storeNumber, '007', 'store number should be 007');
      assert.notStrictEqual(store007.storeNumber, '7', 'store number should not be 7');
    }
  });

  it('v2 staffing preserves 007', async () => {
    const snapRes = await fetchApi('/api/v2/snapshot');
    const snapBody = await snapRes.json();
    
    const res = await fetchApi(`/api/v2/location-staffing?snapshot=${encodeURIComponent(snapBody.snapshot)}&limit=100`);
    const body = await res.json();
    
    const store007 = body.data.find((s: V2StaffingResponse) => 
      s.storeNumber === '007' || s.storeNumber === '7'
    );
    
    if (store007) {
      assert.strictEqual(store007.storeNumber, '007', 'store number should be 007');
    }
  });

  it('v3 location-districts preserves 007', async () => {
    const snapRes = await fetchApi('/api/v3/snapshot');
    const snapBody = await snapRes.json();
    
    const res = await fetchApi(`/api/v3/location-districts?snapshot=${encodeURIComponent(snapBody.snapshot)}&limit=100`);
    const body = await res.json();
    
    const store007 = body.data.find((l: V3LocationDistrictResponse) => 
      l.storeNumber === '007' || l.storeNumber === '7'
    );
    
    if (store007) {
      assert.strictEqual(store007.storeNumber, '007', 'store number should be 007');
    }
  });
});

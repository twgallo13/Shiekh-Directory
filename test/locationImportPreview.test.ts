import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'csv-parse/sync';
import { buildLocationImportTemplate, LOCATION_IMPORT_COLUMNS, previewLocationImport } from '../src/lib/locationImportPreview';
import type { DirectorySeed } from '../src/lib/directorySeed';

const baseLocation = {
  id: 'loc-007', storeNumber: '007', name: 'Original Store', type: 'Street / Standalone Location' as const,
  address: '7 Main Street', city: 'Los Angeles', state: 'CA', zipCode: '90001', phone: '555-0100',
  timeZone: 'America/Los_Angeles', hierarchyApplicability: 'Applicable' as const, regionId: 'reg-west', districtId: 'dist-1',
  operationalStatus: 'Open — Normal Operations' as const, recordStatus: 'Active' as const, standardHours: {} as DirectorySeed['locations'][number]['standardHours'],
};

const snapshot: Pick<DirectorySeed, 'locations' | 'people' | 'regions' | 'districts'> = {
  locations: [baseLocation],
  people: [
    { id: 'person-active', fullName: 'Active Person', status: 'Active' },
    { id: 'person-inactive', fullName: 'Inactive Person', status: 'Inactive' },
  ],
  regions: [{ id: 'reg-west', name: 'West', status: 'Active' }],
  districts: [{ id: 'dist-1', name: 'District 1', regionId: 'reg-west', status: 'Active' }],
};

describe('Location CSV import preview', () => {
  it('downloads the exact supported locations-v1 header', () => {
    const [headers] = parse(buildLocationImportTemplate()) as string[][];
    assert.deepEqual(headers, LOCATION_IMPORT_COLUMNS);
  });

  it('shows exact updates while preserving blank fields and without mutating the snapshot', () => {
    const before = structuredClone(snapshot);
    const result = previewLocationImport(csvRow({ LocationId: 'loc-007', StoreNumber: '007', StoreName: 'Renamed Store' }), snapshot);
    assert.deepEqual(result.summary, { totalRows: 1, additions: 0, updates: 1, unchanged: 0, blocked: 0 });
    assert.deepEqual(result.rows[0].changes, [{ field: 'name', before: 'Original Store', after: 'Renamed Store' }]);
    assert.deepEqual(snapshot, before);
  });

  it('blocks duplicate CSV identities, invalid hierarchy, and missing or inactive Person references', () => {
    const csv = [
      LOCATION_IMPORT_COLUMNS.join(','),
      values({ LocationId: 'loc-new-1', StoreNumber: '008', StoreName: 'New Store', Type: 'Street / Standalone Location', Address: '8 Main', City: 'LA', State: 'CA', ZipCode: '90002', Phone: '555-0101', TimeZone: 'America/Los_Angeles', HierarchyApplicability: 'Applicable', RegionId: 'reg-west', DistrictId: 'dist-missing', StoreManagerId: 'person-missing', OperationalStatus: 'Open — Normal Operations', RecordStatus: 'Active' }),
      values({ LocationId: 'loc-new-2', StoreNumber: '0008', StoreName: 'Duplicate Store', Type: 'Street / Standalone Location', Address: '9 Main', City: 'LA', State: 'CA', ZipCode: '90003', Phone: '555-0102', TimeZone: 'America/Los_Angeles', HierarchyApplicability: 'Applicable', RegionId: 'reg-west', DistrictId: 'dist-1', StoreManagerId: 'person-inactive', OperationalStatus: 'Open — Normal Operations', RecordStatus: 'Active' }),
    ].join('\r\n');
    const result = previewLocationImport(csv, snapshot);
    assert.equal(result.summary.blocked, 2);
    const codes = result.rows.flatMap(row => row.issues.map(issue => issue.code));
    assert.ok(codes.includes('duplicate_csv_identity'));
    assert.ok(codes.includes('invalid_hierarchy'));
    assert.ok(codes.includes('missing_person_reference'));
    assert.ok(codes.includes('inactive_person_reference'));
  });

  it('does not silently match an unknown LocationId to an existing store number', () => {
    const result = previewLocationImport(csvRow({ LocationId: 'wrong-id', StoreNumber: '007', StoreName: 'Wrong Match' }), snapshot);
    assert.equal(result.rows[0].action, 'blocked');
    assert.ok(result.rows[0].issues.some(issue => issue.code === 'conflicting_identity'));
  });
});

function csvRow(overrides: Partial<Record<typeof LOCATION_IMPORT_COLUMNS[number], string>>) {
  return `${LOCATION_IMPORT_COLUMNS.join(',')}\r\n${values(overrides)}\r\n`;
}

function values(overrides: Partial<Record<typeof LOCATION_IMPORT_COLUMNS[number], string>>) {
  const row = { SchemaVersion: 'locations-v1', ...overrides };
  return LOCATION_IMPORT_COLUMNS.map(column => JSON.stringify(row[column] || '')).join(',');
}
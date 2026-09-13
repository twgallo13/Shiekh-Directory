import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'csv-parse/sync';
import {
  buildLocationImportFieldDictionary,
  buildLocationImportTemplate,
  buildLocationImportWorkedExample,
  LOCATION_IMPORT_COLUMNS,
  LOCATION_IMPORT_FIELDS,
  LocationImportPreviewError,
  previewLocationImport,
} from '../src/lib/locationImportPreview';
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
    const dictionary = parse(buildLocationImportFieldDictionary(), { columns: true }) as Array<{ Header: string }>;
    assert.deepEqual(dictionary.map(field => field.Header), LOCATION_IMPORT_COLUMNS);
    assert.deepEqual(LOCATION_IMPORT_FIELDS.map(field => field.column), LOCATION_IMPORT_COLUMNS);
  });

  it('shows exact updates while preserving blank fields and without mutating the snapshot', () => {
    const before = structuredClone(snapshot);
    const result = previewLocationImport(csvRow({ LocationId: 'loc-007', StoreNumber: '007', StoreName: 'Renamed Store' }), snapshot);
    assert.deepEqual(result.summary, { totalRows: 1, additions: 0, updates: 1, unchanged: 0, blocked: 0, warnings: 0 });
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

  it('blocks duplicate leadership assignments without revalidating untouched legacy hierarchy', () => {
    const legacySnapshot = structuredClone(snapshot);
    legacySnapshot.locations[0] = { ...legacySnapshot.locations[0], regionId: 'missing-region', districtId: 'missing-district' };
    const result = previewLocationImport(csvRow({
      LocationId: 'loc-007',
      AssistantStoreManagerIds: 'person-active;person-active',
    }), legacySnapshot);

    assert.equal(result.rows[0].action, 'blocked');
    assert.ok(result.rows[0].issues.some(item => item.field === 'AssistantStoreManagerIds' && /duplicate assignment/.test(item.reason)));
    assert.ok(result.rows[0].issues.every(item => !/missing-region|missing-district/.test(item.reason)));
  });

  it('does not silently match an unknown LocationId to an existing store number', () => {
    const result = previewLocationImport(csvRow({ LocationId: 'wrong-id', StoreNumber: '007', StoreName: 'Wrong Match' }), snapshot);
    assert.equal(result.rows[0].action, 'blocked');
    assert.ok(result.rows[0].issues.some(issue => issue.code === 'conflicting_identity'));
  });

  it('normalizes proposed phone extensions and URLs before showing changes', () => {
    const result = previewLocationImport(csvRow({
      LocationId: 'loc-007',
      Phone: '(213) 555-0199 ext. 45',
      GoogleReviewUrl: 'reviews.example.test/store-7',
    }), snapshot);
    assert.equal(result.rows[0].action, 'update');
    assert.deepEqual(result.rows[0].changes, [
      { field: 'phone', before: '555-0100', after: '+12135550199' },
      { field: 'googleReviewUrl', before: null, after: 'https://reviews.example.test/store-7' },
      { field: 'phoneExtension', before: null, after: '45' },
    ]);
  });

  it('rejects duplicate headers, unsupported columns, and malformed row widths', () => {
    assert.throws(() => previewLocationImport('SchemaVersion,SchemaVersion\r\nlocations-v1,locations-v1\r\n', snapshot), (error: unknown) => error instanceof LocationImportPreviewError && error.code === 'unsupported_template' && /Duplicate headers/.test(error.message));
    assert.throws(() => previewLocationImport(`${LOCATION_IMPORT_COLUMNS.join(',')},Unexpected\r\n`, snapshot), (error: unknown) => error instanceof LocationImportPreviewError && error.code === 'unsupported_template' && /Unsupported headers/.test(error.message));
    assert.throws(() => previewLocationImport(`${LOCATION_IMPORT_COLUMNS.join(',')}\r\nlocations-v1,too,few\r\n`, snapshot), (error: unknown) => error instanceof LocationImportPreviewError && error.code === 'invalid_csv');
  });

  it('reports leading-zero matches and blocks interactions between colliding CSV rows', () => {
    const csv = [
      LOCATION_IMPORT_COLUMNS.join(','),
      values({ LocationId: 'loc-007', StoreNumber: '0007', StoreName: 'First proposed name' }),
      values({ StoreNumber: '7', StoreName: 'Second proposed name' }),
    ].join('\r\n');
    const result = previewLocationImport(csv, snapshot);
    assert.equal(result.summary.blocked, 2);
    assert.ok(result.rows.every(row => row.issues.some(item => item.code === 'duplicate_csv_identity')));
    assert.ok(result.rows.some(row => row.issues.some(item => item.code === 'leading_zero_match' && item.severity === 'warning')));
  });

  it('blocks rows that resolve to the same Location through different identity fields', () => {
    const csv = [
      LOCATION_IMPORT_COLUMNS.join(','),
      values({ LocationId: 'loc-007', StoreName: 'Matched by ID' }),
      values({ StoreNumber: '007', StoreName: 'Matched by Store Number' }),
    ].join('\r\n');
    const result = previewLocationImport(csv, snapshot);

    assert.equal(result.summary.blocked, 2);
    assert.ok(result.rows.every(row => row.issues.some(item => item.code === 'duplicate_csv_identity' && item.candidates?.includes('CSV row 2') && item.candidates?.includes('CSV row 3'))));
  });

  it('blocks retirement with incoming Works at or Supports relationships', () => {
    const relationshipSnapshot = structuredClone(snapshot);
    relationshipSnapshot.people.push({ id: 'person-linked', fullName: 'Linked Person', status: 'Active', primaryLocationId: 'loc-007', supportedLocationIds: ['loc-007'] });
    const result = previewLocationImport(csvRow({ LocationId: 'loc-007', RecordStatus: 'Retired' }), relationshipSnapshot);
    const retirement = result.rows[0].issues.find(item => item.code === 'retirement_dependency');
    assert.equal(result.rows[0].action, 'blocked');
    assert.deepEqual(retirement?.candidates, ['person-linked — Linked Person']);
    assert.match(retirement?.correction || '', /Reassign or clear/);
  });

  it('preserves untouched legacy hierarchy and Person defects during unrelated updates', () => {
    const legacySnapshot = structuredClone(snapshot);
    legacySnapshot.locations[0] = { ...legacySnapshot.locations[0], regionId: 'missing-region', districtId: 'missing-district', storeManagerId: 'missing-person', phone: 'legacy phone' };
    const result = previewLocationImport(csvRow({ LocationId: 'loc-007', StoreName: 'Safe Rename' }), legacySnapshot);
    assert.equal(result.rows[0].action, 'update');
    assert.deepEqual(result.rows[0].issues, []);
    assert.deepEqual(result.rows[0].changes, [{ field: 'name', before: 'Original Store', after: 'Safe Rename' }]);
  });

  it('validates the synthetic worked example against fixtures without claiming live matches', () => {
    const exampleSnapshot = structuredClone(snapshot);
    exampleSnapshot.locations = [
      { ...baseLocation, id: 'SYNTHETIC-LOCATION-UPDATE', storeNumber: '8001', name: 'SYNTHETIC EXAMPLE - Original Name' },
      { ...baseLocation, id: 'SYNTHETIC-LOCATION-UNCHANGED', storeNumber: '8002', name: 'SYNTHETIC EXAMPLE - Unchanged' },
    ];
    const result = previewLocationImport(buildLocationImportWorkedExample(), exampleSnapshot, '2026-09-13T12:00:00.000Z');
    assert.deepEqual(result.summary, { totalRows: 4, additions: 1, updates: 1, unchanged: 1, blocked: 1, warnings: 0 });
    assert.equal(result.snapshotReadAt, '2026-09-13T12:00:00.000Z');
    assert.ok(result.rows[3].issues.some(item => item.code === 'missing_person_reference'));
  });
});

function csvRow(overrides: Partial<Record<typeof LOCATION_IMPORT_COLUMNS[number], string>>) {
  return `${LOCATION_IMPORT_COLUMNS.join(',')}\r\n${values(overrides)}\r\n`;
}

function values(overrides: Partial<Record<typeof LOCATION_IMPORT_COLUMNS[number], string>>) {
  const row = { SchemaVersion: 'locations-v1', ...overrides };
  return LOCATION_IMPORT_COLUMNS.map(column => JSON.stringify(row[column] || '')).join(',');
}
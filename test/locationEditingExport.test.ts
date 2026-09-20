import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'csv-parse/sync';
import { buildLocationEditingExport, LocationEditingExportError } from '../server/locationEditingExport';
import { LOCATION_IMPORT_COLUMNS, LOCATION_IMPORT_MAX_BYTES, LOCATION_TYPES } from '../src/lib/locationImportSchema';
import type { DirectorySeed } from '../src/lib/directorySeed';
import type { LocationRecord } from '../src/types';

type Snapshot = Pick<DirectorySeed, 'locations' | 'people' | 'regions' | 'districts'>;

const snapshotReadAt = '2026-09-13T12:00:00.000Z';
const people = [
  { id: 'person-manager', fullName: 'Manager', status: 'Active' },
  { id: 'person-assistant-1', fullName: 'Assistant One', status: 'Active' },
  { id: 'person-assistant-2', fullName: 'Assistant Two', status: 'Active' },
  { id: 'person-key-1', fullName: 'Key One', status: 'Active' },
  { id: 'person-key-2', fullName: 'Key Two', status: 'Active' },
  { id: 'person-district', fullName: 'District Manager', status: 'Active' },
  { id: 'person-regional', fullName: 'Regional Manager', status: 'Active' },
] as Snapshot['people'];

function location(overrides: Partial<LocationRecord> = {}): LocationRecord {
  return {
    id: 'loc-007',
    version: 4,
    storeNumber: '007',
    name: 'Café "North"',
    type: 'Street / Standalone Location',
    address: '7 Main Street, Suite 2\nSecond floor',
    city: 'Los Angeles',
    state: 'CA',
    zipCode: '09001',
    phone: '+12135550100',
    phoneExtension: '42',
    timeZone: 'America/Los_Angeles',
    hierarchyApplicability: 'Applicable',
    regionId: 'reg-west',
    districtId: 'dist-1',
    storeManagerId: 'person-manager',
    districtManagerId: 'person-district',
    regionalManagerId: 'person-regional',
    assistantStoreManagerIds: ['person-assistant-2', 'person-assistant-1'],
    keyHolderIds: ['person-key-2', 'person-key-1'],
    operationalStatus: 'Open — Normal Operations',
    recordStatus: 'Active',
    standardHours: {} as LocationRecord['standardHours'],
    ...overrides,
  };
}

function snapshotWith(locations: LocationRecord[]): Snapshot {
  return {
    locations,
    people,
    regions: [{ id: 'reg-west', name: 'West', status: 'Active' }],
    districts: [{ id: 'dist-1', name: 'District 1', regionId: 'reg-west', status: 'Active' }],
  };
}

describe('Location editing export', () => {
  it('emits one header-only import-compatible part for an empty directory', () => {
    const result = buildLocationEditingExport(snapshotWith([]), snapshotReadAt);
    assert.equal(result.totalRecords, 0);
    assert.equal(result.parts.length, 1);
    assert.equal(result.parts[0].recordCount, 0);
    assert.deepEqual(parse(result.parts[0].csv!, { bom: true }) as string[][], [LOCATION_IMPORT_COLUMNS]);
  });

  it('round-trips conforming records unchanged with exact locations-v1 serialization', () => {
    const source = snapshotWith([location()]);
    const result = buildLocationEditingExport(source, snapshotReadAt);

    assert.equal(result.schemaVersion, 'locations-v1');
    assert.equal(result.snapshotReadAt, snapshotReadAt);
    assert.deepEqual(result.roundTrip, { unchanged: 1, updates: 0, additions: 0, blocked: 0, warnings: 0 });
    assert.equal(result.parts.length, 1);
    assert.equal(result.parts[0].csv?.codePointAt(0), 0xfeff);
    assert.ok((result.parts[0].byteCount) <= LOCATION_IMPORT_MAX_BYTES);

    const [row] = parse(result.parts[0].csv!, { bom: true, columns: true }) as Array<Record<string, string>>;
    assert.deepEqual(Object.keys(row), LOCATION_IMPORT_COLUMNS);
    assert.equal(row.LocationId, 'loc-007');
    assert.equal(row.StoreNumber, '007');
    assert.equal(row.StoreName, 'Café "North"');
    assert.equal(row.Address, '7 Main Street, Suite 2\nSecond floor');
    assert.equal(row.ZipCode, '09001');
    assert.equal(row.Phone, "'+12135550100 ext. 42");
    assert.equal(row.AssistantStoreManagerIds, 'person-assistant-2;person-assistant-1');
    assert.equal(row.KeyHolderIds, 'person-key-2;person-key-1');
  });

  it('protects formula-leading values while preserving unchanged re-import semantics', () => {
    const source = snapshotWith([location({ name: '=Formula Store' })]);
    const result = buildLocationEditingExport(source, snapshotReadAt);
    const [row] = parse(result.parts[0].csv!, { bom: true, columns: true }) as Array<Record<string, string>>;

    assert.equal(row.StoreName, "'=Formula Store");
    assert.deepEqual(result.roundTrip, { unchanged: 1, updates: 0, additions: 0, blocked: 0, warnings: 0 });
  });

  it('round-trips a literal leading apostrophe before a formula character', () => {
    const source = snapshotWith([location({ name: "'=Literal Apostrophe" })]);
    const result = buildLocationEditingExport(source, snapshotReadAt);
    const [row] = parse(result.parts[0].csv!, { bom: true, columns: true }) as Array<Record<string, string>>;

    assert.equal(row.StoreName, "''=Literal Apostrophe");
    assert.deepEqual(result.roundTrip, { unchanged: 1, updates: 0, additions: 0, blocked: 0, warnings: 0 });
  });

  it('includes every Location type and lifecycle state without filtering', () => {
    const statuses = ['Active', 'Draft', 'Retired'] as const;
    const locations = LOCATION_TYPES.map((type, index) => {
      const retail = index < 3;
      return location({
        id: `loc-${index}`,
        storeNumber: String(index + 1).padStart(3, '0'),
        name: `${type} ${index}`,
        type,
        recordStatus: statuses[index % statuses.length],
        hierarchyApplicability: retail ? 'Applicable' : 'Not Applicable',
        regionId: retail ? 'reg-west' : undefined,
        districtId: retail ? 'dist-1' : undefined,
      });
    });

    const result = buildLocationEditingExport(snapshotWith(locations), snapshotReadAt);
    const rows = result.parts.flatMap(part => parse(part.csv!, { bom: true, columns: true }) as Array<Record<string, string>>);
    assert.equal(result.totalRecords, LOCATION_TYPES.length);
    assert.deepEqual(result.lifecycleCounts, { Active: 2, Draft: 2, Retired: 2, unrecognized: 0 });
    assert.deepEqual(rows.map(row => row.Type).sort(), [...LOCATION_TYPES].sort());
    assert.deepEqual(new Set(rows.map(row => row.RecordStatus)), new Set(statuses));
    assert.equal(result.roundTrip.unchanged, locations.length);
  });

  it('surfaces invalid legacy values and unsupported fields without silently cleaning them', () => {
    const legacy = {
      ...location({
      phone: 'legacy phone',
      storeManagerId: 'missing-person',
      mallOrCenterName: 'Legacy Center',
      customMetadata: { legacy: 'preserve me' },
      standardHours: Object.fromEntries(
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
          .map(day => [day, { open: '09:00', close: '17:00', isClosed: false }]),
      ) as unknown as LocationRecord['standardHours'],
      }),
      futureUnsupportedField: 'must be diagnosed',
    };
    const result = buildLocationEditingExport(snapshotWith([legacy]), snapshotReadAt);
    const row = (parse(result.parts[0].csv!, { bom: true, columns: true }) as Array<Record<string, string>>)[0];

    assert.equal(row.Phone, 'legacy phone ext. 42');
    assert.equal(row.StoreManagerId, 'missing-person');
    assert.equal(result.roundTrip.blocked, 1);
    const conformance = result.diagnostics.find(item => item.code === 'round_trip_issue');
    assert.equal(conformance?.locationId, 'loc-007');
    assert.ok(conformance?.fields.includes('Phone'));
    assert.ok(conformance?.fields.includes('StoreManagerId'));
    const unsupported = result.diagnostics.find(item => item.code === 'unrepresentable_fields');
    assert.ok(unsupported?.fields.includes('mallOrCenterName'));
    assert.ok(unsupported?.fields.includes('customMetadata'));
    assert.ok(unsupported?.fields.includes('futureUnsupportedField'));
    assert.ok(unsupported?.fields.includes('standardHours'));
  });

  it('reports malformed legacy identities without crashing the whole export', () => {
    const malformed = { ...location(), id: 27, storeNumber: null } as unknown as LocationRecord;
    const result = buildLocationEditingExport(snapshotWith([malformed]), snapshotReadAt);
    assert.equal(result.totalRecords, 1);
    assert.equal(result.roundTrip.blocked, 1);
    const identity = result.diagnostics.find(item => item.code === 'round_trip_issue');
    assert.ok(identity?.fields.some(field => /LocationId|StoreNumber/.test(field)));
  });

  it('labels missing required legacy values without treating the row as a new Location', () => {
    const result = buildLocationEditingExport(snapshotWith([location({ name: '' })]), snapshotReadAt);
    assert.equal(result.roundTrip.unchanged, 1);
    const diagnostic = result.diagnostics.find(item => item.code === 'round_trip_issue');
    const issue = diagnostic?.issues?.find(item => item.code === 'missing_required_field');
    assert.equal(diagnostic?.severity, 'warning');
    assert.equal(issue?.field, 'StoreName');
    assert.match(issue?.reason || '', /existing Location/);
    assert.doesNotMatch(issue?.reason || '', /new Location/);
  });

  it('partitions deterministically at 100 rows with complete record coverage', () => {
    const locations = Array.from({ length: 205 }, (_, index) => location({
      id: `loc-${String(index).padStart(3, '0')}`,
      storeNumber: String(index + 1).padStart(4, '0'),
      name: `Store ${index}`,
      assistantStoreManagerIds: undefined,
      keyHolderIds: undefined,
    }));
    const result = buildLocationEditingExport(snapshotWith(locations), snapshotReadAt);

    assert.deepEqual(result.parts.map(part => part.recordCount), [100, 100, 5]);
    assert.deepEqual(result.parts.map(part => part.filename), [
      'shiekh_locations_editing_v1_part_001_of_003.csv',
      'shiekh_locations_editing_v1_part_002_of_003.csv',
      'shiekh_locations_editing_v1_part_003_of_003.csv',
    ]);
    assert.ok(result.parts.every(part => part.byteCount <= LOCATION_IMPORT_MAX_BYTES));
    const ids = result.parts.flatMap(part => (parse(part.csv!, { bom: true, columns: true }) as Array<{ LocationId: string }>).map(row => row.LocationId));
    assert.equal(ids.length, locations.length);
    assert.equal(new Set(ids).size, locations.length);
    assert.deepEqual(ids, locations.map(item => item.id));
  });

  it('starts a new part before the UTF-8 byte limit without omitting either record', () => {
    const locations = [
      location({ id: 'loc-a', storeNumber: '001', name: `A ${'x'.repeat(1_050_000)}` }),
      location({ id: 'loc-b', storeNumber: '002', name: `B ${'y'.repeat(1_050_000)}` }),
    ];
    const result = buildLocationEditingExport(snapshotWith(locations), snapshotReadAt);

    assert.deepEqual(result.parts.map(part => part.recordCount), [1, 1]);
    assert.ok(result.parts.every(part => part.byteCount <= LOCATION_IMPORT_MAX_BYTES));
    const ids = result.parts.flatMap(part => (parse(part.csv!, { bom: true, columns: true }) as Array<{ LocationId: string }>).map(row => row.LocationId));
    assert.deepEqual(ids, ['loc-a', 'loc-b']);
  });

  it('identifies a single record that cannot fit in an import-sized CSV part', () => {
    const oversized = location({ name: 'é'.repeat(1_000_100) });
    assert.throws(
      () => buildLocationEditingExport(snapshotWith([oversized]), snapshotReadAt),
      (error: unknown) => error instanceof LocationEditingExportError
        && error.code === 'editing_export_record_too_large'
        && error.locationId === 'loc-007'
        && error.fields.includes('StoreName'),
    );
  });
});

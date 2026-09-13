import { stringify } from 'csv-stringify/sync';
import type { DirectorySeed } from '../src/lib/directorySeed';
import {
  LOCATION_IMPORT_COLUMNS,
  LOCATION_IMPORT_FIELDS,
  LOCATION_IMPORT_SCHEMA_VERSION,
} from '../src/lib/locationImportSchema';

type LocationImportReferenceSnapshot = Pick<DirectorySeed, 'locations' | 'people' | 'regions' | 'districts'>;

export function buildLocationImportTemplate(): string {
  return stringify([], { header: true, columns: LOCATION_IMPORT_COLUMNS, record_delimiter: '\r\n', bom: true });
}

export function buildLocationImportFieldDictionary(): string {
  const rows = LOCATION_IMPORT_FIELDS.map(field => ({
    Header: field.column,
    Purpose: field.purpose,
    Additions: field.additions,
    Updates: field.updates,
    Format: field.format,
    AllowedValues: field.allowedValues?.join(' | ') || '',
    BlankBehavior: field.column === 'SchemaVersion' ? 'Not allowed' : 'Preserves an existing value; explicit clearing is not supported',
    Example: field.example,
  }));
  return stringify(rows, { header: true, record_delimiter: '\r\n', bom: true });
}

export function buildLocationImportWorkedExample(): string {
  const rows = [
    exampleRow({
      StoreNumber: '9001', StoreName: 'SYNTHETIC EXAMPLE - New Location', Type: 'Other Company Location',
      Address: '100 Example Avenue', City: 'Los Angeles', State: 'CA', ZipCode: '90001', Phone: '(213) 555-0100',
      TimeZone: 'America/Los_Angeles', HierarchyApplicability: 'Not Applicable', OperationalStatus: 'Opening Soon — New Store', RecordStatus: 'Active',
    }),
    exampleRow({ LocationId: 'SYNTHETIC-LOCATION-UPDATE', StoreName: 'SYNTHETIC EXAMPLE - Updated Name', Phone: '(213) 555-0101 ext. 42' }),
    exampleRow({ LocationId: 'SYNTHETIC-LOCATION-UNCHANGED' }),
    exampleRow({
      StoreNumber: '9002', StoreName: 'SYNTHETIC EXAMPLE - Blocked Relationship', Type: 'Street / Standalone Location',
      Address: '200 Example Avenue', City: 'Los Angeles', State: 'CA', ZipCode: '90002', Phone: '(213) 555-0102',
      TimeZone: 'America/Los_Angeles', HierarchyApplicability: 'Applicable', RegionId: 'REPLACE_WITH_REGION_ID',
      DistrictId: 'REPLACE_WITH_DISTRICT_ID', StoreManagerId: 'REPLACE_WITH_ACTIVE_PERSON_ID',
      OperationalStatus: 'Open — Normal Operations', RecordStatus: 'Active',
    }),
  ];
  return stringify(rows, { header: true, columns: LOCATION_IMPORT_COLUMNS, record_delimiter: '\r\n', bom: true });
}

export function buildLocationImportReferenceCsv(snapshot: LocationImportReferenceSnapshot): string {
  const regionsById = new Map(snapshot.regions.map(region => [region.id, region.name]));
  const rows = [
    ...snapshot.locations.map(location => ({ RecordType: 'Location', Id: location.id, Name: location.name, LifecycleStatus: location.recordStatus, StoreNumber: location.storeNumber, ParentRegionId: '', ParentRegionName: '' })),
    ...snapshot.people.map(person => ({ RecordType: 'Person', Id: person.id, Name: person.fullName, LifecycleStatus: person.activeStatus === false || (person.status && person.status !== 'Active') ? 'Inactive' : 'Active', StoreNumber: '', ParentRegionId: '', ParentRegionName: '' })),
    ...snapshot.regions.map(region => ({ RecordType: 'Region', Id: region.id, Name: region.name, LifecycleStatus: region.status, StoreNumber: '', ParentRegionId: '', ParentRegionName: '' })),
    ...snapshot.districts.map(district => ({ RecordType: 'District', Id: district.id, Name: district.name, LifecycleStatus: district.status, StoreNumber: '', ParentRegionId: district.regionId, ParentRegionName: regionsById.get(district.regionId) || '' })),
  ].sort((left, right) => left.RecordType.localeCompare(right.RecordType) || left.Name.localeCompare(right.Name) || left.Id.localeCompare(right.Id));
  return stringify(rows, { header: true, columns: ['RecordType', 'Id', 'Name', 'LifecycleStatus', 'StoreNumber', 'ParentRegionId', 'ParentRegionName'], record_delimiter: '\r\n', bom: true });
}

function exampleRow(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(LOCATION_IMPORT_COLUMNS.map(column => [column, column === 'SchemaVersion' ? LOCATION_IMPORT_SCHEMA_VERSION : values[column] || '']));
}
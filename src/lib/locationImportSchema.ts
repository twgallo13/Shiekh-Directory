import { stringify } from 'csv-stringify/sync';
import type { LocationType, OperationalStatus, RecordStatus } from '../types';

export const LOCATION_IMPORT_SCHEMA_VERSION = 'locations-v1';
export const LOCATION_IMPORT_MAX_BYTES = 2_000_000;

export const LOCATION_TYPES = [
  'Enclosed Mall',
  'Strip Center / Shopping Center',
  'Street / Standalone Location',
  'Corporate Office',
  'Warehouse / Distribution Center',
  'Other Company Location',
] as const satisfies readonly LocationType[];

export const LOCATION_OPERATIONAL_STATUSES = [
  'Open — Normal Operations',
  'Temporarily Modified Hours',
  'Under Remodel / Renovation',
  'Temporarily Closed — Emergency',
  'Opening Soon — New Store',
  'Permanently Closed',
] as const satisfies readonly OperationalStatus[];

export const LOCATION_RECORD_STATUSES = ['Active', 'Retired', 'Draft'] as const satisfies readonly RecordStatus[];
export const LOCATION_TIME_ZONES = ['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York'] as const;
export const LOCATION_HIERARCHY_APPLICABILITY = ['Applicable', 'Not Applicable', 'Unknown'] as const;

export interface LocationImportFieldDefinition {
  column: string;
  field?: string;
  purpose: string;
  additions: string;
  updates: string;
  format: string;
  allowedValues?: readonly string[];
  example: string;
}

export const LOCATION_IMPORT_FIELDS: readonly LocationImportFieldDefinition[] = [
  { column: 'SchemaVersion', purpose: 'Identifies this import contract.', additions: 'Required', updates: 'Required', format: `Exact text: ${LOCATION_IMPORT_SCHEMA_VERSION}`, allowedValues: [LOCATION_IMPORT_SCHEMA_VERSION], example: LOCATION_IMPORT_SCHEMA_VERSION },
  { column: 'LocationId', field: 'id', purpose: 'Stable Location identity. Never matched by name.', additions: 'Optional; preview does not reserve the supplied ID', updates: 'Required unless StoreNumber uniquely identifies the Location', format: '1-128 letters, numbers, periods, underscores, or hyphens', example: 'REPLACE_WITH_LOCATION_ID' },
  { column: 'StoreNumber', field: 'storeNumber', purpose: 'Location number and fallback update identity.', additions: 'Required', updates: 'Required when LocationId is blank; otherwise optional', format: 'Digits only. Leading zeros are ignored for matching but the supplied text is the proposed value.', example: '007' },
  { column: 'StoreName', field: 'name', purpose: 'Displayed Location name.', additions: 'Required', updates: 'Optional', format: 'Non-empty text', example: 'SYNTHETIC EXAMPLE - Market Street' },
  { column: 'Type', field: 'type', purpose: 'Controls hierarchy applicability rules.', additions: 'Required', updates: 'Optional', format: 'One allowed value', allowedValues: LOCATION_TYPES, example: 'Street / Standalone Location' },
  { column: 'Address', field: 'address', purpose: 'Physical street address.', additions: 'Required', updates: 'Optional', format: 'Non-empty text', example: '100 Example Avenue' },
  { column: 'City', field: 'city', purpose: 'Physical city.', additions: 'Required', updates: 'Optional', format: 'Non-empty text', example: 'Los Angeles' },
  { column: 'State', field: 'state', purpose: 'US state or territory abbreviation.', additions: 'Required', updates: 'Optional', format: 'Two uppercase letters', example: 'CA' },
  { column: 'ZipCode', field: 'zipCode', purpose: 'US ZIP code.', additions: 'Required', updates: 'Optional', format: '5 digits or ZIP+4', example: '90001' },
  { column: 'Phone', field: 'phone', purpose: 'Main Location phone. Preview shows the normalized saved value.', additions: 'Required', updates: 'Optional', format: 'Valid US phone; extension may be included', example: '(213) 555-0100 ext. 42' },
  { column: 'TimeZone', field: 'timeZone', purpose: 'Location time zone.', additions: 'Required', updates: 'Optional', format: 'One allowed IANA value', allowedValues: LOCATION_TIME_ZONES, example: 'America/Los_Angeles' },
  { column: 'HierarchyApplicability', field: 'hierarchyApplicability', purpose: 'Whether controlled Region/District hierarchy applies.', additions: 'Optional; type-based default applies', updates: 'Optional', format: 'One allowed value', allowedValues: LOCATION_HIERARCHY_APPLICABILITY, example: 'Applicable' },
  { column: 'RegionId', field: 'regionId', purpose: 'Canonical Region reference.', additions: 'Optional', updates: 'Optional', format: 'Existing active Region ID from Reference IDs', example: 'REPLACE_WITH_REGION_ID' },
  { column: 'DistrictId', field: 'districtId', purpose: 'Canonical District reference within RegionId.', additions: 'Optional', updates: 'Optional', format: 'Existing active District ID from Reference IDs', example: 'REPLACE_WITH_DISTRICT_ID' },
  { column: 'StoreManagerId', field: 'storeManagerId', purpose: 'Canonical Store Manager leadership assignment.', additions: 'Optional', updates: 'Optional', format: 'Existing active Person ID', example: 'REPLACE_WITH_ACTIVE_PERSON_ID' },
  { column: 'DistrictManagerId', field: 'districtManagerId', purpose: 'Canonical District Manager leadership assignment.', additions: 'Optional', updates: 'Optional', format: 'Existing active Person ID', example: 'REPLACE_WITH_ACTIVE_PERSON_ID' },
  { column: 'RegionalManagerId', field: 'regionalManagerId', purpose: 'Canonical Regional Manager leadership assignment.', additions: 'Optional', updates: 'Optional', format: 'Existing active Person ID', example: 'REPLACE_WITH_ACTIVE_PERSON_ID' },
  { column: 'AssistantStoreManagerIds', field: 'assistantStoreManagerIds', purpose: 'Canonical Assistant Manager leadership assignments.', additions: 'Optional', updates: 'Optional', format: 'Semicolon-separated active Person IDs; no duplicates', example: 'REPLACE_WITH_PERSON_ID_1;REPLACE_WITH_PERSON_ID_2' },
  { column: 'KeyHolderIds', field: 'keyHolderIds', purpose: 'Canonical Key Holder leadership assignments.', additions: 'Optional', updates: 'Optional', format: 'Semicolon-separated active Person IDs; no duplicates', example: 'REPLACE_WITH_PERSON_ID_3' },
  { column: 'OperationalStatus', field: 'operationalStatus', purpose: 'Current operating condition.', additions: 'Required', updates: 'Optional', format: 'One allowed value', allowedValues: LOCATION_OPERATIONAL_STATUSES, example: 'Open — Normal Operations' },
  { column: 'RecordStatus', field: 'recordStatus', purpose: 'Directory lifecycle status. Retirement is blocked by incoming Works at or Supports references.', additions: 'Required', updates: 'Optional', format: 'One allowed value', allowedValues: LOCATION_RECORD_STATUSES, example: 'Active' },
  { column: 'GoogleReviewUrl', field: 'googleReviewUrl', purpose: 'Public review link. Preview shows the normalized saved value.', additions: 'Optional', updates: 'Optional', format: 'HTTP/HTTPS URL without credentials', example: 'https://example.test/reviews' },
  { column: 'StorePageUrl', field: 'storePageUrl', purpose: 'Public store page. Preview shows the normalized saved value.', additions: 'Optional', updates: 'Optional', format: 'HTTP/HTTPS URL without credentials', example: 'https://example.test/stores/007' },
];

export const LOCATION_IMPORT_COLUMNS = LOCATION_IMPORT_FIELDS.map(field => field.column);

export function buildLocationImportTemplate(): string {
  return stringify([], { header: true, columns: LOCATION_IMPORT_COLUMNS, record_delimiter: '\r\n', bom: false });
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
  return stringify(rows, { header: true, record_delimiter: '\r\n', bom: false });
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
  return stringify(rows, { header: true, columns: LOCATION_IMPORT_COLUMNS, record_delimiter: '\r\n', bom: false });
}

function exampleRow(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(LOCATION_IMPORT_COLUMNS.map(column => [column, column === 'SchemaVersion' ? LOCATION_IMPORT_SCHEMA_VERSION : values[column] || '']));
}
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
  aliases?: readonly string[];
  purpose: string;
  additions: string;
  updates: string;
  format: string;
  allowedValues?: readonly string[];
  example: string;
}

export const LOCATION_IMPORT_FIELDS: readonly LocationImportFieldDefinition[] = [
  { column: 'SchemaVersion', aliases: ['Schema Version'], purpose: 'Identifies this import contract.', additions: 'Optional; missing values use the current supported format', updates: 'Optional; missing values use the current supported format', format: `Exact text when supplied: ${LOCATION_IMPORT_SCHEMA_VERSION}`, allowedValues: [LOCATION_IMPORT_SCHEMA_VERSION], example: LOCATION_IMPORT_SCHEMA_VERSION },
  { column: 'LocationId', field: 'id', aliases: ['Location ID'], purpose: 'Stable Location identity. Never matched by name.', additions: 'Optional; preview does not reserve the supplied ID', updates: 'Required unless StoreNumber uniquely identifies the Location', format: '1-128 letters, numbers, periods, underscores, or hyphens', example: 'REPLACE_WITH_LOCATION_ID' },
  { column: 'StoreNumber', field: 'storeNumber', aliases: ['Store Number', 'Store #', 'Store No.'], purpose: 'Location number and fallback update identity.', additions: 'Required', updates: 'Required when LocationId is blank; otherwise optional', format: 'Digits only. Leading zeros are ignored for matching but the supplied text is the proposed value.', example: '007' },
  { column: 'StoreName', field: 'name', aliases: ['Store Name', 'Location Name'], purpose: 'Displayed Location name.', additions: 'Required', updates: 'Optional', format: 'Non-empty text', example: 'SYNTHETIC EXAMPLE - Market Street' },
  { column: 'Type', field: 'type', purpose: 'Controls hierarchy applicability rules.', additions: 'Required', updates: 'Optional', format: 'One allowed value', allowedValues: LOCATION_TYPES, example: 'Street / Standalone Location' },
  { column: 'Address', field: 'address', purpose: 'Physical street address.', additions: 'Required', updates: 'Optional', format: 'Non-empty text', example: '100 Example Avenue' },
  { column: 'City', field: 'city', purpose: 'Physical city.', additions: 'Required', updates: 'Optional', format: 'Non-empty text', example: 'Los Angeles' },
  { column: 'State', field: 'state', purpose: 'US state or territory abbreviation.', additions: 'Required', updates: 'Optional', format: 'Two uppercase letters', example: 'CA' },
  { column: 'ZipCode', field: 'zipCode', aliases: ['ZIP Code', 'Zip Code', 'ZIP'], purpose: 'US ZIP code.', additions: 'Required', updates: 'Optional', format: '5 digits or ZIP+4', example: '90001' },
  { column: 'Phone', field: 'phone', aliases: ['Phone Number', 'Store Phone'], purpose: 'Main Location phone. Preview shows the normalized saved value.', additions: 'Required', updates: 'Optional', format: 'Valid US phone; extension may be included', example: '(213) 555-0100 ext. 42' },
  { column: 'TimeZone', field: 'timeZone', aliases: ['Time Zone'], purpose: 'Location time zone.', additions: 'Required', updates: 'Optional', format: 'One allowed IANA value', allowedValues: LOCATION_TIME_ZONES, example: 'America/Los_Angeles' },
  { column: 'HierarchyApplicability', field: 'hierarchyApplicability', aliases: ['Hierarchy Applicability'], purpose: 'Whether controlled Region/District hierarchy applies.', additions: 'Optional; type-based default applies', updates: 'Optional', format: 'One allowed value', allowedValues: LOCATION_HIERARCHY_APPLICABILITY, example: 'Applicable' },
  { column: 'RegionId', field: 'regionId', aliases: ['Region ID'], purpose: 'Canonical Region reference.', additions: 'Optional', updates: 'Optional', format: 'Existing active Region ID from Reference IDs', example: 'REPLACE_WITH_REGION_ID' },
  { column: 'DistrictId', field: 'districtId', aliases: ['District ID'], purpose: 'Canonical District reference within RegionId.', additions: 'Optional', updates: 'Optional', format: 'Existing active District ID from Reference IDs', example: 'REPLACE_WITH_DISTRICT_ID' },
  { column: 'StoreManagerId', field: 'storeManagerId', aliases: ['Store Manager ID'], purpose: 'Canonical Store Manager leadership assignment.', additions: 'Optional', updates: 'Optional', format: 'Existing active Person ID', example: 'REPLACE_WITH_ACTIVE_PERSON_ID' },
  { column: 'DistrictManagerId', field: 'districtManagerId', aliases: ['District Manager ID'], purpose: 'Canonical District Manager leadership assignment.', additions: 'Optional', updates: 'Optional', format: 'Existing active Person ID', example: 'REPLACE_WITH_ACTIVE_PERSON_ID' },
  { column: 'RegionalManagerId', field: 'regionalManagerId', aliases: ['Regional Manager ID'], purpose: 'Canonical Regional Manager leadership assignment.', additions: 'Optional', updates: 'Optional', format: 'Existing active Person ID', example: 'REPLACE_WITH_ACTIVE_PERSON_ID' },
  { column: 'AssistantStoreManagerIds', field: 'assistantStoreManagerIds', aliases: ['Assistant Store Manager IDs'], purpose: 'Canonical Assistant Manager leadership assignments.', additions: 'Optional', updates: 'Optional', format: 'One or more semicolon-separated active Person IDs; no duplicates. Delimiters alone are invalid and cannot clear the list', example: 'REPLACE_WITH_PERSON_ID_1;REPLACE_WITH_PERSON_ID_2' },
  { column: 'KeyHolderIds', field: 'keyHolderIds', aliases: ['Key Holder IDs'], purpose: 'Canonical Key Holder leadership assignments.', additions: 'Optional', updates: 'Optional', format: 'One or more semicolon-separated active Person IDs; no duplicates. Delimiters alone are invalid and cannot clear the list', example: 'REPLACE_WITH_PERSON_ID_3' },
  { column: 'OperationalStatus', field: 'operationalStatus', purpose: 'Current operating condition.', additions: 'Required', updates: 'Optional', format: 'One allowed value', allowedValues: LOCATION_OPERATIONAL_STATUSES, example: 'Open — Normal Operations' },
  { column: 'RecordStatus', field: 'recordStatus', purpose: 'Directory lifecycle status. Retirement is blocked by incoming Works at or Supports references.', additions: 'Required', updates: 'Optional', format: 'One allowed value', allowedValues: LOCATION_RECORD_STATUSES, example: 'Active' },
  { column: 'GoogleReviewUrl', field: 'googleReviewUrl', aliases: ['Google Review URL'], purpose: 'Public review link. Preview shows the normalized saved value.', additions: 'Optional', updates: 'Optional', format: 'HTTP/HTTPS URL without credentials', example: 'https://example.test/reviews' },
  { column: 'StorePageUrl', field: 'storePageUrl', aliases: ['Store Page URL'], purpose: 'Public store page. Preview shows the normalized saved value.', additions: 'Optional', updates: 'Optional', format: 'HTTP/HTTPS URL without credentials', example: 'https://example.test/stores/007' },
];

export const LOCATION_IMPORT_COLUMNS = LOCATION_IMPORT_FIELDS.map(field => field.column);
export type LocationImportColumn = typeof LOCATION_IMPORT_COLUMNS[number];
export type LocationImportMode = 'add-and-update' | 'update-existing-only';

export const LOCATION_IMPORT_INFORMATIONAL_COLUMNS = [
  'District',
  'StoreManager',
  'StoreManagerPhone',
  'DistrictManager',
  'RegionalManager',
  'AssistantStoreManagers',
  'KeyHolders',
] as const;

export interface LocationImportHeaderMapping {
  sourceIndex: number;
  sourceHeader: string;
  target: LocationImportColumn | null;
  kind?: 'exact' | 'alias' | 'informational' | 'unsupported' | 'manual';
}

export function suggestLocationImportHeaderMappings(headers: readonly string[]): LocationImportHeaderMapping[] {
  const fields = LOCATION_IMPORT_FIELDS.flatMap(field => [field.column, ...(field.aliases || [])]
    .map(alias => [normalizeImportHeading(alias), field.column] as const));
  const targets = new Map(fields);
  const informational = new Set(LOCATION_IMPORT_INFORMATIONAL_COLUMNS.map(normalizeImportHeading));
  return headers.map((sourceHeader, sourceIndex) => {
    const normalized = normalizeImportHeading(sourceHeader);
    const target = targets.get(normalized) || null;
    const canonical = target && normalizeImportHeading(target) === normalized;
    return {
      sourceIndex,
      sourceHeader,
      target,
      kind: target ? (canonical ? 'exact' : 'alias') : informational.has(normalized) ? 'informational' : 'unsupported',
    };
  });
}

export function spreadsheetSafeCsvValue(value: string): string {
  return /^'*(?:[=+\-@])/.test(value) ? `'${value}` : value;
}

export function restoreSpreadsheetSafeCsvValue(value: string): string {
  return /^'+[=+\-@]/.test(value) ? value.slice(1) : value;
}

function normalizeImportHeading(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}
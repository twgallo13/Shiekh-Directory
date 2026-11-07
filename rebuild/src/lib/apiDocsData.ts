/**
 * Shared API Documentation Data
 * 
 * This file is the single source of truth for external consumer API documentation.
 * It is used by:
 * - src/components/ApiDocsView.tsx (in-app documentation)
 * - docs/API.md (repository documentation)
 * - Notion public API page (via exported Markdown)
 * 
 * IMPORTANT: This documents the EXTERNAL CONSUMER API (v1/v2/v3) only.
 * Internal staff endpoints (/api/app/*) are documented separately in the codebase.
 * 
 * Authentication types:
 * - Consumer API (v1/v2/v3): Bearer token with shk_ prefix, scope-based access
 * - Staff API (/api/app/*): Firebase Auth JWT (internal users only)
 * - Store Sessions (/api/store-auth/*): Passwordless store sign-in (internal)
 * 
 * Last updated: 2026-11-07
 * Contract baseline: b7727f6
 */

export const API_BASE_URL = 'https://shiekh-directory-v2.web.app';

export const API_TOKEN_PREFIX = 'shk_';

export const SNAPSHOT_TTL_MINUTES = 15;

export const MAX_PAGE_SIZE = 100;

export const DEFAULT_PAGE_SIZE = 50;

export interface ApiParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example?: string;
}

export interface ApiEndpoint {
  method: 'GET' | 'POST';
  path: string;
  summary: string;
  description: string;
  scope: string;
  parameters?: ApiParameter[];
  responseExample: string;
  notes?: string[];
}

export interface ApiVersion {
  version: string;
  title: string;
  description: string;
  contractVersion?: string;
  endpoints: ApiEndpoint[];
}

export interface ApiScope {
  name: string;
  description: string;
}

export const API_SCOPES: ApiScope[] = [
  { name: 'locations:read', description: 'Read location data, hours, and operating status' },
  { name: 'personnel:read', description: 'Read personnel records' },
  { name: 'staffing:read', description: 'Read store staffing assignments' },
  { name: 'district-leadership:read', description: 'Read district and region leadership structure' },
  { name: 'district-leadership:contacts:read', description: 'Include DM work email addresses' },
];

export const API_VERSIONS: ApiVersion[] = [
  {
    version: 'v1',
    title: 'Location Directory API',
    description: 'Access store location data including addresses, hours, and operating status.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/location-fields',
        summary: 'List Custom Fields',
        description: 'Returns all custom field definitions used across locations.',
        scope: 'locations:read',
        responseExample: `{
  "version": "abc123...",
  "fields": [
    {
      "id": "cf_001",
      "name": "Mall Contact",
      "type": "text",
      "required": false,
      "description": "Mall management contact info"
    }
  ]
}`,
      },
      {
        method: 'GET',
        path: '/api/v1/locations',
        summary: 'List Locations',
        description: 'Returns paginated list of active store locations with full details including hours and closures.',
        scope: 'locations:read',
        parameters: [
          { name: 'limit', type: 'integer', required: false, description: 'Page size (1-100, default 50)', example: '50' },
          { name: 'cursor', type: 'string', required: false, description: 'Pagination cursor from previous response' },
          { name: 'updatedSince', type: 'ISO 8601 timestamp', required: false, description: 'Filter to locations updated after this time', example: '2024-01-01T00:00:00Z' },
          { name: 'kind', type: 'string', required: false, description: 'Location types to include (comma-separated: store,warehouse,office)', example: 'store' },
          { name: 'customFieldsVersion', type: 'string', required: false, description: 'Validates custom field schema hasn\'t changed' },
          { name: 'hierarchyVersion', type: 'string', required: false, description: 'Validates region/district hierarchy hasn\'t changed' },
        ],
        responseExample: `{
  "data": [
    {
      "id": "loc_abc123",
      "storeNumber": "07",
      "name": "Glendale Galleria",
      "address": "100 W Broadway",
      "city": "Glendale",
      "state": "CA",
      "zipCode": "91210",
      "timeZone": "America/Los_Angeles",
      "regionId": "reg_001",
      "regionName": "West",
      "districtId": "dist_001",
      "districtName": "LA Metro",
      "operationalStatus": "Active",
      "standardHours": {
        "monday": { "isClosed": false, "open": "10:00", "close": "21:00" }
      },
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "sync": {
    "watermark": "2024-01-15T12:00:00.000Z",
    "mode": "full",
    "customFieldsVersion": "abc...",
    "hierarchyVersion": "def..."
  },
  "pagination": { "limit": 50, "nextCursor": "..." }
}`,
        notes: [
          'Use `customFieldsVersion` and `hierarchyVersion` to detect schema changes mid-sync.',
          'The watermark should be saved and used as `updatedSince` for delta syncs.',
          'Cursor is only valid within the same snapshot window (15 minutes).',
          'Multi-interval hours (e.g., split shifts) return only the FIRST interval. This is a known limitation.',
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/locations/:storeNumber',
        summary: 'Get Location by Store Number',
        description: 'Returns a single location by its store number.',
        scope: 'locations:read',
        parameters: [
          { name: 'storeNumber', type: 'string', required: true, description: 'Store number (e.g., "07" or "125")' },
        ],
        responseExample: `{
  "data": {
    "id": "loc_abc123",
    "storeNumber": "07",
    "name": "Glendale Galleria",
    "address": "100 W Broadway",
    "city": "Glendale",
    "state": "CA",
    "zipCode": "91210",
    "timeZone": "America/Los_Angeles"
  },
  "customFieldsVersion": "abc...",
  "hierarchyVersion": "def..."
}`,
      },
      {
        method: 'GET',
        path: '/api/v1/locations/:storeNumber/operating-state',
        summary: 'Get Real-time Operating State',
        description: 'Returns the current open/closed state based on hours, closures, and exceptions.',
        scope: 'locations:read',
        parameters: [
          { name: 'storeNumber', type: 'string', required: true, description: 'Store number' },
        ],
        responseExample: `{
  "contract": "location-operating-state-v1",
  "data": {
    "locationId": "loc_abc123",
    "storeNumber": "07",
    "state": "Open",
    "reason": "Open until 21:00",
    "scheduleSource": "standard",
    "hours": { "open": "10:00", "close": "21:00", "isClosed": false },
    "localDate": "2024-01-15",
    "timeZone": "America/Los_Angeles",
    "evaluatedAt": "2024-01-15T18:30:00Z",
    "nextTransitionAt": null,
    "temporaryClosure": null,
    "issues": []
  }
}`,
        notes: [
          'This endpoint evaluates the current time against the schedule.',
          'For bulk operations, use the list endpoint and compute state locally.',
        ],
      },
    ],
  },
  {
    version: 'v2',
    title: 'Personnel & Staffing API',
    description: 'Access personnel records and store staffing assignments.',
    contractVersion: 'personnel-staffing-v2.1',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v2/snapshot',
        summary: 'Create Snapshot',
        description: 'Creates a point-in-time snapshot token required for personnel and staffing queries.',
        scope: 'personnel:read or staffing:read',
        responseExample: `{
  "snapshot": "eyJ2ZXJzaW9u...",
  "snapshotAt": "2024-01-15T12:00:00.000Z",
  "expiresAt": "2024-01-15T12:15:00.000Z",
  "contractVersion": "personnel-staffing-v2.1"
}`,
        notes: [
          'Snapshots expire after 15 minutes.',
          'All queries must include a valid snapshot token.',
          'If a snapshot expires mid-sync, restart from the beginning.',
        ],
      },
      {
        method: 'GET',
        path: '/api/v2/personnel',
        summary: 'List Personnel',
        description: 'Returns paginated list of active personnel with their location assignments.',
        scope: 'personnel:read',
        parameters: [
          { name: 'snapshot', type: 'string', required: true, description: 'Snapshot token from /snapshot endpoint' },
          { name: 'limit', type: 'integer', required: false, description: 'Page size (1-100, default 50)' },
          { name: 'cursor', type: 'string', required: false, description: 'Pagination cursor' },
        ],
        responseExample: `{
  "data": [
    {
      "id": "person_abc123",
      "fullName": "John Smith",
      "lifecycle": "active",
      "primaryLocationId": "loc_001",
      "supportedLocationIds": ["loc_002", "loc_003"],
      "issues": []
    }
  ],
  "pagination": { "limit": 50, "nextCursor": "..." },
  "sync": { "mode": "full", "snapshotAt": "...", "contractVersion": "personnel-staffing-v2.1" }
}`,
      },
      {
        method: 'GET',
        path: '/api/v2/personnel/:id',
        summary: 'Get Personnel by ID',
        description: 'Returns a single personnel record by canonical ID.',
        scope: 'personnel:read',
        parameters: [
          { name: 'id', type: 'string', required: true, description: 'Personnel canonical ID' },
          { name: 'snapshot', type: 'string', required: true, description: 'Snapshot token' },
        ],
        responseExample: `{
  "data": {
    "id": "person_abc123",
    "fullName": "John Smith",
    "lifecycle": "active",
    "primaryLocationId": "loc_001",
    "supportedLocationIds": ["loc_002", "loc_003"]
  },
  "sync": { "mode": "full", "snapshotAt": "...", "contractVersion": "personnel-staffing-v2.1" }
}`,
      },
      {
        method: 'GET',
        path: '/api/v2/location-staffing',
        summary: 'List Location Staffing',
        description: 'Returns staffing assignments for each location including SM, ASM, DM, and key holders.',
        scope: 'staffing:read',
        parameters: [
          { name: 'snapshot', type: 'string', required: true, description: 'Snapshot token' },
          { name: 'limit', type: 'integer', required: false, description: 'Page size (1-100, default 50)' },
          { name: 'cursor', type: 'string', required: false, description: 'Pagination cursor' },
          { name: 'kind', type: 'string', required: false, description: 'Location types (store,warehouse,office)', example: 'store' },
        ],
        responseExample: `{
  "data": [
    {
      "locationId": "loc_abc123",
      "storeNumber": "07",
      "recordStatus": "active",
      "storeManagerId": "person_001",
      "districtManagerId": "person_002",
      "assistantStoreManagerIds": ["person_003"],
      "keyHolderIds": ["person_004", "person_005"],
      "positionStatus": {
        "sm": { "status": "filled", "holders": ["person_001"] },
        "dm": { "status": "filled", "holders": ["person_002"] }
      },
      "issues": []
    }
  ],
  "pagination": { "limit": 50, "nextCursor": "..." },
  "sync": { "mode": "full", "snapshotAt": "...", "contractVersion": "personnel-staffing-v2.1" }
}`,
      },
      {
        method: 'GET',
        path: '/api/v2/location-staffing/:id',
        summary: 'Get Location Staffing by ID',
        description: 'Returns staffing assignments for a single location by canonical location ID.',
        scope: 'staffing:read',
        parameters: [
          { name: 'id', type: 'string', required: true, description: 'Location canonical ID' },
          { name: 'snapshot', type: 'string', required: true, description: 'Snapshot token' },
        ],
        responseExample: `{
  "data": {
    "locationId": "loc_abc123",
    "storeNumber": "07",
    "recordStatus": "active",
    "storeManagerId": "person_001",
    "districtManagerId": "person_002",
    "assistantStoreManagerIds": ["person_003"],
    "keyHolderIds": ["person_004", "person_005"]
  },
  "sync": { "mode": "full", "snapshotAt": "...", "contractVersion": "personnel-staffing-v2.1" }
}`,
      },
    ],
  },
  {
    version: 'v3',
    title: 'District Leadership API',
    description: 'Access district management structure and leadership assignments.',
    contractVersion: 'district-leadership-v3.1',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v3/snapshot',
        summary: 'Create Snapshot',
        description: 'Creates a point-in-time snapshot token for district leadership queries.',
        scope: 'district-leadership:read',
        responseExample: `{
  "snapshot": "eyJ2ZXJzaW9u...",
  "snapshotAt": "2024-01-15T12:00:00.000Z",
  "expiresAt": "2024-01-15T12:15:00.000Z",
  "contractVersion": "district-leadership-v3.1"
}`,
      },
      {
        method: 'GET',
        path: '/api/v3/district-leadership',
        summary: 'List District Leadership',
        description: 'Returns all districts with their assigned district managers.',
        scope: 'district-leadership:read',
        parameters: [
          { name: 'snapshot', type: 'string', required: true, description: 'Snapshot token' },
          { name: 'limit', type: 'integer', required: false, description: 'Page size (1-100, default 50)' },
          { name: 'cursor', type: 'string', required: false, description: 'Pagination cursor' },
        ],
        responseExample: `{
  "data": [
    {
      "districtId": "dist_001",
      "districtName": "LA Metro",
      "recordStatus": "active",
      "regionId": "reg_001",
      "regionName": "West",
      "assignmentState": "assigned",
      "districtManager": {
        "personId": "person_001",
        "fullName": "Jane Doe",
        "lifecycle": "active",
        "workEmail": "jane.doe@example.com",
        "workEmailStatus": "available"
      },
      "issues": []
    }
  ],
  "pagination": { "limit": 50, "nextCursor": "..." },
  "sync": { 
    "mode": "full", 
    "snapshotAt": "...", 
    "contractVersion": "district-leadership-v3.1",
    "contactAccess": "work-email"
  }
}`,
        notes: [
          'Work email is only included if your token has the `district-leadership:contacts:read` scope.',
          'Without the contacts scope, `workEmailStatus` will be "not_granted".',
        ],
      },
      {
        method: 'GET',
        path: '/api/v3/district-leadership/:id',
        summary: 'Get District Leadership by ID',
        description: 'Returns leadership information for a single district by canonical district ID.',
        scope: 'district-leadership:read',
        parameters: [
          { name: 'id', type: 'string', required: true, description: 'District canonical ID' },
          { name: 'snapshot', type: 'string', required: true, description: 'Snapshot token' },
        ],
        responseExample: `{
  "data": {
    "districtId": "dist_001",
    "districtName": "LA Metro",
    "recordStatus": "active",
    "regionId": "reg_001",
    "regionName": "West",
    "assignmentState": "assigned",
    "districtManager": {
      "personId": "person_001",
      "fullName": "Jane Doe",
      "lifecycle": "active",
      "workEmail": "jane.doe@example.com",
      "workEmailStatus": "available"
    }
  },
  "sync": { "mode": "full", "snapshotAt": "...", "contractVersion": "district-leadership-v3.1" }
}`,
      },
      {
        method: 'GET',
        path: '/api/v3/location-districts',
        summary: 'List Location District Assignments',
        description: 'Returns region/district assignments for each location.',
        scope: 'district-leadership:read',
        parameters: [
          { name: 'snapshot', type: 'string', required: true, description: 'Snapshot token' },
          { name: 'limit', type: 'integer', required: false, description: 'Page size (1-100, default 50)' },
          { name: 'cursor', type: 'string', required: false, description: 'Pagination cursor' },
          { name: 'kind', type: 'string', required: false, description: 'Location types (store,warehouse,office)' },
        ],
        responseExample: `{
  "data": [
    {
      "locationId": "loc_abc123",
      "storeNumber": "07",
      "recordStatus": "active",
      "locationType": "enclosed-mall",
      "regionId": "reg_001",
      "districtId": "dist_001",
      "issues": []
    }
  ],
  "pagination": { "limit": 50, "nextCursor": "..." },
  "sync": { "mode": "full", "snapshotAt": "...", "contractVersion": "district-leadership-v3.1" }
}`,
      },
      {
        method: 'GET',
        path: '/api/v3/location-districts/:id',
        summary: 'Get Location District Assignment by ID',
        description: 'Returns region/district assignment for a single location by canonical location ID.',
        scope: 'district-leadership:read',
        parameters: [
          { name: 'id', type: 'string', required: true, description: 'Location canonical ID' },
          { name: 'snapshot', type: 'string', required: true, description: 'Snapshot token' },
        ],
        responseExample: `{
  "data": {
    "locationId": "loc_abc123",
    "storeNumber": "07",
    "recordStatus": "active",
    "locationType": "enclosed-mall",
    "regionId": "reg_001",
    "districtId": "dist_001"
  },
  "sync": { "mode": "full", "snapshotAt": "...", "contractVersion": "district-leadership-v3.1" }
}`,
      },
    ],
  },
];

export const ERROR_RESPONSE_EXAMPLE = `{
  "error": {
    "code": "invalid_token",
    "message": "A valid Bearer token is required.",
    "requestId": "req_abc123"
  }
}`;

export const RATE_LIMIT_HEADERS = [
  { name: 'X-RateLimit-Limit', description: 'Requests allowed per minute' },
  { name: 'X-RateLimit-Remaining', description: 'Requests remaining in window' },
  { name: 'X-RateLimit-Reset', description: 'Unix timestamp when window resets' },
];

export function getEndpointCount(): number {
  return API_VERSIONS.reduce((sum, v) => sum + v.endpoints.length, 0);
}

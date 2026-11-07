# Shiekh Directory API Documentation

> **Canonical Source:** `src/lib/apiDocsData.ts`  
> **Contract Baseline:** b7727f6  
> **Last Updated:** 2026-11-07

## Overview

The Shiekh Directory provides two API categories:

| Category | Authentication | Audience |
|----------|---------------|----------|
| **Consumer API (v1/v2/v3)** | Bearer token (`shk_` prefix) | LP, Claude, external integrations |
| **Internal Staff API** | Firebase Auth JWT | Admin UI, internal tools |

This document focuses on the **Consumer API**. Internal staff endpoints are listed in the [Appendix](#internal-staff-api-appendix).

---

## Base URL

```
https://shiekh-directory-v2.web.app
```

---

## Authentication

All consumer API requests require Bearer token authentication:

```bash
curl -H "Authorization: Bearer shk_your_api_token" \
     https://shiekh-directory-v2.web.app/api/v1/locations
```

**Token Format:** Tokens begin with the `shk_` prefix followed by 32 random bytes (base64url encoded).

API tokens are managed through the Admin UI. Each token is granted specific scopes that determine which endpoints are accessible.

### Available Scopes

| Scope | Description | API Version |
|-------|-------------|-------------|
| `locations:read` | Access v1 location endpoints | v1 |
| `personnel:read` | Access v2 personnel endpoints | v2 |
| `staffing:read` | Access v2 location-staffing endpoints | v2 |
| `district-leadership:read` | Access v3 district-leadership and location-districts endpoints | v3 |
| `district-leadership:contacts:read` | Include DM work email addresses in v3 responses | v3 |

---

## Error Response Format

All errors return a JSON object with an `error` field:

```json
{
  "error": {
    "code": "invalid_token",
    "message": "A valid Bearer token is required.",
    "requestId": "req_abc123"
  }
}
```

### Common Error Codes

| HTTP | Code | Description |
|------|------|-------------|
| 400 | `invalid_query` | Invalid or missing query parameters |
| 400 | `invalid_snapshot` | Snapshot token invalid for this credential |
| 400 | `invalid_cursor` | Cursor doesn't match snapshot/dataset/limit |
| 400 | `invalid_limit` | Limit must be 1-100 |
| 400 | `invalid_id` | Invalid document ID format |
| 401 | `invalid_token` | Missing or invalid API token |
| 403 | `access_denied` | Token lacks required scope |
| 404 | `record_not_found` | Document not found |
| 409 | `snapshot_expired` | Snapshot expired; restart full sync |
| 429 | `rate_limit_exceeded` | Too many requests |
| 503 | `snapshot_unavailable` | Database read failed |

---

## Rate Limiting

API requests are rate-limited per client. Check the response headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Requests allowed per minute |
| `X-RateLimit-Remaining` | Requests remaining in window |
| `X-RateLimit-Reset` | Unix timestamp when window resets |

If you exceed the limit, you'll receive a `429 Too Many Requests` response with a `Retry-After` header.

---

## v1 API: Location Directory

The v1 API provides read-only access to store location data.

**Required Scope:** `locations:read`

### GET /api/v1/location-fields

Returns all custom field definitions used across locations.

**Response:**
```json
{
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
}
```

### GET /api/v1/locations

Returns paginated list of active store locations with full details including hours and closures.

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `limit` | No | Page size (1-100, default 50) |
| `cursor` | No | Pagination cursor from previous response |
| `updatedSince` | No | ISO 8601 timestamp; filter to locations updated after this time |
| `kind` | No | Location types (comma-separated: `store`, `warehouse`, `office`) |
| `customFieldsVersion` | No | Validates custom field schema hasn't changed |
| `hierarchyVersion` | No | Validates region/district hierarchy hasn't changed |

**Response:**
```json
{
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
}
```

**Notes:**
- Use `customFieldsVersion` and `hierarchyVersion` to detect schema changes mid-sync.
- The watermark should be saved and used as `updatedSince` for delta syncs.
- Cursor is only valid within the same snapshot window (15 minutes).

> **Known Limitation:** Multi-interval hours (e.g., split shifts like 9-12 and 2-6) return only the FIRST interval. If a store has `intervals: [{open: "09:00", close: "12:00"}, {open: "14:00", close: "18:00"}]`, only `{open: "09:00", close: "12:00"}` is returned. See `server/routes/legacyV1.ts:434-437`.

### GET /api/v1/locations/:storeNumber

Returns a single location by its store number.

**Path Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `storeNumber` | Yes | Store number (e.g., "07" or "125") |

**Response:**
```json
{
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
}
```

### GET /api/v1/locations/:storeNumber/operating-state

Returns the current open/closed state based on hours, closures, and exceptions.

**Path Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `storeNumber` | Yes | Store number |

**Response:**
```json
{
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
}
```

**Notes:**
- This endpoint evaluates the current time against the schedule.
- For bulk operations, use the list endpoint and compute state locally.

---

## v2 API: Personnel & Staffing (Snapshot-First)

The v2 API uses a **snapshot-first workflow** to ensure data consistency across paginated requests.

**Required Scopes:** `personnel:read` and/or `staffing:read`

### Workflow

```
1. GET /api/v2/snapshot  →  { snapshot, snapshotAt, expiresAt }
2. GET /api/v2/personnel?snapshot={token}&limit=50  →  { data, pagination, sync }
3. GET /api/v2/personnel?snapshot={token}&cursor={nextCursor}&limit=50  →  ...
   (repeat until nextCursor is null)
```

### GET /api/v2/snapshot

Creates a point-in-time snapshot token required for personnel and staffing queries.

**Required Scope:** `personnel:read` or `staffing:read`

**Response:**
```json
{
  "snapshot": "eyJ2ZXJzaW9u...",
  "snapshotAt": "2024-01-15T12:00:00.000Z",
  "expiresAt": "2024-01-15T12:15:00.000Z",
  "contractVersion": "personnel-staffing-v2.1"
}
```

**Notes:**
- Snapshots expire after **15 minutes**.
- All queries must include a valid snapshot token.
- If a snapshot expires mid-sync, restart from the beginning.

### GET /api/v2/personnel

Returns paginated list of active personnel with their location assignments.

**Required Scope:** `personnel:read`

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `snapshot` | Yes | Snapshot token from /snapshot endpoint |
| `limit` | No | Page size (1-100, default 50) |
| `cursor` | No | Pagination cursor |

**Response:**
```json
{
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
}
```

### GET /api/v2/personnel/:id

Returns a single personnel record by canonical ID.

**Required Scope:** `personnel:read`

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `id` | Yes | Personnel canonical ID (path parameter) |
| `snapshot` | Yes | Snapshot token |

**Response:**
```json
{
  "data": {
    "id": "person_abc123",
    "fullName": "John Smith",
    "lifecycle": "active",
    "primaryLocationId": "loc_001",
    "supportedLocationIds": ["loc_002", "loc_003"]
  },
  "sync": { "mode": "full", "snapshotAt": "...", "contractVersion": "personnel-staffing-v2.1" }
}
```

### GET /api/v2/location-staffing

Returns staffing assignments for each location including SM, ASM, DM, and key holders.

**Required Scope:** `staffing:read`

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `snapshot` | Yes | Snapshot token |
| `limit` | No | Page size (1-100, default 50) |
| `cursor` | No | Pagination cursor |
| `kind` | No | Location types (store, warehouse, office) |

**Response:**
```json
{
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
}
```

### GET /api/v2/location-staffing/:id

Returns staffing assignments for a single location by canonical location ID.

**Required Scope:** `staffing:read`

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `id` | Yes | Location canonical ID (path parameter) |
| `snapshot` | Yes | Snapshot token |

**Response:**
```json
{
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
}
```

---

## v3 API: District Leadership (Snapshot-First)

The v3 API follows the same snapshot-first workflow as v2, but provides district leadership and location-district hierarchy data.

**Required Scope:** `district-leadership:read`

### Workflow

```
1. GET /api/v3/snapshot  →  { snapshot, snapshotAt, expiresAt }
2. GET /api/v3/district-leadership?snapshot={token}&limit=50  →  { data, pagination, sync }
3. GET /api/v3/location-districts?snapshot={token}&limit=50&kind=store  →  { data, pagination, sync }
```

### GET /api/v3/snapshot

Creates a point-in-time snapshot token for district leadership queries.

**Required Scope:** `district-leadership:read`

**Response:**
```json
{
  "snapshot": "eyJ2ZXJzaW9u...",
  "snapshotAt": "2024-01-15T12:00:00.000Z",
  "expiresAt": "2024-01-15T12:15:00.000Z",
  "contractVersion": "district-leadership-v3.1"
}
```

### GET /api/v3/district-leadership

Returns all districts with their assigned district managers.

**Required Scope:** `district-leadership:read`

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `snapshot` | Yes | Snapshot token |
| `limit` | No | Page size (1-100, default 50) |
| `cursor` | No | Pagination cursor |

**Response:**
```json
{
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
}
```

**Notes:**
- Work email is only included if your token has the `district-leadership:contacts:read` scope.
- Without the contacts scope, `workEmailStatus` will be `"not_granted"`.

### GET /api/v3/district-leadership/:id

Returns leadership information for a single district by canonical district ID.

**Required Scope:** `district-leadership:read`

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `id` | Yes | District canonical ID (path parameter) |
| `snapshot` | Yes | Snapshot token |

**Response:**
```json
{
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
}
```

### GET /api/v3/location-districts

Returns region/district assignments for each location.

**Required Scope:** `district-leadership:read`

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `snapshot` | Yes | Snapshot token |
| `limit` | No | Page size (1-100, default 50) |
| `cursor` | No | Pagination cursor |
| `kind` | No | Location types (store, warehouse, office) |

**Response:**
```json
{
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
}
```

### GET /api/v3/location-districts/:id

Returns region/district assignment for a single location by canonical location ID.

**Required Scope:** `district-leadership:read`

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `id` | Yes | Location canonical ID (path parameter) |
| `snapshot` | Yes | Snapshot token |

**Response:**
```json
{
  "data": {
    "locationId": "loc_abc123",
    "storeNumber": "07",
    "recordStatus": "active",
    "locationType": "enclosed-mall",
    "regionId": "reg_001",
    "districtId": "dist_001"
  },
  "sync": { "mode": "full", "snapshotAt": "...", "contractVersion": "district-leadership-v3.1" }
}
```

---

## Best Practices

### Snapshot Management

1. **Always complete a full sync** - Don't mix data from different snapshots
2. **Handle expiration gracefully** - If you receive `snapshot_expired`, restart the entire sync
3. **Use consistent page sizes** - The cursor is tied to the limit; changing limits invalidates cursors

### Pagination

1. **Continue until nextCursor is null** - This indicates you've fetched all records
2. **Don't skip pages** - Process all pages to ensure complete data
3. **Retry on transient errors** - Network errors should be retried with exponential backoff

### Data Reconciliation

1. **Treat snapshots atomically** - Replace your local dataset entirely, or not at all
2. **Check sync.mode** - Currently always `full`; future versions may support incremental sync
3. **Validate contractVersion** - Log warnings if version changes unexpectedly

### Canonical ID Joins

All IDs (locationId, personId, districtId, regionId) are canonical Firestore document IDs. Use these to join data across API versions:

- v1 `data[].id` = v2 `locationId` = v3 `locationId`
- v2 `personId` = v3 `districtManager.personId`
- v2 `regionId`/`districtId` = v3 `regionId`/`districtId`

---

## Internal Staff API Appendix

The following endpoints are used by the internal web application and require Firebase Auth JWT authentication. They are **not accessible** with consumer API tokens.

### Route Prefix: `/api/app/*`

| Category | Endpoints | Permission |
|----------|-----------|------------|
| Locations | GET/PATCH locations, closures, notices | Varies by action |
| People | GET/POST/PATCH people, assignments | Leader+ |
| Corrections | GET/POST corrections, approve/reject | Steward+ |
| Verification | GET/POST verification requests | Admin |
| Hours Templates | GET/POST/PATCH templates, apply | Steward+ |
| Email Settings | GET/PUT email config, SMTP, templates | Admin |
| Workflow Rules | GET/PATCH/DELETE rules | Admin |
| API Clients | GET/POST/DELETE client tokens | Admin |
| Backups | GET/POST/DELETE snapshots | Admin |
| Admin | User management, imports | Admin |

See route files in `server/routes/` for complete endpoint documentation:
- `locations.ts`, `people.ts`, `corrections.ts`
- `verification.ts`, `hoursTemplates.ts`
- `emailSettings.ts`, `workflowRules.ts`
- `apiClients.ts`, `backup.ts`, `admin.ts`

### Store Sessions: `/api/store-auth/*`

Passwordless sign-in for store employees. Used by store portal, not consumer integrations.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-11-07 | Fixed v2 snapshot method (GET not POST), added missing single-item endpoints, documented multi-interval hours limitation |
| 2026-10-31 | Initial v2 deployment documentation |

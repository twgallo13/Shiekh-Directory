# Shiekh Directory API Documentation

## Overview

The Shiekh Directory API provides programmatic access to store locations, personnel, staffing assignments, and district leadership data. The API supports three versions:

- **v1**: Simple token-based authentication for read-only location data
- **v2**: Snapshot-first workflow for personnel and staffing data
- **v3**: Snapshot-first workflow for district leadership and location-district mappings

## Authentication

All API requests require Bearer token authentication:

```
Authorization: Bearer sk-xxxx...
```

API tokens are managed through the Admin UI. Each token is granted specific scopes that determine which endpoints are accessible.

### Available Scopes

| Scope | Description |
|-------|-------------|
| `locations:read` | Access v1 location endpoints |
| `personnel:read` | Access v2 personnel endpoint |
| `staffing:read` | Access v2 location-staffing endpoint |
| `district-leadership:read` | Access v3 district-leadership and location-districts endpoints |
| `district-leadership:contacts:read` | Include work email addresses in district-leadership responses |

---

## v2 API: Personnel & Staffing (Snapshot-First)

The v2 API uses a **snapshot-first workflow** to ensure data consistency across paginated requests. All clients must obtain a snapshot token before fetching data.

### Workflow

```
1. POST /api/v2/snapshot  →  { snapshot, snapshotAt, expiresAt }
2. GET /api/v2/personnel?snapshot={token}&limit=50  →  { data, pagination, sync }
3. GET /api/v2/personnel?snapshot={token}&cursor={nextCursor}&limit=50  →  ...
   (repeat until nextCursor is null)
```

### Step 1: Create Snapshot

```
GET /api/v2/snapshot
```

**Response:**
```json
{
  "snapshot": "eyJhbGciOiJIUzI1NiIs...",
  "snapshotAt": "2026-10-31T12:00:00.000Z",
  "expiresAt": "2026-10-31T12:15:00.000Z",
  "contractVersion": "personnel-staffing-v2.1"
}
```

- Snapshots expire after 15 minutes
- The same snapshot must be used for all pages of a dataset
- If the snapshot expires mid-sync, restart from step 1

### Step 2: Fetch Personnel

```
GET /api/v2/personnel?snapshot={token}&limit=50
```

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `snapshot` | Yes | The snapshot token from step 1 |
| `limit` | No | Page size (1-100, default 50) |
| `cursor` | No | Pagination cursor from previous response |

**Response:**
```json
{
  "data": [
    {
      "personId": "per-abc123",
      "fullName": "John Smith",
      "lifecycle": "active",
      "primaryAssignment": {
        "role": "SM",
        "locationId": "loc-007",
        "storeNumber": "007"
      }
    }
  ],
  "pagination": {
    "limit": 50,
    "nextCursor": "eyJhZnRlciI6InBlci..."
  },
  "sync": {
    "mode": "full",
    "snapshotAt": "2026-10-31T12:00:00.000Z",
    "contractVersion": "personnel-staffing-v2.1"
  }
}
```

### Step 3: Fetch Location Staffing

```
GET /api/v2/location-staffing?snapshot={token}&limit=50&kind=store
```

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `snapshot` | Yes | The snapshot token from step 1 |
| `limit` | No | Page size (1-100, default 50) |
| `cursor` | No | Pagination cursor from previous response |
| `kind` | No | Location kind filter: `store`, `warehouse`, `office` (default: `store`) |

**Response:**
```json
{
  "data": [
    {
      "locationId": "loc-007",
      "storeNumber": "007",
      "storeName": "Downtown Mall",
      "recordStatus": "active",
      "regionId": "reg-west",
      "districtId": "dist-la",
      "staffing": {
        "storeManager": {
          "personId": "per-sm1",
          "fullName": "Jane Doe",
          "slot": "primary",
          "startDate": "2024-01-15"
        },
        "assistantManagers": [...],
        "keyHolders": [...]
      },
      "positionStatus": {
        "sm": { 
          "status": "filled", 
          "holders": [
            { "personId": "per-sm1", "fullName": "Jane Doe", "capacity": "primary", "slot": "primary" }
          ]
        },
        "asm": { "status": "vacant", "holders": [] },
        "kh": { "status": "filled", "holders": [...] },
        "dm": { "status": "filled", "holders": [...] },
        "rm": { "status": "vacant", "holders": [] }
      }
    }
  ],
  "pagination": { "limit": 50, "nextCursor": null },
  "sync": {
    "mode": "full",
    "snapshotAt": "2026-10-31T12:00:00.000Z",
    "contractVersion": "personnel-staffing-v2.1"
  }
}
```

### Position Status Fields

The `positionStatus` object provides structured vacancy information for each position type:

| Field | Description |
|-------|-------------|
| `status` | `"filled"` if at least one holder exists, `"vacant"` otherwise |
| `holders` | Array of current holders with their capacity and slot |

### Holder Capacity Values

| Capacity | Description |
|----------|-------------|
| `primary` | Fully trained and in full capacity (default) |
| `training` | Person is in training for this role |
| `acting` | Person is acting/temporary in this role |

---

## v3 API: District Leadership (Snapshot-First)

The v3 API follows the same snapshot-first workflow as v2, but provides district leadership and location-district hierarchy data.

### Workflow

```
1. GET /api/v3/snapshot  →  { snapshot, snapshotAt, expiresAt }
2. GET /api/v3/district-leadership?snapshot={token}&limit=50  →  { data, pagination, sync }
3. GET /api/v3/location-districts?snapshot={token}&limit=50&kind=store  →  { data, pagination, sync }
```

### Step 1: Create Snapshot

```
GET /api/v3/snapshot
```

**Response:**
```json
{
  "snapshot": "eyJhbGciOiJIUzI1NiIs...",
  "snapshotAt": "2026-10-31T12:00:00.000Z",
  "expiresAt": "2026-10-31T12:15:00.000Z",
  "contractVersion": "district-leadership-v3.1"
}
```

### Step 2: Fetch District Leadership

```
GET /api/v3/district-leadership?snapshot={token}&limit=50
```

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `snapshot` | Yes | The snapshot token from step 1 |
| `limit` | No | Page size (1-100, default 50) |
| `cursor` | No | Pagination cursor from previous response |

**Response:**
```json
{
  "data": [
    {
      "districtId": "dist-la",
      "districtName": "Los Angeles",
      "recordStatus": "active",
      "regionId": "reg-west",
      "regionName": "West Region",
      "regionStatus": "active",
      "assignmentState": "assigned",
      "districtManager": {
        "personId": "per-dm1",
        "fullName": "Alex Johnson",
        "lifecycle": "active",
        "workEmail": "alex.johnson@shiekhshoes.com",
        "workEmailStatus": "available",
        "issues": []
      },
      "issues": []
    }
  ],
  "pagination": { "limit": 50, "nextCursor": null },
  "sync": {
    "mode": "full",
    "snapshotAt": "2026-10-31T12:00:00.000Z",
    "contractVersion": "district-leadership-v3.1",
    "contactAccess": "work-email"
  }
}
```

**Contact Access:**
The `sync.contactAccess` field indicates the level of contact information access:
- `work-email`: Client has `district-leadership:contacts:read` scope; work emails included when available
- `none`: Client does not have contacts scope; work emails are not included

**Work Email Status Values:**
| Status | Description |
|--------|-------------|
| `available` | Work email present and from approved domain |
| `not_granted` | Client lacks `district-leadership:contacts:read` scope |
| `withheld_inactive` | Person is inactive; email withheld |
| `withheld_unknown_lifecycle` | Person lifecycle unknown; email withheld |
| `missing` | Person has no work email on file |
| `unapproved_domain` | Work email is not from @shiekhshoes.com or @shiekhshoes.org |
| `unresolved_person` | Person record not found |

### Step 3: Fetch Location-Districts

```
GET /api/v3/location-districts?snapshot={token}&limit=50&kind=store
```

**Query Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `snapshot` | Yes | The snapshot token from step 1 |
| `limit` | No | Page size (1-100, default 50) |
| `cursor` | No | Pagination cursor from previous response |
| `kind` | No | Location kind filter: `store`, `warehouse`, `office`, or comma-separated (default: `store`) |

**Response:**
```json
{
  "data": [
    {
      "locationId": "loc-007",
      "storeNumber": "007",
      "recordStatus": "active",
      "locationType": "enclosed-mall",
      "hierarchyApplicability": "Applicable",
      "regionId": "reg-west",
      "districtId": "dist-la",
      "issues": []
    }
  ],
  "pagination": { "limit": 50, "nextCursor": null },
  "sync": {
    "mode": "full",
    "snapshotAt": "2026-10-31T12:00:00.000Z",
    "contractVersion": "district-leadership-v3.1",
    "contactAccess": "work-email"
  }
}
```

**Location Type Values:**
| Type | Description |
|------|-------------|
| `enclosed-mall` | Mall or enclosed shopping center |
| `strip-center` | Strip mall or shopping center |
| `street-standalone` | Street-level standalone location |
| `outlet` | Outlet location |
| `warehouse` | Warehouse facility |
| `office` | Corporate office |
| `unclassified` | Store type not recognized |

---

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "error_code",
    "message": "Human-readable description",
    "requestId": "req-abc123"
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
| 401 | `unauthorized` | Missing or invalid API token |
| 403 | `access_denied` | Token lacks required scope |
| 404 | `record_not_found` | Document not found at snapshot |
| 409 | `snapshot_expired` | Snapshot expired; restart full sync |
| 503 | `snapshot_unavailable` | Database read failed; do not reconcile partial results |

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

---

## Rate Limits

- **1000 requests per minute** per API client
- Snapshot creation: **10 per minute** per API client
- Rate limit responses return HTTP 429 with `Retry-After` header

# Legacy API Field Mapping (v1/v2/v3)

This document maps legacy API fields to the new rebuild model, enabling the rebuild server to serve legacy-compatible responses.

## Authentication

### Legacy
- Bearer token authentication via `Authorization: Bearer <token>`
- API clients managed in Firestore `api_clients` and `api_client_tokens` collections
- Scopes: `locations:read`, `personnel:read`, `staffing:read`, `district-leadership:read`

### Rebuild Strategy
- Implement compatible Bearer token middleware
- For now, accept a shared test token for fixture tests
- Production would integrate with existing API client authentication

---

## v1 - Directory API (`/api/v1`)

### Required Scope: `locations:read`

### Endpoints

| Legacy Endpoint | Rebuild Route |
|----------------|---------------|
| `GET /api/v1/locations` | `GET /api/v1/locations` |
| `GET /api/v1/locations/:storeNumber` | `GET /api/v1/locations/:storeNumber` |
| `GET /api/v1/locations/:storeNumber/operating-state` | `GET /api/v1/locations/:storeNumber/operating-state` |
| `GET /api/v1/location-fields` | `GET /api/v1/location-fields` |

### Location List Response (`GET /api/v1/locations`)

```json
{
  "data": [...],
  "sync": {
    "watermark": "ISO timestamp",
    "mode": "full" | "delta",
    "customFieldsVersion": "sha256",
    "hierarchyVersion": "sha256",
    "fullReconciliationRequired": true
  },
  "pagination": {
    "limit": 50,
    "nextCursor": "opaque" | null
  }
}
```

### Location Object Field Mapping

| Legacy Field | Rebuild Source | Notes |
|--------------|---------------|-------|
| `id` | `location.id` | Document ID |
| `storeNumber` | `location.storeNumber` | Keep leading zeros, e.g., "007" |
| `recordStatus` | Always `"Active"` | Only active locations returned |
| `name` | `location.name` | |
| `type` | `location.storeType` | Optional |
| `mallOrCenterName` | `location.mallOrCenterName` | Optional |
| `address` | `location.address.street` | Street address line |
| `suite` | `location.address.suite` | Optional, max 100 chars |
| `city` | `location.address.city` | |
| `state` | `location.address.state` | |
| `zipCode` | `location.address.zip` | |
| `timeZone` | `location.timeZone` | IANA timezone |
| `phone` | `location.mainPhone` | Only if `phonePublic` is true |
| `phonePrivacy` | `"Public"` or `"Private"` | Based on `phonePublic` |
| `locationInboxEmail` | `location.sharedInboxEmail` | Normalized or null |
| `district` | Legacy compatibility field | |
| `regionId` | `region.id` | From location's region |
| `regionName` | `region.name` | |
| `regionStatus` | `"Active"` | |
| `districtId` | `district.id` or `district.code` | |
| `districtName` | `district.name` | |
| `districtStatus` | `"Active"` | |
| `hierarchyStatus` | `"resolved"` | Or other status values |
| `hierarchyIssues` | `[]` | Array of issue strings |
| `hierarchyApplicability` | `"Applicable"` | |
| `operationalStatus` | `location.lifecycle` | |
| `lastVerifiedAt` | `location.lastVerifiedAt` | Optional ISO timestamp |
| `slug` | Generated from storeNumber | Optional |
| `googleReviewUrl` | `null` | Custom metadata, not in rebuild |
| `storePageUrl` | `null` | Custom metadata, not in rebuild |
| `customMetadata` | `{}` | Custom fields not in rebuild MVP |
| `updatedAt` | `location.updatedAt` | ISO timestamp |
| `wayfindingDirections` | `location.wayfindingDirections` | Optional, max 1000 chars |

### Standard Hours Mapping

| Legacy Field | Rebuild Source |
|--------------|---------------|
| `standardHours.monday.isClosed` | `location.standardHours.monday.closed` |
| `standardHours.monday.open` | `location.standardHours.monday.intervals[0].open` |
| `standardHours.monday.close` | `location.standardHours.monday.intervals[0].close` |
| (same for all days) | |

### Hours Overrides Mapping

| Legacy Type | Legacy Fields | Rebuild Source |
|-------------|--------------|---------------|
| `holidayHours[]` | `id`, `holidayName`, `date`, `hours` | `hoursExceptions` where `type='holiday'` |
| `specialHours[]` | `id`, `description`, `startDate`, `endDate`, `hours` | `hoursExceptions` where `type='special'` |

### Active Notice Mapping

| Legacy Field | Rebuild Source | Notes |
|--------------|---------------|-------|
| `activeNotice.shortDescription` | `closure.reason` | From active closure |
| `activeNotice.effectiveDate` | `closure.startsAt` | Start date |
| `activeNotice.expectedResolutionDate` | `closure.endsAt` | End date if set |
| `activeNotice.displayUntilDate` | `null` | Not in rebuild |

### Operating State Response (`GET /api/v1/locations/:storeNumber/operating-state`)

```json
{
  "contract": "location-operating-state-v1",
  "data": {
    "locationId": "string",
    "storeNumber": "string",
    "state": "Open" | "Closed" | "Unknown",
    "reason": "string",
    "scheduleSource": "standard" | "exception" | "closure" | "unknown",
    "hours": { "open": "HH:MM", "close": "HH:MM", "isClosed": boolean } | null,
    "localDate": "YYYY-MM-DD",
    "timeZone": "IANA",
    "evaluatedAt": "ISO timestamp",
    "nextTransitionAt": "ISO timestamp" | null,
    "temporaryClosure": { "id", "reason", "startsAt", "expiresAt", "timeZone" } | null,
    "issues": []
  }
}
```

| Legacy Field | Rebuild Source |
|--------------|---------------|
| `state` | From `computeOperatingState()` |
| `reason` | Computed description |
| `scheduleSource` | From `DaySchedule.source` |
| `hours` | From computed hours |
| `localDate` | Current date in location timezone |
| `timeZone` | `location.timeZone` |
| `temporaryClosure` | Active `Closure` if any |

---

## v2 - Personnel/Staffing API (`/api/v2`)

### Required Scopes: `personnel:read`, `staffing:read`

### Endpoints

| Legacy Endpoint | Scope Required |
|----------------|---------------|
| `GET /api/v2/snapshot` | Either scope |
| `GET /api/v2/personnel` | `personnel:read` |
| `GET /api/v2/personnel/:id` | `personnel:read` |
| `GET /api/v2/location-staffing` | `staffing:read` |
| `GET /api/v2/location-staffing/:id` | `staffing:read` |

### Snapshot Response

```json
{
  "snapshot": "signed token",
  "snapshotAt": "ISO timestamp",
  "expiresAt": "ISO timestamp",
  "contractVersion": "personnel-staffing-v2.1"
}
```

### Personnel Object Mapping

| Legacy Field | Rebuild Source | Notes |
|--------------|---------------|-------|
| `id` | `person.id` | Document ID |
| `fullName` | `person.fullName` | |
| `lifecycle` | `person.lifecycle` | `'active'` or `'inactive'` |
| `primaryLocationId` | First active location assignment | From assignments |
| `supportedLocationIds` | Other location assignments | Array |
| `issues` | `[]` | Validation issues |

### Location Staffing Object Mapping

| Legacy Field | Rebuild Source | Notes |
|--------------|---------------|-------|
| `locationId` | `location.id` | |
| `storeNumber` | `location.storeNumber` | Keep leading zeros |
| `recordStatus` | `'active'` / `'retired'` / `'planned'` | From lifecycle |
| `regionId` | `region.id` | |
| `districtId` | `district.id` | |
| `hierarchy.regionName` | `region.name` | |
| `hierarchy.districtName` | `district.name` | |
| `storeManagerId` | Person ID with SM+primary assignment | |
| `districtManagerId` | Person ID with DM assignment | |
| `regionalManagerId` | Person ID with RM assignment | |
| `assistantStoreManagerIds` | Person IDs with ASM assignment | Array |
| `keyHolderIds` | Person IDs with KH assignment | Array |
| `staffing.storeManager` | Resolved person reference | |
| `staffing.districtManager` | Resolved person reference | |
| `staffing.regionalManager` | Resolved person reference | |
| `staffing.assistantStoreManagers` | Array of resolved persons | |
| `staffing.keyHolders` | Array of resolved persons | |
| `positionStatus.sm` | Position status object | New field with status and holders |
| `positionStatus.asm` | Position status object | New field with status and holders |
| `positionStatus.kh` | Position status object | New field with status and holders |
| `positionStatus.dm` | Position status object | New field with status and holders |
| `positionStatus.rm` | Position status object | New field with status and holders |
| `issues` | `[]` | Validation issues |

### Position Status Object

The `positionStatus` object provides structured vacancy and multi-holder information:

```json
{
  "sm": {
    "status": "filled" | "vacant",
    "holders": [
      {
        "personId": "string",
        "fullName": "string" | null,
        "capacity": "primary" | "training" | "acting",
        "slot": "primary" | "additional",
        "issues": []
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `status` | `"filled"` when at least one holder exists, `"vacant"` otherwise |
| `holders` | Array of all current holders for this position |
| `holders[].capacity` | `"primary"` (default), `"training"`, or `"acting"` |
| `holders[].slot` | Assignment slot: `"primary"` or `"additional"` |

### Person Reference Object

```json
{
  "personId": "string",
  "fullName": "string" | null,
  "lifecycle": "active" | "inactive" | "unknown",
  "issues": []
}
```

---

## v3 - District Leadership API (`/api/v3`)

### Required Scope: `district-leadership:read`

### Endpoints

| Legacy Endpoint |
|----------------|
| `GET /api/v3/snapshot` |
| `GET /api/v3/district-leadership` |
| `GET /api/v3/district-leadership/:id` |
| `GET /api/v3/location-districts` |
| `GET /api/v3/location-districts/:id` |

### District Leadership Object Mapping

| Legacy Field | Rebuild Source | Notes |
|--------------|---------------|-------|
| `districtId` | `district.id` | |
| `districtName` | `district.name` | |
| `recordStatus` | `'active'` / `'retired'` | From lifecycle |
| `regionId` | `district.regionId` | |
| `regionName` | `region.name` | Resolved |
| `regionStatus` | `'active'` | |
| `assignmentState` | `'assigned'` / `'vacant'` / `'unmanaged'` | Based on DM assignment |
| `districtManager` | Resolved DM reference or null | |
| `districtManager.workEmail` | Person's workEmail | If `district-leadership:contacts:read` scope |
| `districtManager.workEmailStatus` | Status code | |
| `issues` | `[]` | |

### Location Districts Object Mapping

| Legacy Field | Rebuild Source |
|--------------|---------------|
| `locationId` | `location.id` |
| `storeNumber` | `location.storeNumber` |
| `recordStatus` | Mapped from lifecycle |
| `locationType` | From `location.storeType` |
| `hierarchyApplicability` | `'Applicable'` |
| `regionId` | `location.regionId` |
| `districtId` | `location.districtId` |
| `issues` | `[]` |

---

## Key Mapping Decisions

### Store Numbers
- **Preserve exact strings** including leading zeros
- Store "007" stays "007", never becomes 7 or "7"

### Record Status Mapping
| Rebuild `lifecycle` | Legacy `recordStatus` |
|--------------------|----------------------|
| `'active'` | `'Active'` or `'active'` |
| `'planned'` | `'Planned'` or `'planned'` |
| `'retired'` | `'Retired'` or `'retired'` |

### Person Lifecycle Mapping
| Rebuild `lifecycle` | Legacy `lifecycle` |
|--------------------|-------------------|
| `'active'` | `'active'` |
| `'inactive'` | `'inactive'` |

### Hours Format
- Legacy uses `isClosed` (boolean)
- Rebuild uses `closed` (boolean)
- Legacy uses single `open`/`close` strings
- Rebuild uses `intervals[]` array
- Map first interval to legacy format

### Timezone Handling
- All timestamps in ISO 8601 format with timezone
- Local dates/times use location's IANA timezone
- Operating state evaluates in location's local time

---

## Error Response Format

All errors use consistent JSON shape:

```json
{
  "error": {
    "code": "error_code",
    "message": "Human-readable message",
    "requestId": "uuid"
  }
}
```

### Common Error Codes
- `invalid_token` - Authentication failed (401)
- `insufficient_scope` - Missing required scope (403)
- `rate_limit_exceeded` - Too many requests (429)
- `location_not_found` - Store not found (404)
- `invalid_limit` - Bad pagination limit (400)
- `invalid_cursor` - Bad pagination cursor (400)
- `snapshot_expired` - Snapshot too old (409)

---

## Assignment Capacity

Assignments now support a `capacity` field indicating the holder's status:

| Capacity | Description | UI Badge |
|----------|-------------|----------|
| `primary` | Full capacity, fully trained (default) | None |
| `training` | Person is in training | "In Training" badge |
| `acting` | Acting/temporary assignment | "Acting" badge |

### Import Capacity Field

The CSV importer accepts an optional `capacity` column:
- Valid values: `primary`, `training`, `acting`
- Blank or invalid values default to `primary`
- Positions with no assignment rows display as `VACANT` in exports

### Export Vacancy Display

Print and CSV exports show vacancy status:
- **CSV**: Position columns contain `VACANT` when no holder assigned
- **Print view**: Red "VACANT" badge displayed for empty positions
- This applies to: StoreManager, DistrictManager, AssistantStoreManagers, KeyHolders

---

## Assumptions Made

1. **Custom metadata**: Not implemented in rebuild MVP; return empty `{}` and version hash of empty array
2. **Custom fields endpoint**: Returns empty fields array with static version
3. **Phone privacy**: Default to public unless explicitly marked private in rebuild
4. **Legacy district field**: Generate from districtId/districtName for compatibility
5. **Hierarchy applicability**: Default to "Applicable" for stores
6. **Work email in v3**: Requires explicit `district-leadership:contacts:read` scope grant
7. **Snapshot TTL**: 15 minutes as in legacy
8. **Assignment capacity**: Defaults to `primary` for existing and imported assignments without explicit capacity

---

## Test Fixtures

Test fixtures should verify:
1. Store number "007" remains "007" in all responses
2. Pagination cursors work correctly
3. Hours format converts correctly (intervals to open/close)
4. Operating state computes correctly
5. Staffing assignments map to correct roles
6. District leadership shows correct DM assignments

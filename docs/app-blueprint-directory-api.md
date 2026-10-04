# Store information available to a new app

This is a plain-language reference for planning an app that reads stores from the existing Shiekh Directory API. The API is read-only: it can give the app published store information, but it cannot create or edit stores.

For a compact technical allowlist of the emitted JSON shapes, see the [response-schema reference](api-response-schema.md).

## What has and has not been checked

**Checked live on 2026-10-04:** the production host `https://shiekh-dir.ai.studio` answered requests to the store list, single-store, and field-catalog routes. Each request returned `401 invalid_token` because no authorized API credential was available for this check. This confirms that the routes require access; it does **not** verify a successful live store payload, the live data values, or that production is running the same revision as the workspace code.

**Documented from the current workspace code and automated tests:** the field names, filtering and shaping rules, pagination, and access behavior below. Examples are invented to illustrate the format; they are not live store data. Before finalizing an app integration, have an authorized owner verify a successful response and the published custom-field list.

## Access and endpoints

The API is intended for an app's trusted server, not for a public browser app. An authorized System Administrator can provision a managed Directory API client. The app must send its secret token in the `Authorization` header using the Bearer scheme, and the client must have the `locations:read` permission. Keep that token in the app server's secret storage; never embed it in browser code or a downloadable app.

The API provides these read endpoints:

| Request | What it does |
| --- | --- |
| `GET /api/v1/locations` | Lists active stores, in pages. |
| `GET /api/v1/locations/{storeNumber}` | Returns one active store by its exact store number. Keep leading zeroes: store `007` is not `7`. |
| `GET /api/v1/location-fields` | Lists the custom fields that are currently approved for API publication. |

All endpoints require the same credential. The API is not an anonymous public data feed.

## Fields on each store

The list endpoint returns store objects inside `data`. The detail endpoint wraps its one store in `data`. “Always included” below means the property is present in the JSON store object; some always-included hierarchy properties can have a `null` value. “Can be absent” means the property is left out when there is no acceptable value or it is not allowed to be shared.

Examples in the table are illustrative only.

### Always included

| Exact API field name | Plain-language meaning | Example | Availability |
| --- | --- | --- | --- |
| `id` | Directory's internal store-record ID. Use `storeNumber` as the business-facing store identity. | `"id": "loc-07"` | Always included as a string. |
| `storeNumber` | Store number, kept as text so leading zeroes are preserved. | `"storeNumber": "007"` | Always included as a string for a successful list run. The API rejects missing or duplicate store-number identities rather than providing a reliable record-ID substitute. |
| `recordStatus` | Publication status of this returned record. The API only returns active records. | `"recordStatus": "Active"` | Always `"Active"` in a returned store object; retired and draft records are not returned. |
| `updatedAt` | When the Directory's store record was last updated. Used for incremental synchronization. | `"updatedAt": "2026-10-03T18:45:00.000Z"` | Always included as an ISO timestamp string. It is the record's database update time. |
| `locationInboxEmail` | Shared contact mailbox owned by the Location, not by an employee and not used to sign in. | `"locationInboxEmail": "store@example.test"` | Always included by this API revision as a string or `null`. `null` means there is no usable published inbox; older server revisions may omit the property. |
| `customMetadata` | Container for approved custom store fields. The keys inside depend on the current published field catalog. | `"customMetadata": {"yelpUrl": "https://example.test/store"}` | Always included as an object. It can be `{}` if no custom values qualify for publication. |
| `regionId` | Store's canonical Region identifier. | `"regionId": "reg-west"` | Always included; may be `null` when unassigned or the reference is not usable. |
| `regionName` | Region name looked up from the Directory's Region registry. | `"regionName": "West"` | Always included; may be `null` if the Region is not assigned or found. |
| `regionStatus` | Whether the referenced Region is active or retired. | `"regionStatus": "Active"` | Always included; may be `null` if there is no matching registry entry. |
| `districtId` | Store's canonical District identifier. Treat it as text; `"01"` is different from `"1"`. | `"districtId": "01"` | Always included; may be `null` when unassigned or the reference is not usable. |
| `districtName` | District name looked up from the Directory's District registry. | `"districtName": "District One"` | Always included; may be `null` if the District is not assigned or found. |
| `districtStatus` | Whether the referenced District is active or retired. | `"districtStatus": "Active"` | Always included; may be `null` if there is no matching registry entry. |
| `hierarchyStatus` | A summary of whether Region/District references are consistent. | `"hierarchyStatus": "resolved"` | Always included. Values: `unassigned`, `resolved`, `retired-reference`, `unresolved-reference`, `parent-mismatch`. |
| `hierarchyIssues` | Explanations of missing, retired, or inconsistent Region/District references. | `"hierarchyIssues": []` | Always included as an array; it may be empty. |
| `hierarchyApplicability` | Whether Region/District hierarchy is considered applicable to this location. This is the effective value, not necessarily the raw saved value. | `"hierarchyApplicability": "Applicable"` | Always included. Values: `"Applicable"`, `"Not Applicable"`, or `"Unknown"`. |
| `applicabilityIssues` | Explanations of a questionable or unsupported hierarchy-applicability value. | `"applicabilityIssues": []` | Always included as an array; it may be empty. |

Region and District names are resolved from the canonical registries at read time. A retired reference can still have its name and a `"Retired"` status. Do not use the name alone as a stable identifier; use the corresponding `regionId` or `districtId`.

### Optional top-level store fields

These fields are included only if the Directory has a string value for them. A missing property means no usable string was published; consumers should not assume an empty string or substitute a made-up default.

| Exact API field name | Plain-language meaning | Example | Availability |
| --- | --- | --- | --- |
| `name` | Store's display name. | `"name": "Westside Mall"` | Can be absent. |
| `type` | Location category, such as mall, standalone store, office, or warehouse. | `"type": "Enclosed Mall"` | Can be absent. |
| `mallOrCenterName` | Name of the mall or shopping center, when applicable. | `"mallOrCenterName": "Westside Mall"` | Can be absent. |
| `address` | Street address. | `"address": "100 Main Street"` | Can be absent. |
| `city` | City. | `"city": "Los Angeles"` | Can be absent. |
| `state` | State or region abbreviation/name. | `"state": "CA"` | Can be absent. |
| `zipCode` | Postal/ZIP code. | `"zipCode": "90001"` | Can be absent. |
| `timeZone` | Store's time-zone name, used to interpret its local hours. | `"timeZone": "America/Los_Angeles"` | Can be absent. |
| `district` | Legacy district text retained for compatibility. It is not the canonical District lookup; use `districtId` and `districtName` for that. | `"district": "District One"` | Can be absent. |
| `operationalStatus` | Operational state recorded for the store. | `"operationalStatus": "Open — Normal Operations"` | Can be absent. |
| `lastVerifiedAt` | Last-verification date/text saved on the store. | `"lastVerifiedAt": "2026-09-30"` | Can be absent. |
| `slug` | Optional URL-friendly store identifier. | `"slug": "westside-mall"` | Can be absent. |
| `googleReviewUrl` | Manually stored Google review link. Its presence does not mean the API retrieves Google reviews. | `"googleReviewUrl": "https://example.test/reviews"` | Can be absent. |
| `storePageUrl` | Manually stored public store-page link. | `"storePageUrl": "https://example.test/stores/westside"` | Can be absent. |

### Contact privacy fields

The shared `locationInboxEmail` above is intentionally part of the authorized Location projection. It is not an employee or account email, and its presence does not make personnel emails public.

| Exact API field name | Plain-language meaning | Example | Availability |
| --- | --- | --- | --- |
| `phone` | Store phone number. | `"phone": "555-0107"` | Can be absent if no phone is stored, or if `phonePrivacy` is not `"Public"`. If no privacy value is stored, a string phone number is allowed through. |
| `phonePrivacy` | Directory's privacy label for the phone number. | `"phonePrivacy": "Public"` | Can be absent. When present as a string, it is returned even when the phone number itself is withheld. |

### Hours and notices

These are nested objects, not flat text fields. The API copies only the properties listed here and filters out unexpected nested data.

| Exact API field name | Plain-language meaning | Example | Availability |
| --- | --- | --- | --- |
| `standardHours` | Weekly schedule. Only weekdays with a valid `isClosed` value are included. | `"standardHours": {"monday": {"isClosed": false, "open": "10:00", "close": "20:00"}}` | Can be absent if no weekday has a valid schedule. |
| `activeNotice` | Current temporary store notice. | `"activeNotice": {"shortDescription": "Entrance on Oak Street", "effectiveDate": "2026-10-01"}` | Can be absent if no accepted string notice fields exist. |
| `holidayHours` | Holiday-specific hours. | `"holidayHours": [{"id": "holiday-1", "holidayName": "Thanksgiving", "date": "2026-11-26", "hours": {"isClosed": true}}]` | Can be absent. If the source is an array, the API returns an array, which may be empty after filtering invalid entries. |
| `specialHours` | Other date-range hours, such as a temporary schedule change. | `"specialHours": [{"id": "special-1", "description": "Renovation", "startDate": "2026-10-10", "endDate": "2026-10-12", "hours": {"isClosed": true}}]` | Can be absent. If the source is an array, the API returns an array, which may be empty after filtering invalid entries. |

The exact nested field names are:

| Exact nested API field name | Meaning and example | Availability |
| --- | --- | --- |
| `standardHours.monday`, `standardHours.tuesday`, `standardHours.wednesday`, `standardHours.thursday`, `standardHours.friday`, `standardHours.saturday`, `standardHours.sunday` | The schedule for the named weekday; for example, `standardHours.monday` could be `{"isClosed": false, "open": "10:00", "close": "20:00"}`. | Each weekday can be absent independently. |
| `standardHours.monday.isClosed`, `standardHours.tuesday.isClosed`, `standardHours.wednesday.isClosed`, `standardHours.thursday.isClosed`, `standardHours.friday.isClosed`, `standardHours.saturday.isClosed`, `standardHours.sunday.isClosed` | Whether the corresponding weekday is closed; e.g. `"standardHours.monday.isClosed": false`. | Required for that weekday object to be included. |
| `standardHours.monday.open`, `standardHours.tuesday.open`, `standardHours.wednesday.open`, `standardHours.thursday.open`, `standardHours.friday.open`, `standardHours.saturday.open`, `standardHours.sunday.open` | Opening time for the corresponding weekday; e.g. `"standardHours.monday.open": "10:00"`. | Each can be absent; included only when it is a string. |
| `standardHours.monday.close`, `standardHours.tuesday.close`, `standardHours.wednesday.close`, `standardHours.thursday.close`, `standardHours.friday.close`, `standardHours.saturday.close`, `standardHours.sunday.close` | Closing time for the corresponding weekday; e.g. `"standardHours.monday.close": "20:00"`. | Each can be absent; included only when it is a string. |
| `activeNotice.shortDescription` | Notice text; e.g. `"activeNotice.shortDescription": "Entrance on Oak Street"`. | Optional; only a string is returned. |
| `activeNotice.effectiveDate` | When the notice takes effect; e.g. `"activeNotice.effectiveDate": "2026-10-01"`. | Optional; only a string is returned. |
| `activeNotice.expectedResolutionDate` | Expected resolution date; e.g. `"activeNotice.expectedResolutionDate": "2026-10-03"`. | Optional; only a string is returned. |
| `activeNotice.displayUntilDate` | Date until which the notice should be displayed; e.g. `"activeNotice.displayUntilDate": "2026-10-05"`. | Optional; only a string is returned. |
| `holidayHours[].id` | Holiday-hours entry identifier; e.g. `"holidayHours[0].id": "holiday-1"`. | Optional; only a string is returned. |
| `holidayHours[].holidayName` | Holiday label; e.g. `"holidayHours[0].holidayName": "Thanksgiving"`. | Optional; only a string is returned. |
| `holidayHours[].date` | Holiday date; e.g. `"holidayHours[0].date": "2026-11-26"`. | Optional; only a string is returned. |
| `specialHours[].id` | Special-hours entry identifier; e.g. `"specialHours[0].id": "special-1"`. | Optional; only a string is returned. |
| `specialHours[].description` | Explanation for the special schedule; e.g. `"specialHours[0].description": "Renovation"`. | Optional; only a string is returned. |
| `specialHours[].startDate` | First date of the special schedule; e.g. `"specialHours[0].startDate": "2026-10-10"`. | Optional; only a string is returned. |
| `specialHours[].endDate` | Last date of the special schedule; e.g. `"specialHours[0].endDate": "2026-10-12"`. | Optional; only a string is returned. |
| `holidayHours[].hours`, `specialHours[].hours` | Hours for that holiday or special period, using the same shape as a weekday. | Can be absent. If included, it has `isClosed` and may have `open` and `close`. |
| `holidayHours[].hours.isClosed`, `specialHours[].hours.isClosed` | Whether the store is closed for that override; e.g. `"holidayHours[0].hours.isClosed": true`. | Required for the nested `hours` object to be included. |
| `holidayHours[].hours.open`, `specialHours[].hours.open` | Opening time for the override; e.g. `"specialHours[0].hours.open": "11:00"`. | Each can be absent; included only when it is a string. |
| `holidayHours[].hours.close`, `specialHours[].hours.close` | Closing time for the override; e.g. `"specialHours[0].hours.close": "17:00"`. | Each can be absent; included only when it is a string. |

In array paths, `[]` means one entry; for example, `holidayHours[0].date` is the date property of the first holiday entry.

### Custom fields inside `customMetadata`

The exact custom keys are configurable by Directory administrators, so there is no fixed list that can be safely hard-coded in this blueprint. Call `GET /api/v1/location-fields` to discover the currently published fields. Each definition gives the exact key in `id`, its human label, type, help text, and (for a choice list) valid options.

For example, if the field catalog contains an active API-visible field with `id` `"yelpUrl"`, the store object may include `"customMetadata": {"yelpUrl": "https://example.test/store"}`. A custom key can be absent for a particular store. A value is returned only if it is defined, active, explicitly API-visible, and valid for its declared type. Valid `false` and `0` values are kept. Internal-only, retired, undefined, and invalid custom values are omitted. The `customMetadata` object itself is always present.

The field catalog contains these exact properties per definition: `id`, `label`, `type`, `helpText`, `options`, `order`, `apiVisible`, `retired`. Only active, API-visible definitions appear, so `apiVisible` is `true` and `retired` is `false` in returned catalog entries. Supported `type` values are `url`, `text`, `number`, `boolean`, and `select`; `options` is an empty array for non-select fields.

## Getting stores

### Get every active store

Start with:

```http
GET https://shiekh-dir.ai.studio/api/v1/locations?limit=100
Authorization: Bearer <server-side API token>
```

The result has this overall shape:

```json
{
  "data": [{"storeNumber": "007", "name": "Example Store"}],
  "sync": {
    "watermark": "2026-10-03T18:45:00.000Z",
    "mode": "full",
    "customFieldsVersion": "<version>",
    "hierarchyVersion": "<version>",
    "fullReconciliationRequired": true
  },
  "pagination": {"limit": 100, "nextCursor": "<opaque cursor>"}
}
```

The example values and store are illustrative. If `pagination.nextCursor` is not `null`, call the same endpoint again with that cursor, preserving any filters or versions you sent:

```http
GET /api/v1/locations?limit=100&cursor=<URL-encoded nextCursor>
```

Continue until `nextCursor` is `null`. A page can contain fewer than `limit` stores—or even an empty `data` array—and still have a cursor. The limit caps the number of database records scanned, not the number of active stores returned.

### Get one store

```http
GET https://shiekh-dir.ai.studio/api/v1/locations/007
Authorization: Bearer <server-side API token>
```

Store numbers are exact strings. Preserve leading zeroes and URL-encode the store number if needed. The success body contains `data` (one store), `customFieldsVersion`, and `hierarchyVersion`. Unknown, retired, or draft stores return `404`; the API does not return their record.

## Filtering and keeping the app current

The list API does **not** provide general-purpose search or filters for city, state, store type, Region, District, operational status, or custom-field values. The only store-data filter is `updatedSince`, which asks for active store records updated on or after a timestamp. It is inclusive, so a record on the boundary may appear again; update/replace the local record by `storeNumber` rather than assuming each result is new.

For a later incremental read, send the watermark and both versions saved from the last **completed** list run:

```http
GET /api/v1/locations?updatedSince=2026-10-03T18:45:00.000Z&customFieldsVersion=<saved-custom-fields-version>&hierarchyVersion=<saved-hierarchy-version>
```

The timestamp must be ISO 8601 with a timezone. The API returns a fixed snapshot watermark; use it and the same filter/version parameters for every continuation page. Save the new watermark and versions only after all pages have succeeded.

The response's `sync` object contains:

| Exact API field name | What it tells the app |
| --- | --- |
| `sync.watermark` | The snapshot time to save for the next incremental read. |
| `sync.mode` | `"full"` or `"delta"`; use this to confirm what the API actually returned. |
| `sync.customFieldsVersion` | Version of the currently published custom-field definitions. |
| `sync.hierarchyVersion` | Version of the Region/District registry used to resolve names. |
| `sync.fullReconciliationRequired` | Always `true`; the app must periodically reconcile the complete set. |

The pagination object contains `pagination.limit` and `pagination.nextCursor`. The cursor is opaque: do not decode or edit it. It expires after 15 minutes and is bound to the snapshot, timestamp filter, and schema versions.

Important synchronization behavior:

1. On the first read, fetch every page and stage the results. Replace the app's active-store set only after the final page succeeds.
2. Store each received `customMetadata` object as a complete replacement, including `{}`. Do not merge it into old data: a field may have been withdrawn.
3. For incremental reads, include `updatedSince`, `customFieldsVersion`, and `hierarchyVersion`, and preserve them on continuation requests. In the production code path, omitting either version makes the API perform a full read even if `updatedSince` was supplied.
4. A `409 custom_fields_changed` or `409 hierarchy_changed` means discard the incomplete run and start a new full read without `updatedSince`, `cursor`, or either version parameter. Do not mix pages from the old and new run.
5. The API only returns active stores. A retired or deleted store does not appear in a delta response, so periodically do a full reconciliation and remove local active-store records that were absent from the completed full result.
6. `locationInboxEmail` is a built-in field and does not change `customFieldsVersion`. Tolerate its absence when communicating with an older Directory revision. When the property is present, `null` means clear any previously stored inbox; do not interpret a missing property from an older revision as a clear. A new consumer should do its initial full read against a revision that includes the field.

### Work the consuming app must own

The Directory API is read-only. It does not create a consumer-app account, issue or deliver credentials, create subscriptions or approvals, send notifications for the consumer app, or build its user interface. A ROPI-style integration must be implemented in the consuming app: keep the Directory token only in trusted server-side storage, perform a full initial read, follow every page, then apply inclusive `updatedSince` deltas idempotently using the returned watermark. Replace records and their complete `customMetadata` objects, let a present `locationInboxEmail: null` clear the local value, and periodically reconcile all pages to remove retired/deleted stores. The consumer must own its approvals, subscription state, retry handling, notifications, and operational monitoring.

## Limitations, errors, and information not exposed

### Operational limits and errors

- Default page size is 50; the maximum is 100.
- The API is rate-limited to 100 requests per minute by default. The service may be configured differently.
- Common errors include `401 invalid_token` (missing, invalid, expired, disabled, or revoked token), `403 insufficient_scope` (the credential lacks `locations:read`), `400` for invalid query parameters/cursor, `404 location_not_found`, `409` for duplicate/ambiguous store identity or a changed field/hierarchy schema, `429 rate_limit_exceeded`, and `503 api_unavailable`.
- Error bodies contain `error.code`, `error.message`, and `error.requestId`, not store data.
- Conditional requests may return `304 Not Modified` with no JSON body. The response's ETag may be used with `If-None-Match`.
- The service is read-only for consumers. There is no API endpoint for creating, editing, or deleting store information.

### Directory information intentionally absent from this API

The Directory may hold more than the public store projection. The current API does not return:

- Store, district, or regional manager names/IDs, assistant-manager or key-holder names/IDs, manager phone numbers, personnel email addresses, or person records. The separate Location-owned `locationInboxEmail` is exposed.
- Phone extensions or phone numbers that fail the public-phone privacy rule.
- Internal/custom fields that are not explicitly published, and custom values that are invalid or retired. However, the publication/type rules do not inspect arbitrary text for private information; an API-visible text custom field can contain an email address. Review custom-field values and definitions before any future migration.
- Store record versions, raw saved hierarchy-applicability value, creation metadata, `lastVerifiedBy`, audit history, user/account details, or credential/client records.
- Hours-template IDs or mode, QR-code URLs, and arbitrary properties added to a stored location.
- Retired or draft store objects, or a full independent catalog of Regions and Districts. The store response has only its resolved Region/District fields.

These are exclusions from the API, not promises that the underlying Directory lacks the data. A new consumer requirement for any of them would need a deliberate API change and access/privacy review. Custom fields are an exception: administrators can add optional fields and choose whether to publish them, and the existing field-catalog endpoint reports what is currently exposed.

The API also does not fetch Google Business Profile reviews, ratings, or review links automatically. `googleReviewUrl` is only a manually maintained URL field. Google Business Profile integration, store writes, broader search/filtering, and access to the excluded personnel/internal fields would require new development.

## Blueprint recommendation

Treat the Directory API as the source for active store records. Keep the token on the app server, use `storeNumber` as the upsert key, consume the published custom-field catalog, follow every cursor, and periodically perform a complete staged reconciliation. Do not assume a field is populated just because it is part of the response contract; optional fields and custom values can be missing for individual stores.

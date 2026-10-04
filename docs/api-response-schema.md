# Directory API v1: emitted response fields

This reference documents the JSON properties emitted by the Directory API serializer. It is intentionally an allowlist: a field is not part of the public contract just because it exists on a Firestore document or in the application.

## Live verification status

On 2026-10-04, the production host `https://shiekh-dir.ai.studio` responded on the list, detail, and field-definition routes. Each returned `401 invalid_token` without an authorized `locations:read` credential. The successful authenticated payload could therefore not be independently sampled, and the deployed revision could not be compared with the workspace source. The field inventory below reflects the current workspace serializer and its response tests; verify a successful response with an approved credential before treating a production data sample as observed.

## `GET /api/v1/locations`

The success body has exactly these top-level properties:

| Property | Type | Meaning |
| --- | --- | --- |
| `data` | array of location objects | Active locations included in this page. |
| `sync` | object | Snapshot and reconciliation metadata, repeated unchanged across continuation pages. |
| `pagination` | object | Page limit and continuation cursor. |

`sync` contains:

| Property | Type | Meaning |
| --- | --- | --- |
| `watermark` | ISO 8601 timestamp string | Snapshot cutoff used for all pages in this synchronization run. |
| `mode` | `"full"` or `"delta"` | `"delta"` only when an effective `updatedSince` filter is applied. |
| `customFieldsVersion` | string | Version digest of the published custom-field definitions. |
| `hierarchyVersion` | string | Version digest of the Region/District hierarchy at the snapshot. |
| `fullReconciliationRequired` | boolean (`true`) | Consumers must periodically reconcile removed, retired, and otherwise absent locations. |

`pagination` contains:

| Property | Type | Meaning |
| --- | --- | --- |
| `limit` | integer | Requested scan limit, default `50`, maximum `100`. |
| `nextCursor` | string or `null` | Opaque signed continuation cursor. Follow it until it is `null`. |

The scan limit is not a guaranteed count of `data` items: inactive records and delta-filtered records can make a page shorter or empty while `nextCursor` is still non-null. Keep the query filters and schema versions unchanged on continuation requests. A cursor is bound to its snapshot and filters and expires after 15 minutes.

## Location object

`locationInboxEmail` is a built-in field. It does not change `customFieldsVersion`; consumers should tolerate the property being absent on older server revisions and must use a successful full read when first upgrading to this field.

The following properties are always emitted for each returned location:

| Property | Type | Meaning |
| --- | --- | --- |
| `id` | string | Location document identifier. |
| `storeNumber` | string | Exact store number, including leading zeroes. |
| `recordStatus` | `"Active"` | Inactive locations are not returned. |
| `updatedAt` | ISO 8601 timestamp string | Location document update time. |
| `locationInboxEmail` | string or `null` | Shared, Location-owned contact inbox. Always present on this server revision; invalid or unusable historical values become `null`. |
| `customMetadata` | object | Public, valid custom values only; `{}` when none qualify. |
| `regionId` | string or `null` | Canonical Region ID resolved from the saved assignment. |
| `regionName` | string or `null` | Name resolved from the Region registry, not copied from the Location. |
| `regionStatus` | `"Active"`, `"Retired"`, or `null` | Current snapshot's Region status. |
| `districtId` | string or `null` | Canonical District ID resolved from the saved assignment. |
| `districtName` | string or `null` | Name resolved from the District registry, not copied from the Location. |
| `districtStatus` | `"Active"`, `"Retired"`, or `null` | Current snapshot's District status. |
| `hierarchyStatus` | string enum | One of `unassigned`, `resolved`, `retired-reference`, `unresolved-reference`, `parent-mismatch`. |
| `hierarchyIssues` | array of strings | Issues with the canonical hierarchy references. Empty when none are detected. |
| `hierarchyApplicability` | `"Applicable"`, `"Not Applicable"`, or `"Unknown"` | Effective value, derived when no supported value is saved. |
| `applicabilityIssues` | array of strings | Issues with the saved or derived applicability. Empty when none are detected. |

These top-level string properties are included only when their stored values are strings:

`name`, `type`, `mallOrCenterName`, `address`, `city`, `state`, `zipCode`, `timeZone`, `district`, `operationalStatus`, `lastVerifiedAt`, `slug`, `googleReviewUrl`, `storePageUrl`.

The legacy `district` string is preserved as-is for compatibility. Canonical hierarchy data is represented separately by `regionId`, `regionName`, `regionStatus`, `districtId`, `districtName`, and `districtStatus`.

Other conditional location properties:

| Property | Included when | Emitted shape |
| --- | --- | --- |
| `phone` | `phone` is a string and `phonePrivacy` is absent or exactly `"Public"`. | string |
| `phonePrivacy` | `phonePrivacy` is a string. | string; it may be emitted even when `phone` is withheld. |
| `standardHours` | At least one weekday has an object with boolean `isClosed`. | Object with only valid weekdays (`monday` through `sunday`); each day has `isClosed` and optional string `open` and `close`. |
| `activeNotice` | The source is an object with at least one accepted string value. | Object with only string properties among `shortDescription`, `effectiveDate`, `expectedResolutionDate`, `displayUntilDate`. |
| `holidayHours` | The source value is an array. | Array containing only entries with at least one accepted field: string `id`, `holidayName`, `date`, or valid `hours`. |
| `specialHours` | The source value is an array. | Array containing only entries with at least one accepted field: string `id`, `description`, `startDate`, `endDate`, or valid `hours`. |

For holiday/special-hour entries, `hours` is included only when its object has boolean `isClosed`; it then contains `isClosed` and optional string `open` and `close`. An array-valued source can yield an empty output array after invalid entries are filtered out.

`customMetadata` keys vary with the active published schema. A key/value pair is emitted only when its definition is active and API-visible and the stored value passes that definition's type check: valid URL, non-empty text (up to 2,000 characters), finite number, boolean, or a currently allowed select option. Zero and `false` are retained. Replace the consumer's whole `customMetadata` object on each response; do not merge it with an older object.

## `GET /api/v1/locations/:storeNumber`

A successful detail response has exactly these top-level properties:

| Property | Type | Meaning |
| --- | --- | --- |
| `data` | location object | The same location shape and conditional fields defined above. |
| `customFieldsVersion` | string | Published custom-field definition version. |
| `hierarchyVersion` | string | Resolved hierarchy version. |

Unknown, retired, or draft locations return an error instead of a location object.

## `GET /api/v1/location-fields`

The success body has `version` and `fields`:

| Property | Type | Meaning |
| --- | --- | --- |
| `version` | string | Digest of the published field definitions. |
| `fields` | array | Active, API-visible definitions, sorted by `order`, then `id`. |

Each `fields` entry has exactly: `id` (string), `label` (string), `type` (`url`, `text`, `number`, `boolean`, or `select`), `helpText` (string), `options` (string array), `order` (integer), `apiVisible` (boolean, always `true` in this response), and `retired` (boolean, always `false` in this response). Non-select fields have an empty `options` array.

## Intentionally not returned

- Non-active locations, including retired and draft records, are absent from list results and do not produce detail records.
- Arbitrary Firestore properties are not copied. The response contains only the location properties enumerated above; unsupported fields added to a document do not automatically become API fields.
- Personnel/ownership data and personnel email addresses are excluded, including store/district manager names, phone numbers and IDs, assistant-manager names, and `lastVerifiedBy`. The Location-owned `locationInboxEmail` is intentionally public to authorized `locations:read` consumers; it is not a person or login address.
- A phone number is omitted unless its privacy condition above is met. Other private notes inside nested hours or notices are not copied.
- Custom fields that are internal, retired, undefined, or invalid are omitted. `customMetadata` is still present as an empty object when no values qualify. This is a publication/type allowlist, not an email/privacy content filter: API-visible text may contain email addresses or other sensitive text. Review the custom-field inventory before any data migration.
- The raw saved `hierarchyApplicability` is not separately exposed. The API returns its effective `hierarchyApplicability` plus `applicabilityIssues`.
- Legacy copied hierarchy names are not returned as canonical names. `regionName` and `districtName` come from the hierarchy registry; the legacy `district` compatibility string remains available.
- Authentication tokens, cursor internals, Firestore document contents, and private audit/client data are not included in success payloads.

## Error and not-modified responses

Errors use an `error` object with exactly `code`, `message`, and `requestId`. Error responses do not include `data`, `sync`, `pagination`, or location fields. A successful conditional request may return `304 Not Modified` with no JSON body.

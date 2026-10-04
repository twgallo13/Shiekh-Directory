# Directory personnel and staffing API v2

Contract version: `personnel-staffing-v2.1`. This is a reusable Directory
consumer contract, not an application-specific integration. Deployment and real
client grants require separate review. Existing `/api/v1` payloads are unchanged.

## Access and ownership

Use a server-held Directory bearer token, never a browser Firebase token.
`personnel:read` authorizes People; `staffing:read` authorizes Location staffing.
Either scope authorizes snapshot creation. A staffing response includes the
minimal referenced Person identity/name/lifecycle even without personnel scope.
Only System Administrators manage explicit client grants. Omitted grants on
legacy clients mean **only** `locations:read`. Unknown, duplicate, empty or
malformed stored grants fail closed. Each request re-reads the client grant.
Rotation preserves it. Administrator grant changes apply to every active token
immediately and invalidate existing snapshots/cursors when the grant changes.
No existing client is automatically upgraded.

Location owns `storeManagerId`, `districtManagerId`, `regionalManagerId`,
`assistantStoreManagerIds`, `keyHolderIds`. Person owns primary workplace and
Supports. Region/District own their IDs and hierarchy, not staffing. People and
Locations are read from persisted documents; no name-derived identities,
bootstrap migration, copied-name fallback or second assignment collection.

## Frozen endpoints and wire fields

All data endpoints require `snapshot=<token>` from `GET /api/v2/snapshot`.
Lists optionally accept `limit` (1–100, default 50) and `cursor`; there are no
other filters or `updatedSince` support in this release. Details use canonical
document IDs, **not** store numbers.

| Endpoint | Scope | Result |
|---|---|---|
| `GET /api/v2/snapshot` | either new scope | `{snapshot, snapshotAt, expiresAt, contractVersion}` |
| `GET /api/v2/personnel` | `personnel:read` | People list |
| `GET /api/v2/personnel/{personId}` | `personnel:read` | One Person |
| `GET /api/v2/location-staffing` | `staffing:read` | All Locations, including retired/unknown lifecycle |
| `GET /api/v2/location-staffing/{locationId}` | `staffing:read` | One Location's staffing |

List envelope: `{data: [...], pagination: {limit, nextCursor},
sync: {mode: "full", snapshotAt, contractVersion}}`.
Detail envelope: `{data: {...}, sync: {...}}`. All responses use `no-store`.

Person fields:

| Exact field | Meaning/example | Availability |
|---|---|---|
| `id` | Stable document ID, `person-example-1` | Always |
| `fullName` | Canonical `fullName`, `Example Manager` | String or null; no `name` fallback |
| `lifecycle` | `active`, `inactive`, `unknown` | Always |
| `primaryLocationId` | Primary workplace, `loc-example-1` | String or null |
| `supportedLocationIds` | Supports, `["loc-example-2"]` | Always array; invalid entries reported |
| `issues` | Structured `{code, field}` diagnostics | Always array |

Titles/department are deferred, not published. Contact email/phone/privacy,
login email, User/account fields, legacy aliases, arbitrary/custom attributes,
audit/request/mail data and internal versions/timestamps are excluded.

Lifecycle uses exact `Active`/`Inactive` and/or boolean `activeStatus`. One
valid alias is sufficient; contradictory aliases, invalid supplied values or
both absent produce `unknown` plus `ambiguous_lifecycle`. No historical data is
rewritten. Invalid/missing canonical names yield null and `invalid_name`.
Valid but different legacy `name` yields `conflicting_name_alias`; legacy name
itself is never published. Relationship IDs are exact; malformed entries are
reported, not inferred. Missing/retired workplace/support references and
duplicate/overlapping relationships are reported.

Staffing fields: `locationId`, `storeNumber` (exact string or null, e.g. `"07"`),
`recordStatus` (`active`/`retired`/`unknown`), `regionId`, `districtId`
(strings or null), `hierarchy` (`regionName`, `districtName`: string or null),
the five **exact** assignment field names above, and `issues`.
Single role values are null or `{personId, fullName, lifecycle, issues}`.
List roles are arrays of that reference shape. Missing Person IDs retain the
ID and null name/unknown lifecycle with `missing_person`; inactive/unknown
People retain canonical names but have `inactive_person`/`unknown_person_state`.
Invalid single IDs yield null plus `invalid_reference`; invalid list elements
are omitted with an issue. Duplicate list IDs are retained and reported.
Copied names without corresponding IDs yield `legacy_only` without publishing
the copied value. Extra legacy list names are also reported.
Hierarchy issues report missing/retired/invalid references or parent mismatch;
there is no fallback to legacy district text. Territory manager disagreement
is not resolved into a District/Region-owned assignment.

## Safe full synchronization

Create one snapshot and reuse it for **both datasets and every detail/page**.
It pins all Person, Location and hierarchy reads to one Firestore read time,
expires after 15 minutes, and is bound to client, token version, effective
grant fingerprint and contract version. Cursors additionally bind dataset and
page size. Another token, grant change, tamper, mismatched dataset/page size or
snapshot is rejected. Expiry yields 409 `snapshot_expired`; start again.
Storage unavailability yields 503; never interpret it as an empty dataset.

Follow `nextCursor` until null, including empty pages. Stage the entire run;
publish/reconcile local removals only when **all required datasets/pages**
succeed. Inactive People and retired Locations are included for reconciliation.
Do not delete local entries after a partial/failed/expired scan. Run complete
refreshes on a consumer-defined schedule (daily at minimum recommended).
Location update timestamps cannot signal Person or hierarchy changes. This
release is not a delta feed and supplies no tombstones/watermark promise.

Errors: 400 invalid query/limit/snapshot/cursor, 401 invalid token,
403 insufficient scope, 404 missing canonical ID, 409 expired snapshot,
429 rate limit, 503 source/authentication unavailable. Error envelope:
`{error: {code, message, requestId}}`.

## UI parity and migration boundary

The UI must keep persisted canonical staffing and People unchanged on load.
Legacy copied-name diagnostics remain reviewable, separate from canonical
assignments. Hours-template compatibility can normalize hours only.
Before certifying parity, compare synthetic saved IDs (including missing IDs)
with loaded UI state, role labels, and unrelated-save payloads. No automatic
identity creation, missing-ID deletion or territory ownership repair is allowed.
Future ownership migration requires a separately reviewed cutover.

The shareable machine-readable schema is [OpenAPI](./personnel-staffing-openapi.json).
It contains synthetic examples only; no credentials or production records.

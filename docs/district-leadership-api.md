# District leadership API v3

Contract: `district-leadership-v3.1`. Deployment and exact-client authorization status are recorded in [Dispatch 25](https://github.com/twgallo13/Shiekh-Directory/blob/main/docs/dispatches/dispatch-25-district-leadership-api.md); a schema or public guide alone is not proof of live access. This guide is app-neutral, not an LP-only API. Existing v1 store and v2 persisted staffing responses are unchanged.

## Access and identity

- `district-leadership:read` permits the District roster and Location-to-District membership datasets below. Existing `locations:read`, `personnel:read` or `staffing:read` does not imply it.
- `district-leadership:contacts:read` additionally permits eligible `districtManager.workEmail`. It requires the base leadership grant. Grant changes use the existing Admin Settings workflow, preserve existing token secrets, affect all active tokens immediately and invalidate old snapshots. No developer is required for an approved grant change after setup. Do not rotate a working token just to add grants.
- The owner chose Directory work email as **contact only**, with app accounts explicitly linked by stable Person ID. Email is not proof of company sign-in, employment, uniqueness or application permission. Do not create invitations, merge identities or grant access because emails match. The consumer owns its account invitations/roles/approvals; Directory owns staffing.
- Only the canonical Person `workEmail` is eligible. Never fall back to legacy `email`, personal/contact aliases, User/Firebase login fields, store inboxes, phone numbers, custom fields or arbitrary metadata. A valid address must use `shiekhshoes.com` or `shiekhshoes.org`, the current company-domain allowlist, and belong to a clearly Active Person. Domain policy is conservative; adding a domain requires a separately reviewed policy change.
- At the same snapshot time, the source checks all Location inbox fields case-insensitively, including retired/non-retail Locations. A matching address is withheld. This identifies saved inbox matches, not every possible shared or misclassified mailbox. Humans must keep work contacts accurate; multiple People sharing an address are never automatically merged. Missing, invalid, unapproved-domain, inactive, ambiguous and unresolved contacts return null with a reason.
- Do not put tokens, snapshots or cursors into tickets, analytics, browser bundles or logs. Tokens go only in the consuming server's secret store and Authorization header. Snapshot/cursor values are opaque, client/token/grant-bound and expire in 15 minutes. All responses use no-store.

## Endpoints and one-snapshot synchronization

1. GET `/api/v3/snapshot` with `Authorization: Bearer ...`. No query parameters. Returns `snapshot`, `snapshotAt`, `expiresAt`, `contractVersion`.
2. Read every page of GET `/api/v3/district-leadership?snapshot=...&limit=50`. Follow its `pagination.nextCursor` with the same snapshot and limit until null.
3. Read every page of GET `/api/v3/location-districts?snapshot=...&limit=50` with that **same** snapshot. Cursors are dataset-specific; do not reuse a District cursor for memberships. Limit is 1–100, default 50; no other filters/parameters are accepted.
4. Stage both complete datasets, validate joins/issues, then atomically publish the new consumer view. Missing/retired records may be reconciled only after both datasets finish successfully. An outage, expired token/snapshot, partial download, 403 or 503 must never erase valid saved data or users. Restart both datasets on expiry or grant/token changes.
5. Detail endpoints `/api/v3/district-leadership/{id}` and `/api/v3/location-districts/{id}` accept only `snapshot`. IDs are exact canonical District/Location document IDs, not names or numeric Store Numbers. Unknown IDs return 404, not an empty successful record.

District names, Regions, DM references, work-contact safety checks and store membership are read at one pinned Firestore read time. Later handovers/contact edits do not rewrite an issued snapshot. A new run observes them. This is a frozen synchronization view, not live Open/Closed status. Do not combine it with an independently timed v1/v2 sync and claim atomicity. For operating status use the separate current-state API.

## Fields actually returned

Each District record always has `districtId`, `districtName`, `recordStatus`, `regionId`, `regionName`, `regionStatus`, `assignmentState`, `districtManager`, `issues`. Names and Region references may be null when source data is unusable; diagnostics explain missing/invalid/retired hierarchy. District status is active, retired or unknown; Region status also allows null when no Region resolves. Districts with **zero stores** are included because the registry, not store copies, is the authority.

`assignmentState` is one of:

- `assigned`: valid Person ID resolves; the Person may be active, inactive or unknown, and that lifecycle remains visible.
- `vacant`: District explicitly stores null for its DM. `districtManager` is null.
- `unmanaged`: District does not yet own a DM field. `districtManager` is null, but this is not a confirmed vacancy. Never infer a leader from copied store fields/titles; explicitly activate District ownership through Organization settings.
- `invalid`: saved DM reference is malformed (including an empty string). `districtManager` is null with an issue.
- `unresolved`: saved valid Person ID has no matching Person. The reference retains that ID, with null name/unknown lifecycle and a missing_person issue, rather than masquerading as vacancy.

A non-null `districtManager` always has `personId`, `fullName`, `lifecycle`, `workEmail`, `workEmailStatus`, `issues`. Lifecycle is active, inactive or unknown; name may be null. Work email is null unless status is `available`. Status reasons: `not_granted`, `missing`, `invalid`, `unapproved_domain`, `shared_location_inbox`, `withheld_inactive`, `withheld_unknown_lifecycle`, `unresolved_person`, `available`. Null is an intentional returned value: consumers must clear an older cached email rather than retaining it. Even an available email is contact only.

Each membership record always has `locationId`, `storeNumber`, `recordStatus`, `locationType`, `hierarchyApplicability`, `regionId`, `districtId`, `issues`. Preserve Store Number strings and leading zeroes; null means invalid/missing, not zero. Status is active/retired/draft/unknown. Location type is retail/non-retail/unclassified; applicability is Applicable/Not Applicable/Unknown. Missing/retired hierarchy, invalid type/applicability and Region/District parent mismatch are explicit diagnostics. Do not apply inherited retail leadership automatically to non-retail or unclassified Locations merely because IDs are present.

Every list response has `data`, `pagination: { limit, nextCursor }`, `sync: { mode: "full", snapshotAt, contractVersion, contactAccess }`. `contactAccess` is none or work-email and describes the grant, not data completeness. Every detail response has `data` and `sync`. Issues are always arrays of `{code, field}`, with no raw contact values. No payload includes accounts, phone/personal-email fields, login claims, store-manager/assistant/key-holder personnel, position IDs or custom metadata.

The [strict OpenAPI schema](district-leadership-openapi.json) defines the exact allowlist. Published app routes: `/api/leadership-guide` and `/api/leadership-openapi.json`. Settings → Directory API links both.

## Failure, limits and acceptance

Errors return `{error: {code, message, requestId}}`: 400 invalid query/ID/snapshot/cursor/limit; 401 invalid credential; 403 insufficient scope; 404 missing detail; 409 expired/future snapshot; 429 rate limit (100 requests/minute per router policy); 503 unavailable authentication/pinned source. Missing source permissions and reads exceeding a safety bound are errors, not empty datasets. Contact safety scans are bounded at 1,000 Location documents, reference joins at 300 per page, and document reads in groups of at most 100. If the source grows beyond these bounds, review the bounded strategy before granting contacts; do not silently skip safety checks.

Deployment, granting a specific consumer access and authenticated consumer acceptance are separate steps. Issue #36 stays open until the approved exact client keeps authenticating with its existing token, a successful scoped production response is verified without leaking credentials/contacts into public evidence, and the consumer accepts pinned-snapshot sync. No live grant, real contact backfill, LP application change, account mapping or staffing repair is authorized by merely publishing this guide.

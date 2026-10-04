# Store Directory API v1

The Directory API is a read-only, server-authenticated view of active location records in the named Firestore database. Reads never mutate location or personnel data; successful authentication may update redacted client/token last-used metadata at most once per 15 minutes.

For the exhaustive allowlist of successful response fields, nested shapes, pagination metadata, and intentional exclusions, see [the emitted response schema](docs/api-response-schema.md).

For a plain-language guide intended for a consuming app's blueprint, including examples, per-field availability, retrieval/synchronization steps, and live-verification limits, see [the app blueprint reference](docs/app-blueprint-directory-api.md).

## Endpoints

All v1 requests require `Authorization: Bearer <token>` and the `locations:read` scope.

### `GET /api/v1/locations`

Query parameters:

- `limit`: optional integer from 1 to 100; defaults to 50. This bounds scanned documents, not the count of matching active records. A filtered page may be empty and still have a continuation cursor.
- `cursor`: optional opaque cursor returned in `pagination.nextCursor`.
- `updatedSince`: optional valid ISO 8601 timestamp with a timezone and at most millisecond precision. Matching uses Firestore document update time, with an inclusive lower bound to permit safe boundary replay. Upsert by store number.
- `customFieldsVersion`: schema version saved from the last completed synchronization. Send it with delta requests and their continuation pages. If omitted, the production repository returns a full reconciliation even when `updatedSince` is supplied, so field visibility changes cannot silently leave stale metadata downstream. A mismatched version returns `409 custom_fields_changed`.
- `hierarchyVersion`: hierarchy version saved from the last completed synchronization. Send it with delta requests and continuation pages. If omitted from a delta request, the API returns a full reconciliation. A mismatch returns `409 hierarchy_changed`.

The response contains active records only:

```json
{
  "data": [],
  "sync": {
    "watermark": "2026-09-08T12:00:00.000Z",
    "mode": "full",
    "fullReconciliationRequired": true,
    "customFieldsVersion": "sha256",
    "hierarchyVersion": "sha256"
  },
  "pagination": {
    "limit": 50,
    "nextCursor": null
  }
}
```

### `GET /api/v1/locations/:storeNumber`

Returns one active public location, or a JSON `404` when the store is unknown, retired, or draft.

Store numbers are exact strings, including leading zeros. Ambiguous identities return `409 location_conflict` without document IDs or record values. A new list run validates all location identities, including inactive records, at the snapshot before returning any data. Detail requests check for two matching documents rather than choosing one. This release intentionally blocks the currently duplicated dataset until a separately approved reconciliation establishes unique identities.

Successful production location responses include `X-Request-ID`, a strong `ETag`, and `Cache-Control: no-store`. Custom-field publication rules are read afresh on each request; stale cached responses must not keep publishing withdrawn metadata. Send `If-None-Match` on later requests to receive `304 Not Modified` when appropriate. A new list run has a new watermark and therefore a new representation/ETag; detail responses and repeated snapshot pages can be revalidated.

### Location URLs and Custom Metadata

`googleReviewUrl` and `storePageUrl` remain optional top-level strings in both list and detail responses. Their existing names are reserved and cannot be reused for custom fields. They are editable built-in fields, not a claim that GBP automation is connected.

Every location response now includes a `customMetadata` object. Only defined, active fields whose `apiVisible` flag is true and whose stored values satisfy the field type are returned. Internal, retired, undefined, and invalid values are omitted. False and zero are preserved. All custom fields are optional. Example location fragment:

```json
{
  "googleReviewUrl": "https://example.test/review",
  "storePageUrl": "https://example.test/store",
  "customMetadata": {
    "yelpUrl": "https://example.test/yelp",
    "pickupAvailable": false
  }
}
```

The API also always emits `locationInboxEmail` on each Location in both list and detail responses. It is the shared, Location-owned contact mailbox, not a person or login email. Its value is a normalized string or `null`; consumers should replace a previously stored address with `null` when a clear is received. Older deployed revisions may omit the property. Personnel email addresses remain excluded. Custom-field publication/type checks do not scan arbitrary text for personal information, so review API-visible custom fields before migrating or publishing values.

### Canonical Region and District Fields

Location list and detail responses preserve the legacy `district` field with its existing compatibility meaning and separately expose canonical hierarchy resolution:

```json
{
  "regionId": "reg-west",
  "regionName": "West",
  "regionStatus": "Active",
  "districtId": "01",
  "districtName": "District One",
  "districtStatus": "Active",
  "hierarchyStatus": "resolved",
  "hierarchyIssues": [],
  "hierarchyApplicability": "Applicable"
}
```

IDs are exact strings, so District ID `01` is not the number `1`. Names resolve from registries at read time; copied legacy names are not canonical. Missing assignments return null IDs and names. A missing registry record preserves its stored ID and returns a null name. Retired records retain their names and report `Retired`. `hierarchyStatus` is `unassigned`, `resolved`, `retired-reference`, `unresolved-reference`, or `parent-mismatch`; `hierarchyIssues` explains non-resolved references.

`hierarchyApplicability` is the *effective* value: `Applicable`, `Not Applicable`, or `Unknown`. When a Location has no saved value, Enclosed Mall, Strip Center / Shopping Center, and Street / Standalone Location default to `Applicable`; other types default to `Applicable` only when a canonical Region or District reference exists, otherwise `Not Applicable`. An explicit saved `Unknown` remains `Unknown`. An unsupported saved value also resolves to `Unknown`. A retail type saved as `Not Applicable`, or any `Not Applicable` record that still carries canonical references, is a visible inconsistency, not a healthy operational center; consult `hierarchyIssues` for the exact reason. The API does not expose the raw saved value separately; join by `districtId`/`regionId`, never by `hierarchyApplicability` alone, to distinguish operational centers from stores awaiting assignment.

List responses include `sync.hierarchyVersion`; detail responses include top-level `hierarchyVersion`. The version covers registry IDs, names, statuses, and District parent links at the Location snapshot. Continuation pages resolve names from that same historical snapshot and also compare the cursor version with the current registry; a later registry change affects ETags without rewriting Locations and invalidates the cursor with `409 hierarchy_changed`.

### `GET /api/v1/location-fields`

Requires the same Bearer credential and `locations:read` scope as location reads. Returns `Cache-Control: no-store` with `{ "version": "<sha256>", "fields": [...] }`. Only API-visible, active definitions are returned, sorted by display order and key. Each definition contains `id` (the permanent metadata key), `label`, `type`, `helpText`, `options`, `order`, `apiVisible`, and `retired`. Types are `url`, `text`, `number`, `boolean`, and `select`.

List responses include `sync.customFieldsVersion`; detail responses include top-level `customFieldsVersion`. The version hashes the published definitions. Label, choice, visibility, and retirement changes affecting the published schema change this version, even if no location document was modified. Schema changes invalidate in-flight pagination cursors with `409 custom_fields_changed`.

Consumer synchronization rules:

1. Start with `GET /api/v1/locations` and follow all continuation pages.
2. Replace each received location's entire `customMetadata` object; do not merge it with stale keys. `{}` means there are no currently published custom values for that location.
3. Save the watermark, `customFieldsVersion`, and `hierarchyVersion` only after the final page succeeds. Keep the same filter/version query parameters on continuation requests.
4. Send `updatedSince=<watermark>`, `customFieldsVersion=<version>`, and `hierarchyVersion=<version>` for subsequent delta runs. Omitting either version requires full results instead.
5. On `409 custom_fields_changed` or `409 hierarchy_changed`, discard the incomplete run and start a full reconciliation without `cursor`, `updatedSince`, `customFieldsVersion`, or `hierarchyVersion`. Do not substitute a latest version into a delta request because unchanged Locations may need schema or resolved-name updates.

The full-reconciliation requirement for retired/deleted stores still applies. Removing a field from this API cannot erase copies already held by a consumer; consumers must follow replacement and reconciliation rules.

`locationInboxEmail` is a built-in field and does not change `customFieldsVersion`. A new consumer should perform a full initial read against a revision that includes it. Tolerate the property being absent on older revisions; if a response includes it as `null`, replace any previously stored inbox with `null`. The Directory does not implement a consuming app's accounts, subscriptions, approvals, notifications, or UI; those workflows and server-side token storage belong to the consuming app.

### Custom Field Writes (Application Only)

The read-only service API never accepts metadata writes. Signed-in application users use `POST /api/directory/commit` with Firebase authentication. `custom_field_definitions` writes require `System Administrator`, exactly one definition per commit, and `expectedDefinition` containing the last-read definition (`null` when creating). Definitions and audit entries are saved transactionally. Keys/types and existing choice values cannot change; labels/help/order/API visibility can change. Definitions may be retired/reactivated but not deleted. There is a limit of 100 definitions including retired ones.

Location metadata is validated against the current definitions inside the location transaction. Changes require `expectedCustomMetadata` containing the last-read entire metadata object (`{}` for a new record). A concurrent change returns `409 directory_conflict`; invalid values return `400 invalid_metadata`. Metadata edits require Administrator, Data Steward, or Editor roles and a recognized scope: `Company`, `Company-wide`, or exact `Store <storeNumber>` (including leading zeros). Other scopes fail closed for metadata changes. Existing UI rules still limit direct location editing to administrators and stewards. This does not expand or redesign permissions for unrelated directory fields.

URL values must be absolute HTTP/HTTPS URLs without embedded credentials and at most 2048 characters. Text values are limited to 2000 characters; numbers must be finite; booleans must be actual JSON booleans; choice values must match their definition. Empty optional values are removed rather than stored as null. Unknown keys are rejected, omitted existing metadata is preserved, and retired field values are retained but cannot be changed. Newly changed built-in URL values are validated too; unchanged legacy URLs do not block unrelated saves.

Errors use this shape:

```json
{
  "error": {
    "code": "invalid_token",
    "message": "A valid Bearer token is required.",
    "requestId": "generated-request-id"
  }
}
```

Unknown `/api/*` routes return JSON rather than the Vite single-page application.

Both `/api/mail/status` and `/api/mail/dispatch` require Firebase ID-token authentication in every environment, including when `NODE_ENV` is absent. They do not accept Directory API synchronization tokens. See Secure SMTP Mail below. Mail is functional for authorized users when server-owned configuration is complete; there is no production shutdown guard.

## Managed API Clients

System Administrators manage API clients in Admin > Directory API. Management requests use the current Firebase ID token and are reauthorized by the server on every request. Directory Data Stewards and other roles cannot list or change credentials. The only supported scope is `locations:read`.

Creating or rotating a client generates 32 random bytes on the server. The plaintext bearer token is returned once, held only in ephemeral component state, and removed from the DOM when dismissed. It is never placed in bootstrap data, application context, browser storage, URLs, logs, audit records, or later list responses. Firestore stores only its SHA-256 digest as the server-only token document ID.

Clients can be disabled and safely re-enabled. Revocation is terminal and invalidates every token version. Rotation creates a new token and, by default, retires previous active versions after exactly 24 hours. A System Administrator may instead retire every previous version immediately. Repeated rotations cannot extend an already-running overlap window.

Client metadata and server-only token versions are stored in the named Firestore database in `api_clients` and `api_client_tokens`. No migration, composite index, pepper, or additional server secret is required. Unknown, expired, retired, revoked, and disabled credentials receive the same `401 invalid_token` response. Firestore credential-provider failures return sanitized `503 api_unavailable` without reading location data.

Lifecycle changes append redacted records to the existing `audit_logs` collection and inherit its retention behavior. Successful authentication updates client and token `lastUsedAt` metadata at most once per 15 minutes. Runtime authentication and access logs contain request ID, method, route, outcome/status, and server-generated client/token-version IDs only. They exclude bearer tokens, hashes, request bodies, IP addresses, location/personnel data, and responses.

Runtime rate settings remain optional:

- `DIRECTORY_API_RATE_LIMIT`: requests allowed per window; defaults to 100.
- `DIRECTORY_API_RATE_WINDOW_MS`: rate-limit window; defaults to 60000 ms.

## Application Authentication

The browser uses one Firebase app/Auth instance pinned to `gen-lang-client-0801664258`. Required public web configuration is `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_AUTH_DOMAIN`. The project and Firebase auth domain must match the pinned project; missing/mismatched configuration fails closed. These public settings must come from the approved Firebase web app, not another project. Firebase uses tab-scoped session persistence, not localStorage. Application authorization stays in memory.

`VITE_AUTH_ALLOWED_ORIGINS` is a comma-separated exact origin allowlist. Reset continuations are restricted to same-origin `/sign-in`; email-link continuations are restricted to same-origin `/auth/email-link`. HTTPS is required except for explicitly allowlisted localhost/127.0.0.1 development origins. The origin must also be authorized in Firebase. No caller-defined redirect path, query, hash, or credentials are accepted. Firebase-generated action codes are captured in memory and immediately removed from the address bar; the page uses `no-referrer`. Email-link completion asks for the email again, supporting another browser/device without storing email or action codes. Reloading after the address-bar scrub requires reopening the original email link.

### `GET /api/auth/me`

Requires a Firebase ID token in the Authorization header. Responses are `Cache-Control: no-store`. The shared authority checks `verifyIdToken(token, true)`, audience/issuer, and the fresh Firebase user record's disabled state. It then queries the explicitly named database `ai-studio-shiekhlocationco-00e1a479-af25-4ab6-9565-5c8b804c56a4` in the pinned project, projecting only `firebaseUid`, `email`, `role`, `status`, `accessScope`, and `personId` from `users`, with a two-result limit for conflict detection.

Lookup prefers exactly one `firebaseUid` match. Only when there is no UID match may email fallback run: both the token and current Firebase record must have verified, identical email, the exact email query must return one record, and that record must not link another UID. Missing, duplicate, inactive, malformed-scope, or unsupported-role records deny access. Only exact `Active` status and the four application roles (Viewer, Editor, Directory Data Steward, System Administrator) are accepted. Neither current nor token custom claims supply application roles.

The response contains `uid`, `name`, `email`, `emailVerified`, `role`, `status`, `accessScope`, `personId`, and `authenticationMethod`. Scope is reported exactly as server-owned metadata; it is not a client-editable permission. Firebase reports both password and email-link sign-ins as provider `password`, so the profile labels this honestly as email authentication. Linked People records are resolved by exact ID against the current local directory; unavailable links are not guessed by name/email.

Invalid identities receive `401 invalid_token`; unresolved/inactive/ambiguous access receives `403 access_denied`; authority/credential outages receive `503 auth_unavailable`. Firebase/Firestore emulators and project/database overrides outside the approved target fail closed. No Firebase users, custom claims, or Firestore records are written by this endpoint.

### `GET /api/auth/bootstrap`

Uses the same token and active-role authority. This read-only endpoint serves the existing application seed after authorization, not Firestore location records. Users and SMTP configuration are excluded. It exists to prevent internal seed records from being publicly bundled with JavaScript. Production serves only client assets and the SPA shell, never its server bundle/source map. Development denies raw seed, server, reference, documentation, test, and build-file access through Vite. Directory edits and hours-template behavior remain browser-local; this is not a migration or new authoritative writer.

The UI stays in an explicit loading state through Firebase restoration and server authorization, then loads the protected seed. Admin and location-edit routes require the resolved Administrator/Steward role. Access is rechecked on token changes, browser focus/visibility, and once per visible minute. Server endpoints reauthorize every request without a role cache. Already downloaded data cannot be remotely recalled. Sign-out immediately hides the protected shell, clears protected local drafts/session state, calls Firebase sign-out, and returns to `/sign-in`; a failure remains locked with a retryable sign-out action. Theme preference is retained locally; account-level theme persistence is deferred.

Google, email/password, secure password reset, and passwordless email-link flows are implemented and mock-tested. A read-only provider inspection found Google and email/password enabled, but `signIn.email.passwordRequired=true`, which blocks passwordless email-link sign-in. `localhost` is not currently an authorized Firebase domain. No provider setting or domain was changed.

The masked user inspection found 12 records: 11 Active, one Invited, six duplicated email pairs, and one duplicated UID pair among three UID-linked records. One email pair disagrees on role and another on status. There is only one unique UID linkage; ambiguous accounts intentionally cannot enter. See `docs/auth-restoration-phase.md` for the validation and rollout handoff.

## Secure SMTP Mail

### Authentication and Roles

Send a Firebase ID token in `Authorization: Bearer <id-token>`. Mail uses the identical shared active-user authority instance as `/api/auth/me`, including revocation, disabled-user, pinned-project, and named-Firestore mapping checks. Its additional role restriction permits only `System Administrator` or `Directory Data Steward`. Firebase custom claims, browser objects, local drafts, and request bodies cannot grant mail access. Ambiguous or inactive user mappings return 403 before any SMTP operation.

Runtime ADC must be able to verify revocation and read Firebase Auth users. Missing authentication configuration or known credential/permission outages fail closed with a generic `503 mail_auth_unavailable`; invalid/revoked/expired tokens return `401`, and nonprivileged roles return `403`. No SMTP operation is attempted on these paths.

### Endpoints

- `GET /api/mail/status`: authenticated privileged users receive only `{ "configured": true }` or `{ "configured": false }`. This is configuration presence, not a connectivity or inbox-delivery claim. Host, port, username, sender, recipient lists, and passwords are never returned.
- `POST /api/mail/dispatch`: accepts only JSON with `recipient` and `templateId`. Maximum body size is 2 KB; compressed bodies are not accepted. The only approved template in this milestone is `tmpl-diagnostic-test`, whose subject and plain-text body are server-defined.

```json
{
  "recipient": "approved@example.test",
  "templateId": "tmpl-diagnostic-test"
}
```

Any additional property is rejected, including host/port/user/password, `smtpConfig`, sender/reply-to, TLS flags, custom subject, HTML/text, attachments, roles, or arbitrary template content. Recipient values must be single bare mailboxes exactly matching the server allowlist (case-insensitive); no wildcard/domain matching, address lists, display names, or header injection is accepted. Unapproved recipients return `403`; unknown templates and override fields return `400`.

Successful SMTP acceptance returns `200 { "success": true, "status": "accepted", "requestId": "..." }`. The UI records this as queued, not delivered. SMTP errors return generic `502 mail_delivery_failed`, without raw relay responses or exception details. Missing mail configuration returns `503 mail_not_configured` on valid dispatch requests.

### Server Configuration

The SMTP password comes only from the server-side `SMTP_PASSWORD` environment value or its Secret Manager reference. Initial non-secret defaults come from `SMTP_HOST`, `SMTP_PORT` (465 or 587), `SMTP_USER`, `SMTP_FROM_NAME`, `SMTP_FROM_EMAIL`, `SMTP_REPLY_TO`, `SMTP_ALLOWED_RECIPIENTS` (comma-separated exact mailboxes), and `DIRECTORY_STEWARD_EMAIL`. A System Administrator can replace those non-secret values through `PUT /api/mail/settings`; validated settings are stored in the named Firestore database and take effect on the next message without a deployment. Administrators and Directory Data Stewards can read them through `GET /api/mail/settings`. Neither route accepts, stores, or returns the password.

There is no anonymous transport fallback or caller-controlled message override. Port 465 uses implicit TLS; port 587 requires STARTTLS. Both require certificate verification and TLS 1.2 or newer. Attachment/file/URL access and transport debug logging are disabled, and connection/socket timeouts are bounded.

Authenticated workflows use `POST /api/mail/event` with only a fixed `event` and an entity ID. User invitations, correction submissions, approvals, and rejections resolve recipients and message content from current Firestore records on the server. The browser cannot provide a recipient, sender, subject, body, or transport override. Mail delivery occurs only after the associated directory transaction succeeds; a mail failure does not roll back an already-committed directory change.

Mail has separate limits: 20 requests/minute/IP and 60/minute/process before authentication; dispatch additionally allows 3 requests/10 minutes/Firebase UID and 10/10 minutes/process. Failed dispatch attempts also consume capacity. Responses include rate-limit and retry headers. On Cloud Run, Express trusts exactly one proxy hop so the platform-forwarded client address can key IP limits; direct/local deployments trust no proxy. These stores are local to one process, so an approved shared store is still required for coordinated multi-instance limits. No CORS allowlist is enabled here.

Structured mail audit events contain request ID, a hashed UID (when authorized), and a fixed outcome code only. They exclude ID tokens, request bodies, recipients, SMTP configuration, and raw exceptions. Protect and retain runtime logs under the approved operational policy; this is not a Firestore audit-log writer.

### Browser and Rollout Prerequisites

The SMTP tab uses the app-wide authenticated Firebase session and has no separate sign-in/sign-out controls. It sends the ID token only in the Authorization header and never asks for SMTP credentials. `VITE_FIREBASE_API_KEY` is public Firebase client configuration, not a privileged Directory API token. No real key was added to the repository. Local template editing remains draft-only and cannot alter the approved server template.

Before rollout, approve the Firebase web configuration and browser origins, resolve unique UID/application-user mappings, obtain approval for email-link provider enablement, verify runtime Auth read/revocation and named-database read permissions, confirm the approved sender/exact recipient list, and decide whether more server-owned templates are needed. Custom claims are not the application role authority. No Firebase users/claims, provider settings, Firestore documents, IAM, Cloud Run configuration, or Secret Manager values were changed.

Keep the existing deployed revision unchanged during review. A later approved rollout should migrate literal SMTP secrets to Secret Manager, deploy a no-traffic/canary revision, perform a user-approved real email test, and shift traffic only with rollback available. Local tests use synthetic identities and injected SMTP transport; they do not prove the existing provider configuration, runtime permissions, or external inbox delivery.

Firebase Admin's optional Storage dependency currently pulls an older `uuid` through its request helpers. A scoped override selects patched CommonJS-compatible `uuid` 11.1.1 or newer within major 11; those helpers use `v4`. The dependency audit passes with this override, and no Storage API is used by mail.

## Public Data Boundary

Firestore reads use an explicit field selection. Responses are also constructed with a separate allowlist. Manager IDs, manager names and phone numbers, assistant/key-holder assignments, verifier identity, personnel email, and arbitrary unrecognized fields are excluded. A location phone is returned only when `phonePrivacy` is absent or `Public`.

The Firestore client always receives an explicit `projectId` and named `databaseId`; `(default)` is rejected. Application Default Credentials provide local authentication. A deployed service should use a dedicated runtime service account with read-only named-database permissions. Server SDK access uses IAM, not client Firestore Security Rules; collection/field restrictions are enforced by this API, not implied by IAM.

Hours in v1 are the embedded `standardHours` and explicit overrides. `hoursTemplateId` and `hoursMode` are intentionally not published in this milestone: there is no template-resolution endpoint or verified provenance contract. The data owner must confirm whether embedded hours are authoritative and whether Store Manager requires template provenance before that contract is extended.

## Read Cost and Snapshot Limits

Pages are ordered by Firestore document ID, not store number. The adapter performs a masked identity scan once at the beginning of a run to reject duplicate or missing store numbers globally. Each page then uses `orderBy(documentId)`, `startAfter`, and `limit + 1` at the same read-only transaction `readTime`. The signed cursor proves that the initial validation applies to that same immutable historical snapshot; later pages do not repeat the identity scan. A later duplicate appears in the next run, which fails closed.

No composite index or schema change is required. For N documents and P pages, a successful traversal reads roughly N identity documents plus N page documents plus P-1 lookahead documents, rather than N full documents per page. Identity projections reduce data exposure and bytes, not billed document reads. The initial identity scan remains O(N) and deliberately fails before public data is fetched when identities conflict.

Firestore document update metadata cannot be queried as a field. Delta runs therefore also scan bounded Firestore pages and filter active status/update times server-side; they are not an efficient change feed. Efficient indexed deltas and tombstones require a separately approved persisted timestamp/change-log design. Snapshot cursors expire after 15 minutes, within Firestore's standard historical-read window; long-running clients must restart. The first watermark is server UTC time rounded down to a second, and boundary records may replay to avoid losing sub-millisecond updates.

## Store Manager Synchronization

Prefer a backend-to-backend request. The Store Manager browser must call its own backend and must never receive the directory API token.

```ts
const response = await fetch(
  `${process.env.DIRECTORY_API_ORIGIN}/api/v1/locations?limit=100&updatedSince=${encodeURIComponent(lastSyncAt)}&customFieldsVersion=${encodeURIComponent(lastCustomFieldsVersion)}&hierarchyVersion=${encodeURIComponent(lastHierarchyVersion)}`,
  {
    headers: {
      Authorization: `Bearer ${process.env.DIRECTORY_API_TOKEN}`,
      Accept: "application/json",
    },
  },
);

if (!response.ok) {
  throw new Error(`Directory sync failed with status ${response.status}`);
}

const page = await response.json();
```

Follow `pagination.nextCursor` until it is `null`, including empty pages with a continuation cursor. Preserve the same `updatedSince` value for every page. Every page is read at the first page's fixed Firestore snapshot time. The HMAC-signed cursor binds the position, filter, and watermark and expires 15 minutes after that watermark. On expiry or any failure, discard the incomplete run and restart from the last completed watermark. Never persist the request completion time or maximum record timestamp as the synchronization checkpoint. Persist `sync.watermark` only after applying the final page successfully. No cross-origin browser allowlist is configured.

## Mandatory Full Reconciliation

Active-only deltas cannot communicate retirements or hard deletions. There is no tombstone feed in this milestone. Every consumer MUST perform a full reconciliation on initial connection, after any failed or interrupted reconciliation, and at least once every 24 hours. Consumers needing retirement freshness below 24 hours must run full reconciliation at that shorter interval; deltas alone are never sufficient.

1. Serialize synchronization runs per consumer. Request `/api/v1/locations` without `updatedSince` and stage the complete active set across all pages under the same `sync.watermark`.
2. Do not delete or deactivate any local store while pagination is incomplete. Empty pages do not mean completion unless `nextCursor` is null.
3. After the final successful page, atomically upsert the staged stores and deactivate previously imported stores absent from this complete set. A successful empty full snapshot deactivates all previously imported directory stores, not unrelated local records.
4. Persist that snapshot's watermark in the same local transaction. Resume optional deltas from that watermark. Deltas upsert only; absence from a delta is never a deletion signal.
5. A `409 location_conflict`, authentication error, expired cursor, or repository failure must abort the run without changing the local active set or advancing the checkpoint. If a mandatory reconciliation cannot finish, mark the replica stale and alert operators rather than claiming a current roster.

Retirements/deletions after the snapshot are deliberately deferred to the next full reconciliation. This protocol provides a consistent historical active roster, not an immediate lifecycle change feed.

## Deployment Follow-up

Before production deployment, verify the existing runtime identity can read and write the named Firestore database, configure a shared rate-limit store if coordinated multi-instance limits are required, choose the production request limit, and route structured logs without authorization headers or response bodies. No new secret or IAM change is required by managed API clients. Cloud Run's single proxy hop is trusted only when its `K_SERVICE` marker is present. Resolve location conflicts first. Create a production client only after the reviewed revision is deployed and authenticated SysAdmin acceptance is approved.

## Canonical Generation Decision

The independent review found 100 Active documents representing 50 store numbers, with two conflicting public records per number: 50 `loc-shk-*` documents and 50 from another ID scheme. Update recency and ID format alone do not establish authority. The browser seed contains 49 stores, with only 46 overlapping Firestore store numbers; browser edits remain local and do not update this API.

The data owner must supply or approve:

- The authoritative business roster and store-number normalization rules, including the four Firestore-only and three seed-only store numbers, closed stores, and effective dates.
- Provenance for each document generation: source system/import job, import date, transformation rules, document-ID policy, and which service or person is authorized to maintain it.
- Audit/import history explaining field differences. Last update time can reflect a re-import rather than a more accurate business value.
- A field-level authority decision for addresses, public phones/privacy, operational state, and hours, including whether templates or embedded schedules control published hours.
- Ownership and sign-off for the canonical generation or explicit per-store resolution, including external references to existing document IDs.
- A separately approved backup, reconciliation, rollback, and writer-cutover plan. The browser UI must eventually read/write the same server-owned source of truth under its own approved persistence milestone.

No generation has been selected, hidden, deleted, migrated, or rewritten. The disabled Admin webhook and Firestore controls do not claim connectivity or successful cloud writes; their displayed counts are labeled browser-local.
# Personnel and staffing v2 (review feature)

The reusable contact-free API contract is in
[the v2 guide](docs/personnel-staffing-api.md) and
[shareable OpenAPI](docs/personnel-staffing-openapi.json).
It adds explicit `personnel:read` and `staffing:read` grants and coherent full
snapshots. Existing v1 response fields, location-only grants and sync behavior
are unchanged. This feature requires review/deployment before live use.

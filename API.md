# Store Directory API v1

The first API milestone is a read-only, server-authenticated view of active location records in the named Firestore database. It does not write or migrate Firestore data.

## Endpoints

All v1 requests require `Authorization: Bearer <token>` and the `locations:read` scope.

### `GET /api/v1/locations`

Query parameters:

- `limit`: optional integer from 1 to 100; defaults to 50. This bounds scanned documents, not the count of matching active records. A filtered page may be empty and still have a continuation cursor.
- `cursor`: optional opaque cursor returned in `pagination.nextCursor`.
- `updatedSince`: optional valid ISO 8601 timestamp with a timezone and at most millisecond precision. Matching uses Firestore document update time, with an inclusive lower bound to permit safe boundary replay. Upsert by store number.

The response contains active records only:

```json
{
  "data": [],
  "sync": {
    "watermark": "2026-09-08T12:00:00.000Z",
    "mode": "full",
    "fullReconciliationRequired": true
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

Successful responses include `X-Request-ID`, a strong `ETag`, and `Cache-Control: private, max-age=60, must-revalidate`. Send `If-None-Match` on later requests to receive `304 Not Modified` when appropriate. A new list run has a new watermark and therefore a new representation/ETag; detail responses and repeated snapshot pages can be revalidated.

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

## Authentication Configuration

Authentication configuration belongs in the server runtime environment. Do not place tokens, digests, or the HMAC secret in frontend code or browser storage.

- `DIRECTORY_API_TOKEN_HMAC_SECRET`: high-entropy secret used to compute HMAC-SHA256 token digests.
- `DIRECTORY_API_CREDENTIALS_JSON`: JSON array of credential metadata and lowercase hexadecimal digests.
- `DIRECTORY_API_RATE_LIMIT`: requests allowed per window; defaults to 100.
- `DIRECTORY_API_RATE_WINDOW_MS`: rate-limit window; defaults to 60000 ms.

Credential records have this shape:

```json
[
  {
    "id": "store-manager-sync",
    "digest": "64-lowercase-hex-characters",
    "scopes": ["locations:read"],
    "expiresAt": "2027-01-01T00:00:00Z",
    "revoked": false
  }
]
```

Generate at least 32 random bytes for each token and for the HMAC secret. Compute the stored digest as `HMAC-SHA256(secret, plaintextToken)`. Deliver the plaintext token once through an approved secret channel, then store the token and HMAC secret in separate Secret Manager secrets. Rotation is performed by adding a new digest, updating the client secret, and revoking the old credential.

The API fails closed with `503 api_not_configured` if either the HMAC secret or credential list is absent. Revoked, expired, malformed, and unknown tokens all receive the same `401 invalid_token` response.

Duplicate credential IDs and duplicate token digests are rejected at startup, including active/revoked duplicates in either order. Non-boolean revocation flags are rejected as well. Credential values are not included in configuration errors.

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

All configuration comes from server environment values: `SMTP_HOST`, `SMTP_PORT` (465 or 587), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, and `SMTP_ALLOWED_RECIPIENTS` (comma-separated exact mailboxes). There is no sender fallback, anonymous transport fallback, or caller override. Port 465 uses implicit TLS; port 587 requires STARTTLS. Both require certificate verification and TLS 1.2 or newer. Attachment/file/URL access and transport debug logging are disabled, and connection/socket timeouts are bounded.

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
  `${process.env.DIRECTORY_API_ORIGIN}/api/v1/locations?limit=100&updatedSince=${encodeURIComponent(lastSyncAt)}`,
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

Before production deployment, provision credentials in Secret Manager, create a least-privilege runtime service account with read-only named-database access, configure a shared rate-limit store if multiple instances are used, choose the production request limit, and route logs using request IDs without authorization headers or response bodies. Cloud Run's single proxy hop is trusted only when its `K_SERVICE` marker is present. Resolve location conflicts first.

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
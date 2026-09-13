# Dispatch 9: Confirm Location Import

**Status:** Implementation complete; review and manual acceptance pending
**Starting SHA:** `54d1814b94879f32a2fcf04875083d9405c087a6`
**Depends on:** Dispatch 8 `locations-v1` guidance and preview contract
**Implementation mode:** Atomic Location additions and updates only; no migration, partial import, repair, or automatic rollback

## User workflow

The Admin workflow is **Upload → Preview → Review → Confirm Import → Results**. Preview remains read-only. Confirmation is available only when the complete batch has no blocked rows, contains at least one addition or update, and every warning has been acknowledged. The review shows addition, update, unchanged, blocked, and warning counts before confirmation.

Confirmation saves every changed row atomically or saves none. There is no row selection or partial-import mode. During confirmation the controls are disabled and progress is announced. A successful response reports authoritative addition, update, and unchanged counts, reconciles the returned Location records into directory state, and links to each saved Location. A transport failure or unreadable success response is reported as an uncertain outcome; retrying the same operation retrieves its durable receipt without repeating writes.

Selecting a different file clears the prior CSV, preview identity, warning acknowledgement, receipt, and retry state.

## Server-verifiable review identity

An eligible preview creates a server-generated operation ID, batch ID, and HMAC-signed manifest. The manifest binds:

- schema version and exact source CSV digest;
- authenticated actor ID, role, status, and access scope digest;
- issue and action counts, including warning count;
- generated or existing target Location IDs;
- create-only markers or expected versions for every changed row;
- normalized proposed data for every addition and update;
- Location ID, expected version, and Store Number for every unchanged row;
- issue and expiry timestamps.

The browser returns only the exact CSV, signed token, operation ID, and warning acknowledgement. It cannot supply validation results or arbitrary writes. Confirmation reauthenticates the caller, verifies the signature and all bindings, and rejects changed CSV content, actor authority, operation identity, malformed tokens, or unreviewed warnings.

Tokens expire after 10 minutes. An expired token cannot start a write. It may retrieve an already-committed receipt for the exact signed manifest, which supports recovery after a lost response. Rotating the signing secret invalidates outstanding uncommitted tokens; rotate after the 10-minute window when practical. `LOCATION_IMPORT_TOKEN_SECRET` is server-only, must contain at least 32 bytes, and must be provisioned before deployment. Without it, preview continues to fail closed for otherwise confirmable batches.

## Atomic confirmation and audit

`FirestoreDirectoryStore.confirmLocationImport` uses one Firestore transaction. It reads a deterministic receipt first, then rechecks the complete reviewed batch against current authoritative Locations, People, Regions, Districts, and custom-field definitions. The transaction enforces:

- create-only semantics for additions and expected versions for updates;
- expected identity and version for unchanged reviewed rows;
- normalized Store Number uniqueness across the final relevant Location state;
- existing Location validation, hierarchy and Person references, lifecycle dependencies, omitted-field preservation, and unsupported-clearing rules;
- one write per reviewed target and no silent change to the proposed batch.

Any stale version, deleted or changed unchanged target, identity collision, changed reference, lifecycle conflict, validation failure, or oversized atomic payload aborts the whole transaction and requires a new preview.

The successful transaction writes each changed Location, one correlated audit record per changed Location, and one durable receipt. Audit records use server-authenticated actor data and include the operation ID, batch ID, and before/after evidence. Audit IDs and the receipt ID are deterministic from the operation. Reusing the same operation and manifest returns the receipt with `replayed=true`; reusing an operation ID with different content fails.

## Limits

| Limit | Value | Reason |
|---|---:|---|
| Decoded CSV | 2,000,000 bytes | Existing `locations-v1` upload contract |
| CSV rows | 100 | Bounds snapshot comparison and review size |
| Changed rows | 40 | At most 40 Location writes + 40 audits + 1 receipt in one transaction |
| Signed token | 1,000,000 bytes | Bounds client/server confirmation payload |
| Estimated atomic data | 8,000,000 bytes | Includes saved records, before/after audits, and receipt below Firestore's transaction request ceiling |
| Confirmation lifetime | 10 minutes | Limits stale first-time commits while permitting prompt review |
| Import route rate | 20 requests per minute | Existing authenticated preview/import limiter |

Oversized batches fail before writes. A batch advertised as atomic is never split.

## Recovery

For an uncertain response, retry the same CSV, token, and operation ID. If the transaction committed, the server returns `location_import_receipts/{operationId}` without rewriting Locations or audits. If no receipt exists and the token is still valid, the transaction may be attempted; if the token expired, a new preview is required.

Operators can correlate a receipt with `audit_logs` by `operationId` and `batchId`. Each audit contains the affected Location ID and before/after evidence. Recovery is a reviewed manual process: compare the current Location with the recorded imported `newState` before considering a compensating change. If later edits differ from that state, do not blindly restore the old value. This dispatch does not implement automatic rollback or restoration.

## Verification

Focused tests cover mixed additions, updates, and unchanged rows; create-only and expected-version conflicts; changed and missing references; normalized identity collisions; revoked or changed authority; warning acknowledgement; tampered, expired, and mismatched confirmations; stale unchanged rows; atomic failure; per-record audit evidence; payload and row limits; concurrent duplicate confirmation; idempotent and post-expiry receipt replay; lost-response retry; omitted-field preservation; and browser-safe dependencies.

Required verification commands:

- `npm run lint`
- `npm run test:api`
- `npm run build`
- `git diff --check origin/main...HEAD`

Playwright is not part of this implementation pass. Browser and functional acceptance remain with the product owner.

## Remaining limitations

- Locations only and `locations-v1` only; no People, hierarchy-registry, custom-field, hours, settings, account, credential, or configuration import.
- Blank cells still preserve existing values; explicit clearing is not supported.
- No partial-row import, automatic retry loop, automatic rollback, restore endpoint, or import-compatible backup export.
- Export All Stores remains a presentation export and cannot be confirmed as an import.
- New Location IDs are generated during preview but are not reserved outside the signed operation; confirmation rejects any intervening collision.
- Receipt recovery through the UI requires retaining the current page's exact operation data. Durable receipts and audits remain available to operators after navigation or secret rotation.

## Manual checklist

1. Upload a mixed file and confirm addition, update, unchanged, blocked, and warning counts match the row review.
2. Confirm that blocked batches, unchanged-only batches, and unacknowledged warnings cannot be submitted.
3. Confirm an eligible batch and open every returned Location link; refresh and verify saved values.
4. Retry the same confirmation and verify the authoritative replay result creates no duplicate changes.
5. Change a reviewed Location or referenced Person after preview and confirm the stale batch is rejected in full.
6. Simulate a dropped confirmation response, retry the same operation, and verify the receipt is recovered.
7. Upload a different file and verify the prior confirmation state and warning acknowledgement are cleared.
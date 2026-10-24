# Dispatch 39 — protected transition endpoints, disabled by default

October 23, 2026 Pacific. Source integration, not a production release. Follows [Dispatch 38](dispatch-38-transition-session-boundaries.md). Last verified serving source remains PR #53 `62acacb`; no deployment, real staffing change, secret or IAM binding is performed here.

PR #59 merged at `ca71f53` after clean code/security/CodeRabbit reviews. PR #60 merged at `b70f8f3` after repairing both valid code findings, clean final code/security reviews and affected browser acceptance; CodeRabbit was rate-limited on its final head, not an approval. This phase builds on those merged trees. Preview explanatory text now describes its own lack of side effects, rather than falsely claiming no separate recovery endpoint can be enabled.

## Fixed server surface

Under `/api/directory/person-transitions`, current authenticated Active Company-wide System Administrators can query `GET /capabilities`. The existing read-only `POST /preview` remains. New endpoints are `POST /prepare`, `POST /commit`, `GET /operations`, `POST /status` and `POST /cancel`. They accept only the fixed normalized command or minimal immutable marker, not arbitrary patches, actor IDs, collection paths or account changes. These are internal Firebase-session endpoints, not a new Directory consumer API/grant.

Authentication precedes JSON parsing and per-actor limits. Command bodies are bounded to 128 KiB. Replies are private/no-store and successful private responses avoid ETag/304 synthesis. Backend errors map to fixed statuses/messages without raw exceptions, contact records or signature material. An unconfirmed result is never reported as cancellation or permission to submit a new UUID.

The Store and HTTP boundary both enforce server-only admission. `PERSON_TRANSITION_COMMANDS_ENABLED=true` **and** `PERSON_TRANSITION_RECOVERY_ENABLED=true` **and** a valid dedicated `PERSON_TRANSITION_REVIEW_KEYRING` are required for new preparation/commit. Missing, malformed, nonliteral or incomplete configuration fails closed. A key alone does not enable writes. All relevant Store methods must be present before capabilities advertise new-command availability.

Recovery has its own explicit switch and no signing-key dependency. Leave recovery enabled when disabling new commands or rotating/removing the signing key so current administrators can inspect/seal original operations. Store helpers still transactionally recheck unique current authority; HTTP authentication/capabilities are not a replacement for those checks. Terminal status remains available without the original key; a cancellation request never reverses a committed result.

New-command preview/prepare/commit use the existing tight 10-per-minute actor budget. Recovery/capabilities use a separate 120-per-minute actor budget (plus the existing parent IP limit), allowing the bounded 50-marker recovery inventory to be checked without consuming a 10-request write budget. Limits fail closed rather than silently truncating a recovery inventory.

No UI imports/submission are enabled. Existing generic commit, District-only handover and ordinary position-removal guards remain unchanged. The atomic writer is now included in the server bundle behind the explicit gates; prior dispatches' **unwired** descriptions are historical source checkpoints, not the current import graph. Environment examples leave both flags false.

## Validation

- Five new local HTTP/configuration groups passed: strict defaults/key gates; auth-first denial; bounded fixed bodies/private responses; missing-method/new-command kill switch with recovery; conflict/privacy and full 50-status rate-budget coverage.
- Fourteen affected existing preview/atomic groups passed after wiring.
- One new actual Express HTTP → Store → Firestore SDK demo-emulator scenario passed: review/prepare/commit, identical duplicate result with one version/audit effect, then disabled-command/keyless status/cancel/list recovery. It uses only the isolated loopback demo project/unique synthetic database from Dispatch 36; no production Firebase login or existing data.
- Final stable-tree ordinary suite: **641/641 passed**. One earlier combined run was invalidated by switching branches to repair PR #60 while tests were still loading source; it failed on the temporarily missing new configuration module, not a reported product regression. The stable-tree rerun replaces that invalid result; no partial run is represented as acceptance.
- Production build passed with the existing bundle warning. Final types/whitespace and review are required for source readiness. Reuse the earlier SDK concurrency/recovery evidence where unchanged; this HTTP case does not independently establish production concurrency/index/protection acceptance.

## Release gates and next work

Complete review, then build the short accessible eligible-replacement-or-vacancy dialog and synthetic browser/server acceptance, including timeout/reload/sign-out/mobile/keyboard behavior. Keep routine position additions ordinary edits and District assignment separate. Verify direct-client protection of operation receipts/audits and required production indexes before activation. Provision only the owner's approved single managed signing secret/read binding for the existing server identity, and use a guarded release after all gates pass. Any broader permissions/policy change needs an owner decision. No actual staff selection, account/mailbox/provider/API grant/token mutation, data cleanup/restore, Region/acting ownership or issue #36 consumer acceptance is implied.

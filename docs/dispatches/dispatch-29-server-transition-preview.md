# Dispatch 29 — Server-backed Person transition preview

**Current checkpoint:** PR #49 is merged and published. The implementation/review notes below preserve the development sequence; the publication checkpoint at the end governs current state.

## Scope and release state

P3.1 continuation from documentation main `981f924`, after [PR #47](dispatch-28-person-transition-preflight.md), now published through PR #49. Exact source/build/traffic and separate review/acceptance limits are recorded in the publication checkpoint below. [Issue 36](https://github.com/twgallo13/Shiekh-Directory/issues/36) stays open for authenticated consumer acceptance.

Read-only review only: no coordinated writer, replacement choice, real staff/contact/assignment/account/mailbox/provider change, consumer fields/grants/tokens, consumer-app work, Notion edit, backfill or restore. Existing write guards remain authoritative. There is no safe-to-inactivate result.

## Internal contract

`GET /api/directory/people/:personId/transition-preview` uses an existing Firebase Bearer session, not a v1/v2/v3 consumer token. Requires **Company-wide** System Administrator or Directory Data Steward. After authentication, the read-only Firestore transaction rechecks the unique active `firebaseUid` account's current role/scope. Editor/Viewer/scoped/ambiguous/revoked access fails closed. Exact Person IDs alone establish account links, never names/emails.

One coherent transaction reads the exact Person; all Locations (1,000), Districts (500), Regions (100), Users (5,000); and **Pending only** requests (1,000). Queries select review fields, excluding contacts/private request prose/historical authors. Limit+1 detects overflow: any overflow, unprojectable malformed data, database failure, selected encoded input over 4 MB or read lasting five minutes returns an error with no partial inventory. These are conservative capacity boundaries, not unlimited pagination. Approved/rejected/audit/outbox histories are not scanned.

Response: schema version 1, Person ID/version, `evaluatedAt`, five-minute `expiresAt`, SHA-256 `digest`, scope, `completeWithinScope`, limits/counts, source IDs/versions and minimal grouped review. Missing manifest versions are explicit `null`. Deterministic selected snapshot content includes authority, scanned membership, Pending baselines, additions/removals and relevant unversioned edits. Unrelated scanned changes may conservatively alter the digest; excluded contacts do not. This is not a signed token, receipt, lease, lock, actor-bound write capability or proof of continued freshness.

Groups distinguish District-owned DM/inherited stores, historical copied DM, Location-owned roles (including non-retail/retired), unresolved workplace/support links, all linked account states and exact-ID Pending targets/proposals/baselines. Zero-store/retired Districts remain visible. Regions provide hierarchy context, not a new ownership model. Pending/workplace links are review context, not new inactivation blockers. Historical attribution, free text, Firebase, mailboxes and other applications are outside scope.

`no-store`; successful reads bypass ETag/304 synthesis. Existing authentication returns 401/403/503; scope denial 403, malformed ID 400, missing Person 409, unavailable/overflow/projection failure 503. Generic errors expose no backend detail. Shared authenticated preview/operating limit 10/minute beneath router limit 120/minute. No writes, audits, receipts or notifications.

## UX and recovery

People → Person → **Review promotion / offboarding** → **Refresh from server**. Explicit read only, not automatic on open. Separate section shows snapshot times/counts/dependencies/digest; the loaded-data report below remains labeled. Client validates identity/schema/shape, times out after 20 seconds, aborts/ignores obsolete responses and clears the previous snapshot before refreshing. Denied/failed/malformed/timed-out reads never become empty inventory or reuse a prior success. Retry is another read, not uncertain-save recovery.

Monotonic client expiry starts at request initiation, conservatively accounting for read duration without local wall-clock dependence. Expiry warns to refresh; differing Person versions warn to reload the card. An unexpired snapshot can already be stale. Future writers must reauthenticate/re-read inside commit and supply their own concurrency, atomicity, idempotency and recovery contract. Never authorize a write with this display timer or digest.

## Validation and next boundary

- Full API/unit suite: 543 passed, including six new server/router cases and existing authority/relationship/request guards. Initial sandbox failure occurred before execution; permitted retry passed. Final transport repair receives a scoped ETag regression check.
- Nine synthetic browser cases passed: canonical loaded/mobile parity, empty review, Editor/Viewer exclusion, explicit independent server snapshot, changed Person version, expiry, denied/unavailable/malformed refresh removal and retry, timeout/late-result protection. Auth/data mocked; external HTTPS blocked; no live business writes.
- Types passed. Build passed with existing size advisory; final transport repair receives a final scoped build. Inspected 390px screenshot: no horizontal overflow, scrollable body and preserved footer.
- Independent reviews, exact merge and release evidence are pending, not claimed. Existing consumer schemas/guides unchanged; authenticated consumer payload/full-sync acceptance remains separate.

Review repairs: Codex identified wrong-shaped legacy relationships being misread; validate every projected Person/dependency shape before declaring completeness. Twenty malformed-field variants now reject the entire preview without writes. CodeRabbit identified a timing race in the timeout test; wait for the route to receive the read before advancing the clock. After repairs: 12 affected server/model tests, the affected timeout browser case, types and final build passed. Reuse the initial full-suite and other browser results where unchanged. Local documentation check validated five files / 87 relative targets. Final independent review remains pending.

Second scoped review repair: reject unclassified Location types using the existing shared classifier before any authority projection, rather than treating a malformed retail type as non-retail. Recognized lifecycle enums and exact request target-type checks also fail closed; an empty District owner is not an explicit vacancy. Twenty-eight malformed-field variants plus all six supported retail/non-retail ownership classifications are covered. Thirteen affected server/model tests, types and final build passed; no browser runtime changed by this server-only repair. Latest-head independent review remains pending; CodeRabbit's latest run was rate-limited, not an approval.

Next: document explicit desired positions/replacements/vacancies, membership/version preconditions, Directory access consequences, atomic limits and idempotent receipts/cancel/uncertain-save recovery **before a coordinated writer**. No silent removal of old roles/stores or account-access grants. Region/acting leadership, migration and actual staffing decisions remain separate gates.

Prefer forward repair; PR #47 remains a fallback containing the loaded-data report and all prior write guards. Reverting removes only this internal read/control, not data. Never restore collections or revoke credentials to undo the preview. Documentation-only checkpoint commits require no rebuild.

## Publication checkpoint — October 22, 2026 Pacific

Source `29020a2dc8bbadf70464e5ade504ec2a6fcccc8e`, tree `cf9ccc49f626cac7d6e448db18c13cd08b7c744b`, exactly matches tested `73ed604e389417e6368a973d0491d9b8605a12bb`. Build `c26c691e-04fa-4367-bca8-cb899a343cd0` succeeded with unchanged build principal. Ready revision `shiekh-location-company-directory-pr49-29020a2` is sole 100% desired/observed traffic after no-traffic candidate checks and concurrency-guarded promotion. Configuration/identities/Firebase, 26 historical tags and branded Ready/DomainRoutable routing are preserved; only temporary candidate tag removed.

Both hosts match HTML SHA-256 `55bfb5e348b7e1bda5d6eba2a74212971eb5cbb0b83e28f1fa93f6b50588bd42`, 45 MIME-validated assets, and all four served document hashes from Dispatch26. No-store/conditional-cache, v1/v2/v3/operating/internal-preview denial and unknown-route checks passed. Promotion initially paused on a false document aggregate: candidate report included four document keys, baseline only two. Shared hashes and explicit live checks confirmed all four equal; corrected baseline option produced `apiDocsUnchanged: true` before promotion. This was a verifier input-set repair, not an application/configuration discrepancy or bypass.

All three reported findings were fixed/tested and threads resolved. Latest-head security review completed without findings; optional latest code review was still running at publication, not claimed as approval. CodeRabbit's new-head run was rate-limited after its initial review/fix. Initial full suite 543/nine browsers plus final scoped 13 tests/timeout test/types/build are distinct applicable evidence, not a claim of rerunning every test after each fix.

After confirming no draft, refreshed the existing authenticated People page and opened the known profile read-only. Explicit server refresh succeeded: 50 Locations, 3 Districts, 1 Region, 7 Users and zero Pending requests. All dependency groups and snapshot warnings rendered. Closed without editor/save/inactivation/deletion. This proves authorized live snapshot/display, not a staffing action, external-access check or authenticated consumer API acceptance. No live staffing/contact/account/mailbox/provider/grant/token/Notion/consumer-app mutation or restore; no private inventory exported into the repository.

The existing Codespace was resumed after idle stop. Temporary deployment tooling had been removed by restart; [Google's official CLI package/checksum](https://docs.cloud.google.com/sdk/docs/install-sdk?hl=en) was rechecked: 590.0.0 Linux x86_64 archive SHA-256 `351ed4a2812c5525c1cee00334257a42c020fcaffa27d3067c1eec0a618dd83f`, verified before extraction. Existing authorization was reused, not expanded. Metadata is restricted. Next: coordinated-command contract before any writer; Region/acting/migration and issue 36 consumer acceptance remain separate.

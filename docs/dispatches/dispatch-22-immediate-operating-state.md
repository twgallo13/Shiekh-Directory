# Dispatch 22 — Immediate operating state

## Scope and release state

Owner-approved continuation after published PR #32 (`ea53efb`). Implementation on `codex/immediate-operating-status`; not merged or deployed yet. Next slice is address/suite/wayfinding corrections and consistent consumer/export surfaces. No staffing migration, data restoration, DM-email publication, account/credential or other-application changes.

## Contract

- Shared resolver returns `Open`, `Closed` or `Unknown` (UI: Needs verification), with reason, store-local date, time zone, evaluated timestamp, next known transition, source and issues. No invented default hours, viewer-local dates or assumption that remodeling means closed/open. Equal opening/closing times are ambiguous. Weekly, dated, overnight and daylight-saving boundaries are explicit; conflicting/missing schedules fail to Unknown. Informational notices do not establish closure. Notice expected-resolution dates are not expiry dates.
- Dedicated immediate close/renew/reopen command: server reads current Active account and canonical active SM/DM assignments transactionally. Scoped admins/stewards may act; titles/emails do not grant access. Store scope preserves exact leading zeroes. District-owned vacancies cannot fall back to stale copied store DMs. Ordinary editors/imports cannot change `temporaryClosure`; omitted overrides are preserved. Direct Location changes/deletes enforce supported scope.
- Preview performs no write. Confirmation binds Location/version, prior closure ID and exact expiry. Commit rechecks all of them and saves the Location, append-only operating event, actor-bound receipt and audit atomically. A closure ends at the next midnight in the captured store time zone, not after 24 elapsed hours. A later time-zone edit retains that confirmed absolute deadline. Expiry needs no cleanup write and returns to schedule/lifecycle, not forced Open. Continuing on a later day requires explicit new confirmation. Reopen only ends the same still-active event.
- New indefinite legacy Emergency statuses are rejected through ordinary writes and correction approval. Existing legacy emergency values remain visible with an expiry-review warning; no guessed conversion or data cleanup. Clear/review the old lifecycle before using the new command.
- Tab/account-bound session storage retains the exact command before dispatch. Storage failure sends nothing. Lost/malformed replies retain recovery; retry reuses the ID/content. Transactional cancellation seals uncommitted commands against late arrivals; already committed cancellation checks never reopen a store. Replay returns current state, not stale original state. Storage is not a cross-device disaster backup. Receipts/events must not be deleted as cleanup.
- Browser clock is anchored to server time and monotonic elapsed time; ticks every 15 seconds. Visible connected screens poll every 30 seconds and refresh on return/online, targeting updates within 60 seconds, not a guaranteed offline SLA. Read responses racing a local write are discarded. Refresh failures are displayed. Backend always reauthorizes even if UI scope is stale.
- Closure reasons are customer-facing text (500 characters); UI warns against personal/confidential information. Existing configured steward gets a best-effort post-commit notification. No new recipients or SMTP policy. Replay avoids a second client notification; a lost original response may mean no notification, so no durable delivery guarantee is claimed.

## API and exports

`GET /api/v1/locations/{storeNumber}/operating-state` uses existing `locations:read` authentication and exact store number, returns no-store current evaluation, and rejects snapshot/pagination query parameters. It is separate from frozen list/detail synchronization; existing v1 raw `operationalStatus` and v2 snapshot meanings do not change. Internal actors, receipts, staffing/contact fields and extra historical closure/hour properties are explicitly excluded.

Reporting CSV gains informational `CurrentOperatingState`, `OperatingReason`, `OperatingEvaluatedAt`, `OperatingNextTransitionAt`, `TemporaryClosureExpiresAt`; import recognizes/ignores them. Editing CSV does not become an incident writer. Detail, list filters/badges, dashboard, copied summary and print use the shared resolver; print identifies its evaluation snapshot.

## Evidence / release gates

Full initial integrated serial suite: 478/478. After subsequent API/deadline/recovery refinements, 37 affected tests passed; 18 contact/write guard tests passed. Three synthetic browser cases cover preview/no premature write or mail, immediate confirmation, lost-response reload/exact retry and offline local expiry. The expiry fixture first failed because its simulated bootstrap returned an old server clock after a 14-hour jump; the corrected offline fixture passed. Unaffected browser results reused. Final type/build, independent review and production checkpoint remain required; no authenticated live writes or real email probes.

## Rollback / remaining work

PR #33 Codex review identified a preliminary mail-role gate that denied Editor/Viewer operating-event creators before the actor-bound resolver ran. A focused HTTP regression reproduced 403 instead of 200. The event now reaches its existing committed-event actor check; approval notifications and diagnostic mail remain admin/steward-only. Synthetic recipient/escaping checks and the actor notification test cover this distinction. No live mail was sent.

PR #32 lacks the new override/receipt protections. Prefer forward repair. Before any older writer serves, restrict operating changes and ordinary Location writers and reconcile in-flight operations; traffic rollback alone is not data recovery. Preserve identities, environment, domain, historical traffic tags and other app resources. Keep old emergency records for owner review. Address suite/directions and their migration-free nullable contract are next; broader hierarchy/position/offboarding phases remain separate.

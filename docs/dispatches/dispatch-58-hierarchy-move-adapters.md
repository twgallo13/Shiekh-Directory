# Dispatch58 — Gated move adapters and strict browser transport

Private Store/HTTP adapters and browser DTO/transport implemented and locally accepted for review. No move UI/recovery controller or production activation yet. Generic managed moves remain blocked.

## Admission and private contract

`/api/directory/organization-moves` supplies authenticated administrator capability/catalog/prepare/commit/status/cancel/operations endpoints. Each operation is admitted again by the Store. It uses the existing three organization catalog/recovery/command controls; commands require all three and recovery remains independently available when commands are paused. There is no new flag or automatic production activation. Runtime preview guards already cover these shared controls. Enabling them remains contingent on completing the whole supported organization workflow, including moves and remaining release gates.

The catalog reuses the private canonical organization projection. New methods are optional in the Store interface; partial implementations cannot advertise command capability and no generic commit/read fallback is used. Only current Active Company-wide System Administrators can use the route. Bearer authentication, actor/IP rate limits, no-store/no-ETag responses, 32KB exact-schema bodies, server-resolved actors and sanitized infrastructure failures preserve the existing boundaries. Public v1/v2/v3 response fields, grants and credentials are unchanged.

The shared move DTO includes a fixed intent and contact-free exact before/after hierarchy, manager summaries, affected stores and counts. Strict client parsing rejects wrong operation/kind/destination/reason, impossible counts, duplicate stores, changed District DM on a parent move, missing/enriched fields, invalid expiry and other audit domains. Prepared review expiry is fixed to the ten-minute server contract. A name or contact field cannot silently expand the DTO.

Session-bound transport is extracted from the existing leadership client with a fixed family/mode allowlist. Both wrappers retain token/session-generation checks before/after async work, timeouts, abort/disposal, same-origin fixed URLs, no-store, redirect rejection, bounded request/response sizes, safe errors and no automatic retries. Move outcomes use their separate audit domain. No browser storage/lease/workflow is introduced here: the future controller must persist and fence the actor/operation identity before preparation/mutation and reconcile unknown outcomes before another intent. No screen imports the move port yet.

## Evidence

- Final complete ordinary suite **850/850 passed**, zero failures/skips; final TypeScript and release build passed with the existing Vite chunk advisory.
- Ten new move-API ordinary cases cover authentication, role/scope/lifecycle exclusion, shared gate defaults/dependencies, paused recovery, partial implementations, exact bodies, size/parser ordering, actor propagation, sanitized failures and Store rejection before database access. Six move-client cases exercise real prepared store/parent DTOs, malformed/enriched responses, operation/audit identity, fixed routes/no retries, intent rejection before transmission, auth-generation/token fencing and timeouts. Existing shared transport/recovery tests remain passing. These cases are part of the full total, not additional totals.
- One full **HTTP → Store → actual SDK/emulator** scenario passed for default-off refusal without receipt, private catalog, strict prepared parsing, paused-command status/cancellation, fresh review/one commit, duplicate confirmation recovery, terminal pending-list cleanup and live authority loss. Provider authentication is mocked only in this isolated harness; current Directory authority uses real SDK reads. Environment flags are process-local test setup and restored; no production configuration changed.
- The loopback-only emulator/unique named database was stopped after acceptance. No browser visual acceptance is claimed: this phase changes contracts/transport, not the move screen.

## Required continuation

Durable move-specific actor/operation markers and tab lease, session fencing and strict saved-state refresh, missing/unknown-outcome status/cancel reconciliation, then deliberate dependent District/Region selection, affected-store before/after, draft reapplication and desktop/mobile journey acceptance. Keep move state separate from roster operations. Complete independent exact-source review, correction/import/wider concurrency, opt-in consumer and migration/rollback/guarded production acceptance. No whole-main deployment, LP work, live data repair, IAM/grant/token or expanded authority changes.

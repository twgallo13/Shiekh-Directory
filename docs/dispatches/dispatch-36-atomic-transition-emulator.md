# Dispatch 36 — isolated SDK evidence and atomic transition writer

October 23, 2026 Pacific. Source implementation only, not deployed or enabled. Builds on merged [PR #56](dispatch-34-person-transition-recovery.md) and [PR #57](dispatch-35-client-transition-recovery.md); follows the [command contract](../plans/person-transition-command-contract.md) and [agreed rules](../plans/positions-and-assignments-rules.md). The last verified production checkpoint remains PR #53 source `62acacb`; this work performs no deployment or live data operation.

## Server-derived atomic writer, deliberately unwired

`commitPersonTransitionAtomic` accepts the fixed normalized intent, exact original envelope and prepared operation UUID—not raw writes or caller paths. No app/Store/router imports the module, and no HTTP commit route or new UI is registered. Existing generic commit, strict District-only handover and position-removal guards are unchanged.

The writer authenticates no token itself: future trusted HTTP callers must authenticate Firebase first. Shared checks require the supplied and unique current transactional Directory account to be an Active Company-wide System Administrator. The authority check runs before receipt access. A valid matching committed receipt returns its original minimal outcome before clock/later-inventory checks; cancellation is terminal; absent preparation cannot be implicitly created. Signature and exact actor/subject/intent/envelope identity remain mandatory.

For a prepared operation, the server verifies freshness and rereads every bounded predicate inventory and exact subject/replacement using the same adapter as command preview, in its read-write SDK transaction. Ready state and original intent/state/plan hashes must match; retries never accept a new plan. The shared adapter extraction preserves projections, native timestamps, absence/presence/version semantics and limits. It has no write capability or authority-bypass flag.

Before staging any write, the writer reads the full changed records, checks identities/native timestamps/presence-aware versions against that plan, independently checks a fixed field allowlist, and enforces 90 unique business documents plus conservative full-record 4 MiB and audit/receipt bounds. Common native Firestore metadata types are preserved/sized without dumping contacts into the audit. Unsupported saved values or SDK/platform failures fail closed; these estimates are not a platform guarantee. New versions must remain safe integers.

Only allowlisted fields plus version/one timestamp are updated, preserving unrelated names/titles/contacts/address/hours/closures/custom metadata and IDs. Each changed record increments once. The deterministic create-only audit, terminal receipt and all business updates occur in one SDK transaction with native update-time preconditions. The audit contains the redacted decision review, standard actor attribution and bounded deliberate change reason—not raw full records, contact copies or signing token. Receipt/outcome remain minimal and contact-free. No account, mailbox/provider, API grant/token, hierarchy migration or restore write is possible.

## Reproducible isolated emulator boundary

`npm run test:transition-emulator` is an explicit integration command, outside the ordinary `*.test.ts` glob. It fails before any SDK instance/RPC unless `FIRESTORE_EMULATOR_HOST` is exactly `127.0.0.1:8089`. SDK instances hard-code `demo-directory-transitions` and create unique synthetic named databases. No production database/project configuration, credentials or existing collection is used or reset.

The official emulator runs with loopback host, synthetic project and single-project mismatch errors. A portable Java 21 runtime was downloaded/extracted only inside workspace test outputs—not installed globally. No cloud permissions, signing key or managed secret was created.

- Official Firestore emulator 1.22.0 SHA-256: `9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c`, verified before execution against [Firebase's official artifact manifest](https://github.com/firebase/firebase-tools/blob/master/src/emulator/downloadableEmulatorInfo.json).
- Portable Temurin JRE 21.0.12.1+1 SHA-256: `d35f31e712f0fcf6ac5a093edc90204fbff22f720ba3950bd09d331d5e621636`, verified against the official Adoptium release metadata.
- Follow [Firebase's demo-project/emulator connection guidance](https://firebase.google.com/docs/emulator-suite/connect_firestore). Emulator transaction/index/platform behavior is not a blanket production-equivalence guarantee; do not change database concurrency mode or infer production index/limit acceptance from this run.

## Validation evidence

Eleven distinct actual server-SDK/emulator scenarios passed across initial and targeted affected runs, not falsely presented as one eleven-test invocation:

1. Native metadata/nested request masks and combined Person/District/active+retired copies, with unrelated contacts/operating data and native Timestamp/Reference/GeoPoint/bytes preserved.
2. Concurrent duplicate commit: one effect/audit; original terminal replay after expiry/later changes.
3. Actual commit/cancel race: one terminal outcome, no partial business effects.
4. Unversioned names, new membership/User/Pending request/District responsibility and delete/recreate invalidate the original review with no command writes.
5. Full saved-record capacity and create-only audit collision roll back all business/receipt changes.
6. Missing preparation, expiry, revoked authority and cancelled IDs never admit a commit.
7. Explicit SM+DM replacement preserves other fields, derives the current phone/privacy correctly and keeps contact copies out of audit/outcome.
8. Simulated lost response **after a real SDK commit** recovers the durable result without repeating effects; this is not a claim of an actual network outage.
9. In-flight linked-User insertion versus Person inactivation: actual SDK retry/serialization prevents the invalid combined state.
10. In-flight retail member insertion versus District handover: current inherited ownership or a stale-plan rejection, with actual SDK retry evidence.
11. Concurrent absent preparation/cancellation and late preparation: one cancellation seal, no staffing change.

One replacement test initially expected unformatted digits; the app correctly returned its standard phone format. The fixture was corrected, not the contact formatter. Subsequent affected four cases passed. Native-value/audit-count checks were included in that affected run; applicable earlier successful scenarios were reused.

The extracted preview/recovery adapter passed 19 affected synthetic groups. Five new ordinary unit groups exercise actor/shape/key/signature admission, missing preparation and terminal replay. Final combined ordinary API/unit suite passed **609/609**, including merged client tests; type checking passed. Build/docs/import-boundary and PR-review evidence are recorded separately before readiness. No live staffing save, real-auth workflow acceptance or complete P3 release is claimed.

Production build passed with the existing bundle-size warning; 105 local documentation paths and whitespace passed. Import/bundle checks confirmed the atomic writer is absent from the runtime build. A negative configuration test rejected a non-loopback emulator setting before SDK initialization. The unchanged emulator/browser test servers are owned local test processes, not production resources.

## Remaining gates

Review this writer/refactor and SDK evidence; complete session-generation/auth-boundary/transport/restart recovery integration; provision the separately approved dedicated managed signing configuration; enable the fixed routes and short accessible replacement-or-vacancy dialog only after those gates pass; synthetic end-to-end/accessibility/timeout/restart acceptance and guarded no-traffic release follow. Actual staffing choices, account unlink/revocation, Region/acting ownership, restore/migration and issue 36 consumer acceptance remain separate. There is no new visual check for the owner yet.

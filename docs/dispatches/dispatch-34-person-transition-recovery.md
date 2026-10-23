# Dispatch 34 — internal transition recovery foundation

October 23, 2026 Pacific. Source implementation, not deployed/enabled and not a completed removal workflow. Builds on merged [PR #55 / Dispatch 33](dispatch-33-signed-transition-preview.md). Production remains PR #53 source `62acacb`. Follow the [agreed positions/assignments rules](../plans/positions-and-assignments-rules.md) and [command contract](../plans/person-transition-command-contract.md).

## What this slice adds

- A strict, minimal recovery marker: schema version, canonical lowercase UUID v4 operation ID, Person ID and immutable command digest. The digest binds actor, subject, normalized intent hash and exact review-envelope hash. A server-derived SHA-256 actor-plus-operation namespace keeps the same UUID in different actors' namespaces separate; same-actor content reuse conflicts rather than creating another key.
- A strict internal `person_transition_operations` receipt shape, with prepared/committed/cancelled states, immutable identity, original server times, minimal signed-review hashes and terminal audit/changed-ID/version metadata. No raw intent, token, reason, names or contacts are stored. Receipt/tombstone identity has no TTL or pruning mechanism.
- Unwired SDK helpers for prepare, own status, cancellation and a complete own-prepared list (50 plus one overflow detection). Every call checks supplied administrator scope and transactionally rechecks the unique Active Company-wide administrator mapping. Future HTTP callers must still authenticate Firebase first; the internal helper does not authenticate a token.
- Preparation verifies the signature, actor/subject/intent binding and freshness, then creates only minimal receipt metadata. Duplicate preparation is idempotent. Status/cancellation need current authority and marker identity, not the original envelope/key. A missing receipt returns **unknown**, never confirmation of failure or cancellation.
- Cancellation transactionally seals an absent/prepared ID and creates one deterministic cancellation audit. Late preparation cannot resurrect the tombstone. Existing committed/cancelled outcomes are immutable, not undone or retimestamped. Original committed outcomes can be read/replayed after preview expiry; re-preparation replay still verifies the original signature and current authority.

The signer now exposes an explicitly named signature-only verification primitive for terminal replay. **It does not authorize new preparation or any write.** Normal `verify` still requires freshness; preparation enforces that for absent/prepared operations. The same planner normalization/hash is reused, not a competing serialization.

## What remains deliberately unavailable

This recovery module is not imported by the application server, Directory Store or router. No prepare/status/cancel/list route is registered; no business commit method is implemented. It cannot yet be invoked from the app. The preview continues to report `canCommit: false`. Cancellation would affect internal metadata only, never personnel, Districts, stores or external access; tests invoke it only with synthetic SDK fixtures.

No protected browser marker storage, authentication-session reconciliation, reload/sign-out recovery UI, atomic staffing commit, actual SDK/emulator query-race proof, signing-key provisioning or deployment is delivered here. Minimal marker schema is **not** proof that protected client persistence exists. A prepared receipt is not a staffing change and is not an exclusive lock. Do not enable submission until those gates pass, and preserve all existing direct-save/removal blockers.

No live data, contacts, assignments, account/mailbox/provider access, API fields/scopes/client grants/tokens, cloud permissions or secrets were changed. Region/acting ownership, restore/migration and issue 36's consumer acceptance remain separate. No new visual check is needed yet.

## Evidence and next work

Forty-three affected planner/preview/recovery tests initially passed. Final full synthetic API suite: **596/596**, including ten new recovery test groups. Coverage includes strict identity/content reuse, signature/freshness, authority loss/duplicates, private-field exclusion, terminal replay, unknown missing receipt, absent/prepared cancellation, late preparation, lost-response status recovery, create-only audit collision/transaction rollback, actor-namespaced listing and actual 50/51 fixture boundaries. Existing HTTP denial tests still show the missing command routes as 404.

The transaction fixture serializes calls and stages rollback-capable changes. Its late-arrival permutations are **not actual SDK/emulator concurrency or distributed race evidence**. No live write or Firebase-authenticated recovery acceptance is claimed. Type checking, production build (existing bundle-size warning), 96 local documentation paths and whitespace checks passed. PR-review evidence is separate; none of these results implies deployment or activation.

PR review identified a terminal-replay clock-skew edge case: matching committed receipts must return after current authority/signature/identity checks, before consulting the current clock. The repair preserves freshness checks for absent/prepared operations and adds committed replay tests for past/invalid/throwing clocks. It does not relax signature verification or permit a new staffing write.

Next: protected actor-namespaced browser markers and restart/sign-out reconciliation, then the distinct server-derived atomic staffing writer with original-plan rechecks, full-document write/audit budgets and real isolated SDK concurrency/receipt-race tests. Keep configuration/writer/routes disabled until the contract's gates pass. Finally add the short accessible replacement-or-vacancy dialog, synthetic visual acceptance and guarded no-traffic release. Routine position additions remain ordinary edits, followed by separate District/Store assignment.

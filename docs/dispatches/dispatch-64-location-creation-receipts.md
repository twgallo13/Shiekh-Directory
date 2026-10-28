# Dispatch64 — Internal actor-bound Location creation recovery

A disabled-by-default internal receipt/admission foundation is built for review. It is not imported by a browser screen, has no HTTP route, and does not complete uncertain creation recovery or activate production.

## Authority and intent

The service reuses the existing organization command/recovery controls: preparing/saving requires all three gates; status/cancellation/discovery remains independently recoverable when new commands pause. Every service operation checks authenticated server-supplied Active Company-wide Location writer roles (System Administrator, Directory Data Steward, Editor) and rereads exactly one matching live Directory account in its transaction. These are existing Location writer roles, not new grants. Generic saves/imports have no new I/O when the internal proof is absent. The generic HTTP commit route cannot mint/pass a proof.

A preparation binds one exact create-only Location JSON command, expectedVersion null and actor UID to a namespaced hashed receipt identity. Finite JSON, fixed keys, identity, nesting, shared-inbox metadata and 200KB UTF-8 limits apply before persistence. A private actor admission document plus bounded pending query prevents more than 100 preparations, including concurrent attempts for the final slot. The pending index uses one actor hash field. Preparations expire after ten minutes for saving; they remain discoverable/recoverable until deliberately resolved.

Receipts store only schema/actor/Location identity, exact intent hash, times, state and eventual audit/version proof, not the full draft, contacts or credentials. Distinct actors cannot read/reuse one another’s receipt. A changed draft cannot reuse an existing identity. The full original intent is required only while saving; reopening can check/cancel using the identity alone.

## Atomic save and cancellation

`commitLocationCreation` uses a trusted internal hook in the existing Store transaction. It rechecks exact intent, live authority, receipt/admission and expiry before reading/writing the Location, then runs unchanged normalization/relationship/custom-field/canonical-manager validation. Exactly the initial Location version, deterministic mandatory audit, terminal receipt and admission decrement are written together. Audit byte bounds apply and an occupied deterministic audit is never overwritten. An already committed receipt returns its terminal result without reapplying/resurrecting a Location, including after later deletion/expiry. A follow-up status failure is recoverable through the same receipt.

Cancellation never undoes a saved creation. Cancelling a prepared or missing identity seals it against delayed preparation/save; the receipt read conflicts with a simultaneous commit. Exactly one saved creation or terminal cancellation can win. Counter corruption, unsupported receipt fields, incomplete pending inventory, authority drift, source failure, stale manager copies and oversize audit fail closed. The cancellation receipt is its own private ledger; it does not add a business audit when nothing was created. No automatic expiry cleanup reopens sealed identities.

## Evidence and limits

- Focused ordinary normalization/default-off/generic-persistence cases passed 48/48. Inputs reject wrong collection/operation/precondition, enriched markers/commands, non-JSON/non-finite/oversize values, mismatched identity and invalid inbox acknowledgment. Default-off preparation/commit makes zero database calls or fallback writes.
- Final native SDK/emulator suite passed 9/9: one creation/audit/receipt and immutable replay after later deletion/expiry; actor separation/exact intent/live authority; missing cancellation and expired recovery; save/cancel and prepare/cancel races; concurrent 99→100 admission; stale canonical manager refusal; occupied-audit protection; audit-size rollback without a partial Location/audit or terminal success receipt. Process-only flags were restored and each case used a unique loopback named database. This is not Firebase provider/browser/production acceptance.
- Final complete ordinary suite **886/886 passed**, zero failures/skips; final TypeScript and release build passed. The focused cases are included in the complete total, not additional tests. Existing Vite chunk advisory remains. Prior native suites are not redundantly rerun for unchanged services.

## Required continuation

Add private exact-schema authenticated/rate-limited/no-store adapters, capability discovery and strict bounded session transport. Then persist an actor-scoped marker before preparing, hold a tab lease, retain/recover/cancel missing or unknown outcomes, strictly refresh saved Directory before resolving terminal state, and connect both create forms with retained-draft/reapplication and desktop/mobile interrupted/reopen acceptance. Existing browser creation still uses the older generic path until that work is complete. Do not claim recovery delivered or enable the gates early.

Continue linked type/removal/lifecycle and correction paths, wider import/concurrency/consumer acceptance, independent exact-source reviews, activation manifest/migration/rollback and guarded release/provider/browser acceptance. No whole-main deployment, LP/Dynamic QR work, live data restoration, IAM/grants/tokens/credentials, expanded authority or approval as Theo.

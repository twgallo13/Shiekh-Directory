# Dispatch 72 — Actor-bound Location lifecycle receipts and atomic commit

## Source service delivered

`locationLifecycleOperations.ts` adds internal preview, prepare, commit, status, cancellation and actor-only pending recovery. Trusted callers must authenticate Firebase; every transaction rechecks live Company-wide Active administrator authority. There is no HTTP/Store admission adapter or production activation in this slice.

A read-only dependency preview returns the review without patches/source/native fingerprints. Blocked dependency reviews cannot prepare. A private preparation receipt binds the exact actor/operation/intent, review, planner preconditions and complete native source fingerprint for ten minutes. An actor admission document serializes distinct preparations; complete pending inventory has a 100-review limit, including expired reviews that still need cancellation. Repeated exact preparation returns the same receipt; changed intent cannot reuse it.

Commit requires the exact review hash, reruns current source/planner and checks both review bindings and native fingerprints. It permits one server-derived Location patch/deletion only, rereads the full saved record and exact update time, preserves unrelated/native fields on conversion, checks conservative document/atomic capacity and expiry, then saves business change, deterministic audit and immutable terminal receipt atomically. Status/cancellation/success replay do not depend on a later Location still existing or the original review still being unexpired. Cancellation seals absent/prepared IDs and never undoes committed work.

Conversion deliberately clears reviewed retail staffing and inherits/clears hierarchy according to the selected destination; it does not edit People, workplaces, unit rosters or account access. No contact payload enters the receipt/audit. Full Location contacts/custom data remain preserved on conversion except the explicitly reviewed local manager-copy fields.

Removal creates a private permanent identity reservation (`location_lifecycle_tombstones/{locationId}`) with the deletion/audit/receipt. Historical audits/terminal receipts remain. The shared generic Directory transaction rejects writes to reserved IDs, including ordinary creation and import/creation paths that use it. IDs cannot silently be recycled into unrelated Locations. Reservation collections are not generic Directory collections or public API fields; existing client database rules deny access. Manual administrator/database migration paths still require their separate release review.

## Evidence

- Ten focused service cases passed: blocked previews, idempotency/privacy, preservation, removal/history/ID reservation, changed references/source, tampering, cancellation, authority/isolation/expiry, capacity/rollback and bounded recovery.
- Five real SDK/emulator cases passed: concurrent confirmations produce one conversion/audit with native fields intact; native timestamp changes without business-version increments and new account links invalidate confirmation; removal preserves history and rejects generic ID recreation; concurrent prepare/cancel and commit/cancel have one terminal outcome; revoked authority blocks saving and recovery disclosure.
- Final ordinary suite: **956 passed**, no failures/skips. Type check and release build passed; existing bundle-size advisory remains. Shared generic guard and synthetic transaction delete support were covered by the complete suite. Synthetic local SDK data only.
- PR100's Unicode comparator repair at `1cbdfd5dbb18bda3aa360d8a392daae2e4fcb6bf` independently completed code and security review without findings. It preserves both older receipt encodings; sixteen focused operation cases passed after that repair. Original older finding provenance is retained.

## Remaining gates

This service is not exposed or enabled. Private transport/strict DTO parsing/rate limits, actor-scoped browser recovery and explicit conversion/removal review screens remain. Current client capabilities and public v1/v2/v3 contracts/grants stay unchanged. Independent exact-source code/security review, broader alternate-writer/import/consumer acceptance, isolated migration/runtime/access/signing/release/rollback and required production acceptance/closeout remain. No merge/deployment, whole-main release, other-app work, authority/credential expansion or data restoration. All activation gates stay off.

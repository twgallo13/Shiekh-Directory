# Dispatch53 — Coordinated assigned-manager name updates

Implemented and locally accepted for review, not deployed or activated. Depends on the PR82 lifecycle repair.

## Existing save path, stricter atomic name-only manifest

The profile already sends the Person and matching Location display-name copies in one generic SDK transaction. A new internal proof now admits that path for an assigned canonical manager only when the complete current transaction Location inventory matches the submitted name-only manifest. It requires exactly one clearly Active Person with a changed, bounded name, at most 90 business records and every affected Location exactly once, including retired/non-retail records. Additional managers without Location copies can rename without changing the Primary. IDs, positions, lifecycle, membership, workplace, contact information and access must remain unchanged. Missing/stale/extra/duplicate records, ambiguous name arrays and unsafe versions fail closed.

Matching scalar and list display names must equal the new Person name; other list members' saved names/order remain untouched. The canonical inherited-copy check uses the proven final Person name from this same batch. Live Active Company-wide administrator authority is re-read in the transaction, and a bounded server-described before/after audit is mandatory even when the caller omits one. Existing version checks, complete query dependencies and SDK atomicity prevent partial/stale saves. Changed Person fingerprints also invalidate stale organization reviews through the existing source checks. No new endpoint, scope, grant or generic assignment write capability is added.

The client name-only copy function now preserves Store Manager phone/privacy and unrelated saved list names. Explicit phone/contact updates retain their existing path. The editor permits a standalone manager name save; other touched profile fields must be saved separately and the draft is kept. Existing uncertain-save behavior remains: no blind retry, check saved records, and no claim of a new durable operation receipt for this generic save.

## Validation

- Final complete ordinary suite **805/805 passed**, zero failures/skips. Four new manifest cases cover complete scope, copy/contact/name preservation, omissions, stale inventories, unrelated writes, positions/status/contacts/pointers/other names, ambiguous arrays, unsafe versions and Additional-only names.
- **5/5 actual SDK/local-emulator cases passed** using the existing client serializer/copy helper and real Store transaction: Primary rename with unchanged unit/tenure and mandatory audit; omitted/stale/unauthorized rollback; intervening handover; Additional-only rename; newly linked Location rejection and oversized-audit rollback. No live provider/auth/index/IAM claim is made.
- TypeScript and application build passed; the existing Vite chunk advisory remains. A broad-run failure exposed an old test that requested only fullName while expecting a phone rewrite; it now explicitly requests the intended phone edit, preserving that behavior. The successful 805-case run is after this correction.
- The first SDK run correctly rejected the final copied name against the old Person projection. The guard was corrected to compare only this proven rename's final name; all subsequent SDK cases passed. No general rename bypass flag was introduced.
- Actual editor component checks passed with synthetic auth/catalog/network and a callback-only save: a standalone Additional-manager rename was admitted; mixing a department edit was blocked with both draft values retained. This is not a production end-to-end save. Owned preview/emulator/Vite processes and tab were cleaned up.

## Remaining release gates

### PR83 legacy copied-list repair

Verified the reported P2: name-only updates on legacy People outside an active organization roster could retain absent/misaligned assistant/key-holder name arrays. Such lists are now rebuilt in ID order only when every member has an exact resolved name; otherwise a known invalid_metadata preflight error stops before optimistic state or any request. Aligned arrays preserve unrelated saved names. The managed server path still independently rejects ambiguous stored arrays rather than treating a browser reconstruction as repair authority. All 17 focused copy/rename/contact cases passed, including both list roles, missing/wrong-length arrays and unresolved-member rejection; TypeScript passed. Earlier successful full/build/SDK results are reused for unchanged behavior, not reported as a new broad run.

Wider staged offboarding/position-removal journeys, parent/store moves, activated imports/corrections and broader races, exact-source independent reviews, opt-in consumer contract and migration/release/rollback acceptance remain open. Unresolved assigned-manager lifecycle/data can still require explicit repair before renaming; this path does not guess staffing or restore business data. All organization flags remain off. No production, LP/Dynamic QR, IAM, tokens/grants or business data changed. Do not deploy main wholesale.

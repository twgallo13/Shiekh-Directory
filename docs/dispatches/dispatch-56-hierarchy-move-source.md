# Dispatch56 — Coherent hierarchy-move source adapter

Internal read adapter implemented and locally accepted. There is still no move preparation/commit/receipt/API/UI or delivered move capability. Generic managed moves remain blocked; no production flags changed.

## Source contract

`readOrganizationMovePlan` validates the fixed move intent before caller IDs can cause any reads, then uses the same SDK transaction for complete bounded projected District/Region/Location inventories, exact namespaced relevant roster histories and relevant current manager identity/eligibility reads. Source and destination District/Region dependencies are derived from this transaction's hierarchy, never a browser's selected Region, cached manager copy, candidate list or workplace. Repeated same Region dependencies are deduplicated by type/ID; Region01 and District01 remain distinct.

The common masked snapshot reader is extracted from the existing organization source adapter; existing leadership command intent normalization, dependency selection and read semantics remain intact. Query sentinels reject overflow; native paths/update times, embedded IDs, finite JSON shape, byte bounds, exact People completeness and roster filtering are checked. Ended tenure history does not cause unrelated Person/contact reads. No contacts, workplaces or accounts are part of the business projection.

The result includes the pure move review/patch/precondition plan and internal native source map. The **trusted caller must authenticate and recheck live administrator authority in the same transaction**. This read helper does not enforce or confer HTTP admission, actor authority, commit ability, freshness lease or recovery state. Future preparation and commit must bind and re-read the complete reviewed dependencies, enforce native full-record preconditions and final audit/receipt capacity, preserve unrelated fields and resolve unknown outcomes through immutable actor-bound receipts.

## Evidence

- **28 affected ordinary cases passed:** six new move-source cases plus 22 existing source/operation cases. Coverage includes exact masked reads, derived parent/roster namespaces, bad intent before reads, missing hierarchy, query failures, missing native metadata, bad paths, duplicate/incomplete/mismatched results, unrelated rosters, unversioned membership/parent changes, current eligibility and history overflow.
- **10 actual SDK/local-emulator cases passed:** two move-source cases plus eight existing leadership atomic/recovery cases after shared-source extraction. The move reads establish current native source without writes/audits/operation receipts, react to new Locations and unversioned parent changes, and reject lost live authority in the trusted wrapper. Existing concurrent commit/cancel/recovery, Region/District namespace, membership-change rejection and native-value preservation cases remain passing.
- TypeScript passed. Prior broad/build/planner results are reused for unaffected code; no new whole-suite/build claim is made. The emulator is loopback-only with unique named demo databases, synthetic data and no provider/production IAM/index claim. It is stopped after acceptance.
- PR85 had no inline findings at the last check. Empty threads are not approval or exact-source review completion.

## Required continuation

Stateful prepare/commit/cancel/status/list with exact reviewed intent/source binding, live authority at each disclosure/write, idempotent immutable recovery, admission/capacity serialization, native write/audit/receipt bounds and concurrency/phantom tests. Then gated Store/HTTP adapters and the dependent store/registry move UX, before/after leadership, affected-store review, retained drafts and uncertain-save recovery. Preserve all existing security/access/signing/runtime/activation/migration/release/rollback gates. No main-wholesale deployment, live data repair, LP work, consumer contract/grant/token/IAM or expanded authority changes.

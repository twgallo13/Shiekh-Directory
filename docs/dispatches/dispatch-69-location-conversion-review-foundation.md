# Dispatch 69 — Location conversion/removal review foundation

## Delivered for source review

The detached Location lifecycle planner reviews retail/non-retail conversion or removal against canonical District/Region leadership and complete People, account and correction-request inventories. It preserves Location identity during conversion, requires deliberate release of local SM/AM/key-holder assignments, and never changes People positions, workplaces, app access or unit rosters. Incoming retail conversion requires explicit managed destination IDs and versions. Removal requires retirement, vacancy, no workplace/support/account/pending-request dependencies, and API-removal acknowledgement. Historical audit/terminal receipt retention remains a future writer requirement.

The internal `locationLifecycleModelVersion` marker prevents a converted non-retail Location from losing protection after all hierarchy links are cleared. Generic saves preserve an omitted existing marker and reject minting, erasure, unsupported models, cross-use conversion, ownership changes and hard deletion. CSV and editor follow the same boundaries; ordinary same-use format/contact edits remain available. The public API explicitly excludes this marker.

This is a pure review foundation plus alternate-writer guards. It has **no lifecycle source loader, receipt service, authenticated conversion/removal route, commit authority, recovery client or conversion/removal review screen**. Completeness attestations are internal inputs; a future authoritative adapter must establish them and recheck all dependencies atomically. Do not treat the planner as production authorization.

## Validation

- Final ordinary suite: 933 passed, zero failures/skips; TypeScript and release build passed. Existing bundle-size advisory remains.
- Native Firestore scenario passed: old-client marker preservation, generic and CSV same-use format changes, mandatory audit, and rejection of ownership/classification/staffing/hierarchy/delete/future-model bypasses without partial writes.
- Actual local editor: Corporate Office → Warehouse saved once, version 4 → 5; hierarchy/store staffing controls remained disabled. Unsupported lifecycle model displayed an alert and disabled edits, Save and retirement while allowing Close.
- Planner cases cover deterministic review, complete reference inventory, explicit destinations/staff release, dependency blockers, malformed/ambiguous/future source, capacity and version boundaries. Synthetic data only.

## Review evidence and remaining gates

GitHub's Codex summary independently completed code and security review of PR97 at `c7d3e0dcf470df0abd95b07e744fa44b904b5e6e` without findings. The normal draft → ready event on PR96 successfully refreshed its review at `deff9ed7851d1d0f5e32ddb045836e23d45c6fba`: code completed without findings; security was still running at this checkpoint. PR96 was restored to ready, open and unmerged.

Other dependency reviews include exact completed records, stale records from before repairs and stalled runs. Empty inline threads are not proof of current independent review. CodeRabbit explicitly skips non-default target branches; its configuration/spend limits were not changed and no on-demand review was requested. No approval was submitted as the repository owner.

Next: authoritative transaction-coherent lifecycle source/receipts and private transport/recovery/review screens, broader import/concurrency/consumer acceptance, current-source dependency/security reviews, then isolated release construction, migration, runtime/signing/access compatibility, rollback and production acceptance. Existing activation gates remain off. No merge, deployment, grants, credentials, other-app changes or data restoration in this slice.

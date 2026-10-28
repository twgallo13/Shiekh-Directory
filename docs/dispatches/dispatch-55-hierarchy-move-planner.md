# Dispatch55 — Hierarchy membership move planning foundation

Pure internal review planning implemented; no loader, authentication, preparation/commit/receipt, API, UX or write path. Generic managed moves remain blocked. This is not a delivered move feature or production activation.

## Rules implemented

The exact fixed intent describes one store-to-District or District-to-Region move with expected source/destination record versions, operation ID and explicit reason. Caller fields cannot specify arbitrary patches, manager overrides, actor authority or completeness. The future loader must supply coherent bounded source and native preconditions.

A store selects its destination District. The planner derives that District's parent Region and the two canonical Primary managers (including explicit vacancies). A District parent change keeps its District ID/DM/roster and plans corresponding Region/RM-copy updates across all linked retail Locations, including Active, Retired and Draft. Known Corporate/non-retail Locations are counted and excluded; unclassified linked Locations block rather than disappear from review. IDs and leading zeros are preserved. Store-owned SM/assistant/key-holder assignments, workplaces, contacts, accounts and tenure history never change.

This initial path deliberately requires named Active managed source/destination Districts/Regions with complete roster reads, consistent pointers/copies and eligible current roster members. Legacy, unresolved, unsupported or retired unit sources require explicit setup/repair first. This does not infer a manager from title, workplace, copied names or a candidate list.

Internal output contains only required parent/inheritance patches, a contact-free before/after review and source fingerprints for units, manager eligibility, full unit rosters, complete Location membership and changed Location records. No result grants permission to write. Pure snapshot bounds reuse the existing organization validator; at most 200 business-document changes and an 8MB planning envelope are allowed. Those estimates are not proof of final SDK/audit/receipt capacity. The authoritative future writer must re-read, bind and enforce the complete reviewed dependencies with native transaction semantics, authority, receipt/recovery, admission and final audit byte checks.

## Evidence

The 24 existing leadership planner cases plus 11 move cases pass (35 focused cases total), covering store inheritance, parent moves across all retail states, Corporate exclusion, explicit vacancy, namespaced IDs/leading zeros, invalid/missing/legacy/unreviewed source, eligibility, stale/no-op/unknown intent, stale copies and hierarchy, unknown linked types, membership/person fingerprint changes, write-cap boundary, overflow, input immutability, contact exclusion and source-order determinism. TypeScript passed. No native SDK/database or browser acceptance is implied; the module has no I/O and is not imported by runtime adapters. No broad/build rerun was needed for this detached foundation.

## Next

Build the bounded coherent read adapter and stateful reviewed prepare/commit/cancel/status path, with live administrator authority, gate defaults off, membership phantom/race tests, audit/receipt/native capacity and immutable idempotent recovery. Then add the dependent Region/District store editor and registry review UX with before/after inherited leadership, affected-store counts and draft recovery. Do not loosen generic move guards or activate units based on this planner. Preserve the existing release/migration/access/security/rollback gates and consumer contracts.

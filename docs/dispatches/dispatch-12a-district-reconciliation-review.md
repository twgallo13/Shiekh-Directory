# Dispatch 12A — District Assignment Reconciliation Review

Status: Approved for read-only investigation and preparation of a reviewable proposal. Assignment changes and compatibility removal are not approved by this dispatch.

## Business objective

Prepare an accurate store-by-store plan to link Locations to the existing Region/District registry, so the directory can supply trusted IDs and names to exports, APIs, and other applications. Identify how to retire competing legacy values without breaking existing consumers.

## Verified baseline and readiness

- Repository: `twgallo13/Shiekh-Directory`.
- Continue on `feat/dispatch-12-hierarchy-registry-api`, draft PR #10, currently based on `dispatch-11-flexible-location-csv`.
- At this handoff, PR #10 is open/draft at `cc6511af440f20373fd7342d8fe9a7d8137bc514`. This dispatch is an additional documentation commit.
- Reviewed application SHA: `e74e57c1a4ebb6cb553dca109b3355832282c6dc`.
- Read `docs/dispatches/dispatch-12-hierarchy-registry-ux-and-api.md`, especially “District field and assignment audit — 2026-09-21.”
- Fetch current refs and inspect the worktree before editing. Preserve the unrelated local `docs/cloud-run-deployment-runbook.md` change. Use an isolated worktree if necessary; never reset/discard unrelated work.
- Preserve PR dependency order. Do not merge or retarget either PR as part of this task.

## Confirmed issue

The reporting CSV has three different fields: saved Location `DistrictId`, registry-resolved `DistrictName`, and legacy copied `District`. Removing a heading does not establish missing relationships.

The user's 50-row CSV snapshot had 48 rows with legacy District names and no District ID, one unassigned warehouse, and Store 150 with `DIS-01` and no resolved name. The screenshot showed District IDs `01`, `02`, and `03`. These observations are leads to investigate, not an authoritative mapping or an instruction to repair data.

Keep exact existing IDs, including leading zeros and case. Do not add districtCode, derive IDs from names, strip prefixes, or recreate registry records.

## Execution

### 1. Read authoritative data without writes

Use existing authorized access and the configured named Firestore database. Verify project/database identity against the deployment configuration; never fall back to another database or seed data.

Read Locations, Regions, and Districts from one consistent read-only snapshot. Include Active, Draft, and Retired Locations, separated in totals. Limit fields to identity, name, type, hierarchy applicability, saved hierarchy IDs, legacy District text, lifecycle status, version, and update timestamp.

Record snapshot time, project/database identity, source application SHA, and record counts. Do not collect credentials, account details, or private contact information.

If access is unavailable, report the precise access gap and continue the repository impact assessment. Label the live assignment proposal BLOCKED; do not manufacture a current inventory from the old CSV or screenshot.

### 2. Produce the proposed mapping

For every Location, report:
- Location ID, Store Number as exact text, name, type, and lifecycle status.
- Hierarchy applicability, current version (explicitly distinguish legacy missing version, treated as 0), and update timestamp.
- Current Region/District IDs, resolved names/statuses, and legacy District text.
- Proposed Region/District IDs and names, where a defensible candidate exists.
- Review status, evidence/reason, and the exact decision needed.

Classification must distinguish already-valid assignments, unique name-based candidates for review, ambiguous candidates, missing/retired references, parent mismatches, conflicts with existing canonical assignments, and non-applicable/unassigned records.

A legacy name may suggest a candidate only when exactly one active registry District has that name, allowing surrounding whitespace and case normalization for comparison only, and its parent Region is active. Preserve original values in the report. Do not use fuzzy names, store geography, Person territory, or numeric ID conversion. A candidate is never an approved assignment.

Do not replace a valid canonical assignment because its old copied text differs. Flag the discrepancy. Do not force Corporate/DC/Other records into a hierarchy based on type alone; use the existing applicability contract and flag unknown intent.

Investigate Store 150 explicitly: verify whether `DIS-01` exists, what the stored record actually contains, and which District the owner intends. Do not convert it to `01`; the earlier legacy name corresponded to screenshot District `02`, which also remains an unapproved candidate.

### 3. Verify cleanup impacts and propose the bounded implementation

Recheck the existing audit's reads/writes across database access, API, reporting/editing CSVs, header mapping, Location UI, Dashboard, print, People forms/search, requests, seeds/migration scripts, jobs, integrations, and documentation/tests.

Specifically verify:
- `DirectoryContext.updatePerson` copying Person territory into Location legacy district.
- Fleet CSV Quick Add in `AdminIntegrationsView.tsx` supplying a default legacy district without canonical references.
- Existing API `district` consumers and CSV consumers that may depend on the old header/meaning.

Produce a concrete proposed correction for those two write paths, a compatibility transition, and acceptance tests. Do not implement the application changes in this pass. The authoritative contract remains `DistrictId` plus registry-resolved `DistrictName`; existing legacy fields/headers keep their current behavior pending a separately approved transition.

Identify external consumers by evidence available in the repository. Mark inaccessible external apps, scheduled jobs, and direct database readers NOT VERIFIED; do not assume they do not exist. Never print API keys or secret values while inspecting configuration.

### 4. Deliver review evidence in the repository

Create:
- `docs/dispatches/reports/dispatch-12a-district-reconciliation.md`: plain-language findings, snapshot provenance, counts, proposed mapping table, owner decisions, impact matrix, proposed code/compatibility changes, acceptance tests, and remaining limits.
- `docs/dispatches/reports/dispatch-12a-district-reconciliation-review.csv`: review-only rows with clearly named Current*/Proposed* columns and ReviewStatus. Label it not import-ready. If live access is blocked, do not fabricate this file's records.
- A small read-only helper and focused tests only if needed to produce repeatable, verifiable results. No write/apply mode, migrations, new endpoints, or scheduled process.

Record all source/destination fields needed for a later approved patch, but exclude unrelated record contents and personal information. Record how data changes could be reversed from before/after evidence; application traffic rollback alone does not reverse database writes.

## Validation

- Reconcile source totals with every report classification; each Location appears once.
- Preserve IDs and Store Numbers as text, particularly leading zeros.
- Verify duplicates, unavailable references, mismatched parents, and non-applicable records are not silently assigned.
- Verify report generation invokes no business-record writes, import confirmations, repair operations, or audit/receipt creation.
- Confirm the two legacy write paths and external-consumer limitations with source references.
- If executable code is added, add focused tests and run lint, API tests, build, and diff-check. For documentation/report-only changes, validate report counts/formatting and diff-check; do not claim a new application test run.
- No Playwright or browser automation. Theo owns manual acceptance.

## Return and stop point

Commit and push only the scoped report/documentation/helper changes to the existing branch, preserving unrelated local changes. Update PR #10 with a short reconciliation status and link to this report.

Return the commit SHA, report links, PASS/FAIL/NOT RUN evidence, classification totals, and a short list of decisions for Theo. Distinguish current authoritative findings from the earlier CSV snapshot.

Stop with “District reconciliation proposal ready for approval” only when the authoritative proposal is complete; otherwise identify the blocked portion.

No production assignment changes, database repairs, imports, compatibility-field deletion/repurposing, application deployment, secret/configuration changes, merge, or People CSV expansion. Earlier authorization to deploy Dispatch 12 does not authorize any new deployment or data repair in this pass.


## Review amendment — correct the reconciliation evidence before approval

Review target: `9a5dd3dadba1c9b2b68cf0910886cd2b31fd7be5`. PR #10 was verified open/draft on its existing Dispatch 11 base. This amendment concerns the review helper, tests, and evidence only. It does not approve Location assignments or changes to the application.

### Findings requiring correction

1. `scripts/dispatch12aReconciliation.ts` reads three collections using independent `get()` calls in `Promise.all`. This does not establish the single consistent snapshot claimed in the report.
2. The helper only classifies records whose saved applicability is exactly `Applicable`. Missing applicability, explicit `Not Applicable`, and explicit `Unknown` all fall into the same missing-field explanation. This omits the existing retail defaults in `validateLocationHierarchyFields` in `src/lib/hierarchyAssignmentContract.ts`.
3. Ambiguous matches, retired references, valid canonical references with contradictory legacy text, and candidate parent conflicts are not all distinguished. A valid canonical assignment must remain authoritative even when copied text differs.
4. Missing versions are collapsed to numeric zero, so the CSV cannot distinguish an absent version from a saved zero. The source document ID can also be overwritten by an embedded `id` because of object spread order.
5. The committed report says the full API/build suite was NOT RUN, while the returned summary says it passed. No focused helper tests were included in the reviewed commit. The report also retains obsolete access-blocked wording.

### Required corrections

- Fetch the latest branch and check worktree readiness. Preserve the unrelated local runbook edit. Restrict edits to this investigation's helper, focused tests, report, CSV, and dispatch evidence.
- Use a supported read-only transaction or shared read timestamp for all three collection reads. Record evidence of the shared snapshot, the actual read time, project/database, tool source commit, and application baseline separately. Do not label a wall-clock generation time as a database snapshot guarantee. Read only the necessary fields and retain lifecycle coverage.
- Keep the actual document ID authoritative; report any conflicting embedded ID as a blocker rather than silently replacing either value. Detect duplicate identities before constructing lookup maps.
- Report saved applicability separately from the effective behavior under the current application contract and explain the default used. Missing applicability on the three recognized retail types must not automatically suppress review candidates. Explicit Unknown remains explicit Unknown. For Corporate/DC/Other records, show existing application behavior and unresolved business intent separately; do not assign a District by type.
- Compute exact-name candidate evidence independently from applicability decisions. Only a nonempty trimmed, case-normalized legacy name matching exactly one Active District with an Active parent qualifies. Any resulting candidate remains unapproved. Do not use fuzzy matching, ID conversion, geography, or Person territory.
- Distinguish no match from multiple matches, missing from retired references, invalid applicability from missing applicability, and parent mismatch from missing parent. Show additional issues when more than one applies, with one primary classification per Location so totals reconcile.
- Retain valid canonical assignments even when legacy text differs, but explicitly flag the discrepancy. If a proposed candidate's parent conflicts with an existing Region reference, show the conflict and both values; do not present the proposed parent change as routine or approved.
- Preserve raw version presence/value and separately report the effective concurrency version, including absent versus explicit zero. Flag invalid versions. Preserve exact IDs, leading zeros, lifecycle values, and source text.
- Regenerate the complete review CSV and report from the corrected read. Reconcile every Location once and all lifecycle/classification totals. Do not hard-code the prior 50/2/3 counts if the refreshed snapshot differs. Keep the review CSV visibly not import-ready.
- Store 150's proposed District `02` remains pending Theo's business approval. No approval is implied by this amendment. Provide a concise grouped candidate table for the remaining retail stores and a separate list of genuinely unresolved decisions.

### Validation and delivery

Add focused fixture tests for: missing retail applicability; explicit Unknown and Not Applicable; non-retail intent; unique/ambiguous/empty names; missing/retired District and Region; mismatched parent; valid canonical versus conflicting legacy text; embedded/document ID conflict; absent and explicit-zero versions; leading-zero IDs; and Store 150's invalid reference. Test that report generation has no business-record write or import/repair path, and that all collection reads use the same read-only snapshot mechanism.

Run the focused tests, lint/typecheck, full API suite, build, and diff-check as required above. Record exact commands, counts, exit results, and tested source state consistently in the report and PR. If a check was not run, say NOT RUN; do not reuse historical passes. Preserve spreadsheet-safe handling and exact text when generating the review CSV.

Update the existing report and CSV, remove obsolete blocked-access wording, and distinguish verified source findings from external consumers that remain NOT VERIFIED. Commit and push only scoped files; update PR #10's evidence. Return the commit, changed-file purposes, report links, pass/fail/not-run results, and remaining owner decisions.

Stop at a corrected proposal ready for review. No live assignments, imports, repairs, migration, compatibility-field changes, application changes, deployment, merge, secret/configuration changes, or browser automation.

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

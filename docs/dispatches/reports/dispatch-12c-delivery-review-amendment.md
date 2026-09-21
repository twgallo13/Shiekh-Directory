# Dispatch 12C delivery review and completion amendment

Status: **Changes required — implementation is partial.**
Reviewed application SHA: `56533176bb456e1f5a63d5ba7c208b391a0a8f31`.
Governing dispatch: [Dispatch 12C](../dispatch-12c-hierarchy-consistency-implementation.md).
This amendment completes existing approved requirements; it does not authorize live data execution or a new phase.

## Business objective

Administrators and downstream applications must distinguish a retail store awaiting a District from an operational center that intentionally has no retail District. Editing, API responses, CSVs, directory screens, and the 1-Sheet Directory PDF must agree, without changing approved assignments or legacy compatibility values.

## Repository readiness and evidence

PR #10 was verified open/draft at the reviewed SHA, on `feat/dispatch-12-hierarchy-registry-api`, based on `dispatch-11-flexible-location-csv`. Preserve that base and the unrelated local runbook modification. The remote review cannot certify local worktree cleanliness.

The seven-file implementation adds effective applicability resolution, selects saved applicability in public Firestore reads, exposes the result through the existing API resolver spread, and removes the two identified legacy District writes. These are useful completed changes, but are not the full dispatch.

Reported verification: focused 22/22, full API 257/257, lint/build/diff-check passed. These runs were reported by the builder, not independently rerun during this source review. Only one new test case was added in the reviewed application commit; it covers the helper, not the required end-to-end contracts.

## Findings that must be corrected

| Finding | Source evidence | Required completion |
|---|---|---|
| CSV column order contradicts append-only requirement | `server/locationExport.ts` inserts `HierarchyApplicability` between `District` and `StoreManager`. | Put the new header after all pre-existing headers. Add an exact header-order regression proving every old position remains unchanged. |
| Quick Add hierarchy controls are unfinished | `AdminIntegrationsView.tsx` removes the legacy write/default but does not add canonical Region/District or applicability controls. | Complete the existing Dispatch 12C section 2 controls. Remove obsolete form state when no longer used. |
| Location Edit lacks the required applicability selector | `src/components/locations/LocationEditModal.tsx` changes applicability only as a side effect of Region/District selection. | Add the three plain-language choices with existing enum values, retail restrictions, explicit reference-clearing guidance, unavailable-reference visibility, and saved-value preservation. |
| PDF grouping remains based on changing display labels | `PrintSheetView.tsx` builds distinct groups and filter comparisons with `hierarchyDistrictLabel`; it still describes every displayed Location as a store. | Implement stable District-ID grouping/filtering, separate operational-center and unassigned-retail groups, visible warnings, and accurate scoped labels/counts. |
| Applicability diagnostics are not included in the existing shared display label | `hierarchyDistrictLabel` reads only `hierarchyIssues`, while new diagnostics are in `applicabilityIssues`. | Wire the diagnostics into affected UI/PDF presentations; generating a diagnostic in a helper alone does not make it visible. Preserve both issue categories and existing hierarchyStatus meanings. |
| Required guidance, recovery corrections, and behavioral evidence are missing | The changed-file set does not include API/CSV guidance, coverage matrix, the 12B recovery plan, or the required workflow tests. | Complete the documentation and focused behavioral tests below. |
| Delivery report defers required implementation while asking Theo to test it | Report calls controls and grouping a follow-up slice, then includes those features in its manual checklist. | Remove the unauthorized deferral. Mark each original requirement implemented, verified unaffected, or blocked with evidence. Manual QA is for implemented behavior, not a substitute for missing code. |

## Complete the approved implementation

1. Finish both manual entry paths. Reuse active registry IDs, cascade District options by Region, and clear a prior District when the Region changes. Use the existing explicit manual-clear contract. Do not silently clear existing references when choosing No retail hierarchy. Do not persist an effective default during an unrelated edit. Preserve optimistic version checks, conflict drafts, and other contact/leadership updates.

2. Apply shared effective applicability consistently to affected lists/details/search, hierarchy displays, dashboard grouping/counts, and PDF generation. Trace actual callers and document unchanged surfaces with evidence rather than making blanket claims. Use stable namespaced grouping keys, so registry renames and synthetic group labels cannot change or collide with District identity. Unknown, inconsistent, retired, unresolved, and parent-mismatched records must remain visible and must not be classified as healthy centers. Preserve current authorization and lifecycle visibility.

3. Correct reporting CSV header order. Keep editing CSV raw saved applicability unchanged, including missing values as blank. Test reporting export/re-import proposals explicitly: effective defaults may become proposed writes and must appear in preview. Preserve leading-zero IDs, informational names, selected-row limits, version checks, signing, retry receipts, and spreadsheet encoding. Do not introduce CSV clearing or new import features.

4. Verify the API list/detail path, selected Firestore fields, privacy/scopes, cache/version behavior, and registry rename reconciliation with actual assertions. Ensure the shared resolver input type represents all fields used by applicability resolution. Document and test how malformed saved applicability, including empty strings, differs from absent/null; do not silently broaden valid values or change manual-save validation.

5. Update the existing API documentation, `docs/location-csv-export.md`, in-app guidance where affected, and `docs/dispatches/dispatch-08-csv-coverage-matrix.md`. Explain raw versus effective applicability, stable ID joins, registry-name refresh, legacy District limitations, and which workflows remain unsupported.

6. Correct the actual Dispatch 12B update plan's recovery wording, not only the new implementation review: CSV blanks preserve values and cannot restore absent fields. Verify supported manual-clear behavior locally and document unsupported restoration cases such as invalid `DIS-01` and a previously empty required name. Keep the approved CSV manifest byte-for-byte unchanged. Restricted recovery storage and external-consumer evidence remain prerequisites for later live writes, not excuses to defer the approved UI/API changes.

7. Inspect request/approval, direct database, bootstrap/seed, scheduled job/mail, and integration paths for affected reads/writes. Record exact paths and results. External systems not accessible to the builder must remain **NOT VERIFIED**; do not claim compatibility was proven, run those jobs, or contact third parties.

## Required verification

Add meaningful tests covering the unfinished requirements, not only assertions against source text:

- Person territory-only and unrelated edits preserve Location legacy District; established contact/leadership behavior remains correct.
- Quick Add and Location Edit semantics: canonical cascade, unassignment, applicability choices/restrictions, preservation of saved omissions, and stale-save handling.
- API list/detail/projection effective applicability and diagnostic behavior without authorization/privacy regressions.
- Reporting header order and effective values; editing export unchanged re-preview; reporting effective-default changes visible in preview.
- District-ID grouping survives rename; centers are distinct from unassigned retail; invalid records stay visible; counts reflect the authorized/lifecycle-filtered/displayed dataset.
- A local proposed-after fixture gives District counts 14/12/22 plus two centers. The before fixture must retain actual unassigned/unresolved states. No fixture result constitutes a live data update.
- Reads, exports, and previews do not write business records.
- Supported manual-clear/recovery behavior and exact remaining unsupported restoration cases.

Run focused tests, lint, full API tests, production build, and diff-check. Inspect the built Admin/shared dependency path for the prior browser Buffer/Node CSV dependency failure. Do not troubleshoot or run Playwright. Theo performs browser and PDF acceptance after a separately authorized deployment.

## Delivery and boundaries

Continue PR #10; do not replace this work with another planning-only dispatch. Preserve completed correct changes and implement the missing requirements. Update `dispatch-12c-implementation-review.md` and the PR summary with a requirement-by-requirement result, changed-file purposes, test evidence, application/documentation SHAs, and accurate manual checks. Commit and push scoped work; exclude the unrelated local runbook edit.

The approved manifest SHA-256 must remain:
`d81ef01a59163f864f34c065c424b8ef26abf41c01c6a2d7ebdc12272dfd36a6`.

No deployment, traffic promotion, merge, live assignment changes, imports, repair/migration execution, registry changes, secret/IAM changes, private backup commits, or compatibility-field removal. Do not invent external-consumer approval or recovery evidence. Keep PR #10 draft on its existing base.

Only report “Dispatch 12C implementation ready for review; live assignments unchanged” when the implementation requirements are complete. Otherwise report the exact remaining blocker without claiming readiness.


## Follow-up source review — application 306fd351

Review outcome: **Two remaining correctness issues; complete these before deployment/manual acceptance.** This section narrows the follow-up to defects in the delivered implementation, not a new feature phase.

Verified remotely: PR #10 remains open/draft on `dispatch-11-flexible-location-csv` at application SHA `306fd351e24a0f2fd1c5c39c4a946598394811b9`. Verified in source: reporting header order is corrected, the reporting resolver now receives type and saved applicability, canonical Quick Add/applicability controls exist, stable group IDs are used, and the Person legacy writer remains removed. The approved manifest is not in the application comparison's changed-file set. Full-suite/lint/build results remain builder-reported; this review did not rerun the full suite.

### 1. Separate business type from hierarchy applicability

`PrintSheetView.tsx` currently calculates retailCount from `hierarchyApplicability === 'Applicable'`. `resolveHierarchyGroupKey` likewise puts every Applicable record without a District into unassigned-retail. Applicability answers whether hierarchy applies; it does not identify whether the Location is a retail store.

Reproduced locally using the exact committed helper, with isolated synthetic records and no database access:

| Synthetic input | Actual result at 306fd351 | Required behavior |
|---|---|---|
| Warehouse / Distribution Center with a valid Region and no District | Group unassigned-retail; PDF counts it as retail | Remains non-retail; incomplete District assignment must not label it a retail store |
| Enclosed Mall with explicit Unknown applicability | PDF excludes it from retail and counts it under non-retail/unresolved | Remains a retail Location, with a separate Needs Review hierarchy state |
| Warehouse / Distribution Center with explicit Not Applicable and no references | Operational Centers group, but detail label Unassigned District | Healthy non-retail center; show No retail district |

Use the existing recognized Location types for retail/non-retail totals. Keep hierarchy review state separate from business type; unknown/unsupported Location types must be visibly unclassified rather than silently certified. Totals must use the authorized, lifecycle-filtered, displayed dataset.

Carry sufficient type context into grouping without changing public API semantics. Only actual retail records awaiting assignment belong to Unassigned Retail Locations. A non-retail Applicable record lacking its District belongs in Needs Review with clear incomplete-assignment guidance, preserving its existing Region. Continue to group canonical District assignments by stable IDs, retain row-specific diagnostics, and preserve the existing hierarchyStatus contract. Do not change validation or infer new assignments.

### 2. Make the individual display agree with grouping

`hierarchyDistrictLabel` still returns Unassigned District whenever districtId is absent. LocationDetailModal and other row displays consume this helper. Consequently a healthy operational center is presented as having a missing assignment when opened from the correctly grouped list.

Use shared applicability-aware presentation consistently in detail screens and existing row/search displays:
- Healthy non-retail Not Applicable, no contradictory references: No retail district.
- Applicable retail without District: Unassigned District/Unassigned Retail guidance.
- Unknown or inconsistent applicability: Needs Review with the reason.
- Unresolved/retired/mismatched references: retain the actual ID and diagnostic.
- Do not rewrite records, copy names into legacy fields, or change API hierarchyStatus to fix display wording.

Group headings must not borrow a single member's warning and present it as the condition of every member; show diagnostics on the affected rows. Inspect existing consumers of the shared labels so a helper fix cannot hide reference issues elsewhere.

### Focused acceptance and delivery

Add behavioral regressions for the three reproduced cases above, mixed retail/non-retail/Unknown counts, filtered totals, and identical center semantics across group/detail presentations. Add a rename regression demonstrating a selected District ID remains selected after its label changes. Preserve the approved 14/12/22 plus two-center fixture and truthful before-state fixture.

The current shared restriction test establishes allowed types, not the full edit/save workflow. Add targeted coverage using existing test infrastructure for new control transitions and emitted save values: Region change clears District, selecting Not Applicable does not silently erase references, unrelated edits preserve omitted applicability, and stale saves retain the draft. Reuse existing proven tests where applicable and cite them; no browser automation or new test framework is required.

Correct the implementation report's statement that all related surfaces are consistent until these cases pass. Report exact tests performed, including any manual-only checks, rather than treating helper coverage as UI acceptance. Run the normal required verification once after the scoped corrections and return application SHA plus report link.

Preserve all existing boundaries: same draft PR/base, unchanged approved manifest and legacy fields, unrelated runbook edit excluded, no deployment/merge/live writes/import execution/migration/Playwright. External-consumer and live recovery requirements remain separate. This is completion of Dispatch 12C, not approval to execute Dispatch 12B.


## Narrow follow-up — application 92c96b6

Source review and isolated execution of the exact committed `hierarchyResolution.ts` confirm the three previously reproduced cases now pass: non-retail with an incomplete assignment is Needs Review; retail with Unknown applicability remains retail and Needs Review; a healthy center displays No retail district. Region/District transition helpers are wired into both production forms. Preserve these fixes.

Two remaining edge cases violate the existing requirements to retain invalid-reference warnings and not certify unsupported business types. Complete only these corrections and their targeted tests; no new phase or redesign.

### A. Preserve Region-only errors in presentation

Reproduction: `{type: 'Enclosed Mall', regionId: 'missing'}` against a registry without that Region produces:
- hierarchyIssues: Region missing is missing from the hierarchy registry.
- group: unassigned-retail.
- individual label: Unassigned District (the error disappears from this label).

Cause: the no-District path of `resolveHierarchyGroupKey` checks only applicabilityIssues, and `hierarchyDistrictLabel` returns the unassigned label without hierarchyIssues.

For records without a District, check both issue collections before returning a healthy-center or ordinary-unassigned group. Invalid/retired Region-only references must appear in Needs Review with their exact reference diagnostic. Keep valid applicable retail records without District in Unassigned Retail Locations. Preserve District-ID grouping and its per-row diagnostics, and leave the public hierarchyStatus contract unchanged.

### B. Do not equate an unrecognized type with a known non-retail type

Reproduction: `{type: 'Unsupported Type'}` with no references produces operational-centers / No retail district. An absent type has the same problem. The type predicate returns false for both recognized non-retail and unknown types, so callers lose the distinction.

Distinguish the three existing retail types, the existing recognized non-retail types (Corporate Office, Warehouse / Distribution Center, Other Company Location), and missing/unsupported types. Derive allowed types from the existing contract wherever practical. Unknown types must appear in Needs Review with a type diagnostic and an unclassified count, rather than being certified as operational centers. Preserve valid non-retail behavior. Do not broaden server validation, infer assignments, migrate data, or change the public API shape merely to support UI classification.

Update the affected labels/grouping/count callers so the distinction survives the complete presentation path. Keep type classification and hierarchy applicability separate. Use total = retail + known non-retail + unclassified for displayed data; hierarchy review status is a separate dimension.

### Verification and handoff

Add focused regressions for missing and retired Region-only retail references; missing/unsupported business types; known centers; valid unassigned retail; and counts for a filtered mixed fixture. Re-run the three previously corrected cases to guard against regressions. Update the return report with exact coverage and remaining manual-only acceptance; do not claim unrelated registry-editor tests prove Location Edit draft retention.

Run normal lint/API/build/diff gates after the change, then return application SHA and report link. Full-suite results of 274/274 at the reviewed SHA were builder-reported, not independently rerun by this review. The isolated reproductions above were run by the reviewer with synthetic records and no database access.

PR #10 was verified open/draft at 92c96b6 on its existing base. Keep that PR/base, the approved manifest, legacy values, and unrelated local runbook edit intact. No deployment, merge, live writes, import execution, migrations, or browser automation. These are narrow completions of the existing warning/classification contract; preserve all already verified work.

# Dispatch 12 — Editable Region/District Registry and Consistent Hierarchy Data

Status: Approved implementation dispatch. This document does not indicate implementation completion.

## Objective

Make the Directory the authoritative source of Region/District identities and names for administrators, CSV workflows, and consuming applications. Improve the existing model and UI; do not create a second identity system.

## Verified baseline and branch

- Repository: twgallo13/Shiekh-Directory.
- Implementation branch: `feat/dispatch-12-hierarchy-registry-api`.
- This branch starts at PR #9 commit `e4e332c9a7711df3aee2559c2c40892ca395d081` and contains this documentation commit.
- At dispatch creation, PR #9 is open on `dispatch-11-flexible-location-csv`; main is `961c73f5a9cbb014aa3599cb91584e04351c34e3`.
- Fetch current refs and inspect local changes before editing. Continue on this prepared branch.
- While PR #9 remains open, target its branch with the Dispatch 12 draft PR. Once PR #9 merges, reconcile with main and retarget the draft PR to main, verifying that its diff contains only Dispatch 12 work.
- Do not merge PR #9 as part of this task. Preserve unrelated local edits, especially `docs/cloud-run-deployment-runbook.md`. Use an isolated worktree if necessary; do not discard or commit unrelated edits.

Current source confirms separate registry IDs and names, an Add/Retire/Reactivate UI without Edit, canonical IDs in the editing export, and a reporting/API hierarchy contract that needs extension. Theo's screenshot shows District IDs `01`, `02`, and `03`; these are existing identities, not instructions to seed or repair production records.

## Approved data contract

- Reuse RegionRecord.id/name/status, DistrictRecord.id/name/regionId/status, and Location.regionId/districtId.
- Preserve exact existing IDs as strings, including leading zeros and case. Do not add districtCode, renumber IDs, recreate registries, or infer relationships from names.
- IDs permanently identify records; names are editable display values. IDs are read-only after creation.
- Creating a registry record does not assign Locations.
- Canonical registry references are authoritative. Do not rewrite legacy copied strings merely to propagate a rename.
- This supersedes the earlier proposal for a separate District Code field.

## Implementation scope

### 1. Registry UX and editing

Enhance `src/components/admin/HierarchyRegistryPanel.tsx`:

- Clearly label ID, Name, and Status. For Districts, show the parent Region ID and resolved Region Name separately.
- Add Edit, Save, and Cancel for existing Regions and Districts.
- Allow name edits and controlled District parent-Region changes. Keep existing IDs read-only and briefly explain why other applications depend on them.
- Preserve Add, Retire, and Reactivate. Do not add hard deletion.
- Keep System Administrator authorization in both UI and backend.
- Show pending, success, validation, dependency, and stale-record states. Disable duplicate submissions.
- Preserve unsaved input after rejected saves. Offer refresh/review for conflicts instead of automatically overwriting.
- Ensure keyboard access, associated labels, focus behavior, and usable mobile layout.

Use existing final-state hierarchy validation for parent changes. Do not silently cascade reassignment to Locations. If a move would make assigned Locations inconsistent, reject it and show affected Location identities, links, and corrective steps: reassign the Locations or clear their District assignment before moving the District, then explicitly reassign as appropriate.

Show actionable dependencies for retirement using existing lifecycle rules. Do not weaken guards. Reactivation must also preserve hierarchy validity.

### 2. Backend integrity

Trace and reuse the existing paths through DirectoryContext, directoryClient, directoryDataApi, firestoreDirectory, and hierarchyAssignmentContract.

- Preserve explicit create-only intent, numeric expectedVersion updates, duplicate rejection, and stale-write protection.
- Ensure payload identity cannot rename a document or disagree with its target ID.
- Return committed records and reconcile browser state after successful saves.
- Preserve audit before/after evidence and final-transaction relationship checks.
- Preserve untouched legacy defects during unrelated edits.
- A name-only edit must retain identity, parent relationships, Location assignments, and application permissions.

### 3. Shared hierarchy resolution

Use reusable read-only resolution logic for affected Location views, selectors, reporting/editing exports, reference downloads, and API responses.

- Resolve names from canonical IDs. A registry rename must appear after authoritative refresh without rewriting every Location.
- For absent references, expose null IDs/names in JSON and blank cells in CSV.
- For missing registry records, preserve the stored ID and expose a null resolved name.
- For existing retired records, retain their resolved name but indicate retirement; do not offer them for new assignments.
- Surface parent mismatches and unresolved references explicitly in the relevant UI/diagnostics and documented API hierarchy status.
- Do not silently use copied legacy names as canonical resolution.
- Names remain informational. Do not derive identity from a displayed label.

### 4. Directory API

Extend existing Location list and detail responses with separate string-or-null fields:

- regionId
- regionName
- districtId
- districtName

Extend `server/firestoreLocations.ts` projections/repository reads and `server/directoryApi.ts` response mapping consistently. Preserve existing fields, authentication, scopes, contact privacy, pagination, and compatibility. Keep the meaning of the existing legacy `district` field unchanged and document its distinction.

Ensure registry-only changes reach consuming applications even when a Location was not edited:

- Extend the existing versioned reconciliation pattern with a hierarchy version covering relevant registry IDs, names, statuses, and District parent links.
- Resolve hierarchy consistently with each paginated Location snapshot. Do not mix pages with different hierarchy versions.
- Include relevant hierarchy state in response/cache/ETag behavior.
- A stale client hierarchy version requires a documented full reconciliation; a missing version must not produce silently incomplete deltas.
- Return an explicit reconciliation response when a registry change invalidates an in-progress cursor.
- Update API documentation with request/response and restart examples, including District ID `01` as text and a separate name.

Do not add unrelated API resources, scorecard calculations, or historical scoring storage.

### 5. CSV and references

Both Store reporting exports and Export for Editing must expose RegionId, RegionName, DistrictId, and DistrictName separately.

- Retain the reporting export's existing `District` compatibility column; document its existing behavior separately from canonical DistrictName.
- IDs come from saved Location assignments. Names are resolved from registries.
- Only canonical ID columns may change assignments. Name columns must be automatically recognized as informational.
- Preserve old supported files, partial-column updates, selected-row confirmation, privacy restrictions, formula protection, and reversible spreadsheet encoding.
- Missing assignments stay blank; unresolved IDs remain visible with diagnostics. Do not manufacture IDs from legacy strings.
- Updating a District or Region name in a Location CSV must not update the registry or silently reassign a Location.
- Extend templates, field dictionaries, reference downloads, examples, guide, and `docs/dispatches/dispatch-08-csv-coverage-matrix.md` consistently. Share definitions where practical.
- Do not introduce Region/District registry CSV imports in this pass.

## Acceptance and verification

Add focused tests demonstrating:

1. `01` remains exactly `01` through registry writes, Location references, API responses, and CSV round trips.
2. Region/District name edits preserve IDs, assignments, and parent relationships; committed names resolve after refresh.
3. IDs cannot be changed through edit payloads; stale saves and duplicate creation fail without changing records or audit evidence.
4. Invalid parent changes and lifecycle changes are rejected with actionable dependency information.
5. Unrelated legacy defects do not block name-only edits.
6. Registry-only changes affect API names, ETags, hierarchy versions, pagination, and delta reconciliation as documented.
7. Missing, retired, unassigned, and inconsistent references are distinguishable without misleading legacy fallbacks.
8. An unchanged editing export of valid records proposes zero writes. Informational name edits cannot mutate registry records or assignments.
9. Existing clients/files remain compatible within the documented contract; unauthorized registry edits remain rejected.
10. Existing CSV selected-row atomicity, contact preservation, and retry protections remain intact.

Run lint, API tests, production build, and diff-check. Report actual results. Do not run browser automation or troubleshoot Playwright; Theo handles browser/visual/functional QA.

## Delivery and boundaries

Commit and push only scoped changes; open the correctly based draft PR. Update this dispatch with completion evidence without removing its requirements, and update API/CSV documentation.

Return:
- Application SHA, draft PR URL, implementation branch, and PR base.
- Changed behavior and verification results.
- Known limitations.
- A short manual checklist covering edit/cancel/save, stale conflicts, dependency errors, rename visibility, separate CSV fields, and API responses/reconciliation.

No merge, deployment, production import, migration, production repair, automatic reassignment, or People CSV implementation. Preserve existing deployment configuration and secrets. People CSV remains the next separate approved feature.

## Completion evidence

Implemented on `feat/dispatch-12-hierarchy-registry-api`:

- Added editable Region/District registry names and controlled District parent changes with immutable IDs, optimistic concurrency, structured dependency errors, and committed-record reconciliation.
- Added canonical read-time hierarchy resolution across primary Location views, selectors, API responses, and both Location CSV exports. Legacy copied District text remains compatibility-only.
- Added hierarchy-version binding for list snapshots, cursors, deltas, detail responses, and ETags. Missing or stale versions require full reconciliation.
- Added informational `RegionName` and `DistrictName` CSV columns while keeping only canonical ID columns writable.
- Added focused coverage for exact `01` preservation, registry integrity, API reconciliation, missing/retired/mismatched references, Firestore snapshot reads, and CSV round trips.

Final automated verification on 2026-09-20:

- `npm run lint`: passed.
- `npm run test:api`: 232 passed, 0 failed.
- `npm run build`: passed with the existing Vite chunk-size warning.
- `git diff --check`: passed.

Delivery references are recorded in the draft pull request. Browser automation was intentionally not run; manual browser validation remains assigned to Theo.

## Review amendment — corrections required before acceptance

Review date: 2026-09-20. Application reviewed: `b9d0498540c364bcf688520a267436567aa93a8d`, draft PR #10. This is a source review, not a browser acceptance result or an independent execution of the reported test suite.

### Readiness and review outcome

- PASS (repository inspection): PR #10 is draft on the intended implementation branch, based on `dispatch-11-flexible-location-csv`. PR #9 remains open at `e4e332c9a7711df3aee2559c2c40892ca395d081`. Keep the existing stacked-PR sequence.
- PASS (source inspection): the implementation separates canonical IDs and resolved names, adds edit controls and backend dependency checks, and extends API hierarchy reconciliation and both CSV exports.
- FAIL (source inspection): the three behaviors below do not yet satisfy the preservation and canonical-display requirements.
- REPORTED PASS: Copilot reports lint, 232 API tests, build, and diff-check passing. These results were not independently rerun during this review.
- UNVERIFIED: browser behavior, current production data, and actual downstream consumers. No deployment, production write, or external integration test was performed.

### A. Preserve drafts through conflict refresh

Evidence: `HierarchyRegistryPanel.tsx` renders “Refresh directory and review” using `window.location.reload()`. The edit draft exists only in component state, so this recovery action discards it. `EditState` also does not retain the version originally opened for editing, and `DirectoryContext.saveRegion/saveDistrict` derive the expected version from current context.

Required correction:

- Replace the destructive reload recovery with an authorized read-only refresh that retains the draft and shows the latest saved values for comparison.
- Capture the original record and version when Edit begins. Send that version with an update; a context refresh must not silently advance the draft's expected version.
- After a conflict, let the administrator explicitly choose to discard their draft and use the latest record, or review and reapply their edits against the refreshed version. Neither refresh nor review may write anything automatically.
- Preserve the draft if refresh fails. Handle deleted/unavailable records explicitly and prevent an update from becoming a create.
- Preserve create-only semantics, legacy version 0 updates, permission checks, and lifecycle/dependency guards.
- Test the conflict/review state transitions and expected-version contract without browser automation. Add Theo's two-session manual test: one session saves first; the second receives a conflict, refreshes without losing its draft, compares the saved values, and explicitly chooses the next action.

This version-binding requirement supports the new refresh workflow; this review did not reproduce a current same-session overwrite.

### B. Display hierarchy problems wherever the affected label is used

Evidence: `hierarchyDistrictLabel` in `src/lib/hierarchyResolution.ts` only reflects a missing District or a retired District. It does not display a parent mismatch, a missing Region, or a retired Region when the District itself resolves. Dashboard cards, Location cards/groups, and the print sheet use this helper. The Location detail tooltip alone is not sufficient visible feedback.

Required correction:

- Keep canonical IDs and names intact while visibly distinguishing unassigned, unresolved, retired, and parent-mismatched hierarchy states on the affected surfaces.
- Cover an active District under a retired Region, a resolved District with a missing Region, and a District whose parent differs from the Location's Region.
- Where multiple problems coexist, make all relevant explanations accessible; do not rely solely on hover text or color.
- Check selectors and registry parent labels for the same misleading healthy-state display. Preserve unavailable current references for review and keep them out of new-assignment choices.
- Reuse the existing resolver and warnings. Do not repair stored relationships, infer parents, or rewrite legacy fields.
- Add focused helper/projection tests and a manual checklist for Dashboard, Location detail/cards/grouping, print, and selectors. Preserve the existing separate API/CSV ID/name values and their documented diagnostics.

### C. Remove ambiguous manager links in the touched Dashboard path

Evidence: the changed `DashboardView.tsx` resolves a District Manager by ID, then falls back to a matching `fullName`; it does not require Active status. A missing canonical reference can therefore open a different Person with the same name, and an inactive Person can still appear as the current manager. The same Quick Reference cards/search still use copied manager names.

Required correction:

- Use the existing `resolveActivePerson` contract for District Manager and Store Manager resolution in the Dashboard Quick Reference path.
- Remove name-based identity fallback. Show the established vacant/unassigned state when the canonical Person is missing or inactive, and only link to the resolved active Person.
- Make displayed manager names and manager search terms in this path use the same resolution. Do not change role eligibility or assignment permissions.
- Add focused coverage for missing IDs, inactive People, duplicate names, and valid active assignments. This is a consistency correction in the already-touched Dashboard, not a broader People feature.

### Impact assessment and boundaries for this amendment

- Directly affected: registry edit UI, authorized refresh/client state, expected-version handoff, shared hierarchy presentation, and Dashboard manager projections.
- Regression checks: registry API writes, audit immutability on rejection, Location relationships, canonical API reconciliation, CSV ID/name separation, and the existing selected-row import safeguards.
- No new database migration, automatic reassignment, permission model, scheduled job, or integration contract is authorized.
- Inspect repository jobs, reports, dashboards, and integration consumers that read these affected fields; record each as affected, unaffected with evidence, or not verified. External applications and direct database consumers outside this repository remain unverified until their owners provide evidence.
- Fetch the remote branch before editing because this review adds a documentation commit. Inspect the local worktree and preserve the unrelated runbook modification; do not reset, discard, or include it. Use an isolated worktree if needed.

### Return evidence in this repository

Continue on PR #10. Correct A–C, add focused tests, and run lint, the complete API suite, production build, and diff-check. Do not run Playwright or troubleshoot its environment.

Append the correction report to this dispatch: application SHA, PR/base, changed files and purpose, acceptance results marked PASS/FAIL/NOT RUN, regression evidence, unresolved limitations, affected/unverified consumers, and Theo's manual checklist. Keep the earlier completion report as historical evidence. Distinguish the tested application commit from any later documentation-only commit.

Commit and push the scoped corrections and report. Keep the PR draft. No merge, deployment, production import, migration, repair, secret/configuration changes, or People CSV expansion. These corrections are ready for implementation; Dispatch 12 remains pending acceptance.

## Review amendment completion report

Completed on 2026-09-20. Tested application commit: `e74e57c1a4ebb6cb553dca109b3355832282c6dc`. This report is a later documentation-only change and does not alter the tested application snapshot. Draft PR #10 remains on `feat/dispatch-12-hierarchy-registry-api`, based on `dispatch-11-flexible-location-csv`.

### Corrections and changed files

- Correction A — PASS: `src/components/admin/HierarchyRegistryPanel.tsx`, `src/context/DirectoryContext.tsx`, `src/lib/directoryClient.ts`, and new `src/lib/hierarchyRegistryEditing.ts` bind edits to the version opened, refresh through the authorized read-only bootstrap route, retain drafts and latest saved values for comparison, require explicit discard or reapply, preserve refresh retry failures, and prevent unavailable records from becoming creates.
- Correction B — PASS: `src/lib/hierarchyResolution.ts`, `src/components/locations/LocationsView.tsx`, `src/components/locations/LocationDetailModal.tsx`, and the registry panel visibly distinguish all resolver issues, including missing or retired Regions and parent mismatches. Existing shared label use carries the same result into Dashboard grouping/cards and `src/components/export/PrintSheetView.tsx`; assignment selectors retain unavailable current references while active-only option lists remain unchanged.
- Correction C — PASS: `src/lib/readProjectionContract.ts` and `src/components/dashboard/DashboardView.tsx` resolve Quick Reference Store and District Managers only by canonical active Person ID. Display, links, and search use the same projection; missing or inactive references show vacant/unassigned states without copied-name fallback.
- Regression coverage — PASS: new `test/hierarchyRegistryEditing.test.ts` and `test/hierarchyResolution.test.ts`, plus `test/readProjectionContract.test.ts`, cover conflict review transitions, exact expected versions including legacy version 0, authorized read-only refresh, unavailable records, missing/retired/mismatched hierarchy labels, exact active manager IDs, missing and inactive People, duplicate names, and valid assignments.

### Verification and regression evidence

- PASS — `npm run lint`.
- PASS — `npm run test:api`: 244 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo across 12 suites.
- PASS — `npm run build`; the existing Vite warning for chunks larger than 500 kB remains.
- PASS — `git diff --check`, both for the full worktree and with the unrelated runbook excluded.
- PASS — the complete API suite retained registry write/audit rejection behavior, Location relationship validation, API hierarchy reconciliation, CSV ID/name separation, unchanged editing-export behavior, and selected-row import safeguards.
- NOT RUN — Playwright and browser automation, as required by the dispatch.
- NOT RUN — deployment, migration, production import, production repair, or any production data/configuration operation.

### Consumer impact and remaining limitations

- Affected and corrected: Hierarchy Registry administration, Dashboard Quick Reference, Location detail/cards/grouping/filter selectors, and the print report.
- Unaffected with repository evidence: Directory API and CSV read projections continue to expose separate canonical IDs and resolved names; server transaction, export, import-preview, and reconciliation contracts passed the complete API suite. The migration script remains unchanged and uses copied manager names only for its existing migration mapping. Request views and other People workflows were not broadened by this amendment.
- Not verified: external applications, direct database consumers, current production data, and owners' downstream integration behavior are outside this repository and require owner evidence.
- Remaining limitation: conflict refresh is explicit rather than live synchronization, and manual visual, focus, responsive, and multi-session behavior still requires Theo's browser acceptance.

### Theo manual checklist

- In two sessions, edit the same Region or District. Save in session one; in session two confirm Save conflicts, refresh retains the second draft, latest values appear for comparison, and no write occurs until explicitly choosing discard or reapply and then Save.
- Confirm edit, Cancel, Save, focus return, pending/duplicate-submit protection, stale-refresh retry, and deleted/unavailable-record handling for Regions and Districts.
- Confirm lifecycle and District parent-change dependency errors retain input and provide affected Location links and corrective guidance.
- Rename a Region and District, refresh authoritative data, and confirm the names update without Location rewrites in Dashboard, Location detail/cards/grouping, print, and selectors.
- Check unassigned, unresolved, retired, missing-parent, and parent-mismatched labels on Dashboard, Location detail/cards/grouping, print, and selectors; confirm all simultaneous explanations are readable without hover or color alone.
- Check Quick Reference with valid, missing, inactive, and duplicate-name People; only the exact active canonical manager should display, link, and match search.
- Export reporting and editing CSVs and confirm separate `RegionId`, `RegionName`, `DistrictId`, and `DistrictName` fields, exact text ID `01`, informational name handling, and unchanged legacy `District` compatibility behavior.
- Exercise Location API list/detail, pagination, cursor invalidation, ETags, `hierarchyVersion`, and full-reconciliation restart after a registry-only rename.

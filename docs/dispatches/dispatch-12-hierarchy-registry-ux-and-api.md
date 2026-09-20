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

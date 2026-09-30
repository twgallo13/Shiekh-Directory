# Dispatch 12C — Implement Consistent Hierarchy Reads and Prevent Legacy District Writes

Status: Approved for scoped application implementation, local verification, and a draft PR #10 update. Live assignment updates, deployment, and merge remain outside this dispatch.

## Business objective

Make Region/District information consistent across the directory, API, CSV workflows, and 1-Sheet Directory PDF. Distinguish operational centers that deliberately have no retail District from stores awaiting assignment. Stop Person edits and Fleet Quick Add from introducing competing legacy District text.

## Verified baseline and readiness

- Repository: twgallo13/Shiekh-Directory.
- Continue on feat/dispatch-12-hierarchy-registry-api, open/draft PR #10, base dispatch-11-flexible-location-csv. Verified head before this dispatch: 57e89352f8a72bbd9b387afdbeeba4dabf732d8f.
- Read Dispatch 12, 12A, 12B and docs/dispatches/reports/dispatch-12b-update-plan.md.
- Business mapping is approved: District 01 = 14 stores, 02 = 12 including Store 150, 03 = 22, plus operational centers 001 and 86. These counts are fixture expectations, not values to hard-code into the application.
- The independently checked 50-record manifest is docs/dispatches/reports/dispatch-12b-proposed-changes.csv, SHA-256 d81ef01a59163f864f34c065c424b8ef26abf41c01c6a2d7ebdc12272dfd36a6. Preserve it as approved planning evidence. Do not execute or silently regenerate it.
- Fetch latest refs, read local repository instructions, and inspect worktree. Preserve the unrelated docs/cloud-run-deployment-runbook.md modification. Never reset/discard/stage unrelated work. Keep PR dependency/base/draft state.
- Implementation may modify scoped runtime files, tests, API/CSV documentation, and this dispatch's return report. Test writes must use isolated fixtures/test stores, never the live database.

## Verified impact assessment

- src/context/DirectoryContext.tsx copies updatedPerson.district into Location legacy district during Person reconciliation.
- src/components/admin/AdminIntegrationsView.tsx initializes/resets a guessed District 1 — Northern CA and saves it in Quick Add.
- src/lib/hierarchyAssignmentContract.ts already defines type-based applicability defaults.
- src/lib/hierarchyResolution.ts derives registry names/status but currently maps absent IDs to unassigned without applicability context.
- server/firestoreLocations.ts public field selection and server/directoryApi.ts mapping omit hierarchyApplicability.
- server/locationExport.ts reporting CSV omits applicability. server/locationEditingExport.ts uses the shared import schema, which already has HierarchyApplicability.
- src/components/export/PrintSheetView.tsx groups and filters by formatted District labels and counts every Location as a Store.
- LocationEditModal has canonical selectors but no explicit applicability control in the reviewed source.
- External direct database consumers, scorecards, scheduled jobs, and integrations are NOT VERIFIED. Preserve compatibility and document the additive contract for their owners; do not contact anyone or assume those consumers are absent.

## Implementation requirements

### 1. Shared read-only applicability contract

Add or reuse a browser-safe pure helper alongside the existing hierarchy contract. Reuse it in affected read projections to prevent competing default rules.

- Valid explicit Applicable, Not Applicable, or Unknown is returned unchanged.
- Missing/null applicability on Enclosed Mall, Strip Center / Shopping Center, or Street / Standalone Location defaults to Applicable.
- Other types default to Applicable when canonical Region/District references exist, otherwise Not Applicable, matching existing validation.
- Explicit Unknown stays Unknown. Unsupported saved values produce Unknown plus a visible diagnostic; do not rewrite them.
- Retail Not Applicable and Not Applicable with canonical references remain visible inconsistencies, not healthy operational-center classifications.
- Preserve existing hierarchyStatus enum meanings, unresolved IDs, hierarchyIssues, retired/parent mismatch warnings, and leading-zero/case-sensitive IDs. Applicability is additional information; it must not hide invalid references.
- Reads must not persist defaults or copy registry names into Location records.
- Preserve existing manual-save validation and changed-field/legacy-defect behavior. If refactoring shared logic into validation, prove acceptance parity with focused tests rather than changing business rules.
- Shared/browser code must not import Node-only CSV packages, Buffer, Firestore, or server modules.

### 2. Stop the two legacy writes and complete manual controls

- In DirectoryContext.updatePerson, stop assigning Location.district from Person.district. Preserve Person territory editing and all other established leadership/contact reconciliation. Test unrelated and territory-only Person edits; existing Location legacy values remain unchanged.
- In Fleet Quick Add, remove guessed district defaults and free-text District assignment. Reuse existing active Region/District selectors and IDs; District options cascade by Region, and changing Region clears prior District. Do not write the selected name into legacy district.
- Provide clear applicability controls in Quick Add and Location Edit using plain labels: Retail hierarchy applies, No retail hierarchy, and Needs review, backed by existing enum values. Retail types cannot select Not Applicable. Non-retail records may remain outside retail hierarchy. Selecting a canonical reference explicitly makes applicability Applicable.
- Do not silently erase existing references when selecting Not Applicable: explain that current Region/District assignments must first be cleared explicitly through the existing manual-clear behavior. Preserve unavailable assignments for review and honor expectedVersion/conflict handling.
- Existing applicable retail records may remain deliberately unassigned where current validation allows it, with a clear incomplete-assignment message. No guessed IDs, placeholder registries, forced Person assignments, new role restrictions, or unrelated Quick Add refactor.
- Preserve records' stored applicability during unrelated edits; merely viewing/calculating a default must not create a write.

### 3. API and CSV contracts

- Add hierarchyApplicability to the public Firestore selected fields and list/detail API output. The public output is the effective enum from the shared helper, with invalid-value diagnostics where applicable. Keep existing fields, null conventions, hierarchyStatus, legacy district, auth/scopes, and public contact privacy.
- Verify full/delta synchronization, updatedAt, ETags, hierarchyVersion, pagination/cursor invalidation, and registry rename behavior. Registry renames must not require Location document rewrites.
- Append HierarchyApplicability to the reporting CSV header list so existing columns retain their order. Emit the effective enum. Preserve DistrictId, registry-resolved DistrictName, and legacy District exactly in their existing roles.
- Editing exports must retain saved applicability semantics: absent stays blank and unchanged export/re-preview remains unchanged unless existing explicit diagnostics identify a real normalization difference. Do not turn read defaults into saved values.
- Because reporting applicability is effective and the heading is writable on import, reporting export/re-import may propose saving an explicit default. Explain this in the in-app guide/docs and test that the preview visibly lists that change. Do not claim reporting CSV is an unchanged editing round trip or full backup.
- Keep template, dictionary, examples, reference downloads, mapping aliases, preview, result and correction files consistent with the shared schema. Names remain informational; only canonical IDs create relationships.
- Preserve selected-row confirmation, signatures, authority checks, stale detection, receipts, retries, partial columns, spreadsheet-safe reversible encoding, and the 40-changed-row limit.
- No new CSV clearing syntax, People CSV, import execution path, schema-version bump without necessity, or import limit expansion.

### 4. Directory UI, dashboard, and 1-Sheet Directory PDF

Use shared effective applicability and registry resolution consistently in Location lists/details/search, hierarchy displays, dashboard grouping/counts, and PrintSheetView. Inspect all callers and record modified versus verified-unaffected paths.

- Resolved retail rows group by stable District ID; display District name and ID. Filter state must remain usable after a rename. Use distinct keys for non-District groups so IDs cannot collide with labels.
- Non-retail Not Applicable records without contradictory references appear under Operational Centers / Non-retail Locations, with No retail district where appropriate.
- Applicable retail records without a District appear under Unassigned Retail Locations.
- Unknown, invalid, retired, missing-reference, or parent-mismatched rows retain actionable warnings and remain findable; never hide them among healthy centers.
- Calculate total Locations and retail/non-retail counts from the authorized, lifecycle-filtered, currently displayed data. Do not change existing lifecycle visibility policy. Do not infer retail type solely from whether DistrictId exists.
- Update PDF page title/description, filters, summary counts, group headings, and empty states consistently. Preserve compact landscape layout, contact columns, notices, privacy, and readable page breaks. Do not promise every possible roster fits one physical page.
- Preserve existing manager assignments and links. Do not turn uniform per-Location manager names into a new District-level manager record. Keep Ecommerce's existing leadership relationship; changing its business role label is deferred.
- Theo performs the actual browser and generated-PDF acceptance. Supply precise manual checks; no Playwright or browser troubleshooting.

### 5. Requests, direct access, documentation, and recovery readiness

- Verify correction requests and approvals still preserve existing relationships/version conflicts and cannot reintroduce the removed writer behavior. Do not expand supported request categories.
- Trace named-database/bootstrap/seed/migration and job/mail/integration paths for impacted hierarchy usage. Record unchanged paths with evidence; do not run seed/migration/scheduled work.
- Update API documentation, docs/location-csv-export.md, and docs/dispatches/dispatch-08-csv-coverage-matrix.md where affected. State how consumers join IDs, refresh renamed registry labels, distinguish non-applicability, and treat legacy copied District text.
- Live data recovery remains blocked: CSV blanks preserve values and cannot restore all absent fields. Correct the 12B recovery wording accordingly. Test supported manual-clear behavior locally for affected fields and document exact unsupported cases; do not add a privileged repair/restore endpoint or bypass validation.
- Do not promise restoration of invalid DIS-01 or previously empty required names. Document version-gated compensating recovery options for later owner approval and the specific restricted-storage verification needed.
- Do not create storage resources, change IAM/secrets/configuration, or copy private backups into GitHub. Missing backup-storage evidence blocks data execution, not these application fixes.

## Acceptance and verification

Add meaningful focused tests for:
- Shared default/explicit/Unknown/invalid applicability behavior and existing validation parity.
- Person edits preserve Location legacy district and other contact/leadership behavior.
- Quick Add no guessed district; canonical cascading/explicit unassignment; manual non-applicability and stale conflict behavior.
- API list/detail and Firestore projection include effective applicability without exposing private data; names/version/cache reconciliation still works.
- Reporting CSV includes effective applicability; editing export retains raw saved values; unchanged editing re-preview, supported partial edits, leading-zero IDs, and reporting default changes are explicit.
- Stable-ID groups survive rename; centers are distinct from unassigned stores; invalid references remain visible; scoped counts are correct.
- Fixture state representing approved post-update mapping gives 14/12/22 retail rows plus 2 centers. Before-update fixtures must truthfully remain unassigned/unresolved; implementation does not pretend the data repair happened.
- No-write read/preview/download paths and unchanged authorization boundaries.

Run focused tests, npm run lint, npm run test:api, npm run build, and git diff --check. Record final test-runner tests/pass/fail totals, exits, tested source state, and material warnings. Inspect the built Admin/shared dependency path for recurrence of the prior browser Buffer/Node CSV import failure. No optional broad retesting once required gates and concrete risks are covered.

## Delivery and stop point

Create docs/dispatches/reports/dispatch-12c-implementation-review.md containing:
- Business outcome and changed-file purposes.
- Cross-system impact matrix with verified unaffected and NOT VERIFIED entries.
- API/CSV field contract examples and remaining compatibility limits.
- Test evidence and Theo's short UI/PDF manual checklist.
- Recovery/storage prerequisites still blocking live updates.
- Application SHA versus documentation SHA and PR status.

Commit and push scoped code/tests/docs, keep PR #10 draft on its current base, and update its summary/evidence links. Preserve the local unrelated runbook edit and the approved manifest.

Return the SHA, report link, actual test totals, any implementation blockers, and "Dispatch 12C implementation ready for review; live assignments unchanged."

Do not deploy, promote traffic, merge, confirm an import, execute live writes/repairs/migrations, alter registries or approved store assignments, remove/repurpose legacy District fields, introduce districtCode, or expand People CSV. A later deployment and live-update handoff will use fresh data/version checks and separately reviewed recovery readiness.

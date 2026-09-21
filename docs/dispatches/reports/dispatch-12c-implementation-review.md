# Dispatch 12C Implementation Review

Status: **Implementation ready for review; live assignments unchanged.**
Amendment applied: [dispatch-12c-delivery-review-amendment.md](dispatch-12c-delivery-review-amendment.md), correcting the partial delivery previously reviewed at `56533176bb456e1f5a63d5ba7c208b391a0a8f31`.

## Outcome

Region/District information is now consistent across the read/write paths that were in scope: Person edits and Fleet Quick Add no longer write competing legacy District text; effective hierarchy applicability is computed by one shared, browser-safe helper and consumed by the API, reporting CSV, Location list/detail/search, dashboard grouping, and the 1-Sheet Directory PDF; and District, Operational Center, Unassigned Retail, and Needs Review groups use stable namespaced identities that survive a registry rename. No application change applies the approved 12B manifest, changes a live assignment, creates or changes registry records, removes a legacy field, or alters a People relationship.

### Changed files

| File | Purpose |
|---|---|
| `src/lib/hierarchyResolution.ts` | Shared effective-applicability resolver; shared `HierarchyGroupKey`/`hierarchyGroupId`/`hierarchyGroupLabel` for stable, namespaced grouping; shared `isRetailHierarchyType`/`canSelectNotApplicableHierarchy` control restriction; widened resolver input type. |
| `src/lib/personLocationRelationships.ts` | Extracted `reconcileLocationLeadershipCopy`, a pure, unit-tested function that copies only name/phone leadership fields and never legacy `district` or canonical hierarchy fields. |
| `src/context/DirectoryContext.tsx` | `updatePerson` now calls the pure leadership-copy helper; territory-only and unrelated edits no longer touch affected Locations at all. |
| `src/components/admin/AdminIntegrationsView.tsx` | Fleet Quick Add adds canonical Region/District selectors (Region change clears District) and an explicit applicability control; removes the guessed legacy default entirely. |
| `src/components/locations/LocationEditModal.tsx` | Adds the explicit Retail hierarchy / No retail hierarchy / Needs review control, retail restriction, reference-clearing guidance, and visible applicability diagnostics. |
| `server/firestoreLocations.ts` | Selects saved `hierarchyApplicability` in public Location reads. |
| `server/locationExport.ts` | Corrected: `HierarchyApplicability` is now the last reporting CSV column, after every pre-existing header. Fixed a real defect where the resolver was called without `type`/`hierarchyApplicability`, which silently produced `Not Applicable` for every reporting row. |
| `src/components/export/PrintSheetView.tsx` | Stable District/Operational Centers/Unassigned Retail/Needs Review grouping and filtering by group ID, not a formatted label; per-row hierarchy/applicability warnings; corrected totals and group labels. |
| `src/components/dashboard/DashboardView.tsx` | Quick Reference Roster grouping/filtering uses the same stable group IDs. |
| `src/components/locations/LocationsView.tsx` | District filter/list/grid grouping uses the same stable group IDs. |
| `API.md` | Documents the effective `hierarchyApplicability` field, its defaults, and the "join by ID, not by applicability" guidance. |
| `docs/location-csv-export.md` | Documents the appended reporting column, effective-vs-saved semantics, and that editing exports keep the raw saved value. |
| `docs/dispatches/dispatch-08-csv-coverage-matrix.md` | Updates the `hierarchyApplicability` row and the Export All Stores row for the appended, effective-value column. |
| `docs/dispatches/reports/dispatch-12b-update-plan.md` | Corrects stale "omits applicability" wording now superseded by this implementation; adds an explicit CSV-blank recovery limitation sentence. |
| `test/hierarchyResolution.test.ts` | Effective-applicability defaults/Unknown/invalid-value coverage; shared retail-restriction helper coverage. |
| `test/hierarchyGrouping.test.ts` | Fixture-based proof that the approved-after manifest groups into 14/12/22 retail plus 2 centers, and that the before-fixture (Store 150 unresolved `DIS-01`) does not; read-only against the unmodified approved manifest. |
| `test/personLocationLeadershipCopy.test.ts` | Person edits never copy legacy `district`; territory-only and unrelated-person edits leave the Location untouched. |
| `test/directoryApi.test.ts` | Effective applicability in list responses; malformed/empty-string/absent saved-value distinctions without broadening the valid enum. |
| `test/locationExportApi.test.ts` | Exact reporting header order regression (`HierarchyApplicability` last). |
| `test/locationImportPreview.test.ts` | Re-importing the current reporting export visibly proposes saving a calculated applicability default. |

The approved [Dispatch 12B manifest](dispatch-12b-proposed-changes.csv) is byte-for-byte unchanged; its SHA-256 remains `d81ef01a59163f864f34c065c424b8ef26abf41c01c6a2d7ebdc12272dfd36a6`.

## Requirement-by-requirement result

| Amendment finding | Result |
|---|---|
| CSV column order contradicted append-only requirement | **Fixed.** `HierarchyApplicability` is the last header; `test/locationExportApi.test.ts` asserts every pre-existing header position and the exact final column. |
| Quick Add hierarchy controls unfinished | **Fixed.** Canonical Region/District cascade and explicit applicability control added; no guessed default remains. |
| Location Edit lacked an applicability selector | **Fixed.** Explicit three-choice control added with retail restriction, reference-clearing guidance, and visible diagnostics. |
| PDF grouping based on changing display labels | **Fixed.** Stable `district:<ID>` / `operational-centers` / `unassigned-retail` / `needs-review` group IDs; filter and grouping never key off a formatted label. |
| Applicability diagnostics not wired into the shared display label | **Fixed.** `hierarchyDistrictLabel` and `hierarchyGroupLabel` include `applicabilityIssues`; PrintSheetView shows per-row warnings from both issue categories. |
| Missing guidance, recovery corrections, and behavioral evidence | **Fixed.** API.md, `docs/location-csv-export.md`, the coverage matrix, and the 12B update plan's recovery wording are corrected; see Verification below for actual evidence. |
| Report deferred required implementation while asking Theo to test it | **Fixed.** This report states implemented, verified-unaffected, or NOT VERIFIED per surface below; the manual checklist covers only implemented behavior. |

## Contract

`hierarchyApplicability` is additive. API/list/detail resolution returns the effective enum through the existing hierarchy projection; the resolver input now includes `type` and `hierarchyApplicability`, closing a real bug where the reporting export previously called the resolver with only `regionId`/`districtId` and therefore always computed `Not Applicable`.

- `Applicable`, `Not Applicable`, and `Unknown` remain explicit when saved. An empty string saved value behaves like absent (falls through to the type/reference default), while any other unsupported saved value resolves to `Unknown` with a diagnostic — these are intentionally different and both are tested.
- Missing applicability defaults to `Applicable` for Enclosed Mall, Strip Center / Shopping Center, and Street / Standalone Location.
- Other types default to `Applicable` when a canonical Region or District reference exists, otherwise `Not Applicable`.
- Retail `Not Applicable` and `Not Applicable` records retaining references remain visible inconsistencies, never grouped as healthy Operational Centers.
- No default is persisted merely by reading it. Existing `hierarchyStatus`, registry-resolved IDs/names, legacy `district`, permissions, contact privacy, cache/version behavior, and leading-zero IDs are preserved.

Reporting CSV appends `HierarchyApplicability` last and emits the effective value. Re-importing it can visibly propose saving a calculated default as an explicit value; `test/locationImportPreview.test.ts` proves the preview lists that change. Editing exports retain saved applicability semantics, so absent stays blank for unchanged re-preview behavior.

## Cross-system impact

| Surface | Result |
|---|---|
| Person edits | **Implemented.** `reconcileLocationLeadershipCopy` copies only name/phone leadership fields; territory-only and unrelated edits leave the Location object unchanged (same reference), proven by `test/personLocationLeadershipCopy.test.ts`. |
| Fleet Quick Add | **Implemented.** Canonical Region/District cascade, explicit applicability control, no guessed default, no silent reference clearing. |
| Location Edit | **Implemented.** Explicit applicability control with retail restriction and reference-clearing guidance; diagnostics from `applicabilityIssues` are visible. |
| Firestore/API | **Implemented and corrected.** Public reads select saved applicability; list/detail expose the effective enum; malformed/empty/absent values are distinguished (`test/directoryApi.test.ts`). |
| Reporting CSV | **Implemented and corrected.** Column order fixed; effective value now resolves correctly because the resolver receives `type`/`hierarchyApplicability`. |
| Editing CSV/import confirmation | **Verified unaffected.** Shared writable schema retains saved-value semantics, selected-row authorization, signatures, stale checks, receipts, retries, and the 40-row limit; no import was executed. |
| Location list/search, dashboard, PrintSheetView | **Implemented.** All three now group/filter by the same stable, namespaced group ID; Operational Centers and Unassigned Retail Locations are distinct groups; unresolved/retired/parent-mismatch rows remain visible with warnings; totals are computed from the displayed, lifecycle-filtered dataset. |
| Requests/correction approvals | **Verified unaffected.** Approved corrections apply the persisted requested change through the same server-side validation as manual saves (`server/firestoreDirectory.ts`); they cannot reintroduce the removed legacy writers because those writers no longer exist in the client paths that build a request payload. |
| Direct database access, bootstrap/seed, `scripts/migrateFirestoreFromCsv.ts` | **Traced, unchanged.** No legacy `district` free-text writer exists in these paths; none were run or modified in this pass. |
| Scheduled jobs, mail, integrations, external scorecards, external PDF consumers | **NOT VERIFIED.** No repository evidence establishes these consumers' behavior; none were contacted or assumed absent. |

## Recovery and compatibility limits

Live update execution remains blocked by the separate Dispatch 12B fresh-version, restricted-before-state, checksum, and approval gate — this pass changed no live data. CSV import treats a blank supported cell as "leave unchanged," not as an explicit clear; it cannot reconstruct a field that is genuinely absent on the authoritative record, and it cannot exactly restore every previously invalid or missing value. There is no supported promise to restore invalid `DIS-01` or Store 86's previously empty required name via a blind rollback; any restoration requires the application's explicit-clear/explicit-value semantics and a fresh version check. Existing CSV confirmation receipts are evidence, not a restore mechanism.

Legacy `district` fields and headers remain fully compatible and unchanged in meaning. Store 86's legacy copied text remains a known, disclosed compatibility inconsistency pending a separately approved transition.

## Verification

- Focused tests: `node --import tsx --test test/hierarchyResolution.test.ts test/hierarchyGrouping.test.ts test/personLocationLeadershipCopy.test.ts test/directoryApi.test.ts test/locationExportApi.test.ts test/locationImportPreview.test.ts` — all pass individually and as part of the full suite below.
- `npm run lint` (tsc --noEmit): **PASS**, exit 0.
- `npm run test:api`: **PASS** — final test-runner summary: `tests 267, pass 267, fail 0, cancelled 0, skipped 0`.
- `npm run build`: **PASS**, exit 0. Inspected `dist/assets/*.js` for the prior browser Buffer/Node CSV import failure: no `csv-parse`/`csv-stringify`/`Buffer.from`/`Buffer.isBuffer` references found in the built bundles.
- `git diff --check`: **PASS**, no whitespace errors.
- Approved manifest checksum reverified unchanged: `d81ef01a59163f864f34c065c424b8ef26abf41c01c6a2d7ebdc12272dfd36a6`.
- No browser automation, deployment, live assignment update, import confirmation, migration, or merge was run.

## Theo Manual Checklist

1. In Location Edit, confirm the Retail hierarchy / No retail hierarchy / Needs review control shows the correct restriction for the Location's type, and that selecting No retail hierarchy while a Region/District is still assigned shows the "clear it first" guidance rather than silently removing the assignment.
2. In Fleet Quick Add, select a Region, confirm the District list is limited to that Region's active Districts, then change the Region and confirm the District selection clears; confirm no legacy free-text District value is saved regardless of the applicability choice.
3. Edit a Person's territory-only field and confirm every Location the person leads keeps its existing legacy District text unchanged; edit the Person's name and confirm the linked Location's Store/District Manager display name updates without changing legacy District text.
4. Confirm Store 150 still shows its existing live state (invalid `DIS-01`, no District 02 assignment) — this dispatch does not repair it.
5. On the Location list, dashboard Quick Reference, and 1-Sheet Directory PDF, confirm Operational Centers and Unassigned Retail Locations appear as separate, clearly labeled groups from District groups, and that renaming a District in the registry updates the displayed name without moving stores into a different group or losing the active filter.
6. Generate the 1-Sheet Directory PDF and confirm scoped/filtered totals match the displayed rows, unresolved/retired/parent-mismatch warnings remain visible per row, and landscape/page-break layout remains readable.

## Source and PR status

- Application implementation source: this commit; the exact SHA is recorded in PR #10's evidence comment.
- Dispatch authorization: `440e063ab80d5e1281c52e59a05914bd602800c3`. Amendment authorization: `e3eebfb857f500fb1722986675a9c8581a5de729`.
- PR #10 remains draft on its current base.

Dispatch 12C implementation ready for review; live assignments unchanged.

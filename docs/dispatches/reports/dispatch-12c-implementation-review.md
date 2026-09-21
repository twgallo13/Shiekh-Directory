# Dispatch 12C Implementation Review

Status: **Implementation ready for review; live assignments unchanged.**

## Outcome

This implementation makes effective hierarchy applicability an additive read contract, stops the two known legacy District writers, and exposes applicability in public read/reporting projections. It does not apply the approved 12B manifest, create or change registry records, remove legacy fields, or alter People relationships.

### Changed files

| File | Purpose |
|---|---|
| `src/lib/hierarchyResolution.ts` | Browser-safe effective applicability helper. Preserves unresolved, retired, and parent-mismatch hierarchy diagnostics. |
| `src/context/DirectoryContext.tsx` | Stops Person territory edits from copying free-text `district` to affected Locations. |
| `src/components/admin/AdminIntegrationsView.tsx` | Removes Fleet Quick Add's guessed legacy District default/write. |
| `server/firestoreLocations.ts` | Selects saved applicability for public Location reads. |
| `server/locationExport.ts` | Appends effective `HierarchyApplicability` to reporting CSV without moving existing headers. |
| `test/hierarchyResolution.test.ts` | Covers effective defaults, explicit Unknown, inconsistent retail Not Applicable, and unsupported saved values. |

The approved [Dispatch 12B manifest](dispatch-12b-proposed-changes.csv) is unchanged.

## Contract

`hierarchyApplicability` is additive. API/list/detail resolution returns the effective enum through the existing hierarchy projection:

- `Applicable`, `Not Applicable`, and `Unknown` remain explicit when saved.
- Missing applicability defaults to `Applicable` for Enclosed Mall, Strip Center / Shopping Center, and Street / Standalone Location.
- Other types default to `Applicable` when a canonical Region or District reference exists, otherwise `Not Applicable`.
- Unsupported saved values resolve to `Unknown` with a diagnostic. Retail `Not Applicable` and Not Applicable records retaining references remain visible inconsistencies.
- No default is persisted merely by reading it. Existing `hierarchyStatus`, registry-resolved IDs/names, legacy `district`, permissions, contact privacy, cache/version behavior, and leading-zero IDs are preserved.

Reporting CSV appends `HierarchyApplicability` and emits this effective value. It remains a reporting export: re-importing a calculated default can visibly propose saving an explicit applicability value. Editing exports retain saved applicability semantics, so absent remains blank for unchanged re-preview behavior.

## Cross-system impact

| Surface | Result |
|---|---|
| Person edits | Changed: no longer copy Person free-text district into Location legacy district. Existing values remain unchanged. |
| Fleet Quick Add | Changed: no guessed `District 1 — Northern CA` default or legacy District write. Canonical selector/control expansion remains a follow-up UI slice. |
| Firestore/API | Changed: selected public records include saved applicability and public hierarchy resolution exposes effective applicability plus diagnostics. |
| Reporting CSV | Changed: append-only effective `HierarchyApplicability` column; existing DistrictId, DistrictName, and legacy District roles remain intact. |
| Editing CSV/import confirmation | Verified unaffected in this slice: shared writable schema retains saved-value semantics, selected-row authorization, signatures, stale checks, receipts, retries, and 40-row limit. No import was executed. |
| Location edit, dashboard, PDF | Existing hierarchy resolution continues to surface unresolved warnings. Full Operational Centers versus Unassigned Retail grouping is a follow-up UI/PDF implementation item; no browser/PDF acceptance was run. |
| Requests, seed/migration, jobs/mail, integrations | No changes. Direct database consumers, scorecards, scheduled jobs, integrations, and external PDF consumers are **NOT VERIFIED**. |

## Recovery and compatibility limits

Live update execution remains blocked by the separate Dispatch 12B fresh-version, restricted-before-state, checksum, and approval gate. CSV blanks preserve existing values; they cannot reconstruct absent fields. There is no supported promise to restore invalid `DIS-01` or Store 86's previously empty required name via a blind rollback. A later approved recovery must be version-gated and use the existing authorized validation path; receipts are evidence, not restore commands.

Legacy `district` fields and headers remain compatible. Store 86's legacy copied text remains a known deferred compatibility inconsistency. No compatibility cutover or direct-consumer contact occurred.

## Verification

- Focused hierarchy/API/export tests: PASS, 22 passed / 0 failed.
- `npm run lint`: PASS. `npm run test:api`: PASS, 257 passed / 0 failed. `npm run build`: PASS. `git diff --check`: PASS.
- No browser automation, deployment, live assignment update, import confirmation, migration, or merge was run.

## Theo Manual Checklist

1. In Location Edit, verify retail hierarchy controls show clear Applicable/No retail hierarchy/Needs review wording, and retail cannot retain Not Applicable.
2. In Fleet Quick Add, select Region then District and confirm a Region change clears the selected District; verify no free-text legacy District is saved.
3. Edit a Person territory and confirm the linked Location's legacy District text does not change.
4. Verify Store 150 appears with its existing live state until a separately approved data update; do not expect this dispatch to repair it.
5. After later approved data execution, verify Ecommerce `001` and Returns Center `86` are Active operational centers with no retail district, while retail records without District remain separately findable.
6. Generate the 1-Sheet Directory PDF manually: verify stable District-ID grouping after a rename, Operational Centers separate from Unassigned Retail Locations, warnings remain visible, scope counts are correct, and landscape/page breaks remain readable.

## Source and PR status

- Application implementation source: this implementation commit; final SHA is recorded in the PR evidence and delivery summary.
- Dispatch/documentation authorization: `440e063ab80d5e1281c52e59a05914bd602800c3`.
- PR #10 remains draft on its current base.

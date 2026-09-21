# Dispatch 12B Approved Hierarchy Update Plan

Status: **Approved mapping recorded; exact update plan ready for review.** This document is planning-only. No application implementation, live assignment, import, repair, migration, deployment, merge, or browser automation was performed.

## Scope and provenance

- Branch source: `9f1806312556e19f0e10510292c83ed70c8047e8` plus this planning commit.
- Application baseline: `e74e57c1a4ebb6cb553dca109b3355832282c6dc`.
- Reconciliation evidence: `4085ebbf4d8c9b8efdc79d936e39bae0c3efcfa3`; corrected reader/helper is retained and reused.
- Authoritative source: project `gen-lang-client-0801664258`, named database `ai-studio-shiekhlocationco-00e1a479-af25-4ab6-9565-5c8b804c56a4`.
- Fresh read: `node --import tsx scripts/dispatch12aReconciliation.ts` read `locations`, `regions`, and `districts` in one read-only Firestore transaction at `2026-09-21T04:45:22.248Z`. The helper source is `4085ebbf4d8c9b8efdc79d936e39bae0c3efcfa3`; this wall-clock completion time is evidence of the read operation, not a database generation timestamp.
- Fresh inventory: 50 Active Locations, 2 Active Regions, 3 Active Districts; no Draft or Retired Locations. No inventory drift from the approved 50-row roster was observed.
- Approved retail totals: District `01` = 14, District `02` = 12, District `03` = 22. Centers: Store `001` Ecommerce and Store `86` Returns Center exception.
- The companion CSV is review-only and **not import-ready**. It contains one field-level row per Location, including saved-value presence/raw/effective applicability, raw version presence, and only actual field differences.

## Exact proposed data changes

The complete field-level manifest is [dispatch-12b-proposed-changes.csv](dispatch-12b-proposed-changes.csv). Its SHA-256 is `d81ef01a59163f864f34c065c424b8ef26abf41c01c6a2d7ebdc12272dfd36a6`. It is the only source for a later approved payload; no row may be added from manager names, geography, legacy text, or a refreshed screenshot.

### Retail stores

For all 48 approved retail stores, set `hierarchyApplicability` explicitly to `Applicable`, set `regionId` to exact string `region-west`, and set `districtId` to the approved exact string `01`, `02`, or `03` only when different from the saved raw value. The manifest computes `ChangedFields` from raw before/after values: Store 150 changes only `districtId` from invalid `DIS-01` to `02`; its already-saved `Applicable` and `region-west` are preserved. Registry-resolved `DistrictName` is derived output, never a Location field to persist. Legacy `district` text remains unchanged for compatibility.

The registry must be re-read immediately before execution. Every target District must still be Active and parented to `region-west`. A parent/status/ID drift stops execution and requires review; it does not trigger substitution.

### Operational centers

- Store `001`, document `loc-d4c2f939-bcd5-4263-bdc8-e7f293afe84a`, remains `Ecommerce`, `Warehouse / Distribution Center`, Active, version 2, with no Region/District IDs. Set only explicit `hierarchyApplicability=Not Applicable`. Preserve current operational ownership, Theo's existing relationship, People/leadership links, and all other fields.
- Store `86`, document `loc-86`, remains Active with no Region/District IDs and explicit `hierarchyApplicability=Not Applicable`. Proposed metadata changes are exact: blank `name` -> `Returns Center`; `type` -> `Warehouse / Distribution Center`. Preserve Store Number `86`, document identity, People/leadership links, and all other fields. Preserve legacy `district=Central & Southern California` as compatibility history; it is not a canonical assignment and remains a known inconsistency until a separately approved transition.
- No placeholder District is created, and neither center receives a retail District.

## Before/after and recovery controls

1. Immediately before each write batch, capture an access-controlled before-state for only the scoped document IDs and required fields, including document ID, Store Number, raw version presence/value, updated timestamp, hierarchy fields, name/type for Store 86, legacy District, lifecycle status, and relationship identifiers. Full backups and contact/private fields stay in approved restricted storage and are not committed.
2. Freeze the exact manifest bytes, record its SHA-256, and obtain approval for that checksum. The execution payload must be derived from the manifest without field expansion. Verify all 50 IDs, exact Store Numbers, expected versions, approved District IDs, center exceptions, and no unexpected fields before preview.
3. Use the existing authorized update-only CSV preview/confirmation path or equivalent existing manual-save path. Preserve role/scope checks, update-only existence intent, expected versions, final hierarchy validation, selected-row authorization, warning acknowledgement, signed token binding, expiry, receipts, and retry protection. Do not bypass validation for legacy defects.
4. The existing confirmation limit is 40 changed rows. The frozen manifest membership is: **B1** = `loc-07`, `loc-09`, `loc-103`, `loc-105`, `loc-108`, `loc-11`, `loc-115`, `loc-116`, `loc-118`, `loc-119`, `loc-120`, `loc-131`, `loc-133`, `loc-14`, `loc-143`, `loc-146`, `loc-15`, `loc-150`, `loc-17`, `loc-19`, `loc-21`, `loc-23`, `loc-25`, `loc-29`, `loc-32`, `loc-33`, `loc-34`, `loc-35`, `loc-36`, `loc-37`, `loc-38`, `loc-42`, `loc-47`, `loc-48`, `loc-51`, `loc-52`, `loc-53`, `loc-57`, `loc-59`, `loc-61`. **B2** = `loc-73`, `loc-82`, `loc-87`, `loc-91`, `loc-92`, `loc-95`, `loc-97`, `loc-98`, `loc-86`, `loc-d4c2f939-bcd5-4263-bdc8-e7f293afe84a`. B1 is the first 40 approved retail document IDs lexicographically; B2 is the remaining 8 retail IDs then the two centers lexicographically. Re-preview and re-confirm each batch against a fresh read. This is not one atomic transaction across all 50 rows.
5. Verify the database readback after each batch by document ID and expected version increment. Verify canonical registry resolution, explicit center applicability, Store 86 name/type, preserved legacy fields, and unchanged relationship fields. Stop if any row is stale, missing, unauthorized, invalid, unexpectedly changed, or returns an uncertain response.
6. Correlate each successful batch with its confirmation receipt and audit before/after evidence. An uncertain response retries the exact bound operation only through the existing idempotent confirmation mechanism; never construct a new payload from memory.

### Recovery procedure

Recovery is a new approved write plan, not traffic rollback. The supported mechanism is a fresh authorized update-only preview/confirmation with explicit field values, expected versions, receipt binding, and a new audit/version history. For each completed batch, compare the captured before-state with the current document and require the current version to be the exact version produced by the approved batch. Do not reset versions/timestamps or overwrite later legitimate edits; stop for a row-specific decision if a document changed after the batch.

For Store 86, a later approved recovery must submit explicit empty name/type values and explicit applicability value through the supported schema only if preview validates those clears; omission is not a clear. For applicability and hierarchy removals, the later preview must use the schema's explicit clear semantics and preserve exact expected versions. This planning pass did not run a live preview, so clear support is **not yet verified**. Restoring invalid `DIS-01` is expected to be rejected by hierarchy validation and is not promised; the bounded compensating recovery is to retain the valid approved District or choose another active owner-approved District after fresh review. Existing receipts are evidence only, not a restore mechanism. No apply/recovery code is proposed.

CSV import generally preserves supplied and existing values; a blank supported cell is treated as "leave the current value unchanged," not as an instruction to clear it, and there is no explicit-clear syntax for most fields. This means a CSV-based recovery attempt cannot reconstruct a field that is genuinely absent on the authoritative record, and it cannot restore every previously invalid or missing value exactly as it was. Any restoration of an absent or invalid field requires the application's explicit-clear/explicit-value semantics and a fresh version check, not a blank CSV cell.

## Practical execution order for a later approved change

1. Deploy any separately approved additive contract/application correction first, with tests and manual acceptance; do not combine it with this planning commit.
2. Re-read the named database and registry, compare to this manifest, and stop on inventory, ID, parent, status, or version drift.
3. Capture restricted before-state evidence and manifest checksum.
4. Run fresh preview/confirmation for deterministic Batch 1; verify receipt, readback, and cross-system projections.
5. Run fresh preview/confirmation for Batch 2 only after Batch 1 passes; verify receipt and readback.
6. Re-read all affected IDs and verify API, both CSV contracts, UI projections, and manual PDF output against the same verification snapshot or document legitimate intervening changes by record ID.
7. Publish completion evidence and retain before/after/recovery references in approved access-controlled storage.

## Bounded application correction plan

No runtime changes are made here.

- **Person edits:** In `src/context/DirectoryContext.tsx`, stop copying Person free-text `district` into Location legacy `district` during `updatePerson`; preserve other leadership/contact reconciliation and Person territory behavior. Do not remove `Person.district` globally or infer `districtId` from it. Add tests proving unrelated leadership updates and explicit legacy values are preserved.
- **Fleet Quick Add:** In `src/components/admin/AdminIntegrationsView.tsx`, remove the guessed `District 1 — Northern CA` default. Reuse canonical Region/District selection and server validation. Permit deliberate unassigned applicable retail records where the contract allows it; centers use explicit `Not Applicable`. Preserve role and scope checks.
- **Registry/manual administration:** Existing registry edit/retire validation must remain the authority for IDs, active status, parent Region, expected versions, and dependent-record checks. Stale drafts must refresh before reapply.
- **Database/scripts:** `server/firestoreLocations.ts`, `server/firestoreDirectory.ts`, `server/locationImportPreview.ts`, `server/locationImportConfirmation.ts`, `server/locationExport.ts`, `scripts/migrateFirestoreFromCsv.ts`, and seed/bootstrap paths must preserve document IDs, versions, audit evidence, and named-database identity. Direct readers must resolve `districtId` through the registry; direct writers can bypass application validation and therefore are NOT VERIFIED unless separately audited. No seed or migration script is run.

## Cross-system impact and acceptance matrix

| Surface | Current verified behavior | Proposed plan / acceptance | Verification gap |
|---|---|---|---|
| Direct database/system access | Firestore uses named database; document IDs and versions are authoritative; registry names live on District records. Commit/import paths validate references, versions, relationships, and audit receipts. | Execute only the frozen manifest through existing authorized paths. Verify before/after by document ID and version; never write raw records or use manager/name matching. | Direct external writers/readers and security-rule behavior are NOT VERIFIED. |
| Manual Location/admin edits | `DirectoryContext` persists Location changes through authorized commit; hierarchy edits have registry/version checks. Person edits currently copy free-text district; Fleet Quick Add has a guessed legacy default. | Later correction removes those two legacy writes, preserves contacts/People links, supports omission versus explicit clear, stale refresh, retired-reference rejection, and unrelated legacy defects. | Manual PDF/UI acceptance remains Theo-owned. |
| CSV template/reference/mapping/preview | `src/lib/locationImportSchema.ts` makes `HierarchyApplicability` writable; DistrictId is the relationship; DistrictName and legacy District are informational. | Keep schema/dictionary/aliases/examples consistent; exact IDs as text; update-only identity; no name-to-ID inference; validate centers, parents, retired/missing IDs, leading zeros, and partial columns. | External spreadsheet workflows NOT VERIFIED. |
| CSV confirmation/results/corrections | Confirmation is selected-row, signed/token-bound, revalidated, receipt-backed, idempotent, and limited to 40 changed rows. | Two deterministic batches, fresh preview/confirmation each, readback between batches, separate receipts and failure status. Preserve spreadsheet-safe correction files. | No batch execution in this dispatch. |
| Reporting export | `server/locationExport.ts` emits Region/District IDs/names and legacy District but omits applicability. | Additive future `HierarchyApplicability` heading exposes the effective enum; centers are Operational Centers, while retail records with missing assignments remain Unassigned Retail Locations. Preserve legacy fields and existing meanings. Test 48 retail + 2 centers and scoped totals. | External reporting consumers NOT VERIFIED. |
| Editing export | Shared schema includes writable applicability; editing export is update-oriented and supports diagnostics/round trips. | Proposed field remains explicit; re-preview unchanged records must produce no silent rewrites; preserve unsupported fields and leading-zero IDs. | No import/confirm executed. |
| Directory API/synchronization | `server/firestoreLocations.ts` and `server/directoryApi.ts` selected/public mappings omit applicability as of this plan's original writing; Dispatch 12C's implementation now selects and exposes the effective enum. | Additive API field `hierarchyApplicability` exposes the effective enum with current defaults. Saved value/presence remains internal review/export evidence so unchanged editing-export round trips do not turn calculated defaults into saved writes. Preserve nullable IDs/names and public-contact privacy. Test full/delta reads, updatedAt/version, ETag/hierarchyVersion and stale cursor behavior. Registry rename changes resolved names, not Location timestamps. | External scorecards/direct API consumers NOT VERIFIED. |
| 1-Sheet Directory PDF | `src/components/export/PrintSheetView.tsx` groups through hierarchy labels and describes displayed records as Stores; no-ID records appear unassigned. | Later update should have separate Operational Centers and Unassigned Retail Locations groups, stable District-ID filters, explicit unresolved/retired/mismatch warnings, correct scoped totals, preserved contacts/manager links/privacy, landscape/page-break checks. Theo manually verifies generated PDF; no browser automation. | Actual browser print output and PDF consumer use NOT VERIFIED here. |
| Other UI/requests/integrations | Location list/detail/search, dashboard, People Works at/Supports, requests, mail/jobs, and integrations have repository surfaces; external consumers are not exhaustively observable. | Refresh after changes, preserve pending request conflict checks and relationship links, test consecutive saves and registry rename visibility. | External jobs, integrations, and scorecards remain NOT VERIFIED. |

## Additive applicability contract proposal

The current data update alone cannot distinguish intentional centers from unassigned retail on every surface. A later separately approved additive contract should expose `hierarchyApplicability` without redefining existing hierarchy status values or deleting legacy fields:

- Field: `hierarchyApplicability`.
- Allowed values: `Applicable`, `Not Applicable`, `Unknown`.
- Saved versus effective: saved value is authoritative when present; for recognized retail types, missing defaults effectively to `Applicable` under `validateLocationHierarchyFields`; for non-retail types, missing defaults effectively to `Applicable` when hierarchy references exist and otherwise `Not Applicable`; explicit `Unknown` remains `Unknown`; explicit retail `Not Applicable` is invalid and must be surfaced.
- Reporting/API examples: Store 150 => `Applicable`, Region `region-west`, District `02`; Ecommerce `001` => `Not Applicable`, no Region/District; Location `86` => `Not Applicable`, no Region/District, name `Returns Center`, type `Warehouse / Distribution Center`; a retail record with missing applicability and no IDs => saved blank, effective `Applicable`, review candidate/unassigned as appropriate.
- Schema/documentation: add the field to public/API and reporting projections, field dictionary, contract docs, test fixtures, and PDF/UI projections. Keep `DistrictId`, resolved `DistrictName`, and legacy `District` semantics unchanged.

## Completion status and unresolved decisions

- Delivery-review verification source: this planning worktree based on `3b0e08b`; final commit is recorded after review. Fresh snapshot evidence is `/tmp/dispatch12b-delivery.csv` during this session (SHA-256 `63e91fe7ed6799101f9051c1494fd4e3b4efbfee2ace41aafb4acc106a440f69`); it is intentionally not committed because it is raw review evidence. Manifest validation is `node --import tsx --test test/dispatch12bPlan.test.ts` (1 passed). `npx tsc --noEmit --pretty false`, `node --import tsx --test test/*.test.ts` (256 passed, 0 failed), `npm run build`, and `git diff --check` passed. Test and build logs are captured in `/tmp/dispatch12b-delivery-tsc.log`, `/tmp/dispatch12b-delivery-tests.log`, and `/tmp/dispatch12b-delivery-build.log` during this session. These paths are ephemeral evidence locations, not durable release artifacts.
- Historical 12A report entries that say NOT RUN remain historical. This delivery review records only commands actually run against its source state; it does not retroactively rewrite historical execution claims.
- Plan completeness: **PASS** for the reviewed repository surfaces and approved 50-record scope.
- Implementation readiness: **READY FOR REVIEW**, not implemented.
- Live data verification: **PASS** for the fresh planning snapshot; no writes performed.
- External-consumer verification: **NOT VERIFIED** for direct readers/writers, scheduled jobs, integrations, scorecards, and PDF consumers.
- Approval status: business mapping approved, but live execution still requires the separate review gate, frozen checksum, fresh versions, and batch receipts.

Theo must still decide or confirm:

1. Whether the additive `hierarchyApplicability` API/report/PDF/UI field is approved; this plan recommends effective values on API/reporting and saved presence only for internal review/editing evidence.
2. The external owners and verification evidence for direct database readers/writers, scorecards, scheduled jobs, integrations, and PDF consumers.
3. The recovery approver and restricted storage location for before/after evidence; available repository evidence does not verify a specific restricted-storage service.
4. The later compatibility transition for Store 86's preserved legacy District text and the Person/Fleet legacy writers.

No application changes, compatibility cutover, live assignments, imports, repairs, migrations, deployments, merges, or browser automation were performed.

Approved mapping recorded; exact update plan ready for review.

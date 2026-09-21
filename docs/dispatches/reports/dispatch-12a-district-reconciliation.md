# Dispatch 12A District Assignment Reconciliation

Status: **Authoritative proposal complete; assignment changes remain blocked pending approval**

This is a read-only review. No Location, Region, or District assignment was changed. No compatibility field was removed or repurposed, and no import, repair, migration, deployment, merge, or browser automation was run.

## Confirmed facts

- Branch was fast-forwarded to `1745917` from `origin/feat/dispatch-12-hierarchy-registry-api`. The pre-existing unrelated edit to `docs/cloud-run-deployment-runbook.md` remains local and is not part of this report.
- The configured authoritative identity is project `gen-lang-client-0801664258` and named Firestore database `ai-studio-shiekhlocationco-00e1a479-af25-4ab6-9565-5c8b804c56a4`, as defined in `server/firestoreLocations.ts`.
- A consistent read-only snapshot was taken from the `locations`, `regions`, and `districts` collections after ADC reauthentication, using the configured identity and named database. Snapshot time: `2026-09-21T02:01:21.367Z`.
- The authoritative snapshot contains 50 Active Locations, 2 Active Regions, and 3 Active Districts. One Location (Store 150) is hierarchy-applicable; the other 49 have missing `HierarchyApplicability` and are classified `UnknownApplicability`, not assigned by type.
- The application contract distinguishes canonical `DistrictId`, registry-resolved `DistrictName`, and legacy copied `District`. `server/locationExport.ts` emits all three fields and preserves the legacy field pending an approved transition.
- `DirectoryContext.updatePerson` includes `district` in leadership fields copied from a Person update and writes that free text to affected Location records when the person is a district manager. This is a verified legacy write path.
- Fleet Quick Add in `src/components/admin/AdminIntegrationsView.tsx` initializes the form with `District 1 — Northern CA` and saves the form's `district` value while supplying no canonical Region/District references. This is a second verified legacy write path.
- Repository evidence cannot verify external applications, scheduled jobs, direct database readers, or downstream exports outside this repository. Those consumers remain **NOT VERIFIED**.
- The active registry contains Regions `region-west` (`West`) and `region-Central` (`Central`), plus Districts `01`, `02`, and `03`, all Active and parented to `region-west`.

## Snapshot provenance and limits

| Item | Result |
|---|---|
| Source project | `gen-lang-client-0801664258` |
| Source database | `ai-studio-shiekhlocationco-00e1a479-af25-4ab6-9565-5c8b804c56a4` |
| Requested source collections | `locations`, `regions`, `districts` |
| Access mode | Read-only Firestore SDK reads |
| Snapshot result | PASS; read-only records returned |
| Authentication | ADC reauthenticated with local gcloud CLI; no credential values recorded |
| Location/Region/District counts | 50 / 2 / 3 |
| Location lifecycle totals | Active 50; Draft 0; Retired 0 |
| Source application | `1745917` (branch head after fetch) |

The prior CSV/screenshot observations were treated as historical leads only. The live snapshot confirms Store 150 has `DIS-01` with no resolved name, but the live registry now supplies the exact comparison: legacy text matches District `02`; this remains a proposal, not a repair.

## Proposed mapping

The review CSV contains one row for every authoritative Location and is explicitly **not import-ready**. Classification totals are: `CanonicalConflict` 1, `UnknownApplicability` 49, total 50. There are no approved assignments. The read-only generator emits `Current*` and `Proposed*` fields without invoking business-record writes. Missing Location versions are represented as `0`, explicitly distinguishing legacy missing versions from observed positive versions.

The intended row contract, once read access is restored, is documented in [the review CSV](dispatch-12a-district-reconciliation-review.csv). Each Location must appear exactly once and retain Store Number and IDs as text. The future classification set is: `AlreadyValid`, `UniqueNameCandidate`, `AmbiguousCandidate`, `MissingReference`, `RetiredReference`, `ParentMismatch`, `CanonicalConflict`, `NonApplicable`, and `Unassigned`.

### Store 150

The authoritative record is `loc-150`, Store Number `150`, `Broadway LA`, type `Street / Standalone Location`, Active, version `5`, updated `2026-09-13T00:02:04.064Z`, and `HierarchyApplicability=Applicable`. It has Region `region-west` / `West`, `districtId=DIS-01`, no resolved District, and legacy text `Inland Empire, San Diego & LA South`. `DIS-01` does not exist in the live registry. The legacy text exactly matches the single Active District `02`, `Inland Empire, San Diego & LA South`, under Active Region `region-west` / `West`.

Review status: **CanonicalConflict**. Proposed candidate: Region `region-west` / `West`, District `02` / `Inland Empire, San Diego & LA South`. Do not convert `DIS-01` to `01`; the proposal requires Theo to confirm that District `02` is the owner's intended assignment before any write.

## Repository impact matrix

| Surface | Verified repository finding | Proposed bounded change | Current decision |
|---|---|---|---|
| Canonical Location hierarchy | `DistrictId` is resolved against registry data for read/export surfaces | Keep `DistrictId` as the source of truth; reconcile only after approval | No change in this pass |
| Export/reporting | `DistrictId`, `DistrictName`, and legacy `District` are emitted together | Keep all headers during a separately approved compatibility transition; flag discrepancies | No change in this pass |
| Person update | `DirectoryContext.updatePerson` copies Person territory text into Location legacy `district` | Stop this copy or make it an explicitly reviewed legacy compatibility operation; never infer a canonical ID | Theo approval required |
| Fleet Quick Add | Default legacy district text is saved without canonical references | Replace default-only behavior with an explicit unassigned state and canonical registry selection in a future patch | Theo approval required |
| API consumers | Existing location read/export surfaces expose canonical and legacy meanings | Publish a transition contract, telemetry/consumer inventory, and deprecation timeline before changing headers/semantics | NOT VERIFIED externally |
| CSV consumers | Existing CSV workflows use the legacy `District` header in addition to canonical fields | Preserve current header and meaning until consumer evidence and acceptance tests exist | NOT VERIFIED externally |
| Database readers/jobs/integrations | No repository evidence establishes the complete external set | Contact owners and inspect logs/configuration with authorized read-only access | NOT VERIFIED |
| Rollback | Application rollback alone cannot reverse database writes | Capture before/after Location documents and version/receipt evidence for any approved repair; restore exact prior values through an approved write plan | Theo approval required |

## Proposed implementation and compatibility transition

This review does not implement either correction. A later approved patch should:

1. Make Person territory changes update the Person record only, or require an explicit reviewed legacy-sync action. It must not manufacture `DistrictId` from text.
2. Make Fleet Quick Add require a canonical registry selection for hierarchy-applicable Locations, or save an explicit unassigned state with no guessed legacy value.
3. Keep `DistrictId` and registry-resolved `DistrictName` authoritative. Preserve `District` and existing API/CSV behavior until external consumers are identified and the transition is approved.
4. Add tests for both writers, canonical-vs-legacy discrepancies, missing/retired references, parent mismatches, leading-zero IDs, non-applicable records, and Store 150's approved outcome.
5. Before any data write, generate a complete before/after evidence set keyed by Location ID and version, obtain owner approval, and define a reversible restore operation. Traffic rollback does not reverse database writes.

## Acceptance tests for a future approved change

- Read-only reconciliation reads one consistent snapshot of all three collections and reports Active, Draft, and Retired Locations separately.
- Every Location appears exactly once; totals reconcile across classifications.
- Store Numbers and IDs remain exact text, including leading zeros and case.
- Only an exactly-one active District-name match with an active parent Region may be labeled a candidate, never an automatic assignment.
- Missing, retired, duplicate, ambiguous, parent-mismatched, canonical-conflict, non-applicable, and unassigned records remain visibly unresolved.
- Store 150 is reviewed against its live record and the owner's explicit decision; `DIS-01` is never converted to `01` by formatting.
- Report generation performs no commit, import confirmation, repair, migration, audit receipt, or other business-record write.
- Person updates do not silently copy free-text territory into canonical hierarchy fields.
- Fleet Quick Add does not invent a legacy district default without a canonical reference or explicit unassigned state.
- Existing API and CSV consumers continue to receive the current fields during the approved compatibility period.

## Validation

- PASS: fetched and fast-forwarded to the latest remote branch while preserving the unrelated runbook modification.
- PASS: confirmed configured project and named database from repository configuration.
- PASS: confirmed source evidence for both legacy write paths and the three export fields.
- PASS: no write-capable application path, import confirmation, database repair, deployment, merge, or browser automation was invoked.
- PASS: authoritative count reconciliation: 50 Location rows are represented once in the CSV; 1 `CanonicalConflict` plus 49 `UnknownApplicability` equals 50.
- PASS: live registry/reference check: Store 150's `DIS-01` is missing; legacy text has exactly one active name candidate (`02`) with an active parent Region.
- PASS: IDs and Store Numbers are emitted as text in the review CSV, preserving `150`, `02`, and `03` exactly.
- PASS: `scripts/dispatch12aReconciliation.ts` performs only collection reads and stdout generation; no commit, import confirmation, repair, audit receipt, or business-record write is invoked.
- PASS: focused TypeScript validation (`npx tsc --noEmit`) and generator execution; CSV has 51 lines including header.
- NOT RUN: full application API/build suite, because the executable helper is a read-only review utility and no application runtime code changed.

## Decisions requiring Theo's approval

1. Confirm Store 150's intended District is `02` or provide another owner-approved District; do not infer from `DIS-01`, `01`, or the historical screenshot.
2. Decide applicability for the 49 Locations with missing `HierarchyApplicability` before any hierarchy assignment proposal is converted to a write.
3. Approve the future correction of the Person territory copy and Fleet Quick Add default, including the desired explicit-unassigned behavior.
4. Identify and approve contact/verification for external API, CSV, scheduled-job, integration, and direct-database consumers before compatibility changes.
5. Approve any future write plan only after before/after evidence, version checks, and a database-level reversal procedure are prepared.

District reconciliation proposal ready for approval. No live assignments were changed.

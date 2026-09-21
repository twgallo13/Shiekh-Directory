# Dispatch 12A District Assignment Reconciliation

Status: **Authoritative proposal complete; assignment changes remain blocked pending approval**

This is a read-only review. No Location, Region, or District assignment was changed. No compatibility field was removed or repurposed, and no import, repair, migration, deployment, merge, or browser automation was run.

## Confirmed facts

- Branch was fast-forwarded to `1745917` from `origin/feat/dispatch-12-hierarchy-registry-api`. The pre-existing unrelated edit to `docs/cloud-run-deployment-runbook.md` remains local and is not part of this report.
- The configured authoritative identity is project `gen-lang-client-0801664258` and named Firestore database `ai-studio-shiekhlocationco-00e1a479-af25-4ab6-9565-5c8b804c56a4`, as defined in `server/firestoreLocations.ts`.
- A consistent read-only snapshot was taken from the `locations`, `regions`, and `districts` collections after ADC reauthentication, using the configured identity and named database. Snapshot time: `2026-09-21T02:01:21.367Z`.
- The authoritative snapshot contains 50 Active Locations, 2 Active Regions, and 3 Active Districts. The current application contract makes missing applicability effective `Applicable` for recognized retail types; non-retail records default to `Not Applicable` when no references exist. The corrected classifications are 47 `UniqueNameCandidate`, 1 `MissingReference`, and 2 `NonApplicable`.
- The application contract distinguishes canonical `DistrictId`, registry-resolved `DistrictName`, and legacy copied `District`. `server/locationExport.ts` emits all three fields and preserves the legacy field pending an approved transition.
- `DirectoryContext.updatePerson` includes `district` in leadership fields copied from a Person update and writes that free text to affected Location records when the person is a district manager. This is a verified legacy write path.
- Fleet Quick Add in `src/components/admin/AdminIntegrationsView.tsx` initializes the form with `District 1 — Northern CA` and saves the form's `district` value while supplying no canonical Region/District references. This is a second verified legacy write path.
- Repository evidence cannot verify external applications, scheduled jobs, direct database readers, or downstream exports outside this repository. Those consumers remain **NOT VERIFIED**.
- The active registry contains Regions `region-west` (`West`) and `region-Central` (`Central`), plus Districts `01`, `02`, and `03`, all Active and parented to `region-west`.
- The helper preserves Firestore document IDs as authoritative, records conflicting embedded IDs as blockers, and reads all three collections inside one read-only Firestore transaction. Read wall-clock interval was `2026-09-21T02:19:07.569Z` to `2026-09-21T02:19:09.002Z`; the interval is not represented as a database generation timestamp.

## Snapshot provenance and limits

| Item | Result |
|---|---|
| Source project | `gen-lang-client-0801664258` |
| Source database | `ai-studio-shiekhlocationco-00e1a479-af25-4ab6-9565-5c8b804c56a4` |
| Requested source collections | `locations`, `regions`, `districts` |
| Access mode | Read-only Firestore SDK reads |
| Snapshot result | PASS; read-only records returned in one transaction |
| Authentication | ADC reauthenticated with local gcloud CLI; no credential values recorded |
| Location/Region/District counts | 50 / 2 / 3 |
| Location lifecycle totals | Active 50; Draft 0; Retired 0 |
| Review helper source | `44d5119eb5a04a4ddbad38c1e21d045c3dd7fec1` |
| Application baseline | `e74e57c1a4ebb6cb553dca109b3355832282c6dc` |

The prior CSV/screenshot observations were treated as historical leads only. The live snapshot confirms Store 150 has `DIS-01` with no resolved name, but the live registry now supplies the exact comparison: legacy text matches District `02`; this remains a proposal, not a repair.

## Proposed mapping

The review CSV contains one row for every authoritative Location and is explicitly **not import-ready**. Classification totals are: `UniqueNameCandidate` 47, `MissingReference` 1, `NonApplicable` 2, total 50. There are no approved assignments. The read-only generator emits `Current*` and `Proposed*` fields without invoking business-record writes. Missing Location versions remain blank with `CurrentVersionPresent=false`, while `EffectiveConcurrencyVersion=0` records the application fallback; explicit zero remains present and distinct.

The row contract is documented in [the review CSV](dispatch-12a-district-reconciliation-review.csv). Each Location appears exactly once and retains Store Number and IDs as text. The classifier distinguishes `AlreadyValid`, `UniqueNameCandidate`, `AmbiguousCandidate`, `MissingReference`, `RetiredReference`, `ParentMismatch`, `IdentityConflict`, `InvalidApplicability`, `NonApplicable`, and `Unassigned`.

### Grouped candidate table

These are exact trimmed/case-normalized legacy-name matches to one Active District with an Active parent. They are review candidates only; no assignment is approved. Store numbers are shown as text.

| Proposed District | Candidate stores | Count |
|---|---|---:|
| `01` Central & Southern California | 103, 11, 14, 17, 21, 32, 33, 36, 37, 38, 53, 57, 59, 97 | 14 |
| `02` Inland Empire, San Diego & LA South | 105, 116, 143, 146, 29, 34, 35, 48, 52, 82, 87 | 11 |
| `03` Northern California, Nevada, Northwest & Texas | 07, 09, 108, 115, 118, 119, 120, 131, 133, 15, 19, 23, 25, 42, 47, 51, 61, 73, 91, 92, 95, 98 | 22 |

The 47 candidates have missing saved applicability but effective `Applicable` behavior because their types are recognized retail types. They still require owner approval before any write.

### Store 150

The authoritative record is `loc-150`, Store Number `150`, `Broadway LA`, type `Street / Standalone Location`, Active, version `5`, updated `2026-09-13T00:02:04.064Z`, and `HierarchyApplicability=Applicable`. It has Region `region-west` / `West`, `districtId=DIS-01`, no resolved District, and legacy text `Inland Empire, San Diego & LA South`. `DIS-01` does not exist in the live registry. The legacy text exactly matches the single Active District `02`, `Inland Empire, San Diego & LA South`, under Active Region `region-west` / `West`.

Review status: **MissingReference** with an exact-name proposal. Proposed candidate: Region `region-west` / `West`, District `02` / `Inland Empire, San Diego & LA South`. Do not convert `DIS-01` to `01`; the proposal requires Theo to confirm that District `02` is the owner's intended assignment before any write.

### Other unresolved decisions

- Ecommerce / Store `001` (`Warehouse / Distribution Center`) and Store `86` (`Other Company Location`) are effectively `Not Applicable` under the current contract because they have no controlled hierarchy references. Theo must confirm whether either record should remain outside the hierarchy or receive an explicit business-approved applicability and assignment.
- No ambiguous-name, retired-reference, parent-mismatch, valid-canonical-conflict, or identity-conflict rows occurred in this snapshot; the helper and fixture tests cover those classifications for future snapshots.

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
- PASS: authoritative count reconciliation: 50 Location rows are represented once in the CSV; 47 `UniqueNameCandidate` + 1 `MissingReference` + 2 `NonApplicable` equals 50.
- PASS: live registry/reference check: Store 150's `DIS-01` is missing; legacy text has exactly one active name candidate (`02`) with an active parent Region.
- PASS: IDs, Store Numbers, embedded/document IDs, raw version presence, and leading-zero values are preserved in the review CSV.
- PASS: `scripts/dispatch12aReconciliation.ts` performs only three collection reads inside one read-only transaction and stdout generation; no commit, import confirmation, repair, audit receipt, or business-record write is invoked.
- PASS: focused helper tests: `node --import tsx --test test/dispatch12aReconciliation.test.ts` (11 passed).
- PASS: `npx tsc --noEmit --pretty false`.
- NOT RUN: full API suite and production build after this amendment; run before delivery.

## Decisions requiring Theo's approval

1. Confirm Store 150's intended District is `02` or provide another owner-approved District; do not infer from `DIS-01`, `01`, or the historical screenshot.
2. Approve or reject the 47 grouped exact-name candidates, including whether missing retail applicability may remain implicitly Applicable or must be explicitly saved.
3. Decide whether Ecommerce `001` and Other Company Location `86` remain outside the hierarchy or need explicit applicability and assignment.
4. Approve the future correction of the Person territory copy and Fleet Quick Add default, including the desired explicit-unassigned behavior.
5. Identify and approve contact/verification for external API, CSV, scheduled-job, integration, and direct-database consumers before compatibility changes.
6. Approve any future write plan only after before/after evidence, version checks, and a database-level reversal procedure are prepared.

District reconciliation proposal was ready for approval. Theo's subsequent approved mapping and execution planning are recorded in [Dispatch 12B](../dispatch-12b-approved-hierarchy-update-plan.md) and [the exact update plan](dispatch-12b-update-plan.md). No live assignments were changed by Dispatch 12A.


## Owner clarification and review follow-up — 2026-09-21

This section records Theo's latest business clarification and supersedes the pending Store 150 decision above. It does not change the captured snapshot, generated review CSV, or any application record.

### Confirmed by Theo

- Store `150` belongs to District `02`, Inland Empire, San Diego & LA South (whose current registry parent is `region-west`). The intended District is approved. Execution of a data repair remains subject to the bounded write/reversal plan required by this dispatch.
- Location `001` is the Ecommerce fulfillment center and has no District.
- Location described by Theo as `086` is the returns center and likewise has no District. The reviewed source record is `loc-86`, with Store Number `86`; this clarification does not authorize renumbering it to `086`.

### Recommended representation for the two centers

Keep both as Active company Locations outside the retail Region/District hierarchy. In a future reviewed change, explicitly represent retail hierarchy applicability as `Not Applicable`, with no canonical Region or District reference. This agrees with their currently effective application behavior and the owner's stated absence of a District; no placeholder District or ID such as `00`, `N/A`, or `Unassigned` should be created.

Location `001` already has type `Warehouse / Distribution Center`. Recommend that type for the returns center as well, with a clear business name identifying its returns function; its current type is `Other Company Location` and its saved name is blank. This is a recommendation, not an approved rename or type update.

Retain each existing Location identity, status, contact information, People relationships, and operational ownership. Lack of a retail District must not mean that the location is inactive, deleted, or excluded from the directory. The API/CSV contract and consuming apps should distinguish intentional non-applicability from an applicable retail store with a missing assignment. Preserve existing field/empty-value conventions until a reviewed compatibility change specifies otherwise.

The review CSV's legacy-name candidate `01` for `loc-86` is not an approved assignment. The owner's clarification says this center has no District. Preserve the original evidence; flag the copied legacy District text for the later approved compatibility cleanup rather than assigning the center from that text.

### Still pending

- Owner approval of the 47 grouped retail candidates.
- The bounded repair plan, current version checks, before/after evidence, and data reversal procedure.
- Implementation approval for legacy write-path corrections and compatibility changes.
- External-consumer verification remains NOT VERIFIED.

### Evidence correction still needed before closing the investigation

At reviewed commit `4085ebbf4d8c9b8efdc79d936e39bae0c3efcfa3`, the Validation section still says the full API suite and production build were NOT RUN after the amendment, while Copilot's delivery summary reports passes. Reconcile the committed report with actual execution evidence and exact tested source state. Do not infer a pass or rerun tests solely to manufacture consistency if existing verifiable results are available.

Documentation only: no live data, application behavior, import, repair, deployment, or merge is authorized or performed by this update.

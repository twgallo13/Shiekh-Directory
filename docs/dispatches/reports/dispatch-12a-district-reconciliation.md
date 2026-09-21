# Dispatch 12A District Assignment Reconciliation

Status: **BLOCKED for authoritative mapping; repository impact review complete**

This is a read-only review. No Location, Region, or District assignment was changed. No compatibility field was removed or repurposed, and no import, repair, migration, deployment, merge, or browser automation was run.

## Confirmed facts

- Branch was fast-forwarded to `1745917` from `origin/feat/dispatch-12-hierarchy-registry-api`. The pre-existing unrelated edit to `docs/cloud-run-deployment-runbook.md` remains local and is not part of this report.
- The configured authoritative identity is project `gen-lang-client-0801664258` and named Firestore database `ai-studio-shiekhlocationco-00e1a479-af25-4ab6-9565-5c8b804c56a4`, as defined in `server/firestoreLocations.ts`.
- The required read was attempted against the `locations`, `regions`, and `districts` collections using the configured identity and named database. Application-default credential resolution failed before any snapshot was returned with Google OAuth `invalid_grant`, subtype `invalid_rapt` (reauthentication required).
- Therefore current authoritative counts, records, registry statuses, Store 150 contents, and a current store-by-store mapping are unavailable. No old CSV, screenshot, seed data, or inferred numeric ID was used as a current mapping.
- The application contract distinguishes canonical `DistrictId`, registry-resolved `DistrictName`, and legacy copied `District`. `server/locationExport.ts` emits all three fields and preserves the legacy field pending an approved transition.
- `DirectoryContext.updatePerson` includes `district` in leadership fields copied from a Person update and writes that free text to affected Location records when the person is a district manager. This is a verified legacy write path.
- Fleet Quick Add in `src/components/admin/AdminIntegrationsView.tsx` initializes the form with `District 1 — Northern CA` and saves the form's `district` value while supplying no canonical Region/District references. This is a second verified legacy write path.
- Repository evidence cannot verify external applications, scheduled jobs, direct database readers, or downstream exports outside this repository. Those consumers remain **NOT VERIFIED**.

## Snapshot provenance and limits

| Item | Result |
|---|---|
| Source project | `gen-lang-client-0801664258` |
| Source database | `ai-studio-shiekhlocationco-00e1a479-af25-4ab6-9565-5c8b804c56a4` |
| Requested source collections | `locations`, `regions`, `districts` |
| Access mode | Read-only Firestore SDK reads |
| Snapshot result | BLOCKED before records returned |
| Access error | `invalid_grant`, `invalid_rapt` during metadata/plugin credential resolution |
| Location/Region/District counts | NOT AVAILABLE |
| Source application | `1745917` (branch head after fetch) |

The prior 50-row CSV/screenshot observations remain historical leads only: 48 rows with legacy District text and no District ID, one unassigned warehouse, and Store 150 showing `DIS-01` with no resolved name. They are not reproduced as current records here.

## Proposed mapping

No authoritative Location records were returned, so there are no mapping rows and no classification totals. The review CSV is intentionally header-only and **not import-ready**. Producing rows from the prior CSV, screenshot, seed data, name guesses, or numeric conversion would violate Dispatch 12A.

The intended row contract, once read access is restored, is documented in [the review CSV](dispatch-12a-district-reconciliation-review.csv). Each Location must appear exactly once and retain Store Number and IDs as text. The future classification set is: `AlreadyValid`, `UniqueNameCandidate`, `AmbiguousCandidate`, `MissingReference`, `RetiredReference`, `ParentMismatch`, `CanonicalConflict`, `NonApplicable`, and `Unassigned`.

### Store 150

Store 150 could not be inspected because the authoritative Location read was blocked. The historical `DIS-01` observation is not enough to establish whether that value is a canonical District ID, legacy text, or malformed data. Do not convert it to `01`. The prior screenshot association with District `02` is also only an unapproved lead. Theo must confirm the owner's intended District after the live record, registry records, parent Region, and status are available.

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
- PASS: review CSV contains headers only and no fabricated Location rows.
- NOT RUN: authoritative count reconciliation, duplicate/reference/parent validation, Store 150 inspection, and complete mapping classification; blocked by credential reauthentication failure.
- NOT RUN: application lint/API/build tests, because this change is documentation/report-only and no executable code was added.

## Decisions requiring Theo's approval

1. Provide or authorize refreshed application-default credentials with read-only access to the configured project/database, then rerun the snapshot.
2. Confirm Store 150's intended District after inspecting its authoritative record and the active registry; do not infer from `DIS-01`, `01`, or the historical screenshot.
3. Approve the future correction of the Person territory copy and Fleet Quick Add default, including the desired explicit-unassigned behavior.
4. Identify and approve contact/verification for external API, CSV, scheduled-job, integration, and direct-database consumers before compatibility changes.
5. Approve any future write plan only after before/after evidence, version checks, and a database-level reversal procedure are prepared.

District reconciliation proposal is **not ready for approval** because the authoritative snapshot is blocked. The repository impact review is ready for Theo's decisions above.

# Dispatch 12B — Approved District Mapping and Safe Update Plan

Status: Approved to prepare the concrete implementation and data-update plan. No application implementation or live writes are authorized in this dispatch.

## Business objective

Complete the move to trusted District IDs and registry-resolved names for retail stores while keeping the fulfillment and returns centers outside retail district reporting. Prepare one reviewable plan that prevents conflicting legacy writes and preserves API/CSV consumers.

## Readiness and source evidence

- Repository: twgallo13/Shiekh-Directory.
- Continue on feat/dispatch-12-hierarchy-registry-api, open draft PR #10, based on dispatch-11-flexible-location-csv.
- Repository head checked before this dispatch: fa012bbc1839ffeba687fa47a596a3f8481edd43.
- Read Dispatch 12, Dispatch 12A and its amendment, and docs/dispatches/reports/dispatch-12a-district-reconciliation.md plus the accompanying review CSV.
- The reviewed application baseline is e74e57c1a4ebb6cb553dca109b3355832282c6dc; reconciliation delivery was 4085ebbf4d8c9b8efdc79d936e39bae0c3efcfa3. Distinguish documentation, helper, and deployed application commits.
- Fetch current refs and inspect local instructions and worktree. Preserve the unrelated docs/cloud-run-deployment-runbook.md edit. Do not reset, include, or discard it. Do not merge, retarget, or rebase dependent PRs.
- Existing source findings were reconfirmed: DirectoryContext.updatePerson copies Person district text into Locations; AdminIntegrationsView Fleet Quick Add defaults to District 1 — Northern CA; locationImportConfirmation limits changes to 40 rows per confirmation.
- The September 20 directory PDF supplied by Theo was compared row by row with the proposal: all 14 District 01 candidates list David Castro; all 12 District 02 stores including 150 list Karlo Llovido; all 22 District 03 candidates list Rudy Calderon. This corroborates the grouping but does not independently prove District IDs or Region ownership. Do not infer future assignments from manager names.

## Approved business decisions

Theo approved proceeding after reviewing the grouped mappings and PDF comparison. This supersedes the earlier pending business-assignment decisions, while preserving the live-execution review gate.

| District ID | Name | Approved Store Numbers | Count |
|---|---|---|---:|
| 01 | Central & Southern California | 103, 11, 14, 17, 21, 32, 33, 36, 37, 38, 53, 57, 59, 97 | 14 |
| 02 | Inland Empire, San Diego & LA South | 105, 116, 143, 146, 29, 34, 35, 48, 52, 82, 87, 150 | 12 |
| 03 | Northern California, Nevada, Northwest & Texas | 07, 09, 108, 115, 118, 119, 120, 131, 133, 15, 19, 23, 25, 42, 47, 51, 61, 73, 91, 92, 95, 98 | 22 |

The expected reviewed roster is 48 retail stores and 2 centers. District IDs remain exact strings. Resolve approved rows to the existing document IDs from the reviewed CSV; never create records or match by manager/name/guessed prefixes. All three Districts currently have parent region-west; verify that parent before proposing its use. Unexpected changes in registry ownership require review, not automatic substitution.

- Store 150: replace invalid DIS-01 with approved District 02 in the proposed plan.
- Ecommerce 001: fulfillment center; no retail District.
- Location 86: returns center; no retail District. Preserve stored Store Number 86 and document identity; do not renumber to 086.
- Represent the two centers as Not Applicable to retail hierarchy, retaining Active status and existing People/leadership relationships. Include explicit applicability in the proposed diff; do not create placeholder Districts.
- Proposed retail applicability is explicit Applicable. Show this field change alongside the hierarchy assignments.
- Include a separately identified proposed change for loc-86: blank name to Returns Center and type to Warehouse / Distribution Center. These exact values must be visible in the final plan before execution; do not treat the center's existing legacy District 01 name candidate as an assignment.
- Preserve Ecommerce's current name/type and current operational ownership, including Theo's existing relationship. Do not invent a new operational-manager role or reinterpret District Manager assignments in this pass.

## Deliverable 1 — exact update and recovery plan

Prepare docs/dispatches/reports/dispatch-12b-update-plan.md and a review-only field-level manifest at docs/dispatches/reports/dispatch-12b-proposed-changes.csv.

1. Obtain a fresh consistent read-only snapshot from the verified named database. Reuse the corrected 12A reader. Report drift from the approved inventory; do not silently add records to scope, adopt changed assignments, or approve newly matched rows.
2. For every scoped Location show document ID, exact Store Number, raw version presence/value, effective concurrency version, current values, proposed values, reason, and approval basis. Represent omitted/null/empty distinctly. Include unchanged rows explicitly and reconcile counts.
3. Allow hierarchy fields and the explicitly listed loc-86 name/type proposal only. Preserve contact data, People links, leadership, hours, custom fields, lifecycle status, and other attributes. Preserve legacy district values for compatibility during this initial update; prominently record loc-86's contradictory copied text as a deferred compatibility issue.
4. Inspect actual server/manual-save/import validation. Identify a supported execution path that preserves authorization, update-only existence intent, version checks, final-state relationship validation, audit before/after evidence, and retry safety. Do not bypass validation because legacy fields or unrelated defects exist.
5. Do not claim the entire change is atomic if it requires multiple transactions. If using CSV confirmation, retain the current 40-changed-row limit and document deterministic batch membership, fresh preview/confirmation for each batch, token expiry, verification between batches, and what happens if a later batch fails. Identify fields the existing CSV cannot express; do not implement clearing or expand limits to accommodate this task.
6. Specify backup capture immediately before writes, exact payload approval/checksum, post-write readback, audit/receipt correlation, stale rejection, uncertain-response retry handling, and stop conditions. No new apply-capable helper in this planning pass.
7. Define data recovery for completed batches without overwriting later legitimate edits. Restore business fields with current version checks and new audit/version history; do not reset versions/timestamps or blindly restore entire old documents. State any limitations restoring absent fields or invalid historical references and identify the approved recovery mechanism needed. Traffic rollback does not reverse database changes.
8. Full backups or sensitive fields must stay in approved access-controlled storage; commit only the minimal review manifest and evidence references. Do not publish credentials or private contact details.

## Deliverable 2 — bounded application correction plan

Document exact files, proposed behavior, dependencies, and tests; do not implement runtime changes yet.

- Person edits: stop copying Person free-text district into Location district. Preserve other existing leadership/contact reconciliation and Person territory behavior; no global removal of Person.district.
- Fleet Quick Add: remove guessed district defaults; reuse existing canonical Region/District selection behavior and server validation. Permit a deliberate unassigned applicable Location with clear guidance where the existing contract permits it; do not manufacture a relationship. Non-retail centers may be explicitly Not Applicable. Preserve current role/scope restrictions.
- Print/reporting: propose 48 retail stores + 2 operational centers for the reviewed inventory, calculated from actual records rather than hard-coded. Distinguish intentionally non-applicable centers from retail records missing assignments. Preserve ownership links; identify the existing District Manager label on Ecommerce as a separate future UX decision, not permission to remap its manager.
- API/CSV: retain DistrictId and registry-resolved DistrictName; retain legacy District/district fields and meanings until a separately reviewed compatibility transition. Do not delete DistrictName or treat legacy text as an ID. Document how non-applicability is exposed today and any consumer gap without changing contracts in this pass.
- Inventory the affected database readers/writers, Location/People UI, registry administration, directory API and version/cache behavior, CSV preview/confirmation and both exports, dashboard, print, requests, jobs, workflows, and integrations. Cite source paths and classify changed, verified unaffected, or NOT VERIFIED. External consumers remain unverified unless evidence establishes otherwise; do not contact owners automatically.

## Cross-system completeness amendment — verified before handoff

This section adds concrete coverage to Deliverable 2. It does not authorize implementation or live writes. Do not label the cleanup complete solely because Location documents have the intended IDs.

### Verified gap: non-applicability is not exposed consistently

At the reviewed source:
- `src/lib/locationImportSchema.ts` includes writable `HierarchyApplicability`; the editing export is generated from that shared schema.
- `server/locationExport.ts` reporting CSV headers include Region/District IDs and names and legacy District, but omit HierarchyApplicability.
- `server/firestoreLocations.ts` public field selection omits hierarchyApplicability; `server/directoryApi.ts` public mapping also omits it.
- `src/lib/hierarchyResolution.ts` only receives hierarchy IDs and reports no IDs as unassigned; `hierarchyDistrictLabel` labels them Unassigned District.
- `src/components/export/PrintSheetView.tsx` uses those labels for grouping/filtering and describes every displayed Location as a Store.

Therefore a data-only update will not make intentionally non-retail centers distinguishable from missing retail assignments on all surfaces. The plan must specify a minimal additive applicability contract for API/reporting export and applicable UI projections, or identify that part as blocked. Preserve existing hierarchyStatus values and legacy fields unless an explicit compatibility decision approves a change; do not silently redefine unassigned. Show exact proposed field names, allowed values, saved-versus-effective rules, missing/Unknown behavior, examples, and schema/documentation implications.

### Required impact and acceptance matrix

For each row below, identify exact source paths, present behavior, proposed change or verified-unaffected reason, test evidence, and any external owner/verification gap. Use the same scoped sample Locations across surfaces, including one per District, 150, 001, and 86, plus an invalid-reference fixture.

| Surface | Required plan and acceptance coverage |
|---|---|
| Direct database/system access | Trace named-database reads/writes, document IDs, registry IDs, versions, audit receipts, seed/bootstrap paths, and scripts/migrateFirestoreFromCsv.ts. Registry name remains stored once on its District record; a Location relationship uses districtId. Document how direct readers must resolve names and how direct writers can bypass application validation. Do not migrate raw records, alter security rules, or run seed/migration scripts in this pass. |
| Manual edits and administration | Location create/edit, Fleet Quick Add, Person edits, and Registry edit/retire must preserve canonical relationships and unaffected contacts. Test omission versus explicit clearing through existing manual-save semantics, stale draft refresh, dependent records, retired references, and no reintroduction of legacy defaults. Do not broaden CSV clearing support. |
| CSV templates, reference downloads, mapping, preview | Keep schema, field dictionary, guidance, aliases, examples, and references consistent. DistrictId is the writable relationship; DistrictName and legacy District are informational and cannot assign a district. Check partial columns, leading zeros, ignored columns, update-only identity, invalid/retired references, wrong parents, centers, and exact normalized before/after values. |
| CSV confirmation, results, correction files | Preserve selected-row authorization, signature/token binding, warning acknowledgement, revalidation, transaction receipts, stale rejection, and retry protection. Keep 40-change limit and report separate batch outcomes accurately. Results and correction files must retain IDs and correct row/field explanations without leaking unauthorized data. |
| Reporting export versus editing export | Specify both contracts separately, including any proposed additive applicability field. Export all authorized scoped rows without miscounting centers as stores or silently removing them. Editing export immediately re-previewed against unchanged data must yield unchanged rows or existing explicit diagnostics, never silent rewrites. Test supported edits after re-import. Reporting exports retain informational fields and are not full backups; preserve unsupported fields in subsequent updates. Maintain spreadsheet-safe reversible encoding and leading-zero IDs. |
| Directory API and synchronization | Inspect list and single-record responses, Firestore selected fields, authentication/scope, public contact privacy, nullable IDs/names, applicability, error states, and schema documentation. Test assignment updates through updatedAt/full/delta reads; registry renames through hierarchyVersion, ETag, stale cursor rejection and full reconciliation. Do not claim registry renames rewrite Location timestamps. A scorecard consumer must join stable IDs, handle intentional non-applicability, and never derive identity from a display label. |
| 1-Sheet Directory PDF | Inspect PrintSheetView and the actual browser print output. Propose separate Operational Centers (no retail district) and Unassigned Retail Locations groups; preserve explicit unresolved/retired/mismatch warnings. Update displayed/filtered totals, district filters, title/description, group labels and empty states consistently. Group retail records by stable district identity so a rename does not strand a filter. Keep contacts/manager links, privacy and scope behavior; do not create a district-level manager assignment from uniform per-store names. Preserve readable landscape printing and page breaks without promising every possible roster fits one page. Theo verifies generated PDF manually; no browser automation in this pass. |
| Other UI, requests, and integrations | Verify Location list/detail/search, dashboard totals, People Works at/Supports, registry/reference selection, pending correction approvals, and exports after refresh/consecutive saves. Trace mail/jobs/reports/workflows and external scorecard consumers where evidence exists. Preserve pending request conflict checks. List unavailable consumers as NOT VERIFIED with exact contract checks needed; do not assume absent repository code means no downstream dependency. |

### Concrete acceptance samples and completion boundary

- Under the approved full roster, the intended business totals are 14/12/22 retail stores across Districts 01/02/03 plus 2 operational centers. Filtered/scope-limited views must calculate their own totals, not display company-wide counts.
- Store 150 resolves to District 02 and its registry name; no formatting-based DIS-01 conversion.
- Centers 001/86 remain Active and findable, have no canonical retail Region/District assignments, and are distinguishable from unassigned retail stores on every proposed updated surface. Their existing manager/People links remain unchanged.
- Retain loc-86's legacy district as historical compatibility data for now and explicitly explain that it is not the center's canonical assignment. Until legacy consumers transition, record this inconsistency as a known limitation; do not claim all consumers now agree.
- Identify the later deployment/data-update ordering and verify the same approved manifest through database readback, API, both CSV exports, UI, and PDF. Freeze a common verification snapshot or explain legitimate intervening changes; compare values by record ID.
- Provide separate statuses for plan completeness, implementation readiness, live data verification, and external-consumer verification. This dispatch ends with a reviewable plan, not a claim that the system-wide cleanup has already shipped.

## Validation and acceptance

- Approved mapping reconciles to District 01: 14, District 02: 12, District 03: 22, plus 2 centers, subject to explicit reporting of current drift.
- IDs, leading zeros, existing record identity, saved version absence, and exact changed fields are preserved in the manifest.
- No district is assigned to either center; no manager/Person record is changed.
- The plan includes tests for stale records/registry changes, batch failure, retries, invalid/retired references, unrelated legacy defects, both legacy writer fixes, rename visibility, API/CSV compatibility, non-applicable centers, and no-write preparation.
- Resolve the existing report discrepancy: delivery summary claims API/build passes, but the committed report says NOT RUN. Record actual commands/counts/tested source and evidence; use available verifiable results or run the missing required checks. Do not fabricate historical results.
- Documentation-only updates require manifest/count verification and diff-check. If a scoped read-only helper changes, add focused tests and run lint/typecheck, full API tests, build, and diff-check. No Playwright troubleshooting or browser automation; Theo owns manual QA.
- Identify a practical execution/deployment order for the later approved work. Existing approvals do not authorize deployment or data execution in this pass.

## Return and stop point

Commit and push only the plan, manifest, necessary read-only helper/tests, and evidence corrections. Update PR #10 with links and keep it draft on the same base. Update the 12A report's decision status to reference this dispatch without altering the historical snapshot.

Return the SHA, file list/purposes, exact change totals, intended batch boundaries, recovery limits, verification PASS/FAIL/NOT RUN, and any genuinely unresolved decisions.

Finish: "Approved mapping recorded; exact update plan ready for review."

Do not execute live writes, imports, repairs, migrations, new endpoints, application implementation, compatibility cutover, merge, deployment, secret/configuration changes, or People CSV work.

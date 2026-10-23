# Dispatch 28 — Read-only promotion/offboarding dependency preflight

## Scope and status

Owner-approved P3.1 continuation from clean documentation main `28f2b86`, after deployed PR #45 (`1b122fe`). Branch `codex/person-transition-preflight`. Review/publication are separate gates; do not assume this screen is live without a release checkpoint. Tracking [issue 36](https://github.com/twgallo13/Shiekh-Directory/issues/36) remains open for the independent authenticated API-consumer acceptance gate.

## Source audit and bounded implementation

- `personProfileImpact.ts` provides canonical District ownership and Location-owned responsibilities, including retired/zero-store Districts and stale-copy warnings. `personLocationRelationships.ts` separates workplace/support from leadership, including unresolved Locations. Existing `PersonDetailModal.tsx` and `PersonEditorForm.tsx` block unsafe lifecycle/position edits; they do not provide a coordinated handover command.
- Server `firestoreDirectory.ts` final-state guards validate referenced Person lifecycle and every linked User record before inactivation/deletion, including non-active accounts. District-owned retail DM copies are not independent authority. `districtLeadership.ts` separately blocks leaving a District owner inactive/missing and protects District/store membership copies. This preflight does not change those validators, permissions or account unlink semantics.
- Add an administrator/steward-only disclosure on the Person detail card: **Review promotion / offboarding**. Reuse canonical helpers; group current responsibilities, inherited stores versus conflicting historical DM copies, workplace/support, linked Directory account IDs/roles/states, and matching Pending corrections. Links open existing authoritative screens separately; this panel has no editor, Save, replacement, account toggle, export or mutation callback.
- Pending request matching uses exact Person/Location IDs and existing leadership-reference field allowlists in proposals/submission baselines. Names, emails, free-text reasons and account email matches never infer identity. Associated Location references include historical DM-copy discrepancies for review; they are not current leadership. Approved/rejected requests and all historical attribution remain unchanged, not copied into this panel. No private request prose or account contacts are projected.
- The report is **loaded-data review only**: no complete-inventory, atomic snapshot, external-access verification or “safe to inactivate” claim. Empty sections explicitly say nothing found in loaded data. Pending requests/workplace links are review context, not newly invented server blockers. No new network read, API endpoint/field/scope, account/mailbox/provider action, live staffing/contact change, Notion change, consumer-app edit or data restoration.

## Acceptance and evidence

- [x] Source audit of authority, raw-copy exceptions, lifecycle/account guards, workplace/support and request references.
- [x] Pure read-only projection tests and existing position/relationship tests: 24/24 passed. Covers District-owned versus legacy/non-retail DM, vacancy, zero-store Districts, retired/missing Locations, multiple roles, all linked account states, exact-ID Pending proposal/baseline matching, no name/email inference, minimal projection, frozen source preservation and recomputation.
- [x] Six synthetic browser cases passed: rich mobile review/no writes, empty loaded data/no clearance, Viewer and Editor exclusion, existing SM/AM responsibility parity and position/inactivation guard regression. Types and production build passed (existing bundle advisory only). Synthetic 390px mobile screenshot inspected; no horizontal overflow, independently scrollable body and preserved footer. Existing server/API contracts are unchanged; reuse applicable prior server evidence rather than rerun the full suite for a read-only UI.
- [ ] Review/fix, merge and no-traffic/config-preserving publication, with exact source/build/revision and both-host release evidence.
- [ ] Separate authorized live data inventory, concrete staffing/access choices, external access verification and consumer acceptance. None is a release probe for this slice.

## Next and rollback

Continue P3.1's source/server dependency parity and planned handover contract before any coordinated writer. Define preview freshness, version/digest limits, explicit replacement/vacancy selections and recovery receipts before promotion/offboarding mutations. Region-owned/acting leadership remains its separately reviewed contract. Do not mistake the disclosure for full P3 or an offboarding runbook that revokes access.

Prefer forward repair. The previous PR #45 lacks only this read-only report and retains prior safety guards; rollback does not change staff, contacts, account links or actual access. Never restore collections or revoke grants to undo this display. Preserve all prior hierarchy/position/request/status/address/contact safeguards. Documentation-only checkpoint records require no rebuild.

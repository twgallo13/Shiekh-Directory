# Dispatch 28 — Read-only promotion/offboarding dependency preflight

## Scope and status

Owner-approved P3.1 continuation from clean documentation main `28f2b86`, after PR #45 (`1b122fe`). [PR #47](https://github.com/twgallo13/Shiekh-Directory/pull/47) is merged and published; exact checkpoint below. Tracking [issue 36](https://github.com/twgallo13/Shiekh-Directory/issues/36) remains open for independent authenticated API-consumer acceptance.

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
- [x] Codex code/security and CodeRabbit reviews completed without actionable findings at `9f83556`; no unresolved threads. Merge/publication evidence below.
- [ ] Separate authorized live data inventory, concrete staffing/access choices, external access verification and consumer acceptance. None is a release probe for this slice.

## Next and rollback

Continue P3.1's source/server dependency parity and planned handover contract before any coordinated writer. Define preview freshness, version/digest limits, explicit replacement/vacancy selections and recovery receipts before promotion/offboarding mutations. Region-owned/acting leadership remains its separately reviewed contract. Do not mistake the disclosure for full P3 or an offboarding runbook that revokes access.

Prefer forward repair. The previous PR #45 lacks only this read-only report and retains prior safety guards; rollback does not change staff, contacts, account links or actual access. Never restore collections or revoke grants to undo this display. Preserve all prior hierarchy/position/request/status/address/contact safeguards. Documentation-only checkpoint records require no rebuild.

## Publication checkpoint — October 22, 2026 Pacific

Source `360d8a3a1e0870c3c7ef82887c2de49f5924d6c3`, tree `9f79c2525a88aaa98414a38cad3096afc7a5827b`, exactly matches reviewed `9f83556af5bd3880e587218c2f61c7ae7e1ad8cb`. Build `642dbdd3-8446-4310-a1dd-2fa419277324` succeeded with unchanged principal. Ready revision `shiekh-location-company-directory-pr47-360d8a3` is sole 100% desired/observed traffic. No-traffic candidate passed before concurrency-guarded promotion; configuration/identities/Firebase, 26 historical tags and branded Ready/DomainRoutable routing are preserved. Only temporary `p47-360d8a3` was removed.

Both hosts match HTML SHA-256 `488eed4b9a7082228f6d315f8a3e1d2ca207164baed18ce5b2d939fff1dce782` and 45 MIME-validated JS/CSS assets. No-store/conditional-cache, v1/v2/v3/operating denial and unknown-route protections passed. All four served API documents retain the exact hashes recorded in Dispatch26; no public wire field/scope or server validator changed.

The existing authenticated People session was refreshed after verifying no draft. The known Person profile's new disclosure rendered all five sections and the loaded-data/no-clearance warning; closed without entering an editor, saving, inactivating or deleting. This is read-only live UX acceptance, not an actual transition, external-access verification or authenticated consumer payload. No personnel/contact/account/mailbox/provider/grant/token/Notion/consumer-app mutation.

The existing Codespace was resumed after idle stop; its removed temporary SDK was restored using [Google's official package/checksum](https://docs.cloud.google.com/sdk/docs/install-sdk?hl=en). CLI 590.0.0 Linux x86_64 archive SHA-256 `351ed4a2812c5525c1cee00334257a42c020fcaffa27d3067c1eec0a618dd83f` was verified before use. Existing authorization was reused, not expanded. Release metadata is restricted; no credentials or personnel inventory copied into the repo.

Next: fresh server-backed transition-preview contract (dependencies, scope, versions/digest, expiry and recovery limits) before any coordinated writer. No staffing choice, access action, Region/acting assignment or restore is implied. Issue36 stays open; documentation-only checkpoint commits need no rebuild.

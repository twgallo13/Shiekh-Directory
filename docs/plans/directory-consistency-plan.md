# Directory hierarchy and operating workflows implementation plan

Approved direction recorded October 21, 2026. The owner subsequently approved recording the review refinements and proceeding with baseline inspection and implementation. Initial implementation is in progress; no production release or data cutover is claimed.

The Directory will provide consistent organizational assignments and store information across its own screens and all consuming applications. This work repairs leadership changes and corrections, adds a practical leadership handover, and separates immediate temporary operating events from permanent store information. The first deliverable is this documented checklist; it does not represent a production change or completed migration.

## Scope and working agreement

- Repository: `twgallo13/Shiekh-Directory`. Source audit baseline: `baa2b937f4d79ddb8be24434b5176e6f2e98a690` on `main`. Recheck the baseline before implementation and account for intervening work.
- Theo approved the audit recommendations, the documented plan, and proceeding with implementation after recording the review refinements. Keep the planning PR documentation-only and place application repairs in separate reviewable PRs. Personnel changes, credential creation, imports, merges, production deployment, and exact data cutover remain subject to the user's current authorization and the release gates below; this execution step does not perform them.
- Work in small reviewable branches and PRs. Preserve unrelated changes and historical evidence. Use the existing project, named database, identities, and deployment process; do not change Dynamic-Qr, ROPI, or other applications as part of this plan.
- Reuse existing canonical IDs, validators, transaction/audit mechanisms, and successful validation where applicable. Do not rewrite the application or run every test repeatedly between documentation edits.
- Never infer a replacement manager, district, or identity from a person's name, typed title, email, or historical PDF. Keep private contact data, credentials, full backups, and real personnel inventories out of this public repository.

## Intended business behavior

### One organizational structure

Company contains Regions, Regions contain Districts, and applicable retail Locations belong to Districts. Region and District identity is controlled through stable IDs. Names are display values. Non-retail Locations may remain outside retail hierarchy and must retain their separately valid operational leadership.

The approved new direction is a Region-owned Regional Manager and District-owned DM, inherited by their stores. Store Manager, Assistant Store Manager, and Key Holder remain Location assignments. The implementation must first reconcile the current Location-owned DM/RM model, which Dispatches 4 and 14 explicitly established. This plan changes the intended ownership model, not the meaning of historical release records.

Preserve multi-store management and a person managing multiple territories. Start with one primary DM per District and one primary Regional Manager per Region. Show vacancies explicitly. Support an acting replacement with clear effective dates; additional co-manager policy requires a concrete business case. A store-level territory-leadership exception must be explicit, justified, visible, and given an expiry/review rule rather than silently competing with inherited leadership. Validate non-retail ownership separately.

### People and application access are distinct

Use controlled operational position or eligibility values for assignment rules. A descriptive job title and department may remain editable display information. Do not use exact free-text titles to decide who appears in assignment selectors. Keep Works at, Supports, Manages, and territory leadership distinct. Changing a display title must not silently reassign stores or grant application permissions.

Person lifecycle, organizational assignments, and application-account access are separate states. Offboarding must guide an authorized administrator through all three. Preserve the Person ID and history; prefer inactivation over deletion. A vacant position is valid and must never be filled by guessing.

### Two different change paths

Permanent information changes use a correction and review workflow unless the actor already has direct-edit authority. Emergencies use a dedicated immediate workflow: an authorized SM or DM can report a temporary closure for stores they manage, with a required reason, server-recorded start, expiry, actor, and audit event. Notify appropriate leadership after the save without delaying publication for approval or email delivery.

Default temporary closure expiry is the next midnight in the Location's IANA time zone, not 24 elapsed hours and not the viewer's date. Continuing closure requires explicit renewed confirmation. Clearing or expiry returns to the applicable schedule and lifecycle; it never forces a store open. Reopening early is a separate explicit action. A forced open override is not included by default.

The primary display is Open or Closed, with a separate reason and today's effective hours. Unusable schedules or unresolved operating facts must show Unknown or Needs verification instead of fabricated opening hours. Distinguish current operating state from long-term lifecycle, normal weekly hours, exceptional hours, temporary incidents, and informational notices.

### Useful customer service information

Provide corrections for street address, suite, city, state, ZIP, mall/center, and shared inbox as well as phone. Add a dedicated Location-owned customer-facing field, proposed name `wayfindingDirections`, for guidance such as "Second floor next to Macy's." Keep it separate from postal address, temporary incident reasons, and internal reviewer notes. Set a documented length limit, render as plain text, allow explicit clearing, and review it through the correction workflow for store-level users.

## Confirmed findings and verification boundaries

- H01: Region/District settings manage registry records, but leadership authority currently lives on Locations; there is no district-wide manager handover control.
- H02: Person Job Title and compatibility Territory/District are free text. Request selectors use exact title matching while direct location selectors use a different eligibility rule.
- H03: Person inactivation is blocked while leadership and User links remain. A guided reassignment/access handover is missing. The reported screenshot contains an Active Status control; the reported save failure and title-change failure require live reproduction with the actual error before their exact causes are declared fixed.
- R01: Store Manager Change does not pass the chosen ID back into `PersonSelector`. Its required flag is visual, not a submission guard. These explain a broken selection experience but do not establish the cause of every approval failure.
- R02: Address Update exists in the types but not the request form. Other Store Info Update currently handles only inbox changes. Holiday Hours Exception also exists in the types without a corresponding request-form branch.
- O01: Operational Status Change is approval-gated and persists a mixed status field; there is no dedicated expiring emergency-event contract.
- O02: `getTodayHoursForLocation` uses device-local time, ignores `specialHours` and emergency status, assumes default hours when absent, and does not support overnight intervals correctly. Detail display can select an Open message before considering a closure.
- O03: Inspected notice displays use object presence rather than checking the notice's effective and display-until dates.
- A01: Server application roles are Administrator, Data Steward, Editor, and Viewer. SM/DM staffing titles do not by themselves provide a safe immediate-update permission. Existing direct-write collection authorization and per-store scope checks need a complete field/action review.
- I01: API serializers expose stored hours and operational fields rather than a shared, verified effective operating-state contract. Registry inheritance and time-driven expiry introduce synchronization requirements beyond Location `updatedAt`.

Source findings are not a live personnel inventory, authenticated production API acceptance, or today's Cloud Run verification. Record those independently.

## Relationship coverage required before cutover

This is the minimum dependency inventory for P0.5, not a claim that every production reference has been inventoried. For each row record exact persisted fields, authoritative owner, forward and reverse readers, allowed writers, reference validation, effective dates where relevant, and inactive/missing/delete/reassignment behavior. Include source paths and tests; every discovered reader or writer must be covered or explicitly marked Not verified.

| Relationship or reference | Current authority | Required transition and acceptance |
| --- | --- | --- |
| Location identity and Store Number | Location document ID and exact business number | Preserve IDs and leading zeroes. Join API datasets by document identity; never merge Locations by manager/name/email. |
| District to Region and Location to District/Region | Registry IDs and saved Location hierarchy IDs | Validate parent consistency and non-retail applicability; define the authoritative versus derived Region reference after cutover. |
| District Manager and Regional Manager | Location `districtManagerId` and `regionalManagerId` | Move to reviewed territory ownership with explicit inheritance/exceptions; retain compatible outputs without two writable authorities. |
| Store Manager and assistant/key-holder slots | Location `storeManagerId`, `assistantStoreManagerIds`, `keyHolderIds` | Shared eligibility/lifecycle rules; preserve approved multi-store relationships, vacancies and explicit clears. |
| Person workplace and support | Person `primaryLocationId`, `supportedLocationIds` | Keep separate from leadership. Define retirement/reassignment and reverse navigation without copying authority. |
| Person identity and lifecycle aliases | Person canonical ID plus `fullName`, `status`, `activeStatus` | Preserve alias conflicts for review; define inactive/unknown behavior consistently across writes, selectors and APIs. |
| Person position and descriptive title | Existing free-text `role`, `jobTitle`, department | Add controlled eligibility without turning descriptive titles into access grants; review old aliases and mappings. |
| User to Person and Firebase identity | User `personId`, `firebaseUid`, application role/status/scope | Check uniqueness and current authority; offboarding explicitly handles sessions/access as well as assignments. |
| Pending correction target, baselines and actor | Persisted request target IDs, versions, snapshots and requester/reviewer identity | Preserve historic attribution; target ownership changes require a reviewed adapter or explicit replacement, never retarget by name. |
| Hours template and embedded schedule | Location `hoursTemplateId`, `hoursMode`, `standardHours` | Identify template authority; ensure template changes cannot overwrite approved custom hours or revive expired incidents. |
| Holiday, special-hours and corporate broadcast references | Saved dated overrides and corporate holiday/template IDs | Handle overlap, effective dates, removal and future edits without replacing unrelated exceptions silently. |
| Temporary incident and notice references | Existing `activeNotice`; proposed server-owned event IDs and history | Distinguish display notices from operating overrides; constrain actor/location links, expiry and audit retention. |
| Custom values and definition catalog | `customMetadata` keys and published custom-field definitions | Validate retired/internal/invalid keys, version changes and complete-object replacement; directions must have one owned field. |
| Shared inbox and personal contact aliases | Location-owned inbox versus Person contact fields | Preserve explicit null/absence and duplicate acknowledgement; never equate shared contact with account identity or permissions. |
| Audit, mail rules/templates and delivery records | Server-owned audit events and persisted communication references | Preserve historic actor/target display, use current authorized recipients after handover, and keep notification failure separate from commit. |
| API clients, grants, token versions and snapshot/cursor bindings | Managed client and server authentication state | Maintain separate v1/v2 scopes; changing leadership must not create credentials, expand grants or leak private contacts. |
| CSV import manifests, receipts, exports, print and external references | Stable Location/Person/registry IDs and signed operation contracts | Test round trips, stale confirmation, lifecycle removal and recovery; direct scripts/jobs/readers need an explicit compatibility classification. |

The inventory must include deletion/recreation, retirement/reactivation, movement between Districts/Regions, out-of-scope references, duplicate links, and sequential/concurrent edits. A valid UI display alone is not reference integrity evidence. A production scan must use restricted storage; publish only synthetic fixtures, aggregate findings and approved reference-free evidence.

## District Manager API contract and joins

The existing v1 Location API intentionally excludes personnel assignments. The v2 staffing API already returns the following fields under `staffing:read`; the new hierarchy work must preserve a documented compatible route to the same effective manager identity.

- Endpoint: `GET /api/v2/location-staffing` or `GET /api/v2/location-staffing/{locationId}`, using a snapshot obtained from `GET /api/v2/snapshot`.
- Canonical assignment field: `districtManagerId`, string or null.
- Resolved fields: `staffing.districtManager.personId`, `.fullName`, `.lifecycle`, and `.issues`. The entire `staffing.districtManager` is null when no canonical assignment exists. Missing/invalid referenced People have explicit diagnostics; do not mislabel them as an ordinary vacancy.
- `districtName` in v1 and `hierarchy.districtName` in v2 are territory names, not the manager's name. A stored legacy `districtManagerName` is not the published v2 field.
- Join v1 Location `id` to v2 staffing `locationId`; join `districtManagerId` to Person `id`. Preserve Store Numbers as text but do not use them as a substitute for cross-dataset document identity.
- Minimal manager identity/name/lifecycle is included with `staffing:read`; a separate `personnel:read` grant is needed only for the personnel endpoint. Email, phone, login identity and account permissions remain excluded.
- P6.4 must publish exact before/after payload examples for direct, inherited, acting, excepted, vacant, missing, inactive and unknown assignments. Effective and stored/primary assignments need distinct documented meanings; never silently change an existing field's semantics. Backward-incompatible changes require a versioned contract.

No new field or personnel grant is added by this documentation amendment. An authenticated production response remains a separate acceptance check.

## Snapshot time and effective state rules

P4.2 and P6.5 must distinguish a frozen synchronization snapshot from a current operating-state read. Freeze effective assignment evaluation to the declared snapshot time so a multi-page read cannot mix leaders or override states. Preserve the existing v2 pinned Firestore read time, client/grant bindings and expiration behavior. Ordinary later data changes must not rewrite a previously issued snapshot; new runs observe the new state. Security grant/token changes continue to invalidate access as the existing contract requires.

Do not present a historical snapshot's status as current after its known next transition. A current-status contract must evaluate with server time, declare evaluation and next-transition/expiry timestamps, and bound cache/refetch lifetime accordingly. If the current contract cannot express this distinction, introduce an explicit version or separate read rather than silently changing existing v2 payloads. Consumers must handle expired cursors, restart incomplete runs, and not combine independently timed v1/v2 runs while claiming one atomic snapshot. Test manager handover, acting-assignment expiry, store-local midnight and DST transitions during pagination and caching.

## Phase 0 Establish the current baseline

Owner: implementation agent. Review: supervising agent. Business exceptions: Theo.

- [ ] P0.1 Inspect current branch, dirty files, project instructions, recent commits, open PRs, deployed source/image, traffic, and rollback revision. Separate documentation commits from deployed application source.
- [ ] P0.2 Reproduce the reported Person edit, inactivation, leadership request, and status problems using authorized read-only inspection and synthetic fixtures. Record actor role, browser, expected/actual behavior, and relevant error code. Do not save a real test correction or change a real Person record merely to reproduce a bug.
- [ ] P0.3 Obtain a consistent, access-controlled read-only inventory of People, Locations, Regions, Districts, and User links when authorized access is available. Count missing/inactive/unknown people, missing/duplicate IDs, competing DM/RM assignments, lifecycle alias conflicts, vacancies, pending requests, and non-retail exceptions.
- [ ] P0.4 Compare the existing approved Dispatch 12B mapping with current data. Its historical 14/12/22 retail grouping plus two centers is approval evidence, not a hard-coded live roster. Report drift; do not silently rerun its manifest. Preserve exact Store Numbers including leading zeroes and the existing `86` identity.
- [ ] P0.5 Create the impact inventory for UI, writes, requests, API v1/v2, filters, dashboards, exports/imports, print, mail, scheduled jobs, and known external consumers. Mark each Changed, Verified unaffected, or Not verified, with evidence.

Exit evidence: reproduced bug cases or precise reproduction blockers, source/deployment baseline, restricted inventory reference, current drift report, and impact inventory. Missing live access does not prevent synthetic implementation planning, but blocks claims about actual personnel and cutover readiness.

## Phase 1 Repair request and save defects

- [ ] P1.1 Bind selected manager IDs to `PersonSelector`, make it keyboard accessible, show the selected person, and support intentional replacement, vacancy, and cancellation.
- [ ] P1.2 Enforce required fields on client and server; reject empty and unchanged requests. Reset or preserve drafts deliberately when category or target changes so values do not leak between stores. Capture baselines for all requested fields.
- [ ] P1.3 Define allowed fields for each request type. Validate target, actor, proposed IDs, eligible active people, and field-specific values server-side. Keep pending request contents immutable during review and retain target/request version checks.
- [ ] P1.4 Await committed results before showing approval or save success. Show actionable inline errors and saving states, prevent duplicate submits, retain drafts on failure, and avoid phantom approvals/audit entries. An uncertain response must reconcile the same operation before retrying a new operation.
- [ ] P1.5 Cover linked/inactive/missing/unknown people, selector title variations, stale targets, missing baselines, old pending requests, normalization differences, duplicate clicks, permission denial, transaction failure, and preservation of unrelated fields.

Exit evidence: targeted failing cases now pass, regression checks pass, and source review confirms no production record repair was bundled. Existing invalid requests need a documented reject/replace path; do not silently rewrite history.

## Phase 2 Unify hierarchy and assignment contracts

- [ ] P2.1 Write the exact additive data contract for controlled positions, eligibility, Region/RM and District/DM assignments, acting assignments, vacancies, explicit exceptions, and effective dates. Keep application permissions separate. Specify single versus multiple roles and allowed multi-store/territory relationships.
- [ ] P2.2 Define ownership and precedence once: valid explicit exception, valid inherited territory leadership, or explicit vacant/unresolved state. Missing, retired, inactive, contradictory, or parent-mismatched references must remain visible. Never fall back to copied names as assignment authority.
- [ ] P2.3 Use the same eligibility and lifecycle rules in request selectors, direct edits, imports, server validation, UI projections, reporting, and API. Do not reject unrelated edits solely because untouched historical data needs reconciliation.
- [ ] P2.4 Add a discoverable Organization and Leadership administration area, grouped by Region, District, and affected Locations. Show current and acting leaders, vacancies, conflicts, assignment provenance, and dependency links. Preserve role restrictions and mobile/keyboard access.
- [ ] P2.5 Design compatibility projections for existing Location DM/RM fields, version digests, and old readers. Identify a single authoritative writer at cutover. Do not leave both inherited and per-store values independently writable.
- [ ] P2.6 Generate a field-level migration preview from the restricted inventory: IDs, exact raw before/after presence and values, current versions, proposed effective assignments, exceptions, approval basis, and unresolved conflicts. Preserve existing unrelated data and stable IDs.

Exit evidence: versioned contract, tests for inheritance/exceptions/non-retail cases, cross-surface parity, and a concrete migration preview. Conflicting current assignments or the identity of a replacement are owner decisions; the agent must not invent them.

## Phase 3 Add leadership handover and offboarding

- [ ] P3.1 Provide Change leader and Person leaving flows with a preview of every affected assignment, account, pending request, and workplace/support relationship. Separate these relationships visibly.
- [ ] P3.2 Allow replace, acting replacement, or vacant for each applicable management slot. Keep operational centers and explicit exceptions visible rather than treating all associations as retail district ownership.
- [ ] P3.3 Make application-access consequences explicit. Inactivating a Person alone is not proof that Firebase or application access was revoked. Handle the linked Directory access state through authorized server actions; preserve historical attribution. Do not revoke other applications' credentials or accounts under this flow.
- [ ] P3.4 Re-read dependencies and versions inside the commit. Apply assignment/access/person changes atomically when feasible. For larger changes, document limits, deterministic batches, resumable receipts, and partial-progress states; do not claim multiple transactions are atomic.
- [ ] P3.5 Preserve historical display names for audits without letting copied values become current authority. Exclude inactive/unknown people from new assignments while making existing invalid references reviewable.
- [ ] P3.6 Test vacancy, multiple stores, multi-territory leadership, already-inactive people, concurrent reassignment, linked users, rollback, retry, and interrupted multi-step handovers. Repeat with synthetic counterparts of the reported departed-DM scenario.

Exit evidence: guided handover works without per-store manual detective work, inactive people cannot remain effective active leaders, and account consequences are explicit and verified. Actual personnel changes require a concrete approved selection and preview.

## Phase 4 Establish one operating state and permission contract

- [ ] P4.1 Separate record lifecycle, operational lifecycle, weekly schedule, holiday/special schedules, temporary incidents, and notices in the model and UI. Define the mapping from every existing mixed operationalStatus value; preserve ambiguous values for review rather than guessing whether renovation means open or closed.
- [ ] P4.2 Implement a shared, deterministic effective-hours/state resolver with an injectable clock and Location time zone. Return effective state, reason, schedule source, effective hours, evaluation time, and next known transition. Define the public wire names in Phase 6 before publication.
- [ ] P4.3 Specify precedence: retired/permanently closed or not-yet-open lifecycle; then active temporary closure; then reviewed dated overrides; then weekly schedule. Missing/conflicting schedules yield an explicit uncertainty state. Resolve overlapping overrides consistently or reject ambiguous new writes. Notices alone must not imply closure.
- [ ] P4.4 Cover local date boundaries, DST changes, overnight schedules and previous-day spillover, holiday/special-hours boundaries, invalid time zones, invalid times, missing weekdays, and explicit 24-hour behavior. Remove made-up default hours from read status; retain defaults only in clearly labeled create/edit templates.
- [ ] P4.5 Define server-enforced action permissions for all four application roles plus linked operational responsibilities. Company administrators/stewards have their approved scope; eligible store managers act only on assigned stores and DMs only on their currently effective territories. A typed title, UI filter, claimed store ID, stale session, or API consumer token cannot grant write permission.
- [ ] P4.6 Audit existing direct Location/Person writes, request creation/review, import/export, and account actions for per-action, per-field, and per-record scope. Close bypasses without giving SMs/DMs broad edit authority. Record the final permission matrix in the plan's evidence ledger.

Exit evidence: one status calculation and documented permissions pass direct HTTP denial tests as well as UI tests. UI labels, list filters, dashboard totals, detail views, print and copy summaries agree for the same clock and snapshot.

## Phase 5 Add immediate temporary operating updates

- [ ] P5.1 Create a dedicated authorized command to report temporary closure, clear it early, or renew it. Require a reason; save server timestamps, store time zone, expiry, actor, version, and an append-only audit event. Confirmation explicitly identifies the store and end time.
- [ ] P5.2 Set default expiry to the next store-local midnight using DST-safe time conversion. Show the local expiry to the user. Renewal must be explicit, scoped, audited, and version checked. Lifecycle closures cannot be cleared by this temporary command.
- [ ] P5.3 Ignore an expired event during every effective read even if cleanup has not run. A scheduled cleanup is optional housekeeping, not the source of correctness. Preserve event history. Dismissing a banner does not reopen a store.
- [ ] P5.4 Refresh open Directory screens promptly using a documented mechanism and bounded interval. Distinguish saved, pending, failed, and offline state. Concurrent reopen/renew actions must not overwrite a newer event. Set and verify a measurable freshness target before release; proposed target is 60 seconds for connected Directory screens after a successful save.
- [ ] P5.5 Dispatch leadership/customer-support notifications only after commit. Notification failure does not undo an operational update. Apply rate limits and prevent repeat clicks from creating duplicate events/messages.
- [ ] P5.6 Test closure during scheduled open hours, midnight expiry with no cleanup job, explicit renewal, early reopening, outage across DST, unauthorized other-store requests, acting manager scope, revoked accounts, network failure, concurrency, and no accidental changes to permanent hours or hierarchy.

Exit evidence: an authorized immediate closure becomes visible within the agreed target, expires correctly, and has a verifiable audit trail without creating a steward approval dependency.

## Phase 6 Complete corrections and consumer contracts

- [ ] P6.1 Add address and mall/center/suite correction inputs, meaningful Other Store Info fields, and `wayfindingDirections`. Add or explicitly defer Holiday Hours Exception with a user-visible explanation; do not leave dead categories suggesting support.
- [ ] P6.2 Support SM/assistant/key-holder assignment proposals and DM/RM proposals against their new owning records. Keep approvals steward/admin controlled and apply the same rules as direct administration. Provide deliberate clear/vacant semantics.
- [ ] P6.3 Separate request reason, reviewer notes, customer-facing directions, and operational-event reason. Provide before/current/proposed review with validation, concurrency protection, audit, and post-commit notification. Preserve historical request targets through hierarchy cutover or require explicit replacement.
- [ ] P6.4 Define and test an additive or versioned API contract for directions, effective status, time-zone-aware effective hours, temporary-event expiry, assignment provenance, inherited leadership, vacancies, and acting assignments. Preserve v1 locations:read and v2 personnel:read/staffing:read boundaries. Do not expose personnel contacts by adding them to location payloads.
- [ ] P6.5 Specify time-driven synchronization: expiry/acting-assignment end can change effective state without a Location write. Expose expiry/next-transition information and document reevaluation or bounded refetch; do not rely solely on updatedSince, updatedAt, or database cleanup. Ensure ETags/caches cannot keep a store falsely closed after expiry.
- [ ] P6.6 Registry/person/assignment edits must invalidate relevant snapshots/versions consistently. Retain v2 coherent snapshot semantics and field allowlists. If existing fields would change meaning, version the contract and document the transition rather than silently redefining them.
- [ ] P6.7 Update location and assignment imports, both CSV exports, print/PDF, search/filtering, dashboards, correction downloads, copy summaries, and public docs. Preserve edit-export round trips, scope, privacy, leading zeroes, unsupported fields, and existing signed confirmation/receipt safeguards.
- [ ] P6.8 List required checks for Dynamic-Qr, ROPI, and other consumers. Provide synthetic examples and migration guidance; mark external integration Not verified until observed. Do not modify their repositories or claim their polling provides real-time delivery.

Exit evidence: documentation and OpenAPI match actual response envelopes, old consumers retain their agreed contract, and an authorized authenticated production sample is a named release-acceptance task rather than assumed evidence.

## Phase 7 Reconcile data and release safely

- [ ] P7.1 Sequence reviewable PRs: request/save repairs; additive hierarchy contract/admin/offboarding; shared status resolver/authorization; emergency commands; completed corrections/API/sync surfaces; exact cutover manifest and documentation. Split further where review risk warrants it; do not combine unrelated cloud changes.
- [ ] P7.2 Capture restricted backups immediately before data changes, including current versions and assignment provenance. Generate update-only, checksummed forward payloads and bounded compensating recovery actions; stale or drifting rows stop rather than overwrite later edits. Do not execute the old Dispatch 12B manifest blindly.
- [ ] P7.3 Deploy compatible readers before switching authority or migrating assignments. Disable conflicting old writers during the bounded cutover. Verify by canonical IDs across database, UI, APIs, exports, requests, and reporting; preserve history and handle simultaneous legitimate activity explicitly.
- [ ] P7.4 Complete lint/type checks, affected unit/transaction tests, relevant regression suites, production build, schema validation, and focused browser/accessibility checks for changed source. Reuse valid earlier results; rerun when changes, failures, or material uncertainty require it. Record exact tested SHA and runner summaries.
- [ ] P7.5 Validate a no-traffic candidate using the existing runbook, exact build/source/image evidence, unchanged Firebase/runtime/security settings, public assets/docs and denial guards. Promote only under current release authorization, with a compatible rollback revision and explicit stop conditions.
- [ ] P7.6 Perform coordinated acceptance with authorized real accounts: permitted store closure, denied other-store change, observed refresh/expiry, correction save/review, hierarchy assignment, and authenticated API read. Obtain approval for concrete real personnel changes, account changes, credentials, messages, and test records where needed. Do not use a reported real personnel change as an unapproved live test.
- [ ] P7.7 Document separate code rollback and data recovery. Old binaries must not revive expired closures, reinterpret new authority incorrectly, or grant locations:read to personnel-only clients. Traffic rollback does not restore assignments or reverse access changes. Preserve later legitimate writes during recovery.
- [ ] P7.8 Update the API guides, schemas, administrator how-to, offboarding procedure, status-expiry behavior, release records, known gaps, and AI handoff. Keep the repository clean; do not remove user stashes or unrelated branches. Retire only task-owned branches after the agreed merge workflow.

Exit evidence: implementation, deployment, data cutover, live acceptance, and external-consumer status are reported separately with links. Do not call the project complete solely because tests passed or a deployment is Ready.

## Required acceptance scenarios

- [ ] Departed DM with many stores and a linked User: preview replacement/vacancy, preserve Person/history, prevent partial reassignment, and explicitly handle Directory access.
- [ ] Existing conflicting DMs within one District: report conflict, retain current evidence, and require an approved resolution; no majority-name selection.
- [ ] Person with an unusual descriptive title: eligibility follows controlled positions, consistently in every selector and API write path.
- [ ] One manager responsible for multiple stores/territories; acting assignment begins/ends; explicit exception remains visible; non-retail centers retain valid ownership.
- [ ] Missing/inactive/unknown person and retired/mismatched hierarchy references; unrelated edits preserve untouched historical values and surface diagnostics.
- [ ] Leadership selection shows the chosen person and cannot submit empty; stale/unchanged/invalid requests fail without partial writes or false success.
- [ ] Address correction and mall directions preserve postal identity, clear deliberately, and appear consistently in approved API and customer-support views.
- [ ] Power outage closure applies immediately for an assigned SM/DM, never a different store; notification failure does not undo the save.
- [ ] Closure expiry after local midnight with no cron run; explicit renewal; early reopening; scheduled closed day; DST, overnight hours, missing hours, and different viewer time zones.
- [ ] Extended/holiday/special hours display separately from Open/Closed; overlapping/invalid overrides have documented behavior and notices expire from display correctly.
- [ ] Existing v1/v2 clients retain scope and contract; private personnel contacts remain excluded; snapshot/version/cache and time-driven changes do not serve stale leadership/status.
- [ ] Consecutive edits, concurrent writers, failed/uncertain responses and retries preserve drafts, versions, audit, idempotency, and unrelated fields.
- [ ] UI, API, reporting/editing CSV, import, print, dashboard, search and mobile/keyboard flows agree for the same inputs and authorized scope.
- [ ] Production release has source/build/image, compatible rollback, data-recovery evidence, and honest authenticated acceptance; unverified consumers are clearly named.

## Evidence ledger and completion rules

For each task, maintain its ID, owner, status, PR/source SHA, tests or review evidence, deployment evidence if applicable, remaining gap, and next action. Use Not started, In progress, Blocked, Ready for review, or Complete. Only check a task after its exit evidence exists. Keep implementation, migration, deployment, and live acceptance as distinct records.

Current status: review refinements recorded; Phase 0 and the first bounded Phase 1 slice are In progress. The first repair is awaiting fresh review in [PR 23](https://github.com/twgallo13/Shiekh-Directory/pull/23), current source `84dacaae4171e7aba031ba13b68d9625ded11622`. Its [evidence record](https://github.com/twgallo13/Shiekh-Directory/blob/fix/leadership-request-selection/docs/dispatches/dispatch-16-leadership-request-repair.md) records reproduction, tests, production availability checks and remaining limits. Whole-task checkboxes stay unchecked where broader acceptance remains incomplete.

| Task or work item | Status | Evidence and remaining work |
| --- | --- | --- |
| Plan refinements | Complete | Relationship coverage inventory, exact current DM wire fields/joins and frozen-versus-current snapshot rules recorded. Production reference inventory is still a separate task. |
| P0.1 baseline | In progress | Clean isolated clone at audited main; public HTML/schema/guide match documented hours-release hashes and API denial checks pass. Current Cloud Run traffic/image metadata has not been independently inspected. |
| P0.2 reproduction | In progress | Pre-fix 11 new server-rejection cases failed and keyboard selector case failed. The reported real Person edit/inactivation failure remains unverified. |
| P0.3 and P0.4 live inventory and drift | Not started | No authenticated business records were read; restricted inventory and a fresh comparison with historical approved mappings are still required before cutover. |
| P0.5 linked-data inventory | In progress | Minimum relationship checklist is recorded; exact per-reader/writer source classification and production-reference evidence remain to be completed. |
| P1.1 P1.2 P1.3 P1.5 first slice | In progress | PR 23 fixes selected-manager display/keyboard controls, empty/unchanged checks, manager reset on store change and server submission validation. Broad per-type validation, category/target draft reset, vacancies and remaining acceptance are not complete. |
| PR 23 validation | Complete for reviewed slice | 345 API/unit tests, 14 focused synthetic browser cases, TypeScript check, build and whitespace check passed. Evidence applies to product source at 045ec41; later documentation-only changes need no redundant reruns. |
| PR 23 review corrections | Implemented and validated pending fresh review | Source `ea9ab15e4b90abbdd64e915c970835469dbf7f0f` preserves keyboard focus after selection/clearing and validates the final batched Person state. Both defects were reproduced before correction. 71 affected API/unit tests, 3 strengthened leadership browser cases, a focused keyboard-clear rerun, TypeScript check and build passed. The original 345-test full-suite result is historical; no new full-suite aggregate is claimed. Fresh automated approval must cover the amended commit. |
| PR 23 normalized-contact correction | Implemented and validated pending fresh review | Source `30a85195a6ff1ce58f4dc72420ca7f4638efe303` prepares Person contact values once for final-state checks and persistence. Twelve new cases reproduced the remaining formatting defect (eight failed before correction). 83 focused tests and the full 367-test API/unit suite passed; TypeScript check, build and whitespace check passed. An independent input-immutability assertion was strengthened and all 34 leadership cases passed again. Prior browser evidence remains applicable because interactive behavior did not change. Fresh Codex review requested on this head; CodeRabbit review remains to be confirmed. No merge/deployment. |
| PR 23 extension and same-target batch corrections | Implemented and validated pending fresh review | Source `84dacaae4171e7aba031ba13b68d9625ded11622`. Codex review of 30a8519 completed without findings; CodeRabbit then identified two additional edge cases. Sixteen new regression cases reproduced eight failures. Omitted extensions now follow their unchanged phone only; new leadership requests reject simultaneous target Location writes. 99 focused and 383 full API/unit tests passed, TypeScript check/build/whitespace passed. Prior browser evidence remains applicable. Fresh review requested; no merge/deployment. |
| Production release and data changes | Not started | No merge/deployment, personnel or account updates, imports, credential creation, authenticated payload sampling or ownership migration performed. |

The local implementation checkout is clean and the task-owned synthetic Vite server is stopped. The next implementation slice is pending-request immutability/per-type validation and safe request-review save feedback, with draft reset behavior covered before hierarchy migration begins. Continue unaffected synthetic implementation without inventing live inventory or deployment evidence.

Routine engineering choices should be resolved by the implementing agent within this contract. Escalate only real business ambiguity, conflicting current assignments, unavailable access, or a breaking change beyond the approved direction. No decision is needed merely to start baseline inspection and synthetic defect reproduction. A replacement or an explicit vacancy must be selected before a real handover is applied.

At each handoff report completed tasks, current source and deployed revision separately, remaining failures, exact next task, unresolved decisions, and which successful validations can be reused. The next task under this plan is **P0.1**, followed by **P0.2** and the bounded request repairs.

## Source and related records

- [Historical canonical hierarchy contract](../dispatches/dispatch-04-canonical-hierarchy-and-atomic-assignment-contracts.md)
- [Approved historical mapping and migration safeguards](../dispatches/dispatch-12b-approved-hierarchy-update-plan.md)
- [Personnel API implementation and release](../dispatches/dispatch-14-personnel-staffing-api.md)
- [Hours correction implementation and release](../dispatches/dispatch-15-hours-correction-workflow.md)
- [Location consumer guide](../app-blueprint-directory-api.md)
- [Location response schema](../api-response-schema.md)
- [Personnel and staffing guide](../personnel-staffing-api.md)
- [Deployment and rollback runbook](../cloud-run-deployment-runbook.md)
- [Person editor](../../src/components/people/PersonEditorForm.tsx), [Person selector](../../src/components/people/PersonSelector.tsx), and [Person detail](../../src/components/people/PersonDetailModal.tsx)
- [Correction request form](../../src/components/requests/NewRequestModal.tsx), [review](../../src/components/requests/RequestsView.tsx), and [shared correction rules](../../src/lib/correctionRequest.ts)
- [Hierarchy settings](../../src/components/admin/HierarchyRegistryPanel.tsx), [location editor](../../src/components/locations/LocationEditModal.tsx), and [location detail](../../src/components/locations/LocationDetailModal.tsx)
- [Current hours calculation](../../src/utils/timezoneHelper.ts), [persistence](../../src/context/DirectoryContext.tsx), [server validation](../../server/firestoreDirectory.ts), [write authorization](../../server/directoryDataApi.ts), and [authentication roles](../../server/authAuthority.ts)

This plan lives at `docs/plans/directory-consistency-plan.md`. Relative links above are resolved from that repository location. Update this plan as evidence arrives; preserve earlier dispatches as historical records.

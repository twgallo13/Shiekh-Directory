# Organization leadership roster and onboarding

Owner-approved direction, October 28, 2026 Pacific. Authoritative product context: [Notion blueprint, sections 24–27](https://app.notion.com/p/3d145ee1ec5a81888bdccbd3720232a1). Keep this implementation record and Notion aligned.

## Approved rules

- Store → District ID → Region ID. Names and People do not replace those keys.
- District Manager and Regional Manager are controlled Person positions. **Primary Manager** and **Additional Manager** are responsibilities within a particular unit, not new positions or permissions.
- Multiple managers may cover a unit; a staffed, activated unit has one deliberately chosen Primary. Additional coverage never silently replaces the incumbent. Training was an example, not a mandatory trainee/regular taxonomy.
- One Person may cover several units. Region01 and District01 are separate, namespaced identities even when the strings match. Preserve leading zeros.
- A DM/RM needs no workplace. Corporate Office is a valid optional workplace. Workplace, Supports, store leadership, shared inbox responsibility, individual contact and app access remain separate.
- An intentional vacancy has no active members and an explicit null Primary. Unmanaged legacy setup and invalid/unresolved historical references remain distinct.
- Work email is contact only. Keep v1/v2/v3 response shapes, contact exclusions and current grants unchanged. LP work, automatic invitations/account linking, test-data replacement and production configuration changes are separate.

## Proposed storage contract

An activated unit has `leadershipModelVersion: 1`, a `leadershipVersion` and its existing record version. District retains `districtManagerId` as the Primary pointer; Region adds `regionalManagerId`. An authoritative command updates roster/pointer/audit/receipt together. Do not expose generic independently writable aliases.

Assignment records in the proposed `leadership_assignments` collection contain an assignment ID, `unitType`, `unitId`, `personId`, `status: active | ended`, `startedAt`, `endedAt`, record version and server audit attribution. A rejoining Person gets a new tenure ID. Optional internal notes are not authority or consumer fields; editing notes is not in the initial planner intent. `isPrimary` is derived from the unit pointer, not separately persisted.

Initial work is immediate-only. Scheduled/acting automation remains explicitly undelivered. New/modified assignments require an exact Active Person with the matching controlled position. Existing unresolved data is readable with diagnostics, not guessed or silently migrated. Legacy activation needs a reviewed per-unit manifest.

## Implementation slices and evidence

### 1. Pure assignment planner — merged foundation, not enabled in production

`server/organizationLeadershipPlanner.ts` supplies a detached internal dry run. It accepts a full desired unit roster and explicit Primary, exact expected versions, an operation ID, legacy activation choice and a bounded reason. It:

- validates source completeness, unique identities, hierarchy and controlled position/lifecycle;
- adds/ends tenures, preserves an outgoing Primary as Additional when explicitly retained, and never infers a new Primary;
- prepares only required District/Region/store compatibility field patches, excluding non-retail Locations;
- captures unit, Person, complete-roster and store-membership fingerprints for a later writer to revalidate;
- refuses no-ops, ambiguous/future/invalid source, unknown input fields, duplicates, unsafe version increments and oversize operations;
- bounds proposals to five units, 25 active members/unit and 200 business-document changes, with an 8,000,000-byte planning envelope limit.

This function has **no authentication, transaction, signature, API route, I/O or commit capability of its own**. Its completeness attestations and raw preconditions remain internal. The later loader/writer establishes/rechecks them, and gated adapters now import the foundation. The planning byte estimate is not final SDK/audit capacity proof. Do not send internal patches/preconditions to consumers. PR #76 merged; production activation remains off.

Synthetic evidence in `test/organizationLeadershipPlanner.test.ts` covers additional coverage with no workplace, Primary handover, Corporate/Region coverage, namespaces/leading zeros, vacancies/history, explicit activation, controlled eligibility, failed/missing/stale reads, no inference, malformed roster, exact write-cap boundary, overflow, time validity, hierarchy conflicts, idempotency collision and input immutability. The dispatch records actual run results.

### 2. Authoritative loader/preview/commit and alternate-writer guards — in progress, not enabled

The bounded source adapter and stateful preparation/commit/status/cancellation service are implemented in `server/organizationLeadershipSource.ts` and `server/organizationLeadershipOperations.ts`. A private server-written preparation receipt binds actor, exact intent, reviewed changes, dependency fingerprints and expiry. This uses stored server authority rather than another signing secret; it does not enable or bypass the older signed Person workflow. Transitional guards are implemented in PR #78. The subsequent private HTTP/Store adapters, canonical administrator catalog and pending-review listing are built behind new disabled-by-default server gates; [Dispatch 49](../dispatches/dispatch-49-organization-workflow-adapters.md) records scope/evidence. No production activation or scope/grant changes occur. See Dispatches 47–49 for historical checkpoints and remaining release gates.

- Read complete bounded source queries and exact dependencies; fail closed on query/capacity failures. No contacts/accounts are needed for roster planning.
- Authenticate existing authorized administrators and re-read Directory role/scope authority at commit; staffing is not authorization.
- Prepare a redacted review, bind its intent/versions to the actor/session, and persist idempotent operation/receipt state. Reconcile unknown outcomes before retry.
- Recompute in one transaction and bound actual complete documents/audit/receipt bytes, not only patches. Cover phantom membership inserts and eligibility changes with transaction/query/native preconditions.
- Guard generic District/Region/Person/Location writes, correction approvals, imports, retirement and the unpublished position-removal writer against bypassing activated roster ownership.
- Transitional guards are now implemented for shared Store commits/import manifests and the older signed Person-command source adapter. Activated-unit metadata/pointers cannot be edited independently; active Additional memberships block unsafe Person removal; managed retail copies must match both canonical owners. Managed-unit edits, store moves/type changes/deletion and assigned-manager renames currently fail closed pending their roster-aware review path. These restrictions are implementation safeguards, not the final UX; do not activate units while that supported workflow is missing. See [Dispatch 48](../dispatches/dispatch-48-organization-leadership-guards.md).
- Review activation/rollback compatibility before any unit migration. Preserve non-retail and existing live data. Reuse existing recovery foundations only where their gates/contracts are actually applicable.

### 3. UX and reverse responsibilities

The initial administrator onboarding/profile/registry interface is now built behind capability discovery: [Dispatch 50](../dispatches/dispatch-50-organization-onboarding-ux.md). It shows current canonical Primary/Additional responsibilities, optional assignment after confirmed profile creation, deliberate roster/Primary review, durable unknown-outcome recovery and explicit draft reapplication. Server gates remain off. This does not yet complete roster-aware Person lifecycle/name workflows or reviewed unit/membership edits, and those gaps still block activation.

Profile → Responsibilities → Review, with optional workplace and Assign later. No unit preselected. Preserve concurrent positions. Keep Add manager and Change Primary distinct. Show existing Primary while adding Additional coverage. After save distinguish profile saved, assignment pending, confirmed saved and unknown outcomes. Person and Organization views resolve the same canonical responsibilities. Retain drafts, useful errors, keyboard/mobile access and contact-first lookup. Review before/after screens and real synthetic journeys, not just field presence.

### 4. Versioned consumer contract

Opt-in organization units/assignments/location hierarchy from one pinned snapshot; existing v3 stays Primary-only. Eligibility discovery is separate from assigned leadership. Any new scopes/contacts require a concrete reviewed policy; do not widen existing grants. Consumer access and sales aggregation remain consumer-owned: aggregate one store/transaction before joining a multi-manager roster. Update OpenAPI/guides/Admin links and migration examples together.

### 5. Acceptance and bounded release

Meaningful unit and actual SDK/emulator race/recovery tests, affected browser checks, independent code/security review, migration preview, compatible rollback and real serving-source checks are required. Keep the earlier runtime/isolation/signing gates and unpublished staffing code separate. **Do not deploy main wholesale.** Data restoration is later, with backup and exact-ID reconciliation.

## Current production boundary

The [runbook](../cloud-run-deployment-runbook.md) records the isolated `ux74-c7d1938` source `c7d19381a2d0573941eb5175fcea4d2c2ee862f0`. Main includes newer backend work not all deployed/enabled. No production roster, identity, secret, client grant or business data is changed by slice 1.

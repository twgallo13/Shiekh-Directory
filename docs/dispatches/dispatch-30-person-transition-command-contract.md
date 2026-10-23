# Dispatch 30 — Coordinated Person transition contract

## Status and source audit

Contract PR: [#51](https://github.com/twgallo13/Shiekh-Directory/pull/51). Documentation/link/scope checks passed; independent review and merge are tracked on that PR. This is not a new runtime release.

Design-only continuation from clean documentation main `2805e29`, after published runtime PR #49/source `29020a2`. [Implementation contract v1](../plans/person-transition-command-contract.md) defines the next bounded slices; it implements no routes, signing key, receipt, planner, UI or writer. No cloud build/deploy, business-record mutation, consumer fields/grants/tokens, provider/account action, private Notion edit or restore is bundled. Issue 36 consumer acceptance remains separate.

Source anchors inspected:

- `server/personTransitionPreview.ts`: coherent bounded read, strict projections, current company-wide administrator/steward authority and informational digest/expiry. This is not a command preview or signed confirmation.
- `server/districtLeadership.ts`: existing District handover is administrator-only, one District plus exactly its retail member copies, with no unrelated writes and bounded audit/payload. Appending Person changes or looping generic commits would violate that contract or lose atomicity.
- `server/personPositionValidation.ts`: final assignment/controlled-position consistency; new command must preserve direct-writer guards and avoid title-based new eligibility.
- `server/firestoreDirectory.ts`: linked User records of every state block inactivation unless separately reviewed/unlinked, final lifecycle/reference checks, versioned/audited commits and self-access protection. V1 transition command will not add account writes.
- `src/lib/personLocationRelationships.ts` / `src/types.ts`: SM derived phone/privacy and leadership name copies must remain consistent without changing Person contact. Workplace/support is distinct from management authority.
- `server/firestoreOperating.ts`: actor-bound immutable command identity, durable result/cancellation and atomic receipt/audit are useful patterns, not authorization to reuse operating routes or tokens for personnel.

Browser read-only inspection confirmed the current People page without an open Person editor. No real Person was selected, edited, promoted or inactivated in this design step. Prior PR49 live snapshot acceptance remains applicable; no unnecessary new private inventory read was performed.

## Contract decisions and gates

V1 is a narrowly administrator-only assignment/position command with optional inactivation, not complete offboarding. All linked Users block inactivation; access remediation stays separate. Multiple positions remain explicit. Preserve District-owned inheritance and Location-owned legacy/non-retail roles, derived copies/privacy and stable IDs. Retired source ownership can be deliberately vacated; no new responsibility goes to invalid territory or an ineligible Person. Acting/Region migration, unrelated occupied-slot displacement, bulk batches, notifications and data restoration remain deferred.

Command preview is distinct from PR49: signed, actor/intent/state-bound and expiring, but never authentication or a lock. Signing configuration is an implementation prerequisite, not created here. A non-business `prepare` receipt and protected client recovery marker precede commit. Own-actor status/list/cancel resolve unknown outcomes across reload, without persisting raw intent/token/contacts. Final commit performs fresh full predicate/version/update-time checks, server-derived allowlisted writes and one atomic business/audit/receipt transition. No-memory-only recovery, silent partial batching or weakened generic District validator.

Implementation order: pure dry-run planner/tests → read-only command-preview adapter/configuration → durable preparation/atomic writer/recovery → guided accessible UI and compatible release. Actual SDK/query insertion/cancellation-race evidence is required before enabling writes; in-memory tests alone cannot certify it. The contract records explicit capacities, error states, no-write stop conditions and synthetic acceptance coverage. Concrete staffing/access choices remain owner decisions, never agent test data.

## Validation and publication boundary

Documentation-only: validate relative links, new release/contract anchors, whitespace and the explicit scope/recovery/field-ownership checklist. Reuse PR49 runtime validation; do not rebuild an unchanged app. Independent review and merge evidence will be recorded after they exist. Broad roadmap checkboxes remain unchecked until their complete exit criteria are met; the published slices are not missing just because older broad entries remain open.

Next implementation is the pure planner, not a live staffing command. Rollback of this document changes no application or data. Preserve PR49 source/runtime and the clean repository handoff.

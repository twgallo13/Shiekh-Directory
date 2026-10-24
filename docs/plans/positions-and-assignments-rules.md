# Positions and assignments: agreed application rules

Owner clarification, October 23, 2026 Pacific. Fix application rules first; leave existing data untouched. Data cleanup, CSV restoration and migration are deferred, not part of this release.

## Organization and people are separate

- A Store references a District ID; the District references a Region ID. Names and people are not hierarchy keys.
- A Person's explicitly selected Positions determine eligibility. Descriptive job titles are not linked positions. Account Roles determine access separately.
- Multiple positions are allowed deliberately. Adding District Manager while retaining Store Manager does not change an existing store assignment, assign a District or grant account access.
- Assign an eligible District Manager in the District registry. Retail stores inherit that District's DM; do not offer independent store-level DM overrides. Existing legacy ownership requires deliberate review, not automatic conversion.
- Store Manager, Assistant Store Manager and Key Holder assignments belong to the Store. Existing Regional Manager/location references are preserved; Region-owned RM and acting leadership need a separate implementation.

## New assignments versus existing records

Every new leadership assignment requires a unique, clearly Active Person with the matching explicitly selected Position. A matching typed title, email or “show everyone” exception cannot make someone eligible. This applies to selectors, authoritative saves, District previews, correction proposals and CSV import.

Keep unchanged historical assignments visible for review, even if unmapped. Do not infer positions, change contacts or rewrite assignments to make old data look consistent. Existing identity, lifecycle, hierarchy and authorization safeguards still apply. CSV imports do not assign Person positions from titles.

## Simple everyday workflow

For a Store Manager promoted to DM while covering their store: select both positions on the Person and save; then assign that Person to a District in the registry. Neither step silently removes the store responsibility. Change the Store Manager separately when a replacement is available.

Removing a required Position must never leave an incompatible assignment hidden. The intended next slice is a short explicit review: replace the affected assignment with an eligible Person, or confirm vacancy. Apply the reviewed position/removal effects together with authoritative concurrency checks and uncertain-save recovery. Until that coordinated writer is implemented and verified, retain the existing blocking guard; do not silently vacate or bypass it. Routine position additions do not require a promotion wizard.

## Delivery checklist

1. Uniform explicit eligibility and understandable selectors; preserve old records. See [Dispatch 32](../dispatches/dispatch-32-explicit-assignment-rules.md).
2. Bounded removal/replacement/vacancy confirmation using the existing [transition contract](person-transition-command-contract.md) and pure planner. The [signed read-only preview foundation](../dispatches/dispatch-33-signed-transition-preview.md) is merged in PR #55, not live/configured. The separate [PR #56 recovery foundation](../dispatches/dispatch-34-person-transition-recovery.md) supplies unwired metadata-only prepare/status/cancel/list helpers; client persistence and atomic staffing updates are separate source slices below. Next gates: review and full client/server integration, approved dedicated signing configuration and short review UI/end-to-end/release acceptance. Existing removal blockers remain. Preserve account-review/inactivation blockers; positions never grant or revoke sign-in access.
3. [PR #57 client recovery helpers](../dispatches/dispatch-35-client-transition-recovery.md) supply source-only marker storage and reconciliation with unit/real-browser evidence. They are not imported into the app; session/transport/restart integration and the reviewed server writer remain required. Do not mistake helper tests for an enabled save workflow.
4. [Atomic writer and isolated SDK evidence](../dispatches/dispatch-36-atomic-transition-emulator.md) are the next source-only slice: fixed server-derived changes and audit/receipt in one transaction, with actual emulator race evidence. No router/Store entry point is enabled. Remaining integration/configuration/UI/release gates still apply.
5. Separate owner-reviewed restore/migration only after application acceptance, source CSV validation, backup and stable-ID/consumer reconciliation. No wipe is authorized by this plan.

Public consumer response fields, contact privacy, API grants/tokens and shared-inbox ownership remain unchanged. Issue 36's authenticated consumer acceptance is a separate gate, not proof supplied by these application tests.

# Dispatch63 — Managed Location import preview alignment

Import preview now reports canonical managed ownership before confirmation instead of showing rows as ready that the organization guard would reject later. Source only; no production activation, imports or data changes.

New retail rows inherit both canonical Primary manager copies through the same creation helper as the forms. Explicit contradictory managed District/Region manager IDs are blocked, not silently accepted as ownership changes. Existing rows reconcile managed Regional copies from the canonical Region, like District-owned compatibility copies; these derived ID/name differences appear in the review. A legacy Region remains independently store-owned, even when its District is managed. Explicit vacancy stays empty. Non-retail Locations remain excluded from retail inheritance.

Unsupported/incomplete managed metadata, invalid new-store setup and managed membership/type/applicability changes produce actionable `invalid_hierarchy` preview issues. Membership changes point to Store & District moves; managed Location type changes remain explicitly unsupported pending their reviewed path. Ordinary Location changes and legacy Regional assignments remain available. Generated field-dictionary text now describes conditional ownership without changing headers/schema versions or public API contracts.

The existing signed confirmation manifest/receipt protocol and transaction-level organization guard remain unchanged. Preview is advisory source projection, not complete roster authority: confirmation still reads current source, tenure inventory, identities and dependencies. No flag, signature secret, token/grant or generic bypass is added.

## Evidence

- 58 focused import planner/API/client cases passed. Four new cases cover canonical new-store DM/RM copies and visible derived names, rejected ownership overrides, ordinary edits versus managed membership/type changes, independent legacy Regional edits, explicit vacancy, unsupported Region model and inactive canonical new-store manager. The final planner run passed 39/39 after extending DM override and changing-legacy-RM assertions. Counts overlap; do not add them together.
- One actual SDK/emulator preview-plan → Store confirmation scenario passed: new managed Store with both Primary IDs, one receipt/audit, safe repeated confirmation, and stale Regional Primary refusal with no extra record/receipt/audit. A unique loopback-only named database was used. The private HTTP signing/auth layer is not exercised by that native scenario; existing API cases cover its unchanged contract.
- Final TypeScript and release build passed; existing Vite chunk advisory only. The prior complete 879-case suite was reused for unchanged creation/UI behavior; no redundant whole-suite rerun is claimed for this import-planner slice. No browser file upload or production/provider acceptance is claimed.

## Remaining activation gates

Finish uncertain generic creation recovery, linked Location type/removal and lifecycle paths/diagnostics, correction approvals and Person requests, wider import/concurrency and opt-in consumer acceptance, exact-source independent review, bounded activation manifest/migration/rollback and guarded release/provider/browser acceptance. Retire/Reactivate and permanent deletion are distinct and must preserve hierarchy and staffing dependencies. All existing organization/security/access/signing/runtime/release gates remain off/in place. No wholesale main deployment, LP/Dynamic QR work, business-data restoration, IAM/grants/tokens/credentials, expanded authority or approval review as Theo.

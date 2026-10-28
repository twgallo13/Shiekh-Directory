# Dispatch61 — Managed hierarchy edit guidance

Existing Store and registry edit forms now guide administrators to reviewed hierarchy commands instead of offering managed parent/inherited-manager edits that the server rejects. Source only; no server authority, business record, activation flag or deployment changes.

The Store editor determines ownership from its **saved** District/Region, not the mutable draft. With organization ownership metadata present it keeps Region, District, applicability, DM and RM read-only and points to Admin → Regions & Districts → Store & District moves. The Regional Manager is clearly inherited from the Region’s Primary Manager. Store Manager/staff and unrelated record fields remain available. Creating a store and changing type/lifecycle still require separate managed-workflow acceptance before activation; this slice does not claim those paths complete.

The District metadata form keeps a managed parent read-only while allowing a name edit. A legacy parent draft cannot be replayed through generic metadata save after concurrent activation: the draft/name remain and the administrator can explicitly keep the saved Region to continue the name-only edit, or finish/cancel before a separate move review. Unknown/future ownership metadata never falls back to legacy hierarchy editing. The registry’s former blanket statement that parent changes never affect stores now distinguishes legacy behavior from the reviewed managed move.

## Evidence

- 11 focused registry/selection/browser-entry ordinary cases passed, including new managed/future-model metadata refusal and legacy-draft reapplication after activation. Parent changes are rejected locally before the existing generic save; the authoritative server guard remains unchanged.
- Actual local components with synthetic auth/bootstrap were inspected: Store Region, District and RM controls disabled, Store Manager control enabled, inherited-manager explanation/move guidance visible. District metadata Name remained editable and Parent Region was disabled with move guidance. No writes occurred in this fixture.
- TypeScript and release build passed; existing Vite chunk advisory only. The prior full 870-case suite was reused; no redundant complete rerun is claimed for this UI-only guidance.
- Separate PR90 review fixes at `8492013` passed 22 focused draft/controller cases and actual component checks: a multiline textarea reason reached review as one readable line, and recovery-only/no-pending capability showed an explicit paused message. Both inline findings were resolved after verification. Final TypeScript/build cover the combined source; no activation accompanied the fixes.

## Required continuation

Audit new Store creation into managed units, linked location type/retirement/delete changes, correction approvals and imports for a supported path or actionable fail-closed UX. Complete wider native concurrency and opt-in consumer compatibility, exact-source independent reviews, bounded activation manifest, migration/rollback and guarded production/provider/browser acceptance. This remains a source stack, not a completed roadmap/release. All organization activation flags remain off; no whole-main deployment, LP or Dynamic QR changes, data restoration, IAM/grants/tokens/credentials or expanded authority.

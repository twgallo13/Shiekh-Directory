# Dispatch 46 — District/Region roster planner

October 28, 2026 Pacific. Owner approved autonomous continuation of the Primary/Additional model and onboarding plan. Training is an example of Additional coverage, not a new role. Scope is Directory; LP implementation, automatic account access and production data changes are separate.

## Local implementation

Branch `codex/organization-leadership-roster`, based on `21af8c9c08e6c9bdfbf63ab449ef34d2f37deee1`. No repository AGENTS.md or applicable ancestor AGENTS.md was found. The working tree was clean before this slice.

Added an internal pure planner and meaningful synthetic tests. It establishes explicit unit-scoped Primary/Additional rosters, eligibility, legacy activation, history-preserving tenure changes, bounded compatibility patches and full-query/version fingerprints. It refuses silent promotion, bad/incomplete source, stale versions, oversized changes and uncertain-operation reuse. No current app/server route imports it and no production path is enabled.

See [the maintained implementation plan](../plans/organization-leadership-roster.md) for the exact model, subsequent loader/writer/guard/UI/API work and release gates. This does not complete the roadmap.

## Validation

- Final focused planner run: **22 tests passed**, zero failures. Earlier 17/19-test runs are superseded rather than added to that count.
- TypeScript initially found four narrowing errors in the new helper; corrected using an explicit never-returning error function. **Final TypeScript check passed.** Final combined affected run: **27/27 passed** (22 planner and five workplace/relationship cases), after the identity/audit and overflow corrections. No redundant frontend build/browser run: the new module has no runtime importer and no UI code changed.
- The first restricted-account test launch failed before tests initialized (`uv_os_get_passwd` from the existing tsx loader). Running the same synthetic suite under the working local account succeeded. This was not a product test failure or a reason to weaken assertions.
- Full ordinary API/unit regression: **709 passed / 1 failed** out of 710. The failure was the unchanged baseline `personLocationRelationships` render assertion for obsolete capitalized `Supports`; the released selector now says `Choose support locations`. The assertion was aligned with that existing UI, without removing reference-preservation checks. All **5 affected relationship tests passed**, including a new explicit optional-workplace/Corporate availability case. Successful unaffected results are reused rather than repeating the full suite for wording-only test maintenance.

## Review and release state

Implemented and locally validated; external review pending. Not merged, deployed, enabled or accepted in production. No real records, contacts, accounts, API credentials/grants, IAM, cloud settings or other apps changed. The previously published runtime and all staffing enablement gates remain unchanged.

## PR #76 review follow-up

Verified the Codex eligibility finding against the storage contract. Retained unresolved incumbents now remain in the review with a warning; they do not block adding an eligible Additional manager. New assignments and Primary promotions still require an exact Active Person with the matching controlled position and name. Explicit demotion may retain an unresolved outgoing manager as Additional. No automatic reassignment or record repair occurs. Added two regression cases; all 24 planner tests pass. Exported strict intent normalization for the next internal source adapter. Corrected the recorded base SHA after verifying it resolves. Transaction, UI and deployment acceptance remain pending.

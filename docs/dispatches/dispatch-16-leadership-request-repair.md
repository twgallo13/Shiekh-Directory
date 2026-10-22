# Leadership correction request repair

## Scope and source baseline

This is the first bounded implementation slice of the [Directory consistency plan](../plans/directory-consistency-plan.md), tracked separately from the documentation-only planning PR #22. The plan is currently on `docs/directory-consistency-plan`; until merged, use [that branch copy](https://github.com/twgallo13/Shiekh-Directory/blob/docs/directory-consistency-plan/docs/plans/directory-consistency-plan.md).

Base application/source: `baa2b937f4d79ddb8be24434b5176e6f2e98a690` on `main`. An isolated local clone started clean; no project AGENTS.md files were found. The implementation branch is `fix/leadership-request-selection`. No production records or application credentials were read or changed.

## Reproduction

Before application edits, the new `leadershipRequest.test.ts` ran against the base: 1 test passed and 11 failed because the server accepted invalid new Store Manager Change submissions. Cases covered missing/nonexistent/inactive/ambiguous managers, unchanged assignments, missing/stale baselines, unexpected fields, forged copied values, and invalid target type.

The new synthetic browser keyboard-selection case failed at baseline because the selector trigger had no button semantics. Source review also established that the request form did not pass the selected manager ID back to the selector. This is a specific reproduced UI defect, not a claim that the reported real Person edit or inactivation error was reproduced.

## Changes

- Bind the selected Person ID to the request selector so the selected name and clear action are visible. Clear the selection when changing the target Location.
- Reject empty, inactive/unknown, and unchanged manager proposals in the form. Include explicit nulls for absent manager ID, name and phone baselines, preserving the distinction between absence and old copied values through JSON submission.
- Make the shared selector trigger keyboard-operable with an accessible name, expanded state, search label, named clear button, and Escape-to-trigger behavior.
- Validate newly submitted Store Manager Change requests on the server against persisted Location and Person records. Restrict the proposed fields to the existing manager ID/name/phone contract; reject wrong targets, missing or non-active People, unchanged assignments, copied details inconsistent with the Person, and missing/stale store baselines.
- Preserve failed-save drafts. Existing pending requests are not rewritten; this submission validation does not change existing approval rules or repair historical data.

The server does not add title-based eligibility rules or new authorization grants in this slice. Exact-title UI filtering, controlled positions, intentional vacancies, DM/RM handovers, offboarding, broad request-type validation and permission redesign remain tracked plan work. This repair is not completion of every Phase 1 acceptance condition.

## Validation

- Focused API/unit checks: **17 passed**, including 12 new leadership submission cases and 5 correction regression cases.
- Full API/unit suite: **345 tests passed**, 12 suites, zero failures/cancellations/skips/todos; runner exit 0.
- `npm run lint`: passed, exit 0.
- `npm run build`: passed, exit 0; existing large-chunk warning remains. This local build is not a deployment artifact with production Firebase configuration.
- Synthetic browser suite: **14 passed**, covering 3 new leadership-request cases plus hours and shared-inbox request regressions. Command: `node node_modules/@playwright/test/cli.js test test/auth.browser.spec.ts --grep 'Leadership request|Hours correction|Location inbox correction' --workers=1 --reporter=line`.
- Browser tests used a localhost-only Vite server with synthetic Firebase key/app ID, the existing public project/domain identifiers, mocked authentication/directory/mail APIs and blocked external HTTPS. No live saves, scope grants, account changes, or messages occurred.
- `git diff --check`: passed. Locked dependencies were installed without package changes. Initial sandbox Node startup failed on the Windows `userInfo` restriction; the same synthetic test command then ran outside the sandbox. This was an environment failure, not an application regression.

Successful results apply to the product source in this repair. Subsequent documentation-only commits do not require repeating these suites. Broaden or repeat validation only for source changes, failures, or a specific unresolved concern.

## Read only production availability check

On October 21, 2026 in America/Los_Angeles, the branded host returned:

- `/`: 200, `no-store`, SHA-256 `eff36e6b2cb46d7edeaf353d25e491cc6c7982cc8a640081466fd6a118f95eba`.
- `/api/openapi.json`: 200, `no-store`, SHA-256 `681422b53b45d47c2b3f2c186dd730569884b36804ff93eb9e1500744e3e4ace`.
- `/api/personnel-guide`: 200, `no-store`, SHA-256 `e42e057ea0488f62eac99f21cffb24fd11c3d4fa0b70386bc5955a11ccecc5fd`.
- Unauthenticated `/api/v1/locations` and `/api/v2/snapshot`: 401 `invalid_token`.

Public HTML/document hashes match the documented October 4 hours release. This check does not re-confirm Cloud Run traffic/image metadata, an authenticated response, the current business roster, or successful real workflow outcomes. Cloud SDK was not available in this local checkout; no new cloud authentication or credentials were created to overcome that gap.

## Handoff and remaining work

P0.1/P0.2 are partially evidenced; exact Cloud Run state, the restricted live dependency inventory, and the reported real save failure remain unverified. P1.1/P1.2/P1.3/P1.5 are partially implemented and tested only for the scope above. Do not check off an entire plan task whose broader conditions remain unmet.

Next: review this slice, then complete pending-request immutability/per-type rules, safe request-review save feedback and target/category draft reset before moving to the additive hierarchy contract. Confirm current deployment and authorized restricted inventory when access is available. A real replacement/vacancy decision is required before any personnel handover. Keep the existing v1/v2 manager field and scope contract intact.

This branch has not been merged or deployed. Application changes are review-ready, not live; plan ownership migration and data cutover have not begun.

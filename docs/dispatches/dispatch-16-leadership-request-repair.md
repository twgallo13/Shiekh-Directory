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

## Review corrections after 045ec41

Both external findings were reproduced before correction:

- Codex P2: after keyboard selection, the newly rendered clear button was present but not focused. The new browser assertion failed at `toBeFocused`. The selector now tracks explicit selection/clear actions and transfers focus during the layout effect to the replacement clear/trigger button. An ordinary external value update does not request focus transfer. The regression also verifies that Tab continues to the following textarea and that keyboard clearing returns focus to the trigger after a failed save.
- CodeRabbit: ten synthetic batch cases failed before correction. The manager lookup now uses `combinedPeople`, the transaction's final Person state. Tests cover inactivation, deletion, rename, phone changes, and matching final details in both Person-first and request-first write order. Stale details and inactive/deleted references are rejected; matching final details are accepted.

Validation for this amendment:

- **71 focused API/unit tests passed**, covering all leadership request cases plus transaction persistence and directory-write authorization regressions. Command: `node --import tsx --test test/leadershipRequest.test.ts test/customFieldPersistence.test.ts test/directoryDataApi.test.ts`.
- **3 leadership browser tests passed** with selection-focus and Tab-order assertions. After making the clear interaction explicitly keyboard-driven, its focused case passed again. This supersedes the weaker focus coverage of the original browser cases; the prior unrelated hours/inbox browser results remain applicable.
- TypeScript check, production build and whitespace check passed. Existing bundle-size warning remains. The earlier full 345-test suite was not redundantly rerun; changed-validator paths were covered by the 71-test focused run. Ten new batch cases bring the leadership test file to 22 cases; no full-suite result at a new aggregate count is claimed.
- Added concise function documentation for the touched production components, validator and synthetic fixture helpers in response to the review warning. External docstring scoring must be confirmed by a fresh review rather than assumed.

No merge, deployment, live application write, credential change or notification was performed. Fresh automated review status must be checked against the amended commit; reviews of 045ec41 alone do not approve these corrections.

## Normalized-contact review correction after ea9ab15

CodeRabbit identified that final-state manager checks still compared raw Person contact input before phone normalization. Twelve new cases reproduced this gap: four passed and eight failed before correction. The validator now prepares Person contact values once and uses those same normalized values for both cross-record checks and persistence, independent of batch write order. Changed phones cannot leave a request with a differently formatted copied value; omitted contact fields and unchanged historical values retain the existing preservation behavior.

Validation for this correction:

- **83 focused tests passed**, covering leadership requests, contact normalization, Person contacts and custom-field persistence.
- **367 tests passed** in the complete API/unit suite, 12 suites, zero failures, cancellations, skips or todos.
- TypeScript check, production build and whitespace check passed. The existing bundle-size warning remains.
- New cases cover both batch orders, raw-format rejection, normalized acceptance, extensions, legacy-phone fallback, omitted work phone and unchanged historical formatting. Input immutability is checked against an independent cloned snapshot.
- Prior browser results remain applicable: no interactive behavior changed in this correction, only a submission-handler docstring.

This correction is confined to the review branch. No merge, deployment or production-data change was performed. Fresh reviews must evaluate this amended source rather than an older commit.

## Extension and same-target batch review corrections after 30a8519

Codex completed review of 30a8519 without findings. CodeRabbit identified two additional valid edge cases: omitted extensions could be restored after their phone changed or cleared, and a new leadership request could use a stale baseline when its target Location was also written in that transaction. The new synthetic regression run had 47 passes and eight failures before correction.

Person contacts now preserve an omitted extension only when its associated phone is unchanged; changed or cleared phones no longer inherit the previous number's extension. Explicit and inline new extensions remain supported. New Store Manager Change submissions reject any simultaneous write to their target Location, with instructions to save and reload first. This deliberately separates direct Location changes from new correction proposals, regardless of write order; existing request approvals are unaffected.

- Added 12 extension cases across legacy/work phone fields and four same-target batch cases across both write orders.
- **99 focused tests passed** and **383 full API/unit tests passed**, 12 suites, zero failures/cancellations/skips/todos. TypeScript check, production build and whitespace check passed; the existing bundle-size warning remains.
- Prior browser results are reused because interactive behavior is unchanged. A close-handler docstring was added; no UI behavior or permissions were expanded.
- The scanner's prototype-pollution warning on the preservation loop is not applicable: its property keys are a fixed code-owned allowlist, not keys enumerated from user input. No security configuration was changed to suppress checks.

Fresh review is required for this amendment. No merge, deployment, personnel update or other production write was performed.

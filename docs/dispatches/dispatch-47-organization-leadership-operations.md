# Dispatch 47 — Internal organization leadership operations

October 28, 2026 Pacific. Continues the owner-approved [roster/onboarding plan](../plans/organization-leadership-roster.md). Branch `codex/organization-leadership-atomic`, based on reviewed foundation `43c8382161f166a96b93325bbae6fc76bb75b14b` in PR #76.

## Scope and behavior

The new modules are internal and unimported by current runtime routes, Store or UI. They do not provision infrastructure, activate a unit or write production data. Only authenticated trusted server callers with live Active Company-wide administrator authority may eventually call them; an Account object alone is not Firebase authentication.

`organizationLeadershipSource.ts` reads complete bounded District/Region/Location inventories, all assignment history for each exact namespaced unit, and exact desired/incumbent People inside the caller's SDK transaction. Field masks exclude contacts, workplace and accounts. Sentinel extra results reject overflow; failures, missing/duplicate/wrong identities, unsupported projected values and absent native metadata cannot become an empty roster. Source bounds: 500 Districts, 100 Regions, 1,000 Locations, 1,000 tenure rows per selected unit, 5,000 exact People, 8,000,000 projected bytes. The complete flags and native metadata remain internal, never browser assertions.

`organizationLeadershipOperations.ts` supplies preparation, commit, status and cancellation:

- A deterministic actor/operation key identifies a private `organization_leadership_operations` receipt. Exact normalized intent, canonical order-independent hashes, safe redacted review, dependency fingerprints and a ten-minute expiry are stored server-side.
- This **stateful preparation** binds confirmation without a new signing secret. It is distinct from the older unpublished signed Person-transition workflow. It does not enable that workflow, change its flags or remove the Directory runtime/isolation release gates.
- Commit rechecks live authority, actor/review binding, expiry and the complete authoritative plan in one SDK transaction. It rereads full changed records and verifies their native metadata and projections before applying any patch.
- New tenures use create-only writes; existing records retain unrelated full fields through patch updates with native preconditions. Primary/Additional rosters, compatibility copies, one audit and the terminal receipt commit together. A failed transaction cannot leave part of the operation applied.
- Unknown client responses are reconciled by operation status. Repeated commit recovers the original immutable outcome even after expiry or later staffing changes. Cancellation seals absent/prepared operations and never undoes committed work. Every recovery action rechecks live authority and returns only safe outcome metadata.
- Final full-document capacity is independent of the planner's estimate: each saved document/audit/receipt must remain under 900,000 conservative bytes; saved business records under 4 MiB; business/audit/receipt envelope under 6 MiB. Unsupported preserved SDK values reject rather than disappear. At most 200 business documents plus one audit and one receipt are written.

## Validation evidence

- Combined affected ordinary tests: **49/49 passed** (24 planner, 8 bounded-source, 12 operations, 5 existing workplace/reference cases). The final repeated-preparation backwards-clock check also passed in the targeted 12-case follow-up. Reuse the earlier successful unaffected broad regression results recorded in Dispatch 46.
- Final TypeScript check passed; no emit or generated application assets.
- Actual Firestore SDK/emulator: **8/8 passed** on the final hash/clock implementation. Includes concurrent duplicate commit, concurrent preparation/cancellation, concurrent commit/cancellation, Primary handover with preserved native Timestamp fields, same-ID Region/District with one merged store update, explicit vacancy/history preservation, a new-store insertion between preview and commit, and live administrator downgrade. Concurrent emulator operations produced lock-timeout/retry warnings; every final test assertion passed.
- The first emulator attempt failed during source transform because a new TypeScript `satisfies` assertion was placed after a newline. It reached no SDK transaction. Syntax was corrected before the successful acceptance runs. No production fallback was used.
- Synthetic tests prove adapter and rollback logic; emulator tests prove the exercised real SDK paths. Neither proves production IAM, authentication, indexes, all concurrent alternate writers or end-to-end browser acceptance. No frontend build/browser test is needed for these unimported internal modules; UI acceptance remains required later.

## Isolated SDK test procedure

Use the already approved isolated emulator at exact `127.0.0.1:8089`, project `demo-directory-transitions`. Run `npm run test:organization-emulator` with `FIRESTORE_EMULATOR_HOST` set to that exact value. The test refuses other/missing hosts before SDK initialization, hard-codes the demo project and creates a unique named synthetic database per test. It reads no cloud credentials, imports no real data and terminates every SDK instance. Ordinary `test:api` does not run this explicit opt-in file. Do not share or reconfigure another operator's emulator; stop an owned emulator after acceptance. Emulator data is ephemeral and removed with that owned process.

## Release gates and next work

1. Review the new operations independently. PR #76's two findings were verified, repaired and marked resolved. Its latest CodeRabbit check reports **rate limited**, not approval or a completed re-review; CodeRabbit remains advisory and no paid/on-demand trigger was sent.
2. Protect alternate generic edits, imports, correction approval, retirement and unpublished position-removal commands. Include Additional memberships; prevent independent pointer/roster/model-version changes and store-level override. Coordinate membership changes with live canonical unit ownership. This internal service must remain unreachable until those guards are tested.
3. Add authenticated, deliberately gated HTTP/Store adapters, redacted organization/person reverse-responsibility reads and a draft-preserving Profile → Responsibilities → Review UI. No default unit selection, invitations, sign-in grants or workplace inference.
4. Check actual production query/index support and dedicated runtime/protection readiness before activating any unit. Require reviewed per-unit legacy manifests and compatibility acceptance. Do not deploy main wholesale: it contains older unpublished backend work.
5. Add the separate opt-in consumer schema/scopes and pinned-snapshot sync contract. Preserve current v1/v2/v3 responses, credentials/grants and LP/Dynamic QR behavior.

No merge, deployment, production activation, data reset, account/contact/credential changes or other-app changes are claimed by this dispatch.


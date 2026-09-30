# Dispatch 12C source review acceptance

Status: **Source review passed — ready for separately authorized deployment and Theo's manual acceptance.**

Reviewed application SHA: `99f2b179094210c612458b64e30cdcd6728592f3`.
PR: [#10](https://github.com/twgallo13/Shiekh-Directory/pull/10).
Implementation report: [dispatch-12c-implementation-review.md](dispatch-12c-implementation-review.md).
Review history: [delivery amendment](dispatch-12c-delivery-review-amendment.md).

## Result

The outstanding early-return finding is closed. Missing and unsupported business types are checked before ordinary District grouping and labels. They remain Needs Review even with an assigned District; original District IDs/names and unresolved, retired, or parent-mismatch diagnostics remain visible. Known business types retain stable District-ID grouping.

This concludes the recorded source-review correction cycle. No further application changes are requested by this review. Browser behavior and generated PDF layout remain manual acceptance rather than assumed passes.

## Evidence and limits

| Check | Result |
|---|---|
| PR state/base | Independently verified open/draft on `dispatch-11-flexible-location-csv` at the reviewed application SHA before this documentation commit. |
| Final implementation diff | Independently reviewed: shared hierarchy resolver, corresponding regression tests, and review documentation. |
| Committed hierarchy resolution tests | Independently executed: 16 passed, 0 failed. Exact committed helper/test copied to an isolated temporary directory; only the test's relative import path was adapted to that directory. Run using Node's TypeScript support; no database, browser, or application server involved. |
| Approved 12B manifest | Independently hashed fetched UTF-8 content: `d81ef01a59163f864f34c065c424b8ef26abf41c01c6a2d7ebdc12272dfd36a6`, matching approval. |
| Full suite, lint, build, diff-check, bundle scan | Builder-reported: 277/277, all required checks passed. Not independently rerun in this review. |
| Local unrelated runbook edit | Builder reports preserved/unstaged; remote source review cannot certify local worktree state. |
| Browser/PDF acceptance | Pending Theo; not performed by this review. |
| External scorecards, jobs, integrations, PDF consumers | NOT VERIFIED; do not claim downstream acceptance. |

## Next handoff

Prepare deployment of the exact reviewed application using the existing Cloud Run runbook. Deployment requires Theo's authorization; this source acceptance does not execute or authorize a traffic change. At that handoff, freshly identify the currently serving revision and preserve it as rollback; do not assume an old revision remains current. Preserve runtime configuration, named database, authentication, and secret bindings. Verify a no-traffic candidate and exact application identity before any approved promotion. Record candidate/live revision, traffic, application SHA, checks, and rollback evidence in the deployment record.

Theo then checks:
1. Region/District controls, explicit unassignment guidance, cancel/save and refresh; stale edits retain the draft and show an actionable conflict.
2. Operational Centers, Unassigned Retail Locations, and Needs Review are consistent between lists, individual details, dashboard, and PDF; District rename does not lose the selected filter.
3. Reporting export field order and applicability values; editing export/preview retains saved-value behavior. Preview only unless an import is separately approved.
4. Person territory changes do not overwrite Location legacy District text; existing leadership/contact behavior remains correct.
5. PDF displayed-row totals and retail/non-retail/unclassified counts, warnings, and readable layout.

Use authorized test records for save/rename checks and record before/after evidence; do not treat manual acceptance as permission to apply the business mapping manifest.

## Boundaries

PR #10 remains draft on its existing base. No merge, deployment, traffic promotion, live writes, imports, repairs, migrations, registry changes, or browser automation was performed during this review. The application SHA above is distinct from the documentation commit carrying this acceptance.

Dispatch 12B live assignments remain a separate operation requiring its fresh-version/checksum checks, reviewed recovery evidence, external-consumer assessment, and applicable approval. This review neither applies the 14/12/22 mapping nor changes Store 150 or centers 001/86.

## Final PR #10 Owner-Review Handoff — 2026-09-30

Status: **Ready for final owner review; PR #10 remains open and unmerged.** No merge or deployment was performed in this handoff.

### PR stack and source identity

- PR #9 is complete at `94b5633fbfe550a5f5eee1f573aed26bd791a865` on `dispatch-11-flexible-location-csv`; it remains open/draft pending security PR #11 and owner review.
- PR #10's local branch now includes PR #9 through normal merge commit `79b49d9a72508794b1a9dc9455f8fe22c089d088` (parents: prior PR #10 head `965a56abcc3c952ab773dd46a4db3364b1dd5268` and PR #9 head `94b5633fbfe550a5f5eee1f573aed26bd791a865`). No history rewriting or force-push was used.
- Final PR #10 application/source commit: `0e6d853712391cb9d4294b297682f540ea67d28c`.
- PR #10 continues to target `dispatch-11-flexible-location-csv` until the PR #9/PR #11 merge sequence is settled. Do not retarget early.
- The original workspace's pre-existing `docs/cloud-run-deployment-runbook.md` edit was stashed only for the base merge, then restored exactly and excluded from PR #10. It changes the runbook's “Current live revision” to Dispatch 11, which conflicts with the already-recorded Dispatch 12C deployment; it must not be included as a current-state correction without fresh live evidence.

### Final verification

- `npm run test:api`: **278 passed, 0 failed**.
- `npm run lint` and `npx tsc --noEmit`: **passed**.
- `npm run build`: **passed**; the existing Vite chunk-size advisory remains.
- `git diff --check`: **passed**.
- `npx playwright test test/auth.browser.spec.ts --reporter=line`: **29 passed, 0 failed** using synthetic local Firebase configuration and mocked API routes; no production endpoint or data was used.
- Focused hierarchy browser acceptance: **4 passed** — Location Edit/Fleet Quick Add transitions, PrintSheetView and Dashboard grouping/counts/warnings, Person legacy-District preservation, and stale Location conflict draft retention.
- No live Firestore read/write, CSV import, Region/District mutation, email send, migration, production build deployment, traffic change, or Google Cloud/OAuth/Dynamic-Qr action occurred.

### Review findings completed

- Fleet Quick Add previously offered values (`Enclosed Regional Mall`, `Urban Streetfront`, `Outlet Center`) outside the canonical `LocationType` union. It now renders the shared `LOCATION_TYPES`, so retail classification/applicability restrictions use supported values.
- PrintSheetView previously displayed hierarchy/applicability issues but omitted the explicit unclassified-type diagnostic. It now includes a deduplicated per-row warning; the group heading remains generic and does not borrow a single member's warning.
- Browser coverage now verifies Region changes clear Districts and expose only Districts under the selected Region; retail controls do not offer `Not Applicable`; Quick Add cancel performs no commit; stable namespaced group filtering survives a renamed District; group counts/warnings distinguish centers, unassigned retail, needs-review, and unclassified types; Person territory edits preserve legacy Location `district` and canonical Region/District IDs; stale saves retain the draft.

### Remaining manual-only acceptance

- Theo should visually inspect the Location Edit and Quick Add controls, particularly the correct behavior when selecting No retail hierarchy while references remain.
- Generated 1-Sheet PDF pagination/landscape layout and browser print output remain visual/manual checks; automated tests validate the rendered rows, grouping, totals, and warning content, not printed-page pagination fidelity.
- No data update was made from the approved Dispatch 12B manifest. Its live assignment/import execution remains a separate authorization and is not part of PR #10 completion.
- External scorecards, jobs, integrations, and PDF consumers remain **NOT VERIFIED**.

### Next merge sequence

1. Review and merge dependency-security PR #11 into `main`; it must precede PR #9 because it upgrades the CSV parser dependency.
2. Bring the updated `main` into PR #9 without rewriting its history, rerun its checks, and merge PR #9 using a merge commit.
3. Merge the resulting PR #9 base into PR #10 normally, retarget PR #10 to `main` only after PR #9 is merged, and verify the PR #10 diff contains only Dispatch 12 work.
4. Complete owner review and merge PR #10. Only after both PRs are merged should Phase A begin from a clean updated `main` branch.

The PR #10 branch is intended for final owner review, not merge readiness until PR #11 and PR #9 have followed the dependency order above. No new deployment is requested or authorized by this handoff.

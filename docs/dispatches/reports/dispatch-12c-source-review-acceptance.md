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

## Current owner-approved merge and deployment handoff — 2026-09-30

This section supersedes earlier status, merge-order, and deployment-authorization statements in this report.

- PR #11 is merged to `main` at merge commit `65d8b6ae0cc80a41b88d48e933e6df77248c1c07`; its source head remains `c9c16a939c7947b5b7c19b45a36b32be6355ecdd`.
- PR #9 is merged to `main` at merge commit `445527b1e6d85deaa6e96d31fc72edef25e97913`; its integrated head is `da1ea6bbda383c2d98bbba9328ffec75c372bb52`.
- PR #10 normally integrated that updated `main` in merge commit `290fc9007b69e5b21bec29d28812e9a7c9baa00b`, is retargeted to `main`, and includes hierarchy fixes at `6e8e108ea90c8bdbb78b1c4cab37f17253c64f6a` plus reconciliation safeguards at `5dbd41d4a8a06a99804c5de722f540cbf4bdbb44`.
- The exact PR #10 tree delta against `main` contains Dispatch 12 hierarchy work only; PR #9 CSV changes and PR #11 dependency/parser changes are not duplicated.
- Review corrections: explicit `Unknown` applicability now has a row warning and routes assigned Locations to `Needs Review`; Quick Add disables `Not Applicable` while canonical Region/District references are selected. The read-only reconciliation report now detects embedded/document ID mismatches, retains valid canonical assignments over conflicting legacy names, blocks invalid applicability before candidate classification, and formula-protects CSV output. Store 86 recovery documentation now restores its captured `Other Company Location` type and treats the absent name separately.
- Validation on the integrated source: full API suite **283 passed, 0 failed**; lint/typecheck passed; production build passed on unchanged app sources (existing Vite chunk-size advisory); hierarchy unit/grouping tests **18 passed**; targeted Quick Add/PrintSheet browser checks **2 passed**; focused reconciliation tests **14 passed**; `git diff --check` passed. All browser/API tests used local synthetic fixtures or mocks.
- The two prior Codex findings are resolved. CodeRabbit's latest review surfaced reconciliation and handoff findings; those are fixed in `5dbd41d` and this handoff update. Refresh exact-head comments/checks before merging.

### Existing release and pending rollout

- The earlier [Dispatch 12C deployment record](dispatch-12c-deployment-record.md) describes the **previous, already completed** deployment; it is not evidence that this new post-merge rollout has started.
- Read-only live Cloud Run inspection on 2026-09-30 confirmed project/service/region `gen-lang-client-0801664258` / `shiekh-location-company-directory` / `us-west1`; current healthy revision `shiekh-location-company-directory-dispatch12c-99f2b17`; source application commit recorded for that release: `99f2b179094210c612458b64e30cdcd6728592f3`; current traffic is 100% to that revision. The live image digest matches the existing record. The service account is `1063064400866-compute@developer.gserviceaccount.com`; existing `SMTP_PASSWORD` and `LOCATION_IMPORT_TOKEN_SECRET` bindings remain present. No secret values were read.
- The branded domain `shiekh-dir.ai.studio` maps to this service and is `Ready`/`DomainRoutable`.
- The new PR #10 rollout is **NOT STARTED**. Its reviewed application source head is `5dbd41d4a8a06a99804c5de722f540cbf4bdbb44`; the exact post-merge `main` commit must be captured and deployed only after all three PRs are merged and `main` is clean/green.
- The verified current serving revision `shiekh-location-company-directory-dispatch12c-99f2b17` is the rollback baseline for that future rollout; refresh service state immediately before deploying. Do not alter secrets, IAM, OAuth, unrelated tags/splits, production data, migrations/imports/repairs, or Dynamic-Qr.

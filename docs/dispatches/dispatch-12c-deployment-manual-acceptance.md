# Dispatch 12C — approved deployment for manual acceptance

Status: **Theo approved deployment and promotion for manual testing.**
This approval applies to application SHA `99f2b179094210c612458b64e30cdcd6728592f3` only. Documentation may follow without changing the application being deployed. Do not request the same deployment approval again.

## Objective and scope

Deploy the source-reviewed hierarchy consistency corrections so Theo can verify editing, directory presentation, CSV export/preview, and the 1-Sheet Directory PDF. No business-data repair or assignment change is part of this deployment.

Sources:
- [Source acceptance](reports/dispatch-12c-source-review-acceptance.md).
- [Implementation report](reports/dispatch-12c-implementation-review.md).
- [Cloud Run runbook](../cloud-run-deployment-runbook.md).

## Repository and impact checks

Continue PR #10 on `feat/dispatch-12-hierarchy-registry-api`, based on `dispatch-11-flexible-location-csv`; keep it draft and unmerged. Fetch latest refs, read applicable repository instructions, and preserve all unrelated work, especially the local runbook modification. Use a clean isolated checkout at the exact application SHA for the source deployment; do not deploy the dirty working directory.

Source review passed, independently executed hierarchy tests passed 16/16, and builder verification reports full API suite 277/277 plus lint/build/diff-check/bundle inspection. Do not repeat the implementation cycle or add features. If application source has changed, do not silently substitute a newer commit.

Impacted runtime surfaces: Location edit/Quick Add, Person leadership-copy behavior, directory lists/details/dashboard, public API projections, reporting CSV, editing preview compatibility, and PDF grouping/counts. Existing permissions, named database, ID/name contracts, legacy compatibility fields, runtime secrets, and approved assignments must remain intact. External scorecard/job/integration behavior remains NOT VERIFIED, not assumed tested.

## Deployment sequence

1. Read the actual Cloud Run service and domain mapping immediately before deployment. Project `gen-lang-client-0801664258`, service `shiekh-location-company-directory`, region `us-west1`, branded domain `https://shiekh-dir.ai.studio`. Confirm this is the correct service, not an adjacent canary/remix service.
2. Record the current Ready serving revision and observed/desired traffic as rollback evidence. The latest committed runbook entry names `dispatch12-e74e57c`, but its earlier “Current live revision” section is stale; live cloud state controls. Never reuse a historical rollback command without checking its target. If service/traffic is unexpectedly split or unhealthy, report that concrete issue before promotion.
3. Build and deploy the exact application SHA as a no-traffic candidate using the existing source-deploy process. A suitable suffix is `dispatch12c-99f2b17` and short tag `d12c-99f2b`; if already used, inspect provenance or use a unique suffix rather than replacing an unrelated revision.
4. Preserve service identity, runtime settings, named Firestore database, ingress, resources/scaling, authentication, domain routing, and both existing secret bindings, including `LOCATION_IMPORT_TOKEN_SECRET`. Do not read/log secret values, rotate secrets, change IAM, or replace environment configuration.
5. Verify the candidate is Ready at zero serving traffic, its build/image provenance matches the approved source, and runtime configuration matches the captured baseline except expected image/build/revision metadata. Use the runbook's valid regional domain mapping method. Check the tagged candidate root returns 200, unauthenticated `/api/auth/me` returns structured 401 `invalid_token`, and the unknown API route returns structured 404 `api_route_not_found`. Verify relevant served entry/Admin/PDF assets and source identity without browser automation or business-record writes. A 200 homepage alone is insufficient evidence.
6. Once candidate checks pass, **promotion to 100% is authorized by Theo's approval**. Promote explicitly; verify the percentage-bearing traffic entries, not tag-only entries. Verify the same availability/auth/asset checks on the default and branded URLs, plus Ready/routable domain status.
7. If genuine post-promotion availability/configuration/identity checks fail, restore the captured known-working traffic target and verify recovery. Correct verifier mistakes without repeated blind promotion/rollback loops. Report any unresolved failure accurately.

Allow an in-progress build to finish and inspect its status/logs; do not start duplicate deployments because a command timed out. Do not claim completion before the candidate and serving checks finish.

## Evidence and delivery

Create `docs/dispatches/reports/dispatch-12c-deployment-record.md` with application SHA, build/image provenance, candidate and live revision, traffic, URLs, checked rollback target/command, read-only verification results, and any failures/recovery. Record no secret values or private backup data. Commit/push only this scoped evidence and necessary links; leave the unrelated local runbook change untouched. Distinguish documentation SHA from deployed application SHA.

Return the deployment record link and a short summary: application SHA, live revision, traffic, URL, rollback, and checks. Tell Theo to hard-refresh and begin the manual checklist in the implementation/source-acceptance reports. Browser/PDF acceptance and stale-edit draft retention remain Theo's checks; availability checks do not prove those workflows.

## Boundaries and stop point

Deployment/promotion and recovery traffic actions above are approved. Stop after the verified deployment and handoff to Theo. Do not merge PR #9/#10, change their bases, run browser automation, execute imports or migration/repair/seed jobs, edit business or registry records, or apply Dispatch 12B. Do not modify the approved manifest (SHA-256 `d81ef01a59163f864f34c065c424b8ef26abf41c01c6a2d7ebdc12272dfd36a6`). Store 150's District correction and centers 001/86 remain for the separate approved-data execution process with fresh versions and reviewed recovery readiness.

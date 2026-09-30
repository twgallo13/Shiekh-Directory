# Dispatch 12C Deployment Record

Status: **Latest merged-main release deployed and promoted for Theo's manual acceptance.** This record retains the earlier 99f2b17 deployment below as history. No business data, registry record, assignment, import, migration, or repair was changed.

## Latest deployment — 2026-09-30 (merged PR #10)

### Application and provenance

- Source commit: `a5e3a7b4d685d3a37ce2888ad0294f2ed844e172` (merged PR #10 on `main`).
- Merge sequence: PR #11 `65d8b6ae0cc80a41b88d48e933e6df77248c1c07`; PR #9 `445527b1e6d85deaa6e96d31fc72edef25e97913`; PR #10 `a5e3a7b4d685d3a37ce2888ad0294f2ed844e172`.
- Deployment source: clean local `main` exactly at the source commit; `git status` was clean. The preserved runbook stash was not applied or changed.
- Cloud Run project/service/region: `gen-lang-client-0801664258` / `shiekh-location-company-directory` / `us-west1`.
- Cloud Build ID/status: `6b1b69a1-0b1f-4a2b-8761-39e180c35872` / `SUCCESS`.
- Source archive: `gs://run-sources-gen-lang-client-0801664258-us-west1/services/shiekh-location-company-directory/1790753737.061894-20555c60c44342d987523e2748c88236.zip` (generation `1790753737725387`).
- Candidate image: `us-west1-docker.pkg.dev/gen-lang-client-0801664258/cloud-run-source-deploy/shiekh-location-company-directory@sha256:0204f13899b9db7e1b7cb79652eae8b91dbd10c728b7e83ccb47b2f64ffe318a`.
- Revision/tag: `shiekh-location-company-directory-dispatch12c-a5e3a7b` / `d12c-a5e3a7b`.
- Candidate URL: `https://d12c-a5e3a7b---shiekh-location-company-directory-vwqb4tnhoq-uw.a.run.app`.

### Baseline and runtime preservation

Immediately before deployment, `shiekh-location-company-directory-dispatch12c-99f2b17` (source SHA `99f2b179094210c612458b64e30cdcd6728592f3`) was the sole percentage-bearing 100% revision and was Ready. It is the rollback target for this release.

- Candidate runtime spec matched the prior revision exactly after excluding the image; comparison fingerprint: `60dff80c422640d0b012c083a9e060c6b9ce06f62906a6435599ec79af495740`.
- Service account remained `1063064400866-compute@developer.gserviceaccount.com`.
- Existing bindings remained `SMTP_PASSWORD -> Shiekh_Location:latest` and `LOCATION_IMPORT_TOKEN_SECRET -> LOCATION_IMPORT_TOKEN_SECRET:latest`. No secret values were read, logged, rotated, or changed.
- Resources, container port, timeout, concurrency, volumes, autoscaling, CPU settings, and runtime environment were preserved. No IAM permission, OAuth client, or service configuration was changed.
- The branded mapping `shiekh-dir.ai.studio` remained `Ready` and `DomainRoutable`.

### Candidate and final health checks

- PASS: candidate revision Ready/ContainerHealthy at 0% before promotion; prior revision remained the only 100% serving revision during build and candidate checks.
- PASS: candidate, default, and branded roots returned HTTP 200.
- PASS: unauthenticated `/api/auth/me` returned structured HTTP 401 `invalid_token`; `/api/does-not-exist` returned structured HTTP 404 `api_route_not_found` on the candidate and both production hostnames.
- PASS: a fresh unauthenticated browser remained at `/` and rendered the Sign in view and Continue with Google button on both candidate and branded hostname. No sign-in/OAuth flow was initiated; non-target external browser hosts were blocked.
- PASS: after promotion, the service reported `shiekh-location-company-directory-dispatch12c-a5e3a7b` as the sole percentage-bearing 100% revision. Historical revisions remain at 0% or tag-only.

### Boundaries and rollback

No production data read/write, import, migration, repair, registry mutation, email send, OAuth/client/IAM/secret change, unrelated traffic split, or Dynamic-Qr action occurred. The only percentage traffic change was normal replacement of the Shiekh-Directory service target with the healthy revision. The approved Dispatch 12B manifest was not executed. Theo's authenticated workflow and visual PDF acceptance remain manual.

Rollback only if a genuine post-promotion health/configuration/identity failure is confirmed:

```bash
gcloud run services update-traffic shiekh-location-company-directory \
  --project gen-lang-client-0801664258 \
  --region us-west1 \
  --to-revisions=shiekh-location-company-directory-dispatch12c-99f2b17=100
```

## Previous release — Dispatch 12C `99f2b17` (2026-09-21)

## Application and provenance

- Approved application SHA: `99f2b179094210c612458b64e30cdcd6728592f3`
- Deployment source: clean detached worktree at the exact approved SHA; dirty PR checkout and unrelated runbook edit were excluded.
- Cloud Run project/service/region: `gen-lang-client-0801664258` / `shiekh-location-company-directory` / `us-west1`
- Cloud Build ID: `393aa7e5-84c9-42ac-b2d0-5aa1d5886449`
- Cloud Build status: `SUCCESS`
- Candidate image: `us-west1-docker.pkg.dev/gen-lang-client-0801664258/cloud-run-source-deploy/shiekh-location-company-directory@sha256:de7bc82f137b28a2ece66a8e8c7b79369e3d02f47bbc93a8c403d203da03ce5c`
- Candidate tag: `d12c-99f2b`
- Candidate/live revision: `shiekh-location-company-directory-dispatch12c-99f2b17`
- Documentation commit containing this record: recorded in the PR evidence after commit

## Rollback evidence

Immediately before deployment, live Cloud Run state identified the known serving revision as:

- Rollback target: `shiekh-location-company-directory-dispatch12-e74e57c`
- Previous traffic: 100% percentage-bearing traffic
- Previous tagged URL: `https://d12-e74e57c---shiekh-location-company-directory-vwqb4tnhoq-uw.a.run.app`
- Service identity: `1063064400866-compute@developer.gserviceaccount.com`

Rollback command, to be used only if a genuine post-promotion availability/configuration/identity failure is confirmed:

```bash
gcloud run services update-traffic shiekh-location-company-directory \
  --project gen-lang-client-0801664258 \
  --region us-west1 \
  --to-revisions shiekh-location-company-directory-dispatch12-e74e57c=100
```

The command was not executed because post-promotion checks passed.

## Runtime preservation

Candidate comparison against the pre-deployment service baseline passed:

- Service account matched.
- All environment variable names and non-secret values matched.
- Both secret bindings remained present: `SMTP_PASSWORD` and `LOCATION_IMPORT_TOKEN_SECRET`; no secret values were read, logged, rotated, or changed.
- Container count, ports, resources, volumes, concurrency (`80`), and runtime configuration matched. Image/revision/build metadata were the expected changes.
- Branded domain mapping `shiekh-dir.ai.studio` remained `Ready` and `DomainRoutable`.

## Candidate checks at zero traffic

Candidate URL: `https://d12c-99f2b---shiekh-location-company-directory-vwqb4tnhoq-uw.a.run.app`

- PASS: revision Ready at 0% serving traffic before promotion.
- PASS: `/` returned HTTP 200 HTML.
- PASS: unauthenticated `/api/auth/me` returned HTTP 401 JSON `{ "error": { "code": "invalid_token" } }`.
- PASS: `/api/does-not-exist` returned HTTP 404 JSON with `api_route_not_found`.
- PASS: served application assets were nonempty and included the hierarchy implementation markers.

## Final live checks

Live revision: `shiekh-location-company-directory-dispatch12c-99f2b17`

- PASS: desired and observed traffic each identify the candidate as the sole percentage-bearing 100% revision.
- PASS: Cloud Run Ready status remained healthy.
- PASS: default URL `https://shiekh-location-company-directory-vwqb4tnhoq-uw.a.run.app` returned 200 at `/`, 401 `invalid_token` at `/api/auth/me`, and 404 `api_route_not_found` at an unknown API route.
- PASS: branded URL `https://shiekh-dir.ai.studio` returned the same 200/401/404 results.
- PASS: branded application bundle returned HTTP 200 and was nonempty.
- NOT RUN: browser automation, authenticated UI/PDF workflow acceptance, and business-data verification. Theo owns those manual checks.

## Boundaries

PR #10 remains open/draft and unmerged. No Dispatch 12B execution occurred. No live assignment, import, migration, seed, repair, registry update, secret/IAM/configuration change, or browser automation occurred. The approved manifest remains unchanged. The unrelated local `docs/cloud-run-deployment-runbook.md` modification remains outside this commit.

Theo should hard-refresh `https://shiekh-dir.ai.studio` and begin the manual checklist in the Dispatch 12C implementation/source-acceptance reports. Availability checks do not prove the editing, CSV, PDF, or stale-draft workflows.

# Dispatch 12C Deployment Record

Status: **Deployed and promoted for Theo's manual acceptance.** No business data, registry record, assignment, import, migration, or repair was changed.

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

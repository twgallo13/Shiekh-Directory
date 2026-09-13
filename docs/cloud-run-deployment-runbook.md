# Cloud Run Deployment Runbook (Read-Only Recovery)

Recovered 2026-09-11 via the Cloud Run Admin API using existing Application Default Credentials in this workspace. No deploy, traffic change, or configuration change was made while recovering this information.

## Identity

- **GCP Project:** `gen-lang-client-0801664258`
- **Service name:** `shiekh-location-company-directory`
- **Region:** `us-west1`
- **Default Cloud Run URL:** `https://shiekh-location-company-directory-vwqb4tnhoq-uw.a.run.app`
- **Branded domain:** `https://shiekh-dir.ai.studio` → Cloud Run domain mapping routes to `shiekh-location-company-directory` (us-west1). Confirmed live via `gcloud beta run domain-mappings list`.
- **Artifact Registry image:** `us-west1-docker.pkg.dev/gen-lang-client-0801664258/cloud-run-source-deploy/shiekh-location-company-directory`

## Current live revision

- `latestReadyRevisionName`: `shiekh-location-company-directory-dispatch7-f73b277` (deployed from commit `f73b2774a5b5986d6d3b13b0bf79bb4020ac593b`, Dispatch 7 Person workflow correction, 2026-09-13)
- Traffic: 100%, confirmed via `gcloud run services describe` after promotion
- Autoscaling: `minScale=0`, `maxScale=20`, `cpu-throttling=true`, `startup-cpu-boost=true`

Previous production revision `shiekh-location-company-directory-dispatch7-9b9853b` (commit `9b9853b2f444154f6544cd8e0124b77e9d0dfa1d`) is retained at 0% traffic as the rollback target. The earlier `phasec` revision and other tagged, no-traffic revisions remain available for rollback/reference (`smtp`, `cfg`, `tpl`, `onboarding`, `msg`, `fbmail`, `rev-9ce8646`, `a14`, `a14b`, `smtp2`, `custom-fields`), each reachable at `https://<tag>---shiekh-location-company-directory-vwqb4tnhoq-uw.a.run.app`.

## Runtime environment (names only; no secret values other than public Firebase config)

- `NODE_ENV=production`
- `GOOGLE_CLOUD_PROJECT=gen-lang-client-0801664258`
- `FIRESTORE_DATABASE_ID=ai-studio-shiekhlocationco-00e1a479-af25-4ab6-9565-5c8b804c56a4`
- `DIRECTORY_APP_URL=https://shiekh-dir.ai.studio`
- `FIREBASE_WEB_API_KEY` — public Firebase web config (same class of value as `VITE_FIREBASE_API_KEY` in `.env.example`)
- `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_FROM_EMAIL`, `SMTP_ALLOWED_RECIPIENTS`, `DIRECTORY_STEWARD_EMAIL` — all `theo@shiekhshoes.org`
- `SMTP_PASSWORD` — sourced from Secret Manager secret `Shiekh_Location`, version `latest` (value not read)

## Deployment command (recovered pattern)

No Dockerfile, `cloudbuild.yaml`, or CI workflow exists in this repository. The image is built by Cloud Run's source deploy (Buildpacks), which runs this repo's `npm run build` then `npm start` (see `package.json`). The recovered/expected command is:

```bash
gcloud run deploy shiekh-location-company-directory \
  --source . \
  --project gen-lang-client-0801664258 \
  --region us-west1 \
  [--revision-suffix <label>] [--tag <tag>] [--no-traffic]
```

Promote a tagged/no-traffic revision to production traffic with:

```bash
gcloud run services update-traffic shiekh-location-company-directory \
  --project gen-lang-client-0801664258 \
  --region us-west1 \
  --to-revisions <revision-name>=100
```

### 2026-09-11 deployment log (commit `d5770f9`)

1. Deployed with `--revision-suffix=d5770f9`, no `--no-traffic` flag. This service's traffic spec pins revisions by explicit name rather than `latestRevision: true`, so `gcloud run deploy` created revision `shiekh-location-company-directory-d5770f9` but did **not** auto-shift traffic to it; the previous pinned revision kept serving 100%.
2. Traffic was promoted explicitly in the same pass:
   ```bash
   gcloud run services update-traffic shiekh-location-company-directory \
     --project gen-lang-client-0801664258 \
     --region us-west1 \
     --to-revisions=shiekh-location-company-directory-d5770f9=100
   ```
3. Verified: default Cloud Run URL and `https://shiekh-dir.ai.studio/` both returned `200`; `GET /api/auth/me` (no token) returned `401`; `GET /api/does-not-exist` returned structured JSON `404`.
4. Manually acceptance-tested by the product owner on 2026-09-11 (sign-in, directory bootstrap, location edit/save, correction request approval, concurrent-save conflict, admin panels, CSV export) — approved.

**Historical rollback command for the `d5770f9` deployment:**

```bash
gcloud run services update-traffic shiekh-location-company-directory \
  --project gen-lang-client-0801664258 \
  --region us-west1 \
  --to-revisions=shiekh-location-company-directory-phasec9a91bcf=100
```

### 2026-09-11 Dispatch 5 deployment log (commit `7e0d2bd`)

1. Deployed with `--revision-suffix=dispatch5-7e0d2bd` from the reviewed Dispatch 5 branch. The new Ready revision was `shiekh-location-company-directory-dispatch5-7e0d2bd`; the service's pinned traffic configuration initially kept 100% on `d5770f9`.
2. Promoted explicitly:
   ```bash
   gcloud run services update-traffic shiekh-location-company-directory \
     --project gen-lang-client-0801664258 \
     --region us-west1 \
     --to-revisions=shiekh-location-company-directory-dispatch5-7e0d2bd=100
   ```
3. Confirmed the new revision received 100% traffic. `shiekh-location-company-directory-d5770f9` remains at 0% for rollback.
4. Confirmed default and branded URLs returned `200`; unauthenticated `/api/auth/me` returned `401`; unknown API route returned `404` JSON. Browser/visual/functional testing remains the owner's responsibility.

**Historical rollback command for the Dispatch 5 deployment:**

```bash
gcloud run services update-traffic shiekh-location-company-directory \
  --project gen-lang-client-0801664258 \
  --region us-west1 \
  --to-revisions=shiekh-location-company-directory-d5770f9=100
```

### 2026-09-12 Dispatch 6 deployment log (commit `8f9fb17`)

1. Recorded `shiekh-location-company-directory-dispatch5-7e0d2bd` at 100% traffic as the rollback target.
2. Deployed from exact commit `8f9fb17269a0806a06ce3f9f458d8f34dbffea82` with `--revision-suffix=dispatch6-8f9fb17 --no-traffic`. The new Ready revision was `shiekh-location-company-directory-dispatch6-8f9fb17`; Dispatch 5 remained at 100% during build and revision validation.
3. Compared the candidate with Dispatch 5 before promotion. Service identity, runtime environment, `Shiekh_Location:latest` secret binding, container settings, ingress, and autoscaling matched; only expected revision-specific build provenance differed. The `shiekh-dir.ai.studio` mapping remained Ready and routed to this service.
4. Promoted explicitly:
   ```bash
   gcloud run services update-traffic shiekh-location-company-directory \
     --project gen-lang-client-0801664258 \
     --region us-west1 \
     --to-revisions=shiekh-location-company-directory-dispatch6-8f9fb17=100
   ```
5. Confirmed the new revision received 100% traffic. Default and branded URLs returned `200`; unauthenticated `/api/auth/me` returned JSON `401` with `invalid_token` on both hosts; an unknown API route returned JSON `404`. Rollback was not needed. Browser/visual/functional testing remains the owner's responsibility.

**Historical rollback command for the Dispatch 6 deployment:**

```bash
gcloud run services update-traffic shiekh-location-company-directory \
  --project gen-lang-client-0801664258 \
  --region us-west1 \
  --to-revisions=shiekh-location-company-directory-dispatch5-7e0d2bd=100
```

### 2026-09-12 Dispatch 7 deployment log (commit `9b9853b`)

1. Recorded `shiekh-location-company-directory-dispatch6-8f9fb17` at 100% traffic as the rollback target.
2. Deployed from exact commit `9b9853b2f444154f6544cd8e0124b77e9d0dfa1d` with `--revision-suffix=dispatch7-9b9853b --no-traffic`. The new Ready revision was `shiekh-location-company-directory-dispatch7-9b9853b`; Dispatch 6 remained at 100% during build and revision validation.
3. Compared the candidate with Dispatch 6 before promotion. Service identity, runtime environment, `Shiekh_Location:latest` secret binding, container settings, ingress, and autoscaling matched; only expected revision-specific build provenance differed. The `shiekh-dir.ai.studio` mapping remained Ready and routed to this service.
4. Promoted explicitly:
   ```bash
   gcloud run services update-traffic shiekh-location-company-directory \
     --project gen-lang-client-0801664258 \
     --region us-west1 \
     --to-revisions=shiekh-location-company-directory-dispatch7-9b9853b=100
   ```
5. The first guarded verification used an incorrect domain-mapping API endpoint, received `404`, and automatically restored Dispatch 6 to 100%. The regional domain-mapping endpoint then confirmed the branded mapping was Ready, and the same explicit promotion was retried successfully.
6. Confirmed Dispatch 7 received 100% traffic. Default and branded URLs returned `200`; unauthenticated `/api/auth/me` returned JSON `401` with `invalid_token` on both hosts; an unknown API route returned JSON `404`. Browser/visual/functional testing remains the owner's responsibility.

**Dispatch 7 rollback command:**

```bash
gcloud run services update-traffic shiekh-location-company-directory \
  --project gen-lang-client-0801664258 \
  --region us-west1 \
  --to-revisions=shiekh-location-company-directory-dispatch6-8f9fb17=100
```

### 2026-09-13 Dispatch 7 Person workflow correction (commit `f73b277`)

1. Recorded `shiekh-location-company-directory-dispatch7-9b9853b` at 100% traffic as the rollback target.
2. Deployed exact clean commit `f73b2774a5b5986d6d3b13b0bf79bb4020ac593b` with `--revision-suffix=dispatch7-f73b277 --no-traffic`. The candidate revision `shiekh-location-company-directory-dispatch7-f73b277` became Ready while the prior revision continued serving 100%.
3. Compared candidate and rollback revisions before promotion. Service identity `1063064400866-compute@developer.gserviceaccount.com`, complete runtime environment, `Shiekh_Location:latest` secret binding, resources, timeout, concurrency, ingress, autoscaling, CPU settings, probes, volumes, and VPC settings matched. The `shiekh-dir.ai.studio` mapping remained Ready and routed to this service.
4. Promoted explicitly:
   ```bash
   gcloud run services update-traffic shiekh-location-company-directory \
     --project gen-lang-client-0801664258 \
     --region us-west1 \
     --to-revisions=shiekh-location-company-directory-dispatch7-f73b277=100
   ```
5. The first guarded verification observed all expected HTTP statuses but failed its JSON-code extraction and automatically restored `dispatch7-9b9853b` to 100%. After correcting the assertion to the actual nested error shape, the same explicit promotion and full verification succeeded.
6. Confirmed `dispatch7-f73b277` is Ready and receives 100% traffic. Default and branded roots returned `200`; unauthenticated `/api/auth/me` returned structured JSON `401` with `invalid_token` on both hosts; branded `/api/does-not-exist` returned structured JSON `404` with `api_route_not_found`. Rollback was not needed after the successful promotion. No migration or browser automation was run.

**Dispatch 7 Person workflow correction rollback command:**

```bash
gcloud run services update-traffic shiekh-location-company-directory \
  --project gen-lang-client-0801664258 \
  --region us-west1 \
  --to-revisions=shiekh-location-company-directory-dispatch7-9b9853b=100
```

## Adjacent services — do not confuse with production

- `shiekh-directory-auth-canary` (us-west1) — separate canary testbed service, not mapped to `shiekh-dir.ai.studio`.
- `remix-shiekh-location-company-directory2` (us-west1) — mapped to `shk-dir.ai.studio` (a different domain), not the production `shiekh-dir.ai.studio` target.
- `shiekh-casting-v6-1-firebase` (us-west1) — mapped to `shiekh.ai.studio`, unrelated app.
- All `us-central1` services in this project belong to an unrelated loyalty/cards application, not this directory app.

## Known access gap

The exact historical `gcloud run deploy` invocations (precise flags, revision-suffix/tag conventions actually used per release) are not stored anywhere in this repository — there is no Dockerfile, `cloudbuild.yaml`, or GitHub Actions workflow. They exist only in the operator's prior shell history or Cloud Console/Cloud Audit Logs, which were not queried here. This runbook's deployment command is reconstructed from the live service's build metadata (Artifact Registry path, revision-suffix pattern, `package.json` scripts), not read directly from a stored command.

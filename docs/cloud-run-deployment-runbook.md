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

- `latestReadyRevisionName`: `shiekh-location-company-directory-pr7-94301a6-v2` (deployed from application commit `94301a6512d88db4df3d22ebaaef12f5cc5a6705`, PR #7 Dispatch 9 Location import confirmation, 2026-09-13)
- Traffic: 100%, confirmed via `gcloud run services describe` after promotion
- Autoscaling: `minScale=0`, `maxScale=20`, `cpu-throttling=true`, `startup-cpu-boost=true`

Known-working revision `shiekh-location-company-directory-pr6-800ffc12` (commit `800ffc12aa9c3f0695255ff360bcbae3b54ef4d3`) is retained as the rollback target. The PR #7 tag `p7-94301v2`, PR #6 tag `pr6-800ffc12`, Dispatch 8 tags `d8-002ac13` and `d8-d2e64bd`, and earlier tagged revisions remain available for direct revision checks at `https://<tag>---shiekh-location-company-directory-vwqb4tnhoq-uw.a.run.app`.

## Runtime environment (names only; no secret values other than public Firebase config)

- `NODE_ENV=production`
- `GOOGLE_CLOUD_PROJECT=gen-lang-client-0801664258`
- `FIRESTORE_DATABASE_ID=ai-studio-shiekhlocationco-00e1a479-af25-4ab6-9565-5c8b804c56a4`
- `DIRECTORY_APP_URL=https://shiekh-dir.ai.studio`
- `FIREBASE_WEB_API_KEY` — public Firebase web config (same class of value as `VITE_FIREBASE_API_KEY` in `.env.example`)
- `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_FROM_EMAIL`, `SMTP_ALLOWED_RECIPIENTS`, `DIRECTORY_STEWARD_EMAIL` — all `theo@shiekhshoes.org`
- `SMTP_PASSWORD` — sourced from Secret Manager secret `Shiekh_Location`, version `latest` (value not read)
- `LOCATION_IMPORT_TOKEN_SECRET` — required before deploying Dispatch 9; server-only random value of at least 32 bytes, securely provisioned with the same value on every service instance. Never log or commit the value. Prefer a dedicated Secret Manager binding rather than a plaintext environment value.

Rotating `LOCATION_IMPORT_TOKEN_SECRET` invalidates every outstanding signed confirmation token, including the browser's ability to replay an already-committed operation with its old token. Allow the 10-minute confirmation window to drain before planned rotation when practical. Durable import receipts and correlated audits remain in Firestore for operator investigation, but the user must create a new preview for any uncommitted operation after rotation.

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
5. Three verifier implementation errors triggered the safety rollback before final acceptance: the first failed to extract the nested JSON error code, a later independent check read service identity from the wrong JSON path, and a final wrapper reported an authenticated response while testing the unauthenticated endpoint. Each guard automatically restored `dispatch7-9b9853b` to 100%. The final promotion used direct unauthenticated requests with the confirmed response shape and service/revision identity paths.
6. The final corrected guard confirmed `dispatch7-f73b277` is Ready and receives 100% traffic. Service identity, secret binding, and runtime configuration matched the rollback revision. Default and branded roots returned `200`; unauthenticated `/api/auth/me` returned structured JSON `401` with `invalid_token` on both hosts; branded `/api/does-not-exist` returned structured JSON `404` with `api_route_not_found`. No rollback was needed after this successful promotion. No migration or browser automation was run.

**Dispatch 7 Person workflow correction rollback command:**

```bash
gcloud run services update-traffic shiekh-location-company-directory \
  --project gen-lang-client-0801664258 \
  --region us-west1 \
  --to-revisions=shiekh-location-company-directory-dispatch7-9b9853b=100
```

### 2026-09-13 Dispatch 8 Location CSV preview correction (commit `d2e64bd`)

1. Verified the clean checkout exactly matched `d2e64bd4398aa286182a4d308ba08525123f2d4f`. PR #5 remained draft and unmerged; PR #6 remained separate.
2. Recorded `shiekh-location-company-directory-dispatch7-f73b277` at 100% traffic as the rollback target.
3. An initial no-traffic deploy request was rejected during configuration validation because the proposed traffic tag exceeded Cloud Run's combined service-and-tag length limit. No source upload, build, revision, configuration, or traffic change occurred. Retried with the shorter tag `d8-d2e64bd`.
4. Deployed the exact commit with `--revision-suffix=dispatch8-d2e64bd --tag=d8-d2e64bd --no-traffic`. Candidate revision `shiekh-location-company-directory-dispatch8-d2e64bd` became Ready while Dispatch 7 continued serving 100%.
5. Compared candidate and rollback revisions before promotion. Service identity, environment, `Shiekh_Location:latest` secret binding, resources, timeout, concurrency, ingress, autoscaling, CPU settings, probes, volumes, and VPC settings matched; only expected image/build provenance and revision metadata differed.
6. Verified the tagged candidate root returned `200`, unauthenticated `/api/auth/me` returned JSON `401` with `invalid_token`, and `/api/does-not-exist` returned JSON `404` with `api_route_not_found`.
7. Explicitly promoted `shiekh-location-company-directory-dispatch8-d2e64bd` to 100% traffic. Guarded checks returned the same expected results on both the default Cloud Run URL and `https://shiekh-dir.ai.studio`; rollback was not needed. The branded domain mapping remained Ready.
8. No import execution, data repair, migration, merge, or browser automation was performed.

**Dispatch 8 rollback command:**

```bash
gcloud run services update-traffic shiekh-location-company-directory \
  --project gen-lang-client-0801664258 \
  --region us-west1 \
  --to-revisions=shiekh-location-company-directory-dispatch7-f73b277=100
```

### 2026-09-13 Dispatch 8 Admin bundle correction (commit `002ac13`)

1. Confirmed the deployed `d2e64bd` Admin chunk failed because the browser-reachable shared import schema loaded `csv-stringify/sync`, whose bundled initialization referenced the unavailable Node `Buffer` global.
2. Verified the clean checkout exactly matched `002ac13b85bbde1f4ddb83feb8c5606e74f5ccef`. PR #5 remained draft and unmerged; PR #6 remained separate. Lint passed, all 174 API tests passed, the production build passed, and diff-check passed. Browser automation was not run.
3. Recorded `shiekh-location-company-directory-dispatch7-f73b277` as the known-working rollback target. Deployed the exact correction with `--revision-suffix=dispatch8-002ac13 --tag=d8-002ac13 --no-traffic`.
4. Candidate revision `shiekh-location-company-directory-dispatch8-002ac13` became Ready at 0%. Its service identity, environment, `Shiekh_Location:latest` secret binding, resources, timeout, concurrency, ingress, autoscaling, CPU settings, probes, volumes, and VPC settings matched Dispatch 7; only expected image/build and revision metadata differed.
5. Verified the tagged candidate root returned `200`, unauthenticated `/api/auth/me` returned JSON `401` with `invalid_token`, and `/api/does-not-exist` returned JSON `404` with `api_route_not_found`. The served lazy Admin chunk was `AdminIntegrationsView-pbG1SbuV.js` (134,637 bytes) with zero `Buffer`, `csv-stringify`, or `csv-parse` matches.
6. Explicitly promoted `shiekh-location-company-directory-dispatch8-002ac13` to 100% traffic. Guarded checks returned the expected results on both the default and branded URLs, and `https://shiekh-dir.ai.studio` served the verified clean Admin chunk. Rollback was not needed.
7. No import execution, data repair, migration, merge, or browser automation was performed.

**Dispatch 8 Admin correction rollback command:**

```bash
gcloud run services update-traffic shiekh-location-company-directory \
  --project gen-lang-client-0801664258 \
  --region us-west1 \
  --to-revisions=shiekh-location-company-directory-dispatch7-f73b277=100
```

### 2026-09-13 PR #6 Person edit field-preservation correction (commit `800ffc12`)

1. Verified a clean isolated checkout exactly matched `800ffc12aa9c3f0695255ff360bcbae3b54ef4d3`. PR #6 remained draft and unmerged.
2. Recorded `shiekh-location-company-directory-dispatch8-002ac13` at 100% traffic as the rollback target.
3. Deployed the exact commit with `--revision-suffix=pr6-800ffc12 --tag=pr6-800ffc12 --no-traffic`. Candidate revision `shiekh-location-company-directory-pr6-800ffc12` became Ready while Dispatch 8 continued serving 100%.
4. Compared candidate and rollback revisions before promotion. Service identity, environment, `Shiekh_Location:latest` secret binding, resources, timeout, concurrency, ingress, autoscaling, CPU settings, probes, volumes, and VPC settings matched; only expected image/build provenance and revision metadata differed. The `shiekh-dir.ai.studio` mapping remained Ready and routed to this service.
5. Verified the tagged candidate root returned `200`, unauthenticated `/api/auth/me` returned JSON `401` with `invalid_token`, and `/api/does-not-exist` returned JSON `404` with `api_route_not_found`.
6. The first promotion succeeded, but a verifier selected the candidate's tag-only traffic entry, which correctly has no percentage, and triggered the rollback guard. The guard restored `dispatch8-002ac13` to 100%; Cloud Audit Logs confirmed both traffic updates succeeded.
7. Repeated the explicit promotion with a corrected assertion that requires a serving traffic entry for `pr6-800ffc12` at 100%. The candidate received 100% traffic. Default and branded URLs returned the expected `200`, `401`/`invalid_token`, and `404`/`api_route_not_found` responses. Runtime settings and the domain mapping remained unchanged; rollback was not needed after the corrected verification.
8. No data repair, import, migration, browser automation, merge, or additional feature work was performed.

**PR #6 correction rollback command:**

```bash
gcloud run services update-traffic shiekh-location-company-directory \
  --project gen-lang-client-0801664258 \
  --region us-west1 \
  --to-revisions=shiekh-location-company-directory-dispatch8-002ac13=100
```

### 2026-09-13 PR #7 Dispatch 9 Location import confirmation (application commit `94301a6`)

1. Verified the clean checkout exactly matched `94301a6512d88db4df3d22ebaaef12f5cc5a6705`. PR #7 remained draft and unmerged during deployment. Recorded `shiekh-location-company-directory-pr6-800ffc12` at 100% traffic as the rollback target.
2. Created dedicated automatic-replication Secret Manager secret `LOCATION_IMPORT_TOKEN_SECRET` and granted `roles/secretmanager.secretAccessor` on that secret only to the existing Cloud Run identity `1063064400866-compute@developer.gserviceaccount.com`. The initial random binary version was not valid for an environment binding because Cloud Run requires UTF-8 secret data; candidate `shiekh-location-company-directory-pr7-94301a6` failed closed at 0% and production traffic did not change. Added a text-encoded value with at least 32 bytes of cryptographic entropy as enabled version `2` and disabled unusable version `1`. No secret value was printed, logged, or committed.
3. A retry with tag `pr7-94301a6-v2` was rejected during configuration validation because the service name and tag exceeded Cloud Run's combined length limit. No source upload or revision occurred. Deployed the same exact application commit with `--revision-suffix=pr7-94301a6-v2 --tag=p7-94301v2 --no-traffic` and additive binding `LOCATION_IMPORT_TOKEN_SECRET=LOCATION_IMPORT_TOKEN_SECRET:latest`.
4. Candidate revision `shiekh-location-company-directory-pr7-94301a6-v2` became Ready at 0%. Compared it with the rollback revision: service identity, all existing environment settings and `SMTP_PASSWORD -> Shiekh_Location:latest`, resources, timeout, concurrency, ingress, autoscaling, CPU settings, probes, volumes, and VPC settings matched. The only intended configuration addition was `LOCATION_IMPORT_TOKEN_SECRET -> LOCATION_IMPORT_TOKEN_SECRET:latest`. The branded domain mapping remained Ready and routed to this service.
5. The tagged candidate returned `200` at `/`, structured `401` with `invalid_token` at unauthenticated `/api/auth/me`, and structured `404` with `api_route_not_found` at `/api/does-not-exist`. No import endpoint or write workflow was used as a deployment check.
6. The first explicit promotion passed URL checks, but a verifier read Cloud Run's tag-only traffic entry instead of its serving entry and restored PR #6 through the rollback guard. Repeated promotion with a JSON assertion selecting the entry whose percentage is 100.
7. Confirmed `shiekh-location-company-directory-pr7-94301a6-v2` is Ready and receives 100% traffic. Both the default URL and `https://shiekh-dir.ai.studio` returned the expected `200`, `401`/`invalid_token`, and `404`/`api_route_not_found` responses. The required import confirmation secret binding and domain mapping were present. Rollback was not needed after the corrected verification.
8. The product owner manually accepted the deployed workflow on 2026-09-13. No production import, data repair, migration, browser automation, or additional feature work was performed by the deployment agent.

**PR #7 rollback command:**

```bash
gcloud run services update-traffic shiekh-location-company-directory \
  --project gen-lang-client-0801664258 \
  --region us-west1 \
  --to-revisions=shiekh-location-company-directory-pr6-800ffc12=100
```

## Adjacent services — do not confuse with production

- `shiekh-directory-auth-canary` (us-west1) — separate canary testbed service, not mapped to `shiekh-dir.ai.studio`.
- `remix-shiekh-location-company-directory2` (us-west1) — mapped to `shk-dir.ai.studio` (a different domain), not the production `shiekh-dir.ai.studio` target.
- `shiekh-casting-v6-1-firebase` (us-west1) — mapped to `shiekh.ai.studio`, unrelated app.
- All `us-central1` services in this project belong to an unrelated loyalty/cards application, not this directory app.

## Known access gap

The exact historical `gcloud run deploy` invocations (precise flags, revision-suffix/tag conventions actually used per release) are not stored anywhere in this repository — there is no Dockerfile, `cloudbuild.yaml`, or GitHub Actions workflow. They exist only in the operator's prior shell history or Cloud Console/Cloud Audit Logs, which were not queried here. This runbook's deployment command is reconstructed from the live service's build metadata (Artifact Registry path, revision-suffix pattern, `package.json` scripts), not read directly from a stored command.

## 2026-09-21 Dispatch 12 manual acceptance deployment

1. Verified a clean detached checkout exactly matched application commit `e74e57c1a4ebb6cb553dca109b3355832282c6dc`. Its Dispatch 11 base is the previously deployed commit, and no later application commit existed on the implementation branch. PRs #9 and #10 remained open and unmerged; PR #10 remained draft.
2. Recorded the actual serving rollback baseline before deployment: revision `shiekh-location-company-directory-dispatch11-e4e332c` was the sole percentage-bearing entry at 100% in desired and observed traffic. The service and `shiekh-dir.ai.studio` mapping were Ready, and the mapping was DomainRoutable.
3. Deployed from the exact checkout with `--revision-suffix=dispatch12-e74e57c --tag=d12-e74e57c --no-traffic`. Cloud Build `2eca527a-7ffc-4c39-b766-48dc274b66ba` produced Ready revision `shiekh-location-company-directory-dispatch12-e74e57c` at 0%, with image digest `sha256:befe36a492c4d1e74f75e17c977520d693aff04ef0481e9d7dea081eb98ae900` and tagged URL `https://d12-e74e57c---shiekh-location-company-directory-vwqb4tnhoq-uw.a.run.app`.
4. Compared the candidate with the rollback revision before promotion. Service identity, every environment setting, both existing secret references, resources, timeout, concurrency, ingress, autoscaling, CPU settings, probes, container port, volumes, VPC/network settings, and execution environment matched. Only expected image, build, revision, and generated metadata differed. No secret value was read or changed.
5. Candidate checks passed: `/` returned 200; unauthenticated `/api/auth/me` returned structured 401 `invalid_token`; `/api/does-not-exist` returned structured 404 `api_route_not_found`; all 80 discovered frontend assets returned 200 and nonzero bytes. The lazy Admin bundle `AdminIntegrationsView-D6acayXL.js` was 169,858 bytes with SHA-256 `16daedf6e98e8e396ab80b740da56e36eaab69ddc5fd5253cc0d6f969e75e0f7` and contained the Dispatch 12 registry editing and conflict-review controls.
6. Two conservative promotion guards restored Dispatch 11 to 100% after verifier-only failures: the first used an invalid domain-mapping read and expected the lazy Admin chunk in root HTML; the second compared a full image reference to a bare digest and read the correct domain route from the wrong object instance. In both cases the application health checks passed, the rollback completed, and Dispatch 11 was verified as the sole 100% serving revision before retry.
7. The corrected direct guard explicitly promoted `shiekh-location-company-directory-dispatch12-e74e57c` to 100%. Desired and observed traffic identify it as the sole percentage-bearing 100% revision. The candidate tag, default URL, and `https://shiekh-dir.ai.studio` each returned 200 at `/`, 401 `invalid_token` at unauthenticated `/api/auth/me`, and 404 `api_route_not_found` at the unknown API route. Each host served entry bundle `index-prWzG0UR.js` and the exact verified Admin bundle above. The domain mapping remained Ready and DomainRoutable. Rollback was not needed after the final successful promotion.
8. No merge, browser automation, authenticated edit, production import, migration, business-data change, automatic reassignment, secret rotation, or configuration change was performed. Manual browser acceptance remains with Theo. The original worktree's pre-existing runbook update was preserved and intentionally excluded from this deployment documentation commit; it still requires separate reconciliation.

**Dispatch 12 rollback command:**

```bash
gcloud run services update-traffic shiekh-location-company-directory \
  --project gen-lang-client-0801664258 \
  --region us-west1 \
  --to-revisions=shiekh-location-company-directory-dispatch11-e4e332c=100
```

# Dispatch 15: hours correction workflow

## Scope and cause

Focused fix from reviewed main `a6f5b7dd657fb096035b9d8367ebe3a192758a16`.
Branch: `fix/hours-correction-workflow`. Root reported a Store 150 request
whose proposed hours equaled its submission snapshot; the server correctly
rejected a no-op approval. No production request or personnel payload was
sampled by this implementation.

The modal initialized from its optional prop/default rather than the actual
first selected Location, retained another store's draft when the next store
had no saved hours, and allowed unchanged submission. Review incorrectly
labeled the historical snapshot as current. Approval also retained template
linkage for a customized schedule.

## Changes and invariants

- Initialize/reset a detached hours draft from the selected Location, using
  the existing default only when saved hours are absent. Compare structures
  independently of object key order; block unchanged submission in UI and
  server. Submission waits for commit; failed saves preserve the draft/error
  and do not leave a phantom pending request.
- Show submission baseline, current requested fields from the loaded target,
  and proposed values separately. Explain no-op/stale/missing targets; disable
  Approve & Apply but retain Reject and replacement submission. Loaded values
  are not claimed to be continuously live: the server rechecks on commit.
- Require a recorded hours baseline and compare it with the persisted target
  inside the transaction. Check every requested field with a recorded baseline;
  preserve request/target versions, persisted target binding, every-field
  matching and the no-op approval guard. Missing targets/baselines and stale
  requests fail without partial target/request/audit writes.
- Hours corrections apply `hoursMode: custom` and clear `hoursTemplateId`,
  using existing attributes rather than adding status or assignment models.
  This derived mapping is shared by UI/server and never makes unchanged hours
  approvable merely by changing metadata. Explicit custom schedules stay
  custom after bootstrap even when matching a template; legacy template
  association remains compatible. New snapshots record the requested saved
  hours, not bootstrap-inferred template metadata. Supplied historical
  mode/template baselines are also checked.
- Only stewards/administrators can review pending requests, enforced on the
  server as well as UI. Approval/rejection audit UI entries and mail events
  follow successful commits. Untouched staffing, canonical IDs and unrelated
  current fields remain unchanged.

## Verification and release boundary

- Lint and production build passed (existing bundle-size warning only).
- **333/333 API/unit tests**, no failures/skips: actual synthetic HTTP changed
  hours approval, atomic persistence, no-op/key-order/metadata bypass rejection,
  stale/missing targets/baselines/versions, every-field matching, permission
  restrictions, custom-template behavior and unchanged staffing.
- **24/24 focused synthetic browser cases**: 10 hours workflow cases plus
  inbox, staffing and stale-edit regressions. SDK/API mocked, external HTTPS
  blocked; no live saves or email. Initial browser run was 8/9: its sole failure
  was an exact-text locator ignoring the existing alert's reload suffix;
  inspected page evidence showed correct rollback/error, and the assertion now
  checks the alert without weakening the required message.
- Public v1/v2 payloads, packaged guide/schema, Firebase/auth configuration,
  runtime/IAM, existing grants and production records were not changed.

At the implementation checkpoint, no production approvals, rejections,
requests, data writes, mail, migration, new credentials or deployment occurred.
Existing no-op requests require an authorized reviewer to reject or replace
them; no automatic repair occurs. Merge/deployment were deferred until root
review and the subsequent release authorization below.

## Production release: 2026-10-04

Root independently reviewed published feature
`f4680ef40260ce043f956eff0578946ed9a59617`, passed lint, **333 API/unit tests**
and production build, and merged PR #20. Exact released main:
`0171bd05c8d487c9f265ee07cfc65e0a942f6b3f`, tree
`6b9cb998f6529894b7526dfa5021a36b541cb3c4`, identical to the tested feature.
The implementation's **24 focused synthetic browser cases** passed, including
10 hours workflow cases and related inbox/staffing/stale-edit regressions.

An exact tracked-source archive was staged outside the repository. The source
upload retained only the unchanged synthetic public guide/schema and their
copying script from documentation/scripts, excluding fixtures, migration
snapshots, credentials and test artifacts. Existing SDK/ADC was used without
new login, scopes or credentials; private transient token files were removed
on success and failure.

- **Project/region/service:** `gen-lang-client-0801664258` / `us-west1` /
  `shiekh-location-company-directory`.
- **Cloud Build:** `c36183b2-6496-47db-8e1d-018dd63d9bc3`, `SUCCESS`.
- **Image digest:** `sha256:904a4f452c446aabe1de8991f697857c554eb51ab42ecc6f855fe26cbbc7e2c3`.
- **Ready revision:** `shiekh-location-company-directory-hours-0171bd0`.
- **Desired AND observed traffic:** sole 100% hours revision; every other
  revision has zero percentage traffic.
- **Rollback:** `shiekh-location-company-directory-personnel-139d49a`, Ready.
  This is the immediately preceding field-compatible personnel release,
  not an older inbox build.
- **Tags:** all 26 historical tag/revision mappings preserved; temporary
  `hrs-0171bd0` removed after successful production verification.

Root independently accepted the zero-traffic candidate's exact documentation,
HTML/cache behavior, new RequestsView labels/no-op message, assets, Firebase
fingerprint and API denial responses before authorizing promotion.
Traffic-only Cloud Run v2 updates preserved configuration and historical tags.
An automatic failure guard would restore the original personnel-139d49a
sole100 traffic; no post-promotion rollback was needed. An initial pre-mutation
guard looked for the shared no-op message only in the RequestsView chunk;
it was corrected to inspect all application scripts, where the shared helper
is packaged. No traffic changed during that failed precheck.

Both default `https://shiekh-location-company-directory-vwqb4tnhoq-uw.a.run.app`
and branded `https://shiekh-dir.ai.studio` hosts passed:

- Schema/guide: 200, `no-store`, exact unchanged source bytes. SHA-256:
  `681422b53b45d47c2b3f2c186dd730569884b36804ff93eb9e1500744e3e4ace`
  and `e42e057ea0488f62eac99f21cffb24fd11c3d4fa0b70386bc5955a11ccecc5fd`.
- Root, `/locations/loc-150/edit`, `/index.html`: 200 HTML, `no-store`,
  absent ETag/Last-Modified, with and without the historical weak ETag/date
  validators. Identical candidate HTML SHA-256:
  `eff36e6b2cb46d7edeaf353d25e491cc6c7982cc8a640081466fd6a118f95eba`.
- Entry `index-Cf2k0plj.js` and 43 application assets: 200, nonempty,
  identical asset hashes between hosts. Historical submission/current loaded
  record labels and the shared no-op explanation are present.
- Compiled public Firebase settings and allowed-origin guard unchanged.
- Unauthenticated auth/v1 locations/v2 snapshot/personnel/location-staffing:
  JSON 401 `invalid_token`; unknown API: JSON 404 `api_route_not_found`.
- Service/revision Ready; branded mapping Ready/DomainRoutable.

### Configuration baseline and normalization caveat

Prior external release wrappers/baseline files were absent. A fresh,
explicitly normalized read-only baseline was captured before staging and
matched after staging and promotion. These hashes must not be equated to
dispatch14's differently normalized runtime/service/build hashes:

| Baseline | SHA-256 |
|---|---|
| Runtime | `d5b3e7244be43f7bf0306a3131d6584cc870781936cbcf8538795cea479cde74` |
| Service | `d56b9157b8b0127b024b595983f2c96b7f0faa86dac1f3b68ab7da06bd5f5dc9` |
| Public build settings | `9497076226a32507bdcb65203d15b82c4ee8faf64c52b9fb516763ea228f81a3` |
| Public Firebase | `440f6973f893ca7adcfe0dc36a93208fe1164193753e884a5a6716630243fd5a` |

All use recursively key-sorted JSON, retaining array order. Runtime is the
complete v2 template excluding revision, image and generated client metadata.
Service retains user/security/network/scaling/build configuration, excluding
generated state, template, traffic and client metadata; build configuration
excludes name/source/image provenance. Public build settings are the complete
unchanged build-environment map. Firebase uses sorted
`apiKey/appId/authDomain/projectId`; this fingerprint matches dispatch14.
Root's independent Firebase serialization also matched its
`33f28e8aacbee283d0332ac161d7412da3f2ca687820e399ae7a3c8bb2b1bfa3`
baseline.

Runtime/build service-account identities, service IAM, secret references and
configuration were unchanged. No application/schema/guide edits accompanied
this release-record follow-up. Token files are absent and the owned synthetic
Vite server is stopped.

**No production approval, rejection, request submission or business-data write
was performed.** No private payload sampling, email, real clients/grants,
auth/IAM changes or migration occurred. Successful changed-hours approval is
verified using synthetic HTTP/transaction/browser tests, not a live approval.
Production evidence covers deployment, public assets/cache/configuration and
unauthenticated denial guards; it does not certify live request outcomes.

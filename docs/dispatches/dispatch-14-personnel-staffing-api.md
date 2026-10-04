# Dispatch 14: reusable personnel and staffing API

## Governance and scope

First release from reviewed main `d3a31de23729ff52d47fcd894d3b51db9f1247cf`.
Branch: `feat/personnel-staffing-api`. No deployment, production records,
live client grants, credentials, Firebase/IAM/runtime changes or ownership
migration are authorized by this implementation checkpoint.

Contract: [guide](../personnel-staffing-api.md),
[OpenAPI](../personnel-staffing-openapi.json),
[source ownership manifest](../personnel-staffing-ownership.json).

Reuse five Location staffing fields, canonical persisted People/Location and
hierarchy IDs, and distinct workplace/Supports. Contacts excluded. New explicit
client scopes, full pinned-readTime snapshots, no v1 payload changes. Bootstrap
canonical roster is no longer altered by name-based migration; hours-template
compatibility remains. Legacy diagnostics remain separately reviewable.
Regional Manager projection/copy parity and strict ambiguous lifecycle handling
are included without automatic historical-data repair.

## Review checkpoint status

WIP `6c5cf4eefcb024ea6a6ff77476ac944a75732120` was saved and published through
the existing VS Code control for independent review. Review corrections keep
canonical `*Id`/`*Ids` strings separate from the read-only derived `staffing`
object, include valid Draft lifecycle, and use bounded reference-only field
masks instead of roster scans/full-document reads. Store numbers are descriptive
attributes, never a unique lookup authority; joins and lookups use canonical
document IDs only. Reporting CSV columns remain unchanged.

Failures are not hidden: the first full API run had 317/320 passing (a brittle
source-regex guard and two reporting regressions). The retained guard was
updated for explicit scopes; legacy reporting lifecycle behavior was restored
without weakening manager-phone expectations. Subsequent API run: 321/321.
The first browser run was aborted after fixture project/domain configuration
failed the unchanged Firebase guard. The next run passed 8/13 and exposed
incorrect test locators plus a real absent-list/default-empty unrelated-save
bug. Unchanged list roles now retain their original presence and copied history.
A later focused run passed 16/18 and exposed that an untouched Person
phone-privacy default was triggering Location copy propagation. The form now
preserves untouched privacy/lifecycle/name aliases; propagation checks actual
changes, not merely supplied keys. The unrelated-save assertions were kept.

Final acceptance:

| Check | Result |
|---|---|
| `npm run lint` | Passed |
| `npm run test:api` | 322/322 passed; 0 failures/skips |
| `npm run build` | Passed, including public documentation packaging |
| Synthetic browser suite | 18/18 passed; 320/390/1280px parity and related regressions |
| Packaged public docs | Isolated production-mode HTTP: schema/guide 200, no-store, exact source match; unlisted ownership manifest 404 |
| Strict OpenAPI validation | Actual list/detail/null/snapshot and 400/401/403/404/409/503 payloads validated; extra fields and object-valued canonical IDs rejected |
| Git whitespace check | Passed |

Browser acceptance command:

```sh
npx playwright test test/auth.browser.spec.ts --grep 'Staffing parity|Personnel scopes UI|Location inbox|Person territory|PrintSheetView|Location Edit and Fleet|Location Edit hierarchy' --workers=1
```

Tests run against localhost Vite with a synthetic SDK, synthetic key/app ID,
the existing required **public** Firebase project/domain identifiers, and blocked
external HTTPS. APIs are mocked for browser writes; server tests use in-memory
synthetic fixtures. No live saves, sends, scope grants or new authentication.
The build retains the existing large-chunk warning; no unrelated dependency
upgrades or forced audit fixes were performed.

Production build packaging now includes only the synthetic guide/schema in
`dist/api-docs`. A future source-upload ignore must retain those two source
documents and the build script. No runtime configuration changes are needed.

## Acceptance and rollback

Require lint, API/unit regression suite, production build and synthetic browser
checks. Cover scope storage/request rejection, legacy-only grants, immediate
grant rereads/generation, rotation/revocation, cursor/dataset isolation, source
readTime coherence, null/error/list/detail parity, five roles, lifecycle/aliases,
and UI-versus-persisted unrelated-save preservation. No production saves.

Rollback must deny new v2 grants/endpoints before using an old build: old scope
authentication hard-coded `locations:read` regardless of stored grants.
Reverting blindly could grant v1 access to a newly personnel-only client.
No staffing data migration was performed. Keep existing canonical fields.
At the implementation checkpoint, release remained blocked on root review.
Shell Git/CLI authentication was not
available for the WIP push; root used the existing VS Code publish control.
No credentials or authentication configuration were created or changed.

## Production release: 2026-10-04

Root independently reviewed PR #18 and merged exact application source
`139d49aa172bb3fcb5149bf8ce1bc15aa289a50e`, tree
`9a653d05c3e284218bc59a286c51027ce4bd5fbf`, identical to tested feature
`e7890812ab7ce817aa93fc3125e31aa71113090b`. Root independently passed lint,
322 API/unit tests, production build and JSON Schema 2020 validation of
synthetic HTTP envelopes. The implementation's 18 synthetic browser checks
passed; no production saves or personnel-data sampling were performed.

An exact tracked-source archive was built outside the repository, preserving
the existing five public browser build settings from service metadata and
including the two packaged public documents and copying script. Cloud SDK
585.0.0 used existing ADC; temporary access-token files were mode 0600 and
removed on both failure and success. No new login, scopes or credentials.
The source-upload ignore was confined to the external staging directory.
Initial CLI attempts rejected an unsupported ignore flag and an overlong tag;
the supported staging `.gcloudignore` and short review tag were used instead.

- **Project/region/service:** `gen-lang-client-0801664258` / `us-west1` /
  `shiekh-location-company-directory`.
- **Cloud Build:** `7163ba48-b310-4441-a2f5-1ff666c8ce87`, `SUCCESS`.
- **Image digest:** `sha256:09eefe014ceeac6d2f85305cea484bdf27e53fcb5022ed73bb6c994b0344d39f`.
- **Ready revision:** `shiekh-location-company-directory-personnel-139d49a`.
- **Final desired and observed traffic:** sole 100% personnel revision;
  every other revision has zero percentage traffic.
- **Rollback:** `shiekh-location-company-directory-inbox-fa08cc1`, Ready,
  zero percentage traffic, historical `inbox-fa08cc1` tag retained.
- **Tags:** all 26 historical tag/revision mappings preserved; temporary
  `ppl-139d49a` review tag removed after successful production checks.

Root independently accepted the zero-traffic candidate before authorizing
promotion. A Cloud Run v2 traffic-only update avoided mixed legacy allocation
types. The promotion guard would restore `inbox-fa08cc1` to 100% on a failed
post-promotion check; rollback was not needed.

Both default `https://shiekh-location-company-directory-vwqb4tnhoq-uw.a.run.app`
and branded `https://shiekh-dir.ai.studio` hosts passed:

- `/api/openapi.json` and `/api/personnel-guide`: 200, `no-store`, exact
  reviewed git-object bytes. Schema SHA-256:
  `681422b53b45d47c2b3f2c186dd730569884b36804ff93eb9e1500744e3e4ace`;
  guide: `e42e057ea0488f62eac99f21cffb24fd11c3d4fa0b70386bc5955a11ccecc5fd`.
- Root, `/locations/loc-150/edit` and `/index.html`: 200 HTML, `no-store`,
  absent ETag/Last-Modified, including stale weak-ETag and 1980 date validators.
  HTML SHA-256: `ca9060d17a12369480a655cfc2f53c4688002b6d645b90588b8bfb9797be904c`.
- Entry `index-DIcFzyr-.js` and 42 recursively discovered application assets:
  200, nonempty; compiled Firebase settings and allowed-origin guard preserved.
- Unauthenticated `/api/auth/me`, `/api/v1/locations`, `/api/v2/snapshot`,
  `/api/v2/personnel` and `/api/v2/location-staffing`: JSON 401 `invalid_token`;
  unknown API route: JSON 404 `api_route_not_found`.
- Service/revision Ready and branded mapping Ready/DomainRoutable.

Configuration fingerprints matched the read-only preflight under the same
normalization throughout staging and promotion:

| Baseline | SHA-256 |
|---|---|
| Runtime | `0895b3f0cf0ea148324145003cf01d88756237b57728d2de3e96ea4c134533f4` |
| Service | `614da8f616ee8e8f7f5774d97850b2f379b36f79c6b76617f939e56746770388` |
| Build settings | `920508614325485e6236da4a0e09bec8c77968b37b721d67779e605b0d4c8285` |
| Public Firebase | `440f6973f893ca7adcfe0dc36a93208fe1164193753e884a5a6716630243fd5a` |

Fingerprints use recursively key-sorted JSON: the complete runtime template
excludes image/revision/generated build-client metadata; service includes
security/network/scaling/user metadata and build configuration without
name/source/image provenance. Public Firebase uses sorted
`apiKey/appId/authDomain/projectId` keys. Root's independent public-config
serialization also matched its prior `33f28e8aacbee283d0332ac161d7412da3f2ca687820e399ae7a3c8bb2b1bfa3`
baseline. Different serializations are not directly comparable.

Runtime/build identities, secret references, Firebase configuration and
IAM/auth settings were not changed. No real client scopes/grants or clients
were created, no business records read/written, and no mail sent.
**No successful authorized live API payload was sampled.** Contract/data-shape
evidence is from reviewed source and synthetic tests, not production personnel
records. `inbox-fa08cc1` is compatible while no new grants exist; apply the
scope-protection warning above before any later old-build rollback.

## Deferred decisions

Personnel contact publication, titles/department, ownership cutover, territory
single-manager policy, delta/tombstone feed, production grant approvals and
consumer integrations remain out of scope. UI parity is certified only against
synthetic fixtures, not a live-data inventory.

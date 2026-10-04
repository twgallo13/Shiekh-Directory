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
Release remains blocked on root review. Shell Git/CLI authentication was not
available for the WIP push; root used the existing VS Code publish control.
No credentials or authentication configuration were created or changed.

## Deferred decisions

Personnel contact publication, titles/department, ownership cutover, territory
single-manager policy, delta/tombstone feed, production grant approvals and
consumer integrations remain out of scope. UI parity is certified only against
synthetic fixtures, not a live-data inventory.

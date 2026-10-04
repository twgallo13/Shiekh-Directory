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

WIP source saved for independent review. Verification is in progress; do not
treat this checkpoint as passed tests or release approval.

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

## Deferred decisions

Personnel contact publication, titles/department, ownership cutover, territory
single-manager policy, delta/tombstone feed, production grant approvals and
consumer integrations remain out of scope. UI parity is certified only against
synthetic fixtures, not a live-data inventory.

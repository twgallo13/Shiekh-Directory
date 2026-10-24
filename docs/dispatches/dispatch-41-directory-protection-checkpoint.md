# Dispatch 41 — Directory-only database protection checkpoint

October 23, 2026 Pacific (activation October 24 at 03:44 UTC).

## Completed, distinct from an application deployment

- PR #63 merged as `bb4ae89`, tree-identical to tested head `9676888`, with final completed clean code/security reviews and resolved inline findings. The accessible staffing-removal UI is **source-merged, not deployed or enabled**.
- Owner approved Directory-only protection repair after compatibility checks. PR #64 merged as `5612c4c830f248dd1fd11c17063b9e51544534a3`, tree-identical to final reviewed head `a33f148`. Final Codex code review completed clean; the valid fixture-isolation finding was repaired/resolved. CodeRabbit's status is success but its final review was rate-limited; no paid review or fresh CodeRabbit approval is claimed. A separately requested security review did not report a distinct completed security result; do not claim one.
- Applied exactly [the reviewed client policy](../../security/directory.firestore.rules) to **only** the approved Directory named-database release. An immediate pre-change full-release comparison rejected drift; Google compiled the immutable source before activation; read-back matched it after activation. All **five other release resources** compared unchanged. Private baseline/source and application receipts are retained outside the repository.
- Seven live anonymous, read-only random-document lookups returned HTTP403 `PERMISSION_DENIED`: users, audit, transition operations, people, locations, API token storage and system. No real document contents were requested and no live write probes were used.
- The existing signed-in People page freshly reloaded before and after activation and loaded current Directory data. Existing server/API reads remain usable through their IAM-authorized backend. This is not authenticated consumer-token/pagination acceptance for issue #36, a live staffing-write test, or a complete external-consumer audit.
- Production read-only acceptance of the exact recovery-list query shape (actorUid/state equalities, limit 51) returned HTTP 200/zero documents with a random synthetic actor lookup. No new index was needed or created.

## Compatibility and validation boundaries

Current/proposed and serving PR #53 browser source use authenticated server/API access rather than direct Firestore client calls. Examined the older documented Directory authentication testbed's public static bundle: Firebase library-name/version registry text is not active Firestore transport code. A targeted Dynamic QR repository search found no reference to this exact database ID. Missing audit results do not prove absence of clients; these are bounded compatibility observations, not a universal claim about unknown external software. No adjacent service or other database was modified.

Final local policy acceptance passed **330 permission-denied assertions** across 22 collection/nested paths, three client identities and five operations, plus separate real server SDK continuity on synthetic data. The initial shared-demo-namespace finding was fixed: each run now owns a fresh demo project and cleans only its own data. Final affected rerun, types, whitespace and applicable non-approved-host guard passed; unchanged application test/build results were reused. Local emulator stopped afterward. See [policy/run instructions](../../security/README.md) for emulator limitations and named-production selection safeguards.

Only the official Rules testing dev dependency was added; no pre-existing package version changed. The package audit also reports pre-existing dependency advisories requiring separate triage; baseline presence is not evidence of safety. No forced broad upgrade was performed as part of this database-policy repair.

## Next gate — stop for the owner's infrastructure-isolation decision

The limited signing-secret setup has **not** been performed: no secret/value/version or secret-read grant was created, and no runtime identity changed. Compatibility inspection found an infrastructure-isolation question that could make the prior limited approval broader than intended. Details and the owner's pending choice are retained privately; do not silently grant access, create a new server identity, or alter shared/project IAM.

If the owner approves Directory-only identity isolation, first inventory the Directory's required database, Firebase sign-in-check, mail/import and new signing permissions, including inherited access; propose/validate least-privilege mappings, preserve all other apps and identities, then use a guarded zero-traffic candidate before any production switch. Do not claim a new identity alone proves secret isolation without inspecting effective access. Otherwise keep the new staffing workflow off and review the plan with the owner.

**Runtime remains PR #53 `62acacb`, sole 100% at `shiekh-location-company-directory-pr53-62acacb`.** No new application image/traffic, staffing/contact/account permission, API grant/token, data restore, migration, or real mail operation occurred. Consumer API responses/documents are unchanged by this policy-only checkpoint. Later work remains approved signing setup after this new scope decision, guarded staffing-workflow release, broader Region/acting/offboarding work, data restoration and issue #36 consumer acceptance.

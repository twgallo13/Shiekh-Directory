# Dispatch 26 — Person contacts and canonical SM/AM inbox responsibility

## Scope and current state

Owner-approved continuation after PR #41 and documentation main `abb15b4`. [PR #43](https://github.com/twgallo13/Shiekh-Directory/pull/43) is merged and published; see the checkpoint below. Related issue [36](https://github.com/twgallo13/Shiekh-Directory/issues/36) remains open for authenticated consumer payload and acceptance; avoid closing keywords even in negated PR text, because GitHub auto-closed it on the earlier merge. Its current grant wording was corrected and status reopened before this slice.

Use existing Location inbox and optional Person work contact, not app-specific schema or email identity. Canonical SM/AM assignments define read-only responsibility; workplace/support, titles, provider/domain or matching emails do not. A rare SM's optional individual company address is supported. No accounts/mailbox/provider permissions, live staff contacts, assignments, data restore, credentials/grants, private Notion content or other apps are changed.

## Audit and implementation

- Existing Person editor allowed a store mailbox as Person work contact despite its label; the detail card showed inboxes from workplace/support but omitted actual SM/AM responsibility. Added one reusable read-only panel to editor/detail and clear optional individual-work-email labeling, with legacy/shared/invalid contact review warnings and no automatic migration.
- Shared conventional-mailbox recognition is reused by UI, Directory server writes and the unchanged v3 contact projection. Server validation checks changed `email` and `workEmail` against the transaction's existing Location snapshot plus proposed Location writes, retaining old keys for same-transaction clearing/deletion safety. No extra queries or account fields are needed. Untouched historical aliases/contacts remain writable; intentional canonical clears suppress legacy fallback.
- Active Fleet CSV is Location-only, preserving inbox duplicate acknowledgment, explicit null clearing and Store Number identity. Person correction categories do not accept email; interactive Person writes use the guarded Directory commit. Privileged historical migration/restore scripts bypass that path and are neither changed nor run; later restores require their own policy review.
- Create Person already uses a random stable ID, not email; verified in the source and retained. No provider/domain-to-role mapping or duplicate-account creation is introduced. V1/v2/v3 wire shapes/scopes are unchanged; no individual SM/AM API export is added.

## Checklist and evidence

- [x] Audit relevant UI/contact helpers, canonical assignment sources, Directory commit validation, request fields and import/restore boundaries.
- [x] Implement optional individual contact and canonical SM/AM read-only inbox panels, legacy-preserving shared-contact write guards, and reuse existing API eligibility helper without a new wire contract.
- [x] Final serial API/unit regression: 530/530 passed. Affected Person-card browser regression: 13/13 passed, covering canonical SM/AM responsibilities, optional individual contact, legacy-preserving edits, client shared-contact blocking, clear/no-fallback and existing position/save/recovery behavior. Final type check and production build passed (existing bundle-size advisory only). Mobile screenshot inspected; no horizontal overflow. All data synthetic; no live writes or authenticated consumer acceptance.
- [x] Review/fix the PR, then merge/deploy using the existing no-traffic/config-preserving release gate. No live business mutation is part of publication. Latest-head code/security reviews completed with no remaining findings; publication evidence below.
- [ ] Separately verify authorized consumer authentication/payload and obtain consumer acceptance. No token retrieval/rotation or actual staff contact repair is implied.

The initial affected API/unit run passed 35 of 36 cases; one new fixture omitted a required Location write version, so it reached the concurrency guard instead of the intended email guard. Fixed the fixture; all six new responsibility/write-guard cases passed. Initial browser run passed three of four cases; the new mobile test's unscoped email text matched both the list and modal. Scoped it to the modal. These test setup repairs did not weaken application checks. Final evidence is recorded above and below.

Codex code review of initial `b1ba61e` found a valid edit-then-restore bug: the touched flag could block saving an unchanged legacy shared contact. Fixed the client to compare normalized effective values and skip contact serialization when unchanged, including legacy-only aliases (no promotion into `workEmail`). Added canonical and legacy-only undo regressions. Post-fix affected unit cases passed 12/12 and affected browser cases 2/2, plus final types/build. The prior 530-case server suite and 13-case broader Person-card browser run remain applicable where unchanged; neither is claimed rerun after this scoped client fix. Latest code and security reviews of `378ba8e265` completed with no remaining findings; the original thread is resolved. CodeRabbit was included-rate-limited, not reviewed/paid.

## Publication checkpoint — October 22, 2026 Pacific

Merged source `2f94e444e44aa4594ba460bf35b771e6762ef238`, tree `ef574a7025f3a0cce1ae0b526b6a9d3a11b8daa4`, exactly matches final reviewed/tested head `378ba8e2655b728ac335d060dcb387bea116d657`. Build `30fe8b44-88f3-456b-8b49-ee8e4e0dc34b` succeeded with unchanged build principal. Revision `shiekh-location-company-directory-pr43-2f94e44` is Ready at sole 100% desired/observed traffic. The no-traffic preview passed before concurrency-guarded promotion; final service configuration/identities, Firebase fingerprint, 26 historical routing tags and branded Ready/DomainRoutable mapping are preserved. Only temporary `p43-2f94e44` was removed.

Both production addresses match HTML SHA-256 `959db7899bbfba5c08e5f6e4aee95c889f93158aa772ec410c4339f8d7933cd6` and 45 unique MIME-validated JS/CSS assets. HTML no-store/no-conditional-cache, API v1/v2/v3/operating unauthenticated denial and unknown-route guards passed. All four served API documents retain the PR #41 hashes: OpenAPI `681422b53b45d47c2b3f2c186dd730569884b36804ff93eb9e1500744e3e4ace`, personnel guide `0459eff1d2bfb006d555e93bb6889c3bad4f8c0dba95b26217a9fbeb6c995cf5`, leadership guide `972643ca5223224a6b25304f9058fd794bb3295242e63bdd45e7220a90c97b3b`, leadership OpenAPI `e1723fba5af00d8be576064b14cfa7fecebe66e8f20b69a543d6b2746ce9dfaf`.

The existing authenticated browser session was refreshed with no open draft, and the Person detail/editor showed the new legacy-shared-contact warning, canonical SM/AM responsibility panel and optional individual-work-email help. The editor was cancelled without changes. No authenticated API-consumer payload, contact repair, notification delivery or actual mailbox access is claimed. Existing Shiekh-Intel grants/token and Dynamic QR are unchanged. Issue 36 remains open. Documentation-only checkpoint updates need no application rebuild.

Next bounded work is explicit opt-in mapping of an eligible legacy individual contact into canonical `workEmail`; no automatic alias promotion or shared-mailbox backfill. Consumer acceptance and broader hierarchy/offboarding/Region/acting work remain separately tracked in the maintained plan.

## User guidance and rollback

See [Person contacts and store inboxes](../person-contacts-and-store-inboxes.md) and the owner-clarification checklist in the main plan. No served API artifact changes are required because response shapes/scopes/eligibility remain unchanged from PR #41. Update documentation pointers/checkpoints when actually published; do not rebuild only for a release-record edit.

Prefer forward repair. Older writers can reintroduce shared mailboxes into Person contacts, while existing PR #41 API withholding still protects those conventional addresses. A code rollback does not undo legitimate Person/Location writes. Preserve IDs, intentional clears, grants and all prior hierarchy/position/request/status/address safeguards; never restore an old collection or rewrite staff data to undo this UI change.

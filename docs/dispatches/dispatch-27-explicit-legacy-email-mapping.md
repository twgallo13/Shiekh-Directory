# Dispatch 27 — Explicit legacy individual email mapping

## Scope and state

Owner-approved bounded slice from documentation main `193432b`, after PR #43 (`2f94e44`). [PR #45](https://github.com/twgallo13/Shiekh-Directory/pull/45) is merged and published; exact checkpoint below. This is not a data migration or consumer-acceptance claim. Tracking issue [36](https://github.com/twgallo13/Shiekh-Directory/issues/36) stays open for authenticated consumer payload/acceptance.

## Contract and implementation

- Only a syntactically valid, non-shared legacy-only `Person.email` with **no own `workEmail` property** is a candidate. Existing canonical values, including blank/null and deliberate clears, are never overwritten by this action. Conventional store-number mailboxes and known Location inboxes are excluded case-insensitively. Unknown ownership is not verified by syntax; the administrator must intentionally choose an address assigned to that person.
- The Person editor offers **Use as individual work email**. A focus-managed confirmation previews historical source, canonical destination and contact-only limitations. **Stage email mapping** updates the draft only; normal **Save Person** still confirms the versioned Directory commit. Cancel preview sends nothing. A staged banner and **Undo email mapping** distinguish draft from persistence. Later typing into the email field cancels the mapping intent, so returning to the same normalized address remains a no-op without fresh opt-in.
- Revalidate the candidate against current Person/Location props at Save; changed source or newly known shared inbox blocks the staged mapping. The unchanged server validation independently checks changed canonical contact syntax/shared inboxes, permission and record version. No new route, server bypass or extra database query. Preserve legacy source, Person ID, all unrelated fields and assignment/account/mailbox state.
- Existing busy/duplicate-save, known rejection/draft retention and unknown-outcome/no-repeat locks remain. No new scopes, wire fields, SM/AM API contact export, email identity matching, mailbox provisioning, account access, staff backfill, Notion edit or consumer-app change. Existing v3 contact eligibility still applies after an intentional canonical save; mapping does not verify company sign-in or grant a client access.

## Validation and release gates

- [x] Audit candidate/no-op helper, Person editor and existing Directory version/contact/permission guards.
- [x] Affected contact/server-guard unit tests: 13/13 passed. New mapping + existing contact-preservation browser cases: nine passed initially; the in-flight case expected an Undo button that correctly disappears when the existing optimistic context supplies canonical email. Corrected the assertion to check disabled email/Save controls and close lock; that single case passed. Ten distinct browser cases therefore passed incrementally, not a claimed all-ten rerun. Types and production build passed (existing bundle advisory only). Synthetic 390px confirmation screenshot inspected; readable, focused Cancel and no page overflow. Broader existing Person-card regression is recorded separately below when complete.
- [x] Broader Person-card/position/responsibility regression: 11/12 passed initially; one timed out at mocked session restoration before opening the editor. The unchanged case passed in isolation alongside the strengthened mapping preview test (2/2). Added a scoped Escape guard so closing the nested preview cannot also close the Person editor; the preview test now verifies Escape preserves the editor. All 22 distinct affected browser cases have passing evidence incrementally, not a claimed single full rerun. Final types/build after the Escape guard passed. No real sign-in/data writes were used.
- [x] Review findings, merge and publish through the existing no-traffic/config-preserving release gate; exact source/build/revision and both-host checks below.
- [ ] Separate authorized consumer payload/full-sync/contact-withholding/acceptance. No token retrieval or live contact save is part of this release.

Reuse PR #43's unchanged server/API evidence. Rerun affected contact/server-guard and Person-card tests for this client-only slice; do not repeat the full suite merely for prose edits. Mobile screenshot uses synthetic names/contacts only. Publication must preserve build/runtime identities, Firebase, protection/configuration, historical tags and branded routing. Documentation-only checkpoint commits require no rebuild.

## Next and rollback

After this bounded slice, continue the existing hierarchy/lifecycle audit for guided promotion/offboarding and Region/acting ownership, keeping live inventory/staffing decisions and any restore separate. Consumer acceptance remains independent and does not authorize changes in another app.

Prefer forward repair; the preceding PR #43 retains the shared-contact write guard but lacks explicit mapping UX. Traffic rollback does not undo intentionally saved canonical contacts. Never restore People/Locations or remove credentials/grants to undo this UI feature. Preserve all earlier hierarchy, position, request, status and address protections.

## Publication checkpoint — October 22, 2026 Pacific

Merged source `1b122fe9234b58c081655472e95fe0f4b4c3ab51`, tree `1ddf782ce662ea5f993ff55b724352c7f13c330b`, matches reviewed head `975fa42d186526148ef286d58c27dfba76b552e2`. Latest Codex code/security reviews completed without remaining findings. The initial review identified the same nested Escape issue repaired during keyboard audit; thread resolved and strengthened regression passed. CodeRabbit was rate-limited, not reviewed or paid. Four changed Markdown files / 67 relative targets and whitespace passed before merge; reuse successful applicable checks for prose-only release records.

Build `5a8f752b-1ef3-4c16-820e-cf245eb270a4` succeeded with unchanged principal. Ready revision `shiekh-location-company-directory-pr45-1b122fe` is sole 100% desired/observed traffic. No-traffic candidate passed before concurrency-guarded promotion; final configuration/identities/Firebase, 26 historical tags and branded Ready/DomainRoutable routing are preserved. Only temporary `p45-1b122fe` was removed. Both production addresses match HTML SHA-256 `276bf60e704cc618df73962d3e8a67bcb45234250e87b11f5612f5d30dbe1bca` and 45 MIME-validated JS/CSS assets. No-store/conditional-cache, v1/v2/v3/operating authentication-denial and unknown-route guards passed. All four served API documents retain the exact PR #41/#43 hashes recorded in Dispatch26; no wire field, grant or API artifact changed.

The existing authenticated People page restored after a no-draft refresh; no real Person was mapped or saved as a release probe. Interactive mapping/preview/save/permission/recovery acceptance is synthetic, not claimed as a live staff write or consumer payload. Existing Shiekh-Intel grants/token, Dynamic QR, private Notion, staffing, accounts/mailboxes and providers remain unchanged. Issue36 is open. Documentation-only checkpoint commits need no application rebuild.

Next bounded implementation is P3.1's source-aligned, read-only promotion/offboarding dependency preflight, before coordinated staffing/access writers or Region/acting ownership. Restricted inventory, real staffing/access choices, restore and external consumer acceptance remain separate gates.

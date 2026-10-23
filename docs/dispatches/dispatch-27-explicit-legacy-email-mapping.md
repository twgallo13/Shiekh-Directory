# Dispatch 27 — Explicit legacy individual email mapping

## Scope and state

Owner-approved next bounded slice from documentation main `193432b`, after deployed PR #43 (`2f94e44`). Branch `codex/explicit-legacy-email-mapping`. Implementation is not a publication or data-migration claim; record review and release separately. Tracking issue [36](https://github.com/twgallo13/Shiekh-Directory/issues/36) stays open for authenticated consumer payload/acceptance.

## Contract and implementation

- Only a syntactically valid, non-shared legacy-only `Person.email` with **no own `workEmail` property** is a candidate. Existing canonical values, including blank/null and deliberate clears, are never overwritten by this action. Conventional store-number mailboxes and known Location inboxes are excluded case-insensitively. Unknown ownership is not verified by syntax; the administrator must intentionally choose an address assigned to that person.
- The Person editor offers **Use as individual work email**. A focus-managed confirmation previews historical source, canonical destination and contact-only limitations. **Stage email mapping** updates the draft only; normal **Save Person** still confirms the versioned Directory commit. Cancel preview sends nothing. A staged banner and **Undo email mapping** distinguish draft from persistence. Later typing into the email field cancels the mapping intent, so returning to the same normalized address remains a no-op without fresh opt-in.
- Revalidate the candidate against current Person/Location props at Save; changed source or newly known shared inbox blocks the staged mapping. The unchanged server validation independently checks changed canonical contact syntax/shared inboxes, permission and record version. No new route, server bypass or extra database query. Preserve legacy source, Person ID, all unrelated fields and assignment/account/mailbox state.
- Existing busy/duplicate-save, known rejection/draft retention and unknown-outcome/no-repeat locks remain. No new scopes, wire fields, SM/AM API contact export, email identity matching, mailbox provisioning, account access, staff backfill, Notion edit or consumer-app change. Existing v3 contact eligibility still applies after an intentional canonical save; mapping does not verify company sign-in or grant a client access.

## Validation and release gates

- [x] Audit candidate/no-op helper, Person editor and existing Directory version/contact/permission guards.
- [x] Affected contact/server-guard unit tests: 13/13 passed. New mapping + existing contact-preservation browser cases: nine passed initially; the in-flight case expected an Undo button that correctly disappears when the existing optimistic context supplies canonical email. Corrected the assertion to check disabled email/Save controls and close lock; that single case passed. Ten distinct browser cases therefore passed incrementally, not a claimed all-ten rerun. Types and production build passed (existing bundle advisory only). Synthetic 390px confirmation screenshot inspected; readable, focused Cancel and no page overflow. Broader existing Person-card regression is recorded separately below when complete.
- [ ] Review findings, merge and publish through the existing no-traffic/config-preserving release gate; record exact source/build/revision and both-host checks.
- [ ] Separate authorized consumer payload/full-sync/contact-withholding/acceptance. No token retrieval or live contact save is part of this release.

Reuse PR #43's unchanged server/API evidence. Rerun affected contact/server-guard and Person-card tests for this client-only slice; do not repeat the full suite merely for prose edits. Mobile screenshot uses synthetic names/contacts only. Publication must preserve build/runtime identities, Firebase, protection/configuration, historical tags and branded routing. Documentation-only checkpoint commits require no rebuild.

## Next and rollback

After this bounded slice, continue the existing hierarchy/lifecycle audit for guided promotion/offboarding and Region/acting ownership, keeping live inventory/staffing decisions and any restore separate. Consumer acceptance remains independent and does not authorize changes in another app.

Prefer forward repair; the preceding PR #43 retains the shared-contact write guard but lacks explicit mapping UX. Traffic rollback does not undo intentionally saved canonical contacts. Never restore People/Locations or remove credentials/grants to undo this UI feature. Preserve all earlier hierarchy, position, request, status and address protections.

# Dispatch 45 — Directory cards and search

October 25, 2026 Pacific. The owner approved continuing the contact-first UX roadmap. PR74 merged normally as `6d43b033a2695e9715b386f012d7ba38ffe76f88`, final source head `c7e4467d6dbca7c88231f968fe43a14cc13dcd6c`.

## Scope and behavior

Store cards show complete wrapping address/suite, mall, phone classification, inbox and canonical Store/District Managers. Card opening and bulk-selection controls are separate. Table and District-group store names now have keyboard-accessible opening buttons; the main table preserves suite details without address truncation. Existing operating/hierarchy resolvers remain authoritative. Retired states and malformed saved inbox warnings remain explicit.

People cards distinguish individual work contacts, shared store contacts and historical/invalid contact values. Phone classification sits beside the phone. Linked workplace and District ownership replace unqualified historical territory text in the summary; historical data remains in the editor/detail disclosure. Inactive/unknown lifecycle is labeled rather than silently treated as active.

Search results show street/suite/postal details and controlled position labels, with canonical District discovery. Optional display titles remain searchable for custom/corporate positions. When that field produces the match, the result explicitly labels it `Display title`, separate from controlled positions. Card/result buttons expose full visible details through accessible descriptions while retaining concise action names. Mobile inputs and result wrapping fit narrow screens.

The existing bulk-action copy no longer promises immediate Google Business Profile publication. The bulk write/confirmation/recovery rules are unchanged. No API schema, credential, staffing, account, access, mailbox or other-app operation is part of this release.

## Source isolation

Release branch `codex/directory-list-live-release` pins **`c7d19381a2d0573941eb5175fcea4d2c2ee862f0`**, based on deployed Person editor source `bdf62e66364c9e8665f0c5d17a9eac5e901a5ad2`. Only LocationsView, PeopleView, UniversalSearchModal and compatible auth.browser tests differ. All three runtime blobs match the reviewed PR head exactly. Server/API/auth/provider/dependency/data-writer code and consumer documents remain unchanged. Newer main-branch staffing/session/controller code remains excluded; do not deploy main wholesale.

## Validation and review

The initial exact isolated source passed 11 synthetic browser cases, including mobile/desktop cards/search, keyboard selection/navigation, canonical District-owned leadership and existing bulk confirmation/uncertain-save/preflight safeguards. Two additional table keyboard cases passed. Contact repair ran six affected cases, including two new malformed/historical-contact regressions. The final accessibility repair reran six mobile/desktop cases with accessible-description and display-title assertions. There are **15 distinct applicable scenarios**; successful unchanged checks were reused rather than counted as additional tests. Main/release types, final isolated production build and whitespace passed; existing bundle-size warning remains. Mobile screenshots were inspected. An initial preview environment misconfiguration was corrected without changing sign-in rules.

Automatic Codex review identified two contact-label findings; automatic CodeRabbit review identified card/result accessibility and display-title matching concerns. Contact/accessibility findings were repaired and regression-tested. The display-title concern was addressed by explicit matching-field labeling, preserving intentional search of custom titles. All review threads were resolved with evidence. Final-head CodeRabbit status subsequently reports SUCCESS with no unresolved threads. No fresh final-head Codex/security review is claimed. Normal exact-head merge protections applied; no administrator bypass, on-demand review or billing change was used.

## Publication checkpoint

Build `3a727ead-3adf-4548-8229-16bf1ee30188` succeeded at `2026-10-25T10:09:05.204712Z`. Ready revision **`shiekh-location-company-directory-ux74-c7d1938`** passed zero-traffic candidate acceptance, exact-source/configuration/IAM/build-principal checks, etag-guarded promotion and temporary-tag cleanup. Desired and observed traffic are sole 100%. Runtime/build identities, environment/secret references, network/security/scaling and service IAM remain unchanged. Temporary tag `u74-c7d1938` was removed; all 26 historical tags remain. Branded mapping is Ready/DomainRoutable.

Both production hosts match accepted HTML SHA-256 `56d824d3b055ef2a198af5c2f75e014c86035f939773741b7e62f69ff01a31cf` and 46 MIME-validated assets. Compiled Firebase fingerprint remains `440f6973f893ca7adcfe0dc36a93208fe1164193753e884a5a6716630243fd5a`; all four served consumer-document hashes remain unchanged. Protected API/operating/internal-preview denials, unknown-route and cache checks passed. This does not imply authenticated LP-Intel acceptance.

A superseded initial candidate was never promoted; only its temporary route was retired under configuration/IAM/traffic checks. An intermediate prepared source was not built. No production data was changed during tests. The dedicated Chrome verification tab reached the normal Google account chooser, but that popup stopped responding to browser input/screenshot capture. It was closed without changing credentials or access. Desktop/mobile visuals were verified with synthetic browser tests; a signed-in production card inspection remains unconfirmed for this release. Existing user tabs were not refreshed or changed.

## Remaining work

Next UX slice: Organization settings, correction forms and empty/error states, using concise labels and retaining real warnings. Provider status must use actual integration evidence. Data cleanup/restore remains separate.

Dedicated-runtime switching, effective-access/shared-IAM cleanup, signing setup, protected staffing activation and issue36 authenticated LP-Intel acceptance remain incomplete. Other apps' repair releases stay with their owners. Existing API grants/tokens are unchanged. Prior UI revision `shiekh-location-company-directory-ux72-bdf62e6` is the code-only rollback target; traffic rollback does not restore data or reverse database protection. Documentation-only follow-ups require no rebuild.

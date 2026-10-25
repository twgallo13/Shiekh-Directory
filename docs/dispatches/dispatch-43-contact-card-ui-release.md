# Dispatch 43 — contact-first cards, isolated production release

Published October 24, 2026 Pacific (October 25 UTC). The owner asked to deploy the UX while other agents complete shared-app updates. PR70 is merged and the card cleanup is live; shared runtime/security/staffing activation remains separate.

## Exact scope and source

PR70 merged normally as `e0d7f472d1b325ac17c2378b993ab6ad91d3b66d`, source head `e6cbb53abb083c2a6f0409ca4f5678775a5d5053`. Instead of publishing all newer main-branch code, release branch `codex/contact-card-live-release` pins **`b2d26fe1bbc70c3cf9ff008bdac361c147409765`** on the verified live PR53 lineage `62acacb42ba4590d0523f0aff78abf52630e1d46`.

Exactly five tracked paths differ from that live base: LocationDetailModal, OperatingStatusPanel, PersonDetailModal, PersonInboxResponsibilities and compatible auth.browser tests. The four runtime component blobs match the reviewed PR70 head exactly. Server/API/auth/provider/dependency/hierarchy/data-writer source and served consumer documents remain the live base. The protected staffing command backend, new session/controller and Person editor removal workflow from newer main are excluded. The source branch is retained for release reproduction.

## User-visible behavior

Store Overview prioritizes address/suite/directions, phone/inbox, today's applicable hours and linked leadership. Metadata/verification/custom fields are in Details; ordinary status controls are in Hours & status; audit history remains available. Resolved closure deadlines, specific operating warnings, refresh failures and uncertain-save recovery stay visible on Overview. One persistent status panel prevents stale pending recovery after switching tabs during a save.

Person cards use concise contact rows and linked locations, omit empty read-only inbox panels and preserve warnings for historical/shared/invalid contacts. Store Manager roster numbers require the canonical work source and retain their existing phone classification; saved legacy numbers remain in the Person record. Email links use normalized recipients. A compact disclosure distinguishes assigned store contacts from verified mailbox access. No assignment, contact value, account or permission was edited. Unsupported static Google sync success is removed.

## Validation and review

- Before final review repair: 16 distinct affected browser cases passed on main. After contact/diagnostic fixes: seven affected cases passed. These are successive checkpoints, not additive independent suite totals.
- The exact isolated live-base source passed 19 applicable synthetic browser cases. After the persistent-panel repair, the new delayed-recovery/tab-switch case and ten affected operating/diagnostic cases passed. There are **20 distinct applicable scenarios**, not 30 tests. Existing unchanged results were reused.
- Final isolated source TypeScript/build and main TypeScript passed, with the existing chunk-size warning. Source allowlist, exact reviewed component equality, clean checkouts and whitespace passed. Synthetic desktop/mobile screenshots were inspected; production data was not used for write tests.
- Original Codex and CodeRabbit findings were addressed; the Codex inline thread was resolved. The later CodeRabbit advisory tab-switch finding was fixed and regression-tested. Final automatic CodeRabbit status reports Review completed/SUCCESS. No fresh final-head Codex or security review is claimed. Merge used normal exact-head repository protections, without administrator bypass.

## Guarded publication and live acceptance

Build `3e687c90-d5e1-45f8-8e60-182b84003f5a` finished successfully at `2026-10-25T04:13:12.292963Z`. Ready revision **`shiekh-location-company-directory-ux70-b2d26fe`** was first staged with zero production traffic. The exact source, observed generations, build principal, normalized service configuration, service IAM and historical routes matched the private baseline. Public candidate checks verified the application asset graph, compiled Firebase settings, four unchanged consumer documents, protected API/operating/internal-preview denials, cache protections and unknown-route handling.

Promotion required the exact accepted candidate etag. Final desired and observed traffic are sole100% on that revision, with configuration/IAM/identities preserved. Only temporary candidate tag `u70-b2d26fe` was removed; all 26 historical tags remain unchanged. Branded mapping is Ready/DomainRoutable. Both branded/default hosts match accepted HTML SHA-256 `50ef245fd2fe245840bd2487d9f789c4d458c1d672e4160bddf34973eed38e66` and all **45** MIME-validated assets. Firebase fingerprint remains `440f6973f893ca7adcfe0dc36a93208fe1164193753e884a5a6716630243fd5a`; all four served consumer-document hashes are unchanged.

The owner's existing signed-in browser session restored after refresh. Broadway LA's live address/contact-first card and the linked Store Manager Person card rendered correctly, including the shared-contact qualification. Inspection was read-only: no status, staffing, Person, Location, correction, account, credential, mail or import operation was submitted. Existing test notices/data were preserved.

## Remaining work and rollback

The dedicated-runtime switch, effective access/shared-permission cleanup, signing setup and protected staffing activation remain held. This release neither deploys nor depends on the other agents' Welcome Gift/Dynamic QR claim repair. Issue36 authenticated LP-Intel API acceptance and data restoration remain open. Existing API grants/tokens, OAuth/provider configuration and other apps are unchanged. Do not interpret this UI release as clearance to deploy all current main.

For UI rollback, the immediately prior revision `shiekh-location-company-directory-pr53-62acacb` retains the same backend contract. Traffic rollback does not restore business data or undo the Directory-only client policy. Keep the existing security/workflow gates and prefer a scoped forward repair. Next UX work follows the [contact-card audit](../plans/contact-card-ux-audit.md): Person editor grouping/guidance, list/search cards and Organization/correction screens.

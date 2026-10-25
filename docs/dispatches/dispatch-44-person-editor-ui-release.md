# Dispatch 44 — Person editor UX

October 25, 2026 Pacific. The owner approved autonomous build, verification and publication of the next contact-card UX slice. PR72 merged as `5acfa60d25f269af362f6238f16a3af480458693`, final source head `5695f6869d45c4dd1755477a887427363d45f67a`.

## Scope

The editor now uses flatter sections, compact explicit-position choices, concise contact guidance, expandable support-location selection and historical detail. Selected support links remain visible; store numbers distinguish locations sharing a name. Unavailable saved workplace/support links remain visible and are preserved during unrelated saves. Position-change warnings and acknowledgment sit beside the choices, and current management assignments expand when positions change. The fixed save/cancel footer remains usable on mobile.

Save handlers, uncertain-save recovery, close/duplicate-submit locks, email mapping confirmation, assignment eligibility and inactivation guards are unchanged. Work inboxes remain separate from individual contact email and account access. No promotion, staffing, contact, status, account or permission mutation was performed in production.

## Source isolation

Release branch `codex/person-editor-live-release` pins **`bdf62e66364c9e8665f0c5d17a9eac5e901a5ad2`**, based on deployed UI70 source `b2d26fe1bbc70c3cf9ff008bdac361c147409765`. Only PersonEditorForm, PersonLocationRelationshipFields and compatible auth.browser tests differ from that base. Server/API/auth/provider/dependency/data-writer code and served consumer documents remain unchanged.

Main's Person editor already includes unpublished staffing recovery logic, so the full editor blobs intentionally differ. The release guard verifies unchanged live-base save/guard prefix and dialog/footer suffix, equal reviewed presentation after excluding the held main-only recovery control, and an identical relationship component. Main's newer protected staffing/session/controller code remains excluded. Do not deploy current main wholesale.

## Validation and review

The initial exact isolated source passed 27 focused synthetic browser scenarios: desktop/mobile layout, explicit concurrent positions, role/inactivation safeguards, legacy email mapping, unavailable-link preservation and failed/uncertain saves. After the automatic CodeRabbit finding, four affected scenarios and a new same-name support-removal regression passed. There are **28 distinct applicable scenarios**, reusing unchanged results rather than adding repeat runs. Main/isolated types and final isolated build passed; the existing large-bundle warning remains. Mobile and desktop screenshots were inspected.

CodeRabbit's automatic final-head review completed successfully; its support-label finding is resolved. No on-demand review was triggered and no fresh separate Codex/security review is claimed. Merge used the exact tested head and normal repository protections.

## Publication checkpoint

Build `6a06ac8a-c83e-4c3a-967c-b3fba0e158cf` succeeded at `2026-10-25T09:22:18.990082Z`. Ready revision **`shiekh-location-company-directory-ux72-bdf62e6`** passed zero-traffic candidate acceptance, exact-source/configuration/IAM/build-principal checks and etag-guarded promotion. Desired and observed traffic are sole 100%. Runtime/build identities, environment/secret references, network/security/scaling and service IAM are preserved. Temporary tag `u72-bdf62e6` was removed; all 26 historical tags remain. Branded mapping is Ready/DomainRoutable.

Both production hosts match accepted HTML SHA-256 `0ae31c2f9677d1e6c9b85efac8bdb679dd03f3b4d8a0c5692795ed9aacfa02f0` and 45 MIME-validated assets. Compiled Firebase fingerprint remains `440f6973f893ca7adcfe0dc36a93208fe1164193753e884a5a6716630243fd5a`; all four served consumer-document hashes are unchanged. Protected API/operating/internal-preview denials, unknown-route and cache checks passed. No authenticated consumer acceptance is implied.

The owner's signed-in session restored after refreshing the read-only USC Village card. Its linked District Manager opened the deployed editor with the compact position layout, existing historical-position warning, optional support/history disclosures and fixed footer. Inspection was read-only; Cancel returned to the Person card. No staff/contact/position/status/account update was submitted. The card remains consistent with the existing historical data; the release does not silently convert suggested positions to explicit ones.

A superseded pre-review-repair candidate was built with zero production traffic; its temporary tag was removed with configuration/IAM/traffic checks. It was never promoted. One candidate acceptance invocation had a mistyped expected guide hash; the comparison was rerun with the already recorded correct fingerprint and passed. No source or cloud configuration was changed to bypass that check.

For UI rollback, prior revision `shiekh-location-company-directory-ux70-b2d26fe` retains the same backend contract. Traffic rollback does not restore data or reverse database protection. Preserve existing security/workflow gates. Documentation-only follow-ups require no rebuild.

## Remaining work

Next UX work: list/grid/search cards, then Organization/correction screens and empty/error states, following the [maintained audit](../plans/contact-card-ux-audit.md). Provider status must use actual evidence rather than a static success badge.

Dedicated-runtime switching, effective-access/shared-IAM cleanup, signing setup, protected staffing activation, data restore and issue36 authenticated LP-Intel acceptance remain separate and incomplete. Other apps' repair releases remain owned by their agents. Existing API credentials/grants are preserved.

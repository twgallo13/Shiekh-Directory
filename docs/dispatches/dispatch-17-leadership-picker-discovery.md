# Leadership picker discovery repair

## Observed issue and bounded scope

The owner reported that the District Manager dropdown in the live Location editor showed every employee. Read-only inspection of the open editor confirmed this; the same active-person list populated DM, RM, SM, Assistant Manager and Key Holder slots. No live field was changed or saved. The owner does not need to replace a real manager for testing.

The previous assignment contract deliberately allowed any active canonical Person and deferred stricter position eligibility. This repair changes discovery defaults, not that server policy: each picker defaults to people whose recorded position matches its label. It does not introduce controlled positions, change application access, migrate staffing, or establish district-owned leadership. Those remain [plan](../plans/directory-consistency-plan.md) Phase 2/3 work.

## Behavior

- One shared discovery helper recognizes a small explicit set of case/whitespace-normalized position labels and abbreviations for DM, RM, SM, Assistant Store Manager and Key Holder. A nonblank job title takes precedence over the compatibility `role`; matching is not fuzzy and does not infer acting roles or promotion eligibility.
- Both direct Location selectors and the Store Manager request selector use this helper. Only unique active Person IDs become new candidates. Inactive, lifecycle-conflicting and duplicate-ID entries are excluded even in show-all mode.
- An explicit, initially unchecked **Show all active people (unusual titles or cross-role coverage)** control preserves access to the existing assignment workflow for unusual descriptive titles and legitimate cross-role/non-retail coverage. The Location control resets on target change. This is not a bypass of newly introduced eligibility rules: no such rules are added by this repair. The current active-Person server contract remains authoritative.
- Existing assignments outside the default candidate set remain visible, including missing IDs and absent copied names. They are marked **Current assignment — review position/status**, retained by ID, and disabled as new choices in the filtered list. Opening a form or toggling discovery does not clear an assignment or submit a write.
- Added accessible names to all five direct selectors. Changing descriptive titles does not grant application permissions. No existing Person record was modified or auto-classified.

Karlo's displayed status and real replacement/vacancy remain a separate offboarding decision. This change cannot truthfully remove an otherwise active listed DM merely because the owner reported departure; the guided handover and lifecycle repair are still required.

## Validation

- 10 new helper tests passed: all five roles/aliases, unrelated/Former titles, conflicting title aliases, inactive/unknown/duplicate identities, explicit show-all opt-in, input preservation, all-slot current-assignment retention, and missing/inactive records.
- Complete API/unit suite: **393 passed**, 12 suites, zero failures/cancellations/skips/todos. TypeScript check and production build passed; the existing bundle-size warning remains.
- Synthetic editor browser case passed for default DM/RM/SM/AM/KH filtering, unusual and missing current assignments, explicit show-all and zero commits. Of three existing request cases, two passed and one timed out restoring synthetic sign-in on the cold test app. All three request cases then passed (23.3 seconds) with strengthened abbreviation/show-all coverage and no further product-code changes. Final applicable browser evidence: four cases passed; only the affected request cases were repeated.
- Browser tests use localhost, synthetic authentication/rosters/commits and blocked external HTTPS. No production assignment, correction submission, review, notification or private payload export is used as a test.

## Remaining work

Controlled operational positions and server-enforced eligibility across direct writes, correction approval and imports are not implemented here. Do not mark P2.1/P2.3 complete or treat a discovery filter as security. Keep API staffing identifiers and v1/v2 scopes unchanged. Broader pending-request validation/save feedback, hierarchy ownership, offboarding and immediate expiring closures remain planned work.

This record initially describes an unmerged repair branch. The final PR, source and release evidence are appended after review/publication; no live release is claimed by the tests above.

## Review amendment

PR #24 initially used source `ecef4d908ea0738cf2e8fc4c758732ab969a5130`. Codex completed review without findings. CodeRabbit requested including the canonical ID when an unresolved current assignment has no copied display name. The fallback now includes that ID while retaining the same option value and current-only behavior; all 10 affected helper tests passed again with an explicit assertion. Added function documentation for the two touched editor helpers. The broader successful 393-test and browser results remain applicable; the amendment changes only this fallback label and comments.

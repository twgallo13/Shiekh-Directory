# Dispatch 32 — explicit positions for new leadership assignments

October 23, 2026 Pacific. Implements the first bounded slice of the [owner's clarified rules](../plans/positions-and-assignments-rules.md). Publication/review evidence belongs on the implementation PR; this document does not assert deployment.

New leadership grants require an explicitly mapped Position, not a legacy title or cross-role picker override. Shared eligibility covers direct writes, District assignment previews, correction proposals and CSV import. Selectors no longer offer “show all active people” as an eligibility bypass. Existing unmatched assignments remain visible/current-only, with no data backfill. The People filter says Positions, not Roles.

Changed CSV arrays validate new members' positions while preserving retained members' historical mapping; existing identity/lifecycle checks remain enforced. Synthetic fixtures explicitly map eligible new assignees rather than relying on title text.

Validation: the initial full synthetic suite passed 565 of 569 cases; four obsolete title-only grant fixtures were corrected. The affected groups and eight new cross-path regression cases then passed 101/101. Final TypeScript check and production build passed (existing chunk-size warning); five affected synthetic browser checks passed, covering keyboard correction selection, District confirmation/success/stale failure, hierarchy inheritance and current-only legacy selectors. Eighty-five local documentation links and whitespace checks passed. Initial browser attempts stopped at missing/incorrect local sign-in configuration, corrected using dummy credentials and the required public identifiers with external requests blocked. Further final review evidence belongs on the PR. No test changes live staff data.

Not included: coordinated position removal/vacancy writer or UI, Region-owned RM/acting migration, data restore, account/mailbox changes, public API field changes, consumer grants or consumer acceptance. Existing removal blockers remain until the next bounded writer/recovery slice is ready. No complete-offboarding or deployment claim.

Three additional synthetic Person-card checks passed: concurrent position mapping preserves assignments/account access, removing required positions remains blocked, and mapping existing responsibilities requires resolved Active lifecycle. Total distinct browser cases: eight.

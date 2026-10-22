# Dispatch 20 — Request review integrity and draft isolation

## Scope

Owner authorized continued autonomous improvements on October 22. Baseline is clean main `4d400541d36b63d7f9887da575f8f34baabd51f6`; deployed application source is PR #28 `444351f8913db5fcfb94691a729d9dcfbe84e34c`. This bounded next slice addresses parts of P1.2/P1.3/P1.4, not all Phase 1 work.

The lower-priority owner request for District Manager work email in the API is recorded as **P6.9**. No API email field, contact exposure, scope or credential change is included here.

## Findings and implementation

- Review actions previously returned before persistence, optimistically replaced request/target records, and restored entire captured arrays on failure. The screen could show approval prematurely and a failed review could overwrite unrelated newer local state.
- Approval/rejection now return promises, wait for server reconciliation, and add local audit/notification work only after confirmation. There are no optimistic request/target updates or whole-array rollback in this path. Notification failure remains separate from the committed review.
- Review UI locks both actions and reviewer input while saving, retains notes on failure, and shows local saving/error feedback. Any failed/uncertain review requires an explicit reload of saved requests before another review from that screen. The same persisted request ID/version and terminal-state guard protect against duplicate review writes; no blind automatic retry occurs. Reload warns that unsaved notes will be cleared. This is not a new idempotency receipt system.
- Server permits only Pending → Approved/Rejected review transitions with existing steward/admin permissions and exact versions. Submitted target, category, proposed changes, baselines, original requester/timestamp/reason and other submission fields cannot be rewritten. Older review clients may omit fields: the server preserves them rather than erasing history. Terminal history cannot be reopened or deleted. Invalid historical requests remain rejectable without rewriting their content.
- Location/category changes explicitly reset all proposal fields and notes; the form explains this behavior. Submission locks its fields and close/discard controls until its existing save promise finishes.

## Boundaries and remaining work

No live request approval/rejection, personnel assignment, account update, import, restore, notification or credential is used as an acceptance probe. Keep the testing DM unchanged and preserve all existing owner-tested hierarchy state. No API wire changes or unrelated application/cloud changes.

This does **not** complete per-category allowlists/value validation, required baselines for every request field, normalized phone/no-op coverage for every type, new-submission operation receipts/outcome reconciliation, or end-to-end review metadata attribution. These remain P1.2/P1.3/P1.4 follow-ups. Address/wayfinding corrections, immediate expiring closures, controlled eligibility and full hierarchy cutover also remain in the plan. Do not mark the full Phase 1 checkboxes complete from this slice.

## Validation and release state

In progress on `codex/request-review-integrity`; not yet merged or deployed. Reuse successful unaffected evidence and rerun only changed or failed areas. Record final tests/review/release evidence here before declaring publication.

- Initial changed-source API/unit run: 443 tests, 440 passed, three existing hours fixtures failed because their submitted review payload no longer matched the deliberately changed stored request. Those fixtures are corrected to review the persisted content so they continue exercising the original no-op/stale/missing-baseline guards instead of first triggering the new immutability guard. Assertions are not weakened.
- Synthetic browser acceptance includes held approval/rejection, duplicate-action locks, preserved notes, lost-response reload without a second commit, draft reset, and applicable existing hours/inbox/leadership regressions. No live business data is used.
- After fixture correction, all 54 affected persistence/request tests passed; the subsequently added concurrent approve/reject test also passed. The unchanged successful tests from the initial 443-case run are reused rather than describing a fresh aggregate run.
- Eighteen distinct applicable browser cases were validated across incremental runs. The initial 17-case run passed 16; the new lost-response assertion first matched the Approved filter as well as the badge, then its narrowed raw-text matcher missed badge whitespace. Inspected page evidence showed the saved Approved state and changed target. The final whitespace-aware badge assertion passed, retaining the one-commit/no-retry assertions. The four other affected/added cases passed after mobile/saving-state refinements, including held submission with disabled inputs/close and explicit saving feedback. Remaining successful unaffected cases were reused.
- TypeScript and production build passed after the last application changes, with the existing large-bundle advisory. The synthetic mobile held-approval screen was visually inspected. Final PR review and production release remain pending.

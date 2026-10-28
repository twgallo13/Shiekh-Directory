# Location creation browser recovery

October 28, 2026 Pacific. Review slice based on Dispatch 65. **Source only; no production deployment or activation.**

## Delivered behavior

Both the full Create Location editor and Admin Fleet CSV → Add Store use the private creation protocol when its verified capability permits commands. One Create action freezes the actual JSON command, durably retains only its actor-scoped identity, prepares and commits once. It adds no extra approval screen. New retail records still inherit the canonical District and Region Primary managers independently; the existing custom metadata, inbox acknowledgment and server validators remain authoritative.

An uncertain reply locks the draft and offers Check result or Cancel pending creation. Neither recovery action retries creation. A missing or merely prepared result is unresolved until cancellation seals its original identity. Cancellation refreshes saved data before offering Review retained draft; that deliberate action selects a fresh creation identity. A committed receipt must match the exact actor/location audit digest and pass a complete, session-fenced saved Directory refresh before its marker is forgotten. A later-removed Location does not turn a historical committed receipt into a new create; the UI does not invent a View link.

The two creation surfaces share a non-waiting actor tab lease, separate from Person/roster/move leases. Effect disposal and sign-in boundaries fence late callbacks, release the lease and discard protected form state. Synchronously discarded React effects are cancelled before lease acquisition. Browser Web Locks does not support its signal option with `ifAvailable`; cancellation is handled locally and any late grant is released. Ordinary legacy-cache cleanup preserves the new marker namespace; explicit sign-out still clears all protected storage. Returning sign-in discovers server preparations.

Only existing Active Company-wide System Administrators, Directory Data Stewards and Editors may use this flow. A creation-specific strict refresh admits those existing writers; default Person/roster/move refresh remains administrator-only. The existing authenticated bootstrap already returns the same Directory seed. No roles, grants, login links, consumer scopes or public API shapes change.

## Rollout and compatibility

Loading, unavailable, partial or paused capabilities never become generic-save permission. Before an intentional legacy save, capabilities are checked again. All-off compatibility requires a complete server adapter and a successful live-authority, complete pending-admission check showing no unresolved server creation for this actor. A retained local marker still blocks compatibility. This prevents a sign-out or another device from hiding pending work while recovery gates are off.

PR95's verified review finding required a complete adapter before advertising legacy permission; its narrow repair is also in this slice. No private mutation falls back to the generic writer. The all-off compatibility path remains the pre-activation generic writer, not the new receipt guarantee. Quick Add now uses one stable draft ID on that path too, rather than generating another ID on each manual retry.

## UX and draft limits

Quick Add keeps its heading and actions usable at 360×800; its fields scroll inside the modal. Recovery actions sit outside the disabled fields. Both surfaces retain details while recovery is open, and success is shown only after confirmation. Closing an unresolved full editor explains that its form draft is discarded but the recovery identity is retained. A known commit awaiting refresh is described as created, rather than unsaved.

Draft fields and frozen commands are memory-only. Closing/unmounting or reloading the full editor does **not** promise to restore its old unsaved details; reopening restores receipt recovery by identity, not stored contact data. The recovery service can also discover preparations from another device. No synthetic preview writes production data.

## Validation

- Focused controller/refresh cases cover identity-before-mutation, exact frozen command, blocked storage, lost reply/reopen, cancellation, failed strict refresh, actor audit mismatch, pending discovery, paused capability, stable role checks, sign-out, separate leases, discarded mounts and action-time legacy admission.
- Native HTTP → Store → Firestore SDK acceptance includes all-off compatibility with/without pending work, paused recovery, actual successful commit with a deliberately lost response, controller disposal/reopen through strict bootstrap refresh, one Location/version/audit per deliberate create, and live authority loss. Test process flags are restored. The partial planner fixture was completed with Corporate's required Store Number for the full-bootstrap journey; strict refresh was not relaxed.
- Actual components were exercised in an isolated synthetic browser under React StrictMode. Desktop full editor: one prepare/commit, dropped successful reply, failed first refresh, close with retained identity and reopen → original version-1 record with both managers, still one prepare/commit. Mobile Quick Add: first commit rejected, fields retained and locked, cancel → strict refresh → Review retained draft → a fresh deliberate create and one confirmed Location with both managers. Two deliberate attempts produced two prepare/commit calls, not an automatic retry. Heading/actions remained visible after mobile layout cleanup.
- Final ordinary suite, type check and release-build results are recorded in the PR/checkpoint. Existing bundle-size advisory remains unrelated to this slice.

This is not provider or production acceptance, completed independent review, or completion of the broader roadmap. Continue linked lifecycle/type/removal/correction workflows, wider import/concurrency/consumer acceptance, independent exact-source review and guarded migration/release/rollback/production checks. All activation gates stay off. Do not deploy whole main or change LP, Dynamic QR, IAM, credentials, consumer grants, test restoration or unrelated apps.

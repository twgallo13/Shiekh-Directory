# Dispatch 71 — Integration repairs for refreshed dependency reviews

This cumulative source slice addresses nine review findings on PR77/78/80/90/91/93 without changing the old PR heads or claiming their original commits were clean. Original review threads remain evidence of those commits; these later repairs need independent review together before release. No merge, deployment, activation, permissions, credentials, other-app work or data restoration.

## Finding disposition

- PR77 / discussion4407759122: preparation hashes unit/member selections as sets. Equivalent reordered retries return the existing receipt. Receipt validation retains the original finite JSON hash for older saved reviews, and unchanged review bindings/recovery outcomes are preserved. Different reason/Primary/version remains different intent.
- PR78 / discussion4407758046: signed Person compatibility distinguishes legacy non-retail location-owned RM slots from inherited retail Region copies. Later lifecycle-owned non-retail Locations still reject retail leadership. No eligibility/access/roster bypass.
- PR80 / discussion4407760477: Person card and registry both expose responsibilities when recovery is enabled even if catalog/new commands are paused.
- PR80 / discussion4407760484: closing an in-memory prepared review asks before discarding choices and explains that the unfinished review remains recoverable. Escape/backdrop/header share the registered close handler. Back to responsibilities still seals cancellation and refreshes first.
- PR90 / discussion4407768515: move cancellation marks a draft retained only for the current displayed review with actual source/destination choices. Recovery of server-only pending work returns to a fresh form with no false retained-draft acknowledgement.
- PR91 / discussion4407760137: District parent editing includes saved/latest/selected parent Region ownership. A managed destination is unavailable for a legacy generic parent change; saved-parent reset/name editing remains available.
- PR91 / discussion4407760143: store editor derives saved effective Region through its saved District, matching server ownership checks even when the saved Region copy is stale/missing.
- PR91 / discussion4407760147: already superseded by the later retail/lifecycle-aware editor boundary. Actual acceptance verifies legacy Corporate Region/District controls remain editable; later lifecycle-owned non-retail records remain protected.
- PR93 / discussion4407760170: import manager resolution uses the canonical District parent instead of a stale saved Location Region, or existing validation blocks the row. A name-only preview does not replace the canonical RM with the stale Region's vacancy/manager.

## Validation

- Final ordinary suite: **945 passed**, no failures/skips. Type check and release build passed; existing bundle-size advisory remains.
- Focused affected tests: 77 passed. Includes reordered unit/member retries and an explicitly reconstructed older receipt hash, legacy-vs-owned non-retail compatibility and stale-Region CSV behavior.
- Eight real SDK/emulator organization atomic cases passed, including reordered preparation before concurrent commits, current authority checks, membership races, native field preservation and commit/cancel terminal recovery.
- Actual local components: catalog-paused registry and Person recovery entries open; legacy District under a managed Region locks parent editing; a stale Region copy under a managed canonical parent locks store hierarchy/RM controls; legacy non-retail cleanup stays editable; prepared-review close displays a discard confirmation; server-only move cancellation returns a usable fresh selection without retained-draft text. Synthetic auth/data only; no production writes.

## Remaining gates

PR100's independent code review identified locale-equivalent distinct Unicode unit IDs retaining input order. New intent hashes now compare exact code units. The receipt validator retains both original-order and earlier locale-sorted encodings; retry comparison always uses exact ordering. Sixteen affected operation cases passed after this repair, including distinct NFC/NFD IDs and older receipt recovery. The 945-case suite above is the earlier baseline, not a claimed repeat of the complete suite after this narrow repair. Fresh exact-head review remains required.

Fresh code/security review of this integration repair is required; security passes on old heads do not substitute for fixed-code review. Do not resolve or label old commits clean merely because a later dependent branch contains a repair. Lifecycle source/planner are built, but conversion/removal receipts/commit, transport/recovery/review UI remain. Broader consumer/import acceptance, isolated release construction/migration/runtime/access/signing/rollback and required production acceptance/closeout remain undelivered. All activation gates remain off; do not deploy main wholesale.

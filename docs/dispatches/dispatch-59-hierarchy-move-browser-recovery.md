# Dispatch59 — Move browser recovery controller

The move-specific browser controller is built and locally accepted for review. No screen imports it yet; no activation or deployment occurred.

`openOrganizationMoveWorkflow` owns a separate actor-scoped tab lease and durable marker. It validates the draft before persisting only schema/operation identity, persists before preparation, fences auth generations and late replies, serializes actions, and never automatically resubmits a prepare/commit. Roster, Person and move markers cannot collide. Routine cache cleanup preserves all three; explicit protected-storage sign-out still clears them.

Missing or prepared outcomes retain recovery until explicit cancellation seals the operation identity. Committed receipts must match the exact actor/operation audit digest before confirmation is published. Both cancellation and commit require a strict saved Directory refresh before the marker is cleared, so a retained draft cannot reuse stale Location versions. A failed refresh retains the terminal identity for recovery without another commit. Access loss clears protected catalog/review/pending state, releases the lease and retains the unresolved identity. Recovery paused with a local marker is visibly unavailable, not silently forgotten.

## Evidence

- 43 focused ordinary cases passed: 17 move-controller cases plus existing roster workflow, move transport and Person recovery coverage. Cases include durable-before-send, storage failure, unknown/missing outcomes, failed post-save and post-cancel refresh, actor audit mismatch, tab contention, late auth reply, duplicate click, reopened recovery, denied startup reads and separate storage/lease domains. Final TypeScript passed.
- One controller → HTTP → Store → actual SDK/emulator journey passed. A synthetic connection drops the successful commit reply; recovery reads the committed receipt and refreshes the actual saved Location. Exactly one prepare, one commit and one audit are observed; the marker clears only after saved-state verification. Provider authentication and browser environment are synthetic, not production/provider/DOM acceptance. It uses a unique local named database and restores process-only flags.
- PR88 had no inline review threads at the latest read. That is not completed review or approval. The prior full 850-case suite/release build remains applicable to unchanged adapter code; it was not redundantly rerun for this controller-only milestone.

## Remaining

Build deliberate Store → District (filtered by Region) and District → Region selection with server before/after review, explicit vacancy, affected stores and retained draft reapplication only after fresh saved state. Connect strict app Directory refresh; clear local drafts/projections on auth loss. Complete real component desktop/mobile and interrupted-save acceptance, dependency review, correction/import/concurrency and consumer/release/migration/rollback gates. Keep every activation flag off. No whole-main deployment, LP work, live-data restoration, IAM/access/grant/token/credential changes or review approval as Theo.

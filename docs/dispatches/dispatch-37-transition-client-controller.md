# Dispatch 37 — reviewed-command controller and bounded transport

October 23, 2026 Pacific. Source only, not imported by the app or deployed. Builds on merged PR #58 / source `76967e6` and [Dispatch 36](dispatch-36-atomic-transition-emulator.md). Last verified serving source remains PR #53 `62acacb`; this phase performs no production operation.

## Scope

The new browser controller binds the fixed normalized intent to the original server review, freezes that command and operation UUID, and persists/read-backs its minimal recovery marker before a mutation request. The browser decodes claims to catch accidental draft/actor mismatches; it cannot verify the private signature or authorize a change. The server remains authoritative.

Shared isomorphic normalization/canonical JSON preserves the server hash contract. Raw reason, review envelope and command exist only in memory, not recovery storage or published controller state. Storage is application isolation, not encryption or protection from script execution.

Recovery combines the actor's local markers and complete server preparation inventory. Missing receipts, malformed/partial replies, expired reviews and failed storage remain blocked. A lost preparation can be explicitly retried only with the original frozen command. A restarted controller cannot reconstruct a lost command from a marker: inspect/status/cancel only. Committed results require a current Directory refresh and the deterministic actor/operation audit identity before forgetting a marker. Unknown save results never trigger automatic resubmission or a new UUID.

The fixed same-origin transport uses Firebase authorization, no-store requests, strict bounded detached command bodies, redirect rejection and deadlines covering token retrieval, request and body parsing. Abort/dispose/session-generation fences prevent a late token from starting a request after timeout or sign-out. It does not retry. Error bodies are not copied into user-visible errors.

New-command admission defaults off. Recovery is independently gated so disabling new staffing changes does not strand existing preparations. The current authenticated Company-wide Active System Administrator and trusted monotonic session generation must remain unchanged across every await and publication. These are injected contracts, **not yet AuthProvider integration**. Existing position-removal guards remain.

## Evidence

- Shared normalization/planner/preview/recovery compatibility: 43 passing affected groups.
- Combined ordinary suite: 626/626 passed before two final admission/recovery separation cases; final controller/HTTP affected suite: 19/19 passed. These are not a claim of one 628-test full run.
- One actual server-SDK/emulator primary transaction roundtrip passed after canonicalization extraction, reusing the isolated demo project and loopback boundary documented in Dispatch 36.
- A new isolated Chromium test passed with real localStorage, Web Locks and WebCrypto: a synthetic committed receipt followed by a simulated lost response is recovered by a fresh controller with one command effect, one refresh and no retained token/reason/marker. This is not live Firebase/UI or an actual network-outage test.
- Production build passed with the existing bundle-size warning. Controller/transport remain outside the app runtime import graph. Final type checking and review are required before this source phase is declared ready.

## Owner authority and remaining gates

The owner explicitly approved **one private confirmation-signing secret and read access only for the existing Directory server identity**. This is authority for that bounded later production setup, not evidence of provisioning or activation. Do not expose the secret, add other identities, alter other apps or modify staff/API credentials. Current phase creates no secret or IAM binding.

Next: trusted AuthProvider generation/implicit sign-out and cross-tab integration; fixed server routes with separate new-command/recovery admission; short accessible replacement-or-vacancy UI; synthetic end-to-end acceptance; verify internal receipt/audit protection; approved bounded signing setup and guarded release. A new blocker requiring broader permissions or policy decisions must be raised. No real staffing selections, data restore, Region/acting ownership, consumer acceptance or full P3 completion is implied. Issue #36 stays open for consumer-side verification.

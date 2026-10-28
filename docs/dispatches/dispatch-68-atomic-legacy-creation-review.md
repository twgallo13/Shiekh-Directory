# Atomic legacy creation admission and final lifecycle review

October 28, 2026 Pacific. Source only; no production deployment or activation.

## Verified PR96 finding and repair

The review correctly identified a time-of-check/time-of-use gap: a capability probe could see zero pending creations immediately before an enabled instance prepared one, while an all-off instance then created another Location through the generic writer. A GET probe alone cannot enforce an atomic write precondition.

PR96 now reads complete actor admission/pending inventory inside the generic Location-create transaction and bumps that same admission version together with its business writes. Preparation and compatibility creation therefore serialize on the same actor document. A newly pending preparation rejects the compatibility save without partial Location or audit; a legacy save that wins the transaction order advances the shared version before later preparation. This is not a claim that future independent preparations are forbidden after a completed create.

Compatibility also checks all three **raw** organization controls. A command-only partial configuration is not an all-off rollout even though the derived command capability is false. No generic new Location can bypass this rule when any control is enabled. Existing-record edits and the separately receipted CSV-confirmation protocol remain separate. No public API/grant or authority expansion occurs.

Repair commits on PR96: `f5d066ab6b08b8fd88a8fe76a50e1e726992787d` (runtime and regressions), `deff9ed7851d1d0f5e32ddb045836e23d45c6fba` (older synthetic query now returns actual SDK-style size). The review thread was resolved only after repair publication and validation. This does not constitute approval or completed independent review of the repaired head.

## Acceptance

- 29 affected ordinary generic-writer/creation tests passed.
- Two new native SDK cases passed: preparation arriving after a successful compatibility probe blocks the generic create; cancellation then allows one serialized version-1 create; command-only partial setup rejects it. An already in-flight enabled preparation racing an all-off compatibility transaction preserves the shared pending count and serialized admission version in either valid transaction order.
- The first combined 917-case run passed 915 and exposed two older District test simulations omitting query size. Correcting that mock, without relaxing validation, passed all 35 District cases and retained their original wrong-name rejection assertions.
- Local in-place review found the editor's reverse non-retail→retail choice gap and an overly broad audit description. The editor now preserves classification in both directions, including saved/current managed links, with a matching submit check; a pure choice matrix and actual non-retail component preview confirm it. Audit text now claims only preservation of managed hierarchy ownership, allowing unrelated deliberate metadata/legacy staffing edits.
- Final focused guard/import/type selection set: 58 passed. Final **complete ordinary suite: 918/918 passed**. TypeScript and final release build passed; existing chunk-size advisory only. No application source changed after that final set; the added non-retail test-fixture flag is not a release import.
- Dispatch67's native lifecycle/audit-overflow and desktop/mobile acceptance remain applicable; no repeated native run was needed after presentation-only audit text/editor-choice cleanup.

## Review and release boundary

Inline-thread inventory found zero unresolved threads in PRs77–95; PR96's one verified thread was repaired and resolved. This is a comment inventory, not completed independent exact-source/security review. The specialized Bugbot/Security subagent types are not exposed here; the additional review was performed locally, not claimed as an independent agent review. No approval as Theo was submitted, and no bot spending/configuration settings or on-demand CodeRabbit review was changed.

Continue retail/non-retail conversion and managed removal through an explicit supported review path, wider import/concurrency/consumer acceptance, independent exact-source reviews and guarded migration/security/access/signing/runtime/release/rollback/production checks. All new activation controls stay off. No wholesale main deployment, unrelated app work, IAM/grants/tokens/credentials or data restoration occurred.

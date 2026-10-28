# Dispatch54 — Staged staff handover and offboarding acceptance

Status: actual SDK/local-emulator acceptance added; no production activation or product-runtime change in this slice.

## Exercised journey

`test/organizationStaffJourneys.emulator.ts` seeds synthetic data into a unique named database in the loopback-only demo-directory-transitions emulator, then uses the real organization prepare/commit, signed Person preview/prepare/atomic commit and generic Store paths.

1. An existing Store Manager holds controlled SM/DM/RM positions and an optional Corporate workplace. Position eligibility alone assigns no unit. Explicit roster commands add Additional District coverage while preserving the incumbent Primary and separately select Regional Primary. Region01 and District01 are distinct owners.
2. Required DM-position removal is rejected while the Additional tenure remains active. Ending that tenure explicitly permits the reviewed position change while retaining the store slot and Regional responsibility. The signed command is replayed to verify idempotent recovery, without extra audit entries.
3. A Regional handover explicitly names the replacement. A separate reviewed SM-position removal vacates the store slot, leaves both inherited canonical owners correct, and preserves Store → District ID → Region ID and the Person's Corporate workplace.
4. Generic inactivation is rejected while a linked Directory User remains, even after staffing duties end. The fixture explicitly reviews/unlinks that relationship, then inactivates the Person. Account role, Active account status and Firebase UID remain unchanged; no access revocation is inferred or performed.
5. Both ended organization tenures remain in history, no active roster row references the inactive Person, the incumbent's canonical ownership remains correct, and exactly eight audits exist for the four roster changes, two Person commands, explicit account unlink and inactivation. Replayed commits add none.

## Evidence and limits

The one complete SDK journey passed on its first run; final TypeScript passed. This is one integrated scenario, not eight tests. It performs real local SDK transactions; it is not an end-to-end browser/provider test or production IAM/index/signing validation. The signing key and all records are synthetic. Low-level function invocation deliberately bypasses HTTP admission for test setup and does not enable any deployment flag. Existing HTTP capability/gate tests remain separate evidence.

No runtime source changed in this acceptance slice, so earlier ordinary/build evidence was reused. PR83's later bounded legacy-list repair separately passed 17 focused cases and TypeScript; it does not claim a new broad-suite run. The emulator was stopped after acceptance. No business data, external accounts, permissions, credentials/grants, LP app or cloud settings were touched.

## Remaining work

Complete independent exact-source dependency reviews and the remaining supported Region/District parent/store moves. Broader UI-led staged journeys, pending-correction and activated import/correction paths, wider races, opt-in consumer schema/scope documentation, migration/rollback and production-source acceptance remain open. Account access review remains separate from staffing. Keep organization flags off and do not deploy main wholesale.

# Dispatch 51 — Managed unit name and empty-unit status edits

Status: implemented and locally validated for review; not deployed or activated.

## Behavior

An Active Company-wide System Administrator can rename an activated Region or District through its existing registry editor. The server reads live account authority in the same transaction and preserves omitted server-owned fields. Only name/status differences are accepted; protected metadata, leadership pointers, parent IDs, arbitrary new fields, deletes and combined writes fail closed. IDs remain permanent. Concurrent saves use the existing exact record version; no automatic retry of browser intent is added.

Retirement also requires an empty roster and the existing complete Location/child-District dependency checks. Retired managed units remain valid dormant source records with an explicit null Primary and no active tenures. District reactivation requires an Active parent. Reactivation preserves the leadership model/version and vacancy; it never revives a former assignment. Parent changes, managed store membership/type changes and assigned-Person lifecycle/name changes still need their supported workflows.

Every accepted managed metadata edit produces a server-described, size-bounded audit with before/after state, even if the caller provides no audit. LeadershipVersion is unchanged because the roster is unchanged; registry record version/timestamp advance. The existing consumer hierarchy digest detects names/status changes and requires reconciliation on changed hierarchy cursors. No Location rewrite, new API field, consumer scope, grant or credential change is needed.

## Evidence

- 55/55 affected ordinary tests passed: registry editing, hierarchy assignment contract, Directory API and leadership guards. This includes the 14 focused guard cases; do not add those again to the total.
- 6/6 actual Firestore SDK/local-emulator cases passed: populated rename preserving stores/tenures; stale version and mandatory audit; authority loss/duplicate authority/protected-field rejection; vacant retirement/reactivation with retired-parent rejection; linked-Location retirement rejection; simultaneous renames admitting one version/audit; managed Region rename/retire/reactivate.
- TypeScript passed. The earlier successful 790-case full suite, application build and browser acceptance remain historical evidence for unchanged code, not a new run of this phase. This phase changes no browser component.
- Emulator access is hard-limited to loopback 127.0.0.1:8089 with project demo-directory-transitions and per-test isolated named databases. No live business data or cloud configuration was touched.

## Remaining gates

This is a narrow backend permission repair. Registry UX must present supported actions clearly before activation, and wider roster-aware Person transitions, membership moves, imports/corrections, consumer contract and release/rollback acceptance remain open. Preserve the default-off organization flags and existing production isolation boundary. Do not deploy main wholesale.

# Dispatch 52 — Roster-preserving staff position review

Implemented for review; not deployed or activated. Depends on Dispatch51 and the earlier disabled organization/Person workflow stack.

## Server admission

The older reviewed Person command no longer blanket-rejects every subject with an organization assignment. It may keep those responsibilities while changing unrelated controlled positions or Location-owned slots. Preview and atomic commit both re-read the bounded canonical roster and require the final Person intent to keep Active lifecycle and every required District/Regional Manager position. Removing a required position or inactivating an assigned Primary/Additional manager still requires ending/reassigning that responsibility through the organization workflow first.

Only explicit retain decisions may mention managed District ownership or inherited managed Region leadership; the retained subject must match its canonical Primary and Region Location copy. The Person writer cannot mutate a managed roster, Primary pointer, assignment history or inherited organizational owner. Invalid canonical roster source fails closed. Existing signing/recovery/admission/auth/capacity/version gates remain intact. No signing configuration or production flags were changed.

## Profile and offboarding UX

An authorized Company-wide Active administrator's profile editor reads the canonical organization catalog, showing both Primary and Additional District/Region responsibilities. Failed/loading/invalid reads do not imply vacancy and prevent name/position/status changes; contact-only editing remains separate. Capability-disabled legacy mode is explicit. This does not expand catalog permission to stewards or consumers; existing server restrictions remain authoritative for all callers.

Required-position removal and inactivation are stopped before submission when canonical assignments remain. The administrator can open the existing reviewed responsibility editor and return without losing the profile draft. Returning refreshes responsibility source and resets the position acknowledgment. The ordinary profile draft is not itself submitted by that handover.

The inactivation/deletion dialog also checks canonical memberships, including Additional assignments missing from legacy Location references. It lists the blocking responsibilities and provides a direct review action. Failed reads keep the action unavailable with explicit retry. Existing linked-account and Location blockers remain; no account is automatically unlinked, revoked or granted access. Ending responsibilities and then inactivating are separate explicitly reviewed saves, not a claimed single atomic offboarding command. Backend guards recheck concurrent assignments regardless of browser freshness.

The read hook fences results by Person, actor, auth generation, admission and retry identity; session boundaries dispose transport and clear protected state. It uses the existing strict parsed private catalog and does not persist profiles/contact/review data. Generic assigned-manager name editing remains blocked pending its coordinated compatibility-update path; this phase displays that limitation instead of silently leaving stale copied names.

## Evidence

- Complete ordinary suite: **800/800 passed**, zero failed/skipped cases, including three canonical review cases and 16 guard cases. Earlier focused 30 transition cases are included, not added again.
- **5/5 actual SDK/local-emulator test cases passed**, including both Primary and Additional signed preview/preparation/commit/idempotent recovery while preserving units/tenures/stores, and a newly acquired Region responsibility blocking removal at commit. Provider authentication/production indexes/IAM are not proven by this local harness.
- TypeScript passed. Build passed with the existing Vite chunk-size advisory. Two final UI-only refinements added actor UID to the review key and reset acknowledgment after returning; final TypeScript checks cover those refinements, while earlier successful full/build evidence is reused for unchanged behavior.
- Actual components passed desktop and 360×800 checks using synthetic auth/network/business records: Additional responsibility displayed; removing its required position blocked without a save; department draft preserved across responsibility review; direct offboarding-to-review path; inactivation disabled for Additional membership; failed read/retry remains blocked. Browser fixture forbids server POSTs. These are component acceptance checks, not a production end-to-end staff change.
- Owned preview tab, viewport override, local Vite and emulator are cleaned up after acceptance. No cloud/provider/live business data was modified.

## Still required

### PR82 inactive-Additional review repair

Verified the reported P2: intent lifecycle `keep` does not prove the saved Person is Active. The command source now passes the exact current subject projection to organization compatibility validation at preview and commit. Retained active tenures require `personLifecycle(subject) === active`; missing, inactive, contradictory and unresolved lifecycle sources fail closed. Required-position checks still use final intent positions. The strengthened focused transition/guard set passed 31 cases and the actual SDK/emulator set passed 6 cases, including an inactive Additional manager with no legacy responsibility slots. TypeScript passed. Earlier full-suite/build/browser results remain historical and are reused for unaffected behavior; no broad rerun or production activation.

Coordinated manager-name propagation; broader staged lifecycle/position-removal journeys across Region, store slots, linked accounts and pending corrections; supported parent/store membership moves; activated imports/corrections and wider races; opt-in consumer schema/scopes; exact-source independent review and release/rollback acceptance. Do not activate units while required supported paths are missing. Preserve default-off flags and do not deploy main wholesale.

# Dispatch 73 — Protected lifecycle API and strict client DTOs

## Delivered for review, disabled by default

Private Firebase administrator routes under `/api/directory/location-lifecycle` expose capabilities, canonical organization catalog, read-only dependency preview, prepare/commit and status/cancel/pending recovery. Only Company-wide Active System Administrators enter; Store services recheck live authority. No consumer token scope, generic grant or failed request authorizes this workflow. There is no generic commit fallback.

`LOCATION_LIFECYCLE_ENABLED` must be exactly `true` in addition to the existing organization catalog/recovery/command controls before new lifecycle commands are admitted. Earlier roster activation alone cannot enable conversion/removal. Pausing the new switch disables catalog/preview/new commands while existing recovery can remain available under its existing independent control. All controls remain off in production; no environment was changed.

Requests use the exact intent/marker validators and a 32 KiB JSON limit before the generic parent parser. Responses are noncacheable with no successful ETag/304, limited to 1 MB for review/recovery responses and 8 MB for catalog. Actor limits are ten commands and 120 reads per minute, within the existing parent limiter. Unknown infrastructure details remain private. Partial Store implementations cannot advertise new-command availability.

The browser port uses fixed private paths, current actor/session-generation checks, deadlines, abort/disposal, byte bounds and no automatic retry. It strictly parses exact review fields, linked dependency summaries, staffing, hierarchy, coverage arithmetic, readiness, expiry and terminal operation/audit identity domain. Contact/patch/source/native enrichment is rejected. Blocked previews are displayable but cannot masquerade as ready preparation. The later durable browser controller must retain actor/operation identity before prepare/commit/cancel and verify the actor-bound audit identity before adopting success; this slice does not add that controller or review screens.

## Evidence

- Full ordinary suite: **974 passed**, no failures/skips. The final router file also passed all **12 cases**, including an additional response-size/actor-throttling check added after the full suite began. No claim of a repeated complete suite is made.
- Thirty-eight affected lifecycle/shared transport cases passed before that final router addition. Strict DTO mutation, blocked preview, session fencing, timeout and no-retry cases are included.
- Actual strict client → HTTP → Store → SDK scenario passed: all-off denial, roster-controls-only denial, preview without receipt writes, preparation, paused recovery/cancellation, simulated reply loss after one successful commit, status recovery, ordinary retirement, reviewed removal/identity reservation, and revoked live authority.
- Type check and release build passed. Existing bundle-size advisory remains. Synthetic token/provider authentication and isolated local database only; live Directory authority uses real SDK reads in the test.

## PR101 repair and release implications

PR101 review found CSV confirmation writes independently of generic commit. Repair `d411490b6c71dbf80ef882b005a9e93e0a80d640` checks permanent identity reservations in that transaction too. Six relevant native scenarios and 43 ordinary preview cases passed; fresh exact-head code and security reviews completed without findings. The earlier Dispatch72/Notion claim that import reused generic commit was incorrect; both writers now enforce reservations separately. Other runtime Location writers update already-read existing documents; manual migration paths remain separately gated.

Once removals are activated, a compatible rollback must retain **both** generic and CSV identity-reservation guards. Do not roll back to the earlier serving source without equivalent protection. The separate data-restoration migration must reconcile reserved IDs deliberately, never bypass them through ordinary CSV. No production removal has occurred, so these are pre-activation release requirements.

## Remaining work

Independent current-source code/security review, durable actor-scoped browser recovery and explicit conversion/removal review UX, wider alternate-writer/import/consumer acceptance, and every existing migration/security/access/signing/runtime/isolated release/rollback/production acceptance/closeout gate remain. Public v1/v2/v3 schemas and grants are unchanged. No merge/deployment, other-app work, expanded authority/credentials or data restoration. Do not deploy main wholesale.

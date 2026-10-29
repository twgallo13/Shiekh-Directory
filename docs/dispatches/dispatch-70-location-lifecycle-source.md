# Dispatch 70 — Transaction-coherent Location lifecycle source

## Delivered for review

The internal read-only `readLocationLifecyclePlan` adapter validates exact intent and the trusted actor, then rechecks live Company-wide Active administrator authority in the caller's SDK transaction. Firebase authentication remains a required caller prerequisite. Complete bounded District, Region, Location, People, account and correction-request inventories derive all review dependencies; relevant current/destination rosters use exact namespaced unit queries. A non-retail removal needs no invented District or roster.

Queries use sentinel overflow detection, identity/path/native update-time checks, projected finite JSON and a shared 8 MB envelope. The returned internal source fingerprint covers projected inventories and native update times; a future commit must rerun the adapter and compare this fingerprint plus planner review/preconditions. It must preserve full saved records separately, never replace a Location with these masked projections. New incoming rows and changes without business-version increments invalidate source bindings.

No work emails, account email/Firebase identity, addresses or pending contact payloads enter the returned source. Pending Person request projection includes only workplace/support IDs. Saved Store Manager phone is read only to detect orphaned staffing, then reduced to a presence marker; its native update time binds changes. People positions, workplace/support links and local staffing are distinct.

This slice has no operation receipt, conversion/removal commit, API route, browser recovery or review-screen activation. Completeness is established server-side, never supplied by the browser. Existing gates remain off. No merge/deployment, production writes, IAM/grant/credential changes, LP/Dynamic QR work or data restoration.

## Evidence

- Six new ordinary loader cases passed, alongside planner and existing organization/move source tests (30 total in the focused run).
- One real SDK/emulator scenario passed: nested pending assignment blocker, completed request removal, a native update-time change without a version increment, new store-account dependency and revoked live authority; no Location, audit or operation writes.
- Final combined ordinary suite: **942 passed**, no failures/skips. Type check and release build passed; existing bundle-size advisory remains.
- The shared synthetic source fixture now implements nested projection masks used by the real SDK; its consumers were covered by the complete suite.
- PR98's inherited-name compatibility finding was separately repaired at `cf3cf4b`, followed by type-only narrowing at `413fb9f`; 27 focused ordinary tests and six native rename cases passed. A command-written null vacancy and ordinary omitted ID now remain the same vacancy. The exact repaired head was sent through the normal ready event for fresh code/security review; no self-approval was submitted.

Next: actor-bound prepare/commit/status/cancel receipts and bounded deterministic audit, full-record/native-precondition preservation, private transport, browser recovery and explicit conversion/removal review. Wider acceptance, dependency reviews and guarded isolated release/migration/rollback/production acceptance remain required.

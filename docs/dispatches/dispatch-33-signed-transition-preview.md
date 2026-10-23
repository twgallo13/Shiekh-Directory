# Dispatch 33 — signed read-only transition preview

October 23, 2026 Pacific. Source implementation only: not published, not configured, and not a completed removal workflow. Current production remains PR #53, source `62acacb`, as recorded in [Dispatch 32](dispatch-32-explicit-assignment-rules.md). Follow the [agreed rules](../plans/positions-and-assignments-rules.md) and [command contract](../plans/person-transition-command-contract.md).

## Delivered foundation

`POST /api/directory/person-transitions/preview` accepts only the fixed normalized transition intent. It requires a current Active Company-wide System Administrator, rechecks unique account authority inside a fresh read-only Firestore transaction, and derives the review using the existing pure planner. Authenticated callers are limited to ten previews per minute and 128 KiB JSON bodies; responses are private/no-store without ETags. It is separate from the published informational dependency preview and from consumer API grants.

Bounded projected inventories cover Locations, Districts, Regions, linked Users and Pending requests. Pending-request masks select only individual leadership subfields under `requestedChanges`/`currentSnapshot`, never the entire parent maps: unrelated private prose, email changes and payloads are not transferred by that query. Malformed projected leadership values fail closed; absent nested fields mean no projected leadership reference, not validation of the unselected original request body. Native timestamps still bind all source edits. Exact subject/replacement Person reads preserve native update timestamps and absent/null/zero version distinctions. Contact compatibility fields are fetched only for explicitly changed Store Manager slots; no email or request prose is returned. Incomplete, oversized, malformed or incoherent projected reads fail closed. The response excludes internal patches/preconditions and always reports `canCommit: false`. A blocked review has no envelope.

A ready review may carry a five-minute HMAC envelope bound to the actor, subject, normalized intent and computed state/plan hashes. It is not authentication, a lock or write approval. Strict signature verification covers canonical encoding, schema/audience/key ID, binding and expiry; it does not implement expired receipt replay.

## Configuration and limits

`PERSON_TRANSITION_REVIEW_KEYRING` is server-only JSON: `activeKeyId` and `keys`, each key containing only `id` and `secret`. IDs use 1–64 letters/digits/dot/underscore/hyphen with an alphanumeric first character; secrets are canonical unpadded base64url for 32–64 cryptographically random bytes. At most three unique keys are accepted, including the active key. Retain old verification keys through their applicable validity/recovery policy; a future writer must separately specify durable receipt replay and rotation. Do not log keys or review envelopes, store envelopes in URLs/browser persistence, or reuse import/API/Firebase credentials.

Missing/invalid configuration yields a generic 503 before inventory reads. **No production key, managed secret, IAM grant or deployment configuration was created or changed.** Enabling that configuration needs its own approved setup. `.env.example` contains only an empty variable and a format placeholder, not usable key material.

Inventory caps: 1,000 Locations, 500 Districts, 100 Regions, 5,000 Users, 1,000 Pending requests; each query reads limit plus one and rejects overflow. Exact Person reads are batched by field mask. Projected snapshot capacity is 8 MiB. Planner business budgets remain conservative application limits, not proof that full stored documents meet SDK/platform write limits.

## Still unavailable / next gates

No prepare, commit, status, cancel or recovery-list route; no durable receipt/actor marker, actual writer, removal dialog or generic-save bypass. Ordinary position additions and the existing removal blockers remain unchanged. No business data, contacts, assignments, accounts, client grants/tokens or restored data changed.

Synthetic SDK-mock and HTTP tests validate read-only options, authority, field masks, missing/blocked replacements, stale metadata, bounds, expiry, privacy and route denial. These are **not emulator/live evidence** of query-insertion/absence races or atomic write/recovery behavior. Obtain that evidence and implement/review preparation, atomic commit and uncertain-save recovery before adding Save to a short replacement-or-vacancy dialog. Region-owned/acting leadership and data restoration remain separate. Issue 36's authenticated consumer acceptance stays open.

No new user-visible screen is included in this slice. Existing visible eligibility selectors are from PR #53. The later review dialog will need visual/user acceptance; this foundation does not require changing real assignments to test it.

## Validation checkpoint

The full synthetic API suite passed 586/586 tests. Type checking and production build passed (existing bundle-size warning). The build initially hit a Windows sandbox configuration-path denial; the authorized retry succeeded without code changes. An initial new-test failure was a fixture that skipped overflow simulation for the Pending-request filtered query; correcting that fixture exercised the existing production overflow guard successfully. No live account or staffing data was used. PR-review evidence will be recorded separately when complete; no deployment is implied by these results.

# Dispatch 13 — Location Inbox Email

## Scope and status

Implementation adds one optional `locationInboxEmail` field owned by a Location. It is separate from Person contact email and User/Firebase login email; there is no `storeInboxEmail` alias and no automatic population from existing records. Changes cover Location editing/detail, People relationship views and search, correction requests, Location CSV v2 imports/exports, the authorized read API, and the API/app-blueprint documentation.

The API emits `locationInboxEmail` as a normalized string or `null` on both list and detail responses. `null` means no usable published inbox. Personnel email remains outside the Location projection. Custom-field publication/type validation does not scan arbitrary text for personal information. The field is built-in and does not change `customFieldsVersion`.

**Status:** implementation and local verification complete; independently reviewed; release pending. No production deployment, migration, live business-record write, mailbox population, email send, credential, IAM, or auth change was performed. The deployed API could not be verified with an authorized token; the existing documentation records the observed unauthenticated `401 invalid_token` result.

Consumer-side ROPI work is not included: this repository does not contain that app. Its owner must implement server-side token storage, initial full reads, all-page delta processing, `null` clearing, idempotent retries, periodic full reconciliation, subscriptions, approvals, and notifications.

## Contract and safeguards

- A missing inbox is allowed. A changed value is trimmed and validated as one address; the local part's display case is preserved and the domain is lowercased. Case-folded values are used only for duplicate comparison, never as identity.
- An omitted inbox on an older full-document write preserves the persisted value. Explicit clear writes `null`. Unchanged invalid historical values do not block unrelated edits.
- Shared addresses are allowed after explicit acknowledgment. The server recomputes duplicate membership and versions transactionally; acknowledgments are bound to the proposed address and affected Locations. CSV previews sign selected rows and acknowledgments and confirmation rechecks the persisted conflict set.
- Person work email is optional and independent. A present blank `workEmail` suppresses legacy-email fallback. No account uniqueness, login link, role, permission, or authentication behavior was changed.
- Retail suggestion is opt-in (`store07` suggests `store7@shiekhshoes.com`); stored store numbers remain unchanged. Non-retail and unparseable/zero-only numbers receive no suggestion.
- The authorized read API intentionally exposes the Location inbox, not Personnel email. Invalid stored inbox text projects as `null` without silently repairing the stored record.

## Acceptance evidence

Verified locally with synthetic fixtures only:

| Check | Result |
| --- | --- |
| `npm run lint` (`tsc --noEmit`) | Passed |
| `npm run test:api` | 302 passed, 0 failed |
| `npm run build` | Passed; Vite reported a large-bundle advisory (>500 kB) |
| Playwright inbox editor/detail/clear, stale-save, historical-value and duplicate-review cases | 5 passed, including 320px and 390px, using a local app and synthetic Firebase/browser fixtures |

Coverage includes write preservation/clear, email normalization, server-side duplicate acknowledgment and stale versions, correction-request snapshots/set/clear, signed CSV acknowledgment and confirmation, the CSV action matrix and `locations-v1` input compatibility, list/detail API projection and invalid historical values, and narrow-screen editor/detail behavior. The API test fixtures do not represent production records or a successful live authenticated response.

Independent review additionally bound editor and correction approval checkboxes to the exact displayed conflict digest. CSV acknowledgments now carry the reviewed digest; revalidation cannot silently accept changed membership or versions. New import IDs remain stable across previews of the same actor/file so additions can be reviewed consistently. Regression tests cover stale versions, added conflict members, row-only acknowledgment rejection, signed digest tampering and new-row revalidation. An incorrectly nested API test was moved to its own awaited test case. Browser email fields allow unchanged historical text while validating new contact values explicitly.

Pre-release `locations-v1` signed previews must be recreated after rollout. Version 1 CSV files remain supported; the new acknowledgment contract is part of the version 2 signed preview.

## Release and rollback

No schema migration or data backfill is required. Rollback should retain any inbox values already saved. Do not restore an older application revision and assume that its full-document Location writes preserve this new field: a pre-feature writer may erase it. Prefer a rollback build that retains omission-preserving writes. If that is unavailable, restrict Location writes until a compatible writer is restored. Older API consumers should tolerate the property being absent; when a response from a field-aware revision contains `null`, it means clear the consumer's saved inbox. A field-aware consumer should perform an initial full read because adding this built-in field does not signal a `customFieldsVersion` change.

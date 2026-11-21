# Store page pilot rollback (Directory)

Do these in order. Do not approve a pending store-link request after the old API is live. At ff606e5, approval copies every key in `proposedChanges` onto the `locations` document, which would publish `reviewUrl` and bump `locations.version` and `updatedAt`.

The new `public-profile:read` key is not created by this change. Do not revoke Dynamic QR's existing v1 key.

## Which key is which

| Key | How to recognize it | What to do |
|---|---|---|
| Existing v1 key | Scopes include `locations:read`. It does not include `public-profile:read`. This is the key Dynamic QR uses today. Its client id is the one already in Dynamic QR, not a new id. | Do not pause, revoke, or rotate it. |
| New public store page key | Scopes are exactly `public-profile:read`. Client id looks like `api-<uuid>`. Rate limit is explicit: 120 requests per minute. It does not exist until an Admin creates it. | Revoke this id only. Record the id in the deploy log when it is created. |

`NEW_PUBLIC_PROFILE_CLIENT_ID` = not assigned yet. Fill it in when the key is created. Until then there is nothing to revoke.

## Steps

1. While this API version is still running, reject every pending correction with `category == store-link`. Do not approve them. Count them and write the count in the deploy log. Rejecting does not change `locations`. A request that fails the new store, scope, or link checks is fail-closed: it is not applied.
2. Revoke the new public-profile key by its client id (`NEW_PUBLIC_PROFILE_CLIENT_ID`). Leave the existing v1 key alone. Dynamic QR then keeps its last good copy or falls back. An Admin can also turn each store page off; that does not need a deploy.
3. Redeploy the previous good API (`functions:api` from ff606e5, or the last good SHA) and re-release the previous Hosting version from release history. Do not deploy Firestore rules or indexes for this rollback.
4. Before anyone approves a correction on the old API, reject every `store-link` request that is still pending. The person running this rollback owns both sweeps and writes both counts in the deploy log. The old reject path only changes the correction. It does not write `locations`. Do not approve a store-link after the old API is live.

Step 1 cannot freeze filing. The correction route stays open until step 3, and revoking the public-profile key does not close it. A store-link filed in that gap stays pending for the old approval handler, which copies `proposedChanges` onto `locations`. Step 4 removes those requests before that approval can run.

Old code ignores `storePages` and `settings/storePageDefaults`. It does not ignore a pending store-link request, which is why the reject sweeps come before any approval.

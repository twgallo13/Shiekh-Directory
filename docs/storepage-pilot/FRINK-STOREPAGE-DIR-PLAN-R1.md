# Frink: pre-build risk check, Directory side of the store page pilot (R1)

- **Reviewer:** Frink (technical risk auditor), read-only. **Written:** Fri Nov 20, 2026, ~11:30 PM PT.
- **Reviewed:** `/workspace/storepage-dir/PLAN.md` (v1, full read) against `twgallo13/Shiekh-Directory` `main` @ `ff606e5`, folder `rebuild/`. My own clone is at `/tmp/frink-spd` (checked out at ff606e5). All `file:line` refs are relative to `rebuild/` at ff606e5.
- **Context read:** my earlier reviews FRINK-DQR-STOREPAGE-PLAN-R1 (B1–B5), FRINK-B2-PLAN-R1 and FRINK-IMPL-110-R1. I also used the counts in the B2 deploy log (`/workspace/shkdir-b2-deploy/DEPLOY-LOG.md:20`).
- **What I did:** static code reading plus a local Node check of how URLs are parsed. I didn't run the test suite, didn't start an emulator, didn't touch production, and made no GitHub writes.
- **This verdict grants nothing.** It gives no permission to merge, deploy, write data, or create a key.

## Verdict: **READY WITH REQUIRED CHANGES**

The design is sound: data lives only on the server, the public endpoint is separate with its own scope, the response is built from an explicit field list, access rules come before UI, and rules and indexes stay unchanged. Most of the plan's own facts check out against the code. Seven required changes (below) must be written into the build brief before work starts. B1–B4 and B7 belong in **D2**. B5 and B6 belong in **D1/D2**. None of them needs a decision from Theo.

---

## BLOCKERS (required changes)

### B1. The own-store fix (old B1) misses the second place requests are created: `/api/app/edit`
- **Fact:** Requests (`corrections` docs) are also created by `PATCH /api/app/edit/locations/:id` (`server/routes/edit.ts:186-223`), not just by `POST /api/app/corrections`.
- **Fact:** For a Store account, `edit:contactInfo` is `propose-only` (`src/lib/permissions.ts:31`). `hasPermission` returns `allowed:true` for propose-only grants **without checking the store** (`permissions.ts:89-91`).
  - So a Store login that sends `mainPhone`, `address` or `sharedInboxEmail` for **another** store's id creates a pending request (`edit.ts:87-90`).
  - Hours work the same way: the Store branch at `edit.ts:102-104` and the propose-only branch at `:109-111` have no own-store check.
  - Only directions check the store (`edit.ts:153`). Hours exceptions check it too (`hoursExceptions.ts:101`).
- **Fact:** The plan adds the own-store check only "right after `corrections.ts:283`" (PLAN §1, row "Store login can only file for its own store").
- **Fact:** `type` is still taken from the client unchecked (`corrections.ts:320`). My R1 B1 asked for this to be fixed, and the plan doesn't mention it.
- **Fix:**
  1. Put one shared `assertCanFileFor(authUser, locationId)` check in all three places that create requests: `corrections.ts` POST, `edit.ts` before `:186`, and `hoursExceptions.ts` (where it already exists).
  2. Rules: a Store login gets its own `storeLocationId` only, and a Store with no `storeLocationId` is denied. A Store session's uid is `store_<locationId>` (`auth.ts:156`).
  3. Allow `type` values only from `CorrectionType` plus `'store-page'`. Otherwise derive it on the server.

### B2. The rollback claim is wrong: old code **does not ignore** `store-link` requests
- **Fact:** At ff606e5, approval copies every key in `proposedChanges` into the `locations` doc, whatever the category (`corrections.ts:192-202`).
  - If `functions:api` is rolled back to ff606e5 while a `store-link` request is pending, approving it writes `reviewUrl` onto the `locations` doc.
  - That bumps `locations.version` and `updatedAt`, so v1 incremental sync sees a change (`legacyV1.ts:133-140`).
- **Fact:** PLAN §7 says "Old code ignores it, so rollback needs no data change."
- **Fix:** Add a rollback step. Before or straight after a functions rollback, an Admin rejects every pending `category == 'store-link'` request, then counts them and records the count.
- **Fix:** The rollback runbook must name the **new** `public-profile` client id when it says "revoke or pause the Dynamic QR key".
  - Pausing or revoking Dynamic QR's existing v1 key (`apiClients.ts:220`, `:390`) would break what Dynamic QR uses today.
  - Write both client ids into the runbook and say which one to touch.

### B3. Approval must be one transaction, with its own `store-link` branch
- **Fact:** Approve reads the request and the location, then commits a batch with no preconditions (`corrections.ts:139-231`). It isn't a transaction.
  - Cancel works the same way (`:377-408`), and so does reject (`:448-474`).
  - Two approvers, or an approve that overlaps a cancel, can both pass the `status === 'pending'` check (`:150`). The data gets applied while the request's final status says "cancelled".
- **Fact:** Approve returns 409 when `location.version !== correction.locationVersion` (`:167-175`). It then writes to `locations` (`:195-218`).
  - If `store-link` keeps that check, any unrelated store edit, such as hours, makes a pending review-link request fail with "version_conflict".
- **Fix:**
  - The `store-link` approval runs in `db.runTransaction`. Inside it: re-read the request (still `pending`) and `storePages/{locationId}` (version equals `storePageVersion`).
  - It writes only `storePages.reviewUrl` and its version, plus the request's status.
  - It **skips** the `locations` version check and **never** writes to `locations`.
  - Wrap cancel and reject for `store-link` in a transaction too, or at least use a `pending` precondition.

### B4. "Checked again at approval" for own store and scope isn't specified
- **Fact:** The approve route has the *approver's* identity only. The submitter's scope isn't stored, and `computeLeaderScope` isn't exported (`auth.ts:408`).
- **Fact:** PLAN §1's Approve row only re-checks the field allowlist. The brief to me says scope is "checked at filing and at approval".
- **Fix:** At approve, for every category:
  - (a) If `submittedByRole === 'Store'`, require `submittedBy === 'store_' + correction.locationId`, or, for a Store account with a `users` doc, that its *current* `storeLocationId` matches.
  - (b) For a Leader-filed `store-link`, recompute the Leader's scope (export a `computeLeaderScopeFor(uid)`) and return 409 `requester_out_of_scope` if the store has left their scope.
  - (c) Re-run the **value** checks (URL rules from §2), not just the key allowlist.
- Pending requests from before the deploy have no new fields. Handle them the way (a) and (b) describe, and decide (fail closed) what happens to a pre-deploy pending request that fails.

### B5. Review-link host allowlist: path-level open redirect on `www.google.com` / `google.com`
- **Fact (Node check):** Exact host matching after `new URL()`, combined with no username/password, no port, and a raw-input whitespace/control-character check, correctly rejects every look-alike I tried:
  - `google.com.evil.com`, `www.google.com@evil.com`, `evil.com\@www.google.com`, `:8443`, a trailing dot `www.google.com.`, and Cyrillic `gооgle.com` (which becomes `xn--…`).
  - Also: `%67.page` normalizes to `g.page`, which is fine, and `:443` normalizes to an empty port, also fine.
- **Gap:** `https://www.google.com/url?q=https://evil.example` passes every rule. `google.com/url` and `/amp/s/…` are known redirectors. A Store or Leader could propose one, and a Steward could approve it by eye.
- **Fix:** Add a path rule for each host:
  - `g.page` → `/r/…` or any path.
  - `search.google.com` → `/local/writereview` only.
  - `www.google.com` / `google.com` / `maps.google.com` → `/maps` (and `maps.google.com/?cid=` or `/`).
  - `maps.app.goo.gl` → any.
  - Reject `/url`, `/amp`, `/search`, `/aclk`.
- Use the same function at create, at direct edit, at approve, and on the public output. Add the tests listed below.

### B6. Version checks and Magento ID uniqueness must happen inside a transaction
- **Fact:** PLAN §2 says "Unique across `storePages` (409)" and "optimistic concurrency (409 on mismatch)". It doesn't say these happen in a transaction.
  - The record is created lazily: when the doc is missing, the plan uses version 1.
  - Two first writes, or two Stewards giving the same ID to two stores, would race.
- **Fix:**
  - Run `PATCH` and `/visibility` in `runTransaction`. Define the version of a missing doc as 0, and use `tx.create` the first time.
  - For uniqueness, the simplest provable way is a claim doc: `storePageMagentoIds/{id}` → `{locationId}`.
    - Create it with `tx.create` in the same transaction, and delete the old claim when an ID changes.
    - It's still server-only under the deny-all rule, and still needs no index. Add it to the backup list.
  - A `tx.get(query)` on `magentoStoreId ==` inside the same transaction is also acceptable. **[Assumption:** Firestore server transactions protect query reads; I didn't test that here.]

### B7. Hours-exception check: apply it at create too, and match the real shape
- **Fact:** The creator accepts any `type`, any `intervals` and any label length, and adds `source:'manual'` (`hoursExceptions.ts:123-142`). The new approve-time check (label ≤ 60, `HH:MM`, dates) would block requests the creator accepted.
- **Fact:** Production had 6 `corrections` docs at the B2 snapshot (`DEPLOY-LOG.md:20`). Their statuses and contents haven't been inspected.
- **Fix:**
  - Use one validator, called from `hoursExceptions.ts` (create) and from approve. It should allow `type ∈ HoursExceptionType`, an optional `source`, and `endDate ≥ startDate`.
  - Before deploy, run the new create and approve validators **offline** against the decoded pre-deploy snapshot's pending corrections. List any that would become unapprovable, and tell Stewards about them.

---

## The 5 checks, one by one (facts / judgment)

**1. Role table and enforcement**
- **Fact:** The registered-user gate is mounted at `index.ts:49` (`auth.ts:305-372`). `requireStoreAccess` (`auth.ts:374-406`) lets Admin/Steward through for all stores, a Store for its own store, and a Leader for stores in scope. Everyone else gets 403, so a Viewer gets 403.
- **Fact:** The Admin router is gated at `admin.ts:38-46`. The API Clients router is Admin-only (`apiClients.ts:23-35`).
- **Plan:** It adds an explicit `role === 'Admin'` check on `/visibility` and `role ∈ {Steward, Admin}` on `PATCH`. That's correct.
- **Gap 1 (first 10 regions, `auth.ts:444`):** This only matters for one person with more than 10 RM region assignments. Production has 12 regions. The effect is **too little** access, which fails safe. It never grants extra access. → nice-to-have N2.
- **Gap 2 (active only, `auth.ts:463`):** Location `lifecycle` is only `planned | active | retired` (`types/index.ts:141`). "Temporarily closed" is a closure; the store stays `active`. So Leaders lose only planned and retired stores. Those have no editable public page (planned stores are left out; retired returns status only). **No wrong access.**
- **Additional gap found (fact, `auth.ts:432`):** An assignment counts as active if `endDate` is missing or ≥ today. **`startDate` is never checked**, so a DM or RM assigned for a future date gets scope early. That's **too much** access, but the impact is small: they can file a request (a Steward approves it) and read card data that is public anyway. "Today" is also the UTC date, so an assignment ending today PT drops off about 8 hours early (after 4 PM PT). → N1.
- **Plan's other caveats:** An empty scope means a Leader can request nothing, which fails safe. The `personId` fallback is confirmed (`auth.ts:421`).

**2. Data model and rules**
- **Fact:** `firestore.rules:8-12` is one `match /{document=**} { allow read, write: if false; }` with no other match. `storePages/*` and `settings/*` are denied to clients.
- **Fact:** `settings/*` is read only on the server, by fixed doc id (`config/auth.ts:91`, `workflowSettings.ts:147`, `emailSettings.ts:215-216`). No route lists the `settings` collection, so `settings/storePageDefaults` is not client-readable today.
- **Indexes:** Planned reads are by doc id, single-field equality (`magentoStoreId`, `kind`), or the existing `corrections(locationId, status, submittedAt)` index, which is present in `firestore.indexes.json`. **No new composite index is needed**, provided no new `orderBy` is added. `test/firestoreIndexes.test.ts` already scans the server code for composite queries, so keep it green.
- **Custom Fields rejection:** reasonable. Confirmed: Admin-only (`admin.ts:38-46`), definitions only, and published to every `locations:read` key (`legacyV1.ts:32-52`).
- **Backups:** `backup.ts:129-144` covers the manual snapshot, and `settings` is already in it. `server/scheduledBackup.ts` is used **only** for the pre-import backup (`legacyImport.ts:18`). Weekly backups are Console exports (`functions.ts:6-7`). So adding `storePages` there doesn't cover scheduled backups. → N9.

**3. The `store-link` request type**
- **Allowlist and apply path:** see B1–B4 and B7.
- **Self-approval:** a Steward or Admin can file and approve their own request. There's no privilege gain, since they can already edit directly. → N6: don't let Steward/Admin file `store-link` at all (they use direct edit).
- **Effects of applying the own-store rule to all categories:**
  - Viewer and Leader filing is unchanged. That's still open by design (`test/corrections-new.test.ts:34` expects a Viewer to get 201).
  - Store logins lose cross-store filing in three places. The UI still shows "See something wrong?" on every store (`LocationDetailView.tsx:898`, `:956`), so a Store on another store's page will hit a 403 → N5.
  - Existing tests in `edit.test.ts:300-360` use `createMockFirestore`, not the real routes. They won't catch this, so the new tests must use the real server.
- **Plan's facts confirmed:** `validCategories` at `:278`; `type` passthrough at `:320`; `proposedChanges` stored as-is at `:330`; the category filter in memory at `:66-69`; and Change History reads both `entityId == locationId` and `locationId ==` (`audit.ts:70-79`), with both indexes present.

**4. The public-profile endpoint**
- **Fact:** Scope checking is `credential.scopes.includes(scope)` (`legacyApiAuth.ts:252-260`). Scopes are fixed per client at creation (`apiClients.ts:85-104`), and **no route edits the scopes of an existing client** (routes at `apiClients.ts:37-534`: create, rate-limit, pause, resume, revoke, rotate, delete).
  - So **no existing key gets `public-profile:read` automatically**. Dynamic QR needs a **new** key. That's an Admin-UI data write plus a Dynamic QR Secret Manager entry, and both are already listed as protected steps (PLAN §6.4).
  - No Directory IAM or secret change is needed.
- **Fact:** The middleware sets `Cache-Control: no-store` on every response (`legacyApiAuth.ts:123`, `:278`), so Hosting's CDN won't cache it.
  - There's **no CORS middleware anywhere** (`rg -i cors server` finds nothing), so browsers can't read it cross-origin. It's server-to-server only, which is correct.
- **Fact:** `parseTestScopes` falls back to `['locations:read']` for unknown names (`:249`). Add the `'public-profile'` key before writing tests, or the isolation test passes for the wrong reason. The plan keeps `'all'` unchanged, which is correct.
- **Mounting:** before the `/api` 404 (`index.ts:90`), next to v1–v3 (`:82-84`). It's outside `/api/app`, so it never passes the user gate, which is correct.
- **Leaks:** The explicit field list, status-only for retired stores, minimal output when a page is off, the `phonePublic` rule, and `publicExplanation` only are all correct.
  - Also require: unknown store, planned store, and non-store `kind` return the **same** 404 body (no way to tell which one).
  - `/stores/:storeNumber` rejects anything that isn't digits before any read.
- **Proof that v1–v3 are unchanged:** this is good. **Correction:** there is no CI, so "CI check" means the hash test only. `legacyApiAuth.ts` and `index.ts` are shared and *will* change, so the golden byte-compare test (§3 item 2) is the real proof and must run.

**5. Input checks:** see B5 (URL) and B6 (Magento ID uniqueness). The Magento regex `^[1-9][0-9]{0,5}$` is fine.

**Other checks**
- **Tests:** they target the real server via `API_BASE` and the emulator on the plan's own ports (`testHelpers.ts:4-9` honors overrides). The emulator tamper test and the mutation spot-checks are good. See the required list below.
- **Deploy order:** D1 → D2 (depends on `storePages`) → D3 (independent) → D4 Hosting last. Functions go out before Hosting for each UI-bearing PR. `--only functions:api` doesn't redeploy the scheduled functions, which only use `correction.category` as text (`scheduledCorrections.ts:186`), so that's harmless.
- **Snapshot:** same method as B2. Add `storePages` (and the claim collection from B6) to `defaultCollections` *before* the first data write, so the second snapshot captures them.
- **Change History:** this works because `entityId = locationId`. Audit writes happen **after** the commit and outside any transaction (the existing pattern, `corrections.ts:233`), so a failed audit write leaves an unlogged change. → N4.
  - `GET /audit/location/:id` has no role check (`audit.ts:59-99`), which is a pre-existing issue. Viewers can read Change History, including the editors' emails.
- **Dynamic QR's current v1 use:** nothing in the plan changes v1 output, provided B2 (rollback) is followed and `locations` is never written by `store-link`.

---

## NICE-TO-HAVES
- **N1.** Check `startDate <= today` in `computeLeaderScope` (`auth.ts:432`), and use a PT date. This is shared auth code that runs on every request, so it needs its own small change and its own test, not part of D2.
- **N2.** Query the RM regions in chunks of 10 or fewer instead of `slice(0, 10)` (`auth.ts:444`).
- **N3.** Normalize `mainPhone` (`normalizePhoneNumber`) and check `sharedInboxEmail` at approve. The propose path stores the raw value (`edit.ts:89`), and the phone is published on the public profile. Dynamic QR still restricts it to `tel:`.
- **N4.** Write the `store-page` audit entry inside the same transaction or batch as the change. Then the on/off switch and approvals always appear in Change History.
- **N5.** Hide "See something wrong?" or "Report a problem" for a Store login viewing another store, or show a plain message instead of a raw 403.
- **N6.** Block Steward/Admin from filing `store-link` (they use direct edit). Allow only one pending `store-link` per store, and point to the existing one if there is one.
- **N7.** `GET /api/app/store-pages/:id`: return the raw `magentoStoreId` and the submitter's email in `pendingRequest` only to Steward/Admin, matching Marge's B4 labels.
- **N8.** Set an explicit `rateLimit` on the new Dynamic QR client and record it. Reject `/visibility` for planned, retired or non-store locations.
- **N9.** Fix the plan's wording: `scheduledBackup.ts` only covers the pre-import backup. Check that the Console weekly export covers all collections; I couldn't check that.

## Required acceptance tests (real routes on the emulator server, no mock Firestore)
1. `edit_store_other_store_contact_403`: a Store login PATCHes `/api/app/edit/locations/<other>` with `mainPhone`, then `address`, `sharedInboxEmail` and `standardHours`. Expect 403 and no correction created. The same calls on its own store create a correction. (B1)
2. `corrections_invalid_type_400`: an unknown `type` is rejected, and so is `type:'store-page'` with a legacy category. (B1)
3. `storelink_approve_after_unrelated_location_edit_ok`: file a request, edit the hours, approve. Expect 200, `storePages.reviewUrl` set, and `locations.version`, `updatedAt` and `reviewUrl` all unchanged and absent. (B3)
4. `storelink_concurrent_approve_and_cancel`: run them in parallel. Exactly one wins, and the final status matches the data. (B3)
5. `storelink_approve_rechecks_requester`: (a) a planted request with `submittedByRole:'Store'` and `submittedBy:'store_<other>'` gets 409/403. (b) Remove a Leader's DM assignment after filing; approve gets 409 `requester_out_of_scope`. (B4)
6. `storelink_approve_revalidates_value`: a planted request with `reviewUrl:'https://www.google.com/url?q=…'` is rejected at approve. (B4/B5)
7. `reviewurl_rejects`: `/url?q=`, `/amp/s/`, `google.com.evil.com`, `user@`, `:8443`, a trailing dot, an IDN look-alike, `http:`, `javascript:`, a tab inside the URL, and 501 characters. Accepts: `g.page/r/…/review`, `search.google.com/local/writereview?placeid=…`, `www.google.com/maps/place/…`, `maps.app.goo.gl/…`. (B5)
8. `magento_unique_concurrent`: two parallel PATCHes give the same ID to two stores. Exactly one returns 200 and the other 409. Changing an ID frees the old one. (B6)
9. `storepage_first_write_race`: two parallel first PATCHes with `expectedVersion:0`. One returns 200, one 409. (B6)
10. `hoursexception_label_61_rejected_at_create_and_approve`, and an existing-shape exception with `source:'manual'` is approved fine. (B7)
11. `public_profile_isolation`: the new key gets 403 on all v1/v2/v3 routes, and the `all`/`locations` keys get 403 on `/api/public-profile/v1/*`. Run it with `parseTestScopes` updated first. Unknown, planned and warehouse stores return byte-identical 404s.
12. `legacy_golden_unchanged`: the plan's §3 golden byte-compare between ff606e5 and the branch.
13. `rollback_drill` (emulator): with a pending `store-link`, run the ff606e5 server and confirm the runbook step (reject pending store-link) leaves `locations` untouched. (B2)
14. Keep the plan's own list (role matrix, allowlist key set, viewer 403, audit `entityId`, rules byte-identical, `firestoreIndexes.test.ts` green, mutation spot-checks), and add: removing the `edit.ts` own-store check must make test 1 fail.

## Facts, claims, assumptions
- **Facts:** everything cited with `file:line` above, read at ff606e5 in `/tmp/frink-spd`, plus the URL-parsing results from Node on the box.
- **Claims I relied on but did not verify:**
  - Production counts (12 regions, 6 corrections, 5 apiClients, 2 settings) come from the B2 deploy log.
  - The plan's baseline of 932 node / 74 vitest tests.
  - "The B2 gate is live," from Directory Lisa and the B2 log.
  - "Theo has approved the build and the go-live gates," from Directory Lisa's message. This **conflicts with PLAN.md:7 and §8.1**, which say the Directory go-live yes and the protected steps are *not* given yet. Treat them as not given until Theo's own words are quoted.
- **Assumptions:** Firestore server transactions protect query reads (B6 alternative); Dynamic QR calls the endpoint server-side only.

## Not inspected
- Production data: user roles, the contents of the pending corrections, existing apiClients scopes and which one Dynamic QR uses, and any users with role Store but no `storeLocationId`.
- Firebase Auth provider settings; deployed indexes compared with `firestore.indexes.json`; Console scheduled-export settings.
- The Dynamic QR repo side (B4 escaping/CSP); its client and cache code.
- UI code for the card or Admin tab (not built yet); `AdminView.tsx` scope picker; `apiDocsData.ts`.
- `locations.ts` and `legacyV1.ts` hours/closure helpers beyond the lines cited.
- I didn't run the tests or an emulator, and didn't do a live HTTP check.

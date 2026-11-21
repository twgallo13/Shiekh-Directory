# Shiekh Directory: Store page pilot, Directory-side build plan (v1)

- **Author:** Shiekh Directory Lisa. **Written:** Fri Nov 20, 2026, ~10:45 PM PT.
- **Code read:** Shiekh-Directory `main` at `ff606e5` (B2 sign-in gate merged), app in `rebuild/`. Read-only worktree at `/workspace/storepage-dir/src`. All `file:line` refs below are relative to `rebuild/` at ff606e5.
- **Inputs:** Dynamic QR plan Page R2 (read via ReadCanvas), Marge R1/R2 (`/workspace/storepage-ux/`), Frink risk check (on the Page), B2 plan/deploy log (`/workspace/shkdir-b2-plan/`, `/workspace/shkdir-b2-deploy/`).
- **Status:** PLAN ONLY. Nothing built, committed, pushed, deployed, or read from or written to production. No Firebase MCP used.
- **Theo approvals on record (relayed by Dynamic QR Lisa, his tap card, Nov 20 10:14 PM PT):** "Yes, build the pilot list"; pilot stores Inland Center, USC Village, store 32. **Not given yet:** protected changes (key, deploys) and the **Directory** go-live yes. The Dynamic QR go-live yes does not cover the Directory.

---

## 1. Who can do what (access rules first, Marge A4)

| Role | Sees Store page card | Request a review-link change | Edit review link / Magento ID directly | Approve/reject requests | Page on/off | Company tiles + default image (Admin tab) |
|---|---|---|---|---|---|---|
| **Store login** (shared store session or `users` doc with role Store) | Own store only | Own store only | No | No | No (sees status) | No |
| **Leader / DM / RM** | Stores in their scope only | Stores in their scope only | No | No | No (sees status) | No |
| **Steward** | All stores | Yes (not needed) | **Yes** | **Yes** | No (sees status) | No |
| **Admin** | All stores | Yes | Yes | Yes | **Yes** (one confirm, logged) | **Yes** |
| **Viewer** | **No** (card not rendered; API 403) | No | No | No | No | No |
| **Dynamic QR key** (`public-profile:read`) | n/a: reads the public allowlist only | No | No | No | No | No |

**Leader district scoping: it exists today, but requests don't use it.**
- **Exists [Fact]:** `computeLeaderScope` (`server/middleware/auth.ts:408-473`) builds `leaderScope.locationIds` from the Leader's active DM (district) and RM (region) assignments. It runs on every request (`auth.ts:269-271`). It is enforced by `hasPermission` own-scope (`src/lib/permissions.ts:98-101`) and `requireStoreAccess` (`auth.ts:398`).
- **Not used by requests [Fact]:** `POST /api/app/corrections` (`server/routes/corrections.ts:254-292`) checks only that a user is signed in. Any Leader, Store or Viewer can file for any store, and `category`/`proposedChanges` are not checked against each other (`:264`, `:330`).
- **Caveats [Fact]:**
  - RM scope reads only the first 10 regions (`auth.ts:444`).
  - Only active locations count (`:463`).
  - A Leader with no active DM/RM assignment has an empty scope, so they can request nothing.
  - `personId` falls back to uid (`:421`).

**Server-side enforcement points (new code marked NEW; anchors are existing lines):**

| Rule | Where it is enforced |
|---|---|
| Must be a registered user (blocks outside and unregistered accounts) | Existing gate `requireRegisteredUser` mounted at `server/index.ts:49` (`auth.ts:305-372`) |
| Role/session identity, incl. Store `storeLocationId` | `auth.ts:229-239` (store session), `:261-271` (users doc + leaderScope) |
| Read the card data | NEW `server/routes/storePages.ts` `GET /api/app/store-pages/:locationId`: reuse `requireStoreAccess('locationId')` (`auth.ts:374-406`; Admin/Steward all, Store own, Leader in scope), **plus** an explicit Viewer 403 (`requireStoreAccess` already rejects Viewer at `:402`) |
| Steward/Admin direct edit (review link, Magento ID) | NEW `PATCH /api/app/store-pages/:locationId`: `role ∈ {Steward, Admin}` |
| Page on/off | NEW `POST /api/app/store-pages/:locationId/visibility`: `role === 'Admin'` only, `expectedVersion` required, audit entry |
| Company defaults | NEW routes inside the existing Admin router, behind its Admin-only gate (`server/routes/admin.ts:38-46`): `GET/PUT /api/app/admin/store-page-defaults` |
| Create a store-link request | `corrections.ts` POST (`:254`). NEW branch for `category === 'store-link'`: role ∈ {Store, Leader, Steward, Admin}; Store → `storeLocationId === locationId`; Leader → `leaderScope.locationIds.includes(locationId)`; `proposedChanges` keys ⊆ `{reviewUrl}`, value validated (§2); Viewer 403 |
| Store login can only file for its own store (all categories, Frink B1) | `corrections.ts` POST: NEW check right after `:283`, applied to every category |
| Approve | `corrections.ts:121-251`. Keep `canApproveCorrections` (`:133`, Steward/Admin via `permissions.ts:53,66`). NEW: re-check the per-category field allowlist **at approve**. `store-link` writes only `storePages/{locationId}.reviewUrl` (never the `locations` doc). Other categories write only `{address, wayfindingDirections, mainPhone, sharedInboxEmail, standardHours}`; `addHoursException` is shape-validated (replaces the blind copy at `:181-202`) |
| Public profile read | NEW router mounted at `/api/public-profile/v1` in `server/index.ts` (before the `/api` 404 at `:90`), with the existing `createLegacyApiAuthMiddleware` (`server/middleware/legacyApiAuth.ts:117-238`) and `requireLegacyScope('public-profile:read')` (`:252-260`) |
| Firestore direct access | None. `firestore.rules` stays catch-all deny (`firestore.rules:8-12`). New collections are server-only, so **no rules change** |

---

## 2. Data model

**Custom Fields verdict: do not reuse. Add a dedicated, server-only `storePages` record.**

Why Custom Fields can't hold these with the same access limits [Fact unless marked]:
1. **It stores definitions only, not per-store values.**
   - `CustomFieldDefinition` (`admin.ts:22-33`) is name/type/options. No location document or route stores a value. A repo grep finds no `customValues`/`customData`.
   - There's no edit screen for values, only `CustomFieldsTab` (`src/components/AdminView.tsx:1164`) for definitions.
   - Production has **0** customFields docs (B2 snapshot decode, `/workspace/shkdir-b2-deploy/DEPLOY-LOG.md:20`).
   - Using it would mean building the whole value layer anyway.
2. **It's Admin-only** (`admin.ts:38-46`). Stewards must edit the review link and Magento ID, and there are no per-field role rules or own-store/district scoping.
3. **It leaks into v1.** `GET /api/v1/location-fields` publishes every definition to all `locations:read` keys (`server/routes/legacyV1.ts:32-52`). Adding "Magento store ID" or "page on/off" definitions would change v1 output, which breaks "v1–v3 unchanged".
4. **Validation is too weak.** It has only generic types (`admin.ts:286-291`): no https/host allowlist and no digits-only or uniqueness check for the Magento ID.
5. **[Judgment] Putting the fields on the `locations` doc is also wrong.**
   - `GET /api/app/locations/:id` spreads the whole doc to every registered role (`server/routes/locations.ts:422-423`), so Viewers would see the fields.
   - Every edit would bump `locations.updatedAt`, so v1 incremental sync clients would re-pull unchanged stores (`legacyV1.ts:133-140`).

**New collection `storePages/{locationId}`** (server-only; doc id = `locations` doc id; created lazily on first write; missing doc = all defaults):

| Field | Type | Default | Who writes | Validation |
|---|---|---|---|---|
| `reviewUrl` | string \| null | null | Steward/Admin direct; Store/Leader via approved `store-link` request | Must parse with `new URL()`, `https:` only, no username/password, no port, no whitespace or control characters, ≤ 500 chars. Host allowlist: `g.page`, `search.google.com`, `www.google.com`, `google.com`, `maps.google.com`, `maps.app.goo.gl`. Stored normalized (`url.href`). Empty → null |
| `magentoStoreId` | string \| null | null | Steward/Admin only | `/^[1-9][0-9]{0,5}$/` (digits only, e.g. "4207"). Unique across `storePages` (409 if another store already has it). Null → Shop tile hidden |
| `pageEnabled` | boolean | **false** | Admin only | boolean; `expectedVersion` required |
| `version` | number | 1 | server | optimistic concurrency (409 on mismatch) |
| `updatedAt`, `updatedBy` | ISO string, uid | | server | Shown as "Last updated …" on the card |

**Company defaults: `settings/storePageDefaults`** (the `settings` collection is already in manual snapshots, `server/routes/backup.ts:137-140`):
- `tiles`: exactly 6 **fixed keys** in a fixed order: `app` (`iosUrl`, `androidUrl`), `launch`, `rewards`, `card`, `instagram`, `returns`. Each has `label` (≤ 40 chars, plain text) and `url`, plus `show: boolean`.
  - The server rejects unknown keys and any add or remove, so 2 store tiles + 6 company tiles = **max 8** (Marge A2).
  - URLs: same https rules as above. Host allowlist: `shiekh.com`, `www.shiekh.com`, `apps.apple.com`, `play.google.com`, `get-card.sunbit.com`, `instagram.com`, `www.instagram.com`.
  - Seeded with the values Theo approved on the Page, Sunbit link unchanged. Seeding is a live-data write (§6).
- `version`, `updatedAt`, `updatedBy`.
- **Default image:** not stored in the Directory for the pilot. There's no upload and no Storage (photos are Phase 2). The image ships as a fixed asset in Dynamic QR. The Admin tab shows a read-only "Company default image · Set by Shiekh" preview.

**Request record:** reuse `corrections`.
- New `category: 'store-link'` and `type: 'store-page'`. Update the `CorrectionCategory` and `CorrectionType` unions in `src/types/index.ts:639-649`.
- `proposedChanges` holds only `{ reviewUrl }`. `currentValues` holds the `storePages` value at submit time. Add `storePageVersion` for the approve-time conflict check.
- Status flow is unchanged: pending → approved/rejected/cancelled.

**Audit:**
- Add `'store-page'` to `AuditLogEntry.entityType` (`src/types/index.ts:527`).
- Entries use `entityId = locationId`, so they appear in the store's existing Change History (`server/routes/audit.ts:70-75`).
- Logged: direct edits, on/off (old → new), and request approvals. Defaults changes use `entityType 'store-page'` with `entityId 'defaults'`.
- [Note] `GET /audit/location/:id` has no role check today (`audit.ts:59-99`). The values logged here are public-display data anyway.

**Backups:** add `storePages` to `backup.ts:129-144` defaults and to `server/scheduledBackup.ts:22-35`.

**No index change.** Reads are by doc id or full scans of `storePages` (~68 locations, per the B2 snapshot). The public list reads `locations` with one equality filter. Corrections reuse existing queries, and the category filter runs in memory (`corrections.ts:66-69`).

---

## 3. API changes

**A. App API (signed-in Directory users, under the existing `/api/app` gate)**
- `GET /api/app/store-pages/:locationId` returns `{reviewUrl, magentoStoreId, pageEnabled, version, updatedAt, pageUrl, pendingRequest?}`. Access is per §1; Viewer and out-of-scope users get 403.
- `PATCH /api/app/store-pages/:locationId` takes `{reviewUrl?, magentoStoreId?, expectedVersion}`. Steward/Admin only.
- `POST /api/app/store-pages/:locationId/visibility` takes `{enabled, expectedVersion}`. Admin only.
- `GET/PUT /api/app/admin/store-page-defaults` sits inside the Admin router (Admin-only).
- `corrections` changes:
  - `store-link` category with per-field allowlist, own-store/in-scope checks and validation at create.
  - Allowlist re-check at approve.
  - Store logins limited to their own store for every category (Frink B1).
  - The `addHoursException` shape is validated (dates `YYYY-MM-DD`, `HH:MM` intervals, label ≤ 60).

**B. New public-profile endpoint, separate from v1 (Frink B3)**
- Mounted at `app.use('/api/public-profile/v1', createLegacyApiAuthMiddleware(db), createPublicProfileRouter(db))` in `server/index.ts`. **Not** under `/api/v1`, because that router forces `locations:read` on every route (`legacyV1.ts:30`) and v1 returns the store inbox email (`legacyV1.ts:331`).
- Router-level `requireLegacyScope('public-profile:read')`.
- Routes:
  - `GET /api/public-profile/v1/stores` is the full list. Dynamic QR calls it once every 15 minutes, which is far under the default 60/min key limit.
  - `GET /api/public-profile/v1/stores/:storeNumber`, digits only.
- Response is built field by field (no object spread), `Cache-Control: no-store` (set by the existing middleware at `legacyApiAuth.ts:123`):

```json
{ "contractVersion": "public-profile.v1", "generatedAt": "…",
  "companyTiles": [ { "key": "instagram", "label": "Instagram", "url": "https://www.instagram.com/shiekh", "order": 7 } ],
  "stores": [
    { "storeNumber": "48", "status": "Active", "pageEnabled": true, "updatedAt": "…",
      "name": "Inland Center", "mallOrCenterName": "…",
      "address": { "street": "…", "suite": "…", "city": "…", "state": "CA", "zip": "…" },
      "timeZone": "America/Los_Angeles",
      "phone": "+19093800200",
      "hours": { "weekly": { "monday": { "closed": false, "intervals": [{ "open": "10:00", "close": "20:00" }] } },
                 "exceptions": [ { "type": "holiday", "label": "Thanksgiving", "startDate": "2026-11-26", "endDate": "2026-11-26", "closed": true, "intervals": [] } ] },
      "temporaryClosure": null,
      "reviewUrl": "https://g.page/r/…", "magentoStoreId": "4207" } ] }
```

- Status values are `Active`, `Temporarily Closed` or `Retired`. Planned stores are left out.

**Field rules:**
- Only `kind === 'store'` locations are included.
- `phone` appears only when `phonePublic === true` (the v1 rule, `legacyV1.ts:344-346`). It does **not** copy the list-route leak at `locations.ts:238`.
- `hours` is `null` when `standardHours` is missing, so Dynamic QR shows "Hours not listed. Please call the store." (Marge A7).
- Weekly intervals are kept as-is: split shifts are kept, and overnight closes come through as close < open.
- Exceptions keep `endDate`. v1 drops it (`legacyV1.ts:383`).
- Exceptions that fail validation are dropped, not passed through.
- `temporaryClosure` is `{ publicExplanation, reopensOn }`. It uses only `Closure.publicExplanation` ("safe for public display", `src/types/index.ts:99`), never `reason` or `reasonNote`.
- **Not included:** emails (store inbox or personal), people and manager data, district/region, internal doc ids, `wayfindingDirections`, `lastVerifiedAt`, notes.
- Live pages include `magentoStoreId`. Dynamic QR uses that field for the Shop button. A missing value, or one that starts with `0`, is `null`. Page-off and retired records omit the field. The shop tile is not a `companyTiles` entry.
- Text is trimmed, control characters are stripped, and lengths are capped (name ≤ 100, labels ≤ 60). Dynamic QR still escapes everything (Frink B4).

**Retired and off stores:**
- `pageEnabled:false` → `{storeNumber, status, pageEnabled:false}` only.
- Retired → `{storeNumber, status:"Retired"}` only.
- If a retired and an active store share a number (allowed, `src/types/index.ts:190`), the active store wins.

**Key scope:**
- Add `'public-profile:read'` to `LegacyApiScope` (`legacyApiAuth.ts:5-10`) and to both `VALID_SCOPES` copies (`server/routes/apiClients.ts:12-18`, `scripts/manage-api-client.ts:17-23`).
- Add it to the Admin API Clients scope picker (`AdminView.tsx:~57-63`) and to the API docs (`src/lib/apiDocsData.ts:~66-73`).
- Emulator test scope: add a **new** key `'public-profile'` in `parseTestScopes` (`legacyApiAuth.ts:240-249`). Do **not** add it to `'all'`, so emulator v2/v3 `grants` hashes stay the same.
- The Dynamic QR key gets `public-profile:read` **only**.

**Proof that v1–v3 are unchanged:**
1. `git diff main -- server/routes/legacyV1.ts server/routes/legacyV2.ts server/routes/legacyV3.ts` is empty (CI check plus a test that hashes the three files).
2. Golden test: seed the emulator, capture the v1 `/location-fields`, `/locations`, `/locations/:n`, `/locations/:n/operating-state`, v2 `/snapshot`, `/personnel`, `/location-staffing` and v3 `/snapshot`, `/district-leadership`, `/location-districts` responses on ff606e5, then on the branch. Byte-compare after removing `requestId` and time fields.
3. Existing `test/legacy-api.test.ts` and `test/v2-regression.test.ts` pass unchanged.
4. Scope isolation in both directions:
   - A `public-profile` key gets 403 `insufficient_scope` on every v1, v2 and v3 route.
   - `all`, `locations` and other existing keys get 403 on `/api/public-profile/v1/*`.
5. Store-page edits don't change `locations.updatedAt` or `version`, so v1 incremental sync sees nothing new.

---

## 4. UI changes (existing Directory patterns only)

**Store page card on the store profile (NEW `src/components/StorePageCard.tsx`)** (Marge A3):
- **Placement:** in `LocationDetailView.tsx`, between the Store Information card (`:834`) and "See something wrong?" (`:895-910`). Same card styling.
- **Visibility:** rendered only for Store (own store), Leader (in scope), Steward and Admin. The client check prevents a flash; the server 403 is the real guard.
- **Card contents:**
  - **Page status:** Live / Off.
  - **On/off control (Admin only):** a switch that opens one confirm dialog using the existing `Dialog.tsx` (same pattern as the Reopen confirm at `:981-1015`). Wording: "Turn on the store page for #48? Customers who scan the code will see it within 15 minutes." It's logged in Change History.
  - **"Open page" link:** `https://qr.shiekh.store/s/<storeNumber>`, new tab, from one constant.
  - **Copy:** "Changes show within 15 minutes" and "Last updated <time PT>".
  - **Review link:**
    - Steward/Admin see the value with an inline Edit.
    - Store/Leader see the value and a **"Request a review link change"** button. It opens a small form in a `Dialog` with one URL field, a note, and inline validation messages in plain words.
    - If a request is pending, the card shows "Pending Review" with a link to My Requests.
  - **Shop this store:** Steward/Admin edit the "Magento store ID" (digits only; helper text "Theo adds IDs Monday"). Others see "Shop tile: shown" or "Shop tile: hidden until set". The raw ID is shown only to Steward/Admin (Marge B4 plain labels).
  - **Tiles list (max 8):** the 6 company tiles show a lock icon and "Set by Shiekh". They have no controls for stores (A5).
  - **Photo:** "Company default image". No upload (A1).
- **Admin › "Store page defaults" tab:** one new `TabButton` in `AdminView.tsx` (tab bar `:86-130`) plus a panel.
  - Shows the 6 fixed tile rows (label, URL, show toggle, lock icon) and the read-only default image preview.
  - Save with a confirm dialog; logged. No add/remove/reorder.
- **My Requests (`src/components/MyRequestsView.tsx`):** already shows Pending Review / Approved / Rejected (`:18-20`). Add the category label "Store page link" and show the proposed link as text.
- **Requests queue (`CorrectionsQueue.tsx:303`):** show `reviewUrl` old → new as plain text, not a clickable link, plus the store number. Approve/Reject are unchanged.
- **Change History (`AuditHistory`):** add a label for `store-page` entries.
- **Accessibility:** real buttons and links, visible focus, 44 px targets (the existing `min-h-[44px]` pattern), labelled inputs, errors tied to their fields.

---

## 5. Tests (real code, emulator on my own ports)

**Setup:**
- Run on a separate clone or worktree, under project `demo-storepage-dir`, with a copy of `firebase.json` that uses my own ports. All of these were free on the box at 10:40 PM PT: Firestore `18581`, Auth `19591`, hub `14581`, logging `14591`, UI off.
- API server: `PORT=13951`. Tests run with `FIRESTORE_EMULATOR_HOST=127.0.0.1:18581 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:19591 API_BASE=http://127.0.0.1:13951` (`test/testHelpers.ts:4-9` honors env overrides).
- Re-check the ports with `ss -ltn` first. Never touch or kill other processes or default ports.
- Full gate: `npm run lint`, `npm run build`, `npm test` (node + vitest). Baseline on ff606e5 first (expect 932 node / 74 vitest per the Page).

**New test files:**
- `test/storePages.test.ts` covers the role matrix:
  - Each of 5 roles + store session × read / edit / on-off / defaults, own vs other store, Leader in vs out of scope.
  - Viewer 403 everywhere.
  - Version conflicts.
  - Magento ID validation and uniqueness.
  - Review-URL validation: http, `javascript:`, credentials, ports, off-allowlist host, spaces, 501 chars.
  - Audit entries written with `entityId = locationId`.
  - `locations` doc and its `updatedAt` untouched.
- `test/storeLinkRequests.test.ts`:
  - Store own store OK; other store 403. Leader in scope OK; out of scope 403. Viewer 403.
  - Extra fields in `proposedChanges` rejected at create.
  - A tampered pending correction (extra fields written directly in the emulator) is rejected **at approve**.
  - Approve writes only `storePages.reviewUrl`. Reject leaves data unchanged.
  - My Requests lists the request with the right status.
  - Store login filing a legacy category for another store → 403.
  - Malformed `addHoursException` rejected.
- `test/publicProfile.test.ts`:
  - Scope isolation both ways and v1–v3 golden responses (§3).
  - Explicit allowlist: the response key set equals the expected set, and a planted `sharedInboxEmail`, person data or `reasonNote` never appears.
  - Private phone omitted. Retired → status only. Page off → minimal. Planned omitted.
  - Active-over-retired number collision.
  - Missing hours → `null`. Holiday `endDate` kept. Split and overnight intervals kept.
  - `publicExplanation` only.
  - Control characters stripped. Leading-zero store "001" lookup.
- `test/firestoreRules.test.ts` stays green, and `firestore.rules` is byte-identical to ff606e5.
- Vitest UI tests (`*.test.tsx`):
  - Card hidden for Viewer and other-store Store.
  - Lock icon and "Set by Shiekh" shown.
  - On/off only for Admin, with a single confirm.
  - Admin tab has no add-tile control.
- **Mutation spot-checks, in the style of Frink's B2 run:**
  - Remove the approve-time allowlist → the tamper test must fail.
  - Remove the Leader scope check → the out-of-scope test must fail.
  - Spread the location into the public response → the allowlist test must fail.

---

## 6. Protected steps that need Theo's direct yes (in my chat, or a quoted Matt relay)

None of these is covered by "Yes, build the pilot list".

1. **Merges to `main`.** Planned as 4 PRs:
   - **D1:** storePages data and app API.
   - **D2:** request allowlist, own-store and scope checks, store-link type (Frink B1).
   - **D3:** public-profile endpoint and scope.
   - **D4:** Store page card and Admin tab.

   Frink reviews each PR (Decision Review for the release). Marge checks D4 screens.
2. **Snapshot before deploy.** Same method as B2: a repo snapshot through Admin backups, decoded and counted.
3. **Deploys**, from a clean checkout with a clean-env build:
   - `firebase deploy --only functions:api --project shiekh-directory-v2 --config <abs>/rebuild/firebase.json`, then `--only hosting` for the UI.
   - Never `npm run deploy`, `--only functions`, or the Firebase MCP.
   - **No `firestore:rules` or `firestore:indexes` deploy is planned.** If one turns out to be needed, it gets a separate yes.
4. **Creating the Dynamic QR `shk_` key** in Admin › API Clients, scope `public-profile:read` only.
   - This is a live-data write. The token is shown once and goes straight into Dynamic QR's Secret Manager, which is a Dynamic QR protected step (no chat, no files, no VITE_ variable).
5. **Live data writes:**
   - Seeding `settings/storePageDefaults`.
   - Entering review links and Magento IDs for the 3 pilot stores.
   - Migrating valid QR Hub review links.
6. **Directory go-live yes, plus the first page switch-on for each pilot store** (Theo checks the page on his phone first).

---

## 7. Rollback

- **Instant, no deploy:**
  - Revoke or pause the Dynamic QR key (`apiClients.ts:220`, `:390`). Dynamic QR then keeps its last good copy or falls back.
  - An Admin turns `pageEnabled` off per store.
  - Dynamic QR's `STORE_PAGES_ENABLED` flag goes off.
- **Code:** redeploy `functions:api` from ff606e5 (or the prior good SHA), and re-release the previous Hosting version from release history. Same method as the B2 deploy log.
- **Data:** the new data is additive and isolated (`storePages`, `settings/storePageDefaults`, new correction category). Old code ignores it, so rollback needs no data change.
- **Untouched:** `locations` docs, rules, indexes and v1–v3.
- **Restore:** the pre-deploy snapshot is available but shouldn't be needed.

---

## 8. Open questions (only ones that need Theo)

1. **Directory go-live:** "Yes, push the Directory store-page pieces live after Frink passes, tests pass, a snapshot is taken and rollback is ready; pages stay off until I check a pilot store on my phone." Needed in my chat, since Dynamic QR's yes covers only Dynamic QR.
2. **Store 32:** confirm which store this is (store number 32, name?) so I don't guess.

**Decided without Theo:**
- Only Google review links allowed for now.
- No email on the public page.
- Default image ships with Dynamic QR.

He can overrule any of these later.

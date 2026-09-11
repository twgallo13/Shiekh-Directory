# Dispatch 5: Remaining Read Surfaces and Manual Assignment UX

**Status:** Bounded implementation complete for the approved interim scope; review pending
**Depends on:** Dispatch 4 (merged to `main`, commit `791ac34`), production deployment accepted by data owner
**Implementation mode:** Client read-surface consistency, controlled leadership selector eligibility, and only the necessary supporting server/type changes; reuses existing server validation and transactions

This dispatch continues from the accepted Dispatch 4 foundation. It completes the approved subset of Phase C read-surface consistency and the interim retail-leadership selector behavior from Phase D. It does not complete all of Phase C or Phase D: Region/District activation, Regional Manager coverage, stricter assignment eligibility, and Corporate/DC "Works at"/"Supports" workflows remain deferred.

## Scope

### Completed in this dispatch

1. **Canonical relationship display consistency** — reuse the repaired CSV/read-projection rule (missing or inactive Person references never fall back to a stale copied name) across:
   - `LocationDetailModal` (Store Manager, District Manager, Assistant Managers, Key Holders)
   - `PersonDetailModal` (assigned-store matching; removed name-based fallback matching)
   - `LocationsView` (table, district-group, and card views; search filter)
   - `PrintSheetView` (printable roster; search filter; district-manager grouping)
   - `UniversalSearchModal` (location results now show the resolved active Store Manager)
   - All valid resolved People/Locations remain clickable, navigating to their detail view.

2. **Public Directory API allowlist preserved** — confirmed `server/directoryApi.ts` exposes no leadership fields or diagnostic warnings today; no change was needed or made to its field allowlist or privacy behavior.

3. **Controlled retail leadership selectors (interim product decision)** — the product owner approved selecting **any active Person** for retail leadership slots, with no new multi-location caps or cross-role restrictions. `LocationEditModal` now uses the shared `resolveActivePerson` rule for all selector choices; unavailable current canonical assignments remain visible for review but are not offered as new choices. Application permissions remain independent. `assignmentTypes`-based eligibility remains deferred.

4. **Region/District and Corporate/DC assignment left pending** — no Region/District ID selectors were added to the UI; the existing free-text `district` display/filter is unchanged. No "Works at"/"Supports" assignment workflow was added for ordinary corporate/DC personnel.

### Supporting change (necessary, not a redesign)

- Added `resolveActivePerson` / `resolveActivePersonList` to `src/lib/readProjectionContract.ts` — the same missing/inactive resolution rule already used by `buildLocationReadProjection` for CSV export, now reusable by UI components that need an actual `Person` object (for click-through navigation and phone numbers), not just a display string.

### Out of scope (deferred)

- Region/District controlled selectors and hierarchy-aware search/print grouping (blocked on the authoritative roster; see Dispatch 4 decision record).
- Regional Manager fields/selectors/read-surface coverage (the current LocationRecord/edit/read surfaces do not yet represent this relationship consistently).
- Stricter `assignmentTypes`-based eligibility, cardinality caps, and cross-role incompatibility rules.
- Ordinary Corporate/DC `Works at` / `Supports` assignment workflow (blocked on source-of-truth decision).
- Governed CSV import, bulk cleanup, data migration, or writer cutover (Phases E–F).
- Any redesign of application permissions/RBAC.
- Browser/visual/functional acceptance testing (owned by the product/data owner).

## Deferred assignment policy (not implemented)

The approved interim decision for this dispatch is **any active Person**, with no new multi-location caps or cross-role restrictions. No `assignmentTypes` field or stricter cardinality/incompatibility policy is introduced here. The following remains deferred:

| Decision | Option A (minimal) | Option B (structured) | Current interim behavior |
|---|---|---|---|
| Eligible-person source | Any Active Person | Only People with an explicit `assignmentTypes` entry matching the slot | **Interim: any active Person** |
| Multi-location assignment | Unlimited locations per manager | Capped per role (e.g. District Manager ≤ N districts) | Unlimited (server does not cap) |
| Same person, multiple roles at one location | Allowed | Disallowed except approved exceptions | Allowed (server only rejects duplicate IDs within one array field) |
| Job title vs. eligibility | Descriptive only, never filters | Job title required to match assignment type | **Interim: descriptive only** |

## Verification

- `npm run lint`
- `npm run test:api`
- `npm run build`
- `git diff --check`

No browser automation was run for this dispatch; visual/functional acceptance testing is the data owner's responsibility. This dispatch does not claim all of Phase C or Phase D complete.

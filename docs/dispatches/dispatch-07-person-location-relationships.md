# Dispatch 7: Employee Works at and Supports Relationships

**Status:** Full Person workflow follow-up complete; review and manual acceptance pending
**Starting SHA:** `6bea5ec8e138c2b3478084d3b2725e9fb76f46c7`
**Depends on:** Dispatch 6 Region/District registry and Regional Manager coverage
**Implementation mode:** Additive Person-owned employment relationships; no inference, migration, bulk cleanup, or public contract expansion

## Approved model

- `primaryLocationId` is the optional canonical **Works at** relationship to one company Location.
- `supportedLocationIds` is the optional canonical **Supports** relationship to zero or more additional company Locations.
- Person records own both relationships. Location profiles derive incoming employees from Person records and store no reverse copies.
- Employment relationships are independent of retail leadership assignments, job titles, and application permissions.
- Existing People may remain unassigned. `assignedLocations` remains compatibility data and is not read as employment authority.

## Completed

1. Added optional `primaryLocationId` and `supportedLocationIds` fields to the Person contract and the shared correction-request target shape.
2. Added one reusable full Person editor for creation and updates: full name, free-text job title, department, work phone and extension, work email, active status, contact privacy, compatibility district, Works at, and Supports.
3. Selector state removes duplicates and prevents the primary Location from also appearing in Supports. Changing Works at reconciles the final Supports list immediately.
4. Person profiles show one deduplicated Locations list. Each Location appears once with all applicable labels: Primary workplace, Supports, Store Manager, Assistant Manager, District Manager, Regional Manager, and Key Holder. Missing and retired references remain visible as unavailable.
5. Location profiles show employees who work at or support that Location, derived directly from Person records and kept separate from the leadership roster.
6. Server writes preserve omitted employment fields for older clients. Explicit `null` clears Works at; explicit `[]` clears Supports.
7. Server validation uses proposed transaction state, accepts existing non-retired Locations without job-title restrictions, and rejects duplicate, overlapping, missing, or retired new references.
8. Location retirement or deletion rejects unresolved incoming employment references. The same transaction may reassign or clear affected People before completing the lifecycle change.
9. Direct Person saves and approvals of persisted Person requests use the same validation, optimistic version checks, atomic transaction, and audit evidence. The existing request-creation UI scope is unchanged. Employment-only saves do not rewrite leadership-owned Location records.
10. Rejected client saves restore prior Person and Location state; successful responses reconcile committed versions for refresh and consecutive edits.
11. Added separate Person inactivation and deletion actions. Both expose linked leadership Locations and user accounts before submission; Location blockers open the owning Location editor and user blockers open the focused Admin access-control record.
12. Person deletion requires the exact full name, uses the current expected version, writes audit evidence, and keeps the Person profile and confirmation state intact when the server rejects the transaction.
13. Explicit numeric work-phone extensions now survive server phone normalization instead of being discarded.
14. Store Manager and District Manager removals serialize as explicit clears, while omitted assignment fields remain unchanged. Clearing both assignments permits deletion of an otherwise unlinked Person.
15. Person contact display and editing consistently prefer the complete work contact pair, then fall back to the legacy pair. Untouched phone, extension, and email aliases survive edits without being collapsed.

## Compatibility and boundaries

- Unrelated Person edits preserve omitted relationship fields, including unchanged legacy defects.
- No employment relationships are inferred from leadership slots, job titles, `assignedLocations`, districts, or existing copied values.
- No migration, bulk cleanup, governed import, new permission rules, public API/export expansion, or unrelated redesign is included.
- Location eligibility uses record lifecycle (`recordStatus !== 'Retired'`), not daily operating hours.
- Existing Person-edit permissions are unchanged.
- Person-owned employment fields remain editable only on the Person. Leadership assignments remain editable only on the Location, and application access remains editable only in Admin.

## Focused regression coverage

- Ordinary Corporate employees assigned to Corporate, DC, retail, and other company Locations without leadership slots.
- Multiple Supports relationships and persisted readback across consecutive versioned edits.
- Duplicate Supports IDs and Works at/Supports overlap.
- Explicit `null`/`[]` clearing versus omitted fields from older clients.
- Missing and retired Location references.
- Stale Person saves without mutation.
- Correction approval applying the same employment field contract.
- Unchanged legacy relationship defects during unrelated Person edits.
- Location retirement/deletion with incoming references, including same-transaction reassignment and unlink.
- Controlled-selector reconciliation and unavailable-reference rendering without browser automation.
- One grouped Person Location row carrying multiple employment and leadership labels.
- Actionable Location and linked-user blocker projection without treating employment relationships as deletion blockers.
- Complete Person create, full update, extension persistence, expected-version delete, and audit lifecycle.
- Store/District Manager omission versus explicit clearing, followed by successful deletion of the unlinked Person.
- Name-only Person serialization and persistence with differing legacy/work phone, extension, and email values.

## Verification

- `node --import tsx --test test/personLocationRelationships.test.ts test/customFieldPersistence.test.ts`
- `npm run lint`
- `npm run test:api`
- `npm run build`
- `git diff --check`

Browser automation was not run. Visual and functional acceptance remain the product/data owner's responsibility.

## Manual checklist

1. Create an ordinary Corporate or DC employee with no leadership slot; select one Works at Location and multiple Supports Locations.
2. Confirm Corporate Office, Warehouse / Distribution Center, retail, and Other Company Location records appear with number, name, and type.
3. Change Works at to a Location currently in Supports and confirm it is removed from Supports before save.
4. Save, close, refresh, reopen, edit again, and confirm relationships and versioned consecutive saves persist.
5. Clear Works at and Supports, save, refresh, and confirm both remain unassigned.
6. Open each related Location from the Person profile and each related Person from the Location profile.
7. Confirm each Location appears once on the Person profile with every applicable employment and leadership label.
8. Review a Person with a missing or retired current reference; confirm it is visible as unavailable but cannot be newly selected.
9. Force or simulate a stale/rejected save and confirm the displayed Person returns to persisted relationships with a clear error.
10. Confirm Location retirement/deletion is blocked while incoming employment references remain and succeeds after an explicit same-transaction reassignment or unlink.
11. Edit all Person fields, including a free-text title, department, phone extension, active status, and privacy; refresh and confirm they persist.
12. Attempt inactivation and deletion while leadership assignments or a linked user remain; confirm each blocker identifies and opens its owning record.
13. Clear blockers, inactivate the Person, then separately test deletion by typing the exact full name. Confirm rejected actions keep the dialog and data intact.

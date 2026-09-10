# Dispatch 3 Decision Report: Hierarchy and Assignment Architecture

**Source dispatch:** `docs/dispatches/dispatch-03-hierarchy-and-assignment-architecture.md`
**Date:** 2026-09-10
**Status:** Decision report complete; implementation approval required
**Scope:** Architecture and contract only

## Completion and safety statement

This report is based on read-only repository inspection. No production code was changed, no Firestore data was read or written by this dispatch, no migration script was run, and no commit, push, or deploy was performed.

The existing dispatch remains the controlling request and is the return dispatch for this report.

## 1. Confirmed current behavior versus blueprint intent

### Current model

`LocationRecord` currently has a stable `id`, a free-text `district`, and location-owned relationship IDs for `storeManagerId`, `districtManagerId`, `assistantStoreManagerIds`, and `keyHolderIds`. It also stores copied manager names, and the store manager phone. It has no `region` or regional-manager relationship.

`Person` currently has a stable `id`, free-text `role`, `jobTitle`, `department`, `assignedLocations` containing store-number values, and `district`. It has no explicit region, reporting relationship, assignment-type capability, or `locationsOverseen` field.

The browser initializes a relationship migration that maps legacy manager names to IDs and populates some copied names, phones, districts, and person assigned-location arrays. Person edits also cascade copied values to affected locations. This is partial synchronization, not a single durable relationship transaction: copied values can become stale, and the browser can update its local state before a server commit succeeds.

The location form uses job-title, role, and department text matching to populate manager selectors. District is free text. There is no region or regional-manager selector. The person form permits arbitrary job-title text and does not provide an operational assignment-type selector.

The server write path uses Firestore transactions, duplicate location store-number and user-email checks, phone/URL/custom-field validation, role and scope checks, and audit records. It does not currently validate person references, active status, role eligibility, duplicate assignment types, hierarchy applicability, or relationship consistency.

### Read surfaces

- Universal search covers location number/name/city/address and person name/job title/district. It does not cover region, department, manager relationships, or mall/center name consistently.
- Location filters and district grouping exist; region filtering and hierarchy navigation do not.
- Printable output is browser print HTML grouped by district. There is no dedicated PDF generation service.
- Server CSV export is scope-aware and resolves manager names and phones from Person IDs at export time. Current columns contain District but not Region or RegionalManager. Orphaned person IDs are counted and do not silently fall back to copied names when an ID exists.
- The admin CSV import tab is a simulated success state, not an import workflow. `scripts/migrateFirestoreFromCsv.ts` is a one-time migration utility, not governed operational import.
- The Directory API is read-only and authenticated, but the current location DTO is not a complete hierarchy/assignment contract and the repository has known identity-conflict behavior that must remain fail-closed.
- User profiles may contain `personId`. Account display handles a missing local person with a warning, but server account lookup does not yet enforce that the linked person exists, is unique, and is active.

### Blueprint differences

The blueprint requires Company -> Region -> District -> Location, retail leadership including Regional Manager, canonical person records with assigned and overseen locations, optional reporting relationships, search by region and district, and non-retail locations that are not forced into retail hierarchy. Those requirements are not yet represented consistently in types, forms, server validation, API, export, or search.

## 2. Recommended canonical model

### Ownership decision

Assignments are canonical on `Location` for this implementation phase. A location owns its leadership slots because the required question is which person occupies which operational slot at a location, and because one manager may oversee many locations. `Person.assignedLocations` and `Person.locationsOverseen` are projections, never independent write authorities.

Every relationship is represented by stable IDs. Names, phone numbers, districts, and reverse lists are derived at read time or regenerated in the same server transaction when compatibility fields must be retained.

A future relationship collection is not required for the first implementation. It should be considered only if assignment history, effective dates, many-to-many support roles, or high-volume querying make embedded location relationships insufficient.

### Proposed field contract

The following is a target contract, not a permission to change the schema in this dispatch:

```ts
type RetailHierarchyApplicability = 'Applicable' | 'Not Applicable' | 'Unknown';
type AssignmentType =
  | 'Store Manager'
  | 'Assistant Store Manager'
  | 'Key Holder'
  | 'District Manager'
  | 'Regional Manager';
type PersonCategory =
  | 'Retail'
  | 'Corporate'
  | 'Field Leadership'
  | 'Distribution Center';

interface LocationHierarchy {
  regionId?: string;
  regionName?: string;       // derived compatibility/display field
  districtId?: string;
  districtName?: string;     // derived compatibility/display field
  applicability: RetailHierarchyApplicability;
}

interface LocationAssignments {
  storeManagerId?: string;
  assistantStoreManagerIds: string[];
  keyHolderIds: string[];
  districtManagerId?: string;
  regionalManagerId?: string;
}

interface PersonOperationalProfile {
  category: PersonCategory;
  assignmentTypes: AssignmentType[];
  assignedLocationIds: string[]; // projected "works at" locations
  reportingToPersonId?: string;
  regionId?: string;
  districtId?: string;
}
```

A concrete location should retain the existing stable `LocationRecord.id`; `assignedLocations` should migrate conceptually from store numbers to stable location IDs, with a temporary compatibility projection for consumers that still require store numbers. The target Person record should retain `jobTitle`, `department`, and contact data, while `assignmentTypes` supplies eligibility and `category` supplies broad operational classification. Application authorization remains on the user/account model and is not inferred from either field.

Region and District should be entities with stable IDs, display names, active/retired state, and an audit trail. The initial rollout may use a controlled hybrid registry backed by configuration or a dedicated collection, but free-text values must not be accepted as new canonical hierarchy references. `regionName` and `districtName` are projections for legacy consumers.

### Reverse lookups

The server computes `works at` from a Person's explicit `assignedLocationIds` projection or from an explicit future work-assignment relation. It computes `manages` from `Location.assignments.storeManagerId`, `assistantStoreManagerIds`, and `keyHolderIds`, tagged by assignment type. It computes `oversees` from District Manager and Regional Manager slots. It must never combine these labels into one undifferentiated list.

For current compatibility, the server may materialize `Person.assignedLocations` as store numbers only after validating each location ID. It must flag stale, missing, duplicate, or ambiguous values rather than silently repairing them during ordinary reads.

## 3. Hierarchy and relationship matrix

| Location type | Region | District | Store Manager | Assistant Manager | Key Holder | District Manager | Regional Manager | People behavior |
|---|---|---|---|---|---|---|---|---|
| Enclosed Mall | Required when applicable | Required when applicable | Allowed/expected | Allowed, zero or more | Allowed, zero or more | Allowed/expected | Allowed when applicable | Retail category; works-at and leadership projections |
| Strip Center / Shopping Center | Required when applicable | Required when applicable | Allowed/expected | Allowed, zero or more | Allowed, zero or more | Allowed/expected | Allowed when applicable | Retail category; works-at and leadership projections |
| Street / Standalone Location | Required when applicable | Required when applicable | Allowed/expected | Allowed, zero or more | Allowed, zero or more | Allowed/expected | Allowed when applicable | Retail category; works-at and leadership projections |
| Corporate Office | Optional | Not Applicable by default | Not applicable unless explicitly approved | Not applicable by default | Not applicable by default | Not applicable | Not applicable | Corporate category; assignment is works-at/support, not retail leadership |
| Warehouse / Distribution Center | Optional | Not Applicable by default | Not applicable unless explicitly approved | Not applicable by default | Not applicable by default | Not applicable | Not applicable | Distribution Center category; no forced retail hierarchy |
| Other Company Location | Optional | Not Applicable by default | Not applicable unless explicitly approved | Not applicable by default | Not applicable by default | Not applicable | Not applicable | Category selected explicitly; no inferred retail requirements |

`Unknown` is permitted only during the compatibility period and must be visible in reconciliation. `Not Applicable` is a deliberate value for non-retail records; blank must not mean both unknown and not applicable. Retail records may be saved as incomplete only under an explicitly authorized draft/reconciliation state, with a visible follow-up item.

Assignment eligibility is controlled by `Person.assignmentTypes` and active status. Job title remains descriptive and searchable, not a validation authority. A person may hold multiple assignment types when the business explicitly permits it, but duplicate assignment of the same person to incompatible slots must warn or fail according to a documented policy. The first implementation should fail on a person occupying mutually exclusive primary roles at the same location unless an approved exception is recorded.

## 4. Authority, validation, authorization, and audit

### Write-time validation

The server is the authoritative validation boundary. A location assignment write must atomically validate:

- referenced Person IDs exist, are unique, and are not deleted;
- each person is Active, or the write explicitly records an approved inactive/legacy exception;
- assignment type is included in the person's controlled `assignmentTypes`;
- location type permits the assignment;
- region/district references exist and are applicable;
- no duplicate person ID occurs within an assignment array;
- no incompatible duplicate assignment exists at the location;
- person/location scope and actor role permit the change;
- expected versions or update timestamps still match for all affected records.

Person edits that affect assignment eligibility, status, or identity must validate all referenced locations in the same transaction. A failed multi-record validation must leave all records unchanged.

### Authorization boundary

Application role and access scope determine who may edit relationships. Organizational job title, assignment type, and Person category do not grant application permissions. The authorization contract should distinguish directory viewer, editor, data steward, store/field leadership, and system administrator actions without redesigning the wider RBAC model in this dispatch.

Assignment edits require location scope authorization. Cross-district or cross-region changes require the appropriate company/field leadership or data-steward scope. Every accepted or rejected relationship change records actor, affected location/person IDs, old and new assignment maps, reason, validation result, and correlation/request ID.

### Stale and invalid references

- Missing reference: reject a new write; preserve and label an existing legacy reference as orphaned until reviewed.
- Inactive or retired person: prevent new assignment; keep historical reference visible as inactive on existing records until reassigned.
- Retired location: prevent new operational assignments; retain historical relationships for audit.
- Duplicate person or location identity: fail closed and create a reconciliation issue; never choose the first document.
- Conflicting reverse link: location-side assignment wins, person projection is rebuilt or marked inconsistent.
- Copied name/phone mismatch: display the ID-resolved value in canonical reads, retain the copied field only for compatibility, and report the mismatch.
- Unknown hierarchy: preserve the existing value in a legacy field, map only unambiguous values, and require human review for ambiguous matches.

## 5. Application user to People linkage

`users.personId` is an optional stable foreign key to exactly one canonical Person. It is identity linkage only; it does not merge the user and organizational record, and it does not derive application role from job title or assignment.

At account read and write time the server must validate that the linked person exists and is unique. An active user linked to a missing, duplicated, or inactive Person receives a visible `linkage_invalid` state and retains no operational assignment authority through that link. The user may still authenticate according to account status and application role, but directory features requiring an active person relationship must be blocked or read-only according to the approved policy.

A reassignment changes `personId` through an auditable user-account operation. It does not copy the old person's name, title, region, district, or assignments onto the user. User profile pages must link to the account and Person records independently, with a clear warning when the link is unavailable or inactive.

## 6. Cross-application traceability matrix

| Flow/surface | Current behavior | Target contract | Dispatch 4 impact |
|---|---|---|---|
| Create location | Browser form accepts free-text district and writes one location | Type determines hierarchy applicability; selectors use controlled IDs; server validates assignments | Location contract and server validation |
| Import | Admin tab simulates success; migration script is one-time | Governed preview, duplicate detection, canonical IDs, confirmation, audit, rollback | Separate import dispatch after core model |
| Validate/save | Firestore transaction validates some identity/contact/custom fields | Atomic relationship and hierarchy validation with optimistic concurrency | Server validation |
| Assign | Location IDs are canonical today; copied names/phones are also stored | Location assignment map is authoritative; projections are generated | Assignment UI and transaction |
| Display | Some views use copied values; export resolves IDs | All canonical displays resolve IDs; legacy values visibly marked | Read mappers and UI |
| Search/filter | District and free-text fields only | Region, district, title, department, assignment type, and relationship labels | Search/index contract |
| Edit | Person edit cascades some copies in browser | Server transaction updates person and affected projections or invalidates cache | Atomic write path |
| CSV export | Scope-aware active store export; no region/regional manager columns | Versioned export includes hierarchy IDs/names and assignment columns, with orphan report | Export versioning |
| CSV import | Not production-ready | Same validation as manual edits; dry-run then confirmation | Separate approval gate |
| Printable/PDF | Browser print grouped by district | Group by region/district where applicable; non-retail section; ID-resolved values | Print contract, PDF decision separately |
| Directory API | Authenticated read-only location API with public-safe mapping | Versioned relationship/hierarchy DTO; explicit omission/privacy rules; fail closed on conflict | API contract and tests |
| User profile | Optional personId and local missing-link warning | Server-validated stable link with missing/inactive/duplicate states | Auth/account linkage |
| Audit/rollback | Server audit exists; browser rollback path is not an atomic server revert | Relationship changes are atomic, correlated, and reversible through an authorized server operation | Audit/recovery |

Traceability sequence for all affected records is therefore: create/import -> server validation -> atomic save -> location-owned assignment -> ID-resolved display -> indexed/searchable projection -> optimistic-concurrency edit -> versioned export/API/print.

## 7. CSV status and future import contract

The one-time migration script is a controlled migration tool and must remain distinct from the admin Import & Sync surface. The current admin surface is not production-ready: it has no file handling, schema validation, preview, duplicate detection, confirmation, governed writes, or bulk audit evidence.

A future import must:

1. Parse a versioned schema and require stable Location IDs/Person IDs when present.
2. Match legacy store numbers, emails, and normalized names only as candidate matches, never as silent identity replacement.
3. Produce a read-only preview with created, changed, unchanged, orphaned, duplicate, ambiguous, and rejected rows.
4. Separate safe automatic matches from human-review rows.
5. Validate hierarchy applicability, assignment eligibility, authorization scope, privacy, and concurrency using the same server service as manual edits.
6. Require explicit confirmation, an immutable import batch ID, and a complete audit record.
7. Apply atomically per approved batch or clearly bounded transaction groups, with no partial success hidden from the operator.
8. Support pre-import backup, verification, stop conditions, rollback, and a post-import reconciliation report.
9. Never delete, merge, reclassify, or rewrite legacy records merely because a CSV omits a value.

## 8. UX contract before implementation

The UI must label relationships as `Works at`, `Manages`, `Supports`, and `Oversees`. Location and Person selectors must use existing records, show status and relevant hierarchy, support keyboard navigation, and never depend on free-text title matching for eligibility. Each detail and edit surface needs a visible return path and clickable links between related Location, Person, and user profiles.

Unassigned, unavailable, inactive, retired, legacy, and conflicting relationships must have distinct labels and explanatory plain-language validation. Duplicate and incompatible assignment choices should be prevented where deterministic and warned with confirmation where an approved exception is possible.

Search results must update from canonical IDs and reflect changed names, assignments, regions, districts, departments, and job titles. Every affected surface needs loading, empty, error, success, and incomplete-data states. Forms require accessible labels, visible focus, logical tab order, keyboard-operable selectors, mobile-safe controls, and no information conveyed by color alone. Phone and email remain tap targets on mobile. Existing navigation, themes, privacy controls, and routine store lookup must remain intact.

Non-retail forms must not display retail-only required fields. Retail forms must make missing hierarchy explicit and distinguish `Not Applicable` from `Unknown`. Bulk changes must use Select -> Preview -> Confirm -> Apply -> Audit.

## 9. Read-only reconciliation and rollout protection

Before any schema migration or writer cutover, generate a read-only report containing:

- duplicate/missing Location IDs and store numbers;
- duplicate/missing Person IDs and normalized identity candidates;
- orphaned location-to-person IDs;
- stale copied names, phones, and districts compared with ID-resolved values;
- mismatched Person assigned-location arrays;
- duplicate or incompatible assignment slots;
- unknown, ambiguous, and non-retail district values;
- invalid user-to-person links;
- records that would change under controlled region/district normalization.

Each finding is classified as safe automatic match, safe projection repair, or human review. The report itself must not write data. Automatic repair is not permitted until the data owner approves the matching rules and backup.

The rollout sequence must preserve current documents and stable IDs, add new fields alongside legacy fields, dual-read with a deterministic precedence rule, and keep legacy projections available until all consumers have moved. Stop conditions include unexpected duplicate counts, unexplained record-count changes, failed audit writes, authorization failures, or any conflict between old and new identity maps. Rollback restores the prior writer path and projections from the verified backup; it does not delete newly discovered records.

## 10. Atomicity, concurrency, recovery, and rollback

Assignment changes involving one location and one or more people must use one server transaction or a durable relationship command with idempotency key. The transaction checks versions for every affected record, writes the canonical location assignment, updates or invalidates projections, and writes one correlated audit event. A stale version returns a conflict requiring reload; it must not last-write-wins silently.

Bulk operations use a batch ID, bounded transaction groups, a manifest of intended records, and explicit completion status. A failed group is visible and retryable. Recovery requires the batch manifest, before/after snapshots, audit IDs, and operator confirmation. Rollback is a server-authorized inverse operation with its own audit record and concurrency checks, not a browser-only state reversal.

## 11. Phased implementation and stop points

### Phase A: Contract and inventory

Approve controlled Region/District entities, assignment types, Person categories, non-retail applicability, user-link behavior, privacy fields, and export/API versioning. Produce the read-only reconciliation report. **Stop:** business/data-owner approval of identity and hierarchy decisions.

### Phase B: Additive model and server validation

Add optional canonical fields and versioned validators without changing existing records. Implement relationship validation, user-link validation, audit correlation, optimistic concurrency, and fail-closed conflict responses. Add unit and integration tests. **Stop:** validation passes against fixtures covering all location types and legacy conflicts.

### Phase C: Read compatibility and projections

Make API, export, print, search, and profile views resolve canonical IDs and explicitly label legacy/incomplete data. Keep old fields for compatibility. **Stop:** consumer contract review and comparison exports/search snapshots.

### Phase D: Manual assignment UX

Add controlled selectors, eligibility filtering, relationship labels, hierarchy filters, navigation links, responsive/accessibility states, and atomic save/error handling. **Stop:** user acceptance across retail, corporate, field leadership, and distribution scenarios.

### Phase E: Governed CSV import

Implement a separate preview/confirm/audit workflow using the same validators and identity rules. Start with dry-run and no-write reconciliation. **Stop:** import owner approval, backup/restore drill, and rollback test.

### Phase F: Approved reconciliation and writer cutover

Only after all stops: apply explicitly approved additive migration/projection repair, verify counts and audit history, then switch approved consumers. Retain rollback and legacy reads for the agreed compatibility period.

## 12. Test plan

Tests must cover controlled hierarchy applicability for every location type; assignment eligibility and duplicate/conflict rules; missing/inactive/retired/orphan references; atomic multi-record writes; optimistic concurrency; audit and rollback; user links; legacy copied-value precedence; region/district search and filters; Person reverse relationship labels; API DTO privacy and versioning; CSV export/import preview and duplicate handling; printable grouping; mobile/keyboard/accessibility states; and fail-closed behavior for conflicting identities.

Fixtures must include retail stores, corporate offices, warehouses, other company locations, active/inactive people, multi-location managers, legacy name-only assignments, duplicate store numbers, duplicate people, stale copied names/phones, invalid user links, and partially migrated hierarchy values. No test may require a live Firestore write for the architecture gate.

## 13. Risks, open questions, and required confirmation

Business/data-owner confirmation is required for:

- authoritative roster and source of truth for the two existing location generations;
- Region and District entity ownership, naming, lifecycle, and whether a person can span regions;
- exact eligibility and incompatibility rules for multiple assignment types;
- whether store managers and assistant managers can be assigned to non-retail locations;
- whether `works at` assignments need effective dates/history;
- public versus internal exposure of manager names, phones, IDs, region, and district;
- whether a dedicated relationship collection is needed for future history or scale;
- PDF generation requirements versus browser print;
- user behavior when `personId` is missing, inactive, duplicated, or reassigned;
- import batch atomicity and operator roles;
- retention and rollback period for legacy projections.

Primary risks are accidental selection of a conflicting Firestore record family, silent identity matching from names, stale denormalized fields, partial multi-record writes, unauthorized cross-scope assignment, and consumers depending on legacy store-number arrays. The fail-closed and additive strategy above is designed to contain those risks.

## 14. Proposed Dispatch 4

**Dispatch 4: Canonical Hierarchy and Atomic Assignment Contracts**

**Scope:** Phase A and Phase B only: approve the field-level contract, produce the read-only reconciliation/reporting tooling, add additive types and server-side relationship validation behind compatibility boundaries, validate user-to-Person links, and add audit/concurrency test fixtures. Include no production data migration, no writer cutover, no governed CSV import UI, and no broad permissions redesign.

Dispatch 4 requires business/data-owner confirmation before implementation begins, specifically for the location-generation authority, hierarchy roster, assignment eligibility, non-retail rules, user-link behavior, and public/private relationship fields. Dispatch 5 should cover read-surface compatibility and manual assignment UX; Dispatch 6 should cover governed CSV import and approved reconciliation/cutover.

**Return dispatch:** see `docs/dispatches/dispatch-03-hierarchy-and-assignment-architecture.md`.

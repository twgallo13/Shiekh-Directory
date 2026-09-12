# Dispatch 4: Canonical Hierarchy and Atomic Assignment Contracts

**Status:** Approved for Phases A–B Foundation & CSV Export Repair
**Depends on:** Dispatch 3 architecture review and decision report
**Implementation mode:** Additive contract, server validation, reconciliation tooling, and existing CSV export contract repair only; no wholesale rewrite, governed import, deployment, or data migration of existing records in this dispatch

This dispatch defines the first implementation of the canonical hierarchy and assignment model approved in Dispatch 3.
The active implementation scope is explicitly bounded to **Phases A–B** (Contract & Inventory, Additive Model & Server Validation), plus the targeted repair of the existing CSV export/read-projection regression already introduced on this branch.
Phase C is started only for that CSV/read-projection repair. The broader Phase C read-surface work, and Phases D–F (Manual Assignment UX Expansion, Governed CSV Import, Approved Cutover/Migration), are deferred to subsequent dispatches.

## Objective

Implement the smallest durable, additive contract that makes the directory authoritative for:

- Company → Region → District → Location hierarchy
- optional region/district configuration for non-retail locations
- leadership assignments for Store Manager, Assistant Store Manager, Key Holder, District Manager, and Regional Manager
- location-owned relationship authority and derived read projections
- user-to-People linkage validation
- atomic write validation, audit, and concurrency safety
- compatibility with legacy free-text district values and copied names

## Approved decisions captured from business review

The following decisions are now the implementation baseline:

1. Canonical location generation is approved.
2. Hierarchy recommendation: Company → Region → District → Location.
3. Some Store Managers / Assistant Store Managers may manage more than one location.
4. Non-retail locations do not need to be forced into retail hierarchy, but optional region/district support should remain available.
5. User-to-People linkage will use the simplest safe model: one optional `personId` per user, with clear invalid/inactive handling.
6. Public/private relationship field policy follows the recommended split below.

The authoritative Region/District roster is **not yet available in this repository**. Synthetic Region/District IDs used in tests are fixtures only and must not become production reference data. Until an approved roster is supplied, new canonical `regionId`/`districtId` assignments are blocked while unrelated edits and legacy free-text district values remain usable.

## Scope

### In scope

- Additive data contract for hierarchy and assignment fields
- read-only reconciliation tooling for legacy and conflicting records
- server-side validation for location and person relationships
- user-to-People link validation and inactive/missing behavior
- audit records, version checks, and atomicity for assignment writes
- compatibility handling for legacy fields, copied values, and free-text districts
- targeted API, export, print, and UI compatibility checks
- tests covering validation, audit, search, and fallback states

### Out of scope

- broad permission redesign
- unrelated hours-template work
- phone/URL normalization beyond compatibility checks already approved
- any destructive data migration
- any Firestore rewrite of existing records without a separate approved migration dispatch
- full CSV import redesign beyond validation parity and dry-run checks

## Required implementation model

### 1. Canonical ownership

Assignment authority is location-owned for this implementation.

- The location record owns the current leadership slots.
- `Person` fields such as `assignedLocations` and `locationsOverseen` remain derived projections, not separate write authorities.
- All writes use stable IDs.
- Names, phones, districts, and reverse relationships are resolved from canonical IDs and are not treated as independent truth sources.

### 2. Hierarchy model

The canonical hierarchy is:

`Company -> Region -> District -> Location`

Implementation rules:

- Region and District are controlled values, not free-text-only values, but the production roster is a required external dependency before new canonical hierarchy assignments can be saved.
- Legacy free-text district values remain readable for compatibility but are not treated as authoritative for new writes.
- Non-retail locations may omit Region and District without being forced into a retail hierarchy.
- Non-retail locations may use `Applicable` only when explicit valid controlled hierarchy references are supplied; otherwise they default to `Not Applicable`.
- “Unknown” is allowed only as a temporary compatibility state; “Not Applicable” is the preferred state for non-retail locations.
- There is no silent reclassification of legacy non-retail records into retail hierarchy.

### 3. Role and eligibility model

Keep the following distinct:

- job title
- department
- operational assignment type
- application authorization

Operational assignment eligibility is determined by controlled assignment rules, not free-text titles.

Accepted roles:

- Store Manager
- Assistant Store Manager
- Key Holder
- District Manager
- Regional Manager

Rules:

- a person may be assigned to multiple stores when the role permits it
- duplicate assignment conflicts are rejected or require explicit human review
- assignment eligibility is validated against the Person record and the location type
- a location type may restrict which roles are allowed

### 4. User-to-People linkage

Use the simplest safe pattern:

- each user has an optional `personId`
- `personId` is a stable reference to one canonical Person
- user permissions remain independent of job title or assignment type
- missing, inactive, duplicate, or reassigned `personId` values are treated as invalid linkage states
- linked Person records are validated at read and write time where required

### 5. Public/private relationship policy

Recommended field policy:

- Authoritative:
  - relationship IDs
  - assignment records
  - region/district IDs
  - user-to-person link
  - canonical location/person identity references
- Derived:
  - copied manager names
  - copied phone numbers
  - district display strings
  - reverse lookup arrays
  - assigned-location projections
- Public:
  - visible person identity
  - visible assignment labels
  - approved department/job title fields
  - public-facing region or district display values when they are approved for display
- Private/internal:
  - legacy compatibility values
  - inactive or invalid linkage state
  - reconciliation and duplicate flags
  - internal audit metadata

Rule: derived values are compatibility display values, not the primary write authority.

## Implementation plan

### Phase A: contract and inventory

Goal: define the additive contract and generate the read-only reconciliation picture.

Tasks:

- confirm stable field additions for hierarchy and assignments
- define region and district registry shape
- define assignment-array and reverse projection contract
- create read-only reconciliation report for:
  - duplicate or orphaned IDs
  - stale copied names and phone values
  - missing or inactive linked people
  - unknown, ambiguous, or legacy district values
  - conflicting assignment links
  - user/person link anomalies
- identify safe matches vs human-review records

Stop gate:

- approved data contract
- approved reconciliation report findings reviewed by data owner
- no data mutation yet

### Phase B: additive model and server validation

Goal: add canonical fields and validation without rewriting existing records.

Tasks:

- add optional canonical relationship fields alongside existing legacy fields
- validate location assignment writes server-side
- validate person link existence and uniqueness
- validate assignment type eligibility against person and location type
- validate region/district applicability by location type
- reject duplicates and conflicting relationship assignments
- record audit metadata for every accepted or rejected write

Stop gate:

- validation tests pass for all supported hierarchy combinations
- legacy and non-retail cases are handled without forced retail classification
- user/person invalid states are fail-closed and auditable

### Phase C: compatibility and read projection layer

Current status: **partially started**. CSV export/read-projection fallback behavior is repaired here because the regression already existed in this branch. Broader search, print/PDF, public API DTO, and UI compatibility work remains deferred.

Goal: keep existing consumers working while switching reads to canonical values.

Tasks:

- update search, export, print, and API responses to prefer canonical IDs
- keep legacy fields readable for compatibility
- attach warnings when records are legacy, incomplete, or invalid
- define precedence rules for canonical vs copied values
- ensure region, district, and leadership queries respect the chosen hierarchy rules

Stop gate:

- read outputs remain backward compatible
- legacy values are clearly labeled
- consumers do not silently receive conflicting information

### Phase D: UI and assignment workflow

Current status: **substantially implemented through Dispatches 5–7**. Dispatch 5 added canonical read surfaces and controlled interim retail-leadership selectors; Dispatch 6 added the Region/District registry and Regional Manager coverage; Dispatch 7 added Person-owned Works at/Supports editing and bidirectional profile views. Product-owner manual acceptance remains a stop gate, and stricter assignment eligibility/cardinality policy remains deferred.

Goal: make assignments usable without ambiguous free-text behavior.

Tasks:

- add controlled selectors for Region, District, and leadership slots
- allow multi-store assignment when approved
- distinguish `Works at`, `Manages`, `Supports`, and `Oversees`
- prevent duplicate assignment conflicts
- show invalid, inactive, missing, and legacy states clearly
- make navigation between Location, Person, and user profiles explicit
- maintain mobile and accessibility requirements

Stop gate:

- no regression in standard store lookup workflow
- assignment and selector UX reviewed by product/test owners
- accessibility and keyboard behavior are acceptable

### Phase E: governed validation and dry-run import compatibility

Goal: align import and manual write paths to the same validation rules.

Tasks:

- make CSV import preview and confirmation respect canonical validation
- require duplicate detection, preview, and confirmation before write
- run import against the same server validation path as manual edits
- keep the import dry-run model until approved
- require audit metadata, rollback records, and failure reporting

Stop gate:

- import preview and validation match manual edit behavior
- rejected rows are explicitly accounted for
- no silent data swallowing or partial-writes without batch audit

### Phase F: controlled cutover

Goal: only switch after all validation gates pass.

Tasks:

- enable canonical reads where approved
- keep compatibility fields through the transition period
- verify counts, row-level diffs, and audit compatibility
- retain rollback path and backup for the agreed compatibility window

Stop gate:

- all validation checks pass
- rollback and recovery path tested
- data-owner signoff for cutover

## Required validations and test plan

The following test categories are required before cutover:

1. atomic write tests
   - location assignment updates remain atomic
   - failed writes leave all affected records unchanged
   - version conflicts are fail-closed

2. user-to-People validation
   - missing/invalid/inactive link handling
   - duplicate person link detection
   - safe fallback UX states

3. hierarchy applicability tests
   - retail locations require proper hierarchy when applicable
   - non-retail locations do not require retail district assignment
   - “Unknown” and “Not Applicable” are distinguishable

4. search/filter tests
   - region and district filtering works with canonical IDs
   - duplicate or stale display values do not leak into search results

5. export/print/API tests
   - canonical values are returned consistently
   - legacy values remain labeled and non-authoritative
   - export and API output stays backward compatible where required

6. audit and rollback tests
   - each assignment change has an event trace
   - inverse/rollback operations are reversible and auditable
   - failed batch operations do not hide partial results

7. legacy data tests
   - unmatched free-text district values are handled without false rewrite
   - stale copied names and phones are identified and reported

## Safety constraints

- No destructive migration in this dispatch
- No Firestore rewrite of current records without a separate approved migration plan
- No silent replacement of legacy values with canonical ones during writes
- No blanket conversion of free-text hierarchy values into new canonical IDs without a reviewable reconciliation step
- No permission redesign in this dispatch
- Preserve unrelated working-tree changes

## Completion criteria for this dispatch

This dispatch is complete when:

- the additive canonical contract is implemented and validated
- hierarchy and assignment validation are server-authorized and atomic
- legacy compatibility rules are in place
- read surfaces remain stable
- the data-owner and product-owner approvals are recorded
- any cutover has an explicit rollback path and audit trail

## Decision record

The business-approved implementation baseline for this dispatch is:

- Company → Region → District → Location hierarchy
- region and district are controlled values, optional for non-retail locations
- multi-store assignment allowed for some manager roles
- user-to-People linkage uses the simple fail-safe model
- publishable relationships are separated from internal/derived fields
- derived values remain compatibility-only until the canonical contract is fully adopted

## Return dispatch

Return dispatch: see `docs/dispatches/dispatch-03-hierarchy-and-assignment-architecture.md`

This dispatch is designed to be the first implementation step after the architecture decision is approved, with the implementation bounded so that the data contract is correct before any migration or mass rewrite occurs.

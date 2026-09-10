# Dispatch 3: Hierarchy and Assignment Architecture

**Status:** Ready for review
**Depends on:** Dispatch 1 (server-owned CSV export) and Dispatch 2 (phone/URL normalization), both deployed
**Implementation mode:** Architecture and contract decision only; no production schema migration, Firestore rewrite, commit, push, or deploy in this dispatch
**Return dispatch required:** Yes — reference `docs/dispatches/dispatch-03-hierarchy-and-assignment-architecture.md`

This dispatch addresses the remaining architecture questions around retail hierarchy, people-to-location assignments, manager relationships, and non-retail locations. It is intentionally separate from phone/URL normalization and hours-template work.

## Objective

Define the smallest durable data model and migration-safe implementation plan that makes the directory authoritative for:

- Company → Region → District → Location hierarchy
- Retail and non-retail location classification
- Store Manager, Assistant Store Manager, Key Holder, District Manager, and Regional Manager relationships
- Canonical person records and location assignments
- Search, filtering, export, and API behavior for those relationships
- Authorization and audit implications of assignment changes

Do not implement the design until the decision report is complete and reviewed.

## Confirmed Product Requirements

From `docs/product-blueprint.md`:

- Retail hierarchy is **Company → Region → District → Location**.
- Retail stores should have Region and District when those structures apply.
- Corporate offices, warehouses/distribution centers, and other non-retail company locations must not be forced into a retail District; Region and District may be optional or Not Applicable.
- Each retail store may identify a Store Manager, Assistant Store Manager(s), Key Holder/additional leadership, District Manager, and Regional Manager when applicable.
- A manager may oversee multiple locations.
- Leadership assignments must be relationships between people and locations rather than duplicate employee records.
- People records need job title, department, assigned location, locations overseen, Region/District when applicable, and optional reporting relationship.
- Stable internal Location IDs and Person IDs must remain the system references when names, phones, or assignments change.

## Verified Current Model To Recheck

Before making recommendations, verify the current revision and report any differences:

- `LocationRecord` has free-text `district` and optional manager IDs plus copied manager names.
- `LocationRecord` has Store Manager, Assistant Store Manager, and Key Holder IDs, but no Regional Manager relationship.
- `Person` has free-text `role`, `jobTitle`, `department`, `assignedLocations`, and `district`, but no explicit region or reporting relationship.
- The browser context performs relationship update cascades and maintains derived names/phones.
- Forms use role/job-title matching and free-text district behavior in places.
- Server writes are authoritative and audited through `server/firestoreDirectory.ts`.
- Public APIs and exports may expose copied names and assignment-derived fields.

If any item has changed, treat the current implementation as authoritative and document the difference.

## Required Analysis

1. **Canonical ownership**
   - Decide whether assignments are canonical on locations, people, or a separately validated relationship representation.
   - Preserve stable IDs and avoid duplicate employee records.
   - Define how reverse lookups such as “locations overseen” are computed or stored.

2. **Hierarchy model**
   - Decide whether Region and District should be controlled values, entities with IDs, or a transitional hybrid.
   - Define applicability rules by `LocationType`.
   - Define behavior for unknown, unassigned, retired, and Not Applicable values.
   - Prevent a non-retail location from being forced into a retail district.

3. **Role versus job title versus permissions**
   - Keep organizational job title, operational assignment type, and application authorization distinct.
   - Define how the UI identifies eligible people for each assignment without relying on ambiguous free-text role matching.
   - Do not redesign application permissions in this dispatch; identify only the contract needed by assignment validation.

4. **Consistency and repair**
   - Identify all duplicated or derived fields such as manager names, manager phones, assigned location arrays, and district names.
   - Define write-time validation and repair behavior for stale IDs, missing people, inactive people, duplicate assignments, and conflicting reverse links.
   - Preserve legacy records during transition; do not silently rewrite existing Firestore data.

5. **Read paths**
   - Trace DirectoryContext, location/person forms, universal search, public Directory API, CSV export, and audit history.
   - Define which fields are authoritative, derived, public, internal, or omitted.
   - Confirm downstream consumers will not break when relationship data becomes more canonical.

6. **Migration and rollout plan**
   - Propose an additive, reversible sequence for future implementation.
   - Include compatibility handling for existing free-text district values and copied names.
   - Separate model changes, server validation, UI changes, data quality review, and any eventual migration.
   - No migration or Firestore write is allowed during this architecture dispatch.

## Required Deliverable

Return a decision report containing:

1. Confirmed current behavior versus blueprint intent
2. Recommended canonical model with field-level examples
3. Explicit decisions for Region, District, assignment ownership, reverse lookups, and non-retail applicability
4. Validation and authorization boundaries
5. Compatibility strategy for existing records
6. A phased implementation sequence with clear stop points
7. Test plan covering API, writes, UI selection, search, exports, audit, and legacy data
8. Risks, open questions, and decisions that require user/business confirmation
9. A proposed name and scope for Dispatch 4 implementation

## Safety Constraints

- Do not modify Firestore data.
- Do not run migration scripts.
- Do not change production code in this dispatch.
- Do not commit, push, or deploy.
- Preserve unrelated working-tree changes.
- Keep phone/URL normalization, hours templates, and broad permission redesign out of scope.

## Completion Report

When finished, reply with the decision report and include:

- `Return dispatch: see docs/dispatches/dispatch-03-hierarchy-and-assignment-architecture.md`
- Confirmation that no production data or code was changed.
- The exact proposed Dispatch 4 scope and whether business confirmation is required before implementation.

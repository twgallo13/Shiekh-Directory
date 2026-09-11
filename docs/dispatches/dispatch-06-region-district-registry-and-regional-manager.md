# Dispatch 6: Region/District Registry and Regional Manager Coverage

**Status:** Bounded implementation complete; review pending
**Depends on:** Dispatch 4 foundation (`main` through `791ac34`) and Dispatch 5 read-surface work (merged as `72ddce5`)
**Implementation mode:** Additive, user-managed hierarchy registry and retail leadership UX; no inferred data population

## Approved decisions

- The Directory itself is the authoritative management surface for Region and District records.
- The registry begins empty. The product/data owner enters the real organizational structure; this dispatch does not invent or map roster values.
- A District belongs to exactly one Region.
- Registry records use stable administrator-entered IDs.
- Referenced registry entries are retired, not deleted.
- Any active Person may be selected for Regional Manager, as already approved for interim retail leadership slots. Application permissions remain separate.

## Completed

1. Added persisted `regions` and `districts` collections to the authenticated directory seed, transaction commit contract, and client commit contract.
2. Added administrator-only Region & District management panel under Admin → Data & Store Fleet. It creates stable-ID records, requires a Region for every District, and offers retirement rather than deletion.
3. Server transactions load the saved registry and validate Location `regionId`/`districtId` against it. District-to-Region parent relationships and retired entries are rejected for changed/new assignments. Retiring an entry referenced by a Location is rejected.
4. Added controlled Location Region/District selectors. District choices are filtered to the selected active Region. Existing legacy display values remain readable; no legacy values were inferred or bulk-converted.
5. Added Regional Manager selector, canonical active-Person display, and Person-profile location links. The selector uses the approved interim any-active-Person rule and preserves unavailable current canonical assignments for review without offering them as new choices.
6. Added focused Firestore transaction coverage for saved registry creation, valid assignment, missing District rejection, and referenced District retirement rejection.

## Deferred

- Corporate/DC `Works at` and `Supports` relationships, pending their source-of-truth decision.
- `assignmentTypes` eligibility, cardinality caps, cross-role incompatibility, and other stricter policy.
- Governed CSV import, migration, bulk cleanup, or mapping of legacy hierarchy values.
- Public Directory API leadership exposure or privacy changes.
- Deployment and merge.

## Verification

- `node --import tsx --test test/customFieldPersistence.test.ts`
- `npm run lint`
- `npm run test:api`
- `npm run build`
- `git diff --check`

Browser, visual, and functional acceptance testing remains the product/data owner's responsibility.

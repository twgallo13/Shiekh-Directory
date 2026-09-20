# Dispatch 8–11: CSV Coverage Matrix

## Reading the matrix

`Preview` means the `locations-v1` dry-run contract. `Confirm` atomically persists explicitly selected ready rows using the same column and validation contract. `Editing export` emits the canonical import schema from one authoritative snapshot. `Presentation export` means **Export All Stores**, whose supported attributes can now be mapped while derived relationship names remain informational. Preview, guidance, report downloads, correction downloads, and editing-export routes remain read-only.

## Dispatch 9 confirmation coverage

| Data group | Confirm | Boundary |
|---|---|---|
| Supported Location identity, profile, lifecycle, hierarchy, and Location-owned leadership columns listed below | Yes | Selected ready rows only; additions are create-only and updates require reviewed versions |
| Unchanged Location rows | Verified, not written | Signed target identity and expected version must still match at confirmation |
| Blank supported cells | Preserve only | Existing Dispatch 8 behavior; no explicit clearing syntax |
| Person `Works at` / `Supports` | Dependency check only | Person-owned fields are never written by this import |
| Regions, Districts, and People | Reference check only | Existing active canonical records are required; names never create or select records |
| Unsupported Location fields and every non-Location group below | No | Preserved on updates where already present; no new CSV columns |
| Export All Stores | Supported attributes only | District and leadership names/phone are explicitly ignored; canonical IDs are required for relationship changes |

## Dispatch 10 editing export coverage

| Data group | Editing export | Boundary |
|---|---|---|
| Supported Location identity, profile, lifecycle, hierarchy, and Location-owned leadership columns listed below | Yes | Exact `locations-v1` headers and mappings; canonical IDs and assignment order preserved |
| Active, Draft, and Retired Locations of every type | Yes | One authoritative snapshot; deterministic numbered parts with complete counts |
| Phone extension | Yes | Combined in `Phone` using the accepted `ext. <digits>` syntax |
| Unsupported populated Location fields | Diagnostic only | Named by Location ID and field; omitted from CSV but preserved by supported updates; not a backup |
| Invalid legacy values, missing/inactive references, normalization changes, ambiguous identities | Diagnostic only | Existing preview logic evaluates exported rows; no silent cleanup or inferred replacement |
| Person `Works at` / `Supports` | No | Person-owned relationships remain outside `locations-v1` |
| Regions, Districts, and People records | No | Existing canonical IDs are references only; registries and People are not exported |
| Version protection | Preview onward only | Export snapshot is informational; later preview compares with current state, then Dispatch 9 protects confirmation |

Parts respect the existing 100-row and 2,000,000-byte limits. Each part is independently previewed/imported, and at most 40 selected changed rows may be confirmed atomically. A file with more ready rows remains previewable but is never silently split. A record too large for one part fails explicitly with its Location ID and largest fields. Blank cells and omitted columns preserve values; omitted rows do not delete records.

Confirmation binds the actor, schema, exact CSV digest, reviewed mappings, import mode, selected row numbers, target identities, expected versions, normalized changed records, and unchanged-row assertions in a 10-minute signed manifest. Full-file identity conflicts are evaluated before selection. The server revalidates the selected batch and dependencies in one transaction and writes changed Locations, correlated before/after audits, and one idempotent receipt together. Limits are 100 total rows, 40 selected changed rows, a 1,000,000-byte signed token, and an 8,000,000-byte estimated atomic payload including audit and receipt data.

## Dispatch 11 flexible import coverage

| Capability | Coverage | Boundary |
|---|---|---|
| Partial columns | Yes | Identity plus changed fields; omitted and blank values preserve existing data; no clearing syntax |
| Schema version | Yes | Missing/blank means current `locations-v1`; supplied unsupported values are blocked |
| Header aliases and ignore | Yes | Shared schema suggestions ignore case/outer whitespace; duplicate targets blocked; unsupported/informational columns require reviewed Ignore |
| Import mode | Yes | Add and update, or Update existing only; editing-export filenames default to update-only |
| Selected rows | Yes | Ready New/Updated rows only; complete-file identity conflicts remain blocking; one atomic selected transaction |
| Recoverable row shape | Yes | Wrong cell counts are blocked per row with original values/position retained; available identity still participates in file-wide conflicts; unreliable quoting rejects the file |
| Actionable downloads | Yes | Receipt-proven saved, pending, not saved, outcome unknown, unchanged, blocked, and not selected; correction CSV follows definitive outcome without duplicating unknown writes |
| Spreadsheet encoding | Yes | `SpreadsheetEncoding=shiekh-safe-v1` explicitly enables one-layer reversible decoding; ordinary CSV preserves literal apostrophes |
| Explicit clearing | No | Remains unsupported; blank preserves |

Recommended future bulk exchange uses separate linked Location and People CSV contracts. Canonical IDs join those contracts. Leadership is organizational data owned by Locations; application role/access scope is authorization data owned by user accounts. The application models `Works at`, `Supports`, Store Manager, Assistant Manager, Key Holder, District Manager, and Regional Manager. It does not model a general employee supervisor/reporting tree.

## Location identity, profile, and lifecycle

Source of truth: `locations` documents. Manual path is Location create/edit unless stated otherwise.

| Attribute | Preview | Export | Current management/class | Future representation, dependency, and acceptance test |
|---|---|---|---|---|
| `id` | `LocationId`; match/add candidate | Canonical `LocationId` | Stable identity; generated on UI create, no ordinary ID editor | Required immutable Location key; reject duplicate/conflicting IDs and prove round trip |
| `version` | Returned as `currentVersion`, not importable | No | Server-managed optimistic concurrency | Exclude from ordinary payload; confirmation manifest records expected version and rejects stale save |
| `storeNumber` | `StoreNumber`; writable, digits-only matching | Exact `StoreNumber` text | Location editor | Required text; leading zeros preserved; nonnumeric legacy values diagnosed |
| `name` | `StoreName`; writable | `StoreName` | Location editor | Required text; round-trip exact value |
| `type` | `Type`; writable/validated | `Type` | Location editor | Controlled enum; test every type and hierarchy rule |
| `mallOrCenterName` | Unsupported | No | Location editor | Optional Location column; test retail/non-retail display |
| `address` | `Address`; writable | `Address` | Location editor | Required text; test commas/newlines and round trip |
| `city` | `City`; writable | `City` | Location editor | Required text; round trip |
| `state` | `State`; writable/validated | `State` | Location editor | Controlled postal code list; reject unsupported values |
| `zipCode` | `ZipCode`; writable/validated | `ZipCode` | Location editor | Text-preserving postal format; test leading zeros |
| `phone` | `Phone`; writable/normalized | `Phone` | Location editor | E.164-compatible input; preview/save normalization parity |
| `phoneExtension` | Derived from `Phone` input | Combined accepted `Phone` syntax | Location editor through phone input | Round-trip numeric extension with `ext. <digits>` |
| `phonePrivacy` | Unsupported | No | Read badge; no Location edit control verified | Explicit privacy enum outside public export; test audience-based omission |
| `timeZone` | `TimeZone`; writable/validated | `TimeZone` | Location editor | Controlled IANA zone; invalid legacy values diagnosed |
| `operationalStatus` | `OperationalStatus`; writable/validated | `OperationalStatus` | Location editor/request flow | Controlled enum; round trip |
| `recordStatus` | `RecordStatus`; writable/validated | `RecordStatus` for active export rows | Location editor | Lifecycle enum; confirmation rechecks incoming relationships |
| `activeNotice.shortDescription` | Unsupported | No | Location editor/request flow | Structured notice contract; text/date validation |
| `activeNotice.effectiveDate` | Unsupported | No | Location editor/request flow | ISO date in notice contract |
| `activeNotice.expectedResolutionDate` | Unsupported | No | Location editor | Optional ISO date; ordering test |
| `activeNotice.displayUntilDate` | Unsupported | No | No manual control verified | Decide retention and display semantics before bulk support |
| `lastVerifiedAt` | Unsupported | No | Displayed; no direct editor verified | Server-managed verification event, not ordinary CSV |
| `lastVerifiedBy` | Unsupported | No | No direct editor verified | Server-managed actor reference, not ordinary CSV |
| `createdAt` | Unsupported | No | Server/seed managed | Server-managed and immutable |
| `updatedAt` | Unsupported | No | Server-managed on versioned writes | Server-managed and excluded |
| `qrCodeUrl` | Unsupported | No | No manual path verified | Derived/generated asset, not ordinary CSV |
| `slug` | Unsupported | No | No manual path verified | Define server uniqueness/derivation first |
| `googleReviewUrl` | `GoogleReviewUrl`; writable/normalized | `GoogleReviewUrl` | Location editor | Canonical HTTPS URL; normalization/credential rejection tests |
| `storePageUrl` | `StorePageUrl`; writable/normalized | `StorePageUrl` | Location editor | Canonical HTTPS URL; normalization/credential rejection tests |

## Hierarchy and organizational relationships

Region/District source of truth: `regions` and `districts`. Leadership source of truth: canonical Person IDs on `locations`. Workplace/support source of truth: IDs on `people`.

| Attribute | Preview | Export | Current management/class | Future representation, dependency, and acceptance test |
|---|---|---|---|---|
| `hierarchyApplicability` | `HierarchyApplicability`; writable | `HierarchyApplicability` | Location editor | Controlled enum linked to Location type; test all type combinations |
| `regionId` | `RegionId`; writable/reference validated | Canonical `RegionId` | Location editor; Hierarchy Registry admin | Canonical immutable Region ID only; exact string preserved |
| Resolved Region name | `RegionName`; informational, never writable | Canonical `RegionName` | Resolved from Region registry | Rename appears without Location rewrite; blank when unresolved |
| `districtId` | `DistrictId`; writable/parent validated | Canonical `DistrictId` | Location editor; Hierarchy Registry admin | Canonical immutable District ID only; preserve leading zeros such as `01` |
| Resolved District name | `DistrictName`; informational, never writable | Canonical `DistrictName` | Resolved from District registry | Rename appears without Location rewrite; blank when unresolved |
| `district` | Unsupported legacy projection | `District` display | Legacy/read projection; no authoritative editor | Derived/labeled compatibility field, never import identity |
| `storeManagerId` | `StoreManagerId`; writable/active Person validated | Canonical `StoreManagerId` | Location editor; organizational leadership | Canonical Person ID; missing/inactive diagnostics |
| `storeManagerName` | Unsupported derived/legacy copy | Resolved `StoreManager` | Derived compatibility | Exclude from import; regenerate and test stale copy ignored |
| `storeManagerPhone` | Unsupported derived/legacy copy | Resolved `StoreManagerPhone` | Derived compatibility | Exclude; resolve privacy-aware Person contact at read time |
| `storeManagerPhonePrivacy` | Unsupported derived/legacy copy | No | Copied from selected Person in editor | Exclude; source privacy from Person |
| `assistantStoreManagerIds` | `AssistantStoreManagerIds`; writable semicolon list | Ordered semicolon IDs | Location editor; organizational leadership | Canonical ID list; order preserved; duplicates/missing/inactive IDs diagnosed |
| `assistantStoreManagerNames` | Unsupported derived/legacy copy | `AssistantStoreManagers` | Derived compatibility | Exclude; regenerate from canonical IDs |
| `keyHolderIds` | `KeyHolderIds`; writable semicolon list | Ordered semicolon IDs | Location editor; organizational leadership | Canonical ID list; order preserved; duplicates/missing/inactive IDs diagnosed |
| `keyHolderNames` | Unsupported derived/legacy copy | No | Derived compatibility | Exclude; regenerate from canonical IDs |
| `districtManagerId` | `DistrictManagerId`; writable/active Person validated | Canonical `DistrictManagerId` | Location editor; organizational leadership | Canonical Person ID; lifecycle diagnostics |
| `districtManagerName` | Unsupported derived/legacy copy | `DistrictManager` | Derived compatibility | Exclude; regenerate from canonical ID |
| `regionalManagerId` | `RegionalManagerId`; writable/active Person validated | Canonical `RegionalManagerId` | Location editor; organizational leadership | Canonical Person ID; lifecycle diagnostics |
| `regionalManagerName` | Unsupported derived/legacy copy | No | Derived compatibility | Exclude; regenerate from canonical ID |
| Person `primaryLocationId` (`Works at`) | Read for retirement blocker; not writable | No | Person editor | People CSV canonical Location ID; lifecycle/concurrency tests |
| Person `supportedLocationIds` (`Supports`) | Read for retirement blocker; not writable | No | Person editor | People CSV semicolon Location IDs; duplicate/primary overlap tests |
| General supervisor/reporting chain | Not modeled | No | None | Never infer from title/leadership; approve a model first |

## Region and District registries

| Attribute | Preview | Export | Current management/class | Future representation, dependency, and acceptance test |
|---|---|---|---|---|
| Region `id` | Reference validation/download | No | Hierarchy Registry; System Administrator | Separate registry contract; immutable key and duplicate test |
| Region `version` | Snapshot only | No | Server-managed | Expected version in governed registry manifest |
| Region `name` | Reference download | No | Hierarchy Registry | Registry display value; rename without identity change |
| Region `status` | Active required for new references | No | Hierarchy Registry | Controlled lifecycle; block retirement while referenced |
| District `id` | Reference validation/download | No | Hierarchy Registry; System Administrator | Separate registry contract; immutable key |
| District `version` | Snapshot only | No | Server-managed | Expected version in governed registry manifest |
| District `name` | Reference download | No | Hierarchy Registry | Registry display value; rename test |
| District `regionId` | Parent validation/download | No | Hierarchy Registry | Canonical parent; missing/retired/mismatch tests |
| District `status` | Active required for new references | No | Hierarchy Registry | Controlled lifecycle; block retirement while referenced |

## Person attributes

Source of truth: `people`. There is no People CSV contract. Resolved leadership names/phone in a Location export do not constitute a People export.

| Attribute | Preview | Export | Current management/class | Future representation, dependency, and acceptance test |
|---|---|---|---|---|
| `id` | Reference validation/download | No | Stable identity; no ordinary ID editor | Required immutable People CSV key; duplicate/conflict tests |
| `version` | Not importable | No | Server-managed | Expected version in confirmation manifest |
| `firstName` | Unsupported | No | Person editor derives from full name | Define canonical name representation/round trip |
| `lastName` | Unsupported | No | Person editor derives from full name | Define canonical name representation/round trip |
| `fullName` | Reference display | Assigned leadership names only | Person editor | Required People field; never match identity by name |
| `name` | Unsupported legacy alias | No | Compatibility alias | Derived/compatibility only |
| `phone` | Excluded from references | May supply Store Manager phone | Person editor compatibility contact | People contract needs explicit alias/privacy policy |
| `phoneExtension` | Excluded | No | Person editor compatibility contact | Linked to contact policy |
| `email` | Excluded/private | No | Person editor compatibility contact | Protected People field and privacy tests |
| `workPhone` | Excluded | Preferred Store Manager phone source | Person editor canonical contact | People canonical contact; preserve differing aliases |
| `workPhoneExtension` | Excluded | No | Person editor canonical contact | People canonical extension |
| `workEmail` | Excluded | No | Person editor canonical contact | Protected canonical email |
| `role` | Unsupported descriptive alias | No | Person editor mirrors job title | Descriptive only; never eligibility/permission inference |
| `jobTitle` | Unsupported | No | Person editor | People descriptive field; search tests |
| `department` | Unsupported | No | Person editor | People field; controlled/text decision |
| `status` | Reference lifecycle validation/download | No | Person profile lifecycle action | Controlled lifecycle; dependency blockers |
| `activeStatus` | Reference lifecycle validation/download | No | Compatibility flag | Consolidate lifecycle precedence first |
| `assignedLocations` | Unsupported legacy/derived list | No | No authoritative editor | Derived compatibility only; never import |
| `primaryLocationId` | Retirement dependency only | No | Person editor (`Works at`) | People CSV linked Location ID |
| `supportedLocationIds` | Retirement dependency only | No | Person editor (`Supports`) | People CSV linked Location ID list |
| `district` | Unsupported legacy descriptor | No | No authoritative editor verified | Derive or retire after canonical decision |
| `phonePrivacy` | Excluded | No | Person editor | People privacy enum/protected contract |

## Hours, notices, and reusable schedules

| Attribute | Preview | Export | Current source/manual path | Future representation and acceptance boundary |
|---|---|---|---|---|
| Location `standardHours` day `open`, `close`, `isClosed` | Unsupported | No | Location hours editor | Separate normalized hours contract; all-day and closed tests |
| Location `hoursTemplateId` | Unsupported | No | Location template selector | Canonical template ID; existence/lifecycle tests |
| Location `hoursMode` | Unsupported | No | Location editor | Controlled `template`/`custom`; consistency test |
| `holidayHours[].id`, `holidayName`, `date`, `hours` | Unsupported | No | Location editor | Structured child/JSON contract; stable key/date/hour tests |
| `specialHours[].id`, `description`, `startDate`, `endDate`, `hours` | Unsupported | No | No manual path verified | Approve structured date-range contract first |
| Hours Template `id`, `name`, `description`, `schedule`, `defaultForTypes`, `isDefault` | Unsupported | No | Admin Hours Templates | Separate configuration contract; uniqueness/default tests |
| Corporate Holiday `id`, `name`, `date`, `status`, `hours`, `notes` | Unsupported | No | Admin Corporate Holidays | Separate configuration contract; date/status/hour tests |

## Custom fields

Definition source: `custom_field_definitions`; values: Location `customMetadata` keyed by definition ID.

| Attribute | Preview | Export | Current source/manual path | Future representation and acceptance boundary |
|---|---|---|---|---|
| Definition `id` | Unsupported | No | Custom Fields admin | Separate definition contract; stable/reserved key tests |
| `label` | Unsupported | No | Custom Fields admin | Definition metadata |
| `type` | Unsupported | No | Custom Fields admin | `url`, `text`, `number`, `boolean`, `select`; migration decision |
| `helpText` | Unsupported | No | Custom Fields admin | Definition metadata |
| `options` | Unsupported | No | Custom Fields admin | Select choices; dependency tests |
| `order` | Unsupported | No | Custom Fields admin | Integer display order |
| `apiVisible` | Unsupported | No | Custom Fields admin | API exposure policy, not ordinary import |
| `retired` | Unsupported | No | Custom Fields admin | Preserve existing retired values |
| Location `customMetadata.<id>` | Unsupported | No | Generated Location editor controls | Dynamic columns or linked values CSV; schema snapshot and typed validation |

## Accounts and application permissions

Source: `users` plus Firebase identity. These are authorization records, not organizational leadership or job-title data, and stay outside directory CSV.

| Attribute | Preview | Export | Current source/manual path | Future representation and acceptance boundary |
|---|---|---|---|---|
| `id`, `version` | Intentionally excluded | No | User Management/server | Governed identity workflow and concurrency only |
| `name`, `email` | Excluded/private | No | User Management/Firebase | Access administration; verified unique identity |
| `role` | Excluded | No | User Management | Application permission; never infer from Person fields |
| `accessScope`, `storeNumber` | Excluded | No | User Management | Authorization scope; never an organizational relationship |
| `personId` | Excluded | No | Optional User-to-Person link | Stable link validation; never permission inference |
| `status` | Excluded | No | User Management | Access lifecycle (`Active`, `Suspended`, `Revoked`) |
| `identityLinked`, `firebaseIdentityProvisioned` | Excluded | No | Derived/provisioning flow | Server/Firebase state, not importable |
| `invitationStatus`, `invitedAt`, `invitationDelivery`, `invitationDeliveryStatus` | Excluded | No | Invitation flow | Operational delivery state, not importable |
| `lastLogin` | Excluded | No | Authentication-derived | Operational/audit signal, not importable |

## Requests, audit, communications, and configuration

| Attribute group | Preview | Export | Current source/manual path | Future representation and acceptance boundary |
|---|---|---|---|---|
| Update Request identity, target, requester, status, snapshots, reason, review fields | Excluded | No | `requests`; Requests workflow | Keep outside directory import; preserve workflow/audit chain |
| Audit Log identity, actor, action, entity, details, before/after state | Excluded | No | `audit_logs`; server-generated/Audit view | Immutable export only; never ordinary import |
| SMTP host, port, user, from/reply-to/steward addresses, diagnostic recipients | Excluded/private | No | Firestore mail settings/Secure Mail admin | Protected configuration backup, not directory CSV |
| SMTP password/secret binding | Excluded/secret | No | Secret Manager/deployment configuration | Never CSV; secret rotation only |
| Email Template `id`, `name`, `subject`, `bodyHtml`, `triggerEvent`, `variables`, `updatedAt` | Excluded | No | `email_templates`; communications admin | Separate escaped/versioned configuration package |
| Notification Rule `id`, `eventName`, `recipientRole`, `enabled`, `deliveryChannel` | Excluded | No | `notification_rules`; communications admin | Separate configuration contract/channel validation |
| Outbox Log `id`, timestamp, recipient, subject, status, template/error fields | Excluded/private | No | `outbox_logs`; server-generated/Admin view | Operational log export only; never import |
| SOP Runbook `id`, title, category, lastUpdated, author, content | Excluded | No | `sop_runbooks`; SOP admin | Separate document workflow with versioning |
| API credentials, tokens, HMAC secrets | Excluded/secret | No | Environment/secret-backed API administration | Never CSV; issuance/rotation only |
| Runtime project/database/service identity/deployment settings | Excluded | No | Environment and Cloud Run | Infrastructure configuration, never directory CSV |
| Seed/default application configuration | Excluded | No | Code/initial data | Versioned code/config migration only |

## Approved next linked contracts

1. Add a separate People import/export using the Dispatch 11 reviewed mapping, selected confirmation, result, and correction workflow.
2. Keep other registry/configuration contracts separate unless an approved backup/restore and authorization model exists.

Dispatch 12 supersedes the earlier District Code proposal: values such as `01` are immutable District IDs, and no separate `districtCode` field is introduced.

Acceptance requires import-compatible round-trip exports, stable IDs, schema/version manifests, duplicate/dependency diagnostics, privacy filtering, optimistic concurrency, authorization revalidation, audit evidence, bounded atomic writes, backup/recovery, and reconciliation. Until then, Export All Stores and Reference IDs remain guidance/read products, not backups or re-import sources.

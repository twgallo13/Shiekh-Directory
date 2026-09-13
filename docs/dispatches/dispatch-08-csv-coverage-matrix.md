# Dispatch 8: CSV Coverage Matrix

## Reading the matrix

`Preview` means the `locations-v1` dry-run contract. `Export` means the current **Export All Stores** CSV, not the Reference IDs guidance file or Directory API. `Writable` describes ordinary manual application behavior; Dispatch 8 writes nothing.

Recommended future bulk exchange uses separate linked Location and People CSV contracts. Canonical IDs join those contracts. Leadership is organizational data owned by Locations; application role/access scope is authorization data owned by user accounts. The application models `Works at`, `Supports`, Store Manager, Assistant Manager, Key Holder, District Manager, and Regional Manager. It does not model a general employee supervisor/reporting tree.

## Location identity, profile, and lifecycle

Source of truth: `locations` documents. Manual path is Location create/edit unless stated otherwise.

| Attribute | Preview | Export | Current management/class | Future representation, dependency, and acceptance test |
|---|---|---|---|---|
| `id` | `LocationId`; match/add candidate | No | Stable identity; generated on UI create, no ordinary ID editor | Required immutable Location key; reject duplicate/conflicting IDs and prove round trip |
| `version` | Returned as `currentVersion`, not importable | No | Server-managed optimistic concurrency | Exclude from ordinary payload; confirmation manifest records expected version and rejects stale save |
| `storeNumber` | `StoreNumber`; writable, digits-only matching | `StoreNumber` | Location editor | Required text; define nonnumeric policy and test leading zeros/collisions |
| `name` | `StoreName`; writable | `StoreName` | Location editor | Required text; round-trip exact value |
| `type` | `Type`; writable/validated | `Type` | Location editor | Controlled enum; test every type and hierarchy rule |
| `mallOrCenterName` | Unsupported | No | Location editor | Optional Location column; test retail/non-retail display |
| `address` | `Address`; writable | `Address` | Location editor | Required text; test commas/newlines and round trip |
| `city` | `City`; writable | `City` | Location editor | Required text; round trip |
| `state` | `State`; writable/validated | `State` | Location editor | Controlled postal code list; reject unsupported values |
| `zipCode` | `ZipCode`; writable/validated | `ZipCode` | Location editor | Text-preserving postal format; test leading zeros |
| `phone` | `Phone`; writable/normalized | `Phone` | Location editor | E.164-compatible input; preview/save normalization parity |
| `phoneExtension` | Derived from `Phone` input | No | Location editor through phone input | Separate column or documented combined syntax; round-trip extension |
| `phonePrivacy` | Unsupported | No | Read badge; no Location edit control verified | Explicit privacy enum outside public export; test audience-based omission |
| `timeZone` | `TimeZone`; writable/validated | No | Location editor | Controlled IANA zone; include in import-compatible export |
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
| `hierarchyApplicability` | `HierarchyApplicability`; writable | No | Location editor | Controlled enum linked to Location type; test all type combinations |
| `regionId` | `RegionId`; writable/reference validated | No | Location editor; Hierarchy Registry admin | Canonical Region ID; export ID/name; test retired/missing references |
| `districtId` | `DistrictId`; writable/parent validated | No | Location editor; Hierarchy Registry admin | Canonical District ID; require matching Region; test mismatch |
| `district` | Unsupported legacy projection | `District` display | Legacy/read projection; no authoritative editor | Derived/labeled compatibility field, never import identity |
| `storeManagerId` | `StoreManagerId`; writable/active Person validated | No; resolved `StoreManager` name exported | Location editor; organizational leadership | Canonical Person ID; linked People export; missing/inactive tests |
| `storeManagerName` | Unsupported derived/legacy copy | Resolved `StoreManager` | Derived compatibility | Exclude from import; regenerate and test stale copy ignored |
| `storeManagerPhone` | Unsupported derived/legacy copy | Resolved `StoreManagerPhone` | Derived compatibility | Exclude; resolve privacy-aware Person contact at read time |
| `storeManagerPhonePrivacy` | Unsupported derived/legacy copy | No | Copied from selected Person in editor | Exclude; source privacy from Person |
| `assistantStoreManagerIds` | `AssistantStoreManagerIds`; writable semicolon list | No; resolved names exported | Location editor; organizational leadership | Canonical ID list; test order, duplicates, missing/inactive IDs |
| `assistantStoreManagerNames` | Unsupported derived/legacy copy | `AssistantStoreManagers` | Derived compatibility | Exclude; regenerate from canonical IDs |
| `keyHolderIds` | `KeyHolderIds`; writable semicolon list | No | Location editor; organizational leadership | Canonical ID list; test order, duplicates, missing/inactive IDs |
| `keyHolderNames` | Unsupported derived/legacy copy | No | Derived compatibility | Exclude; regenerate from canonical IDs |
| `districtManagerId` | `DistrictManagerId`; writable/active Person validated | No; resolved `DistrictManager` exported | Location editor; organizational leadership | Canonical Person ID; lifecycle tests |
| `districtManagerName` | Unsupported derived/legacy copy | `DistrictManager` | Derived compatibility | Exclude; regenerate from canonical ID |
| `regionalManagerId` | `RegionalManagerId`; writable/active Person validated | No | Location editor; organizational leadership | Canonical Person ID; export ID/name and registry tests |
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

## Recommended linked contracts

1. `locations-vN.csv`: canonical Location identity, profile, hierarchy IDs, and Location-owned leadership Person IDs.
2. `people-vN.csv`: canonical Person identity, approved contact/privacy fields, lifecycle, `WorksAtLocationId`, and `SupportsLocationIds`.
3. Separate registry/configuration contracts only where an approved backup/restore and authorization model exists.

Acceptance requires import-compatible round-trip exports, stable IDs, schema/version manifests, duplicate/dependency diagnostics, privacy filtering, optimistic concurrency, authorization revalidation, audit evidence, bounded atomic writes, backup/recovery, and reconciliation. Until then, Export All Stores and Reference IDs remain guidance/read products, not backups or re-import sources.

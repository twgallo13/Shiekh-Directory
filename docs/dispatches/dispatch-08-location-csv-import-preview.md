# Dispatch 8: Location CSV Import Preview

## Scope

Dispatch 8 adds the read-only first half of governed Location CSV import:

1. Download the versioned `locations-v1` CSV template.
2. Upload a CSV file up to 2 MB.
3. Read an authoritative Location, Person, Region, and District snapshot on the server.
4. Classify each row as Addition, Update, Unchanged, or Blocked.
5. Display every imported field change as its current and proposed value.
6. Block duplicate identities, conflicting Location ID/store-number matches, invalid hierarchy references, and missing, duplicate, or inactive Person references.

The preview does not expose a confirm endpoint and does not call the directory writer. Blank cells are treated as omitted fields, so omission never clears an existing value. An existing Location is selected by `LocationId` when supplied. Store number is a fallback identity only when `LocationId` is absent; a mismatched ID and store number is blocked rather than silently rematched.

Preview requires a write-capable role and company-wide access. This keeps the initial bulk workflow manageable and prevents store-scoped accounts from inspecting records outside their authority.

## Template

The stable column order is:

`SchemaVersion`, `LocationId`, `StoreNumber`, `StoreName`, `Type`, `Address`, `City`, `State`, `ZipCode`, `Phone`, `TimeZone`, `HierarchyApplicability`, `RegionId`, `DistrictId`, `StoreManagerId`, `DistrictManagerId`, `RegionalManagerId`, `AssistantStoreManagerIds`, `KeyHolderIds`, `OperationalStatus`, `RecordStatus`, `GoogleReviewUrl`, `StorePageUrl`.

Every data row must use `SchemaVersion=locations-v1`. Multi-person fields use semicolon-separated canonical Person IDs. New Locations require the core identity, address, contact, timezone, operational status, and record status columns. Existing Location updates may leave untouched fields blank.

## Endpoints

- `GET /api/imports/locations/template` downloads the supported template.
- `POST /api/imports/locations/preview` accepts `{ "csv": "..." }` and returns the summary and row-level changes/issues.

Both endpoints require the current Firebase ID token, disable caching, and fail closed when authentication, authorization, the template, or the authoritative snapshot is unavailable.

## Deferred

Confirm Import, writes, batch IDs, audits, backups, bounded transactions, reconciliation reports, and rollback remain a separate dispatch after product/data-owner acceptance of preview behavior. Broader export/API hierarchy fields and Region/District search and print improvements remain tracked separately.

## Verification

- Pure preview tests cover exact updates, omitted-field preservation, duplicate CSV identities, hierarchy failures, Person-reference failures, conflicting identities, and snapshot immutability.
- API tests cover template download, authenticated read-only preview, company scope, malformed templates, and unavailable authoritative data.
- Browser coverage confirms template download, CSV upload, field-level before/after display, blocker display, and the absence of Confirm Import.
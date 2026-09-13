# Dispatch 8: Location CSV Guidance and Preview Accuracy

## Delivered scope

Dispatch 8 is **Locations only** and **preview only**. It downloads guidance, reads one authoritative snapshot, and reports proposed additions, updates, unchanged rows, warnings, and blocking errors. It has no import executor, Confirm Import endpoint, write call, migration, batch mutation, audit event, rollback action, or deployment change.

System Administrators, Directory Data Stewards, and Editors with `Company` or `Company-wide` scope may use the workflow. Store-scoped and read-only accounts fail closed. The server reads Locations, People, Regions, and Districts in one read-only Firestore transaction. Results include the snapshot time and matched Location version. Preview does not reserve an ID or guarantee a future save: any future save must rebuild the preview and revalidate current records, versions, and authorization.

## Before you start

Use this setup order: **Regions → Districts → Locations → People → leadership assignments**. A Location may be created without leadership references while People are being established. People cannot be created or edited here. `Works at` and `Supports` are Person-owned relationships managed on the Person profile.

The admin panel provides four authenticated downloads:

- **Blank Template**: exact `locations-v1` headers, no data rows.
- **Worked Example**: four synthetic rows demonstrating an addition, update, unchanged row, and blocked references.
- **Field Dictionary**: purpose, addition/update requirement, format, allowed values, blank behavior, and example for every column.
- **Reference IDs**: current Location, Person, Region, and District IDs with recognizable names and lifecycle status. Locations include store number; Districts include parent Region ID/name. It excludes users, account data, email addresses, phone numbers, and private contacts.

The example is synthetic. `SYNTHETIC-*` IDs only produce update/unchanged results against the test fixtures defining those records. Every `REPLACE_WITH_*` value must be replaced with a canonical ID from Reference IDs. Downloads never seed or modify records.

`Export All Stores` is a presentation export, not an import-compatible file and not a complete backup. It omits canonical IDs and many fields needed for deterministic re-import. See [dispatch-08-csv-coverage-matrix.md](dispatch-08-csv-coverage-matrix.md).

## Schema contract

Every row uses `SchemaVersion=locations-v1`. The shared schema in `src/lib/locationImportSchema.ts` owns header order, accepted values, guidance, blank behavior, and all three generated guidance CSVs.

Exact headers, in order:

`SchemaVersion`, `LocationId`, `StoreNumber`, `StoreName`, `Type`, `Address`, `City`, `State`, `ZipCode`, `Phone`, `TimeZone`, `HierarchyApplicability`, `RegionId`, `DistrictId`, `StoreManagerId`, `DistrictManagerId`, `RegionalManagerId`, `AssistantStoreManagerIds`, `KeyHolderIds`, `OperationalStatus`, `RecordStatus`, `GoogleReviewUrl`, `StorePageUrl`.

The parser rejects malformed CSV, duplicate headers, missing headers, unsupported columns, and malformed row widths. Uploads must be non-empty `.csv` files no larger than 2,000,000 bytes. Multi-person fields use semicolon-separated canonical Person IDs with no duplicates.

New Locations require Store Number, Store Name, Type, Address, City, State, ZIP Code, Phone, Time Zone, Operational Status, and Record Status. Location ID is optional for an addition, but preview does not reserve it. Updates require an exact Location ID or, when Location ID is blank, a uniquely matched numeric Store Number. Other fields are optional.

Blank cells preserve existing values. This version cannot explicitly clear a scalar value or list and never treats omission as deletion.

Notable rules:

- Store Number matching supports digits only. Leading zeros are removed for matching, but supplied text remains the proposed stored value and is shown as a warning/change when different.
- State uses two uppercase letters. ZIP Code uses five digits or ZIP+4.
- Time Zone uses one of the four supported US IANA zones.
- Type, hierarchy applicability, operational status, and record status exactly match a listed value.
- Phone uses the manual-save US phone normalizer; preview displays E.164 plus a numeric extension.
- URLs use the manual-save HTTP/HTTPS normalizer and reject credentials.
- Region, District, and Person references use canonical IDs only. Names are never identity candidates.

The complete format and accepted values are visible in-app and in the Field Dictionary download.

## Identity and batch evaluation

Location ID is authoritative when supplied. Store Number is only a fallback when Location ID is blank. An unknown Location ID paired with an existing Store Number is blocked. If Location ID and Store Number resolve to different Locations, both candidates are shown. Duplicate or ambiguous existing identities show all candidates; the first record is never selected.

The complete CSV is parsed before classification. Repeated Location IDs and Store Numbers that collide after numeric normalization block every affected row. A blocked row never counts as a successful addition/update or dependency resolution.

Preview normalizes imported phone and URL values before calculating changes. A valid changed value is an update, not a conflict. Hierarchy checks cover applicability, active Region/District existence, and District parent Region. Changed leadership references must resolve to one active Person; duplicate IDs within Assistant Manager or Key Holder lists are blocked. Retiring a Location is blocked while any Person has an incoming `Works at` or `Supports` relationship.

Only touched fields, plus required fields for additions, are revalidated. An unrelated update preserves unchanged legacy phone, hierarchy, or Person-reference defects instead of creating a new import failure. Those defects still require intentional reconciliation.

## Actionable results

Each issue reports severity, CSV row, field, supplied value, current value when available, reason, correction, and identity candidates when relevant. Errors block the row; warnings permit the proposed action but require review.

- Missing reference: correct the ID or create the real record separately, then preview again.
- Duplicate or ambiguous identity: inspect all candidates, repair source duplication, and explicitly correct the CSV.
- Hierarchy mismatch: correct the CSV or intentionally repair the registry and affected records.
- Invalid attribute: use the format or accepted values in the Field Dictionary.
- Changed authoritative data: download current references and rebuild the preview.

The preview never merges records, infers identity from names, invents a reference, or silently chooses a candidate.

## Example expectations

Focused fixtures prove the worked example yields one addition, one update, one unchanged row, and one blocked relationship row. The update fixture shows normalized phone/extension changes. The blocked row intentionally uses placeholder Region, District, and Person IDs; these are instructions, not live identities.

## Endpoints

- `GET /api/imports/locations/template`
- `GET /api/imports/locations/example`
- `GET /api/imports/locations/fields`
- `GET /api/imports/locations/references`
- `POST /api/imports/locations/preview` with `{ "csv": "..." }`

All routes require the current Firebase ID token, company-wide preview authority, rate limiting, and `Cache-Control: no-store`. Reference and preview routes read authoritative data; none receives a directory writer.

## Remaining limitations

- No Confirm Import, writes, batch ID, audit, backup, recovery, rollback, or import execution.
- No explicit clearing syntax and no nonnumeric Store Number matching.
- No People import/export contract or import-compatible Location/backup export.
- No import of `Works at`, `Supports`, custom fields, hours, templates, overrides, notices, privacy settings, account permissions, credentials, audits, or configuration.
- No hierarchy registry import and no creation of references from names.
- No ID reservation; concurrent changes require a rebuilt preview.
- No broader Directory API/export hierarchy coverage or Region/District search/print improvement.

Future bulk work should use separate linked `locations-vN` and `people-vN` contracts with canonical IDs. Credentials, application permissions, audit history, server-managed values, and operational configuration remain outside ordinary directory imports.

## Verification contract

Tests cover schema synchronization, all guidance/reference downloads, parsing failures, normalized values, identity conflicts/candidates, leading-zero behavior, batch collisions, hierarchy and leadership validation, duplicate assignments, retirement dependencies, unchanged legacy preservation, authorization, snapshot timestamps, fixture examples, and snapshot immutability. Route tests include sentinel `commit` and `migrate` methods and prove neither is called.

Browser, visual, and functional acceptance testing remains with the product owner. Playwright is not part of this pass.
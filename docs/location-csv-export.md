# Location CSV Import and Export

## Flexible import workflow

Administrators may upload identity plus only the supported Location fields they intend to update. `LocationId` is matched first. When it is omitted, a unique digits-only `StoreNumber` may match an existing Location. Leading zeros are ignored for matching, but the supplied text remains the proposed stored Store Number. Nonnumeric Store Numbers are never reinterpreted, and Location, District, or Person names are never used as relationship identities.

Omitted columns and blank cells preserve existing values. Explicit clearing is not supported. New Locations must provide all required fields; existing Locations need only identity plus changed fields. **Add and update** permits both outcomes. **Update existing only** blocks rows that do not resolve to an existing Location and is the default when an `shiekh_locations_editing_v1_...csv` file is selected.

`SchemaVersion` may be omitted or blank and then uses the current `locations-v1` format. A supplied unsupported version is rejected on its row. The field dictionary lists canonical headers, approved aliases, formats, and allowed values. Heading matching ignores case and surrounding whitespace. Every suggested mapping must be reviewed. A source heading may be mapped to one supported target or explicitly ignored; duplicate target mappings and files without a mapped `LocationId` or `StoreNumber` are blocked.

Both existing Store exports are recognized. **Export for Editing** maps all supported canonical ID fields. The reporting **Export All Stores** maps supported Location attributes, while `District`, `StoreManager`, `StoreManagerPhone`, `DistrictManager`, and `AssistantStoreManagers` are informational and ignored by default. Display names never become Region, District, or Person references; canonical `RegionId`, `DistrictId`, and Person ID columns are required to change relationships.

Preview evaluates the complete file for duplicate and conflicting identities before row selection. Rows are labeled New, Updated, Unchanged, or Needs attention and show normalized before/after values plus CSV row, identity, field, supplied/current values, reason, and correction steps. Ready New or Updated rows may be selected independently. Excluding one row cannot resolve a duplicate identity found elsewhere in the file.

A record with too few or too many cells is retained at its original CSV position, shown as Needs attention, and copied to correction output without truncating, shifting, or padding its values. Its available mapped identity still participates in complete-file collision checks. Independently valid rows remain selectable. Broken quoting or another parse failure that makes record boundaries unreliable rejects the whole file with file-level correction guidance.

Changing the file, mappings, mode, or selection requires a new server preview. The signed 10-minute confirmation binds those choices, normalized selected writes, unchanged assertions, and the actor. Confirmation re-reads authoritative Locations, People, Regions, and Districts, rechecks versions and dependencies, and saves all selected rows, audits, and the receipt in one transaction. A failure saves nothing. Retrying the same operation returns the existing receipt without duplicate records or audits.

Before confirmation, selected rows are `pending`. A definitive rejection marks them `not saved` and includes them in the correction CSV. A network or indeterminate server response is `outcome unknown`: do not start a fresh import or re-import those selected rows. Retry the same signed operation until the authoritative receipt or definitive rejection is returned. A successful results download marks rows `saved` only when their Location IDs appear in that receipt. The last completed receipt and its downloads remain visible while another preview or selection is prepared.

Limits are 2,000,000 UTF-8 bytes, 100 file rows, and 40 selected changed rows per atomic confirmation. Files with more than 40 ready rows remain previewable but start with no selected rows. The server never silently partitions an import.

Results CSV downloads distinguish pending, saved, not saved, outcome unknown, unchanged, blocked, and not selected rows. Correction CSV downloads retain blocked and not selected source rows, plus selected rows after a definitive rejection. Formula-leading cells are protected for spreadsheet use. Preview and downloads never write directory records and remain subject to the same authenticated company-wide access restriction.

Application-generated editing, reporting, and correction files explicitly signal reversible protection with the heading `SpreadsheetEncoding=shiekh-safe-v1` and the value `shiekh-safe-v1`. Only files carrying that explicit heading are decoded on import. The canonical `SpreadsheetEncoding` heading without that signal is ordinary CSV, and blank values select ordinary behavior. Ordinary uploads preserve intentional leading apostrophes exactly. Protected files remove exactly one application-added apostrophe, preserving formula-like text, literal apostrophes, and phone numbers beginning with `+` across export and re-import. Do not rename the explicit encoding heading in an application-generated file unless you intend to treat its values as ordinary CSV.

## Export for Editing

`Export for Editing` is the import-compatible Location workflow. It is separate from the presentation export below and uses the shared `locations-v1` fields, parser, and preview rules. Its protected encoding header is an approved alias of the canonical `SpreadsheetEncoding` field.

The server reads Locations, People, Regions, and Districts in one read-only transaction. System Administrators, Directory Data Stewards, and Editors require `Company` or `Company-wide` scope to prepare the export. The response reports the snapshot timestamp; total, Active, Draft, and Retired counts; part filenames and counts; immediate round-trip totals; and diagnostics by affected Location ID and field.

Every Location type and lifecycle state is included in deterministic Store Number/Location ID order. Parts contain at most 100 rows and 2,000,000 UTF-8 bytes, use a BOM and the established CSV serializer, and are named `shiekh_locations_editing_v1_part_NNN_of_NNN.csv`. A single record that cannot fit fails explicitly rather than being omitted or truncated.

Canonical IDs are preserved for Locations, hierarchy, and leadership. Assistant Manager and Key Holder IDs remain in source order and use semicolons. Phone extensions use `ext. <digits>` in the existing `Phone` column. Leading zeros, Unicode, quoted values, and line breaks are serialized as text without spreadsheet formulas.

Each generated part is evaluated through the existing preview planner against the same snapshot. Invalid legacy values, reference problems, normalization changes, ambiguous identities, and populated unsupported fields are reported rather than cleaned. Unsupported Location fields, People-owned `Works at`/`Supports`, hierarchy registries, custom fields, hours/settings, permissions, and application configuration are not represented; this is an editing export, not a full backup.

Each part must be imported independently. Preview allows 100 total rows and confirmation allows no more than 40 selected changed rows. The export snapshot does not lock versions: a later preview compares against current data, so review every proposed change. Confirmation protects the interval between preview and save. Blank cells preserve existing values, and removing a CSV row does not delete a Location.

When opening a part in spreadsheet software, import Store Number, ZIP Code, and Phone columns as text to avoid automatic conversion. Do not add formulas to force formatting.

Endpoints:

- `POST /api/imports/locations/editing-export/prepare`

The authenticated response includes every bounded CSV part from one snapshot. The browser retains those bodies for local downloads, so the workflow is consistent across Cloud Run instances without process-local state or follow-up database reads. The route never invokes directory writes.

## Export All Stores

`Export All Stores` is a server-owned export. The browser requests export metadata from `/api/exports/locations/prepare`, shows the server count and effective authorization scope, and downloads only after the user confirms. The download uses `/api/exports/locations/:token` with the current Firebase ID token; screen filters, selected rows, pagination, local storage, and bootstrapped browser state are not export inputs.

The server validates the Firebase ID token, resolves the active directory user record and access scope, reads `locations` and `people` from the configured named Firestore database, and builds a CSV from one read-only snapshot. `(default)` Firestore is rejected. Company and `Company-wide` scopes receive all active stores. `Store <number>` scopes receive only the matching active store. Other scope formats fail closed until a future requirement defines them.

The export rejects duplicate location IDs and duplicate normalized active store numbers before download. Metadata includes export mode, active lifecycle, record count, effective authorization scope, generation timestamp, filename, token expiry, a SHA-256 digest of the exported store-number set, and the count of missing canonical person references.

## CSV Columns

Column order is stable. The first heading is the explicit protected-file signal:

`SpreadsheetEncoding=shiekh-safe-v1`, `StoreNumber`, `StoreName`, `Type`, `Address`, `City`, `State`, `ZipCode`, `Phone`, `District`, `StoreManager`, `StoreManagerPhone`, `DistrictManager`, `AssistantStoreManagers`, `OperationalStatus`, `RecordStatus`, `GoogleReviewUrl`, `StorePageUrl`.

Values are serialized as UTF-8 with a BOM for spreadsheet compatibility, including quoting for commas, quotation marks, CR/LF line breaks, and Unicode text. Valid US phone values use the shared readable display formatter and retain extensions; missing values remain blank. Store numbers and ZIP codes are emitted as text values and preserve leading zeros in the CSV. Spreadsheet applications may still apply automatic type conversion when opening CSV files. Stronger spreadsheet typing, formulas, or protected text cells require a separate XLSX export and are not part of this CSV contract.

Leadership columns prefer canonical person IDs and canonical assignment relationships when present. If a valid canonical person exists, copied legacy names on the location record are ignored. Missing canonical person IDs produce blank leadership values and are counted in export metadata instead of falling back to stale copied names.

## Approved subsequent scope

These items are approved next steps and are not implemented by this workflow:

1. Add District Code values such as `01` and `02` to existing Districts while preserving internal District IDs, with API and CSV/reference support.
2. Add a separate People import/export built on the reviewed mapping, preview, selected-row confirmation, results, and correction workflow.
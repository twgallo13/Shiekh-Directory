# Location CSV Export

## Export for Editing

`Export for Editing` is the import-compatible Location workflow. It is separate from the presentation export below and uses the exact shared `locations-v1` schema, headers, order, mappings, parser, and preview rules.

The server reads Locations, People, Regions, and Districts in one read-only transaction. System Administrators, Directory Data Stewards, and Editors require `Company` or `Company-wide` scope to prepare the export. The response reports the snapshot timestamp; total, Active, Draft, and Retired counts; part filenames and counts; immediate round-trip totals; and diagnostics by affected Location ID and field.

Every Location type and lifecycle state is included in deterministic Store Number/Location ID order. Parts contain at most 100 rows and 2,000,000 UTF-8 bytes, use a BOM and the established CSV serializer, and are named `shiekh_locations_editing_v1_part_NNN_of_NNN.csv`. A single record that cannot fit fails explicitly rather than being omitted or truncated.

Canonical IDs are preserved for Locations, hierarchy, and leadership. Assistant Manager and Key Holder IDs remain in source order and use semicolons. Phone extensions use `ext. <digits>` in the existing `Phone` column. Leading zeros, Unicode, quoted values, and line breaks are serialized as text without spreadsheet formulas.

Each generated part is evaluated through the existing preview planner against the same snapshot. Invalid legacy values, reference problems, normalization changes, ambiguous identities, and populated unsupported fields are reported rather than cleaned. Unsupported Location fields, People-owned `Works at`/`Supports`, hierarchy registries, custom fields, hours/settings, permissions, and application configuration are not represented; this is an editing export, not a full backup.

Each part must be imported independently. Preview still allows 100 total rows and confirmation still allows no more than 40 changed rows. The export snapshot does not lock versions: a later preview compares against current data, so review every proposed change. Dispatch 9 protects the interval between preview and confirmation. Blank cells preserve existing values, and removing a CSV row does not delete a Location.

When opening a part in spreadsheet software, import Store Number, ZIP Code, and Phone columns as text to avoid automatic conversion. Do not add formulas to force formatting.

Endpoints:

- `POST /api/imports/locations/editing-export/prepare`

The authenticated response includes every bounded CSV part from one snapshot. The browser retains those bodies for local downloads, so the workflow is consistent across Cloud Run instances without process-local state or follow-up database reads. The route never invokes directory writes.

## Export All Stores

`Export All Stores` is a server-owned export. The browser requests export metadata from `/api/exports/locations/prepare`, shows the server count and effective authorization scope, and downloads only after the user confirms. The download uses `/api/exports/locations/:token` with the current Firebase ID token; screen filters, selected rows, pagination, local storage, and bootstrapped browser state are not export inputs.

The server validates the Firebase ID token, resolves the active directory user record and access scope, reads `locations` and `people` from the configured named Firestore database, and builds a CSV from one read-only snapshot. `(default)` Firestore is rejected. Company and `Company-wide` scopes receive all active stores. `Store <number>` scopes receive only the matching active store. Other scope formats fail closed until a future requirement defines them.

The export rejects duplicate location IDs and duplicate normalized active store numbers before download. Metadata includes export mode, active lifecycle, record count, effective authorization scope, generation timestamp, filename, token expiry, a SHA-256 digest of the exported store-number set, and the count of missing canonical person references.

## CSV Columns

Column order is stable:

`StoreNumber`, `StoreName`, `Type`, `Address`, `City`, `State`, `ZipCode`, `Phone`, `District`, `StoreManager`, `StoreManagerPhone`, `DistrictManager`, `AssistantStoreManagers`, `OperationalStatus`, `RecordStatus`, `GoogleReviewUrl`, `StorePageUrl`.

Values are serialized as UTF-8 with a BOM for spreadsheet compatibility, including quoting for commas, quotation marks, CR/LF line breaks, and Unicode text. Valid US phone values use the shared readable display formatter and retain extensions; missing values remain blank. Store numbers and ZIP codes are emitted as text values and preserve leading zeros in the CSV. Spreadsheet applications may still apply automatic type conversion when opening CSV files. Stronger spreadsheet typing, formulas, or protected text cells require a separate XLSX export and are not part of this CSV contract.

Leadership columns prefer canonical person IDs and canonical assignment relationships when present. If a valid canonical person exists, copied legacy names on the location record are ignored. Missing canonical person IDs produce blank leadership values and are counted in export metadata instead of falling back to stale copied names.
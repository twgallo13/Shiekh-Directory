# Location CSV Export

`Export All Stores` is a server-owned export. The browser requests export metadata from `/api/exports/locations/prepare`, shows the server count and effective authorization scope, and downloads only after the user confirms. The download uses `/api/exports/locations/:token` with the current Firebase ID token; screen filters, selected rows, pagination, local storage, and bootstrapped browser state are not export inputs.

The server validates the Firebase ID token, resolves the active directory user record and access scope, reads `locations` and `people` from the configured named Firestore database, and builds a CSV from one read-only snapshot. `(default)` Firestore is rejected. Company and `Company-wide` scopes receive all active stores. `Store <number>` scopes receive only the matching active store. Other scope formats fail closed until a future requirement defines them.

The export rejects duplicate location IDs and duplicate normalized active store numbers before download. Metadata includes export mode, active lifecycle, record count, effective authorization scope, generation timestamp, filename, token expiry, a SHA-256 digest of the exported store-number set, and the count of missing canonical person references.

## CSV Columns

Column order is stable:

`StoreNumber`, `StoreName`, `Type`, `Address`, `City`, `State`, `ZipCode`, `Phone`, `District`, `StoreManager`, `StoreManagerPhone`, `DistrictManager`, `AssistantStoreManagers`, `OperationalStatus`, `RecordStatus`, `GoogleReviewUrl`, `StorePageUrl`.

Values are serialized with `csv-stringify`, including quoting for commas, quotation marks, CR/LF line breaks, and Unicode text. Store numbers and ZIP codes are emitted as text values and preserve leading zeros in the CSV. Spreadsheet applications may still apply automatic type conversion when opening CSV files. Stronger spreadsheet typing, formulas, or protected text cells require a separate XLSX export and are not part of this CSV contract.

Leadership columns prefer canonical person IDs and canonical assignment relationships when present. If a valid canonical person exists, copied legacy names on the location record are ignored. Missing canonical person IDs produce blank leadership values and are counted in export metadata instead of falling back to stale copied names.
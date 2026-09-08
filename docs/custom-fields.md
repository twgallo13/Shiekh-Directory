# Custom Fields

## Administrator Workflow

1. Open **Admin & Integrations > Custom Fields**.
2. Choose **Add field**. Enter a label and a permanent key, such as `yelpUrl` or `appleMapsUrl`.
3. Choose URL, Text, Number, Checkbox, or Choice list. Add choices one per line for a choice list. Optional help text appears with the location input; display order controls placement.
4. Leave **Expose in read-only API** unchecked for internal directory data. Check it only when every authorized location API consumer may receive the value.
5. Save. The screen reports success only after the server confirms the definition was stored.
6. Edit a store and find **Custom Metadata** on the Store tab. Enter its value, save, and confirm the value on the store details screen.

The new field applies to all stores but is optional. No code change or deployment is needed to add another field once this implementation is deployed.

Administrators can edit labels, help text, display order, and API visibility later. Field keys and types are permanent. Choice lists can gain choices but cannot remove or rename existing choices. Use **Retired** to stop a field appearing in forms and the read-only API while retaining historical values. **Show retired fields** allows administrators to find and reactivate it. Retired keys cannot be reused for a different meaning.

Data stewards can inspect field definitions but cannot change them. Existing directory UI permissions govern location editing. Internal-only means excluded from downstream API responses, not hidden from authorized directory viewers. Do not store passwords, API tokens, private keys, or other integration credentials in metadata.

## Built-In Links

Google Review URL and Store Website URL remain the existing built-in location fields. Their API names remain `googleReviewUrl` and `storePageUrl`; their keys cannot be duplicated as custom fields. Both retain manual entry. GBP review-link retrieval and outbound publishing are separate work and were not enabled by this change.

## Storage and Save Behavior

- Definitions live in the named Firestore database's `custom_field_definitions` collection, keyed by permanent field key.
- Values live on the canonical location document as `customMetadata`, alongside core directory fields. There is no separate store list.
- Definition and location changes use server authentication, validation, and transactional audit logging. No custom metadata is stored in browser localStorage.
- Location forms remain open on failure and retain the draft. Concurrent metadata or definition changes require reloading before retrying; the server does not silently choose a winner.
- Retired values remain on location documents and in audit history. Ordinary saves that omit metadata preserve the existing values.
- Metadata concurrency checks protect the metadata object, not every unrelated core location attribute. A broader whole-record concurrency redesign remains separate work.
- Metadata changes recognize company-wide and exact store scopes. Other scope formats require an explicit future mapping rather than being guessed.

## Downstream Contract

Both location API routes return only active, explicitly API-visible custom fields under `customMetadata`. Consumers can discover these definitions through `GET /api/v1/location-fields` using their existing `locations:read` credential. See [API.md](../API.md) for examples and synchronization rules.

Schema changes carry a version and require full reconciliation when the version changes. Consumers must replace the entire metadata object rather than merge keys indefinitely. This is important when a formerly public field becomes internal or retired. Responses use `no-store` so old cached data is not served as the latest publication policy. Existing clients that omit the schema version receive full results, including when requesting a delta.

## Release Checklist

- Deploy the application and server together. This workspace change alone does not update the live site.
- Confirm the existing runtime service identity can read/write the new collection in the already configured named Firestore database. No additional GBP permissions are needed.
- No bulk data migration is required. Missing definitions and values are treated as empty; the first administrator save creates the collection/document normally.
- Confirm each production account's scope uses the supported company-wide or exact-store formats before enabling metadata editing for it.
- Pilot an internal URL field on one canonical store. Save, reload, and check the server-generated audit entry.
- Enable API exposure only after the downstream team implements schema-version handling and metadata replacement. Verify both list and detail output with an approved read token.
- Verify that retiring the pilot field removes it from forms/API responses while retaining stored history.

Automated coverage includes typed validation, permissions, stale-write rejection, transaction/bootstrapping/audit plumbing with a fake Firestore adapter, API projection and schema changes, and mocked desktop/mobile browser workflows. These tests do not establish live Firestore permissions or deploy production data. CSV/PDF custom-field configuration, required fields, per-field internal visibility, and GBP integration remain outside this release.
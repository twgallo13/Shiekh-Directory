# Dispatch 2: Phone Formatting/Validation and URL Normalization

**Status:** Ready to execute
**Depends on:** Dispatch 1 (server-owned CSV export) — already deployed to production, commit `9ce8646`
**Return dispatch required:** Yes — see "Completion Report" at the end of this file. Reply to the user with a summary plus the phrase "Return dispatch: see `docs/dispatches/dispatch-02-phone-url-normalization.md`" so the location stays traceable across chat sessions.

This addresses Observations #1 and #2 from the original architectural review (phone-number formatting/validation and website/URL normalization). It is intentionally decoupled from the Territory/Region hierarchy question and the assignment/role redesign — none of those decisions block this dispatch.

Remain in charge of implementation details, but keep this dispatch narrowly scoped to phone and URL field handling. Do not begin hierarchy, role, or assignment work in this dispatch.

## Verified Starting Point

- No phone validation or normalization exists anywhere in the app. `Person.phone`, `Person.workPhone`, `Location.phone`, and the derived `Location.storeManagerPhone` are stored and displayed as free-text exactly as typed. Confirmed: `Location.phone` in [src/components/locations/LocationEditModal.tsx](../../src/components/locations/LocationEditModal.tsx) is a plain text input with no format constraint.
- URL validation exists but does not normalize. [src/lib/customFields.ts](../../src/lib/customFields.ts) `isWebUrl()` requires an explicit `http:`/`https:` scheme, rejects credentials, and is enforced server-side in [server/firestoreDirectory.ts](../../server/firestoreDirectory.ts) `validateMetadataWrites()` for `googleReviewUrl`, `storePageUrl`, and custom `url`-type fields. A bare entry like `example.com` is currently rejected rather than normalized.
- The browser's native `type="url"` inputs for `googleReviewUrl`/`storePageUrl` in [src/components/locations/LocationEditModal.tsx](../../src/components/locations/LocationEditModal.tsx) (lines ~731, ~747) also require a scheme before the value even reaches server validation.
- `Location.storeManagerPhone` is a derived copy from the assigned person's phone, refreshed on person update in [src/context/DirectoryContext.tsx](../../src/context/DirectoryContext.tsx). Normalizing at the person record is sufficient; do not duplicate normalization logic on the derived copy.
- The read-only public Directory API passes `phone` through unmodified in [server/directoryApi.ts](../../server/directoryApi.ts) (lines 387-391); confirm downstream consumers won't break if the stored format changes.
- No phone-parsing library is currently a dependency (confirmed via `package.json`).

Reverify these facts against the current revision before editing. If the implementation has changed, follow the current owning path and document the difference.

## Required Outcome — Phone Numbers

- Accept common US entry formats: `5551234567`, `555-123-4567`, `(555) 123-4567`, with or without a leading `1`/`+1`.
- Normalize valid entries to a single canonical stored format and a single consistent display format. Use E.164 (`+15551234567`) for canonical storage and national format (`(555) 123-4567`) for display — confirm this matches any existing consumer expectations before finalizing, since the read-only Directory API currently passes `phone` through as-is.
- Support an optional, explicitly separate extension (e.g., `x123`). Never silently drop digits that look like an extension.
- Reject entries that cannot be parsed as valid phone numbers rather than storing malformed text. Show a clear inline validation error instead of silently accepting bad input.
- Apply this to `Person.phone`, `Person.workPhone`, and `Location.phone`. Do not touch `Location.storeManagerPhone`/`storeManagerPhonePrivacy` normalization directly — it inherits from the source person.
- Use a proven phone-parsing library (e.g., `libphonenumber-js` or equivalent) rather than hand-written regex normalization. Confirm bundle-size impact before adding it to the browser build; prefer the lighter-weight variant if one exists.
- Do not silently rewrite existing stored values. Existing unparseable phone values must continue to display as-is and must be flagged (e.g., a "needs review" indicator) rather than blocked or corrected without user action.

## Required Outcome — URLs

- Accept entries with or without a protocol, e.g. `example.com` and `https://example.com`.
- If no scheme is present, prepend `https://` before validation, unless the resulting value fails `isWebUrl()` (e.g., no valid hostname), in which case reject with a clear error.
- Preserve an explicitly entered `http://` if the user typed it — do not force-upgrade existing valid `http://` entries entered deliberately, per the current validation contract. Confirm this is still the desired behavior; the alternative is forcing `https://` even over explicit `http://` input.
- Apply this to `Location.googleReviewUrl`, `Location.storePageUrl`, and custom fields of type `url`.
- Keep the existing rejection of credentials-in-URL and non-http(s) schemes unchanged.
- Normalize in one shared function used by both the browser form and the server validator in `validateMetadataWrites`, so behavior cannot diverge.

## Architecture Requirements

1. Add one shared phone-parsing/formatting module usable from both browser components and server validation (mirroring how `isWebUrl` is shared today).
2. Add one shared URL-normalization function that wraps `isWebUrl`, callable from both the location edit form and `server/firestoreDirectory.ts`.
3. Server-side validation remains authoritative. The browser may pre-format for UX, but the server must independently validate and normalize on write — do not trust browser-normalized values.
4. Do not change the stored shape of existing custom field definitions or their validation contract beyond the normalization step itself.
5. Do not perform a bulk rewrite of existing Firestore phone/URL values in this dispatch. Only new saves are normalized going forward.

## User Workflow

- Phone input fields show a helper format hint (e.g., placeholder `(555) 123-4567`) and normalize/reformat on blur, not on every keystroke.
- Invalid phone entries show a specific inline error rather than a generic save failure.
- URL input fields accept protocol-less entries and normalize on blur/save; show the normalized value back to the user before save completes.
- Existing unparseable legacy phone values remain visible and editable; do not block unrelated form saves because of a legacy value the user isn't touching.

## Required Tests

- All three example phone formats from the request normalize to the same canonical value.
- Phone number with an extension preserves the extension distinctly from the base number.
- Clearly invalid phone input (too few digits, letters) is rejected with a specific error.
- `example.com` normalizes to `https://example.com` and passes validation.
- An explicit `http://example.com` entry's handling matches whatever behavior is confirmed as correct (preserved or upgraded — pick one and test it).
- A URL with no valid hostname after prefixing `https://` is rejected.
- Existing stored malformed phone/URL values are not altered by unrelated location/person saves.
- Server independently rejects a value the browser incorrectly "normalized," proving server-side is authoritative.
- Custom field of type `url` uses the same normalization path as built-in `googleReviewUrl`/`storePageUrl`.

## Safety Constraints

- Do not modify, delete, or bulk-normalize existing Firestore phone/URL values.
- Do not run a migration.
- Do not commit, push, or deploy without explicit confirmation after implementation is verified locally (following the same review process as Dispatch 1).
- Preserve unrelated working-tree changes.

## Validation

```bash
npm run lint
npm run test:api
npm run build
git diff --check
```

## Completion Report

When finished, reply to the user with a summary covering:

1. Confirmed root cause/gaps and any difference from this verified starting point.
2. Final canonical storage format and display format for phones, with extension handling.
3. Final URL normalization behavior, including the `http://` vs `https://` decision made.
4. Shared modules used by both browser and server, and how server-side authority is preserved.
5. Files changed.
6. Automated test results.
7. Confirmation that no existing Firestore data was rewritten.
8. Remaining limitations or decisions deferred to later phases.

Reference this file's path (`docs/dispatches/dispatch-02-phone-url-normalization.md`) in that reply so the user can track it back to this dispatch.

# Dispatch 2: Phone Formatting/Validation and URL Normalization

**Status:** Implemented and deployed; retained as the implementation record
**Implementation commit:** `b0e6aab`
**Depends on:** Dispatch 1 (server-owned CSV export) — already deployed to production, commit `9ce8646`
**Return dispatch required:** Yes — see "Completion Report" at the end of this file. Reply to the user with a summary plus the phrase "Return dispatch: see `docs/dispatches/dispatch-02-phone-url-normalization.md`" so the location stays traceable across chat sessions.

This addresses Observations #1 and #2 from the original architectural review (phone-number formatting/validation and website/URL normalization). It is intentionally decoupled from the Territory/Region hierarchy question and the assignment/role redesign — none of those decisions block this dispatch.

Remain in charge of implementation details, but keep this dispatch narrowly scoped to phone and URL field handling. Do not begin hierarchy, role, or assignment work in this dispatch.

## Verified Current State

- The implementation exists in commit `b0e6aab`; this document is the implementation contract and verification record, not an instruction to recreate the feature.
- Shared normalization lives in [src/lib/contactNormalization.ts](../../src/lib/contactNormalization.ts) and phone parsing uses `libphonenumber-js/min`.
- Valid US phone values are stored as E.164, displayed in national US format, and extensions are stored separately in `phoneExtension` and `workPhoneExtension`.
- Shared URL normalization accepts protocol-less hostnames by adding `https://` and preserves explicit `http://` values.
- Server-side normalization occurs in [server/firestoreDirectory.ts](../../server/firestoreDirectory.ts). Built-in location URLs and custom `url` fields use the shared URL path.
- Unchanged legacy phone and URL values are preserved during unrelated saves. No migration or bulk rewrite is part of this work.
- The public Directory API keeps its existing `phone` field and privacy behavior; it does not expose phone extensions in this dispatch.

Reverify these facts against the current revision before any future maintenance change. If the implementation has changed, follow the current owning path and document the difference.

## Affected Implementation Surfaces

Verify these paths when maintaining this behavior:

- `src/lib/contactNormalization.ts`
- `src/lib/customFields.ts`
- `src/types.ts`
- `server/firestoreDirectory.ts`
- `server/directoryApi.ts`
- `src/components/locations/LocationEditModal.tsx`
- `src/components/locations/CustomMetadataFields.tsx`
- `src/components/locations/LocationDetailModal.tsx`
- `src/components/people/PeopleView.tsx`
- `src/components/people/PersonDetailModal.tsx`
- `src/components/people/PersonSelector.tsx`
- `src/components/admin/AdminIntegrationsView.tsx`
- `src/context/DirectoryContext.tsx`
- `test/contactNormalizationWrites.test.ts`
- `test/customFields.test.ts`
- `test/directoryApi.test.ts`
- `test/customFieldWrites.test.ts`
- `test/customFieldApi.test.ts`

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

## URL Protocol Decision

- `example.com` becomes `https://example.com`.
- Explicit `https://` remains `https://`.
- Explicit `http://` remains `http://`.
- No automatic HTTPS upgrade is performed.
- Credentials, non-HTTP(S) schemes, invalid hostnames, whitespace-padded values, and malformed URLs are rejected.

## Phone Extension Contract

- The canonical base phone is stored in E.164 form.
- A recognized extension is stored separately in `Location.phoneExtension`, `Person.phoneExtension`, or `Person.workPhoneExtension`.
- Extensions are never appended to the canonical E.164 value.
- Display formatting may show `ext. 123`, but storage keeps the extension separate.
- The public Directory API does not expose extensions in this dispatch.

## Directory API Compatibility Decision

The existing public API contract remains unchanged in field names, JSON types, privacy rules, and endpoint behavior.

- Public `location.phone` remains a string field.
- Newly normalized values are returned as canonical E.164 strings, such as `+12125550100`.
- Consumers must treat phone values as opaque strings and must not depend on punctuation or national display formatting.
- `phoneExtension`, `workPhoneExtension`, and personnel phone fields remain internal unless a separately approved API contract adds them.
- Existing privacy behavior remains unchanged.

## Legacy Invalid URL Behavior

- Existing malformed or legacy URL values are not rewritten automatically.
- Existing invalid URL values remain visible in edit and read-only views.
- An unchanged invalid URL does not block an unrelated save.
- A user editing an invalid URL receives an inline validation error until the value is cleared or replaced with a valid normalized URL.

## Architecture Requirements

1. Add one shared phone-parsing/formatting module usable from both browser components and server validation (mirroring how `isWebUrl` is shared today).
2. Add one shared URL-normalization function that wraps `isWebUrl`, callable from both the location edit form and `server/firestoreDirectory.ts`.
3. Server-side validation remains authoritative. The browser may pre-format for UX, but the server must independently validate and normalize on write — do not trust browser-normalized values.
4. Do not change the stored shape of existing custom field definitions or their validation contract beyond the normalization step itself.
5. Do not perform a bulk rewrite of existing Firestore phone/URL values in this dispatch. Only new saves are normalized going forward.

## Bundle Verification

- Use the lightweight `libphonenumber-js/min` browser import, not the full package entry point.
- Confirm the production build does not introduce a separate full phone metadata bundle.
- Record the relevant production bundle output from `npm run build`.
- An existing large-chunk warning is not a phone-library failure unless the phone library materially increases the affected chunk.

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

## Final Acceptance Criteria

The dispatch is complete only when all of the following are true:

- The three common US phone formats normalize to the same E.164 value.
- Leading `1` and `+1` are accepted.
- Extensions remain separate and are preserved.
- Invalid phone values are rejected on changed writes with field-specific errors.
- Unchanged legacy invalid phone values do not block unrelated saves.
- `example.com` becomes `https://example.com`.
- Explicit `http://example.com` remains `http://example.com`.
- Invalid, credential-bearing, and non-HTTP(S) URLs are rejected.
- Unchanged legacy invalid URLs do not block unrelated saves.
- Changed custom URL fields and built-in location URL fields use the same normalization function.
- The public API keeps its existing field names, privacy behavior, response shape, and endpoint behavior.
- The public API does not expose phone extensions in this dispatch.
- Server validation rejects malformed values even if the browser sends an incorrectly formatted value.
- No migration, bulk rewrite, or unrelated Firestore write occurs.
- The repository passes lint, tests, build, and diff checks.
- The completion report records the implementation commit and production deployment state.

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

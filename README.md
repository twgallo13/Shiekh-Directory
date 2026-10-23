# Shiekh Directory

Store operations and personnel directory. The live application is at [shiekh-dir.ai.studio](https://shiekh-dir.ai.studio).

## Documentation

- [Promotion/offboarding dependency preflight](docs/dispatches/dispatch-28-person-transition-preflight.md): read-only canonical/stale assignment, workplace/support, account and pending-correction review. Check publication state; it neither clears someone for inactivation nor changes staff/access.

- [Published legacy individual-email mapping](docs/dispatches/dispatch-27-explicit-legacy-email-mapping.md): PR #45 adds reviewed draft opt-in, normal confirmed Save, source/clear preservation and no account/API permission changes.

- [Person contacts and shared store inboxes](docs/person-contacts-and-store-inboxes.md): published optional individual email, canonical SM/AM inbox responsibility, legacy preservation and account/mailbox boundaries. [Dispatch 26](docs/dispatches/dispatch-26-person-inbox-responsibilities.md) records PR #43 validation, review and publication.

- [District leadership API release](docs/dispatches/dispatch-25-district-leadership-api.md): PR #39 is published, with a separately versioned District roster/store-membership snapshot; DM work contact requires a separate grant. The owner-approved Shiekh-Intel grant update is confirmed; authenticated consumer acceptance remains pending and issue #36 stays open. Work email is not a verified sign-in identity.

- [Person card and linked positions](docs/dispatches/dispatch-24-person-card-linked-positions.md): PR #37 is published; explicitly selected concurrent positions, dependency preview, changed-field-only saves and consistent District-owned DM displays. Live promotion/offboarding acceptance and broader migration remain separate. DM API business contacts are open issue 36/P6.9.

- [Request validation and submission recovery](docs/dispatches/dispatch-21-request-validation-recovery.md): PR #32 is live; exact validation/replay/cancellation contract and acceptance limits.
- [Immediate operating state](docs/dispatches/dispatch-22-immediate-operating-state.md): PR #33 is published with PR #34; temporary closures, local expiry, shared current-state display/API and recoverable commands. Authenticated live acceptance remains separate.
- [Address corrections and wayfinding](docs/dispatches/dispatch-23-address-wayfinding.md): PR #34 is published; controlled postal/suite changes, public customer directions, explicit optional clears and matching API/import/export behavior. Settings → Directory API includes clickable documentation.

- [Published request review safeguards](docs/dispatches/dispatch-20-request-review-integrity.md): PR #30 is live. Submitted history is protected, review success waits for confirmation, failed/uncertain review requires saved-state reload, and changing request target/category resets its draft. District Manager work contact requires a separate v3 grant as documented in Dispatch 25; it is not a v1/v2 field.

- [Published hierarchy UX and release record](docs/dispatches/dispatch-19-hierarchy-registry-ux.md): PR #28 is live. Region means Territory; District-owned DM settings, browse-first registry and read-only retail store DM. Existing assignments remain unchanged by the release; legacy District setup and broader migration remain separate.

- [Current implementation plan and AI handoff](docs/plans/directory-consistency-plan.md): deployed source, completed slices, remaining tasks and decision boundaries. [Dispatch 18](docs/dispatches/dispatch-18-district-dm-handover.md) records the opt-in District-wide DM release. Current data is owner-reported test-affected; leave the testing DM unchanged and do not infer a restore source or run historical destructive loaders. Request validation/recovery is published through PR #32; status and address follow-on release checkpoints are in dispatches 22–23. Broader hierarchy/offboarding work is not complete.
- [API reference](API.md): endpoints, authentication, filters, pagination, and responses.
- [Personnel/staffing v2 guide](docs/personnel-staffing-api.md) and [shareable OpenAPI](docs/personnel-staffing-openapi.json): scoped, contact-free full snapshots of persisted assignments. First-release review status: [dispatch 14](docs/dispatches/dispatch-14-personnel-staffing-api.md).
- [Response schema](docs/api-response-schema.md): the fields the API returns and what their values mean.
- [App blueprint for Directory data](docs/app-blueprint-directory-api.md): how a consuming app such as ROPI should store and synchronize store information.
- [Location inbox implementation and acceptance evidence](docs/dispatches/dispatch-13-location-inbox-email.md).
- [Deployment and rollback runbook](docs/cloud-run-deployment-runbook.md).

A **schema** describes the available fields and their types. An **API endpoint** is an address an app calls to read or change information. `locationInboxEmail` is an optional shared contact address for a Location; it is separate from a Person's work email and a User's sign-in email. The read API returns an address or `null` when there is no usable inbox.

Current application release: `1b122fe`, Ready revision `shiekh-location-company-directory-pr45-1b122fe` at sole 100%; [exact release evidence](docs/cloud-run-deployment-runbook.md#current-live-revision--pr-45). Explicit legacy-individual mapping is published, retaining optional individual contact, SM/AM inbox responsibility/write guards, v3 leadership and shared-mailbox withholding. API fields/scopes and existing approved Shiekh-Intel grants/token are unchanged; authenticated consumer acceptance remains pending. Next: read-only promotion/offboarding dependency preflight before coordinated writers. Broader taxonomy migration, acting/Region ownership and full handover/offboarding remain unfinished. No staff data restoration, live contact mapping or access mutation occurred in the release.

## Development

Use the existing Firebase and server configuration described in `.env.example`. Keep local environment files and credentials out of Git.

```sh
npm ci
npm run dev
```

The production build uses `npm run build`; the server starts with `npm start`. Firebase browser configuration must be present at build time. See the runbook before deploying.

## Verification

```sh
npm run lint
npm run test:api
npm run build
```

Browser fixtures are in `test/auth.browser.spec.ts`. Run the inbox cases against a configured local development server with `npx playwright test test/auth.browser.spec.ts --grep "Location inbox" --workers=1`. The tests mock authentication and data APIs and block external HTTPS requests; they do not save production records or send email. `AUTH_BROWSER_TEST_ORIGIN` defaults to `http://127.0.0.1:3001`.

For personnel/staffing UI verification, use `--grep "Staffing parity|Personnel scopes UI"` against the same synthetic local harness. The expanded acceptance command and actual results are recorded in [dispatch 14](docs/dispatches/dispatch-14-personnel-staffing-api.md). Preserve the existing public Firebase project/domain expected by the configuration guard while using synthetic key/app ID and mocked SDK; do not change authentication policy to make fixtures pass.

ROPI's consumer application is maintained outside this repository. Its synchronization and notification implementation still belongs in that application.

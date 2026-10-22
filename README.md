# Shiekh Directory

Store operations and personnel directory. The live application is at [shiekh-dir.ai.studio](https://shiekh-dir.ai.studio).

## Documentation

- [Person card and linked positions](docs/dispatches/dispatch-24-person-card-linked-positions.md): active bounded implementation and acceptance limits; explicitly selected concurrent positions, dependency preview and changed-field-only saves. Not published until its release checkpoint is recorded. DM API business contacts are separate issue 36/P6.9.

- [Request validation and submission recovery](docs/dispatches/dispatch-21-request-validation-recovery.md): PR #32 is live; exact validation/replay/cancellation contract and acceptance limits.
- [Immediate operating state](docs/dispatches/dispatch-22-immediate-operating-state.md): PR #33 is published with PR #34; temporary closures, local expiry, shared current-state display/API and recoverable commands. Authenticated live acceptance remains separate.
- [Address corrections and wayfinding](docs/dispatches/dispatch-23-address-wayfinding.md): PR #34 is published; controlled postal/suite changes, public customer directions, explicit optional clears and matching API/import/export behavior. Settings → Directory API includes clickable documentation.

- [Published request review safeguards](docs/dispatches/dispatch-20-request-review-integrity.md): PR #30 is live. Submitted history is protected, review success waits for confirmation, failed/uncertain review requires saved-state reload, and changing request target/category resets its draft. Lower-priority District Manager work-email API planning is P6.9; email is not part of the current API contract.

- [Published hierarchy UX and release record](docs/dispatches/dispatch-19-hierarchy-registry-ux.md): PR #28 is live. Region means Territory; District-owned DM settings, browse-first registry and read-only retail store DM. Existing assignments remain unchanged by the release; legacy District setup and broader migration remain separate.

- [Current implementation plan and AI handoff](docs/plans/directory-consistency-plan.md): deployed source, completed slices, remaining tasks and decision boundaries. [Dispatch 18](docs/dispatches/dispatch-18-district-dm-handover.md) records the opt-in District-wide DM release. Current data is owner-reported test-affected; leave the testing DM unchanged and do not infer a restore source or run historical destructive loaders. Request validation/recovery is published through PR #32; status and address follow-on release checkpoints are in dispatches 22–23. Broader hierarchy/offboarding work is not complete.
- [API reference](API.md): endpoints, authentication, filters, pagination, and responses.
- [Personnel/staffing v2 guide](docs/personnel-staffing-api.md) and [shareable OpenAPI](docs/personnel-staffing-openapi.json): scoped, contact-free full snapshots of persisted assignments. First-release review status: [dispatch 14](docs/dispatches/dispatch-14-personnel-staffing-api.md).
- [Response schema](docs/api-response-schema.md): the fields the API returns and what their values mean.
- [App blueprint for Directory data](docs/app-blueprint-directory-api.md): how a consuming app such as ROPI should store and synchronize store information.
- [Location inbox implementation and acceptance evidence](docs/dispatches/dispatch-13-location-inbox-email.md).
- [Deployment and rollback runbook](docs/cloud-run-deployment-runbook.md).

A **schema** describes the available fields and their types. An **API endpoint** is an address an app calls to read or change information. `locationInboxEmail` is an optional shared contact address for a Location; it is separate from a Person's work email and a User's sign-in email. The read API returns an address or `null` when there is no usable inbox.

Current application release: `27c3536`, Ready revision `shiekh-location-company-directory-pr34-27c3536` at 100%; [exact source/build/validation evidence](docs/cloud-run-deployment-runbook.md#current-live-revision--pr-33-and-pr-34). Next unfinished priority: full Person-card audit, controlled linked positions and guided promotion responsibilities (plan P2.7–P2.9/P3.7–P3.8). A descriptive title is not a canonical District assignment or account permission. No live staffing/data restoration was performed; DM work-email API access remains lower priority/planned.

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

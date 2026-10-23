# Shiekh Directory

Latest source-only continuation: [client transition recovery helpers](docs/dispatches/dispatch-35-client-transition-recovery.md) are tested but unimported; no new save workflow or production release is enabled. Use the published-source checkpoint below for what is actually live.

Store operations and personnel directory. The live application is at [shiekh-dir.ai.studio](https://shiekh-dir.ai.studio).

## Documentation

- [Positions and assignments: agreed rules](docs/plans/positions-and-assignments-rules.md): organization IDs, explicit multi-position eligibility, separate assignment/access and rules-first/data-later sequence. [Dispatch 32](docs/dispatches/dispatch-32-explicit-assignment-rules.md) records PR #53, published source `62acacb` at sole 100% with completed clean reviews. [Dispatch 33](docs/dispatches/dispatch-33-signed-transition-preview.md) records merged, unpublished PR #55 read-only command preview; [Dispatch 34](docs/dispatches/dispatch-34-person-transition-recovery.md) adds unwired metadata recovery helpers. Signing configuration, client recovery, staffing writer and removal UI remain gated. Data cleanup/restore is deferred.

- [Published promotion/offboarding dependency preflight](docs/dispatches/dispatch-28-person-transition-preflight.md): PR #47 adds read-only canonical/stale assignment, workplace/support, account and Pending-correction review. It neither clears someone for inactivation nor changes staff/access.

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
- [Published server transition-preview contract](docs/dispatches/dispatch-29-server-transition-preview.md): P3.1 bounded read, validation, release evidence and future writer boundaries. No consumer API grant or staffing/access change.
- [Person transition command contract](docs/plans/person-transition-command-contract.md): controlled promotion/assignment/inactivation, strict ownership, separate account blockers and durable recovery. [Dispatch 31](docs/dispatches/dispatch-31-person-transition-dry-run-planner.md) implements the unused pure dry-run planner and synthetic tests only; no command route, signing key, writer or new UI is enabled. [Dispatch 30](docs/dispatches/dispatch-30-person-transition-command-contract.md) preserves the design checkpoint.
- [Personnel/staffing v2 guide](docs/personnel-staffing-api.md) and [shareable OpenAPI](docs/personnel-staffing-openapi.json): scoped, contact-free full snapshots of persisted assignments. First-release review status: [dispatch 14](docs/dispatches/dispatch-14-personnel-staffing-api.md).
- [Response schema](docs/api-response-schema.md): the fields the API returns and what their values mean.
- [App blueprint for Directory data](docs/app-blueprint-directory-api.md): how a consuming app such as ROPI should store and synchronize store information.
- [Location inbox implementation and acceptance evidence](docs/dispatches/dispatch-13-location-inbox-email.md).
- [Deployment and rollback runbook](docs/cloud-run-deployment-runbook.md).

A **schema** describes the available fields and their types. An **API endpoint** is an address an app calls to read or change information. `locationInboxEmail` is an optional shared contact address for a Location; it is separate from a Person's work email and a User's sign-in email. The read API returns an address or `null` when there is no usable inbox.

Current application release: `29020a2`, Ready revision `shiekh-location-company-directory-pr49-29020a2`, sole 100%; [exact release evidence](docs/cloud-run-deployment-runbook.md#current-live-revision--pr-49). Explicit server-backed dependency refresh is published alongside the loaded-data report. Both hosts/45 assets/all four consumer documents/access/cache checks passed; configuration/identities/grants are preserved. Latest security review is clean; optional latest code review remained running and CodeRabbit rate-limited, not final approvals. Next: coordinated-command contract before a writer. Region/acting/full offboarding/migration and consumer acceptance remain unfinished; no real staffing/access change or restore.

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

# Shiekh Directory

Store operations and personnel directory. The live application is at [shiekh-dir.ai.studio](https://shiekh-dir.ai.studio).

## Documentation

- [API reference](API.md): endpoints, authentication, filters, pagination, and responses.
- [Personnel/staffing v2 guide](docs/personnel-staffing-api.md) and [shareable OpenAPI](docs/personnel-staffing-openapi.json): scoped, contact-free full snapshots of persisted assignments. First-release review status: [dispatch 14](docs/dispatches/dispatch-14-personnel-staffing-api.md).
- [Response schema](docs/api-response-schema.md): the fields the API returns and what their values mean.
- [App blueprint for Directory data](docs/app-blueprint-directory-api.md): how a consuming app such as ROPI should store and synchronize store information.
- [Location inbox implementation and acceptance evidence](docs/dispatches/dispatch-13-location-inbox-email.md).
- [Deployment and rollback runbook](docs/cloud-run-deployment-runbook.md).

A **schema** describes the available fields and their types. An **API endpoint** is an address an app calls to read or change information. `locationInboxEmail` is an optional shared contact address for a Location; it is separate from a Person's work email and a User's sign-in email. The read API returns an address or `null` when there is no usable inbox.

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

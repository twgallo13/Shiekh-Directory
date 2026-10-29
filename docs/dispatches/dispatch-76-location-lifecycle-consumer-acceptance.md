# Dispatch 76 — Lifecycle consumer and import compatibility acceptance

## Scope and result

Two new native SDK scenarios exercise the existing lifecycle service, real Firestore repositories and real v1/v2/v3 HTTP routers together against the isolated loopback emulator. Both passed with no failures or skips. This is additional integration coverage, not an application behavior/schema change or production acceptance. It does not connect to LP, Dynamic QR, real consumer credentials, production data or cloud services.

The earlier runtime discovery misses are resolved. The existing Java21 runtime and Firestore emulator jar were found under the workspace's `outputs/transition-emulator/` folder and successfully started on `127.0.0.1:8089`. No installation, new account, permission or owner intervention was needed. A direct SDK capability probe also confirmed this emulator preserves historical `readTime` values across writes, rather than silently returning only the latest record. The committed tests verify that property through actual consumer API requests as well.

## Native acceptance covered

- A staffed retail store converts to non-retail only through explicit staffing release. Public location ID/store number (including leading zeros), shared location inbox, business details and existing response contract remain available. The legacy optional `district` display string may become an empty string; it is an existing optional public field, not a new schema. Private phone/contact/notes, internal ownership marker, operation/hash/account fields remain excluded.
- Fresh v2 staffing and v3 Location–District joins reflect cleared local staffing/hierarchy. Previously issued v2/v3 snapshots still show the pre-conversion staffing/hierarchy. People/workplace records and canonical District Primary/contact responses remain unchanged.
- Corporate becomes retail in the selected managed District/Region; both Primary copies inherit from the canonical owners, with vacant Store Manager. The Person's Corporate workplace link keeps the same permanent Location ID. A v1 pagination cursor issued before conversion continues at its original watermark and returns the original Corporate type, while fresh reads return the converted state.
- Ordinary retirement excludes the location from v1 active results but preserves the explicit retired record in v2/v3 full datasets. Reviewed hard removal omits it from fresh complete, one-row-per-page reconciliations; detail requests return404. Earlier v2/v3 snapshots still return that retired record. Other Locations, People and canonical District managers remain available. No downstream app-owned record is deleted or reassigned.
- Synthetic location-only credentials remain unable to enter restricted v2/v3 snapshots. The separate synthetic contact-enabled consumer receives only its existing authorized contact shape. Credential/grant objects remain unchanged throughout. This validates router policy with synthetic authentication, not real API tokens.
- A previously prepared proposal from a disconnected CSV preview cannot recreate an ID removed before confirmation. Both the independent CSV confirm transaction and generic writer reject the reservation, leaving the tombstone intact and creating no Location, import receipt or extra audit. Ordinary CSV preview also blocks crossing a lifecycle-owned non-retail Location back to retail outside the reviewed workflow.

The executable is `test/locationLifecycleConsumers.emulator.ts`, exposed through `npm run test:location-lifecycle-consumers-emulator`. It refuses to run unless `FIRESTORE_EMULATOR_HOST` is exactly `127.0.0.1:8089`, uses a demo project and unique named synthetic databases, and listens only on loopback. Source records and credential strings are synthetic.

## Validation boundaries

The two completed native cases include complete consumer pagination, conversion in both directions, retirement/removal, historical snapshots and alternate-writer protections; they are not two superficial field-presence checks. An initial test expectation incorrectly treated presence of the existing optional `district` string as a new schema change; correcting that expectation required no runtime change. Final native cases passed after all assertions were added. Type check passed for the new test source.

PR104 repaired source `b766c404fc947afbc5e34588d45449736558a231` independently passed code/security review without findings. Its 1,003-test pre-repair baseline, 28 affected tests, final type/build and browser regressions remain applicable. This test/docs/package-script slice changes no application source, so those ordinary tests and application build are reused rather than repeated. The new slice still needs independent current-head review. Existing CodeRabbit settings/spending are unchanged; its non-default-base skip is not approval.

## Remaining gates and next work

This narrows the local consumer/import compatibility gap; it does not complete the entire release matrix. Real consumer credential/access acceptance, separately owned cross-app repair/replacement-permission checks, complete migration/activation preview, signing and dedicated-runtime/access/security gates, isolated release/rollback preparation, exact serving-source and production acceptance, and saved closeout remain. Validate existing evidence and current state before repeating earlier successful checks. No owner decision is required merely to locate or run the existing local tools.

No merge, deployment, activation, production/business-data change, authority/credential/grant expansion, consumer schema change, LP/Dynamic QR work or data restoration occurred. Do not deploy main wholesale. After removal activation, rollback must preserve **both generic and CSV permanent-ID guards**; restoration must reconcile reserved IDs separately.

# Directory client-access policy

`directory.firestore.rules` is the proposed server-only client policy for the Directory's **one named database**. Application authorization remains in the authenticated server/API. Firebase authentication still signs users in; that does not authorize direct Firestore client access. Existing server SDK/IAM permissions are separate and must be preserved.

## Scope and release gate

The owner approved a Directory-only protection repair after compatibility checks. This file's presence or merge does **not** deploy it, change IAM, or enable the staffing workflow. Do not add a project-wide/default-database Firebase deployment configuration. Do not apply this file to Dynamic QR, another database, or every database in the shared project.

Before activating:

1. Verify both deployed and proposed Directory browser builds use server/API data access, inventory older services/direct consumers of the named database, and check authorized server/API compatibility. Missing audit events or absent Data Access audit configuration do not prove absence of clients. Resolve any identified incompatible consumer before changing protection.
2. Privately capture the exact named release, immutable prior ruleset/source, service/runtime identity and other release references. Do not publish active protection weaknesses, credentials, business records or private configuration in issues/PRs.
3. Run the local policy test below. Preserve existing successful application validation; do not treat an Admin SDK success as proof of client denial or production IAM. Review the exact proposed source.
4. Re-read the active named release immediately before applying, abort on drift, and update **only** `projects/gen-lang-client-0801664258/releases/cloud.firestore/ai-studio-shiekhlocationco-00e1a479-af25-4ab6-9565-5c8b804c56a4`. Do not change default/other releases, server IAM, accounts, provider settings, tokens or data.
5. Read back the active source/hash and compare all other release references unchanged. Verify live direct-client denial read-only and authenticated server/app reads. Never probe production writes, even with invented test records. Emulator assertions cover write denial; live acceptance must not alter staff/audit/receipt records.
6. Keep staffing gates off until protection, index/query acceptance, the separately approved one-secret/server-identity setup, and guarded application release checks pass. Record source-merged, policy-applied and application-deployed checkpoints separately.

Rollback is not automatic: restoring permissive client access would weaken protection. Prefer forward repair; stop admission/traffic if required and seek owner direction for any protection-weakening rollback. Retain the immutable prior policy privately for investigation, not as unconditional restore authority.

## Local acceptance

Use an isolated Firestore emulator at **127.0.0.1:8089**, with multiple demo projects supported (`--single_project_mode=false`, not the atomic suite's single-project-error configuration). Set `FIRESTORE_EMULATOR_HOST` to that exact address, then run `npm run test:rules-emulator`. Every run generates its own `demo-dir-rules-<random>` project, isolating both policy and records, and clears only that project's synthetic records in cleanup. No production project, credentials, import, export or migration is used. The test deliberately sits outside the ordinary `*.test.ts` suite, rejects other emulator targets before SDK setup, and must not run against cloud resources. Do not run shared emulator suites concurrently or change another operator's emulator configuration.

The test loads this policy using Firebase's official testing library into the demo project's default emulator database. It covers all 14 current Directory collections plus transition operations, API clients/tokens, request/import receipts, system, a future collection and nested documents: 22 paths × anonymous/ordinary/synthetic-admin clients × get/list/create/update/delete = **330 permission-denied assertions**. It then verifies server SDK reads/updates still work on synthetic data. This tests policy semantics, **not** named production release selection, real Firebase sign-in, production IAM, all external consumers, or end-to-end application behavior. Those remain distinct release gates.

References: [Rules structure/server SDK distinction](https://firebase.google.com/docs/firestore/security/rules-structure), [named release management](https://firebase.google.com/docs/rules/manage-deploy), [official local Rules tests](https://firebase.google.com/docs/rules/unit-tests).

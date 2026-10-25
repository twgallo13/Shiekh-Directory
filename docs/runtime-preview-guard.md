# Offline runtime preview guard

This read-only helper checks supplied Cloud Run v1 JSON snapshots for the current dedicated-identity **private-preview** stage. It does not fetch credentials, contact Google, modify resources, accept a rollout, or run from the application server.

Run from the repository with existing dependencies:

```sh
node --import tsx scripts/runtimePreviewGuard.ts path/to/private-snapshot-bundle.json
```

Keep the bundle outside the repository with owner-only permissions. Environment values, IAM members and deployment configuration may be private. The command emits only fixed error codes/limitations, never input values, paths or parse-error contents. Input is limited to 10 MiB. Exit0 means the mechanical checks passed; exit1 means blocked/unreadable evidence. `releaseAuthorized` is **always false**.

The bundle must contain these independently collected snapshots:

- `productionBefore` and `productionAfter`: complete Cloud Run v1 Service resources for the Directory production service, including generation, observedGeneration, spec and observed traffic. All three service snapshots must include the `cloud.googleapis.com/location` metadata label set to `us-west1`; missing/wrong region evidence blocks the check.
- `productionIamBefore` and `productionIamAfter`: production service IAM policies, including etags; these must be exactly unchanged.
- `candidate`: complete v1 Service resource for the separate Directory runtime preview. It must be observed Ready, with its newest ready revision actually receiving its sole100% traffic, the dedicated identity, the same pinned image/runtime configuration, and min0/max1.
- `candidateIamPolicy` and `projectIamPolicy`: current full policies with etags. Public principals, malformed member lists, missing policy evidence and disabled/unknown invoker IAM checks block this stage. This is not an effective-permission or group/ancestor-policy analysis.
- `candidateDomainMappings`: an empty result from a complete inventory filtered to mappings targeting the preview. Do not manufacture an empty list when the read failed or pagination is incomplete.

The helper preserves production spec/traffic and template security/network annotations, permits only the documented preview identity/capacity/client-metadata differences, and rejects workflow flags unless absent or explicitly false. It intentionally targets this project's existing preview; it is not a general deployment or rollback tool.

## Remaining human and operational gates

Snapshot freshness, complete pagination and trustworthy provenance remain the operator's responsibility. A fabricated bundle can pass offline shape comparisons. This does not prove anonymous HTTP denial, app/Firebase signed-in behavior, consumer credentials, secret contents, application write/invitation flows, cross-app claim safety or reverse isolation from shared privileges. Reuse applicable validation recorded in [Dispatch42](dispatches/dispatch-42-private-runtime-preview.md); do not repeat it unnecessarily.

The Welcome Gift/Dynamic QR repair is owned by the separate app agent. Preserve the current production/cutover hold until that repair and the remaining user/consumer/replacement-permission gates are verified. Never use this helper's success to grant permissions, switch traffic or activate signing/staffing workflows automatically.

Tests: `node --import tsx --test test/runtimePreviewGuard.test.ts`. Fixtures are synthetic; no cloud reads/writes occur. No application rebuild is required for this standalone tool.

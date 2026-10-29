# Dispatch 74 — Lifecycle browser recovery controller

## Delivered source foundation

The browser controller owns a separate actor-scoped lifecycle operation marker and non-waiting tab lease. Storage contains only schema/operation identity under an actor namespace, never Location/staff drafts, contacts, reason, token, review hash or server source. Routine legacy-cache cleanup preserves the marker alongside the other operation families; explicit sign-out clears protected markers under the established privacy policy.

Review first performs a read-only dependency preview. A blocked preview remains available in memory for explanation, with no durable marker or prepare request, and can be cleared when choices change. A ready preview proceeds only after persisting/verifying the operation marker, then displays the current server-prepared review. The final confirmation never mutates that intent or automatically retries.

Unknown, missing or merely prepared outcomes retain the original identity and require recovery/cancellation before new work. An exact actor-bound lifecycle audit identity and strict saved Directory refresh are required before confirmed success clears its marker. Cancellation likewise refreshes saved records before draft reapplication; failed refresh keeps the terminal identity. Reopening checks the original status rather than creating a replacement. A storage write that succeeded before throwing is adopted into recovery if readable.

Session/access changes clear protected controller data and fence late replies. Mount cancellation/disposal aborts transport and releases/ignores a late tab lease, including startup cancellation. Duplicate commands and a second tab cannot overwrite the marker. Other operation namespaces remain independent. Source versions/native bindings remain the server's authority; the tab lease does not claim cross-device serialization.

This slice adds the state/recovery foundation only. It does **not** add the mounted conversion/removal form, dependency/review screen, registry/store entry point, visual polish or actual browser acceptance. Those are the next UI slice; their close/discard and retained-choice behavior must use the same cancellation/refresh safeguards. All activation controls remain off.

## Evidence

- Twenty-three lifecycle controller cases passed; affected shared/creation/move controller run passed 53 cases. Tests cover interrupted preparation, missing receipts, actor-bound audit validation, duplicate commit, refresh failure, actor/session loss, independent leases/namespaces, blocked preview, partial storage write, late mount grant and cache/sign-out behavior.
- Real controller → strict client → HTTP → Store → SDK scenario passed: lost commit reply leaves one original marker; close/reopen does not send another commit; failed strict refresh retains it; later successful refresh clears it. A subsequent reviewed removal clears its marker only after the strict refreshed Directory actually omits that Location. The permanent ID reservation remains.
- Final ordinary suite: **998 passed**, no failures/skips; type check and release build passed. Existing bundle-size advisory remains. Native test uses synthetic auth/provider, in-memory browser storage/locks and the isolated local SDK database; no production/browser visual acceptance is claimed.
- PR102 exact source `7eb2738190468cb398f5b46aac493a6f01619108` independently completed code/security review without findings. This new controller requires its own current-head reviews.

## Release boundary

No merge, deployment, feature activation, public schema/grant changes, other-app work, authority/credential expansion or data restoration. Explicit UI/recovery review, wider alternate-writer/import/consumer acceptance and every existing isolated migration/security/access/signing/runtime/release/rollback/production-acceptance/closeout gate remain. A rollback after removals must keep both generic and CSV ID-reservation guards. Do not deploy main wholesale.

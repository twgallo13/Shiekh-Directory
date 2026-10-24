# Dispatch 42 — Private runtime compatibility preview

October 24, 2026 Pacific. Continuation of [Dispatch41](dispatch-41-directory-protection-checkpoint.md).

## Purpose and deployment boundary

The owner approved proceeding with a private compatibility test under the dedicated Directory runtime account. Created a separate IAM-protected preview from the exact pinned image currently serving PR53, not from newer source. It has no live-domain mapping or production traffic, retains the existing container configuration and secret references, and uses the approved dedicated identity. Preview capacity is bounded to zero minimum/one maximum instance. The private request and original production metadata are retained outside the repository.

No public invoker grant or disabled IAM check was copied. Read-back found neither anonymous nor all-authenticated-user service grants; an anonymous health request returned403. Existing-authority Google Cloud developer authentication reached the preview without a new invoker or impersonation grant. Cloud authorization is not a Directory/Firebase user session.

## Completed app boot and read-only HTTP checks

- Preview Ready/configuration/routes conditions passed, including startup with the existing secret references under the new identity.
- Cloud-authorized health returned200/`status: ok`; root HTML returned200 and matched the published production HTML exactly. Its two referenced app assets loaded with non-HTML MIME content. The pinned image/container equality and unchanged previous asset evidence were reused; the full asset/build suite was not repeated.
- Missing Directory/Firebase credentials were rejected401 at `/api/auth/me`, `/api/directory/operating/directory`, `/api/v1/locations` and `/api/v3/district-leadership`.
- Unknown API route returned404. Both served OpenAPI documents returned200 and parsed with their expected OpenAPI marker.
- An initial check used nonexistent `/api/directory/locations` and stopped at its route mismatch after successful startup/health/root/auth-denial checks. Source inspection identified the correct operating-directory path; only the remaining route checks and necessary HTML/asset comparison continued. No application repair or security bypass was needed. Private HTTP receipt records eight completed continuation checks; earlier health/root/auth checks are distinct, not another full test run.

## Acceptance limits and next gates

Additional distinct actual-identity SDK checks passed in one execution of the existing unscheduled diagnostic Job, using the same pinned image/libraries and dedicated account: managed-credential Firestore user query on a random nonexistent UID returned empty, a read-only transaction on a random nonexistent Location returned absent, and Firebase Admin `getUser` returned the expected user-not-found result. These tests did not repeat the prior REST permission suite and performed no writes. The final production comparison matched the complete service spec and every traffic entry against the pre-preview baseline; private SDK/final comparison receipts are retained.

These are boot, configuration and fail-closed/read-only HTTP checks, not authenticated Directory-user or consumer-token acceptance. No real Person, Location, staffing, account, API client or mail record was saved; no user invitation or email was sent. No API token was retrieved/rotated, OAuth domain changed, shared role removed, or signing key provisioned. The preview still points to the existing data backend, so it is not a disposable business-data sandbox and must not be used for write testing.

Reuse existing synthetic save/invitation/transition validation where source remains unchanged. Bounded boot/HTTP/SDK acceptance above is complete; signed-in UI/consumer continuity, coordinated other-app permission replacements and effective reverse-access isolation remain separate. Do not switch production or enable staffing commands from this bounded evidence alone.

Other-app reports remain tracked in [Dynamic QR153](https://github.com/twgallo13/Dynamic-Qr/issues/153), [Welcome Gift47](https://github.com/twgallo13/Welcome-Gift/issues/47) and [LP-Intel31](https://github.com/twgallo13/shiekh-lp-intelligence/issues/31); no comments were present at this continuation's initial check. Casting remains untouched; its repository has not been identified. Do not repeatedly poll unchanged issues or revoke shared access before the affected workflows have tested replacements.

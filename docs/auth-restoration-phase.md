# Authentication Restoration Phase

## Outcome and Boundaries

Implemented shared application authentication, authenticated-only directory bootstrapping, account/profile navigation, and one server-owned role authority for both the directory and diagnostic mail. Existing uncommitted Directory API and secure-mail work was preserved. No commit, push, deployment, cloud-configuration change, Firebase user/claim write, Firestore write, or real email occurred.

Location data is still the existing local application seed plus browser-local drafts. The seed is now served after authorization instead of being included in public client assets. No canonical Firestore generation was selected or migrated. Location editing, relationships, hours-template provenance, printing, routing, and the read-only Directory API remain on their existing paths. Signing out removes protected browser-local drafts; it retains the appearance preference.

## Architecture

- One Firebase browser app/Auth instance, pinned project and environment-provided approved web configuration; Firebase tab-session persistence, with no ID tokens or application roles in localStorage.
- Firebase restoration and server authorization must complete before protected components mount. A separate authorized bootstrap fetch gates directory seed access.
- `GET /api/auth/me` verifies revoked/expired/forged/wrong-project tokens through Firebase Admin, reads the fresh Firebase user, and resolves Active role/scope/person linkage through the named Firestore `users` collection.
- Unique `firebaseUid` is preferred. Verified, identical Firebase/token email may fall back only to one exact record with no conflicting UID. Missing or duplicate mappings fail closed. Custom claims are deliberately ignored for application permissions.
- Role/status are validated against exact supported values. `accessScope` is server-owned opaque metadata in this phase; it does not grant Editor direct-write capability. Server-side directory mutation/scope enforcement remains part of the later persistence phase because no such writes are implemented here.
- The same authority instance serves `/api/auth/me`, `/api/auth/bootstrap`, and mail. Only Administrator and Steward may use diagnostic mail. SMTP transport, recipient allowlist, fixed template, validation, audit redaction, and limits remain intact.
- Password reset and passwordless email links use official Firebase APIs. Continue URLs are exact allowlisted same-origin paths. Action codes are held in memory, scrubbed from the address bar, and never written by the application to storage. Email confirmation is required when completing a link.
- My Profile shows identity, verification, server role/scope, linked local People record or an explicit unavailable state, authentication provider, and theme. Firebase's `password` provider does not distinguish password from email-link authentication; the display does not invent that distinction.
- Sign-out clears the protected shell and local drafts before returning to sign-in. Late authorization results cannot restore a signed-out session. Failed sign-out leaves a locked retry path. Account provisioning, role edits, and invitations are disabled rather than simulated.
- Background checks run on focus/visibility, token change, and each visible minute; every privileged server request resolves current access again. This cannot recall already downloaded records or substitute for production device/data controls.

## Read-Only Live Findings

Target project: `gen-lang-client-0801664258`.

Named database: `ai-studio-shiekhlocationco-00e1a479-af25-4ab6-9565-5c8b804c56a4`. No `(default)` database access was used.

Provider inspection:

- Google enabled.
- Email/password enabled.
- `signIn.email.passwordRequired=true`: passwordless email-link sign-in is currently blocked. The application flow is implemented and mock-tested; changing this setting requires separate approval.
- 49 authorized domains reported; `localhost` is absent. Local tests intercept Firebase and do not require domain enablement.
- Approved web-app configuration and the actual rollout origin still need owner validation. No real interactive provider sign-in or reset/link email was attempted.

Masked user schema inspection:

- 12 documents: 11 Active, one Invited.
- Roles: five System Administrator, three Directory Data Steward, two Editor, two Viewer.
- `email`, `role`, `status`, `accessScope` are strings on all 12 records.
- Three records have `firebaseUid`; six have `personId`. Document IDs are not Firebase UIDs.
- Six duplicate email groups, each containing two records. One group disagrees on role; another disagrees on status.
- One duplicate UID group contains two records; only one UID linkage is unique.
- No identities, emails, document IDs, or scope values were printed or written into this report. No conflicting record was selected, changed, or deleted.

The duplicate Firestore location generations remain unresolved; live Directory API guards still return `409 location_conflict`.

## Verification

- `npm run test:api`: 56 passed, 0 failed, 3 suites, including new shared-auth, endpoint, client-boundary, rendered-gate/profile, storage-cleanup, and mail-authority tests.
- `npx playwright test test/auth.browser.spec.ts --workers=1 --reporter=line --output=/tmp/shiekh-auth-browser-results`: 8 passed. Synthetic Firebase SDK and HTTP boundaries; all nonlocal HTTPS requests blocked and mail intercepted without delivery.
- Browser coverage: loading/deep routes, Google and password success, invalid password, password reset, email-link send/completion, unsafe redirect rejection, profile/theme, mobile/desktop overflow, Viewer admin denial, later access denial, sign-out success/failure, and shared mail-session UI. Screenshots were reviewed at 390x844 and 1440x1000.
- `npm run lint`: passed.
- `npm run build`: passed; the protected seed is absent from the client import graph. Production serves only client assets, never its server bundle or source map.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: passed.
- Editor diagnostics: no errors.
- Gitleaks 8.24.3 scanned all tracked/untracked non-ignored worktree files with redacted output: no leaks after removing one legacy credential-shaped SMTP placeholder. `.gitleaks.toml` excludes only two exact synthetic test-token values and one exact non-secret storage-key string; no files/directories are excluded. This is a current-worktree scan, not a history audit or proof that a formerly committed placeholder was never used. An owner should assess historical rotation needs without restoring or printing the value.
- `node --import tsx test/liveApiCheck.ts` and the same command with `--default-env`: passed. Account/seed/mail deny missing and Directory API tokens; private seed, reference CSV, server bundle/source map are not served; duplicate locations deny access; masked snapshot paging remains consistent. These checks make no delivery or write requests that can succeed.

## Files Changed in This Phase

- Configuration/tooling: `.env.example`, `.gitleaks.toml`, `index.html`, `package.json`, `package-lock.json`.
- Server: `server.ts`, `server/authAuthority.ts`, `server/directorySeed.ts`, `server/firebaseMailAuth.ts`, `server/mailApi.ts`.
- App/context: `src/App.tsx`, `src/types.ts`, `src/context/AuthContext.tsx`, `src/context/ThemeContext.tsx`, `src/context/DirectoryContext.tsx`.
- Client helpers: `src/lib/authClient.ts`, `src/lib/authSession.ts`, `src/lib/directorySeed.ts`, `src/lib/defaultHours.ts`, `src/lib/mailClient.ts`, `src/lib/navigation.ts`.
- Auth UI: `src/components/auth/AuthGate.tsx`, `SignInView.tsx`, `AccountView.tsx`, `DirectoryBootstrap.tsx` in that directory.
- Existing UI: `src/components/layout/Header.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/admin/SecureMailPanel.tsx`, `src/components/admin/AdminIntegrationsView.tsx`, `src/components/requests/NewRequestModal.tsx`.
- Seed boundary: `src/data/initialData.ts` (removed credential-shaped placeholder and moved the reusable hours constant; record arrays unchanged).
- Tests: `test/authApi.test.ts`, `test/authAuthority.test.ts`, `test/authClient.test.ts`, `test/authViews.test.ts`, `test/auth.browser.spec.ts`, `test/firebaseMailAuth.test.ts`, `test/liveApiCheck.ts`.
- Documentation: `API.md`, this report. Other worktree changes belong to the preceding session and were retained.

## Browser Test Reproduction

Install Chromium with `npx playwright install chromium`. Start an isolated development server on a free port, with SMTP disabled and synthetic web configuration:

```sh
PORT=3001 SMTP_PASSWORD= VITE_FIREBASE_API_KEY=test-key VITE_FIREBASE_APP_ID=test-app VITE_FIREBASE_PROJECT_ID=gen-lang-client-0801664258 VITE_FIREBASE_AUTH_DOMAIN=gen-lang-client-0801664258.firebaseapp.com VITE_AUTH_ALLOWED_ORIGINS=http://127.0.0.1:3001 npm run dev
```

Then run the Playwright command above. These settings are test placeholders only, not real provider credentials. Use `AUTH_BROWSER_TEST_ORIGIN` to override the origin alongside matching server configuration. Do not use real identities or click real mail-dispatch/reset/link actions during verification.

## Remaining Work

1. Have the access owner reconcile duplicate users and establish unique Firebase UID links, resolving role/status/scope and People-link disagreements under an approved write plan.
2. Approve and validate web-app settings, production/staging origins, email-link provider configuration, runtime Auth/read permissions, and environment separation. Confirm representative Viewer, Editor, Steward, and Administrator accounts in an approved staging environment.
3. Build server-owned secure invitations: issuance, expiry, single use, hashed tokens, acceptance, resend/revocation, account linking, least privilege, audit, and approved notification delivery. None is implemented here.
4. Resolve duplicate location generations and separately approve authoritative persistence, scope-aware mutations, audit history, backups, recovery, migration, and rollback. Do not enable direct browser Firestore writes.
5. Plan production rollout with Secret Manager-backed secrets, shared multi-instance rate limits/trusted proxy policy, MFA where appropriate, a no-traffic/canary revision, rollback, an explicitly approved real-delivery test, and controlled traffic promotion. No rollout action was taken.
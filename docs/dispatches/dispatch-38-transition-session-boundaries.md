# Dispatch 38 — synchronous authentication boundaries

October 23, 2026 Pacific. Source phase; no deployment, signing secret, IAM binding, command route or staffing change. Follows [Dispatch 37](dispatch-37-transition-client-controller.md). Last verified production remains PR #53 `62acacb`.

## Implementation

AuthProvider now exposes a current session getter, monotonic in-memory generation and boundary subscription. These read synchronously rather than trusting a previous React render. Loading, sign-out, direct identity switch, denied authorization, account role/scope/Person linkage changes and provider cleanup invalidate old consumers before publication. A shared boundary survives controller recreation within the same provider; generation never resets during StrictMode effect replacement. Same-authority background refreshes and display-only name/contact updates do not needlessly invalidate a reviewed action.

The session controller fences a direct UID change before waiting for the next account response, including a background restoration. Older authorization responses cannot restore authority after clear/deny/stop. Firebase restoration/configuration/sign-out errors use that same boundary instead of publishing React-only denial state.

Explicit sign-out emits a private, identity-free random storage signal. Other open tabs immediately clear their authority and protected session drafts, even if the originating Firebase sign-out later fails. The original tab still reports that failure and requires retry. The signal is not a cross-tab login/permission grant; ordinary Firebase restoration and server authorization remain necessary. Existing protected-storage cleanup preserves unrelated preferences. Storage broadcast failure does not suppress Firebase sign-out.

The new session-bound transition adapter subscribes before asynchronous vault creation, disposes transport/controller on an auth boundary and unsubscribes on failure/dispose. It retains inaccessible recovery markers on permission loss; loss of access is not cancellation. This adapter remains unimported by the app until the guarded dialog is built. AuthProvider's boundary is integrated, but no staffing submission is enabled.

## Evidence and limits

- Four new session-boundary unit groups plus existing auth/client/view and command/controller/transport coverage: 33 affected groups passed.
- Four session-bound adapter groups passed: permission loss preserves markers, same-authority refresh/same-UID invalidation, async creation race and disposal unsubscribe.
- Three existing real-browser app authentication regressions passed with mocked Firebase/API: loading/password/reset/Google, failed sign-out/retry and background permission denial.
- One new real two-tab browser case passed: explicit sign-out clears the second tab's shell/session draft even when mocked Firebase sign-out fails; unrelated preference remains.
- Initial browser attempt used an unconfigured local development server and correctly showed unavailable sign-in. Only the test process was restarted with synthetic public Firebase settings; the three affected tests then passed. No production auth policy/configuration was changed.
- Type check and production build passed (existing bundle warning). Final review still required. No actual Firebase credentials, production staffing/account writes, mailbox actions or consumer token tests occurred.

## Next

Review repair: the receiving tab now synchronously suppresses restoration and attempts its own Firebase sign-out without rebroadcasting. Failure leaves a fenced denial with explicit retry, rather than allowing focus/visibility/timer restoration of a still-present Firebase user. Routine same-UID token callbacks now use a background authority recheck, while a real UID change still fences immediately. Three affected browser cases passed after these repairs (failed-signout/retry, receiving-tab failure plus focus/visibility, and held same-UID token recheck); final types passed. Applicable earlier unit/build results remain recorded, not claimed as rerun after repair. Review of the repaired head remains required.

Review these auth changes before merge. Add bounded server routes/capability gates with recovery independent of new admission, then the short accessible replacement/vacancy dialog and synthetic SDK/browser end-to-end acceptance. Verify internal receipt/audit protection before activation. The owner approved one signing secret and read permission only for the existing Directory server identity; provisioning and guarded release remain later steps. Broader permissions/policy decisions must be escalated. Issue #36, data restoration, Region/acting ownership and full offboarding remain separate.

# Dispatch 15: hours correction workflow

## Scope and cause

Focused fix from reviewed main `a6f5b7dd657fb096035b9d8367ebe3a192758a16`.
Branch: `fix/hours-correction-workflow`. Root reported a Store 150 request
whose proposed hours equaled its submission snapshot; the server correctly
rejected a no-op approval. No production request or personnel payload was
sampled by this implementation.

The modal initialized from its optional prop/default rather than the actual
first selected Location, retained another store's draft when the next store
had no saved hours, and allowed unchanged submission. Review incorrectly
labeled the historical snapshot as current. Approval also retained template
linkage for a customized schedule.

## Changes and invariants

- Initialize/reset a detached hours draft from the selected Location, using
  the existing default only when saved hours are absent. Compare structures
  independently of object key order; block unchanged submission in UI and
  server. Submission waits for commit; failed saves preserve the draft/error
  and do not leave a phantom pending request.
- Show submission baseline, current requested fields from the loaded target,
  and proposed values separately. Explain no-op/stale/missing targets; disable
  Approve & Apply but retain Reject and replacement submission. Loaded values
  are not claimed to be continuously live: the server rechecks on commit.
- Require a recorded hours baseline and compare it with the persisted target
  inside the transaction. Check every requested field with a recorded baseline;
  preserve request/target versions, persisted target binding, every-field
  matching and the no-op approval guard. Missing targets/baselines and stale
  requests fail without partial target/request/audit writes.
- Hours corrections apply `hoursMode: custom` and clear `hoursTemplateId`,
  using existing attributes rather than adding status or assignment models.
  This derived mapping is shared by UI/server and never makes unchanged hours
  approvable merely by changing metadata. Explicit custom schedules stay
  custom after bootstrap even when matching a template; legacy template
  association remains compatible. New snapshots record the requested saved
  hours, not bootstrap-inferred template metadata. Supplied historical
  mode/template baselines are also checked.
- Only stewards/administrators can review pending requests, enforced on the
  server as well as UI. Approval/rejection audit UI entries and mail events
  follow successful commits. Untouched staffing, canonical IDs and unrelated
  current fields remain unchanged.

## Verification and release boundary

- Lint and production build passed (existing bundle-size warning only).
- **333/333 API/unit tests**, no failures/skips: actual synthetic HTTP changed
  hours approval, atomic persistence, no-op/key-order/metadata bypass rejection,
  stale/missing targets/baselines/versions, every-field matching, permission
  restrictions, custom-template behavior and unchanged staffing.
- **24/24 focused synthetic browser cases**: 10 hours workflow cases plus
  inbox, staffing and stale-edit regressions. SDK/API mocked, external HTTPS
  blocked; no live saves or email. Initial browser run was 8/9: its sole failure
  was an exact-text locator ignoring the existing alert's reload suffix;
  inspected page evidence showed correct rollback/error, and the assertion now
  checks the alert without weakening the required message.
- Public v1/v2 payloads, packaged guide/schema, Firebase/auth configuration,
  runtime/IAM, existing grants and production records were not changed.

No production approvals, rejections, requests, data writes, mail, migration,
new credentials or deployment. Existing no-op requests require an authorized
reviewer to reject or replace them; no automatic repair occurs. Commit/PR are
for root review only; merge and deployment remain deferred.

# Person work contact and shared store inboxes

This is app-neutral Directory guidance, not an account or mailbox permission policy. The owner-approved model allows a Person to hold multiple explicitly selected positions, including the rare Store Manager who has an individual company address as well as store inbox responsibility. The [current release record](dispatches/dispatch-27-explicit-legacy-email-mapping.md) publishes PR #45's explicit mapping alongside PR #43's contact/responsibility guards; no live staff contact migration was performed.

## Where each value belongs

- **Location → shared inbox:** `locationInboxEmail` belongs to the store/location. SMs and AMs may share responsibility for it. Most store employees do not have individual company mailboxes.
- **Person → individual work email (optional):** `workEmail` is an individually assigned work contact, not a copy of the store inbox. Leave it blank when none is assigned. A rare SM with an individual company email can retain that contact alongside the separately shown store inbox responsibilities; no extra competing `storeEmail` field is needed.
- **Person ID → explicit app-account link:** a stable Person ID, not email, links an app account to a Directory Person. Account roles, sign-in providers and actual mailbox permissions are separate administration. An assignment is not proof that mailbox access has been provisioned.

Email domains, address matches and job titles do not grant permissions or merge People. Google/Microsoft mailbox hosting does not prove a particular application supports that sign-in method. This feature does not change providers or configure accounts.

## Reading and editing the Person card

The shared-inbox responsibility panel reads only saved Location `storeManagerId` and `assistantStoreManagerIds` references. One Person can have several Locations or both roles. A transfer/vacancy changes this projection when the canonical store assignment changes. Working at/supporting a Location, typed titles, matching emails or District leadership alone do not create an SM/AM responsibility.

Each responsibility shows the Location link, Store Number (leading zeroes preserved), exact roles and saved shared inbox. Missing/invalid inboxes, inactive People, retired/not-confirmed-active Locations and non-retail/unclassified assignments are visible review warnings, not silent vacancy or permission claims. The panel is read-only; edit staffing or the inbox on the Location. A workplace/support Location may still show its shared contact as reference, explicitly not as SM/AM responsibility.

Existing Person contacts that contain a conventional store mailbox or match a saved Location inbox are labeled as saved shared contacts requiring review. They are not moved, cleared or copied automatically. Unrelated edits preserve untouched historical values. An invalid or legacy-only address is not presented as verified individual identity.

Editing and then restoring the same normalized email is also a no-op: it does not block other profile edits, rewrite stored casing, or promote a legacy-only `email` into `workEmail`.

### Explicitly mapping an eligible historical individual address

See [Dispatch 27](dispatches/dispatch-27-explicit-legacy-email-mapping.md) for actual review/publication state. When no canonical `workEmail` property exists and the saved historical contact is valid and not a known shared inbox, **Use as individual work email** opens a preview. Check that it is assigned to the person, then choose **Stage email mapping** and **Save Person**. The historical source remains unchanged. Preview/Cancel/Stage alone sends nothing; **Undo email mapping** cancels the staged intent. Typing into the email field also cancels that intent, even when the address is restored afterward.

This action is unavailable when a canonical contact or explicit blank/null already exists; it never overrides a deliberate clear. Ordinary intentional replacement/clear editing remains available. A candidate becoming shared or changing before Save must be reviewed again. Permission/version rejection retains the draft; an unconfirmed save locks repetition until the saved record is checked. Mapping is not mailbox/identity verification, company sign-in or an account/API grant; existing API lifecycle/domain/shared-contact policies still determine whether contact can be returned.

New or changed Person `email` / `workEmail` values cannot be conventional store-number mailboxes or match known Location inboxes. The server checks current and proposed Location inboxes in its existing transaction; clearing/deleting a Location in that same transaction cannot turn its old shared address into a new individual Person contact. The UI also blocks these edits. Other addresses still require human review: a syntactically valid address is not verified ownership, uniqueness, employment or company sign-in.

To replace a legacy shared Person contact, intentionally enter the individual's own work address, or clear this optional field. Clearing `workEmail` uses an explicit empty string and does not fall back to the retained legacy `email`, erase the Location inbox or change assignments. Saving a contact never issues an account, invitation or permission. No real contact cleanup is performed by this release.

## Imports, requests and consumer APIs

- Fleet CSV/import/export uses the **Location** `locationInboxEmail` column, not a Person contact. Suggestions remove leading zeroes from the mailbox number only; preserve the actual Store Number/Location ID. Suggestions do not prove a mailbox exists and are not automatic backfill. Existing duplicate-inbox acknowledgment and explicit null-clearing rules remain. See [CSV dictionary](location-csv-export.md).
- Location correction requests for a shared inbox remain `Other Store Info Update`; approved changes affect the Location. Current Person correction categories do not introduce email changes. Direct Directory Person edits still use the shared server validation above.
- Historical privileged migration/restore scripts are not the interactive write path and can bypass application validation. Do not run them as contact cleanup. A separately approved restore must be reviewed against this policy first; this work does not modify or execute those scripts.
- V1 exposes Location inboxes under its existing location grant. V2 personnel/staffing remains contact-free and exposes scoped Person/assignment IDs, not individual work emails. V3 DM `districtManager.workEmail` requires both leadership grants plus the existing company-domain, lifecycle and shared-inbox eligibility checks. This Person-card improvement adds no API field, scope or SM/AM individual-contact export. See [API schema](api-response-schema.md) and [leadership guide](district-leadership-api.md).
- Consumers must synchronize complete datasets, honor null/clears and source lifecycle/diagnostics, and link accounts explicitly by Person ID. Do not use this screen as proof of authenticated consumer acceptance or actual mailbox access.

The private company roles/email reference is not edited by this implementation. The owner's latest rare-SM individual-email exception is recorded in the [maintained plan](plans/directory-consistency-plan.md), rather than copying a private employee roster into this repository.

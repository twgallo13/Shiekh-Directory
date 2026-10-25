# Contact card UX audit and cleanup

Owner request, October 24, 2026 Pacific. Prioritize a straightforward store reference card: business information first, minimal commentary and wasted space. This is a focused review of the Location and Person detail cards, not a claim that every application screen has been audited.

## Evidence and findings

Reviewed the owner's three screenshots, the live Person editor read-only, and the detail-card components, contact projections, hierarchy resolvers and operating-status panel. The live editor was left untouched because it was already open; no business record was saved.

- **High — business information below administrative content.** A large operating control panel precedes contact information. Nested panels and equal-height columns add empty space; employment empty states precede leadership. Put the address and directions first, contacts alongside, then today's hours and leadership.
- **High — unsupported reassurance.** The Google Business Profile panel always renders “Synced & Live,” without checking provider evidence. Remove the claim. Any future sync indicator must use an actual verified integration result and distinguish stale, unknown and failed states.
- **High — misleading status styling.** The old hours summary is always green, including Closed/Unknown states. Keep the existing resolved status badge as the authority and remove that duplicate green panel. Preserve temporary-closure reasons and current notices in the overview, with operating controls on Hours & status.
- **Medium — technical prose crowds out contact information.** Person cards repeat identity, source and permission explanations, even for ordinary records with no store inbox responsibilities. Use concise contact labels, omit the empty read-only inbox section, retain real warnings, and leave detailed guidance in the editor where decisions are made.
- **Medium — internal metadata in the quick view.** Record IDs, classification, verification controls and custom metadata compete with useful business facts. Move them to Details. Preserve them rather than deleting data or weakening validation.
- **Medium — nested scrolling and repeated location commentary.** Person locations have a second scroll container and repeat the same leadership disclaimer on every row. Use the main dialog scroll and show each location's actual role label. Keep historical territory text behind a clearly labeled disclosure; it must never become an assignment.
- **Medium — navigation and small-screen discoverability.** Keep short section names, a labeled copy action, selected-button state and visible footer controls. Opening a different location resets the card to Overview.

## First implementation slice

Location Overview order: store identity/current status; address, suite, mall/center and directions; phone with existing visibility label and store inbox; today's applicable hours and local time; Store Manager, DM, RM, assistants and key holders; canonical District/Region and any assignment warning indicator. Missing assignments remain explicit. Existing hierarchy/contact/operating resolvers remain authoritative.

Hours & status retains immediate closure/recovery controls, weekly/holiday schedules and notices. Details retains record ID, lifecycle/type, malformed saved inbox, nonempty workplace/support links, steward verification and custom metadata. History retains the audit log. No static Google sync success is displayed.

The overview still exposes retained uncertain operating submissions, recovery errors and refresh warnings. Routine controls move; unresolved operations are not hidden by the cleanup. The existing same-command recovery and expiry behavior remains unchanged.

Person quick view shows status/department, direct phone/visibility, work contact, actual store inbox responsibilities and linked Districts/locations. Invalid, shared or historical email remains labeled; it is not silently promoted to an individual work contact. Historical aliases remain available in a disclosure. Promotion/offboarding review remains available to its existing authorized roles after the location list. Editor guidance and destructive-action confirmations remain intact.

## Acceptance and release

- Check desktop and narrow mobile layouts: address near the top, readable wrapping, no horizontal overflow, one content scroll and usable footer controls.
- Check suite-aware directions, telephone/email links, copy feedback/failure, leadership and location navigation.
- Check Closed/Unknown/temporary-closure and notice states without inventing Open or sync success. Assignment/data warnings remain discoverable; missing values are never fabricated.
- Check Person shared inboxes, empty responsibilities, individual versus legacy contact, historical territory disclosure and existing edit/inactivation guards with synthetic data only.
- Type-check/build the final source and run affected browser checks; reuse unchanged backend validation. Inspect screenshots before marking source ready.
- This slice changes presentation only. No API schema/grants, staffing assignment, database policy, runtime identity, secret or workflow flag is changed. Existing production-isolation/compatibility gates still apply to a combined main release; source readiness does not mean deployed.

## Source validation checkpoint

The final card slice passed eight focused browser cases: desktop/mobile contact-first layout, Closed/Unknown presentation and clipboard failure, empty inbox/legacy-contact handling, and three existing contact/assignment safeguards. Eight operating workflow regressions also passed after moving the controls, including uncertain-save reload recovery visible on Overview, exact expiry, periodic refresh/outage and bulk confirmation guards. These are 16 distinct synthetic browser cases; the earlier six-case layout run is superseded and is not added to the total. No production record or account was used. Final TypeScript/build and whitespace checks passed, with the existing build chunk-size warning. Desktop and narrow mobile screenshots were inspected. Source readiness is separate from deployment.

## Follow-up work

### Review repair and isolated publication plan

Final review identified a hidden resolved-state warning in Overview: active closure deadlines and specific operating diagnostics now keep the alert-only panel visible. The Store Manager roster uses only the canonical work phone, labeled with the existing Location/Person phone classification; historical numbers remain in the Person record rather than being presented as verified work contacts here. Mail links use the normalized recipient while preserving saved display text. A compact disclosure explains that assigned inbox contacts do not verify mailbox access. Seven affected browser cases passed after these repairs, including three new regressions; unchanged earlier coverage is reused rather than added as repeated tests.

The UX publication can be isolated from newer unpublished staffing code: all four changed runtime components were byte-identical between the live PR53 source and PR70's base. Prepare the release from the verified live source plus only those reviewed component blobs and compatible synthetic tests. Do not deploy all of current main, switch runtime identities, change shared access or enable the new staffing workflow for this UI release. Verify that server/dependency/auth/provider/API source and served consumer documents match the live base, then use a zero-traffic candidate and configuration/traffic guards before promotion. The other apps' coordinated repair and permission cleanup remain separate.

1. Review Person editor explanatory text and grouping next, preserving meaningful warnings at the point of change.
2. Apply the same contact-first hierarchy to list/grid cards and search results after these detail views are accepted.
3. Review Organization settings, correction forms and empty/error states for consistent labels and concise task guidance.
4. Add real provider freshness/status evidence only when the integration supports it; never replace an unknown result with a decorative success badge.

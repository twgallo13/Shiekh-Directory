# Managed retail lifecycle and format edits

October 28, 2026 Pacific. Source-only slice based on Dispatch66; no deployment or activation.

## Scope

The existing Location editor can retire/reactivate a managed retail record without changing its District/Region IDs, inherited leadership, organization tenures or Person workplace/access. Those supported actions remain versioned saves. A change between the three recognized retail formats is now ordinary metadata too: Enclosed Mall, Strip Center / Shopping Center, Street / Standalone Location. It does not change hierarchy membership. CSV preview and final Store validation apply the same rule; CSV schema/headers and public API shapes are unchanged.

Retail/non-retail conversion, hierarchy applicability changes, membership moves through a generic save, and deletion of a managed retail record remain blocked. Editors preserve classification in both directions when saved or selected hierarchy links are managed, with a matching submission check. Managed stores disable non-retail choices; non-retail records with managed historical links disable retail choices while retaining their ordinary non-retail subtypes. They are not accidentally treated as managed retail merely because they retain an old District reference. New Location creation remains independent of these existing-record restrictions.

Accepted managed retirement/reactivation/retail-format changes now produce a mandatory server-authored, size-bounded audit, even if a generic caller supplies none. The audit records actual before/after manifests and authenticated attribution. Its wording preserves only the facts enforced by the guard: canonical hierarchy and District/Region leadership. Other ordinary, deliberately selected store edits may accompany the save. An oversized audit rolls back the entire save.

## Corrections

The correction approval path already awaits the atomic Request + target manifest, performs stale/no-op/field validation, and keeps notes after an uncertain result without blind retry. It does not implement District or Region ownership changes. The UI now says Store Manager Assignment and explains where inherited leadership belongs. The Requests header identifies address/contact/hours corrections and directs temporary closures to the store card. This is a label/path clarification, not expanded request fields or approval authority.

## Evidence

- 74 focused guard/import/correction tests passed. Added accepted retail-format and retirement/reactivation cases, mandatory-audit selection, and refusal to combine a format edit with an unreviewed membership move. Updated CSV acceptance for retail formats while retaining conversion/move rejection.
- Complete ordinary suite: 916/916 passed. TypeScript and release build passed; existing bundle-size advisory only.
- Native SDK journey passed: retire version4→5; reactivate with a retail-format edit version5→6; canonical IDs/copies, units, tenures and People unchanged; two mandatory audits despite caller audit=null. Conversion, generic membership/copy bypass, and deletion rejected without partial state/audit. An oversized required audit also rejected retirement without changing version/status or audit count.
- Actual synthetic editor under React StrictMode: desktop retail-format + retire confirmation/save produced the expected retired format with both managers intact; separate retire/reopen/mobile reactivate/save advanced the same saved record through versions4→5→6. Non-retail choices were disabled. The fixture now binds the editor to current context data so reopen tests use the saved version, not its initial seed. No cloud records were used.

Dispatch68 records the later prerequisite creation-race repair, local reverse-choice review correction, and final combined 918-case validation; it supersedes this slice's earlier 916-case checkpoint. This does not deliver retail/non-retail conversion, hard removal, production/provider acceptance or the optional future multi-manager consumer contract. Those remain explicit roadmap items. Independent exact-source review and all guarded migration/security/access/signing/runtime/release/rollback/production gates remain required. Do not deploy whole main, restore data, change credentials/grants or alter unrelated apps.

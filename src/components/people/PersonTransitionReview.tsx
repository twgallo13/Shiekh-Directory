import React from 'react';
import type { DistrictRecord, LocationRecord, PersonRecord, RegionRecord, UpdateRequest, UserProfile } from '../../types';
import { personLifecycle } from '../../lib/personLifecycle';
import { personTransitionReview } from '../../lib/personTransitionReview';
import { PersonServerTransitionPreview } from './PersonServerTransitionPreview';

const linkClass = 'break-words font-semibold text-red-700 underline';
const version = (value?: number) => typeof value === 'number' ? `loaded version ${value}` : 'version not available';
export function PersonTransitionReview({ person, locations, districts, regions, users, requests }: { person: PersonRecord; locations: LocationRecord[]; districts: DistrictRecord[]; regions: RegionRecord[]; users: UserProfile[]; requests: UpdateRequest[] }) {
  const review = personTransitionReview(person, locations, districts, regions, users, requests);
  return <details className="rounded-xl border border-neutral-200 bg-neutral-50">
    <summary className="cursor-pointer rounded-xl p-4 text-sm font-semibold text-neutral-900 focus-visible:outline-red-700">Review promotion / offboarding</summary>
    <section aria-label="Promotion and offboarding dependency review" className="space-y-4 border-t border-neutral-200 p-4 text-xs">
      <PersonServerTransitionPreview personId={person.id} personVersion={person.version} />
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">Read-only review of loaded records, not a complete inventory, atomic snapshot or permission to inactivate. Nothing here reassigns staff, changes positions, unlinks accounts or revokes access. Recheck saved records before any separate change.</p>
      <p className="break-all text-neutral-600">Person ID: {person.id} · {personLifecycle(person)} · {version(person.version)}</p>
      <div className="space-y-2"><h3 className="font-semibold">1. Current management responsibilities</h3>
        <p>District-owned DMs are changed once in Organization settings. Location-owned slots are reviewed separately, including retired Locations. Promotion does not release old assignments automatically.</p>
        {review.responsibilities.length ? <ul className="space-y-2">{review.responsibilities.map(row => <li key={row.key} className="rounded-lg border bg-white p-3"><a className={linkClass} href={row.href} target="_blank" rel="noopener noreferrer">{row.label}</a><p>{row.source}</p></li>)}</ul> : <p>No current management references found in loaded records.</p>}
        {review.issues.map(issue => <p key={issue} className="text-amber-900">{issue}</p>)}
      </div>
      <div className="space-y-2"><h3 className="font-semibold">2. Inherited stores and historical copies</h3>
        <p>Inherited District stores: {review.inheritedStores.length}. These are not separate editable DM assignments.</p>
        {review.inheritedStores.map(row => <p key={row.locationId}><a className={linkClass} href={'/locations/' + encodeURIComponent(row.locationId)} target="_blank" rel="noopener noreferrer">#{row.location!.storeNumber} · {row.location!.name}</a> · {row.location!.recordStatus} · {version(row.location!.version)}</p>)}
        {review.historicalCopies.length ? <ul className="space-y-2">{review.historicalCopies.map(row => <li key={row.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3"><a className={linkClass} href={'/locations/' + encodeURIComponent(row.id)} target="_blank" rel="noopener noreferrer">#{row.storeNumber}</a> · {version(row.version)}<p>Historical DM copy differs from District ownership ({row.districtId}); not current authority. Review source consistency, not a replacement assignment.</p></li>)}</ul> : <p>No conflicting copied DM references to this Person found in loaded records.</p>}
      </div>
      <div className="space-y-2"><h3 className="font-semibold">3. Workplace and support</h3><p>These are separate from management ownership and mailbox permissions.</p>
        {review.workplaces.length ? review.workplaces.map(row => <p key={row.locationId} className="break-words">{row.location ? <a className={linkClass} href={'/locations/' + encodeURIComponent(row.locationId)} target="_blank" rel="noopener noreferrer">#{row.location.storeNumber} · {row.location.name}</a> : `Unavailable Location ${row.locationId}`} · {row.labels.filter(label => label === 'Primary workplace' || label === 'Supports').join(' · ')}{row.unavailable ? ' · Unavailable / retired — review link' : ''}</p>) : <p>No workplace/support links found in loaded records.</p>}
      </div>
      <div className="space-y-2"><h3 className="font-semibold">4. Linked Directory accounts</h3><p>Existing server guards require linked account records to be reviewed/unlinked before inactivation or deletion, including Suspended/Revoked records. Inactivation and unlinking do not prove Firebase, mailbox or other-app access was revoked. This panel cannot perform those actions.</p>
        {review.accounts.length ? review.accounts.map(account => <p key={account.id} className="break-all">{account.id} · {account.role} · {account.status || 'Status not recorded'} · {version(account.version)}</p>) : <p>No linked accounts found in loaded records; external access remains unverified.</p>}
        <a className={linkClass} href="/admin?tab=rbac" target="_blank" rel="noopener noreferrer">Review Directory accounts separately</a>
      </div>
      <div className="space-y-2"><h3 className="font-semibold">5. Pending corrections and historical attribution</h3><p>Review proposals before changing their targets or leaders. Submitted baselines and author/reviewer history must remain intact; do not retarget by name or email. Pending references are review context, not an additional inactivation authorization rule.</p>
        {review.pendingRequests.length ? review.pendingRequests.map(request => <div key={request.id} className="rounded-lg border bg-white p-3"><p className="break-all font-semibold">{request.id} · {request.changeType} · {version(request.version)}</p>{request.reasons.map(reason => <p key={reason}>{reason}</p>)}</div>) : <p>No matching pending references found in loaded requests; this does not verify historical or external references.</p>}
        <a className={linkClass} href="/requests" target="_blank" rel="noopener noreferrer">Review change requests separately</a>
      </div>
      <p className="rounded-lg border bg-white p-3">Next: intentionally choose a replacement or vacancy in the authoritative screen, review linked access separately, then reload and recheck dependencies. Existing server permissions, versions and lifecycle guards still decide each write. Region-owned/acting leadership and a coordinated handover command are not implemented by this review.</p>
    </section>
  </details>;
}

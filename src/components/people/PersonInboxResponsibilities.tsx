import React from 'react';
import type { LocationRecord, PersonRecord } from '../../types';
import { personInboxResponsibilities } from '../../lib/personInboxResponsibilities';

/** Read-only projection of saved assignments, never a mailbox permission editor. */
export function PersonInboxResponsibilities({ person, locations, compact = false }: { person?: PersonRecord; locations: LocationRecord[]; compact?: boolean }) {
  const rows = person ? personInboxResponsibilities(person, locations) : [];
  if (compact && !rows.length) return null;
  return <section aria-label="Shared store inbox responsibilities" className={compact ? 'space-y-2 border-b border-neutral-200 pb-3' : 'space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4'}>
    <h3 className="text-sm font-semibold text-neutral-900">{compact ? 'Store inboxes' : 'Shared store inbox responsibilities'}</h3>
    {!compact && <p className="text-xs text-neutral-600">From saved Store Manager / Assistant Manager assignments, not workplace, title or email. This does not verify mailbox access or grant app permissions.</p>}
    {rows.length ? <ul className="space-y-2">{rows.map(row => <li key={row.location.id} className="space-y-2 rounded-lg border border-neutral-200 bg-white p-3 text-xs">
      <a href={'/locations/' + encodeURIComponent(row.location.id)} target="_blank" rel="noopener noreferrer" className="block break-words font-semibold text-red-700 underline">#{row.location.storeNumber} · {row.location.name || 'Unnamed Location'}</a>
      <p>{row.roles.join(' · ')}</p>
      <p className="break-all font-mono text-neutral-900">{row.inbox || 'No usable shared inbox'}</p>
      {row.issues.map(issue => <p key={issue} className="text-amber-900">{issue}</p>)}
      {!compact && <p className="text-neutral-500">Source: this Location's staffing assignments. Store inbox is edited on the Location, not this Person.</p>}
    </li>)}</ul> : <p className="text-xs text-neutral-500">No SM/AM inbox responsibilities found in loaded Locations. An individual work email is still optional.</p>}
  </section>;
}

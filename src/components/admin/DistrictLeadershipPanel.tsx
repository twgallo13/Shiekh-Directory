import React, { useState } from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { hasDistrictLeadership, previewDistrictLeadership, type DistrictLeadershipPreview } from '../../lib/districtLeadership';
import { leadershipPickerOptions } from '../../lib/leadershipPicker';

/** Explicit preview/confirmation for one atomic retail District DM handover; no automatic cutover. */
export function DistrictLeadershipPanel({ districtId, onBusyChange }: { districtId: string; onBusyChange: (busy: boolean) => void }) {
  const { currentUser, districts, regions, people, locations, saveDistrictLeadership } = useDirectory();
  const [managerId, setManagerId] = useState('');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<DistrictLeadershipPreview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const district = districts.find(d => d.id === districtId);
  if (currentUser.role !== 'System Administrator') return null;
  const invalidate = () => { setPreview(null); setAcknowledged(false); setFeedback(''); };
  const review = () => {
    invalidate();
    try {
      if (!district || !managerId) throw new Error('Choose a District and a new DM, or explicitly choose Vacant.');
      setPreview(previewDistrictLeadership(district, managerId === '__vacant__' ? null : managerId, reason, locations, people, regions));
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Preview failed. No changes were made.'); }
  };
  const confirm = async () => {
    if (!preview || !acknowledged || busy) return;
    setBusy(true); onBusyChange(true); setFeedback('Saving the District and all previewed stores together…');
    try {
      await saveDistrictLeadership(preview);
      setFeedback(`Saved: ${preview.managerName} is the District DM for all ${preview.locations.length} previewed retail stores. No employment or account status changed.`);
      setPreview(null); setAcknowledged(false); setManagerId(''); setReason('');
    } catch (error) {
      setPreview(null); setAcknowledged(false);
      setFeedback(`${error instanceof Error ? error.message : 'The save could not be confirmed.'} Do not assume it failed or retry blindly. Reload this page, check the saved District/stores, then build a fresh preview if needed.`);
    } finally { setBusy(false); onBusyChange(false); }
  };
  return <section aria-label="District leadership handover" className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
    <h4 className="font-semibold">District Manager · {district?.name || districtId}</h4>
    <p className="text-sm text-neutral-600">Set the manager once for this District. Its retail stores inherit the assignment, including retired stores. Non-retail locations, employment and sign-in access are unchanged.</p>
    {district && <p className="text-xs">Current authority: {hasDistrictLeadership(district) ? `District-owned — ${district.districtManagerId ? people.find(p => p.id === district.districtManagerId)?.fullName || `Unresolved person [${district.districtManagerId}]` : 'Vacant'}` : 'Legacy per-store assignments; activating District ownership requires confirmation below.'}</p>}
    <label className="block text-sm">New District Manager<select aria-label="New District Manager" disabled={busy} value={managerId} onChange={e => { invalidate(); setManagerId(e.target.value); }} className="mt-1 w-full rounded border p-2"><option value="">Choose intentionally…</option><option value="__vacant__">Vacant — no District Manager</option>{leadershipPickerOptions(people, 'District Manager', false).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
    <p className="text-xs text-neutral-600">Only Active people with the District Manager position explicitly selected are available. Add that position on the Person first; this does not remove their other positions or store assignments.</p>
    <label className="block text-sm">Reason for District handover<textarea disabled={busy} value={reason} minLength={5} maxLength={500} onChange={e => { invalidate(); setReason(e.target.value); }} className="mt-1 w-full rounded border p-2" /></label>
    <button type="button" disabled={busy} onClick={review} className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50">Preview district-wide change</button>
    {preview && <div className="space-y-3 rounded border border-amber-300 bg-amber-50 p-3" aria-label="District leadership preview">
      <h4 className="font-semibold">Confirm {preview.district.name}: {preview.managerName}</h4>
      <p className="text-xs">{preview.locations.length} retail stores will share this DM. Existing differences will be replaced. {preview.excluded.length} non-retail locations are excluded. No store moves, employment changes, account changes or emails are included.</p>
      <ul className="max-h-64 space-y-1 overflow-auto text-xs">{preview.locations.map(l => <li key={l.id}>#{l.storeNumber} · {l.name} [{l.id}]: {l.districtManagerId ? people.find(p => p.id === l.districtManagerId)?.fullName || `Unresolved [${l.districtManagerId}]` : 'Vacant'} → {preview.managerName}</li>)}</ul>
      {preview.excluded.length > 0 && <p className="text-xs">Excluded: {preview.excluded.map(l => `#${l.storeNumber} [${l.id}]`).join(', ')}</p>}
      <label className="flex gap-2 text-xs"><input type="checkbox" disabled={busy} checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />I reviewed every affected store and intend to replace its DM with this District assignment.</label>
      <div className="flex gap-3"><button type="button" disabled={busy || !acknowledged} onClick={() => void confirm()} className="rounded bg-red-700 px-3 py-2 text-sm text-white disabled:opacity-50">{busy ? 'Saving…' : 'Confirm District DM assignment'}</button><button type="button" disabled={busy} onClick={invalidate}>Cancel preview</button></div>
    </div>}
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
  </section>;
}

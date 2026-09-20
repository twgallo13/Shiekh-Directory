import React, { useMemo, useRef, useState } from 'react';
import { Archive, Building2, Pencil, Plus, RefreshCw, Save, X } from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { DirectoryCommitError, type DirectoryDependency } from '../../lib/directoryClient';
import type { DistrictRecord, RegionRecord } from '../../types';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
type EditState = { kind: 'region'; id: string; name: string } | { kind: 'district'; id: string; name: string; regionId: string };
type Feedback = { tone: 'pending' | 'success' | 'error'; message: string; dependencies?: DirectoryDependency[]; correction?: string; refresh?: boolean };

export function HierarchyRegistryPanel() {
  const { currentUser, regions, districts, saveRegion, saveDistrict } = useDirectory();
  const [regionId, setRegionId] = useState('');
  const [regionName, setRegionName] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [districtName, setDistrictName] = useState('');
  const [districtRegionId, setDistrictRegionId] = useState('');
  const [editing, setEditing] = useState<EditState | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const activeRegions = useMemo(() => regions.filter(region => region.status === 'Active').sort(compareRegistryRecords), [regions]);
  const sortedRegions = useMemo(() => [...regions].sort(compareRegistryRecords), [regions]);
  const sortedDistricts = useMemo(() => [...districts].sort(compareRegistryRecords), [districts]);

  if (currentUser.role !== 'System Administrator') {
    return <p className="text-sm text-neutral-600">Only System Administrators can manage Regions and Districts.</p>;
  }

  const begin = (key: string, message: string) => {
    setPending(key);
    setFeedback({ tone: 'pending', message });
  };
  const failed = (error: unknown, fallback: string) => {
    const commitError = error instanceof DirectoryCommitError ? error : null;
    setFeedback({
      tone: 'error',
      message: error instanceof Error ? error.message : fallback,
      dependencies: commitError?.details?.dependencies,
      correction: commitError?.details?.correction,
      refresh: commitError?.code === 'directory_conflict',
    });
  };
  const finishEditing = (state = editing) => {
    const key = state ? `${state.kind}-${state.id}` : null;
    setEditing(null);
    if (key) window.requestAnimationFrame(() => editButtonRefs.current.get(key)?.focus());
  };

  const saveNewRegion = async () => {
    const id = regionId.trim();
    const name = regionName.trim();
    if (!ID_PATTERN.test(id) || !name) {
      setFeedback({ tone: 'error', message: 'Enter a stable ID using letters, numbers, dots, underscores, or hyphens, and a Region name.' });
      return;
    }
    begin('new-region', `Saving Region ${id}...`);
    try {
      await saveRegion({ id, name, status: 'Active' }, true);
      setRegionId(''); setRegionName('');
      setFeedback({ tone: 'success', message: `Region ${name} (${id}) was created.` });
    } catch (error) { failed(error, 'Region could not be saved.'); }
    finally { setPending(null); }
  };

  const saveNewDistrict = async () => {
    const id = districtId.trim();
    const name = districtName.trim();
    if (!ID_PATTERN.test(id) || !name || !districtRegionId) {
      setFeedback({ tone: 'error', message: 'Enter a stable ID, a District name, and its Region.' });
      return;
    }
    begin('new-district', `Saving District ${id}...`);
    try {
      await saveDistrict({ id, name, regionId: districtRegionId, status: 'Active' }, true);
      setDistrictId(''); setDistrictName(''); setDistrictRegionId('');
      setFeedback({ tone: 'success', message: `District ${name} (${id}) was created.` });
    } catch (error) { failed(error, 'District could not be saved.'); }
    finally { setPending(null); }
  };

  const saveEdit = async () => {
    if (!editing || !editing.name.trim() || (editing.kind === 'district' && !editing.regionId)) {
      setFeedback({ tone: 'error', message: 'Name and parent Region are required.' });
      return;
    }
    const key = `${editing.kind}-${editing.id}`;
    begin(key, `Saving ${editing.id}...`);
    try {
      if (editing.kind === 'region') {
        const current = regions.find(region => region.id === editing.id);
        if (!current) throw new Error('This Region is no longer available. Refresh the directory.');
        await saveRegion({ ...current, id: editing.id, name: editing.name.trim() }, false);
      } else {
        const current = districts.find(district => district.id === editing.id);
        if (!current) throw new Error('This District is no longer available. Refresh the directory.');
        await saveDistrict({ ...current, id: editing.id, name: editing.name.trim(), regionId: editing.regionId }, false);
      }
      finishEditing(editing);
      setFeedback({ tone: 'success', message: `${editing.kind === 'region' ? 'Region' : 'District'} ${editing.id} was updated.` });
    } catch (error) { failed(error, 'Registry record could not be saved.'); }
    finally { setPending(null); }
  };

  const setRegionStatus = async (region: RegionRecord, status: RegionRecord['status']) => {
    begin(`region-${region.id}`, `${status === 'Retired' ? 'Retiring' : 'Reactivating'} ${region.id}...`);
    try {
      await saveRegion({ ...region, id: region.id, status }, false);
      setFeedback({ tone: 'success', message: `${region.name} is now ${status}.` });
    } catch (error) { failed(error, 'Region status could not be updated.'); }
    finally { setPending(null); }
  };

  const setDistrictStatus = async (district: DistrictRecord, status: DistrictRecord['status']) => {
    begin(`district-${district.id}`, `${status === 'Retired' ? 'Retiring' : 'Reactivating'} ${district.id}...`);
    try {
      await saveDistrict({ ...district, id: district.id, status }, false);
      setFeedback({ tone: 'success', message: `${district.name} is now ${status}.` });
    } catch (error) { failed(error, 'District status could not be updated.'); }
    finally { setPending(null); }
  };

  return <section className="space-y-5" aria-label="Region and District registry">
    <div className="flex items-start gap-3 border-b border-neutral-200 pb-4">
      <Building2 className="h-5 w-5 text-red-700" aria-hidden="true" />
      <div><h2 className="text-base font-semibold text-neutral-900">Region & District Registry</h2><p className="mt-1 text-xs text-neutral-600">IDs are permanent references used by this directory and other applications. Names and a District&apos;s parent Region may be updated; assigned Locations are never moved automatically.</p></div>
    </div>
    {feedback && <FeedbackMessage feedback={feedback} />}
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-900">Regions</h3>
        <label className="block text-xs font-medium text-neutral-700">Region ID<input value={regionId} disabled={Boolean(pending)} onChange={event => setRegionId(event.target.value)} placeholder="e.g. region-west" className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm" /></label>
        <label className="block text-xs font-medium text-neutral-700">Region Name<input value={regionName} disabled={Boolean(pending)} onChange={event => setRegionName(event.target.value)} placeholder="Enter approved Region name" className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" /></label>
        <button type="button" disabled={Boolean(pending)} onClick={() => void saveNewRegion()} className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Add Region</button>
        <div className="divide-y divide-neutral-100 border-t border-neutral-200 pt-2">{sortedRegions.length === 0 ? <EmptyRegistry /> : sortedRegions.map(region => {
          const isEditing = editing?.kind === 'region' && editing.id === region.id;
          return <div key={region.id} className="space-y-2 py-3 text-xs">
            {isEditing ? <RegistryEditForm editing={editing} activeRegions={activeRegions} busy={Boolean(pending)} onChange={setEditing} onSave={saveEdit} onCancel={() => finishEditing(editing)} /> : <>
              <RegistryIdentity id={region.id} name={region.name} status={region.status} />
              <RegistryActions editButtonRef={element => { if (element) editButtonRefs.current.set(`region-${region.id}`, element); else editButtonRefs.current.delete(`region-${region.id}`); }} busy={Boolean(pending)} status={region.status} onEdit={() => setEditing({ kind: 'region', id: region.id, name: region.name })} onStatus={status => void setRegionStatus(region, status)} />
            </>}
          </div>;
        })}</div>
      </div>
      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-900">Districts</h3>
        <label className="block text-xs font-medium text-neutral-700">District ID<input value={districtId} disabled={Boolean(pending)} onChange={event => setDistrictId(event.target.value)} placeholder="e.g. 01" className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm" /></label>
        <label className="block text-xs font-medium text-neutral-700">District Name<input value={districtName} disabled={Boolean(pending)} onChange={event => setDistrictName(event.target.value)} placeholder="Enter approved District name" className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" /></label>
        <label className="block text-xs font-medium text-neutral-700">Parent Region<select value={districtRegionId} disabled={Boolean(pending)} onChange={event => setDistrictRegionId(event.target.value)} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"><option value="">Select Region</option>{activeRegions.map(region => <option key={region.id} value={region.id}>{region.name} ({region.id})</option>)}</select></label>
        <button type="button" disabled={Boolean(pending)} onClick={() => void saveNewDistrict()} className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Add District</button>
        <div className="divide-y divide-neutral-100 border-t border-neutral-200 pt-2">{sortedDistricts.length === 0 ? <EmptyRegistry /> : sortedDistricts.map(district => {
          const parent = regions.find(region => region.id === district.regionId);
          const isEditing = editing?.kind === 'district' && editing.id === district.id;
          return <div key={district.id} className="space-y-2 py-3 text-xs">
            {isEditing ? <RegistryEditForm editing={editing} activeRegions={activeRegions} busy={Boolean(pending)} onChange={setEditing} onSave={saveEdit} onCancel={() => finishEditing(editing)} /> : <>
              <RegistryIdentity id={district.id} name={district.name} status={district.status} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-neutral-600"><dt>Region ID</dt><dd className="font-mono text-neutral-900">{district.regionId}</dd><dt>Region Name</dt><dd>{parent?.name || 'Missing registry record'}</dd></dl>
              <RegistryActions editButtonRef={element => { if (element) editButtonRefs.current.set(`district-${district.id}`, element); else editButtonRefs.current.delete(`district-${district.id}`); }} busy={Boolean(pending)} status={district.status} onEdit={() => setEditing({ kind: 'district', id: district.id, name: district.name, regionId: district.regionId })} onStatus={status => void setDistrictStatus(district, status)} />
            </>}
          </div>;
        })}</div>
      </div>
    </div>
  </section>;
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  return <div role={feedback.tone === 'error' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-xs ${feedback.tone === 'error' ? 'border-red-200 bg-red-50 text-red-900' : feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
    <p>{feedback.message}</p>
    {feedback.correction && <p className="mt-1 font-medium">{feedback.correction}</p>}
    {feedback.dependencies && feedback.dependencies.length > 0 && <ul className="mt-2 space-y-1">{feedback.dependencies.map(item => <li key={`${item.type}-${item.id}`}>{item.href ? <a href={item.href} className="font-semibold underline">{item.name}{item.storeNumber ? ` (Store ${item.storeNumber})` : ''}</a> : <span className="font-semibold">{item.name} ({item.id})</span>} <span className="font-mono">{item.id}</span></li>)}</ul>}
    {feedback.refresh && <button type="button" onClick={() => window.location.reload()} className="mt-2 inline-flex items-center gap-1 font-semibold underline"><RefreshCw className="h-3.5 w-3.5" />Refresh directory and review</button>}
  </div>;
}

function RegistryIdentity({ id, name, status }: { id: string; name: string; status: 'Active' | 'Retired' }) {
  return <div className="flex flex-wrap items-start justify-between gap-2"><dl className="grid grid-cols-[auto_1fr] gap-x-2"><dt className="text-neutral-500">ID</dt><dd className="font-mono font-semibold text-neutral-900">{id}</dd><dt className="text-neutral-500">Name</dt><dd className="font-semibold text-neutral-900">{name}</dd><dt className="text-neutral-500">Status</dt><dd>{status}</dd></dl></div>;
}

function RegistryActions({ editButtonRef, busy, status, onEdit, onStatus }: { editButtonRef: React.Ref<HTMLButtonElement>; busy: boolean; status: 'Active' | 'Retired'; onEdit: () => void; onStatus: (status: 'Active' | 'Retired') => void }) {
  return <div className="flex flex-wrap gap-3"><button ref={editButtonRef} type="button" disabled={busy} onClick={onEdit} className="inline-flex items-center gap-1 font-semibold text-neutral-700 hover:text-neutral-950 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" />Edit</button>{status === 'Active' ? <button type="button" disabled={busy} onClick={() => onStatus('Retired')} className="inline-flex items-center gap-1 text-neutral-600 hover:text-red-700 disabled:opacity-50"><Archive className="h-3.5 w-3.5" />Retire</button> : <button type="button" disabled={busy} onClick={() => onStatus('Active')} className="text-neutral-600 hover:text-neutral-900 disabled:opacity-50">Reactivate</button>}</div>;
}

function RegistryEditForm({ editing, activeRegions, busy, onChange, onSave, onCancel }: { editing: EditState; activeRegions: RegionRecord[]; busy: boolean; onChange: (value: EditState) => void; onSave: () => Promise<void>; onCancel: () => void }) {
  const regionOptions = editing.kind === 'district' && !activeRegions.some(region => region.id === editing.regionId)
    ? [{ id: editing.regionId, name: 'Current unavailable Region', status: 'Retired' as const }, ...activeRegions]
    : activeRegions;
  return <div className="space-y-2">
    <label className="block font-medium text-neutral-700">{editing.kind === 'region' ? 'Region' : 'District'} ID<input value={editing.id} readOnly aria-readonly="true" className="mt-1 w-full rounded-md border border-neutral-200 bg-neutral-100 px-3 py-2 font-mono text-sm text-neutral-600" /></label>
    <label className="block font-medium text-neutral-700">Name<input autoFocus value={editing.name} disabled={busy} onChange={event => onChange({ ...editing, name: event.target.value })} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" /></label>
    {editing.kind === 'district' && <label className="block font-medium text-neutral-700">Parent Region<select value={editing.regionId} disabled={busy} onChange={event => onChange({ ...editing, regionId: event.target.value })} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm">{regionOptions.map(region => <option key={region.id} value={region.id}>{region.name} ({region.id})</option>)}</select></label>}
    <p className="text-neutral-500">The ID is read-only because Locations and other applications depend on it.</p>
    <div className="flex gap-3"><button type="button" disabled={busy} onClick={() => void onSave()} className="inline-flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-2 font-semibold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" />Save</button><button type="button" disabled={busy} onClick={onCancel} className="inline-flex items-center gap-1 px-2 py-2 font-semibold text-neutral-700 disabled:opacity-50"><X className="h-3.5 w-3.5" />Cancel</button></div>
  </div>;
}

function EmptyRegistry() {
  return <p className="py-3 text-xs text-neutral-500">No records yet.</p>;
}

function compareRegistryRecords(left: { id: string; name: string }, right: { id: string; name: string }) {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}
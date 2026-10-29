import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Building2, Pencil, Plus, RefreshCw, Save, X } from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { DirectoryCommitError, type DirectoryDependency } from '../../lib/directoryClient';
import { beginDistrictEdit, beginRegionEdit, discardRegistryDraft, reapplyRegistryDraft, registryEditRecord, reviewRegistryConflict, type RegistryEditState } from '../../lib/hierarchyRegistryEditing';
import type { DistrictRecord, RegionRecord } from '../../types';
import { DistrictLeadershipPanel } from './DistrictLeadershipPanel';
import { hasDistrictLeadership, isDistrictLeadershipMember } from '../../lib/districtLeadership';
import { useOrganizationCapabilityState } from '../people/useOrganizationCapabilities';
import { OrganizationResponsibilities } from '../people/OrganizationResponsibilities';
import { OrganizationMoves } from './OrganizationMoves';
import { Modal } from '../common/Modal';
import { requiresManagedHierarchyReview } from '../../lib/managedHierarchyEditing';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
type Feedback = { tone: 'pending' | 'success' | 'error'; message: string; dependencies?: DirectoryDependency[]; correction?: string; refresh?: boolean };

export function HierarchyRegistryPanel() {
  const organizationState = useOrganizationCapabilityState(), organization = organizationState.capabilities;
  const [organizationOpen, setOrganizationOpen] = useState(false);
  const [organizationFooter, setOrganizationFooter] = useState<HTMLDivElement | null>(null);
  const organizationClose = useRef<(() => void) | null>(null);
  const [moveOpen, setMoveOpen] = useState(false), [moveFooter, setMoveFooter] = useState<HTMLDivElement | null>(null);
  const moveClose = useRef<(() => void) | null>(null);
  const { currentUser, regions, districts, people, locations, saveRegion, saveDistrict, refreshHierarchyRegistry } = useDirectory();
  const [regionFilter, setRegionFilter] = useState('');
  const [leadershipId, setLeadershipId] = useState<string | null>(null);
  const [leadershipBusy, setLeadershipBusy] = useState(false);
  const [regionId, setRegionId] = useState('');
  const [regionName, setRegionName] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [districtName, setDistrictName] = useState('');
  const [districtRegionId, setDistrictRegionId] = useState('');
  const [editing, setEditing] = useState<RegistryEditState | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const activeRegions = useMemo(() => regions.filter(region => region.status === 'Active').sort(compareRegistryRecords), [regions]);
  const sortedRegions = useMemo(() => [...regions].sort(compareRegistryRecords), [regions]);
  const sortedDistricts = useMemo(() => [...districts].sort(compareRegistryRecords), [districts]);
  const visibleDistricts = sortedDistricts.filter(district => !regionFilter || district.regionId === regionFilter);
  const busy = Boolean(pending) || leadershipBusy || organizationOpen || moveOpen;
  const legacyLeadershipEnabled = organization?.catalogEnabled === false;
  useEffect(() => { if (!legacyLeadershipEnabled) setLeadershipId(null); }, [legacyLeadershipEnabled]);

  if (currentUser.role !== 'System Administrator') {
    return <p className="text-sm text-neutral-600">Only System Administrators can manage Regions and Districts.</p>;
  }

  const begin = (key: string, message: string) => {
    setPending(key);
    setFeedback({ tone: 'pending', message });
  };
  const failed = (error: unknown, fallback: string, allowRefresh = false) => {
    const commitError = error instanceof DirectoryCommitError ? error : null;
    setFeedback({
      tone: 'error',
      message: error instanceof Error ? error.message : fallback,
      dependencies: commitError?.details?.dependencies,
      correction: commitError?.details?.correction,
      refresh: allowRefresh || commitError?.code === 'directory_conflict',
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
      await saveRegion({ id, name, status: 'Active' }, { create: true });
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
      await saveDistrict({ id, name, regionId: districtRegionId, status: 'Active' }, { create: true });
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
        await saveRegion(registryEditRecord(editing) as RegionRecord, { create: false, expectedVersion: editing.expectedVersion });
      } else {
        await saveDistrict(registryEditRecord(editing) as DistrictRecord, { create: false, expectedVersion: editing.expectedVersion });
      }
      finishEditing(editing);
      setFeedback({ tone: 'success', message: `${editing.kind === 'region' ? 'Region' : 'District'} ${editing.id} was updated.` });
    } catch (error) { failed(error, 'Registry record could not be saved.'); }
    finally { setPending(null); }
  };

  const setRegionStatus = async (region: RegionRecord, status: RegionRecord['status']) => {
    begin(`region-${region.id}`, `${status === 'Retired' ? 'Retiring' : 'Reactivating'} ${region.id}...`);
    try {
      await saveRegion({ ...region, id: region.id, status }, { create: false, expectedVersion: region.version ?? 0 });
      setFeedback({ tone: 'success', message: `${region.name} is now ${status}.` });
    } catch (error) { failed(error, 'Region status could not be updated.'); }
    finally { setPending(null); }
  };

  const setDistrictStatus = async (district: DistrictRecord, status: DistrictRecord['status']) => {
    begin(`district-${district.id}`, `${status === 'Retired' ? 'Retiring' : 'Reactivating'} ${district.id}...`);
    try {
      await saveDistrict({ ...district, id: district.id, status }, { create: false, expectedVersion: district.version ?? 0 });
      setFeedback({ tone: 'success', message: `${district.name} is now ${status}.` });
    } catch (error) { failed(error, 'District status could not be updated.'); }
    finally { setPending(null); }
  };

  const refreshConflict = async () => {
    if (busy) return;
    const draft = editing;
    begin('refresh-registry', 'Refreshing the latest saved hierarchy values...');
    try {
      const registry = await refreshHierarchyRegistry();
      if (draft?.kind === 'region') {
        setEditing(reviewRegistryConflict(draft, registry.regions.find(region => region.id === draft.id) || null));
      } else if (draft?.kind === 'district') {
        setEditing(reviewRegistryConflict(draft, registry.districts.find(district => district.id === draft.id) || null));
      }
      setFeedback({ tone: 'success', message: draft ? 'Latest saved values loaded. Your draft is unchanged; compare it below and choose how to continue.' : 'The hierarchy registry was refreshed.' });
    } catch (error) {
      failed(error, 'The hierarchy registry could not be refreshed. Your draft is unchanged.', true);
    } finally {
      setPending(null);
    }
  };

  const discardDraft = () => {
    if (!editing) return;
    const latest = discardRegistryDraft(editing);
    finishEditing(editing);
    setFeedback({ tone: 'success', message: latest ? 'Your draft was discarded. The latest saved record is in use.' : 'Your draft was discarded. The record is no longer available.' });
  };

  const reapplyDraft = () => {
    if (!editing) return;
    const reapplied = reapplyRegistryDraft(editing);
    if (!reapplied) return;
    setEditing(reapplied);
    setFeedback({ tone: 'success', message: 'Your draft is now based on the latest saved version. Review it, then save explicitly.' });
  };

  return <section className="space-y-5" aria-label="Region and District registry">
    {organizationState.status === 'loading' && <p role="status" className="text-sm text-neutral-500">Checking management settings…</p>}
    {organizationState.status === 'unavailable' && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p>Management settings could not be checked.</p><button type="button" onClick={organizationState.retry} className="rounded-md border border-amber-300 bg-white px-3 py-2 font-semibold">Retry management check</button></div>}
    {(organization?.catalogEnabled || organization?.recoveryEnabled) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4"><div><h3 className="text-sm font-semibold text-neutral-900">Management responsibilities</h3><p className="mt-1 text-xs text-neutral-500">Primary and Additional managers across Regions and Districts.</p></div><button type="button" disabled={busy || Boolean(editing) || Boolean(leadershipId)} onClick={() => setOrganizationOpen(true)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50">Manage responsibilities</button></div>}
    {organizationOpen && <Modal isOpen title="Management responsibilities" size="lg" footer={<div ref={setOrganizationFooter} className="w-full" />} onClose={() => organizationClose.current?.()}><OrganizationResponsibilities footerTarget={organizationFooter} registerClose={close => { organizationClose.current = close; }} onClose={() => setOrganizationOpen(false)} /></Modal>}
    {(organization?.catalogEnabled || organization?.recoveryEnabled) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4"><div><h3 className="text-sm font-semibold text-neutral-900">Store & District moves</h3><p className="mt-1 text-xs text-neutral-500">Review destination hierarchy and inherited managers together.</p></div><button type="button" disabled={busy || Boolean(editing) || Boolean(leadershipId)} onClick={() => setMoveOpen(true)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50">Move store or District</button></div>}
    {moveOpen && <Modal isOpen title="Organization move" size="lg" footer={<div ref={setMoveFooter} className="w-full" />} onClose={() => moveClose.current?.()}><OrganizationMoves footerTarget={moveFooter} registerClose={close => { moveClose.current = close; }} onClose={() => setMoveOpen(false)} /></Modal>}
    <div className="flex items-start gap-3 border-b border-neutral-200 pb-4">
      <Building2 className="h-5 w-5 text-red-700" aria-hidden="true" />
      <div><h2 className="text-lg font-semibold text-neutral-900">Regions & Districts</h2><p className="mt-1 text-sm text-neutral-600">Region → District → Store. Manage the District Manager on the District; stores inherit that assignment.</p><p className="mt-2 text-xs text-neutral-500">{organization?.catalogEnabled ? 'Use Store & District moves to change hierarchy and review every affected store together.' : 'Permanent IDs keep this directory and connected applications linked. Changing a legacy District’s parent does not move its stores.'}</p></div>
    </div>
    {feedback && <FeedbackMessage feedback={feedback} onRefresh={() => void refreshConflict()} disabled={busy} />}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="text-base font-semibold text-neutral-900">Regions <span className="text-sm font-normal text-neutral-500">({regions.length})</span></h3>
        <details className="rounded-lg bg-neutral-50 p-3"><summary className="cursor-pointer text-sm font-semibold text-neutral-700">Add Region</summary><fieldset disabled={busy || Boolean(leadershipId)} className="mt-3 space-y-3">
        <label className="block text-xs font-medium text-neutral-700">Region ID<input value={regionId} disabled={Boolean(pending)} onChange={event => setRegionId(event.target.value)} placeholder="e.g. region-west" className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm" /></label>
        <label className="block text-xs font-medium text-neutral-700">Region Name<input value={regionName} disabled={Boolean(pending)} onChange={event => setRegionName(event.target.value)} placeholder="Enter approved Region name" className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" /></label>
        <button type="button" disabled={Boolean(pending)} onClick={() => void saveNewRegion()} className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Add Region</button>
        </fieldset></details>
        <div className="divide-y divide-neutral-100 border-t border-neutral-200 pt-2">{sortedRegions.length === 0 ? <EmptyRegistry /> : sortedRegions.map(region => {
          const isEditing = editing?.kind === 'region' && editing.id === region.id;
          return <div key={region.id} className="space-y-2 py-3 text-xs">
            {isEditing ? <RegistryEditForm editing={editing} regions={regions} activeRegions={activeRegions} busy={Boolean(pending)} onChange={setEditing} onSave={saveEdit} onCancel={() => finishEditing(editing)} onDiscard={discardDraft} onReapply={reapplyDraft} /> : <>
              <RegistryIdentity id={region.id} name={region.name} status={region.status} />
              <p className="text-neutral-500">{districts.filter(district => district.regionId === region.id).length} districts</p>
              <RegistryActions editButtonRef={element => { if (element) editButtonRefs.current.set(`region-${region.id}`, element); else editButtonRefs.current.delete(`region-${region.id}`); }} busy={busy || Boolean(leadershipId) || Boolean(editing)} status={region.status} onEdit={() => setEditing(beginRegionEdit(region))} onStatus={status => void setRegionStatus(region, status)} />
            </>}
          </div>;
        })}{editing?.kind === 'region' && editing.review?.latest === null && !regions.some(region => region.id === editing.id) && <div className="py-3 text-xs"><RegistryEditForm editing={editing} regions={regions} activeRegions={activeRegions} busy={Boolean(pending)} onChange={setEditing} onSave={saveEdit} onCancel={() => finishEditing(editing)} onDiscard={discardDraft} onReapply={reapplyDraft} /></div>}</div>
      </div>
      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="text-base font-semibold text-neutral-900">Districts <span className="text-sm font-normal text-neutral-500">({visibleDistricts.length})</span></h3>
        <label className="block text-sm font-medium text-neutral-700">Filter by Region<select disabled={busy || Boolean(editing) || Boolean(leadershipId)} value={regionFilter} onChange={event => setRegionFilter(event.target.value)} className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5"><option value="">All Regions</option>{sortedRegions.map(region => <option key={region.id} value={region.id}>{region.name}{region.status === 'Retired' ? ' · Retired' : ''}</option>)}</select></label>
        <details className="rounded-lg bg-neutral-50 p-3"><summary className="cursor-pointer text-sm font-semibold text-neutral-700">Add District</summary><fieldset disabled={busy || Boolean(leadershipId)} className="mt-3 space-y-3">
        <label className="block text-xs font-medium text-neutral-700">District ID<input value={districtId} disabled={Boolean(pending)} onChange={event => setDistrictId(event.target.value)} placeholder="e.g. 01" className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm" /></label>
        <label className="block text-xs font-medium text-neutral-700">District Name<input value={districtName} disabled={Boolean(pending)} onChange={event => setDistrictName(event.target.value)} placeholder="Enter approved District name" className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" /></label>
        <label className="block text-xs font-medium text-neutral-700">Parent Region<select value={districtRegionId} disabled={Boolean(pending)} onChange={event => setDistrictRegionId(event.target.value)} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"><option value="">Select Region</option>{activeRegions.map(region => <option key={region.id} value={region.id}>{region.name} ({region.id})</option>)}</select></label>
        <button type="button" disabled={Boolean(pending)} onClick={() => void saveNewDistrict()} className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Add District</button>
        </fieldset></details>
        <div className="divide-y divide-neutral-100 border-t border-neutral-200 pt-2">{visibleDistricts.length === 0 ? <p className="py-4 text-sm text-neutral-500">No Districts in this view. Choose another Region or add a District.</p> : visibleDistricts.map(district => {
          const parent = regions.find(region => region.id === district.regionId);
          const isEditing = editing?.kind === 'district' && editing.id === district.id;
          const owned = hasDistrictLeadership(district);
          const manager = people.find(person => person.id === district.districtManagerId);
          return <div key={district.id} role="group" aria-label={`District ${district.name}`} className="space-y-3 py-5 text-sm">
            {isEditing ? <RegistryEditForm editing={editing} regions={regions} activeRegions={activeRegions} busy={Boolean(pending)} onChange={setEditing} onSave={saveEdit} onCancel={() => finishEditing(editing)} onDiscard={discardDraft} onReapply={reapplyDraft} /> : <>
              <RegistryIdentity id={district.id} name={district.name} status={district.status} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-neutral-600"><dt>Region ID</dt><dd className="font-mono text-neutral-900">{district.regionId}</dd><dt>Region Name</dt><dd>{parent ? `${parent.name}${parent.status === 'Retired' ? ' - Retired/unavailable' : ''}` : 'Missing registry record - Unavailable'}</dd></dl>
              <div className={`rounded-lg px-3 py-2 ${owned ? 'bg-neutral-50' : 'bg-amber-50'}`}><p className="text-xs font-medium text-neutral-500">District Manager</p><p className="mt-1 font-medium text-neutral-900">{owned ? (district.districtManagerId ? manager?.fullName || `Unresolved person [${district.districtManagerId}]` : 'Vacant') : 'District assignment needs setup'}</p><p className="mt-1 text-xs text-neutral-600">{locations.filter(location => isDistrictLeadershipMember(location, district.id)).length} linked retail stores · {owned ? 'Inherited by stores' : 'Existing store assignments preserved until reviewed'}</p></div>
              <div className="flex flex-wrap items-center gap-4">
                {legacyLeadershipEnabled && <button type="button" aria-expanded={leadershipId === district.id} disabled={busy || Boolean(editing) || Boolean(leadershipId && leadershipId !== district.id) || district.status !== 'Active' || parent?.status !== 'Active'} onClick={() => setLeadershipId(leadershipId === district.id ? null : district.id)} className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50">{leadershipId === district.id ? 'Close manager settings' : owned ? 'Change District Manager' : 'Set up District Manager'}</button>}
                <RegistryActions editButtonRef={element => { if (element) editButtonRefs.current.set(`district-${district.id}`, element); else editButtonRefs.current.delete(`district-${district.id}`); }} busy={busy || Boolean(leadershipId) || Boolean(editing)} status={district.status} onEdit={() => setEditing(beginDistrictEdit(district))} onStatus={status => void setDistrictStatus(district, status)} />
              </div>
              {legacyLeadershipEnabled && leadershipId === district.id && <DistrictLeadershipPanel key={district.id} districtId={district.id} onBusyChange={setLeadershipBusy} />}
            </>}
          </div>;
        })}{editing?.kind === 'district' && editing.review?.latest === null && !districts.some(district => district.id === editing.id) && <div className="py-3 text-xs"><RegistryEditForm editing={editing} regions={regions} activeRegions={activeRegions} busy={Boolean(pending)} onChange={setEditing} onSave={saveEdit} onCancel={() => finishEditing(editing)} onDiscard={discardDraft} onReapply={reapplyDraft} /></div>}</div>
      </div>
    </div>
  </section>;
}

function FeedbackMessage({ feedback, onRefresh, disabled }: { feedback: Feedback; onRefresh: () => void; disabled: boolean }) {
  return <div role={feedback.tone === 'error' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-xs ${feedback.tone === 'error' ? 'border-red-200 bg-red-50 text-red-900' : feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
    <p>{feedback.message}</p>
    {feedback.correction && <p className="mt-1 font-medium">{feedback.correction}</p>}
    {feedback.dependencies && feedback.dependencies.length > 0 && <ul className="mt-2 space-y-1">{feedback.dependencies.map(item => <li key={`${item.type}-${item.id}`}>{item.href ? <a href={item.href} className="font-semibold underline">{item.name}{item.storeNumber ? ` (Store ${item.storeNumber})` : ''}</a> : <span className="font-semibold">{item.name} ({item.id})</span>} <span className="font-mono">{item.id}</span></li>)}</ul>}
    {feedback.refresh && <button type="button" disabled={disabled} onClick={onRefresh} className="mt-2 inline-flex items-center gap-1 font-semibold underline disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" />Refresh saved values and review</button>}
  </div>;
}

function RegistryIdentity({ id, name, status }: { id: string; name: string; status: 'Active' | 'Retired' }) {
  return <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-base font-semibold text-neutral-900">{name}</p><p className="mt-1 text-xs text-neutral-500">ID <span className="font-mono">{id}</span></p></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status === 'Active' ? 'bg-emerald-50 text-emerald-800' : 'bg-neutral-100 text-neutral-600'}`}>{status}</span></div>;
}

function RegistryActions({ editButtonRef, busy, status, onEdit, onStatus }: { editButtonRef: React.Ref<HTMLButtonElement>; busy: boolean; status: 'Active' | 'Retired'; onEdit: () => void; onStatus: (status: 'Active' | 'Retired') => void }) {
  return <div className="flex flex-wrap gap-3"><button ref={editButtonRef} type="button" disabled={busy} onClick={onEdit} className="inline-flex items-center gap-1 font-semibold text-neutral-700 hover:text-neutral-950 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" />Edit</button>{status === 'Active' ? <button type="button" disabled={busy} onClick={() => onStatus('Retired')} className="inline-flex items-center gap-1 text-neutral-600 hover:text-red-700 disabled:opacity-50"><Archive className="h-3.5 w-3.5" />Retire</button> : <button type="button" disabled={busy} onClick={() => onStatus('Active')} className="text-neutral-600 hover:text-neutral-900 disabled:opacity-50">Reactivate</button>}</div>;
}

function RegistryEditForm({ editing, regions, activeRegions, busy, onChange, onSave, onCancel, onDiscard, onReapply }: { editing: RegistryEditState; regions: RegionRecord[]; activeRegions: RegionRecord[]; busy: boolean; onChange: (value: RegistryEditState) => void; onSave: () => Promise<void>; onCancel: () => void; onDiscard: () => void; onReapply: () => void }) {
  const managed = requiresManagedHierarchyReview(editing.original) || requiresManagedHierarchyReview(editing.review?.latest) || editing.kind === 'district' && [editing.original.regionId, editing.regionId, editing.review?.latest && 'regionId' in editing.review.latest ? editing.review.latest.regionId : undefined].some(id => requiresManagedHierarchyReview(regions.find(r => r.id === id)));
  const currentParent = editing.kind === 'district' ? regions.find(region => region.id === editing.regionId) : undefined;
  const missingCurrentParent = editing.kind === 'district' && !currentParent;
  const regionOptions = editing.kind === 'district' && !activeRegions.some(region => region.id === editing.regionId)
    ? [{ id: editing.regionId, name: currentParent?.name || 'Missing registry record', status: currentParent?.status || 'Retired' as const }, ...activeRegions]
    : activeRegions;
  const latest = editing.review?.latest;
  return <div className="space-y-2">
    <label className="block font-medium text-neutral-700">{editing.kind === 'region' ? 'Region' : 'District'} ID<input value={editing.id} readOnly aria-readonly="true" className="mt-1 w-full rounded-md border border-neutral-200 bg-neutral-100 px-3 py-2 font-mono text-sm text-neutral-600" /></label>
    <label className="block font-medium text-neutral-700">Name<input autoFocus value={editing.name} disabled={busy} onChange={event => onChange({ ...editing, name: event.target.value })} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" /></label>
    {editing.kind === 'district' && <label className="block font-medium text-neutral-700">Parent Region<select aria-label="Parent Region" value={editing.regionId} disabled={busy || Boolean(editing.review) || managed} onChange={event => onChange({ ...editing, regionId: event.target.value })} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50">{regionOptions.map(region => <option key={region.id} value={region.id} disabled={editing.kind === 'district' && region.id !== editing.original.regionId && requiresManagedHierarchyReview(region)}>{region.name} ({region.id}){missingCurrentParent && region.id === editing.regionId ? ' - Missing/unavailable' : region.status === 'Retired' ? ' - Retired/unavailable' : ''}</option>)}</select>{managed && <span className="mt-1 block text-xs font-normal text-neutral-500">To change Region, finish this name edit and use Store & District moves above.</span>}</label>}
    {editing.kind === 'district' && managed && editing.regionId !== editing.original.regionId && <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-950"><p>This parent change requires a separate move review. Your name draft can still be saved.</p><button type="button" disabled={busy || Boolean(editing.review)} onClick={() => onChange({ ...editing, regionId: editing.original.regionId })} className="mt-2 font-semibold underline disabled:opacity-50">Keep saved Region and name draft</button></div>}
    {editing.review && <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950" role="status">
      {latest ? <><p className="font-semibold">A newer saved version is available.</p><dl className="grid grid-cols-[auto_1fr] gap-x-2"><dt>Saved name</dt><dd>{latest.name}</dd>{editing.kind === 'district' && 'regionId' in latest && <><dt>Saved parent</dt><dd>{latest.regionId}</dd></>}</dl><p>Your draft remains: {editing.name}{editing.kind === 'district' ? ` (${editing.regionId})` : ''}.</p></> : <p className="font-semibold">This record is no longer available. It cannot be updated or recreated from this edit.</p>}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={onDiscard} className="font-semibold underline">Discard draft and use latest</button>{latest && <button type="button" disabled={busy} onClick={onReapply} className="font-semibold underline">Reapply draft to latest version</button>}</div>
    </div>}
    <p className="text-neutral-500">The ID is read-only because Locations and other applications depend on it.</p>
    <div className="flex gap-3"><button type="button" disabled={busy || Boolean(editing.review)} onClick={() => void onSave()} className="inline-flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-2 font-semibold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" />Save</button><button type="button" disabled={busy} onClick={onCancel} className="inline-flex items-center gap-1 px-2 py-2 font-semibold text-neutral-700 disabled:opacity-50"><X className="h-3.5 w-3.5" />Cancel</button></div>
  </div>;
}

function EmptyRegistry() {
  return <p className="py-3 text-xs text-neutral-500">No records yet.</p>;
}

function compareRegistryRecords(left: { id: string; name: string }, right: { id: string; name: string }) {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

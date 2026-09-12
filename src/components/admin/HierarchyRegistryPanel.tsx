import React, { useMemo, useState } from 'react';
import { Building2, Plus, Save, Archive } from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import type { DistrictRecord, RegionRecord } from '../../types';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function HierarchyRegistryPanel() {
  const { currentUser, regions, districts, saveRegion, saveDistrict } = useDirectory();
  const [regionId, setRegionId] = useState('');
  const [regionName, setRegionName] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [districtName, setDistrictName] = useState('');
  const [districtRegionId, setDistrictRegionId] = useState('');
  const [message, setMessage] = useState('');
  const activeRegions = useMemo(() => regions.filter(region => region.status === 'Active').sort((a, b) => a.name.localeCompare(b.name)), [regions]);

  if (currentUser.role !== 'System Administrator') {
    return <p className="text-sm text-neutral-600">Only System Administrators can manage Regions and Districts.</p>;
  }

  const saveNewRegion = async () => {
    if (!ID_PATTERN.test(regionId) || !regionName.trim()) {
      setMessage('Enter a stable ID using letters, numbers, dots, underscores, or hyphens, and a Region name.');
      return;
    }
    try {
      await saveRegion({ id: regionId.trim(), name: regionName.trim(), status: 'Active' }, true);
      setRegionId(''); setRegionName(''); setMessage('Region saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Region could not be saved.'); }
  };

  const saveNewDistrict = async () => {
    if (!ID_PATTERN.test(districtId) || !districtName.trim() || !districtRegionId) {
      setMessage('Enter a stable ID, a District name, and its Region.');
      return;
    }
    try {
      await saveDistrict({ id: districtId.trim(), name: districtName.trim(), regionId: districtRegionId, status: 'Active' }, true);
      setDistrictId(''); setDistrictName(''); setDistrictRegionId(''); setMessage('District saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'District could not be saved.'); }
  };

  const setRegionStatus = async (region: RegionRecord, status: RegionRecord['status']) => {
    try { await saveRegion({ ...region, status }, false); setMessage(`${region.name} ${status.toLowerCase()}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Region status could not be updated.'); }
  };

  const setDistrictStatus = async (district: DistrictRecord, status: DistrictRecord['status']) => {
    try { await saveDistrict({ ...district, status }, false); setMessage(`${district.name} ${status.toLowerCase()}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'District status could not be updated.'); }
  };

  return <section className="space-y-5" aria-label="Region and District registry">
    <div className="flex items-start gap-3 border-b border-neutral-200 pb-4">
      <Building2 className="h-5 w-5 text-red-700" aria-hidden="true" />
      <div><h2 className="text-base font-semibold text-neutral-900">Region & District Registry</h2><p className="mt-1 text-xs text-neutral-600">Start with the real organization. IDs are stable references; retirement preserves history for referenced records.</p></div>
    </div>
    {message && <p role="status" className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">{message}</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-900">Regions</h3>
        <label className="block text-xs font-medium text-neutral-700">Stable ID<input value={regionId} onChange={event => setRegionId(event.target.value)} placeholder="e.g. region-west" className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" /></label>
        <label className="block text-xs font-medium text-neutral-700">Name<input value={regionName} onChange={event => setRegionName(event.target.value)} placeholder="Enter approved Region name" className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" /></label>
        <button type="button" onClick={() => void saveNewRegion()} className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-xs font-semibold text-white"><Plus className="h-3.5 w-3.5" />Add Region</button>
        <RegistryList records={regions} onStatus={setRegionStatus} />
      </div>
      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-900">Districts</h3>
        <label className="block text-xs font-medium text-neutral-700">Stable ID<input value={districtId} onChange={event => setDistrictId(event.target.value)} placeholder="e.g. district-01" className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" /></label>
        <label className="block text-xs font-medium text-neutral-700">Name<input value={districtName} onChange={event => setDistrictName(event.target.value)} placeholder="Enter approved District name" className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" /></label>
        <label className="block text-xs font-medium text-neutral-700">Region<select value={districtRegionId} onChange={event => setDistrictRegionId(event.target.value)} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"><option value="">Select Region</option>{activeRegions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label>
        <button type="button" onClick={() => void saveNewDistrict()} className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-xs font-semibold text-white"><Save className="h-3.5 w-3.5" />Add District</button>
        <RegistryList records={districts} regionNames={regions} onStatus={setDistrictStatus} />
      </div>
    </div>
  </section>;
}

function RegistryList({ records, regionNames, onStatus }: { records: Array<RegionRecord | DistrictRecord>; regionNames?: RegionRecord[]; onStatus: (record: any, status: 'Active' | 'Retired') => Promise<void> }) {
  return <div className="divide-y divide-neutral-100 border-t border-neutral-200 pt-2">{records.length === 0 ? <p className="py-3 text-xs text-neutral-500">No records yet.</p> : records.map(record => <div key={record.id} className="flex items-center justify-between gap-2 py-2 text-xs"><span><strong className="text-neutral-900">{record.name}</strong> <span className="font-mono text-neutral-500">{record.id}</span>{'regionId' in record && <span className="text-neutral-500"> · {regionNames?.find(region => region.id === record.regionId)?.name || record.regionId}</span>}</span>{record.status === 'Active' ? <button type="button" onClick={() => void onStatus(record, 'Retired')} className="inline-flex shrink-0 items-center gap-1 text-neutral-600 hover:text-red-700"><Archive className="h-3.5 w-3.5" />Retire</button> : <button type="button" onClick={() => void onStatus(record, 'Active')} className="shrink-0 text-neutral-600 hover:text-neutral-900">Reactivate</button>}</div>)}</div>;
}

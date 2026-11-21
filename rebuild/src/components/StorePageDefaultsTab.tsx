import { useCallback, useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { COMPANY_TILE_KEYS, COMPANY_TILE_LABELS, type CompanyTileKey, type StorePageTileDefaults } from '../constants/storePage';
import { Dialog } from './Dialog';

interface DefaultsPayload {
  version: number;
  updatedAt: string | null;
  tiles: StorePageTileDefaults;
  defaultImage: { source: string; label: string };
}

export function StorePageDefaultsTab({ getIdToken }: { getIdToken: () => Promise<string> }) {
  const [defaults, setDefaults] = useState<DefaultsPayload | null>(null);
  const [draft, setDraft] = useState<StorePageTileDefaults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/admin/store-page-defaults', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error?.message || 'Couldn\'t load store page defaults.');
        return;
      }
      setDefaults(payload.data);
      setDraft(structuredClone(payload.data.tiles));
      setError(null);
    } catch {
      setError('Couldn\'t load store page defaults.');
    }
  }, [getIdToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!defaults || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/admin/store-page-defaults', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: defaults.version, tiles: draft }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error?.message || 'Couldn\'t save store page defaults.');
        return;
      }
      setConfirming(false);
      await load();
    } catch {
      setError('Couldn\'t save store page defaults.');
    } finally {
      setSaving(false);
    }
  };

  const update = (key: CompanyTileKey, field: string, value: string | boolean) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        [key]: { ...current[key], [field]: value },
      };
    });
  };

  if (!draft || !defaults) {
    return <p className="text-sm text-gray-600">{error || 'Loading store page defaults...'}</p>;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Store page defaults</h2>
        <p className="text-sm text-gray-600">Six fixed company tiles. Stores cannot add, remove, or reorder them. The shop tile is not here. Dynamic QR builds it from the Magento store ID.</p>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <div className="space-y-4">
        {COMPANY_TILE_KEYS.map((key) => {
          const row = draft[key];
          return (
            <div key={key} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium text-gray-900">{COMPANY_TILE_LABELS[key]}</h3>
                <span className="inline-flex items-center gap-1 text-sm text-gray-500">
                  <Lock className="w-4 h-4" aria-hidden="true" />
                  Fixed tile
                </span>
              </div>
              <label className="block text-sm text-gray-700" htmlFor={`tile-${key}-label`}>Label</label>
              <input
                id={`tile-${key}-label`}
                value={row.label}
                onChange={(event) => update(key, 'label', event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
              />
              {key === 'app' ? (
                <>
                  <label className="block text-sm text-gray-700" htmlFor="tile-app-ios">App Store link</label>
                  <input id="tile-app-ios" value={draft.app.iosUrl || ''} onChange={(event) => update('app', 'iosUrl', event.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]" />
                  <label className="block text-sm text-gray-700" htmlFor="tile-app-android">Google Play link</label>
                  <input id="tile-app-android" value={draft.app.androidUrl || ''} onChange={(event) => update('app', 'androidUrl', event.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]" />
                  {!draft.app.iosUrl && !draft.app.androidUrl && <p className="text-sm text-gray-500">Not set</p>}
                  <p className="text-sm text-gray-500">Hidden on the public page until an App Store or Google Play link is saved.</p>
                </>
              ) : (
                <>
                  <label className="block text-sm text-gray-700" htmlFor={`tile-${key}-url`}>URL</label>
                  <input
                    id={`tile-${key}-url`}
                    value={'url' in row ? (row.url || '') : ''}
                    onChange={(event) => update(key, 'url', event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
                  />
                  {'url' in row && !row.url && <p className="text-sm text-gray-500">Not set</p>}
                </>
              )}
              <label className="inline-flex items-center gap-2 min-h-[44px]">
                <input
                  type="checkbox"
                  checked={row.show}
                  onChange={(event) => update(key, 'show', event.target.checked)}
                  aria-label={`Show ${COMPANY_TILE_LABELS[key]}`}
                />
                Show on the store page
              </label>
            </div>
          );
        })}
      </div>
      <div className="rounded-lg border border-dashed border-gray-300 p-4">
        <p className="font-medium text-gray-900">Company default image · Set by Shiekh</p>
        <p className="text-sm text-gray-600">Hosted by Dynamic QR. This directory does not store an image URL.</p>
      </div>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="min-h-[44px] px-4 rounded-lg bg-blue-600 text-white font-medium"
      >
        Save store page defaults
      </button>
      <Dialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title="Save store page defaults"
        size="sm"
        footer={
          <div className="flex gap-3">
            <button type="button" onClick={() => setConfirming(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg min-h-[44px]">Cancel</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg min-h-[44px]">Yes, save</button>
          </div>
        }
      >
        <p className="text-gray-600">Save these company tiles for every store page? This is written to the change log.</p>
      </Dialog>
    </div>
  );
}

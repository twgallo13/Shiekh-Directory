import React, { useState } from 'react';
import { Archive, Check, Edit2, Plus, Save, X } from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { sortedCustomFields, type CustomFieldDefinition, type CustomFieldType } from '../../lib/customFields';

const emptyField = (): CustomFieldDefinition => ({ id: '', label: '', type: 'url', helpText: '', options: [], order: 0, apiVisible: false, retired: false });
const controlClass = 'w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 disabled:bg-neutral-100';

export function CustomFieldsPanel() {
  const { customFieldDefinitions, currentUser, saveCustomFieldDefinition } = useDirectory();
  const [draft, setDraft] = useState<CustomFieldDefinition | null>(null);
  const [editing, setEditing] = useState(false);
  const [choices, setChoices] = useState('');
  const [showRetired, setShowRetired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canManage = currentUser.role === 'System Administrator';
  const fields = sortedCustomFields(customFieldDefinitions).filter(field => showRetired || !field.retired);

  const openEditor = (field?: CustomFieldDefinition) => {
    setDraft(field ? { ...field } : emptyField());
    setEditing(Boolean(field)); setChoices(field?.options.join('\n') || ''); setError(''); setNotice('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      if (!editing && customFieldDefinitions.some(field => field.id === draft.id)) throw new Error('This field key already exists, including retired fields.');
      await saveCustomFieldDefinition({ ...draft, options: draft.type === 'select' ? choices.split('\n').map(choice => choice.trim()).filter(Boolean) : [] });
      setNotice(`${draft.label} saved.`); setDraft(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Custom field could not be saved.'); }
    finally { setSaving(false); }
  };

  return (
    <section className="min-w-0 space-y-5" aria-labelledby="custom-fields-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4">
        <h2 id="custom-fields-title" className="text-lg font-bold text-neutral-900">Custom Fields</h2>
        {canManage && <button type="button" disabled={Boolean(draft)} onClick={() => openEditor()} className="flex items-center gap-2 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Add field</button>}
      </div>
      {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
      {draft && (
        <form onSubmit={save} className="space-y-4 border-b border-neutral-200 pb-6">
          <h3 className="text-sm font-bold text-neutral-900">{editing ? `Edit ${draft.label}` : 'New field'}</h3>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">Field label<input required maxLength={80} value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} className={controlClass} /></label>
            <label className="space-y-1 text-sm font-medium">Permanent field key<input required disabled={editing} pattern="[a-z][A-Za-z0-9]{0,47}" maxLength={48} placeholder="yelpUrl" value={draft.id} onChange={event => setDraft({ ...draft, id: event.target.value })} className={controlClass} /></label>
            <label className="space-y-1 text-sm font-medium">Field type<select aria-label="Field type" disabled={editing} value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value as CustomFieldType })} className={controlClass}><option value="url">URL</option><option value="text">Text</option><option value="number">Number</option><option value="boolean">Checkbox</option><option value="select">Choice list</option></select></label>
            <label className="space-y-1 text-sm font-medium">Display order<input type="number" min={0} max={999} step={1} required value={draft.order} onChange={event => setDraft({ ...draft, order: Number(event.target.value) })} className={controlClass} /></label>
            <label className="space-y-1 text-sm font-medium sm:col-span-2">Help text<input maxLength={300} value={draft.helpText} onChange={event => setDraft({ ...draft, helpText: event.target.value })} className={controlClass} /></label>
            {draft.type === 'select' && <label className="space-y-1 text-sm font-medium sm:col-span-2">Choices (one per line)<textarea required rows={4} value={choices} onChange={event => setChoices(event.target.value)} className={controlClass} /></label>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.apiVisible} onChange={event => setDraft({ ...draft, apiVisible: event.target.checked })} />Expose in read-only API</label>
            {editing && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.retired} onChange={event => setDraft({ ...draft, retired: event.target.checked })} />Retired</label>}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save field'}</button>
            <button type="button" disabled={saving} onClick={() => setDraft(null)} className="flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm"><X className="h-4 w-4" />Cancel</button>
          </div>
        </form>
      )}
      <label className="flex items-center gap-2 text-sm text-neutral-600"><input type="checkbox" checked={showRetired} onChange={event => setShowRetired(event.target.checked)} />Show retired fields</label>
      <div className="divide-y divide-neutral-200">
        {fields.length === 0 && <p className="py-5 text-sm text-neutral-500">No {showRetired ? '' : 'active '}custom fields.</p>}
        {fields.map(field => (
          <div key={field.id} className="flex min-w-0 items-start justify-between gap-3 py-4">
            <div className="min-w-0 space-y-1">
              <h3 className="break-words text-sm font-semibold text-neutral-900">{field.label}</h3>
              <p className="break-all font-mono text-xs text-neutral-500">{field.id}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600"><span>{field.type}</span><span>{field.apiVisible && !field.retired ? 'API visible' : 'Internal only'}</span>{field.retired ? <span className="flex items-center gap-1"><Archive className="h-3 w-3" />Retired</span> : <span className="flex items-center gap-1"><Check className="h-3 w-3" />Active</span>}</div>
            </div>
            {canManage && <button type="button" disabled={Boolean(draft)} onClick={() => openEditor(field)} aria-label={`Edit ${field.label}`} title={`Edit ${field.label}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"><Edit2 className="h-4 w-4" /></button>}
          </div>
        ))}
      </div>
    </section>
  );
}
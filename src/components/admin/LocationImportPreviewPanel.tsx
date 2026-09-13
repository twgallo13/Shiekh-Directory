import React, { useRef, useState } from 'react';
import { AlertCircle, Download, FileSpreadsheet, Plus, Upload } from 'lucide-react';
import type { SessionUser } from '../../lib/authSession';
import type { LocationImportPreview } from '../../lib/locationImportPreview';
import { downloadLocationImportTemplate, previewLocationImport } from '../../lib/locationImportPreviewClient';

interface LocationImportPreviewPanelProps {
  user: SessionUser | null;
  onAddStore(): void;
}

export function LocationImportPreviewPanel({ user, onAddStore }: LocationImportPreviewPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<LocationImportPreview | null>(null);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState<'template' | 'preview' | null>(null);
  const [error, setError] = useState('');

  const downloadTemplate = async () => {
    if (!user || busy) return;
    setBusy('template');
    setError('');
    try {
      await downloadLocationImportTemplate(user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Location import template could not be downloaded.');
    } finally {
      setBusy(null);
    }
  };

  const selectFile = async (file: File | undefined) => {
    if (!user || !file || busy) return;
    setBusy('preview');
    setError('');
    setPreview(null);
    setFilename(file.name);
    try {
      setPreview(await previewLocationImport(user, file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Location import preview could not be generated.');
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs md:col-span-2">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-200">
            <Upload className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Preview Location CSV Import</h3>
            <p className="text-xs text-neutral-500">Review proposed changes and blockers without saving data</p>
          </div>
        </div>
        <button type="button" onClick={onAddStore} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-xs">
          <Plus className="w-3.5 h-3.5" />
          <span>Add Store</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!user || Boolean(busy)} onClick={() => void downloadTemplate()} className="flex items-center gap-2 px-3.5 py-2 border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 rounded-lg text-xs font-semibold disabled:opacity-50">
          <Download className="w-4 h-4" />
          <span>{busy === 'template' ? 'Downloading...' : 'Download Template'}</span>
        </button>
        <button type="button" disabled={!user || Boolean(busy)} onClick={() => inputRef.current?.click()} className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
          <FileSpreadsheet className="w-4 h-4" />
          <span>{busy === 'preview' ? 'Building Preview...' : 'Upload CSV'}</span>
        </button>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Upload Location CSV" onChange={event => void selectFile(event.target.files?.[0])} />
        <span className="self-center text-[11px] text-neutral-500">Schema locations-v1 · Maximum 2 MB</span>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

      {preview && (
        <div className="space-y-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-4">
            <div>
              <div className="text-xs font-semibold text-neutral-900">{filename}</div>
              <div className="text-[11px] text-neutral-500">Preview only. No directory records were saved.</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Summary label="Rows" value={preview.summary.totalRows} />
            <Summary label="Additions" value={preview.summary.additions} tone="text-emerald-700" />
            <Summary label="Updates" value={preview.summary.updates} tone="text-blue-700" />
            <Summary label="Unchanged" value={preview.summary.unchanged} />
            <Summary label="Blocked" value={preview.summary.blocked} tone="text-red-700" />
          </div>
          {preview.rows.length === 0 ? (
            <p className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">The CSV contains no data rows.</p>
          ) : (
            <div className="overflow-x-auto border border-neutral-200 rounded-lg">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-600">
                  <tr><th className="px-3 py-2 font-semibold">Row</th><th className="px-3 py-2 font-semibold">Location</th><th className="px-3 py-2 font-semibold">Result</th><th className="px-3 py-2 font-semibold">Proposed changes</th></tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {preview.rows.map(row => (
                    <tr key={row.rowNumber} className="align-top">
                      <td className="px-3 py-3 text-neutral-500">{row.rowNumber}</td>
                      <td className="px-3 py-3"><div className="font-semibold text-neutral-900">{row.displayName}</div><div className="font-mono text-[11px] text-neutral-500">Store {row.storeNumber || 'not provided'}{row.locationId ? ` · ${row.locationId}` : ''}</div></td>
                      <td className="px-3 py-3"><span className={`font-semibold ${row.action === 'blocked' ? 'text-red-700' : row.action === 'add' ? 'text-emerald-700' : row.action === 'update' ? 'text-blue-700' : 'text-neutral-600'}`}>{labelAction(row.action)}</span>{row.issues.map((issue, index) => <div key={`${issue.code}-${index}`} className="mt-1 max-w-xs text-[11px] leading-4 text-red-700">{issue.message}</div>)}</td>
                      <td className="px-3 py-3">{row.changes.length === 0 ? <span className="text-neutral-500">No field changes</span> : <div className="space-y-1.5">{row.changes.map(change => <div key={change.field}><span className="font-mono text-[11px] font-semibold text-neutral-700">{change.field}</span><div className="text-[11px] text-neutral-600"><span className="line-through">{formatValue(change.before)}</span> <span aria-hidden="true">→</span> <span className="font-medium text-neutral-900">{formatValue(change.after)}</span></div></div>)}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Summary({ label, value, tone = 'text-neutral-900' }: { label: string; value: number; tone?: string }) {
  return <div className="border-l-2 border-neutral-200 pl-2"><div className={`text-lg font-bold ${tone}`}>{value}</div><div className="text-[11px] text-neutral-500">{label}</div></div>;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (Array.isArray(value)) return value.length ? value.join('; ') : 'None';
  return String(value);
}

function labelAction(action: LocationImportPreview['rows'][number]['action']) {
  return action === 'add' ? 'Addition' : action === 'update' ? 'Update' : action === 'blocked' ? 'Blocked' : 'Unchanged';
}
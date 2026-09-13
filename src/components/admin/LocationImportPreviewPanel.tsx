import React, { useRef, useState } from 'react';
import { AlertCircle, BookOpen, Download, FileSpreadsheet, Plus, Upload } from 'lucide-react';
import type { SessionUser } from '../../lib/authSession';
import type { LocationImportPreview } from '../../lib/locationImportPreview';
import { LOCATION_IMPORT_FIELDS } from '../../lib/locationImportSchema';
import { downloadLocationImportResource, previewLocationImport, type LocationImportDownload } from '../../lib/locationImportPreviewClient';

interface LocationImportPreviewPanelProps {
  user: SessionUser | null;
  onAddStore(): void;
}

export function LocationImportPreviewPanel({ user, onAddStore }: LocationImportPreviewPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<LocationImportPreview | null>(null);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState<LocationImportDownload | 'preview' | null>(null);
  const [error, setError] = useState('');

  const downloadResource = async (resource: LocationImportDownload) => {
    if (!user || busy) return;
    setBusy(resource);
    setError('');
    try {
      await downloadLocationImportResource(user, resource);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Location import guidance could not be downloaded.');
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

      <section aria-labelledby="location-import-before-start" className="border-y border-neutral-200 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-blue-700" />
          <h4 id="location-import-before-start" className="text-sm font-bold text-neutral-900">Before you start</h4>
        </div>
        <div className="grid gap-3 text-xs leading-5 text-neutral-700 md:grid-cols-2">
          <div>
            <div className="font-semibold text-neutral-900">Scope and access</div>
            <p>Locations only and preview only. Nothing is saved, IDs are not reserved, and a future save must recheck current records, versions, and authorization. System Administrators, Directory Data Stewards, and Editors need company-wide scope.</p>
          </div>
          <div>
            <div className="font-semibold text-neutral-900">Setup order</div>
            <p>Regions → Districts → Locations → People → leadership assignments. You may preview a new Location without leadership IDs while People are established; People cannot be created or edited here.</p>
          </div>
          <div>
            <div className="font-semibold text-neutral-900">Identity and blanks</div>
            <p>Updates match an exact Location ID, or a unique digits-only Store Number when Location ID is blank. Leading zeros are ignored only for matching. Blank cells preserve existing values; explicit clearing is not supported.</p>
          </div>
          <div>
            <div className="font-semibold text-neutral-900">Use the supported files</div>
            <p>Replace every synthetic or REPLACE_WITH value in the worked example with Reference IDs. Export All Stores is neither import-compatible nor a complete backup.</p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!user || Boolean(busy)} onClick={() => void downloadResource('template')} className="flex items-center gap-2 px-3.5 py-2 border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 rounded-lg text-xs font-semibold disabled:opacity-50">
          <Download className="w-4 h-4" />
          <span>{busy === 'template' ? 'Downloading...' : 'Blank Template'}</span>
        </button>
        <button type="button" disabled={!user || Boolean(busy)} onClick={() => void downloadResource('example')} className="flex items-center gap-2 px-3.5 py-2 border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 rounded-lg text-xs font-semibold disabled:opacity-50">
          <Download className="w-4 h-4" />
          <span>{busy === 'example' ? 'Downloading...' : 'Worked Example'}</span>
        </button>
        <button type="button" disabled={!user || Boolean(busy)} onClick={() => void downloadResource('fields')} className="flex items-center gap-2 px-3.5 py-2 border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 rounded-lg text-xs font-semibold disabled:opacity-50">
          <Download className="w-4 h-4" />
          <span>{busy === 'fields' ? 'Downloading...' : 'Field Dictionary'}</span>
        </button>
        <button type="button" disabled={!user || Boolean(busy)} onClick={() => void downloadResource('references')} className="flex items-center gap-2 px-3.5 py-2 border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 rounded-lg text-xs font-semibold disabled:opacity-50">
          <Download className="w-4 h-4" />
          <span>{busy === 'references' ? 'Downloading...' : 'Reference IDs'}</span>
        </button>
        <button type="button" disabled={!user || Boolean(busy)} onClick={() => inputRef.current?.click()} className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
          <FileSpreadsheet className="w-4 h-4" />
          <span>{busy === 'preview' ? 'Building Preview...' : 'Upload CSV'}</span>
        </button>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Upload Location CSV" onChange={event => void selectFile(event.target.files?.[0])} />
        <span className="self-center text-[11px] text-neutral-500">Schema locations-v1 · Maximum 2 MB</span>
      </div>

      <details className="border-t border-neutral-200 pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-neutral-800">View field dictionary</summary>
        <div className="mt-3 overflow-x-auto border border-neutral-200 rounded-lg">
          <table className="w-full min-w-[900px] text-left text-[11px]">
            <thead className="bg-neutral-50 text-neutral-600"><tr><th className="px-3 py-2">Header</th><th className="px-3 py-2">Purpose</th><th className="px-3 py-2">Additions</th><th className="px-3 py-2">Updates</th><th className="px-3 py-2">Format / allowed values</th></tr></thead>
            <tbody className="divide-y divide-neutral-200">{LOCATION_IMPORT_FIELDS.map(field => <tr key={field.column} className="align-top"><td className="px-3 py-2 font-mono font-semibold">{field.column}</td><td className="px-3 py-2">{field.purpose}</td><td className="px-3 py-2">{field.additions}</td><td className="px-3 py-2">{field.updates}</td><td className="px-3 py-2">{field.allowedValues?.join(' | ') || field.format}</td></tr>)}</tbody>
          </table>
        </div>
      </details>

      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

      {preview && (
        <div className="space-y-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-4">
            <div>
              <div className="text-xs font-semibold text-neutral-900">{filename}</div>
              <div className="text-[11px] text-neutral-500">Preview only. No directory records were saved.</div>
              <div className="text-[11px] text-neutral-500">Snapshot read {new Date(preview.snapshotReadAt).toLocaleString()}. A future save must rebuild the preview and revalidate current records, versions, and authorization.</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Summary label="Rows" value={preview.summary.totalRows} />
            <Summary label="Additions" value={preview.summary.additions} tone="text-emerald-700" />
            <Summary label="Updates" value={preview.summary.updates} tone="text-blue-700" />
            <Summary label="Unchanged" value={preview.summary.unchanged} />
            <Summary label="Blocked" value={preview.summary.blocked} tone="text-red-700" />
            {preview.summary.warnings > 0 && <Summary label="Warnings" value={preview.summary.warnings} tone="text-amber-700" />}
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
                      <td className="px-3 py-3">
                        <span className={`font-semibold ${row.action === 'blocked' ? 'text-red-700' : row.action === 'add' ? 'text-emerald-700' : row.action === 'update' ? 'text-blue-700' : 'text-neutral-600'}`}>{labelAction(row.action)}</span>
                        {row.issues.map((issue, index) => (
                          <div key={`${issue.code}-${index}`} className={`mt-2 max-w-sm border-l-2 pl-2 text-[11px] leading-4 ${issue.severity === 'error' ? 'border-red-300 text-red-800' : 'border-amber-300 text-amber-800'}`}>
                            <div className="font-semibold">{issue.severity === 'error' ? 'Blocking error' : 'Warning'} · {issue.field}</div>
                            <div>Supplied: {formatValue(issue.suppliedValue)}</div>
                            {issue.currentValue !== null && <div>Current: {formatValue(issue.currentValue)}</div>}
                            <div>{issue.reason}</div>
                            {issue.candidates && <div>Candidates: {issue.candidates.join(' | ')}</div>}
                            <div className="font-medium">Next: {issue.correction}</div>
                          </div>
                        ))}
                      </td>
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
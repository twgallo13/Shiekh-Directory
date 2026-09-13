import React, { useRef, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, Download, ExternalLink, FileSpreadsheet, Plus, Upload } from 'lucide-react';
import type { LocationRecord } from '../../types';
import type { SessionUser } from '../../lib/authSession';
import type { LocationImportPreview, LocationImportReceipt } from '../../lib/locationImportPreview';
import { LOCATION_IMPORT_FIELDS } from '../../lib/locationImportSchema';
import { locationPath } from '../../lib/navigation';
import { confirmLocationImport, downloadLocationImportResource, LocationImportRequestError, previewLocationImport, type LocationImportDownload } from '../../lib/locationImportPreviewClient';

interface LocationImportPreviewPanelProps {
  user: SessionUser | null;
  onAddStore(): void;
  onLocationsConfirmed(records: LocationRecord[]): void;
}

export function LocationImportPreviewPanel({ user, onAddStore, onLocationsConfirmed }: LocationImportPreviewPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<LocationImportPreview | null>(null);
  const [csv, setCsv] = useState('');
  const [receipt, setReceipt] = useState<LocationImportReceipt | null>(null);
  const [warningsReviewed, setWarningsReviewed] = useState(false);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState<LocationImportDownload | 'preview' | 'confirm' | null>(null);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');

  const downloadResource = async (resource: LocationImportDownload) => {
    if (!user || busy) return;
    setBusy(resource);
    setError('');
    setErrorCode('');
    try {
      await downloadLocationImportResource(user, resource);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Location import guidance could not be downloaded.');
      setErrorCode(cause instanceof LocationImportRequestError ? cause.code : 'download_failed');
    } finally {
      setBusy(null);
    }
  };

  const selectFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setFilename(file.name);
    setPreview(null);
    setCsv('');
    setReceipt(null);
    setWarningsReviewed(false);
    if (!user) {
      setError('Sign in again before previewing this file.');
      setErrorCode('authentication_required');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setBusy('preview');
    setError('');
    setErrorCode('');
    try {
      const result = await previewLocationImport(user, file);
      setPreview(result.preview);
      setCsv(result.csv);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Location import preview could not be generated.');
      setErrorCode(cause instanceof LocationImportRequestError ? cause.code : 'preview_failed');
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!user || !preview?.confirmationToken || !preview.operationId || !csv || busy) return;
    setBusy('confirm');
    setError('');
    setErrorCode('');
    try {
      const result = await confirmLocationImport(user, {
        csv,
        confirmationToken: preview.confirmationToken,
        operationId: preview.operationId,
        warningsReviewed,
      });
      onLocationsConfirmed(result.locations.map(location => location.record));
      setReceipt(result);
    } catch (cause) {
      const code = cause instanceof LocationImportRequestError ? cause.code : 'confirmation_failed';
      setErrorCode(code);
      setError(code === 'confirmation_uncertain'
        ? 'The import outcome is uncertain. Retry the same import operation to retrieve its authoritative result without duplicating writes.'
        : cause instanceof Error ? cause.message : 'The Location import could not be confirmed.');
    } finally {
      setBusy(null);
    }
  };

  const changedRows = preview ? preview.summary.additions + preview.summary.updates : 0;
  const requiresNewPreview = ['confirmation_expired', 'confirmation_mismatch', 'confirmation_tampered', 'stale_preview', 'idempotency_conflict'].includes(errorCode);
  const eligibleForConfirmation = Boolean(preview
    && preview.summary.blocked === 0
    && changedRows > 0
    && preview.confirmationToken
    && preview.operationId
    && (!preview.summary.warnings || warningsReviewed)
    && !receipt
    && !requiresNewPreview);
  const confirmDisabledReason = receipt
    ? 'This import is already confirmed.'
    : requiresNewPreview
      ? 'The preview is stale or expired. Choose the CSV again to create a new preview.'
      : preview?.confirmationDisabledReason
        ? preview.confirmationDisabledReason
      : preview?.summary.blocked
        ? 'Resolve every blocked row and preview the entire batch again. Partial imports are not available.'
        : changedRows === 0
          ? 'There are no additions or updates to import.'
          : !preview?.confirmationToken || !preview.operationId
            ? 'This preview is read-only and cannot be confirmed.'
            : preview.summary.warnings > 0 && !warningsReviewed
              ? 'Review and acknowledge all warnings before confirming.'
              : busy ? 'Another import action is in progress.' : '';

  const disabledReason = !user
    ? 'Sign in to download resources or preview a Location CSV.'
    : busy
      ? busy === 'preview' ? `Previewing ${filename}. Controls are disabled until the request finishes.` : busy === 'confirm' ? `Importing ${filename}. Controls are disabled until confirmation finishes.` : 'A download is in progress. Controls are disabled until it finishes.'
      : '';

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs md:col-span-2">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-200">
            <Upload className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Location CSV Import</h3>
            <p className="text-xs text-neutral-500">Preview and review the complete batch before confirming</p>
          </div>
        </div>
        <button type="button" disabled={Boolean(busy)} title={busy ? 'Location import work is in progress.' : undefined} onClick={onAddStore} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50">
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
            <p>Locations only. Preview does not save data; confirmation atomically rechecks and saves the entire eligible batch. System Administrators, Directory Data Stewards, and Editors need company-wide scope.</p>
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
        <button type="button" disabled={!user || Boolean(busy)} title={disabledReason || undefined} onClick={() => void downloadResource('template')} className="flex items-center gap-2 px-3.5 py-2 border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 rounded-lg text-xs font-semibold disabled:opacity-50">
          <Download className="w-4 h-4" />
          <span>{busy === 'template' ? 'Downloading...' : 'Blank Template'}</span>
        </button>
        <button type="button" disabled={!user || Boolean(busy)} title={disabledReason || undefined} onClick={() => void downloadResource('example')} className="flex items-center gap-2 px-3.5 py-2 border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 rounded-lg text-xs font-semibold disabled:opacity-50">
          <Download className="w-4 h-4" />
          <span>{busy === 'example' ? 'Downloading...' : 'Worked Example'}</span>
        </button>
        <button type="button" disabled={!user || Boolean(busy)} title={disabledReason || undefined} onClick={() => void downloadResource('fields')} className="flex items-center gap-2 px-3.5 py-2 border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 rounded-lg text-xs font-semibold disabled:opacity-50">
          <Download className="w-4 h-4" />
          <span>{busy === 'fields' ? 'Downloading...' : 'Field Dictionary'}</span>
        </button>
        <button type="button" disabled={!user || Boolean(busy)} title={disabledReason || undefined} onClick={() => void downloadResource('references')} className="flex items-center gap-2 px-3.5 py-2 border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 rounded-lg text-xs font-semibold disabled:opacity-50">
          <Download className="w-4 h-4" />
          <span>{busy === 'references' ? 'Downloading...' : 'Reference IDs'}</span>
        </button>
        <button type="button" disabled={!user || Boolean(busy)} title={disabledReason || undefined} onClick={() => inputRef.current?.click()} className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
          <FileSpreadsheet className="w-4 h-4" />
          <span>{busy === 'preview' ? 'Building Preview...' : 'Upload CSV'}</span>
        </button>
        <input ref={inputRef} type="file" accept=".csv,text/csv" disabled={!user || Boolean(busy)} className="sr-only" aria-label="Upload Location CSV" onChange={event => void selectFile(event.target.files?.[0])} />
        <span className="self-center text-[11px] text-neutral-500">Schema locations-v1 · Maximum 2 MB</span>
      </div>

      {(disabledReason || filename) && (
        <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-600">
          {filename && <span className="font-semibold text-neutral-900">{filename}</span>}
          <span>{disabledReason || (preview ? 'Preview ready.' : error ? 'Preview failed. Correct the file and retry.' : 'File selected.')}</span>
        </div>
      )}

      <details className="border-t border-neutral-200 pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-neutral-800">View field dictionary</summary>
        <div className="mt-3 overflow-x-auto border border-neutral-200 rounded-lg">
          <table className="w-full min-w-[900px] text-left text-[11px]">
            <thead className="bg-neutral-50 text-neutral-600"><tr><th className="px-3 py-2">Header</th><th className="px-3 py-2">Purpose</th><th className="px-3 py-2">Additions</th><th className="px-3 py-2">Updates</th><th className="px-3 py-2">Format / allowed values</th></tr></thead>
            <tbody className="divide-y divide-neutral-200">{LOCATION_IMPORT_FIELDS.map(field => <tr key={field.column} className="align-top"><td className="px-3 py-2 font-mono font-semibold">{field.column}</td><td className="px-3 py-2">{field.purpose}</td><td className="px-3 py-2">{field.additions}</td><td className="px-3 py-2">{field.updates}</td><td className="px-3 py-2">{field.allowedValues?.join(' | ') || field.format}</td></tr>)}</tbody>
          </table>
        </div>
      </details>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="grow">{error}</span>
          {errorCode === 'directory_export_not_importable' && <button type="button" disabled={!user || Boolean(busy)} onClick={() => void downloadResource('template')} className="font-semibold underline disabled:opacity-50">Download Blank Template</button>}
          {errorCode === 'confirmation_uncertain' && <button type="button" disabled={!eligibleForConfirmation || Boolean(busy)} title={confirmDisabledReason || undefined} onClick={() => void confirmImport()} className="font-semibold underline disabled:opacity-50">Retry Same Import</button>}
          <button type="button" disabled={!user || Boolean(busy)} onClick={() => inputRef.current?.click()} className="font-semibold underline disabled:opacity-50">Choose File Again</button>
        </div>
      )}

      {preview && (
        <div className="space-y-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-4">
            <div>
              <div className="text-xs font-semibold text-neutral-900">{filename}</div>
              <div className="text-[11px] text-neutral-500">{receipt ? 'This batch was saved and reconciled with the directory.' : 'Preview only. No directory records have been saved yet.'}</div>
              <div className="text-[11px] text-neutral-500">Snapshot read {new Date(preview.snapshotReadAt).toLocaleString()}. Confirmation revalidates current records, versions, and authorization.</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            <Summary label="Rows" value={preview.summary.totalRows} />
            <Summary label="Additions" value={preview.summary.additions} tone="text-emerald-700" />
            <Summary label="Updates" value={preview.summary.updates} tone="text-blue-700" />
            <Summary label="Unchanged" value={preview.summary.unchanged} />
            <Summary label="Blocked" value={preview.summary.blocked} tone="text-red-700" />
            <Summary label="Warnings" value={preview.summary.warnings} tone="text-amber-700" />
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
                            <div>Proposed: {formatValue(issue.proposedValue)}</div>
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
          {!receipt && (
            <div className="space-y-3 border-y border-neutral-200 py-4">
              {preview.confirmationDisabledReason && <p className="text-xs font-medium text-amber-800">{preview.confirmationDisabledReason}</p>}
              {preview.summary.warnings > 0 && (
                <label className="flex items-start gap-2 text-xs text-neutral-700">
                  <input type="checkbox" checked={warningsReviewed} disabled={Boolean(busy)} onChange={event => setWarningsReviewed(event.target.checked)} className="mt-0.5" />
                  <span>I reviewed all {preview.summary.warnings} warnings and accept the displayed changes.</span>
                </label>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={!eligibleForConfirmation || Boolean(busy)} title={confirmDisabledReason || undefined} onClick={() => void confirmImport()} className="flex items-center gap-2 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{busy === 'confirm' ? 'Importing...' : 'Confirm Import'}</span>
                </button>
                <span className="text-[11px] text-neutral-500">The full batch is atomic. Blocked rows prevent every write.</span>
              </div>
            </div>
          )}
          {receipt && (
            <section role="status" aria-live="polite" className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
              <div className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-4 w-4" />Import complete</div>
              <div>Saved {receipt.additions} additions and {receipt.updates} updates; {receipt.unchanged} rows were unchanged.</div>
              {receipt.replayed && <div>This is the authoritative result of an idempotent replay. No duplicate writes were created.</div>}
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {receipt.locations.map(location => (
                  <a key={location.id} href={locationPath(location.record)} className="inline-flex items-center gap-1 font-semibold text-emerald-800 underline">
                    Store {location.storeNumber} · {location.name}<ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </section>
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
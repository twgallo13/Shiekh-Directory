import React, { useRef, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, Download, ExternalLink, FileSpreadsheet, Plus, Upload } from 'lucide-react';
import type { LocationRecord } from '../../types';
import type { SessionUser } from '../../lib/authSession';
import type { PreparedLocationEditingExport } from '../../lib/locationEditingExport';
import type { LocationImportPreview, LocationImportReceipt } from '../../lib/locationImportPreview';
import { LOCATION_IMPORT_FIELDS, LOCATION_IMPORT_WRITABLE_COLUMNS, type LocationImportHeaderMapping, type LocationImportMode } from '../../lib/locationImportSchema';
import { locationPath } from '../../lib/navigation';
import { confirmLocationImport, downloadLocationEditingExportPart, downloadLocationImportCorrections, downloadLocationImportResource, downloadLocationImportResults, inspectLocationImportFile, LocationImportRequestError, prepareLocationEditingExport, previewLocationImport, type LocationImportConfirmationOutcome, type LocationImportDownload } from '../../lib/locationImportPreviewClient';

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
  const [mappings, setMappings] = useState<LocationImportHeaderMapping[]>([]);
  const [mode, setMode] = useState<LocationImportMode>('add-and-update');
  const [mappingReviewed, setMappingReviewed] = useState(false);
  const [selectedRowNumbers, setSelectedRowNumbers] = useState<number[]>([]);
  const [selectionDirty, setSelectionDirty] = useState(false);
  const [confirmationOutcome, setConfirmationOutcome] = useState<LocationImportConfirmationOutcome>('pending');
  const [completedImport, setCompletedImport] = useState<{ preview: LocationImportPreview; receipt: LocationImportReceipt; filename: string } | null>(null);
  const [editingExport, setEditingExport] = useState<PreparedLocationEditingExport | null>(null);
  const [busy, setBusy] = useState<LocationImportDownload | 'editing-export' | `editing-part-${number}` | 'preview' | 'confirm' | null>(null);
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

  const prepareEditingExport = async () => {
    if (!user || busy) return;
    setBusy('editing-export');
    setError('');
    setErrorCode('');
    try {
      setEditingExport(await prepareLocationEditingExport(user));
    } catch (cause) {
      setEditingExport(null);
      setError(cause instanceof Error ? cause.message : 'The Location editing export could not be prepared.');
      setErrorCode(cause instanceof LocationImportRequestError ? cause.code : 'editing_export_failed');
    } finally {
      setBusy(null);
    }
  };

  const downloadEditingPart = async (partNumber: number) => {
    if (!user || !editingExport || busy) return;
    setBusy(`editing-part-${partNumber}`);
    setError('');
    setErrorCode('');
    try {
      await downloadLocationEditingExportPart(editingExport, partNumber);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Location editing export part could not be downloaded.');
      setErrorCode(cause instanceof LocationImportRequestError ? cause.code : 'editing_export_download_failed');
    } finally {
      setBusy(null);
    }
  };

  const selectFile = async (file: File | undefined) => {
    if (!file || busy || confirmationOutcome === 'uncertain') return;
    setFilename(file.name);
    setPreview(null);
    setCsv('');
    setReceipt(null);
    setWarningsReviewed(false);
    setMappings([]);
    setMappingReviewed(false);
    setSelectedRowNumbers([]);
    setSelectionDirty(false);
    setConfirmationOutcome('pending');
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
      const inspected = await inspectLocationImportFile(file);
      setCsv(inspected.csv);
      setMappings(inspected.mappings);
      setMode(inspected.mode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Location import preview could not be generated.');
      setErrorCode(cause instanceof LocationImportRequestError ? cause.code : 'preview_failed');
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const validatePreview = async (selection?: number[]) => {
    if (!user || !csv || !filename || busy || confirmationOutcome === 'uncertain') return;
    setBusy('preview');
    setError('');
    setErrorCode('');
    setReceipt(null);
    setConfirmationOutcome('pending');
    setWarningsReviewed(false);
    try {
      const result = await previewLocationImport(user, {
        csv,
        filename,
        mappings,
        mode,
        ...(selection === undefined ? {} : { selectedRowNumbers: selection }),
      });
      setPreview(result.preview);
      setMappings(result.preview.mappings || mappings);
      setSelectedRowNumbers(result.preview.selectedRowNumbers || []);
      setSelectionDirty(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Location import preview could not be generated.');
      setErrorCode(cause instanceof LocationImportRequestError ? cause.code : 'preview_failed');
    } finally {
      setBusy(null);
    }
  };

  const invalidateReview = () => {
    setPreview(null);
    setReceipt(null);
    setWarningsReviewed(false);
    setSelectedRowNumbers([]);
    setSelectionDirty(false);
    setConfirmationOutcome('pending');
  };

  const updateMapping = (sourceIndex: number, target: string) => {
    setMappings(current => current.map(mapping => mapping.sourceIndex === sourceIndex
      ? { ...mapping, target: target || null, kind: 'manual' }
      : mapping));
    setMappingReviewed(false);
    invalidateReview();
  };

  const updateMode = (nextMode: LocationImportMode) => {
    setMode(nextMode);
    invalidateReview();
  };

  const toggleSelectedRow = (rowNumber: number, selected: boolean) => {
    setSelectedRowNumbers(current => selected
      ? [...current, rowNumber].sort((left, right) => left - right)
      : current.filter(candidate => candidate !== rowNumber));
    setSelectionDirty(true);
    setReceipt(null);
    setConfirmationOutcome('pending');
    setWarningsReviewed(false);
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
        mappings,
        mode,
        selectedRowNumbers,
      });
      onLocationsConfirmed(result.locations.map(location => location.record));
      setReceipt(result);
      setCompletedImport({ preview: { ...preview, selectedRowNumbers: [...selectedRowNumbers] }, receipt: result, filename });
      setConfirmationOutcome('pending');
    } catch (cause) {
      const code = cause instanceof LocationImportRequestError ? cause.code : 'confirmation_failed';
      setConfirmationOutcome(code === 'confirmation_uncertain' ? 'uncertain' : 'rejected');
      setErrorCode(code);
      setError(code === 'confirmation_uncertain'
        ? 'The import outcome is uncertain. Retry the same import operation to retrieve its authoritative result without duplicating writes.'
        : cause instanceof Error ? cause.message : 'The Location import could not be confirmed.');
    } finally {
      setBusy(null);
    }
  };

  const changedRows = preview?.rows.filter(row => selectedRowNumbers.includes(row.rowNumber) && (row.action === 'add' || row.action === 'update')).length || 0;
  const selectedWarnings = preview?.rows.filter(row => selectedRowNumbers.includes(row.rowNumber)).flatMap(row => row.issues).filter(issue => issue.severity === 'warning').length || 0;
  const mappedTargets = mappings.flatMap(mapping => mapping.target ? [mapping.target] : []);
  const duplicateMappings = [...new Set(mappedTargets.filter((target, index) => mappedTargets.indexOf(target) !== index))];
  const mappingValid = mappings.length > 0 && duplicateMappings.length === 0 && mappedTargets.some(target => target === 'LocationId' || target === 'StoreNumber');
  const outcomeUnknown = confirmationOutcome === 'uncertain';
  const requiresNewPreview = ['confirmation_expired', 'confirmation_mismatch', 'confirmation_tampered', 'stale_preview', 'idempotency_conflict'].includes(errorCode);
  const eligibleForConfirmation = Boolean(preview
    && changedRows > 0
    && preview.confirmationToken
    && preview.operationId
    && (!selectedWarnings || warningsReviewed)
    && !receipt
    && !selectionDirty
    && !requiresNewPreview);
  const confirmDisabledReason = receipt
    ? 'This import is already confirmed.'
    : requiresNewPreview
      ? 'The preview is stale or expired. Choose the CSV again to create a new preview.'
      : preview?.confirmationDisabledReason
        ? preview.confirmationDisabledReason
      : selectionDirty
        ? 'The row selection changed. Revalidate the selected batch before importing.'
        : changedRows === 0
          ? 'Select at least one ready New or Updated row.'
          : !preview?.confirmationToken || !preview.operationId
            ? 'This preview is read-only and cannot be confirmed.'
            : selectedWarnings > 0 && !warningsReviewed
              ? 'Review and acknowledge warnings on the selected rows before confirming.'
              : busy ? 'Another import action is in progress.' : '';

  const disabledReason = !user
    ? 'Sign in to download resources or preview a Location CSV.'
    : outcomeUnknown
      ? 'The current import outcome is unknown. Retry the same operation before changing the file, mappings, mode, or selection.'
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
            <p className="text-xs text-neutral-500">Export, edit supported fields, preview, review, and confirm</p>
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
            <p>Locations only. Preview and downloads do not save data; confirmation atomically rechecks and saves only the selected ready rows. System Administrators, Directory Data Stewards, and Editors need company-wide scope.</p>
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
            <p>Application exports identify their reversible spreadsheet protection in the CSV heading. Ordinary uploads preserve leading apostrophes. Export All Stores names remain informational, and neither export is a complete backup.</p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!user || Boolean(busy)} title={disabledReason || undefined} onClick={() => void prepareEditingExport()} className="flex items-center gap-2 px-3.5 py-2 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold disabled:opacity-50">
          <Download className="w-4 h-4" />
          <span>{busy === 'editing-export' ? 'Preparing Export...' : 'Export for Editing'}</span>
        </button>
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
        <button type="button" disabled={!user || Boolean(busy) || outcomeUnknown} title={disabledReason || undefined} onClick={() => inputRef.current?.click()} className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
          <FileSpreadsheet className="w-4 h-4" />
          <span>{busy === 'preview' ? 'Building Preview...' : 'Upload CSV'}</span>
        </button>
        <input ref={inputRef} type="file" accept=".csv,text/csv" disabled={!user || Boolean(busy) || outcomeUnknown} className="sr-only" aria-label="Upload Location CSV" onChange={event => void selectFile(event.target.files?.[0])} />
        <span className="self-center text-[11px] text-neutral-500">Maximum 2 MB · 100 file rows · 40 selected changes · confirmation expires after 10 minutes</span>
      </div>

      {csv && mappings.length > 0 && (
        <section aria-labelledby="location-import-mapping" className="space-y-3 border-y border-neutral-200 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 id="location-import-mapping" className="text-sm font-bold text-neutral-900">Match CSV headings</h4>
              <p className="text-xs text-neutral-600">Review each suggestion. Choose Ignore for unsupported or informational columns. Keep the application encoding heading mapped when present; displayed District and leadership names never create relationships.</p>
            </div>
            <div className="inline-flex overflow-hidden rounded-lg border border-neutral-300" aria-label="Location import mode">
              <button type="button" disabled={Boolean(busy) || outcomeUnknown} onClick={() => updateMode('add-and-update')} className={`px-3 py-2 text-xs font-semibold ${mode === 'add-and-update' ? 'bg-blue-600 text-white' : 'bg-white text-neutral-700'}`}>Add and update</button>
              <button type="button" disabled={Boolean(busy) || outcomeUnknown} onClick={() => updateMode('update-existing-only')} className={`border-l border-neutral-300 px-3 py-2 text-xs font-semibold ${mode === 'update-existing-only' ? 'bg-blue-600 text-white' : 'bg-white text-neutral-700'}`}>Update existing only</button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {mappings.map(mapping => (
              <label key={`${mapping.sourceIndex}-${mapping.sourceHeader}`} className="text-xs text-neutral-700">
                <span className="mb-1 flex items-center justify-between gap-2"><span className="truncate font-semibold text-neutral-900">{mapping.sourceHeader || '(blank heading)'}</span><span className="text-[10px] uppercase text-neutral-500">{mapping.kind}</span></span>
                <select value={mapping.target || ''} disabled={Boolean(busy) || outcomeUnknown} onChange={event => updateMapping(mapping.sourceIndex, event.target.value)} className="w-full rounded-md border border-neutral-300 bg-white px-2 py-2 text-xs">
                  <option value="">Ignore</option>
                  {LOCATION_IMPORT_WRITABLE_COLUMNS.map(column => <option key={column} value={column}>{column}</option>)}
                </select>
              </label>
            ))}
          </div>
          {duplicateMappings.length > 0 && <p role="alert" className="text-xs font-medium text-red-700">Each target can be mapped once. Duplicates: {duplicateMappings.join(', ')}.</p>}
          {!mappedTargets.some(target => target === 'LocationId' || target === 'StoreNumber') && <p role="alert" className="text-xs font-medium text-red-700">Map LocationId or StoreNumber so every row has an identity field.</p>}
          <label className="flex items-start gap-2 text-xs text-neutral-700">
            <input type="checkbox" checked={mappingReviewed} disabled={!mappingValid || Boolean(busy) || outcomeUnknown} onChange={event => setMappingReviewed(event.target.checked)} className="mt-0.5" />
            <span>I reviewed every heading, including ignored informational and unsupported columns.</span>
          </label>
          <button type="button" disabled={!mappingValid || !mappingReviewed || Boolean(busy) || outcomeUnknown} onClick={() => void validatePreview()} className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            <CheckCircle2 className="h-4 w-4" />
            <span>{busy === 'preview' ? 'Validating...' : preview ? 'Validate Again' : 'Validate and Preview'}</span>
          </button>
        </section>
      )}

      {editingExport && (
        <section aria-labelledby="location-editing-export-results" className="space-y-3 border-y border-emerald-200 bg-emerald-50/40 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 id="location-editing-export-results" className="text-sm font-bold text-neutral-900">Editing export ready</h4>
              <p className="text-xs text-neutral-600">Snapshot {new Date(editingExport.snapshotReadAt).toLocaleString()} · {editingExport.totalRecords} Locations · {editingExport.parts.length} file{editingExport.parts.length === 1 ? '' : 's'}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-neutral-700">
              <span>Active {editingExport.lifecycleCounts.Active}</span>
              <span>Draft {editingExport.lifecycleCounts.Draft}</span>
              <span>Retired {editingExport.lifecycleCounts.Retired}</span>
              {editingExport.lifecycleCounts.unrecognized > 0 && <span className="text-red-700">Other {editingExport.lifecycleCounts.unrecognized}</span>}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {editingExport.parts.map(part => (
              <div key={part.partNumber} className="flex items-center justify-between gap-3 border border-neutral-200 bg-white p-3 rounded-lg">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-neutral-900">{part.filename}</div>
                  <div className="text-[11px] text-neutral-500">Part {part.partNumber} of {editingExport.parts.length} · {part.recordCount} records · {(part.byteCount / 1024).toFixed(1)} KB</div>
                </div>
                <button type="button" disabled={Boolean(busy)} title={busy ? 'Another Location CSV action is in progress.' : `Download ${part.filename}`} onClick={() => void downloadEditingPart(part.partNumber)} className="shrink-0 p-2 border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 rounded-lg disabled:opacity-50" aria-label={`Download editing export part ${part.partNumber}`}>
                  <Download className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="grid gap-2 text-[11px] leading-4 text-neutral-700 md:grid-cols-2">
            <p>Import each file independently. Each file contains at most 100 rows; confirmation still permits at most 40 changed rows in one batch.</p>
            <p>This snapshot has no export-time version lock. Preview compares with current data, and confirmation protects the reviewed preview only until it is submitted. Review every proposed change.</p>
            <p>Blank cells preserve current values, and removing a CSV row does not delete a Location. Unsupported fields remain outside this editing export, so it is not a full backup.</p>
            <p>Spreadsheet software may alter Store Number, ZIP Code, or Phone values. Import those columns as text; do not add formulas to force formatting.</p>
          </div>
          <p className="text-xs font-medium text-neutral-800">Immediate preview check: {editingExport.roundTrip.unchanged} unchanged, {editingExport.roundTrip.updates} updates, {editingExport.roundTrip.additions} additions, {editingExport.roundTrip.blocked} blocked, {editingExport.roundTrip.warnings} warnings.</p>
          {editingExport.diagnostics.length > 0 && (
            <details className="border-t border-neutral-200 pt-3">
              <summary className="cursor-pointer text-xs font-semibold text-amber-800">Review {editingExport.diagnostics.length} export diagnostic{editingExport.diagnostics.length === 1 ? '' : 's'}</summary>
              <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                {editingExport.diagnostics.map((diagnostic, index) => (
                  <div key={`${diagnostic.locationId}-${diagnostic.code}-${index}`} className="border-l-2 border-amber-300 bg-white px-3 py-2 text-[11px] text-neutral-700">
                    <div className="font-semibold text-neutral-900">Store {diagnostic.storeNumber || 'not provided'} · {diagnostic.locationId}</div>
                    <div>Fields: {diagnostic.fields.join(', ') || 'record'}</div>
                    <div>{diagnostic.message}</div>
                    {diagnostic.issues?.map((issue, issueIndex) => (
                      <div key={`${issue.code}-${issue.field}-${issueIndex}`} className="mt-1 border-l border-amber-200 pl-2">
                        <div>{issue.field}: {issue.reason}</div>
                        <div className="font-medium">Next: {issue.correction}</div>
                      </div>
                    ))}
                    <div className="font-medium">Next: {diagnostic.guidance}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}

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
          {!outcomeUnknown && <button type="button" disabled={!user || Boolean(busy)} onClick={() => inputRef.current?.click()} className="font-semibold underline disabled:opacity-50">Choose File Again</button>}
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
                  <tr><th className="px-3 py-2 font-semibold">Select</th><th className="px-3 py-2 font-semibold">Row</th><th className="px-3 py-2 font-semibold">Location</th><th className="px-3 py-2 font-semibold">Result</th><th className="px-3 py-2 font-semibold">Proposed changes</th></tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {preview.rows.map(row => (
                    <tr key={row.rowNumber} className="align-top">
                      <td className="px-3 py-3"><input type="checkbox" aria-label={`Select CSV row ${row.rowNumber}`} checked={selectedRowNumbers.includes(row.rowNumber)} disabled={Boolean(busy) || outcomeUnknown || (row.action !== 'add' && row.action !== 'update')} onChange={event => toggleSelectedRow(row.rowNumber, event.target.checked)} /></td>
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
              {selectedWarnings > 0 && (
                <label className="flex items-start gap-2 text-xs text-neutral-700">
                  <input type="checkbox" checked={warningsReviewed} disabled={Boolean(busy)} onChange={event => setWarningsReviewed(event.target.checked)} className="mt-0.5" />
                  <span>I reviewed all {selectedWarnings} warnings on the selected rows and accept the displayed changes.</span>
                </label>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {selectionDirty && <button type="button" disabled={selectedRowNumbers.length === 0 || selectedRowNumbers.length > 40 || Boolean(busy)} onClick={() => void validatePreview(selectedRowNumbers)} className="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-800 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Revalidate selection</button>}
                <button type="button" disabled={!eligibleForConfirmation || Boolean(busy)} title={confirmDisabledReason || undefined} onClick={() => void confirmImport()} className="flex items-center gap-2 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{busy === 'confirm' ? 'Importing...' : `Import ${changedRows} ready row${changedRows === 1 ? '' : 's'}`}</span>
                </button>
                <span className="text-[11px] text-neutral-500">Selected rows save in one atomic transaction. {preview.summary.blocked} blocked and {preview.rows.filter(row => (row.action === 'add' || row.action === 'update') && !selectedRowNumbers.includes(row.rowNumber)).length} not selected rows remain unchanged.</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => downloadLocationImportResults({ ...preview, selectedRowNumbers }, receipt, confirmationOutcome)} className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700"><Download className="h-3.5 w-3.5" />Download results</button>
                <button type="button" onClick={() => downloadLocationImportCorrections({ ...preview, selectedRowNumbers }, receipt, confirmationOutcome)} className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700"><Download className="h-3.5 w-3.5" />Download correction CSV</button>
              </div>
            </div>
          )}
        </div>
      )}
      {completedImport && (
        <section role="status" aria-live="polite" className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
          <div className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-4 w-4" />Completed import · {completedImport.filename}</div>
          <div>Saved {completedImport.receipt.additions} additions and {completedImport.receipt.updates} updates; {completedImport.receipt.unchanged} rows were unchanged.</div>
          {completedImport.receipt.replayed && <div>This is the authoritative result of an idempotent replay. No duplicate writes were created.</div>}
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {completedImport.receipt.locations.map(location => (
              <a key={location.id} href={locationPath(location.record)} className="inline-flex items-center gap-1 font-semibold text-emerald-800 underline">
                Store {location.storeNumber} · {location.name}<ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadLocationImportResults(completedImport.preview, completedImport.receipt)} className="flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 font-semibold text-emerald-800"><Download className="h-3.5 w-3.5" />Download final results</button>
            <button type="button" onClick={() => downloadLocationImportCorrections(completedImport.preview, completedImport.receipt)} className="flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 font-semibold text-emerald-800"><Download className="h-3.5 w-3.5" />Download correction CSV</button>
          </div>
        </section>
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
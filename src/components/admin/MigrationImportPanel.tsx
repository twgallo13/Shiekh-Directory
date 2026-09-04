import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Download, 
  RefreshCw, 
  Layers, 
  Database,
  ArrowRight,
  ShieldCheck,
  Check,
  FileCheck,
  Filter
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { StagedLocationImport, ImportValidationResult } from '../../types';

export const MigrationImportPanel: React.FC = () => {
  const { validateAndStageCsv, commitStagedImport, locations } = useDirectory();

  const [rawCsvText, setRawCsvText] = useState('');
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'append' | 'replace'>('merge');
  const [filterStagedStatus, setFilterStagedStatus] = useState<string>('all');
  const [commitSuccessMsg, setCommitSuccessMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Sample CSV Template Generator
  const handleDownloadSampleCsv = () => {
    const headers = [
      'Store #',
      'Store Name',
      'Address',
      'City',
      'State',
      'ZIP',
      'Phone',
      'District',
      'District Manager',
      'Store Manager',
      'Store Manager Phone',
      'Hours Summary'
    ];

    const sampleRows = [
      ['007', 'San Francisco Flagship', '929 Market St', 'San Francisco', 'CA', '94103', '(415) 644-0920', 'District 1 (Rudy Calderon)', 'Rudy Calderon', 'Jessica Morales', '(415) 555-0199', 'Mon-Sat: 10am-9pm, Sun: 11am-7pm'],
      ['115', 'Eastmont Town Center', '7200 Bancroft Ave, Suite 100', 'Oakland', 'CA', '94605', '(510) 568-1234', 'District 1 (Rudy Calderon)', 'Rudy Calderon', 'Edgar Larios', '(510) 555-8841', 'Mon-Sat: 10am-8pm, Sun: 11am-6pm'],
      ['302', 'Galleria at Tyler', '1299 Tyler St', 'Riverside', 'CA', '92503', '(951) 688-4422', 'District 2 (David Castro)', 'David Castro', 'Anthony Cruz', '(951) 555-3412', 'Mon-Sat: 10am-9pm, Sun: 11am-7pm'],
      ['410', 'Fashion Show Mall', '3200 S Las Vegas Blvd', 'Las Vegas', 'NV', '89109', '(702) 733-1122', 'District 3 (Karlo Llovido)', 'Karlo Llovido', 'Marcus Vance', '(702) 555-9011', 'Mon-Sat: 10am-9pm, Sun: 11am-7pm']
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...sampleRows.map(r => r.map(f => `"${f}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'shiekh_shoes_migration_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLoadOfficialBatch = () => {
    // Generates a mock batch representative of the Shiekh Shoes Store Directory 10.09.25 format
    const batch = `Store #,Store Name,Address,City,State,ZIP,Phone,District,District Manager,Store Manager,Store Manager Phone,Hours Summary
007,"San Francisco Flagship","929 Market St","San Francisco","CA","94103","(415) 644-0920","District 1 (Rudy Calderon)","Rudy Calderon","Jessica Morales","(415) 555-0199","Mon-Sat: 10am-9pm, Sun: 11am-7pm"
115,"Eastmont Town Center","7200 Bancroft Ave, Suite 100","Oakland","CA","94605","(510) 568-1234","District 1 (Rudy Calderon)","Rudy Calderon","Edgar Larios","(510) 555-8841","Mon-Sat: 10am-8pm, Sun: 11am-6pm"
121,"Hilltop Mall","2200 Hilltop Mall Rd","Richmond","CA","94806","(510) 223-9000","District 1 (Rudy Calderon)","Rudy Calderon","Vacant","","Mon-Sat: 10am-8pm, Sun: 11am-6pm"
204,"Fox Hills / Westfield Culver City","6000 Sepulveda Blvd","Culver City","CA","90230","(310) 390-1200","District 2 (David Castro)","David Castro","Mateo Hernandez","(310) 555-4421","Mon-Sat: 10am-9pm, Sun: 11am-7pm"
218,"Lakewood Center","500 Lakewood Center Mall","Lakewood","CA","90712","(562) 634-8800","District 2 (David Castro)","David Castro","Elena Rostova","(562) 555-1212","Mon-Sat: 10am-9pm, Sun: 11am-7pm"
305,"Meadows Mall","4300 Meadows Ln","Las Vegas","NV","89107","(702) 870-1122","District 3 (Karlo Llovido)","Karlo Llovido","Karlo Llovido (Acting)","(702) 555-7788","Mon-Sat: 10am-9pm, Sun: 11am-6pm"
501,"Downtown Plaza Mall (Pending)","400 K Street","Sacramento","CA","95814","(916) 442-9900","District 1 (Rudy Calderon)","Rudy Calderon","TBD","","Mon-Sat: 10am-8pm, Sun: 11am-6pm"`;

    setRawCsvText(batch);
    const result = validateAndStageCsv(batch);
    setValidationResult(result);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const text = event.target?.result as string;
      setRawCsvText(text);
      const res = validateAndStageCsv(text);
      setValidationResult(res);
      setCommitSuccessMsg(null);
    };
    reader.readAsText(file);
  };

  const handleValidateNow = () => {
    if (!rawCsvText.trim()) return;
    const res = validateAndStageCsv(rawCsvText);
    setValidationResult(res);
    setCommitSuccessMsg(null);
  };

  const handleCommit = () => {
    if (!validationResult || validationResult.stagedRows.length === 0) return;
    setIsProcessing(true);

    setTimeout(() => {
      const outcome = commitStagedImport(validationResult.stagedRows, importMode);
      setIsProcessing(false);
      setCommitSuccessMsg(
        `Migration Committed Successfully: ${outcome.importedCount} new locations created, ${outcome.updatedCount} existing locations synchronized with Master SoR.`
      );
      setValidationResult(null);
      setRawCsvText('');
    }, 600);
  };

  const filteredStagedRows = validationResult?.stagedRows.filter(r => {
    if (filterStagedStatus === 'all') return true;
    return r.status === filterStagedStatus;
  }) || [];

  return (
    <div className="space-y-6">
      {/* Banner Header */}
      <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-red-600" />
            <span>CSV Import & Data Migration Pipeline (Blueprint Sec 16)</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Authoritative ingestion gate for Shiekh Shoes Store Directory XLSX/CSV. Validates schemas, detects duplicates, and stages before committing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadSampleCsv}
            className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV Template</span>
          </button>
        </div>
      </div>

      {/* Upload & Staging Box */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-neutral-500" />
              <span>Step 1: Upload or Paste Directory File</span>
            </h3>

            {/* Drag & Drop File Ingest */}
            <div className="border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-6 text-center hover:border-red-500 transition-colors bg-neutral-50/50 dark:bg-neutral-800/30">
              <Upload className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
              <div className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
                Choose CSV file or drag here
              </div>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Compatible with Shiekh Shoes Store Directory 10.09.25.xlsx/csv
              </p>
              <label className="mt-3 inline-block px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-bold cursor-pointer shadow-xs transition-colors">
                <span>Select File</span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>Or paste raw CSV text:</span>
              <button
                type="button"
                onClick={handleLoadOfficialBatch}
                className="text-red-600 dark:text-red-400 hover:underline font-semibold"
              >
                Load Sample Retail Batch
              </button>
            </div>

            <textarea
              rows={6}
              value={rawCsvText}
              onChange={e => setRawCsvText(e.target.value)}
              placeholder="Store #,Store Name,Address,City,State,ZIP,Phone,District,District Manager,Store Manager,Store Manager Phone,Hours Summary..."
              className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100"
            />

            <button
              onClick={handleValidateNow}
              disabled={!rawCsvText.trim()}
              className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <FileCheck className="w-4 h-4" />
              <span>Validate & Stage Ingestion Data</span>
            </button>
          </div>
        </div>

        {/* Right Column: Validation Staging Gate & Summary */}
        <div className="lg:col-span-7 space-y-4">
          {commitSuccessMsg && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-3 shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">Master Directory Synchronized</div>
                <p className="mt-0.5">{commitSuccessMsg}</p>
              </div>
            </div>
          )}

          {!validationResult ? (
            <div className="bg-white dark:bg-neutral-900 p-8 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs text-center space-y-3">
              <Layers className="w-10 h-10 text-neutral-300 dark:text-neutral-700 mx-auto" />
              <h4 className="font-bold text-sm text-neutral-700 dark:text-neutral-300">
                Staging Validation Gate Idle
              </h4>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                Upload or paste a directory spreadsheet to perform pre-flight integrity verification (required fields, state codes, duplicate managers, and timezone assignments).
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Step 2: Pre-Flight Integrity Validation Gate</span>
                </h3>
                <span className="text-xs text-neutral-500">
                  {validationResult.totalRows} Total Rows Evaluated
                </span>
              </div>

              {/* Statistics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-center">
                  <div className="text-lg font-black text-emerald-700 dark:text-emerald-300">
                    {validationResult.validCount}
                  </div>
                  <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400">Valid & Clean</div>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-xl text-center">
                  <div className="text-lg font-black text-blue-700 dark:text-blue-300">
                    {validationResult.duplicateCount}
                  </div>
                  <div className="text-[11px] font-bold text-blue-800 dark:text-blue-400">SoR Updates</div>
                </div>

                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl text-center">
                  <div className="text-lg font-black text-amber-700 dark:text-amber-300">
                    {validationResult.warningCount}
                  </div>
                  <div className="text-[11px] font-bold text-amber-800 dark:text-amber-400">Warnings</div>
                </div>

                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 rounded-xl text-center">
                  <div className="text-lg font-black text-red-700 dark:text-red-300">
                    {validationResult.errorCount}
                  </div>
                  <div className="text-[11px] font-bold text-red-800 dark:text-red-400">Blocking Errors</div>
                </div>
              </div>

              {/* Filter Tabs for Staged Rows */}
              <div className="flex items-center gap-1.5 text-xs">
                {['all', 'Valid', 'Duplicate', 'Warning', 'Error'].map(st => (
                  <button
                    key={st}
                    onClick={() => setFilterStagedStatus(st)}
                    className={`px-2 py-1 rounded text-[11px] font-bold ${
                      filterStagedStatus === st
                        ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {st === 'all' ? 'All Rows' : st}
                  </button>
                ))}
              </div>

              {/* Staging Interactive Grid */}
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-x-auto max-h-56">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="sticky top-0 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold border-b">
                    <tr>
                      <th className="py-2 px-2 w-12">Row</th>
                      <th className="py-2 px-2 w-14">Store #</th>
                      <th className="py-2 px-2">Store Name & City</th>
                      <th className="py-2 px-2">Manager</th>
                      <th className="py-2 px-2">Status & Validation Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {filteredStagedRows.map(row => (
                      <tr key={row.rowNumber} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                        <td className="py-2 px-2 font-mono text-neutral-400">#{row.rowNumber}</td>
                        <td className="py-2 px-2 font-bold font-mono">#{row.storeNumber}</td>
                        <td className="py-2 px-2">
                          <div className="font-semibold text-neutral-900 dark:text-neutral-100">{row.name}</div>
                          <div className="text-[10px] text-neutral-500">{row.city}, {row.state}</div>
                        </td>
                        <td className="py-2 px-2">
                          <div className="text-neutral-800 dark:text-neutral-200">{row.storeManagerName || '—'}</div>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              row.status === 'Valid' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                              row.status === 'Duplicate' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                              row.status === 'Warning' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                              'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            }`}>
                              {row.status}
                            </span>
                            {row.validationMessages.length > 0 && (
                              <span className="text-[10px] text-neutral-500">
                                {row.validationMessages.join(' • ')}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Step 3: Commit Strategy Selection */}
              <div className="p-4 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                  Step 3: Master Directory Merge Policy
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <label className={`p-2.5 rounded-lg border cursor-pointer flex flex-col justify-between ${
                    importMode === 'merge' ? 'border-red-600 bg-red-50/50 dark:bg-red-950/40 text-red-900 dark:text-red-200 font-bold' : 'border-neutral-200 dark:border-neutral-700'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'merge'}
                        onChange={() => setImportMode('merge')}
                        className="text-red-600"
                      />
                      <span>Merge & Update (Safe)</span>
                    </div>
                    <p className="text-[10px] font-normal text-neutral-500 mt-1">
                      Updates existing stores; adds new locations.
                    </p>
                  </label>

                  <label className={`p-2.5 rounded-lg border cursor-pointer flex flex-col justify-between ${
                    importMode === 'append' ? 'border-red-600 bg-red-50/50 dark:bg-red-950/40 text-red-900 dark:text-red-200 font-bold' : 'border-neutral-200 dark:border-neutral-700'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'append'}
                        onChange={() => setImportMode('append')}
                        className="text-red-600"
                      />
                      <span>Append Only</span>
                    </div>
                    <p className="text-[10px] font-normal text-neutral-500 mt-1">
                      Adds brand-new store numbers; ignores existing.
                    </p>
                  </label>

                  <label className={`p-2.5 rounded-lg border cursor-pointer flex flex-col justify-between ${
                    importMode === 'replace' ? 'border-red-600 bg-red-50/50 dark:bg-red-950/40 text-red-900 dark:text-red-200 font-bold' : 'border-neutral-200 dark:border-neutral-700'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="text-red-600"
                      />
                      <span>Full Canonical Replace</span>
                    </div>
                    <p className="text-[10px] font-normal text-neutral-500 mt-1">
                      Replaces all directory locations with this file.
                    </p>
                  </label>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <span className="text-[11px] text-neutral-500">
                    All updates generate immutable Audit Trail entries with rollback capability.
                  </span>

                  <button
                    onClick={handleCommit}
                    disabled={isProcessing || validationResult.errorCount > 0}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
                  >
                    {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                    <span>{isProcessing ? 'Committing to SoR...' : 'Commit Staged Batch to Master SoR'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer, Download, ArrowLeft, AlertTriangle, Filter, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ExportLocation {
  id: string;
  storeNumber: string;
  name: string;
  kind: string;
  address: string;
  suite: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  phoneFormatted: string;
  sharedInboxEmail: string;
  regionId: string;
  regionName: string;
  districtId: string;
  districtName: string;
  storeManager: string;
  storeManagerStatus: 'filled' | 'vacant';
  storeManagerPhone: string;
  storeManagerMobile: string;
  districtManager: string;
  districtManagerStatus: 'filled' | 'vacant';
  assistantStoreManagers: string[];
  asmStatus: 'filled' | 'vacant';
  keyHolders: string[];
  khStatus: 'filled' | 'vacant';
  lifecycle: string;
}

interface DistrictGroup {
  id: string;
  name: string;
  districtManager: string;
  stores: ExportLocation[];
}

interface ExportData {
  generatedAt: string;
  locationCount: number;
  canViewMobilePhones: boolean;
  districts: DistrictGroup[];
}

function canAccessExports(role: string | undefined): boolean {
  return ['Leader', 'Steward', 'Admin'].includes(role || '');
}

export function PrintableDirectoryView() {
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [exportToken, setExportToken] = useState<string | null>(null);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [districtFilter, setDistrictFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  
  const { getIdToken, authUser } = useAuth();
  const navigate = useNavigate();
  
  const hasAccess = canAccessExports(authUser?.role);

  const prepareExport = useCallback(async () => {
    try {
      setPreparing(true);
      setError(null);
      const token = await getIdToken();
      
      const response = await fetch('/api/app/exports/locations/prepare', {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to prepare export');
      }
      
      const { token: exportToken } = await response.json();
      setExportToken(exportToken);
      
      const dataResponse = await fetch(`/api/app/exports/locations/${exportToken}/pdf-data`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!dataResponse.ok) {
        throw new Error('Failed to get export data');
      }
      
      const data = await dataResponse.json();
      setExportData(data);
    } catch (err) {
      console.error('Export prepare error:', err);
      setError('Failed to prepare export. Please try again.');
    } finally {
      setPreparing(false);
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (hasAccess) {
      prepareExport();
    } else {
      setLoading(false);
    }
  }, [prepareExport, hasAccess]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadCsv = async () => {
    if (!exportToken) return;
    
    try {
      const token = await getIdToken();
      const response = await fetch(`/api/app/exports/locations/${exportToken}/csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        if (response.status === 410) {
          setError('Export expired. Refreshing...');
          prepareExport();
          return;
        }
        throw new Error('Download failed');
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shiekh_store_directory_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      setError('Failed to download CSV. Please try again.');
    }
  };

  const filteredDistricts = exportData?.districts.filter(d => 
    districtFilter === 'all' || d.id === districtFilter
  ) || [];

  const totalStores = filteredDistricts.reduce((sum, d) => sum + d.stores.length, 0);
  const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-4">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">Access Restricted</h2>
          <p className="mt-2 text-gray-600">
            Export and print access requires Leader, Steward, or Admin role.
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Directory
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Preparing export...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
          <p className="mt-4 text-gray-600">{error}</p>
          <button
            onClick={prepareExport}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white overflow-x-hidden">
      {/* Controls - Hidden in print */}
      <div className="print:hidden bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-[1200px] mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 min-h-[44px]"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back to Directory</span>
            </button>

            <div className="flex items-center gap-2 text-sm text-gray-600 flex-1 min-w-0">
              <Filter className="w-4 h-4 flex-shrink-0" />
              <select
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-0 flex-1 sm:flex-initial sm:w-auto min-h-[44px]"
              >
                <option value="all">All ({exportData?.locationCount || 0})</option>
                {exportData?.districts.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.stores.length})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={handleDownloadCsv}
                disabled={preparing}
                className="flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm min-h-[44px]"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">CSV</span>
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm min-h-[44px]"
              >
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">Print</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Coming Soon Features - Hidden in print */}
      <div className="print:hidden max-w-[1200px] mx-auto px-4 pt-4">
        <div className="bg-gray-50 border border-gray-200 border-dashed rounded-lg p-3">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-600">Google/Apple Contacts Export</span>
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">Planned</span>
            </div>
            <span className="text-xs text-gray-500 hidden sm:inline">Export directory as vCard file for phone contacts.</span>
          </div>
        </div>
      </div>

      {/* Printable Content */}
      <div className="max-w-[1200px] mx-auto p-4 print:p-0 print:max-w-none overflow-x-auto">
        <div className="bg-white rounded-lg border border-gray-200 p-6 print:border-none print:rounded-none print:shadow-none min-w-[585px]">
          {/* Header */}
          <div className="mb-2 print:mb-1 flex items-center justify-between border-b-2 border-gray-900 pb-1">
            <div className="flex items-center gap-2">
              <img 
                src="/shiekh-logo.svg" 
                alt="Shiekh" 
                className="h-5 print:h-4"
              />
              <span className="text-sm print:text-[10px] font-bold tracking-tight text-gray-600 uppercase">
                Store Directory
              </span>
            </div>
            <div className="text-right">
              <span className="text-[9px] print:text-[8px] font-bold text-gray-900 font-mono">
                {totalStores} Stores
              </span>
              <span className="text-[8px] print:text-[7px] text-gray-500 ml-2">
                {currentDate}
              </span>
            </div>
          </div>

          {/* Role Notice */}
          {!exportData?.canViewMobilePhones && (
            <div className="mb-1 print:mb-0.5 text-[8px] print:text-[7px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded print:hidden">
              Mobile numbers restricted to authorized roles.
            </div>
          )}

          {/* Districts */}
          <div className="print:space-y-0">
            {filteredDistricts.map(district => (
              <div key={district.id}>
                {/* District Header */}
                <div className="flex items-center justify-between border-y border-gray-300 bg-gray-100 px-1 py-0.5 print:py-px text-[9px] print:text-[8px] font-bold text-gray-900">
                  <span className="uppercase tracking-wide text-red-700">
                    {district.name} ({district.stores.length})
                  </span>
                  <span className="text-gray-700 text-[8px] print:text-[7px] font-medium">
                    DM: {district.districtManager ? (
                      <strong className="text-gray-900">{district.districtManager}</strong>
                    ) : (
                      <strong className="text-red-600">VACANT</strong>
                    )}
                  </span>
                </div>

                {/* Stores Table */}
                <table className="w-full text-left text-[9px] print:text-[8px] border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 uppercase text-[7px] print:text-[6px] tracking-wide font-semibold">
                      <th className="py-px px-0.5 w-8 print:w-6">#</th>
                      <th className="py-px px-0.5">Store Name</th>
                      <th className="py-px px-0.5">Address</th>
                      <th className="py-px px-0.5 w-20 print:w-16">City</th>
                      <th className="py-px px-0.5 w-6 print:w-5">ST</th>
                      <th className="py-px px-0.5 w-24 print:w-20">Phone</th>
                      <th className="py-px px-0.5 w-32 print:w-28">Store Manager</th>
                    </tr>
                  </thead>
                  <tbody className="font-normal">
                    {district.stores.map((store, idx) => (
                      <tr
                        key={store.id}
                        className={`print:break-inside-avoid ${idx % 2 === 1 ? 'bg-gray-50/40' : ''}`}
                      >
                        <td className="py-px px-0.5 font-mono font-bold text-gray-900 whitespace-nowrap">
                          {store.storeNumber}
                        </td>
                        <td className="py-px px-0.5 font-medium text-gray-900 truncate max-w-[120px] print:max-w-[100px]">
                          {store.name}
                        </td>
                        <td className="py-px px-0.5 text-gray-600 truncate max-w-[150px] print:max-w-[120px]">
                          {store.address}{store.suite ? (
                            /^(Suite|Ste|Floor|Unit)\b/i.test(store.suite) 
                              ? `, ${store.suite}` 
                              : ` #${store.suite}`
                          ) : ''}
                        </td>
                        <td className="py-px px-0.5 text-gray-800 whitespace-nowrap truncate">
                          {store.city}
                        </td>
                        <td className="py-px px-0.5 text-gray-700 font-bold whitespace-nowrap">
                          {store.state}
                        </td>
                        <td className="py-px px-0.5 font-mono text-gray-900 whitespace-nowrap text-[8px] print:text-[7px]">
                          {store.phoneFormatted}
                        </td>
                        <td className="py-px px-0.5 text-gray-700 truncate max-w-[130px] print:max-w-[110px]">
                          {store.storeManagerStatus === 'vacant' ? (
                            <span className="text-red-600 font-semibold text-[7px]">VACANT</span>
                          ) : (
                            <>
                              {store.storeManager}
                              {exportData?.canViewMobilePhones && store.storeManagerMobile && (
                                <span className="text-[7px] text-gray-500 ml-1">📱{store.storeManagerMobile.replace(/[^\d]/g, '').slice(-4)}</span>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-1 print:mt-0.5 flex items-center justify-between border-t border-gray-300 pt-1 print:pt-0.5 text-[8px] print:text-[7px] text-gray-500">
            <div>
              {authUser?.email || 'User'}
            </div>
            <div>
              Shiekh Confidential • {currentDate}
            </div>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            size: letter landscape;
            margin: 0.2in 0.15in;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-size: 8px !important;
            line-height: 1.1 !important;
          }
          table { border-collapse: collapse; }
          tr { break-inside: avoid; }
          td, th { padding: 1px 2px !important; }
        }
      `}</style>
    </div>
  );
}

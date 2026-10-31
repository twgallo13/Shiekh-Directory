import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer, Download, ArrowLeft, AlertTriangle, Filter } from 'lucide-react';
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
  storeManagerPhone: string;
  storeManagerMobile: string;
  districtManager: string;
  assistantStoreManagers: string[];
  keyHolders: string[];
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

export function PrintableDirectoryView() {
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [exportToken, setExportToken] = useState<string | null>(null);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [districtFilter, setDistrictFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  
  const { getIdToken, authUser } = useAuth();
  const navigate = useNavigate();

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
    prepareExport();
  }, [prepareExport]);

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
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Controls - Hidden in print */}
      <div className="print:hidden bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-[1200px] mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Directory</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Filter className="w-4 h-4" />
              <select
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="all">All Districts ({exportData?.locationCount || 0} stores)</option>
                {exportData?.districts.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.stores.length} stores)
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleDownloadCsv}
              disabled={preparing}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
            >
              <Download className="w-4 h-4" />
              Download CSV
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              <Printer className="w-4 h-4" />
              Print 1-Sheet
            </button>
          </div>
        </div>
      </div>

      {/* Printable Content */}
      <div className="max-w-[1200px] mx-auto p-4 print:p-0 print:max-w-none">
        <div className="bg-white rounded-lg border border-gray-200 p-6 print:border-none print:rounded-none print:shadow-none">
          {/* Header */}
          <div className="mb-2 print:mb-1 flex items-center justify-between border-b-2 border-gray-900 pb-1">
            <div>
              <div className="flex items-center gap-1">
                <span className="bg-red-600 text-white text-[9px] print:text-[8px] font-black px-1.5 py-px rounded tracking-wider">
                  SHIEKH
                </span>
                <h1 className="text-sm print:text-[10px] font-black tracking-tight text-gray-900 uppercase">
                  Store Directory
                </h1>
              </div>
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
                  {district.districtManager && (
                    <span className="text-gray-700 text-[8px] print:text-[7px] font-medium">
                      DM: <strong className="text-gray-900">{district.districtManager}</strong>
                    </span>
                  )}
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
                          {store.address}{store.suite ? ` #${store.suite}` : ''}
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
                          {store.storeManager || <span className="text-gray-400 italic text-[7px]">Open</span>}
                          {exportData?.canViewMobilePhones && store.storeManagerMobile && (
                            <span className="text-[7px] text-gray-500 ml-1">📱{store.storeManagerMobile.replace(/[^\d]/g, '').slice(-4)}</span>
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

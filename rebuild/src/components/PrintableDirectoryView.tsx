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
          <div className="mb-4 flex items-center justify-between border-b-2 border-gray-900 pb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-red-600 text-white text-[11px] font-black px-2 py-0.5 rounded tracking-wider">
                  SHIEKH
                </span>
                <h1 className="text-base font-black tracking-tight text-gray-900 uppercase">
                  Master Retail Store Directory
                </h1>
              </div>
              <p className="text-[10px] text-gray-600 mt-0.5 font-medium">
                Official Corporate Fleet Roster • Shiekh Shoes Operational Directory
              </p>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-bold text-gray-900 font-mono">
                Total Stores: {totalStores}
              </div>
              <div className="text-[9px] text-gray-500">
                Published: {currentDate} • Internal Operational Reference
              </div>
            </div>
          </div>

          {/* Role Notice */}
          {!exportData?.canViewMobilePhones && (
            <div className="mb-3 text-[9px] text-amber-700 bg-amber-50 px-2 py-1 rounded">
              Mobile phone numbers are restricted. Contact information shown is work phone only.
            </div>
          )}

          {/* Districts */}
          <div className="space-y-4 print:space-y-1">
            {filteredDistricts.map(district => (
              <div key={district.id} className="break-inside-avoid">
                {/* District Header */}
                <div className="mb-1 flex items-center justify-between border-y border-gray-300 bg-gray-100 px-3 py-1 text-[11px] font-bold text-gray-900">
                  <span className="uppercase tracking-wider text-red-700">
                    {district.name} ({district.stores.length} Stores)
                  </span>
                  {district.districtManager && (
                    <span className="text-gray-700 text-[10px] font-medium">
                      District Manager: <strong className="text-gray-900 font-semibold">{district.districtManager}</strong>
                    </span>
                  )}
                </div>

                {/* Stores Table */}
                <table className="w-full text-left text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 uppercase text-[8.5px] tracking-wider font-semibold">
                      <th className="py-1 px-1.5 w-12">Store #</th>
                      <th className="py-1 px-1.5">Store / Center Name</th>
                      <th className="py-1 px-1.5">Street Address</th>
                      <th className="py-1 px-1.5 w-24">City</th>
                      <th className="py-1 px-1.5 w-8">ST</th>
                      <th className="py-1 px-1.5 w-28">Phone</th>
                      <th className="py-1 px-1.5 w-36">Store Manager</th>
                      <th className="py-1 px-1.5 w-32">District Manager</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-normal">
                    {district.stores.map((store, idx) => (
                      <tr
                        key={store.id}
                        className={`hover:bg-gray-50/60 ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}
                      >
                        <td className="py-1 px-1.5 font-mono font-bold text-gray-900 whitespace-nowrap">
                          #{store.storeNumber}
                        </td>
                        <td className="py-1 px-1.5 font-medium text-gray-900">
                          <span>{store.name}</span>
                          {store.assistantStoreManagers.length > 0 && (
                            <span className="block text-[9px] font-normal text-gray-600">
                              ASM: {store.assistantStoreManagers.join(', ')}
                            </span>
                          )}
                        </td>
                        <td className="py-1 px-1.5 text-gray-600 truncate max-w-[180px]">
                          {store.address}
                          {store.suite && `, ${store.suite}`}
                        </td>
                        <td className="py-1 px-1.5 text-gray-800 whitespace-nowrap font-medium">
                          {store.city}
                        </td>
                        <td className="py-1 px-1.5 text-gray-700 font-bold whitespace-nowrap">
                          {store.state}
                        </td>
                        <td className="py-1 px-1.5 font-mono font-semibold text-gray-900 whitespace-nowrap">
                          {store.phoneFormatted}
                        </td>
                        <td className="py-1 px-1.5 text-gray-700 truncate max-w-[140px]">
                          {store.storeManager || <span className="text-gray-400 italic">Open Position</span>}
                          {exportData?.canViewMobilePhones && store.storeManagerMobile && (
                            <span className="block text-[8px] text-gray-500">📱 {store.storeManagerMobile}</span>
                          )}
                        </td>
                        <td className="py-1 px-1.5 text-gray-700 truncate max-w-[130px]">
                          {store.districtManager || <span className="text-gray-400 italic">Unassigned</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between border-t border-gray-300 pt-2 text-[9px] text-gray-500">
            <div>
              Exported by {authUser?.email || 'User'} ({authUser?.role || 'Unknown'})
            </div>
            <div>
              Shiekh Shoes Retail Directory • Confidential & Proprietary
            </div>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 0.25in;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}

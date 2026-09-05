import React, { useState } from 'react';
import { 
  Printer, 
  Download, 
  ChevronLeft,
  Mail,
  AlertTriangle
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { EmailPdfModal } from './EmailPdfModal';

interface PrintSheetViewProps {
  onBackToDirectory: () => void;
}

export const PrintSheetView: React.FC<PrintSheetViewProps> = ({
  onBackToDirectory,
}) => {
  const { locations, currentUser } = useDirectory();

  const [includeManagers, setIncludeManagers] = useState(true);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  const isViewer = currentUser.role === 'Viewer';

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const headers = [
      'Store #',
      'Store Name',
      'Address',
      'City',
      'State',
      'ZIP',
      'Phone',
      'District Manager',
      'Store Manager',
      'Store Manager Phone',
      'Operational Status'
    ];

    const rows = locations.map(loc => {
      const isQuarantined = loc.storeManagerPhoneVisibility === 'Pending Review' || loc.isStoreManagerPhoneVerified === false;
      const managerPhone = (isQuarantined && isViewer) ? '(•••) •••-••••' : (loc.storeManagerPhone || '');

      return [
        `"${loc.storeNumber}"`,
        `"${loc.name.replace(/"/g, '""')}"`,
        `"${loc.address.replace(/"/g, '""')}"`,
        `"${loc.city}"`,
        `"${loc.state}"`,
        `"${loc.zipCode}"`,
        `"${loc.phone}"`,
        `"${loc.districtManagerName || ''}"`,
        `"${loc.storeManagerName || ''}"`,
        `"${managerPhone}"`,
        `"${loc.operationalStatus}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `shiekh_official_directory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const districts = [
    { name: 'District 1 (Rudy Calderon)', headerBg: 'bg-emerald-800 text-white' },
    { name: 'District 2 (David Castro)', headerBg: 'bg-blue-800 text-white' },
    { name: 'District 3 (Karlo Llovido)', headerBg: 'bg-rose-800 text-white' },
    { name: 'Corporate & Logistics Facilities', headerBg: 'bg-neutral-900 text-white' }
  ];

  return (
    <div className="space-y-4">
      {/* Print styles for exact 1-sheet letter landscape fitting */}
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

      {/* On-screen Toolbar (Hidden during browser printing) */}
      <div className="print:hidden no-print bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToDirectory}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <Printer className="w-5 h-5 text-red-600" />
              <span>Official 1-Sheet Store Directory & Contact Sheet</span>
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Formatted for 11" x 8.5" Landscape printing, binder distribution, and export.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 mr-2">
            <label className="flex items-center gap-1 cursor-pointer">
              <input 
                type="checkbox" 
                checked={includeManagers} 
                onChange={e => setIncludeManagers(e.target.checked)} 
                className="rounded text-red-600"
              />
              <span>Include Managers</span>
            </label>
          </div>

          <button
            onClick={handleExportCsv}
            className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-neutral-500" />
            <span>Download CSV</span>
          </button>

          <button
            onClick={() => setIsEmailModalOpen(true)}
            className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-md text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email 1-Sheet PDF</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheet (PDF)</span>
          </button>
        </div>
      </div>

      <p className="text-sm text-neutral-500 mb-4 print:hidden">Print and PDF output include the directory document only. Application controls will not appear.</p>

      {/* Printable Sheet Canvas */}
      <div className="bg-white text-black p-4 sm:p-6 rounded-xl shadow-lg border border-neutral-300 print:border-none print:shadow-none print:p-0 print:m-0 print:w-full">
        {/* Document Header */}
        <div className="border-b-2 border-neutral-900 pb-2 mb-3 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="bg-red-600 text-white font-black text-xs px-2 py-0.5 tracking-wider">
                SHIEKH
              </div>
              <h2 className="text-sm sm:text-base font-black tracking-tight text-neutral-900 uppercase">
                Official Retail Location & Company Leadership Directory
              </h2>
            </div>
            <p className="text-[9pt] text-neutral-600 mt-0.5 font-medium leading-tight">
              Authoritative Master System of Record • Shiekh Shoes Corporate & Field Operations
            </p>
          </div>

          <div className="text-right text-[8pt] text-neutral-500 leading-tight">
            <div className="font-bold text-neutral-900">Total Stores: {locations.length}</div>
            <div>Published: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <div className="font-mono text-[7pt]">Confidential — Internal Company Use</div>
          </div>
        </div>

        {/* Directory Tables by District */}
        <div className="space-y-3">
          {districts.map(d => {
            const districtStores = locations.filter(l => {
              if (d.name.includes('Corporate')) return l.type === 'Corporate Office' || l.type === 'Warehouse / Distribution Center';
              return l.district === d.name || l.districtManagerName?.includes(d.name.split(' ')[2]?.replace('(', ''));
            });

            if (districtStores.length === 0) return null;

            return (
              <div key={d.name} className="overflow-hidden border border-neutral-300 rounded-md">
                {/* District Header Bar with High WCAG Contrast */}
                <div className={`px-2 py-1 text-[8pt] font-bold flex items-center justify-between ${d.headerBg}`}>
                  <span>{d.name.toUpperCase()}</span>
                  <span className="text-[7.5pt] font-medium opacity-90">{districtStores.length} Locations</span>
                </div>

                {/* Stores Table */}
                <table className="w-full text-left text-[8pt] leading-tight border-collapse">
                  <thead>
                    <tr className="bg-neutral-100 text-neutral-800 font-bold border-b border-neutral-300">
                      <th className="py-[2px] px-1 w-10 text-[8pt] leading-tight whitespace-nowrap">Store #</th>
                      <th className="py-[2px] px-1 text-[8pt] leading-tight whitespace-nowrap">Store / Center Name</th>
                      <th className="py-[2px] px-1 text-[8pt] leading-tight whitespace-nowrap">Address</th>
                      <th className="py-[2px] px-1 text-[8pt] leading-tight whitespace-nowrap">City</th>
                      <th className="py-[2px] px-1 w-7 text-[8pt] leading-tight whitespace-nowrap">St</th>
                      <th className="py-[2px] px-1 w-12 text-[8pt] leading-tight whitespace-nowrap">ZIP</th>
                      <th className="py-[2px] px-1 w-24 text-[8pt] leading-tight whitespace-nowrap">Store Phone</th>
                      {includeManagers && <th className="py-[2px] px-1 text-[8pt] leading-tight whitespace-nowrap">Store Manager</th>}
                      {includeManagers && <th className="py-[2px] px-1 w-24 text-[8pt] leading-tight whitespace-nowrap">Manager Phone</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {districtStores.map(loc => {
                      const isQuarantined = loc.storeManagerPhoneVisibility === 'Pending Review' || loc.isStoreManagerPhoneVerified === false;
                      const displayManagerPhone = (isQuarantined && isViewer) ? '(•••) •••-••••' : (loc.storeManagerPhone || '—');
                      const isAbnormalStatus = loc.operationalStatus !== 'Open — Normal Operations' && loc.operationalStatus !== 'Open - Normal Operations';

                      return (
                        <tr key={loc.id} className="hover:bg-neutral-50">
                          <td className="py-[2px] px-1 text-[8pt] leading-tight font-bold font-mono whitespace-nowrap">#{loc.storeNumber}</td>
                          <td className="py-[2px] px-1 text-[8pt] leading-tight font-semibold text-neutral-900 whitespace-nowrap truncate max-w-[140px]">
                            {loc.name}
                            {isAbnormalStatus && (
                              <AlertTriangle className="w-3 h-3 text-red-600 inline ml-1 align-text-bottom" title={loc.operationalStatus} />
                            )}
                          </td>
                          <td className="py-[2px] px-1 text-[8pt] leading-tight text-neutral-600 whitespace-nowrap truncate max-w-[160px]">{loc.address}</td>
                          <td className="py-[2px] px-1 text-[8pt] leading-tight text-neutral-800 whitespace-nowrap">{loc.city}</td>
                          <td className="py-[2px] px-1 text-[8pt] leading-tight font-bold whitespace-nowrap">{loc.state}</td>
                          <td className="py-[2px] px-1 text-[8pt] leading-tight font-mono text-neutral-600 whitespace-nowrap">{loc.zipCode}</td>
                          <td className="py-[2px] px-1 text-[8pt] leading-tight font-bold font-mono text-neutral-900 whitespace-nowrap">{loc.phone}</td>
                          {includeManagers && (
                            <td className="py-[2px] px-1 text-[8pt] leading-tight font-medium text-neutral-800 whitespace-nowrap truncate max-w-[110px]">
                              {loc.storeManagerName || <span className="text-neutral-400 italic">Vacant</span>}
                            </td>
                          )}
                          {includeManagers && (
                            <td className="py-[2px] px-1 text-[8pt] leading-tight font-mono text-neutral-600 whitespace-nowrap">{displayManagerPhone}</td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        {/* Print Footer */}
        <div className="mt-3 pt-2 border-t border-neutral-300 flex items-center justify-between text-[8pt] text-neutral-500 leading-tight">
          <div>Shiekh Shoes Authoritative SoR Directory • Confidential</div>
          <div>All Store Numbers, Addresses and Phone Lines are Verified Canonical Data</div>
          <div>Page 1 of 1</div>
        </div>
      </div>

      <EmailPdfModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
      />
    </div>
  );
};


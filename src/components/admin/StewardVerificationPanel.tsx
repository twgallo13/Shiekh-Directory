import React, { useState } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  Phone, 
  Mail, 
  Building, 
  UserCheck, 
  Lock, 
  Eye, 
  EyeOff, 
  Check, 
  AlertTriangle,
  FileCheck,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { ContactPrivacyLevel, LocationRecord, PersonRecord } from '../../types';
import { PrivacyBadge } from '../common/StatusBadge';

export const StewardVerificationPanel: React.FC = () => {
  const { 
    locations, 
    people, 
    currentUser, 
    verifyManagerPhone, 
    toggleLocationPhonePrivacy,
    verifyPersonContact,
    togglePersonContactPrivacy
  } = useDirectory();

  const [filterType, setFilterType] = useState<'all' | 'quarantined' | 'verified' | 'management_only'>('all');
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const isSteward = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';

  // Quarantined / Pending Review Locations
  const pendingLocations = locations.filter(l => 
    l.storeManagerPhoneVisibility === 'Pending Review' || l.isStoreManagerPhoneVerified === false
  );

  // Quarantined / Pending Review Personnel
  const pendingPeople = people.filter(p => 
    p.phoneVisibility === 'Pending Review' || p.isPhoneVerified === false
  );

  const totalQuarantined = pendingLocations.length + pendingPeople.length;

  const handleVerifyLocation = (locId: string, storeNum: string) => {
    verifyManagerPhone(locId);
    setSuccessBanner(`Verified store manager contact for Store #${storeNum} as Directory Public.`);
    setTimeout(() => setSuccessBanner(null), 3000);
  };

  const handleVerifyPerson = (personId: string, name: string) => {
    verifyPersonContact(personId);
    setSuccessBanner(`Verified phone contact for ${name} as Directory Public.`);
    setTimeout(() => setSuccessBanner(null), 3000);
  };

  const handleBatchVerifyAll = () => {
    pendingLocations.forEach(loc => {
      verifyManagerPhone(loc.id);
    });
    pendingPeople.forEach(p => {
      verifyPersonContact(p.id);
    });
    setSuccessBanner(`Batch verified all ${totalQuarantined} pending contact records. Directory is now 100% reconciled.`);
    setTimeout(() => setSuccessBanner(null), 4000);
  };

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-red-600" />
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              Data Steward Contact Verification & Quarantine Queue (Blueprint Sec 9 & 16)
            </h2>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Authoritative gatekeeper workflow: Newly imported CSV manager phones default to "Pending Review" and remain masked from Viewers until verified by a Data Steward.
          </p>
        </div>

        {isSteward && totalQuarantined > 0 && (
          <button
            onClick={handleBatchVerifyAll}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Batch Approve All ({totalQuarantined} Pending)</span>
          </button>
        )}
      </div>

      {successBanner && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs">
          <div className="text-neutral-500 dark:text-neutral-400 text-xs font-medium">Total Store Records</div>
          <div className="text-xl font-black text-neutral-900 dark:text-neutral-100 mt-1">
            {locations.length}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">Authoritative active retail fleet</div>
        </div>

        <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs">
          <div className="text-neutral-500 dark:text-neutral-400 text-xs font-medium">Verified Public Contacts</div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {locations.length - pendingLocations.length} / {locations.length}
          </div>
          <div className="text-[11px] text-emerald-600/80 mt-0.5">Visible to all employees</div>
        </div>

        <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs">
          <div className="text-neutral-500 dark:text-neutral-400 text-xs font-medium">Quarantined in Review</div>
          <div className={`text-xl font-black mt-1 ${totalQuarantined > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-400'}`}>
            {totalQuarantined}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            {totalQuarantined > 0 ? 'Masked from Viewers pending sign-off' : 'All contacts fully certified'}
          </div>
        </div>
      </div>

      {/* Quarantined Stores Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-red-600" />
            <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
              Retail Locations Contact Quarantine Queue ({pendingLocations.length})
            </h3>
          </div>
          {pendingLocations.length === 0 && (
            <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>100% Certified</span>
            </span>
          )}
        </div>

        {pendingLocations.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
              No Quarantined Store Contacts
            </p>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              All store manager contacts across all active retail locations have been reviewed and verified by the Directory Data Steward.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2 px-3">Store #</th>
                  <th className="py-2 px-3">Store Name & City</th>
                  <th className="py-2 px-3">Store Manager</th>
                  <th className="py-2 px-3">Manager Phone</th>
                  <th className="py-2 px-3">Current Visibility</th>
                  <th className="py-2 px-3 text-right">Steward Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {pendingLocations.map(loc => (
                  <tr key={loc.id} className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                    <td className="py-2.5 px-3 font-mono font-bold text-neutral-900 dark:text-neutral-100">
                      #{loc.storeNumber}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-neutral-900 dark:text-neutral-100">{loc.name}</div>
                      <div className="text-[11px] text-neutral-500">{loc.city}, {loc.state} • {loc.district}</div>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-neutral-800 dark:text-neutral-200">
                      {loc.storeManagerName || <span className="text-neutral-400 italic">Vacant</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-mono text-neutral-900 dark:text-neutral-100 font-medium">
                        {loc.storeManagerPhone || '—'}
                      </div>
                      <div className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
                        <Lock className="w-2.5 h-2.5" />
                        <span>Masked from general viewers</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <PrivacyBadge 
                        visibility={loc.storeManagerPhoneVisibility || 'Pending Review'}
                        isVerified={loc.isStoreManagerPhoneVerified ?? false}
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {isSteward ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => toggleLocationPhonePrivacy(loc.id, 'Internal Management Only')}
                            className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 text-neutral-700 dark:text-neutral-300 rounded text-[11px] font-medium"
                          >
                            Mgmt Only
                          </button>
                          <button
                            onClick={() => handleVerifyLocation(loc.id, loc.storeNumber)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold flex items-center gap-1 shadow-2xs"
                          >
                            <Check className="w-3 h-3" />
                            <span>Verify Public</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-neutral-400 text-[11px] italic">Steward Required</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Personnel Quarantine Queue */}
      {pendingPeople.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-red-600" />
              <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                Personnel Contact Review Queue ({pendingPeople.length})
              </h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2 px-3">Name</th>
                  <th className="py-2 px-3">Job Title & Dept</th>
                  <th className="py-2 px-3">Phone</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {pendingPeople.map(p => (
                  <tr key={p.id} className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                    <td className="py-2.5 px-3 font-bold text-neutral-900 dark:text-neutral-100">
                      {p.name}
                    </td>
                    <td className="py-2.5 px-3">
                      <div>{p.jobTitle}</div>
                      <div className="text-[11px] text-neutral-500">{p.department}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {p.workPhone}
                    </td>
                    <td className="py-2.5 px-3">
                      <PrivacyBadge 
                        visibility={p.phoneVisibility || 'Pending Review'}
                        isVerified={p.isPhoneVerified ?? false}
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {isSteward && (
                        <button
                          onClick={() => handleVerifyPerson(p.id, p.name)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold inline-flex items-center gap-1 shadow-2xs"
                        >
                          <Check className="w-3 h-3" />
                          <span>Verify</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { 
  X, 
  MapPin, 
  Phone, 
  Mail, 
  Clock, 
  Building, 
  User, 
  ShieldCheck, 
  Calendar, 
  AlertTriangle, 
  Edit3, 
  Copy, 
  Check, 
  ExternalLink,
  Navigation,
  Printer,
  History,
  CheckCircle2,
  FileSpreadsheet,
  Lock,
  Eye,
  EyeOff,
  Globe,
  RefreshCw
} from 'lucide-react';
import { LocationRecord, ContactPrivacyLevel } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { getTodayHoursForLocation } from '../../utils/timezoneHelper';
import { OperationalStatusBadge, PrivacyBadge } from '../common/StatusBadge';

interface LocationDetailModalProps {
  location: LocationRecord | null;
  onClose: () => void;
  onEdit: (location: LocationRecord) => void;
  onRequestCorrection: (location: LocationRecord) => void;
}

export const LocationDetailModal: React.FC<LocationDetailModalProps> = ({
  location,
  onClose,
  onEdit,
  onRequestCorrection,
}) => {
  const { 
    currentUser, 
    verifyLocation, 
    verifyManagerPhone, 
    toggleLocationPhonePrivacy, 
    auditLogs,
    syncSingleLocationToGbp
  } = useDirectory();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'hours' | 'history'>('details');
  const [isGbpSyncing, setIsGbpSyncing] = useState(false);
  const [gbpSyncFeedback, setGbpSyncFeedback] = useState<string | null>(null);

  // Keyboard accessibility sweep (ESC to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!location) return null;

  const hoursData = getTodayHoursForLocation(location);
  const canDirectEdit = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';
  const isViewer = currentUser.role === 'Viewer';

  const isQuarantined = location.storeManagerPhoneVisibility === 'Pending Review' || location.isStoreManagerPhoneVerified === false;
  const isManagementOnly = location.storeManagerPhoneVisibility === 'Internal Management Only';
  const shouldMaskPhone = (isQuarantined || isManagementOnly) && isViewer;

  const handleCopyInfo = () => {
    const phoneString = shouldMaskPhone ? '(•••) •••-•••• (Pending Review)' : (location.storeManagerPhone || 'N/A');
    const text = `Shiekh Store #${location.storeNumber} - ${location.name}\nAddress: ${location.address}, ${location.city}, ${location.state} ${location.zipCode}\nStore Phone: ${location.phone}\nManager: ${location.storeManagerName || 'N/A'} (${phoneString})\nDistrict: ${location.district || 'N/A'}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = () => {
    verifyLocation(location.id, currentUser.displayName);
  };

  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
  const locationAudit = auditLogs.filter(a => a.entityId === location.id);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 animate-fadeIn">
      <div 
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Banner */}
        <div className="p-4 sm:p-5 bg-neutral-900 text-white flex items-start justify-between relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-red-600 text-white font-bold text-xs">
                STORE #{location.storeNumber}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                {location.type}
              </span>
              <OperationalStatusBadge status={location.operationalStatus} size="sm" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
              {location.name}
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-2">
              <span>{location.city}, {location.state}</span>
              <span>•</span>
              <span>{location.district || 'Unassigned District'}</span>
              <span>•</span>
              <span className="font-mono text-neutral-400">ID: {location.id}</span>
            </p>
          </div>

          <button 
            onClick={onClose}
            aria-label="Close store details"
            className="p-1.5 text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-md transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-4 bg-neutral-50 dark:bg-neutral-900/80 border-b border-neutral-200 dark:border-neutral-800 text-xs font-medium">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('details')}
              className={`py-2.5 border-b-2 font-semibold transition-colors ${
                activeTab === 'details' 
                  ? 'border-red-600 text-red-600 dark:text-red-400' 
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              Overview & Contacts
            </button>
            <button
              onClick={() => setActiveTab('hours')}
              className={`py-2.5 border-b-2 font-semibold transition-colors ${
                activeTab === 'hours' 
                  ? 'border-red-600 text-red-600 dark:text-red-400' 
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              Operating Hours & Notices
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-2.5 border-b-2 font-semibold transition-colors ${
                activeTab === 'history' 
                  ? 'border-red-600 text-red-600 dark:text-red-400' 
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              Audit History ({locationAudit.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyInfo}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-[11px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-neutral-800 dark:text-neutral-200 text-xs sm:text-sm">
          {activeTab === 'details' && (
            <>
              {/* Notice Banner if active or non-normal operational status (Blueprint Sec 8) */}
              {(location.activeNotice || location.operationalStatus !== 'Open — Normal Operations') && (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="font-bold text-xs uppercase tracking-wider text-amber-900 dark:text-amber-200">
                        {location.activeNotice?.status || location.operationalStatus} Notice
                      </span>
                    </div>
                    {location.activeNotice?.expectedResolutionDate && (
                      <span className="px-2 py-0.5 bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-200 font-mono text-[10px] font-bold rounded">
                        Expected Resolution: {location.activeNotice.expectedResolutionDate}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-amber-800 dark:text-amber-300 font-medium pl-6">
                    {location.activeNotice?.shortDescription || `Location currently marked as ${location.operationalStatus}.`}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-amber-700/70 dark:text-amber-400/70 pt-1.5 border-t border-amber-200/60 dark:border-amber-900/40 pl-6">
                    <span>Effective: {location.activeNotice?.effectiveDate || location.lastUpdated}</span>
                    <span>Logged by: {location.activeNotice?.updatedBy || location.lastUpdatedBy}</span>
                  </div>
                </div>
              )}

              {/* Physical Location Card & Hours */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Address & Store Phone Card */}
                <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/60 rounded-lg border border-neutral-200 dark:border-neutral-700/60 space-y-3">
                  <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-red-600" />
                    <span>Store Property & Phone</span>
                  </div>

                  <div>
                    {location.mallOrCenterName && (
                      <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                        {location.mallOrCenterName}
                      </div>
                    )}
                    <div className="text-neutral-600 dark:text-neutral-300 mt-0.5">
                      {location.address}
                    </div>
                    <div className="text-neutral-600 dark:text-neutral-300">
                      {location.city}, {location.state} {location.zipCode}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700/60 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-neutral-400" />
                      <a
                        href={`tel:${location.phone}`}
                        className="font-bold text-red-600 dark:text-red-400 hover:underline"
                      >
                        {location.phone}
                      </a>
                    </div>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(`${location.name} ${location.address} ${location.city} ${location.state} ${location.zipCode}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                    >
                      <span>Directions</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Operating Status & Today's Schedule Card */}
                <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/60 rounded-lg border border-neutral-200 dark:border-neutral-700/60 space-y-2.5">
                  <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-red-600" />
                      <span>Today's Store Hours</span>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-400">
                      {hoursData.localTimeString}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                        {hoursData.hoursString}
                      </div>
                      <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Local Timezone: {location.timeZone}
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      hoursData.isOpenNow
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300'
                    }`}>
                      {hoursData.statusBadge.text}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700/60 flex items-center justify-between text-[11px]">
                    <span className="text-neutral-500">Weekly Schedule</span>
                    <button
                      onClick={() => setActiveTab('hours')}
                      className="text-red-600 dark:text-red-400 font-medium hover:underline"
                    >
                      View All 7 Days →
                    </button>
                  </div>
                </div>
              </div>

              {/* Leadership Assignment Roster */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-red-600" />
                  <span>Store Leadership Roster</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Store Manager with Privacy Controls */}
                  <div className="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-[10px] font-semibold text-neutral-400 uppercase">Store Manager</div>
                        <div className="font-bold text-neutral-900 dark:text-neutral-100 text-sm mt-0.5">
                          {location.storeManagerName || 'Position Vacant'}
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 flex items-center justify-center font-bold text-xs">
                        SM
                      </div>
                    </div>

                    {location.storeManagerPhone && (
                      <div className="pt-1 border-t border-neutral-100 dark:border-neutral-700/60 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-neutral-400" />
                            {shouldMaskPhone ? (
                              <span className="font-mono text-neutral-400 font-semibold tracking-wider">
                                (•••) •••-••••
                              </span>
                            ) : (
                              <a href={`tel:${location.storeManagerPhone}`} className="hover:underline text-red-600 dark:text-red-400 font-medium">
                                {location.storeManagerPhone}
                              </a>
                            )}
                          </div>
                          <PrivacyBadge 
                            visibility={location.storeManagerPhoneVisibility || (location.isStoreManagerPhoneVerified === false ? 'Pending Review' : 'Directory Public')} 
                            isVerified={location.isStoreManagerPhoneVerified ?? true}
                          />
                        </div>

                        {/* Privacy Explanation or Steward Action */}
                        {shouldMaskPhone && (
                          <div className="p-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded text-[10px] text-amber-800 dark:text-amber-300 flex items-start gap-1">
                            <Lock className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>Quarantined contact imported from migration pipeline. Pending Data Steward review.</span>
                          </div>
                        )}

                        {canDirectEdit && (
                          <div className="pt-1 flex items-center justify-between gap-1 flex-wrap">
                            {isQuarantined ? (
                              <button
                                onClick={() => verifyManagerPhone(location.id)}
                                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold flex items-center gap-1 transition-colors"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Verify & Publish Contact</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                                ✓ Verified Work Contact
                              </span>
                            )}

                            <select
                              value={location.storeManagerPhoneVisibility || 'Directory Public'}
                              onChange={(e) => toggleLocationPhonePrivacy(location.id, e.target.value as ContactPrivacyLevel)}
                              className="text-[10px] bg-neutral-100 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded px-1 py-0.5 text-neutral-700 dark:text-neutral-300 font-medium"
                            >
                              <option value="Directory Public">Directory Public</option>
                              <option value="Internal Management Only">Management Only</option>
                              <option value="Pending Review">Pending Review</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* District Manager */}
                  <div className="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 flex items-start justify-between">
                    <div>
                      <div className="text-[10px] font-semibold text-neutral-400 uppercase">District Manager</div>
                      <div className="font-bold text-neutral-900 dark:text-neutral-100 text-sm mt-0.5">
                        {location.districtManagerName || 'Unassigned'}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        {location.district || 'Retail District'}
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-xs">
                      DM
                    </div>
                  </div>

                  {/* Assistant Store Managers */}
                  <div className="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                    <div className="text-[10px] font-semibold text-neutral-400 uppercase">Assistant Manager(s)</div>
                    {location.assistantStoreManagerNames && location.assistantStoreManagerNames.length > 0 ? (
                      <div className="mt-1 space-y-1">
                        {location.assistantStoreManagerNames.map((name, i) => (
                          <div key={i} className="font-medium text-neutral-800 dark:text-neutral-200 text-xs">
                            • {name}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-neutral-400 mt-1 italic">None assigned</div>
                    )}
                  </div>

                  {/* Key Holders / 2nd / 3rd Keys */}
                  <div className="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                    <div className="text-[10px] font-semibold text-neutral-400 uppercase">Key Holders / 2nd / 3rd Keys</div>
                    {location.keyHolderNames && location.keyHolderNames.length > 0 ? (
                      <div className="mt-1 space-y-1">
                        {location.keyHolderNames.map((name, i) => (
                          <div key={i} className="font-medium text-neutral-800 dark:text-neutral-200 text-xs">
                            • {name}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-neutral-400 mt-1 italic">None assigned</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Data Freshness & Verification Roster */}
              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                      Last Verified: {location.lastVerifiedDate || 'Not verified'}
                    </span>
                    <span className="text-neutral-400 ml-1.5">
                      by {location.verifiedBy || 'System Import'}
                    </span>
                  </div>
                </div>
                {canDirectEdit && (
                  <button
                    onClick={handleVerify}
                    className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded font-semibold text-[11px] hover:bg-emerald-100"
                  >
                    Verify Today
                  </button>
                )}
              </div>

              {/* Google Business Profile Sync & Place Association (Blueprint Sec 14 & 15) */}
              <div className="p-3 bg-blue-50/40 dark:bg-blue-950/20 rounded-lg border border-blue-200/80 dark:border-blue-800/50 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div>
                      <span className="font-bold text-neutral-900 dark:text-neutral-100">
                        Google Business Profile (Maps & Search)
                      </span>
                      {location.gbpLocationId ? (
                        <span className="ml-2 font-mono text-[10px] text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.5 rounded font-semibold">
                          {location.gbpLocationId}
                        </span>
                      ) : (
                        <span className="ml-2 text-[10px] text-neutral-400 italic">
                          (Unlinked)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {location.gbpMapsUrl && (
                      <a
                        href={location.gbpMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 bg-white dark:bg-neutral-800 hover:bg-neutral-100 text-blue-600 dark:text-blue-400 rounded text-[11px] font-bold border border-neutral-200 dark:border-neutral-700 flex items-center gap-1 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>View Maps</span>
                      </a>
                    )}

                    {canDirectEdit && location.gbpLocationId && (
                      <button
                        onClick={async () => {
                          setIsGbpSyncing(true);
                          setGbpSyncFeedback(null);
                          try {
                            const res = await syncSingleLocationToGbp(location.id);
                            if (res.success) {
                              setGbpSyncFeedback('Synced to Google Maps (HTTP 200)');
                            } else {
                              setGbpSyncFeedback(`Sync failed: ${res.error}`);
                            }
                          } finally {
                            setIsGbpSyncing(false);
                            setTimeout(() => setGbpSyncFeedback(null), 3500);
                          }
                        }}
                        disabled={isGbpSyncing}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors"
                      >
                        <RefreshCw className={`w-3 h-3 ${isGbpSyncing ? 'animate-spin' : ''}`} />
                        <span>{isGbpSyncing ? 'Syncing...' : 'Push to Google'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {gbpSyncFeedback && (
                  <div className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 bg-blue-100/60 dark:bg-blue-900/40 p-1.5 rounded">
                    {gbpSyncFeedback}
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1 border-t border-blue-100 dark:border-blue-900/40">
                  <span>
                    Status: <strong className="text-neutral-700 dark:text-neutral-300">{location.gbpSyncStatus || 'Unmapped'}</strong>
                    {location.gbpListingStatus && ` (${location.gbpListingStatus})`}
                  </span>
                  <span>
                    Last Synced: {location.gbpLastSyncedAt ? new Date(location.gbpLastSyncedAt).toLocaleDateString() : 'Never'}
                  </span>
                </div>
              </div>
            </>
          )}

          {activeTab === 'hours' && (
            <div className="space-y-4">
              <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                Standard Weekly Operating Schedule ({location.timeZone})
              </div>

              <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden divide-y divide-neutral-200 dark:divide-neutral-700">
                {daysOfWeek.map((day) => {
                  const schedule = location.standardHours?.[day] || { open: '10:00 AM', close: '09:00 PM' };
                  const isCurrentDay = hoursData.dayName.toLowerCase() === day;
                  return (
                    <div 
                      key={day}
                      className={`px-4 py-2.5 flex items-center justify-between text-xs ${
                        isCurrentDay ? 'bg-red-50/70 dark:bg-red-950/20 font-bold' : ''
                      }`}
                    >
                      <span className="capitalize text-neutral-700 dark:text-neutral-300">{day}</span>
                      <span className="font-mono text-neutral-900 dark:text-neutral-100">
                        {schedule.open} – {schedule.close}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                System of Record Audit Trail
              </div>

              {locationAudit.length === 0 ? (
                <div className="p-8 text-center text-neutral-400 text-xs">
                  No previous audit mutations recorded for this location yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {locationAudit.map(aud => (
                    <div key={aud.id} className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-neutral-900 dark:text-neutral-100">{aud.fieldChanged}</span>
                        <span className="text-[10px] text-neutral-400 font-mono">{new Date(aud.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="text-neutral-600 dark:text-neutral-400 flex items-center gap-2">
                        <span>Old: <code className="bg-neutral-200 dark:bg-neutral-700 px-1 py-0.5 rounded text-[11px]">{aud.previousValue || 'none'}</code></span>
                        <span>→</span>
                        <span>New: <code className="bg-neutral-200 dark:bg-neutral-700 px-1 py-0.5 rounded text-[11px] text-red-600 dark:text-red-400 font-semibold">{aud.newValue}</code></span>
                      </div>
                      <div className="text-[10px] text-neutral-400 pt-1">
                        Changed by: <span className="font-medium">{aud.changedBy}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions (Dead-End Prevention Sweep) */}
        <div className="p-3 sm:p-4 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <button
            onClick={() => {
              onRequestCorrection(location);
            }}
            className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-amber-500" />
            <span>Request Correction</span>
          </button>

          <div className="flex items-center gap-2">
            {canDirectEdit && (
              <button
                onClick={() => {
                  onEdit(location);
                }}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Master Record</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 rounded-md text-xs font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

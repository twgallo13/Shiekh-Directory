import React, { useState, useMemo, useRef } from 'react';
import { LocationRecord, PersonRecord } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { getTodayHoursForLocation } from '../../utils/timezoneHelper';
import { OperationalStatusBadge, PrivacyBadge } from '../common/StatusBadge';
import { AuditLogView } from '../common/AuditLogView';
import { useDialogFocus } from '../common/useDialogFocus';
import { 
  X, 
  MapPin, 
  Phone, 
  Clock, 
  CheckCircle2, 
  Edit3, 
  AlertCircle, 
  ExternalLink,
  ShieldCheck,
  Globe,
  Star,
  History,
  Info,
  Calendar,
  Copy,
  Check
} from 'lucide-react';

interface LocationDetailModalProps {
  location: LocationRecord | null;
  onClose: () => void;
  onEdit: (location: LocationRecord) => void;
  onRequestCorrection: (location: LocationRecord) => void;
  onSelectPerson?: (person: PersonRecord) => void;
}

export type LocationDetailTab = 'overview' | 'hours' | 'audit';

export const LocationDetailModal: React.FC<LocationDetailModalProps> = ({
  location,
  onClose,
  onEdit,
  onRequestCorrection,
  onSelectPerson,
}) => {
  const { currentUser, people, verifyLocation, auditLogs } = useDirectory();

  // Tabbed Navigation State
  const [activeTab, setActiveTab] = useState<LocationDetailTab>('overview');
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(Boolean(location), onClose, dialogRef);

  // Filter audit logs specifically for this location
  const locationAuditLogs = useMemo(() => {
    if (!location) return [];
    return auditLogs.filter(log => 
      log.entityId === location.id ||
      (log.entityType === 'Location' && (
        log.entityName.includes(location.storeNumber) ||
        log.details.includes(location.storeNumber) ||
        log.details.includes(location.name)
      ))
    );
  }, [auditLogs, location?.id, location?.storeNumber, location?.name]);

  if (!location) return null;

  const todayStatus = getTodayHoursForLocation(location);
  const canEditDirectly = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';

  const handleOpenPerson = (personId?: string, personName?: string) => {
    if (!onSelectPerson) return;
    let found = personId ? people.find(p => p.id === personId) : undefined;
    if (!found && personName) {
      found = people.find(p => p.fullName.toLowerCase() === personName.toLowerCase() || personName.toLowerCase().includes(p.fullName.toLowerCase()));
    }
    if (found) {
      onSelectPerson(found);
    }
  };

  const handleCopyStoreInfo = () => {
    const summary = `Shiekh Shoes — Store #${location.storeNumber} (${location.name})
Address: ${location.address}, ${location.city}, ${location.state} ${location.zipCode}
Phone: ${location.phone}
Hours (Today): ${todayStatus.hoursString}
Operating Status: ${location.operationalStatus}`;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const daysList = [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' },
  ] as const;

  // Determine current day of week (lowercase)
  const currentDayKey = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: location.timeZone || 'America/Los_Angeles',
  }).format(new Date()).toLowerCase();

  const isNonRetail = location.type === 'Corporate Office' || location.type === 'Warehouse / Distribution Center' || location.type === 'Other Company Location';
  const classification = isNonRetail ? 'Non-Retail / Corporate' : 'Retail Store';

  const getCurrentStatusDisplay = () => {
    const currentDayHours = location.standardHours?.[currentDayKey as keyof typeof location.standardHours];
    if (todayStatus.isOpenNow) {
      if (currentDayHours && !currentDayHours.isClosed && currentDayHours.close) {
        const [hStr, mStr] = currentDayHours.close.split(':');
        const h = parseInt(hStr, 10);
        const m = mStr || '00';
        const period = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 === 0 ? 12 : h % 12;
        return `Open - Closes ${displayH}:${m.padStart(2, '0')} ${period}`;
      }
      return 'Open - Closes 10:00 PM';
    }
    if (location.operationalStatus?.includes('Closed') || todayStatus.hoursString.includes('Closed')) {
      return todayStatus.hoursString || 'Closed Today';
    }
    return todayStatus.hoursString || 'Open - Closes 10:00 PM';
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-detail-title"
        tabIndex={-1}
        className="bg-white border border-neutral-200 rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        
        {/* Dark Modal Header */}
        <div className="bg-neutral-900 text-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              {/* Top row flex: Red badge (STORE #DC-01), muted text (Warehouse / Distribution Center), and green badge (Open) */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="px-2 py-0.5 rounded bg-red-700 text-white text-xs font-mono font-bold">
                  STORE #{location.storeNumber}
                </span>
                <span className="text-xs text-neutral-400 font-medium">
                  {location.type}
                </span>
                <OperationalStatusBadge status={location.operationalStatus} surface="dark" />
              </div>

              {/* Title: Bold white text */}
              <h2 id="location-detail-title" className="text-xl font-bold text-white tracking-tight">
                {location.name}
              </h2>

              {/* Subtitle: Muted text */}
              <div className="text-xs text-neutral-400 font-normal">
                {location.city}, {location.state} • {classification} • ID: {location.id}
              </div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close location details"
              className="p-1.5 text-neutral-400 hover:text-white cursor-pointer rounded-lg hover:bg-neutral-800 transition-colors shrink-0"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation: White background with bottom border, [Copy] button to far right */}
        <div className="bg-white px-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-4 py-3 text-xs border-b-2 transition-all cursor-pointer ${
                activeTab === 'overview'
                  ? 'border-red-600 text-red-600 font-bold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 font-medium'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span>Overview & Contacts</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('hours')}
              className={`flex items-center gap-2 px-4 py-3 text-xs border-b-2 transition-all cursor-pointer ${
                activeTab === 'hours'
                  ? 'border-red-600 text-red-600 font-bold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 font-medium'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Operating Hours & Notices</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-2 px-4 py-3 text-xs border-b-2 transition-all cursor-pointer ${
                activeTab === 'audit'
                  ? 'border-red-600 text-red-600 font-bold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 font-medium'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Audit History</span>
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'audit'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-neutral-100 text-neutral-600'
              }`}>
                {locationAuditLogs.length}
              </span>
            </button>
          </div>

          {/* Far-Right [Copy] Action Button */}
          <button
            type="button"
            onClick={handleCopyStoreInfo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg cursor-pointer transition-colors shadow-2xs shrink-0"
            title="Copy store information to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-neutral-600" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs">
          
          {/* TAB 1: OVERVIEW & CONTACTS */}
          {activeTab === 'overview' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              
              {/* 1. Property & Hours Columns - Two-Column Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Left Column (Property) */}
                <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-3 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                        Store Property & Contact
                      </div>
                      <PrivacyBadge level={location.phonePrivacy} />
                    </div>

                    {/* Clickable Phone Number Link in Canonical Red */}
                    <div className="p-2.5 bg-white rounded-lg border border-neutral-200 shadow-2xs space-y-1">
                      <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                        Direct Customer Line
                      </div>
                      <a 
                        href={`tel:${location.phone.replace(/[^0-9+]/g, '')}`}
                        className="flex items-center gap-2 group pt-0.5"
                        title="Click to call store"
                      >
                        <div className="p-1.5 rounded-md bg-red-50 text-red-600 border border-red-200 group-hover:bg-red-100 transition-colors">
                          <Phone className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-sm font-mono font-medium text-red-600 group-hover:text-red-700 group-hover:underline">
                          {location.phone}
                        </span>
                      </a>
                    </div>

                    {/* Clickable Address Block with Directions External Link */}
                    <div className="p-2.5 bg-white rounded-lg border border-neutral-200 shadow-2xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                          Physical Address
                        </span>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.address}, ${location.city}, ${location.state} ${location.zipCode}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded hover:bg-red-100 transition-colors"
                          title="Get Google Maps directions"
                        >
                          <span>Directions</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.address}, ${location.city}, ${location.state} ${location.zipCode}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 group pt-0.5"
                      >
                        <div className="p-1.5 rounded-md bg-red-50 text-red-600 border border-red-200 group-hover:bg-red-100 transition-colors shrink-0 mt-0.5">
                          <MapPin className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-neutral-800 group-hover:text-red-700 group-hover:underline">
                            {location.address}
                          </div>
                          <div className="text-xs text-neutral-600 font-normal">
                            {location.city}, {location.state} {location.zipCode}
                          </div>
                        </div>
                      </a>
                    </div>
                  </div>

                  {/* Location Meta Details */}
                  <div className="pt-2 border-t border-neutral-200 space-y-1.5 text-neutral-600">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-neutral-500">Location Type:</span>
                      <span className="font-semibold text-neutral-800">{location.type}</span>
                    </div>
                    {location.mallOrCenterName && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-neutral-500">Center / Mall:</span>
                        <span className="font-semibold text-neutral-800 truncate max-w-[180px]">{location.mallOrCenterName}</span>
                      </div>
                    )}
                    {/* External Store & Review Links if available */}
                    {(location.googleReviewUrl || location.storePageUrl) && (
                      <div className="pt-1.5 flex flex-wrap gap-1.5">
                        {location.googleReviewUrl && (
                          <a 
                            href={location.googleReviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded hover:bg-amber-100 transition-colors"
                          >
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            <span>Reviews</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                        {location.storePageUrl && (
                          <a 
                            href={location.storePageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded hover:bg-blue-100 transition-colors"
                          >
                            <Globe className="w-3 h-3 text-blue-600" />
                            <span>Webpage</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column (Hours) */}
                <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-3 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                        Operating Hours
                      </div>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        {location.timeZone ? location.timeZone.split('/')[1]?.replace('_', ' ') : 'Local Time'}
                      </span>
                    </div>

                    {/* Current status wrapped in prominent green highlight box */}
                    <div className="bg-emerald-50 text-emerald-800 p-2 rounded flex items-center justify-between font-semibold text-xs border border-emerald-200/70">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span>{getCurrentStatusDisplay()}</span>
                      </div>
                      <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    </div>

                    {/* Today's Schedule Overview */}
                    <div className="p-2.5 bg-white rounded-lg border border-neutral-200 text-xs space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-neutral-500">
                        <span>Today ({todayStatus.dayName}):</span>
                        <span className="font-mono font-bold text-neutral-900">{todayStatus.hoursString}</span>
                      </div>
                      {location.activeNotice && (
                        <div className="pt-1.5 border-t border-neutral-100 text-[10px] text-amber-700 flex items-center gap-1 font-medium">
                          <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                          <span className="truncate">{location.activeNotice.shortDescription}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* View All 7 Days Styled in Red */}
                  <div className="pt-2 border-t border-neutral-200 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setActiveTab('hours')}
                      className="text-red-600 hover:text-red-700 font-medium text-xs inline-flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <span>View All 7 Days &rarr;</span>
                    </button>
                    <span className="text-[10px] text-neutral-400">Weekly Schedule</span>
                  </div>
                </div>

              </div>

              {/* 2. Overview Tab - Leadership Roster 2x2 CSS Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">
                    Store Leadership Roster
                  </div>
                  <span className="text-[10px] text-neutral-400">Personnel & Hierarchy</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Card 1: Store Manager */}
                  <div className="border border-neutral-200 rounded-md p-3 bg-white shadow-2xs space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                          Store Manager
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                          SM
                        </span>
                      </div>
                      {location.storeManagerName ? (
                        <button
                          type="button"
                          onClick={() => handleOpenPerson(location.storeManagerId, location.storeManagerName)}
                          className="text-neutral-900 font-bold hover:text-red-600 hover:underline flex items-center gap-1 cursor-pointer text-xs"
                        >
                          <span>{location.storeManagerName}</span>
                          <ExternalLink className="w-3 h-3 text-neutral-400" />
                        </button>
                      ) : (
                        <span className="text-neutral-400 italic text-xs">Position Vacant</span>
                      )}
                    </div>
                    <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px]">
                      <span className="text-neutral-500">Direct Phone:</span>
                      {location.storeManagerPhone ? (
                        <a 
                          href={`tel:${location.storeManagerPhone.replace(/[^0-9+]/g, '')}`}
                          className="font-mono font-medium text-red-600 hover:underline"
                        >
                          {location.storeManagerPhone}
                        </a>
                      ) : (
                        <span className="text-neutral-400 font-mono">None on file</span>
                      )}
                    </div>
                  </div>

                  {/* Card 2: District Manager */}
                  <div className="border border-neutral-200 rounded-md p-3 bg-white shadow-2xs space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                          District Manager
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          DM
                        </span>
                      </div>
                      {location.districtManagerName ? (
                        <button
                          type="button"
                          onClick={() => handleOpenPerson(location.districtManagerId, location.districtManagerName)}
                          className="text-neutral-900 font-bold hover:text-red-600 hover:underline flex items-center gap-1 cursor-pointer text-xs"
                        >
                          <span>{location.districtManagerName}</span>
                          <ExternalLink className="w-3 h-3 text-neutral-400" />
                        </button>
                      ) : (
                        <span className="text-neutral-400 italic text-xs">Unassigned</span>
                      )}
                    </div>
                    <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px]">
                      <span className="text-neutral-500">District:</span>
                      <span className="text-neutral-700 font-medium truncate max-w-[150px]">
                        {location.district || 'Unassigned District'}
                      </span>
                    </div>
                  </div>

                  {/* Card 3: Assistant Manager(s) */}
                  <div className="border border-neutral-200 rounded-md p-3 bg-white shadow-2xs space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                          Assistant Managers
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                          ASM
                        </span>
                      </div>
                      {location.assistantStoreManagerNames && location.assistantStoreManagerNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {location.assistantStoreManagerNames.map((name, idx) => (
                            <span 
                              key={idx} 
                              onClick={() => handleOpenPerson(undefined, name)}
                              className="inline-flex items-center gap-1 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded text-[11px] text-neutral-800 font-medium cursor-pointer transition-colors"
                            >
                              <span>{name}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-neutral-400 italic text-xs">None Assigned</span>
                      )}
                    </div>
                    <div className="pt-2 border-t border-neutral-100 text-[11px] text-neutral-500">
                      {location.assistantStoreManagerNames?.length || 0} Assistant{(location.assistantStoreManagerNames?.length !== 1) ? 's' : ''} on roster
                    </div>
                  </div>

                  {/* Card 4: Designated Key Holders */}
                  <div className="border border-neutral-200 rounded-md p-3 bg-white shadow-2xs space-y-2 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                          Key Holders
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          KH
                        </span>
                      </div>
                      {location.keyHolderNames && location.keyHolderNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {location.keyHolderNames.map((name, idx) => (
                            <span 
                              key={idx} 
                              onClick={() => handleOpenPerson(undefined, name)}
                              className="inline-flex items-center gap-1 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded text-[11px] text-neutral-700 cursor-pointer transition-colors"
                            >
                              <span>{name}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-neutral-400 italic text-xs">None Designated</span>
                      )}
                    </div>
                    <div className="pt-2 border-t border-neutral-100 text-[11px] text-neutral-500">
                      {location.keyHolderNames?.length || 0} Keyholder{(location.keyHolderNames?.length !== 1) ? 's' : ''} registered
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Steward Verification Block with Green Checkmark Icon */}
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-bold text-neutral-900 text-xs">Last Verified</span>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Last verified:{' '}
                    <span className="text-neutral-800 font-medium">
                      {location.lastVerifiedAt ? new Date(location.lastVerifiedAt).toLocaleDateString() : 'Pending verification'}
                    </span>{' '}
                    by {location.lastVerifiedBy || 'System'}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {canEditDirectly && (
                    <button
                      type="button"
                      onClick={() => verifyLocation(location.id)}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs text-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verify Now</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 4. Google Business Profile (GBP) Status Block (Absolute bottom of content area) */}
              <div className="flex items-center justify-between p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 border border-blue-200">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-neutral-900">Google Business Profile (GBP)</div>
                    <div className="text-[11px] text-neutral-500">Maps Search Listings & Operating Hours</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Synced & Live</span>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: OPERATING HOURS & NOTICES */}
          {activeTab === 'hours' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              
              {/* Notice alert if active */}
              {location.activeNotice ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900 shadow-xs">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-900">Active Temporary Notice</span>
                      {location.activeNotice.effectiveDate && (
                        <span className="text-[10px] text-amber-700 font-medium">
                          Effective: {location.activeNotice.effectiveDate}
                        </span>
                      )}
                    </div>
                    <p className="text-amber-800 leading-relaxed font-medium">
                      {location.activeNotice.shortDescription}
                    </p>
                    {location.activeNotice.expectedResolutionDate && (
                      <span className="text-[11px] text-amber-700 block font-semibold">
                        Expected through: {location.activeNotice.expectedResolutionDate}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-500 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>No temporary or emergency notices active for this store location.</span>
                </div>
              )}

              {/* Weekly Operating Hours Schedule Table */}
              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-red-600" />
                    <span className="font-bold text-neutral-900">Weekly Operating Schedule</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-neutral-500">Today's Status: </span>
                    <strong className="text-red-700 font-bold">{todayStatus.hoursString}</strong>
                    {todayStatus.isHolidayOverride && (
                      <span className="ml-1.5 text-[10px] text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded font-bold">
                        Holiday Override
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2">
                  {daysList.map(({ key, label }) => {
                    const day = location.standardHours?.[key];
                    const isToday = currentDayKey === key;

                    return (
                      <div
                        key={key}
                        className={`p-3 rounded-lg border transition-all shadow-xs ${
                          isToday
                            ? 'bg-red-50/70 border-red-300 ring-1 ring-red-200'
                            : 'bg-white border-neutral-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-medium text-[10px] uppercase ${isToday ? 'text-red-700 font-bold' : 'text-neutral-500'}`}>
                            {label}
                          </span>
                          {isToday && (
                            <span className="text-[9px] font-bold text-red-700 bg-red-100 px-1.5 py-0.2 rounded-full">
                              Today
                            </span>
                          )}
                        </div>
                        <div className={`font-mono font-bold mt-1 text-xs ${
                          day?.isClosed ? 'text-neutral-400 italic' : isToday ? 'text-red-800' : 'text-neutral-900'
                        }`}>
                          {day?.isClosed ? 'Closed' : `${day?.open} — ${day?.close}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Special or Holiday Overrides if recorded */}
              {location.holidayHours && location.holidayHours.length > 0 && (
                <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-600" />
                    <span className="font-bold text-neutral-900">Scheduled Holiday Overrides</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {location.holidayHours.map((h) => (
                      <div key={h.id} className="p-2.5 bg-white border border-neutral-200 rounded-lg text-xs space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-neutral-900">{h.holidayName}</span>
                          <span className="text-[10px] font-mono text-neutral-500">{h.date}</span>
                        </div>
                        <div className="text-neutral-700 font-mono text-[11px]">
                          {h.hours.isClosed ? 'Closed All Day' : `${h.hours.open} — ${h.hours.close}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AUDIT HISTORY */}
          {activeTab === 'audit' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-1">
                <div>
                  <h3 className="font-bold text-neutral-900 text-sm">Historical Timeline of Changes</h3>
                  <p className="text-xs text-neutral-500">
                    Chronological change log recorded for Store #{location.storeNumber} ({location.name})
                  </p>
                </div>
                <span className="text-xs font-mono text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-lg border border-neutral-200">
                  {locationAuditLogs.length} event{locationAuditLogs.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Re-integrated AuditLogView filtered specifically for this location */}
              <AuditLogView 
                logs={locationAuditLogs} 
                locationId={location.id} 
                emptyMessage={`No audit records have been logged for Store #${location.storeNumber} yet.`}
              />
            </div>
          )}

        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onRequestCorrection(location)}
            className="px-3 py-2 bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-200 rounded-lg font-semibold flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
          >
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>Request Correction</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-lg font-semibold cursor-pointer shadow-xs transition-colors"
            >
              Close
            </button>
            {canEditDirectly && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(location);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Store Record</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

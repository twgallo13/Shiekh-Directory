import React, { useState, useMemo, useRef, useEffect } from 'react';
import { LocationRecord, PersonRecord } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { getTodayHoursForLocation } from '../../utils/timezoneHelper';
import { OperationalStatusBadge, PrivacyBadge } from '../common/StatusBadge';
import { AuditLogView } from '../common/AuditLogView';
import { useDialogFocus } from '../common/useDialogFocus';
import { CustomMetadataFields } from './CustomMetadataFields';
import { formatUsPhone } from '../../lib/contactNormalization';
import { normalizeLocationInboxEmail } from '../../lib/locationInboxEmail';
import { formatPersonPhone, resolvePersonPhone } from '../../lib/personContacts';
import { buildLocationReadProjection, resolveActiveLocationManagers, resolveActivePersonList } from '../../lib/readProjectionContract';
import { hierarchyDistrictLabel, resolveLocationHierarchy } from '../../lib/hierarchyResolution';
import { OperatingStatusPanel } from './OperatingStatusPanel';
import { effectiveNotice } from '../../lib/operatingState';
import { 
  X, 
  MapPin, 
  Phone, 
  Clock, 
  CheckCircle2, 
  Edit3, 
  AlertCircle, 
  ExternalLink,
  History,
  Info,
  Calendar,
  Copy,
  Check,
} from 'lucide-react';

interface LocationDetailModalProps {
  location: LocationRecord | null;
  onClose: () => void;
  onEdit: (location: LocationRecord) => void;
  onRequestCorrection: (location: LocationRecord) => void;
  onSelectPerson?: (person: PersonRecord) => void;
}

export type LocationDetailTab = 'overview' | 'hours' | 'audit' | 'details';

export const LocationDetailModal: React.FC<LocationDetailModalProps> = ({
  location,
  onClose,
  onEdit,
  onRequestCorrection,
  onSelectPerson,
}) => {
  const { currentUser, people, regions, districts, hoursTemplates, verifyLocation, auditLogs, customFieldDefinitions, operatingNow } = useDirectory();

  // Tabbed Navigation State
  const [activeTab, setActiveTab] = useState<LocationDetailTab>('overview');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(Boolean(location), onClose, dialogRef);
  useEffect(() => {
    setActiveTab('overview');
    setCopied(false);
    setCopyError('');
  }, [location?.id]);

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

  const todayStatus = getTodayHoursForLocation(location, operatingNow);
  const visibleNotice = effectiveNotice(location, operatingNow);
  const normalizedLocationInbox = normalizeLocationInboxEmail(location.locationInboxEmail);
  const canEditDirectly = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';
  const { storeManager, districtManager, regionalManager } = resolveActiveLocationManagers(location, people, districts);
  const managerPhone = resolvePersonPhone(storeManager);
  const managerPhoneLabel = formatUsPhone(managerPhone.value, managerPhone.extension);
  const managerPhonePrivacy = location.storeManagerPhonePrivacy || storeManager?.phonePrivacy || 'Restricted';
  const assistantManagers = resolveActivePersonList(location.assistantStoreManagerIds, people);
  const keyHolders = resolveActivePersonList(location.keyHolderIds, people);
  const staffingDiagnostics = buildLocationReadProjection(location, people, districts).warnings;
  const hierarchy = resolveLocationHierarchy(location, { regions, districts });
  const primaryEmployees = people.filter(person => person.primaryLocationId === location.id);
  const supportingEmployees = people.filter(person => person.supportedLocationIds?.includes(location.id));
  const hoursTemplate = hoursTemplates.find(template => template.id === location.hoursTemplateId);
  const hoursSourceLabel = hoursTemplate
    ? location.hoursMode === 'template'
      ? hoursTemplate.name
      : `Modified from ${hoursTemplate.name}`
    : 'Custom weekly schedule';

  const handleOpenPerson = (personId?: string) => {
    if (!onSelectPerson || !personId) return;
    const found = people.find(p => p.id === personId);
    if (found) {
      onSelectPerson(found);
    }
  };

  const handleCopyStoreInfo = async () => {
    const summary = `Shiekh Shoes — Store #${location.storeNumber} (${location.name})
Address: ${location.address}${location.suite ? `, ${location.suite}` : ''}, ${location.city}, ${location.state} ${location.zipCode}
Mall / center: ${location.mallOrCenterName || 'None recorded'}
Finding the store: ${location.wayfindingDirections || 'None recorded'}
Phone: ${formatUsPhone(location.phone, location.phoneExtension)}
Location inbox: ${location.locationInboxEmail || 'None recorded'}
Hours (Today): ${todayStatus.hoursString}
Operating Status: ${todayStatus.state} — ${todayStatus.reason}
Operational lifecycle: ${location.operationalStatus}`;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setCopyError('');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError('Clipboard access is unavailable. Select and copy the store information manually.');
    }
  };

  const handleCopyLocationInbox = async () => {
    if (!normalizedLocationInbox) return;
    try {
      await navigator.clipboard.writeText(normalizedLocationInbox.value);
      setCopied(true);
      setCopyError('');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError('Clipboard access is unavailable. Select and copy the location inbox manually.');
    }
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
  const currentDayKey = todayStatus.dayName.toLowerCase();


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
                <OperationalStatusBadge status={location.operationalStatus} location={location} surface="dark" />
              </div>

              {/* Title: Bold white text */}
              <h2 id="location-detail-title" className="text-xl font-bold text-white tracking-tight">
                {location.name}
              </h2>

              {/* Subtitle: Muted text */}
              <div className="text-xs text-neutral-400 font-normal">
                {location.city}, {location.state}
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
        <div className="flex items-center gap-1 border-b border-neutral-200 bg-white px-2 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              aria-pressed={activeTab === 'overview'}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1 px-1 py-3 text-xs border-b-2 transition-all cursor-pointer sm:flex-none sm:gap-2 sm:px-4 ${
                activeTab === 'overview'
                  ? 'border-red-600 text-red-600 font-bold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 font-medium'
              }`}
            >
              <Info className="hidden h-3.5 w-3.5 sm:block" />
              <span className="sm:hidden">Overview</span>
              <span className="hidden sm:inline">Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('hours')}
              aria-pressed={activeTab === 'hours'}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1 px-1 py-3 text-xs border-b-2 transition-all cursor-pointer sm:flex-none sm:gap-2 sm:px-4 ${
                activeTab === 'hours'
                  ? 'border-red-600 text-red-600 font-bold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 font-medium'
              }`}
            >
              <Clock className="hidden h-3.5 w-3.5 sm:block" />
              <span className="sm:hidden">Hours</span>
              <span className="hidden sm:inline">Hours & status</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              aria-pressed={activeTab === 'audit'}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1 px-1 py-3 text-xs border-b-2 transition-all cursor-pointer sm:flex-none sm:gap-2 sm:px-4 ${
                activeTab === 'audit'
                  ? 'border-red-600 text-red-600 font-bold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 font-medium'
              }`}
            >
              <History className="hidden h-3.5 w-3.5 sm:block" />
              <span className="sm:hidden">Audit</span>
              <span className="hidden sm:inline">History</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold sm:ml-1 ${
                activeTab === 'audit'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-neutral-100 text-neutral-600'
              }`}>
                {locationAuditLogs.length}
              </span>
            </button>
            <button type="button" aria-pressed={activeTab === 'details'} onClick={() => setActiveTab('details')} className={`min-w-0 flex-1 border-b-2 px-2 py-3 text-xs sm:flex-none sm:px-4 ${activeTab === 'details' ? 'border-red-600 font-bold text-red-600' : 'border-transparent font-medium text-neutral-500 hover:text-neutral-800'}`}>Details</button>
          </div>

          {/* Far-Right [Copy] Action Button */}
          <button
            type="button"
            onClick={handleCopyStoreInfo}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-300 bg-neutral-100 p-2 text-xs font-semibold text-neutral-700 shadow-2xs transition-colors hover:bg-neutral-200 hover:text-neutral-900 sm:px-3 sm:py-1.5"
            aria-label={copied ? 'Store information copied' : 'Copy store information'}
            title="Copy store information to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden text-emerald-700 sm:inline">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-neutral-600" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="min-h-0 overflow-y-auto flex-1 p-4 sm:p-5 text-sm">
          {copyError && <p role="alert" className="mb-3 text-xs text-red-700">{copyError}</p>}
          {copied && <p role="status" className="sr-only">Copied to clipboard.</p>}
          <OperatingStatusPanel key={location.id} location={location} alertsOnly={activeTab !== 'hours'} />
          
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <section aria-label="Address and contact" className="grid gap-5 sm:grid-cols-[1.15fr_1fr]">
                <div className="min-w-0">
                  <h3 className="mb-2 text-xs font-semibold text-neutral-500">Address</h3>
                  <address className="not-italic text-base font-semibold leading-relaxed text-neutral-900">
                    {location.address || 'Address not recorded'}
                    {location.suite && <span className="block">{location.suite}</span>}
                    <span className="block text-sm font-normal">{location.city}, {location.state} {location.zipCode}</span>
                  </address>
                  {location.mallOrCenterName && <p className="mt-1 break-words text-sm text-neutral-600">{location.mallOrCenterName}</p>}
                  {location.address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([location.address, location.suite, location.city, location.state, location.zipCode].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 py-1 text-sm font-medium text-red-700 hover:underline"><MapPin className="h-4 w-4" />Get directions<ExternalLink className="h-3 w-3" /></a>}
                  {location.wayfindingDirections && <div className="mt-3 border-l-2 border-neutral-200 pl-3"><h4 className="text-xs font-semibold text-neutral-500">Finding the store</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-800">{location.wayfindingDirections}</p></div>}
                </div>
                <div className="min-w-0 space-y-4">
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2"><h3 className="text-xs font-semibold text-neutral-500">Store phone</h3><PrivacyBadge level={location.phonePrivacy} /></div>
                    {location.phone ? <a href={`tel:${location.phone.replace(/[^0-9+]/g, '')}`} className="inline-flex items-center gap-2 py-1 text-base font-medium text-red-700 hover:underline"><Phone className="h-4 w-4" />{formatUsPhone(location.phone, location.phoneExtension)}</a> : <p className="text-sm text-neutral-500">Not recorded</p>}
                  </div>
                  <div>
                    <h3 className="mb-1 text-xs font-semibold text-neutral-500">Store inbox</h3>
                    {normalizedLocationInbox ? <div className="flex min-w-0 items-start gap-2">
                      <a href={`mailto:${encodeURIComponent(normalizedLocationInbox.value)}`} className="min-w-0 break-all py-1 text-sm font-medium text-red-700 hover:underline">{normalizedLocationInbox.value}</a>
                      <button type="button" aria-label="Copy location inbox" title="Copy location inbox" onClick={() => { void handleCopyLocationInbox(); }} className="shrink-0 rounded p-2 text-neutral-500 hover:bg-neutral-100"><Copy className="h-4 w-4" /></button>
                    </div> : <p className="text-sm text-neutral-500">{location.locationInboxEmail ? 'Saved inbox needs review' : 'Not recorded'}</p>}
                  </div>
                  {(location.storePageUrl || location.googleReviewUrl) && <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-red-700">
                    {location.storePageUrl && <a href={location.storePageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">Store website<ExternalLink className="h-3 w-3" /></a>}
                    {location.googleReviewUrl && <a href={location.googleReviewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">Google reviews<ExternalLink className="h-3 w-3" /></a>}
                  </div>}
                </div>
              </section>
              <section aria-label="Today's hours" className="flex flex-wrap items-center justify-between gap-3 border-y border-neutral-200 py-3">
                <div><h3 className="text-xs font-semibold text-neutral-500">Today · {todayStatus.dayName}</h3><p className="mt-1 text-sm font-semibold text-neutral-900">{todayStatus.hoursString}</p></div>
                <div className="text-right"><p className="text-xs text-neutral-500">{location.timeZone?.split('/').pop()?.replace(/_/g, ' ') || 'Local time'}</p><button type="button" onClick={() => setActiveTab('hours')} className="mt-1 py-1 text-sm font-medium text-red-700 hover:underline">Hours & status →</button></div>
              </section>
              {(todayStatus.temporaryClosure || todayStatus.state === 'Unknown' || visibleNotice) && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">{todayStatus.reason}</p>
                {visibleNotice && <p className="mt-1 whitespace-pre-wrap break-words">{visibleNotice.shortDescription}</p>}
              </div>}
              <section aria-label="Store leadership">
                <h3 className="mb-2 text-xs font-semibold text-neutral-500">Leadership</h3>
                <dl className="divide-y divide-neutral-100">
                  {[
                    { label: 'Store Manager', records: storeManager ? [storeManager] : [] },
                    { label: 'District Manager', records: districtManager ? [districtManager] : [] },
                    { label: 'Regional Manager', records: regionalManager ? [regionalManager] : [] },
                    { label: 'Assistant Managers', records: assistantManagers },
                    { label: 'Key Holders', records: keyHolders },
                  ].map(group => <div key={group.label} className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr] sm:gap-3">
                    <dt className="text-xs text-neutral-500">{group.label}</dt>
                    <dd className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      {group.records.length ? group.records.map(person => <span key={person.id} className="inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <button type="button" disabled={!onSelectPerson} onClick={() => handleOpenPerson(person.id)} className="break-words text-left font-medium text-neutral-900 hover:text-red-700 hover:underline disabled:no-underline">{person.fullName}</button>
                        {group.label === 'Store Manager' && managerPhone.source === 'work' && managerPhone.value && <span className="inline-flex flex-wrap items-center gap-2"><a href={`tel:${managerPhone.value.replace(/[^0-9+]/g, '')}`} className="text-xs text-red-700 hover:underline">{managerPhoneLabel}</a><PrivacyBadge level={managerPhonePrivacy} /></span>}
                      </span>) : <span className="text-neutral-500">Unassigned</span>}
                    </dd>
                  </div>)}
                </dl>
                <p className="mt-2 break-words text-xs text-neutral-500">{hierarchyDistrictLabel(hierarchy, location.type)}{hierarchy.regionName ? ` · ${hierarchy.regionName}` : ''}</p>
                {(staffingDiagnostics.length > 0 || hierarchy.hierarchyIssues.length > 0 || hierarchy.applicabilityIssues.length > 0) && <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><summary className="cursor-pointer font-semibold">Assignments need review</summary><ul className="mt-2 list-disc space-y-1 pl-4">{[...staffingDiagnostics, ...hierarchy.hierarchyIssues, ...hierarchy.applicabilityIssues].map((warning, index) => <li key={index} className="break-words">{warning}</li>)}</ul></details>}
              </section>
            </div>
          )}
          {activeTab === 'details' && <div className="space-y-5">
            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
              <dt className="text-neutral-500">Record ID</dt><dd className="break-all">{location.id}</dd>
              <dt className="text-neutral-500">Location type</dt><dd>{location.type}</dd>
              <dt className="text-neutral-500">Lifecycle</dt><dd>{location.operationalStatus}</dd>
              {location.locationInboxEmail && !normalizedLocationInbox && <><dt className="text-neutral-500">Saved inbox</dt><dd className="break-all">{location.locationInboxEmail}</dd></>}
            </dl>
            {(primaryEmployees.length > 0 || supportingEmployees.length > 0) && <section aria-label="Workplace and support"><h3 className="mb-2 text-sm font-semibold">Workplace & support</h3>{[{ label: 'Works here', records: primaryEmployees }, { label: 'Supports this location', records: supportingEmployees }].filter(group => group.records.length).map(group => <div key={group.label} className="mb-3"><p className="text-xs text-neutral-500">{group.label}</p><div className="mt-1 flex flex-wrap gap-2">{group.records.map(person => <button type="button" key={person.id} disabled={!onSelectPerson} onClick={() => handleOpenPerson(person.id)} className="rounded border border-neutral-200 px-2 py-1 text-sm hover:text-red-700">{person.fullName}</button>)}</div></div>)}</section>}
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

              <CustomMetadataFields definitions={customFieldDefinitions} values={location.customMetadata || {}} />


          </div>}

          {/* TAB 2: OPERATING HOURS & NOTICES */}
          {activeTab === 'hours' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Notice alert if active */}
              {visibleNotice ? (
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
                    <span className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
                      {hoursSourceLabel}
                    </span>
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
        <div className="flex items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50 p-3 sm:p-4">
          <button
            type="button"
            onClick={() => onRequestCorrection(location)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 font-semibold text-neutral-800 shadow-xs transition-colors hover:bg-neutral-100"
          >
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span className="sm:hidden">Request</span>
            <span className="hidden sm:inline">Request Correction</span>
          </button>

          <div className="flex min-w-0 items-center gap-2">
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
                onClick={() => onEdit(location)}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 font-semibold text-white shadow-xs transition-colors hover:bg-red-700 sm:px-4"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span className="sm:hidden">Edit</span>
                <span className="hidden sm:inline">Edit Store Record</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

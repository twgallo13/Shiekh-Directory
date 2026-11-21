import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, MapPin, Clock, Copy, ExternalLink, AlertTriangle, User, Pencil, Users, Navigation, X, RotateCcw } from 'lucide-react';
import { Breadcrumbs } from './Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import type { LocationDetail, AssignmentCapacity } from '../types';
import { getStoreTypeLabel } from '../types';
import { StatusBadge } from './StatusBadge';
import { formatHoursDisplay } from '../lib/operatingState';
import { canEditLocation } from '../lib/permissions';
import { EditLocationPanel } from './EditLocationPanel';
import { AuditHistory } from './AuditHistory';
import { AssignmentPanel } from './AssignmentPanel';
import { StoreVerificationPanel } from './StoreVerificationPanel';
import { CapacityBadge, VacantBadge } from './CapacityBadge';
import { ReportProblemDialog } from './ReportProblemDialog';
import { Dialog } from './Dialog';
import { CloseStoreDialog } from './CloseStoreDialog';
import { apiGet, apiPost } from '../lib/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { StorePageCard } from './StorePageCard';
import { canSeeStorePageCard } from '../lib/storePageAccess';

export function LocationDetailView() {
  const { id } = useParams<{ id: string }>();
  const [location, setLocation] = useState<LocationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'hours' | 'contact' | 'closure' | 'directions' | 'storeType' | null>(null);
  const [showAssignments, setShowAssignments] = useState(false);
  const [showReportProblem, setShowReportProblem] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [undoToast, setUndoToast] = useState<{ message: string; action: 'reopen' | 'renew'; closureId: string } | null>(null);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusClosedBanner = useRef(false);
  const focusPageHeading = useRef(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closedBy, setClosedBy] = useState<{ who: string; at: string } | null>(null);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [assignments, setAssignments] = useState<{
    id: string;
    personId: string;
    personName: string;
    role: 'SM' | 'ASM' | 'KH' | 'DM' | 'RM' | 'OTHER';
    slot: 'primary' | 'additional';
    label?: string;
    isActive: boolean;
  }[]>([]);
  
  const { authUser, getIdToken } = useAuth();
  const navigate = useNavigate();
  
  useDocumentTitle(location ? `Store #${location.storeNumber}` : 'Loading...');
  
  const editPermissions = authUser && location && location.lifecycle !== 'retired'
    ? canEditLocation(authUser, location.id)
    : { closure: false, hours: false, contactInfo: false, directions: false, assignments: false };
  
  const fetchLocation = useCallback(async (silent = false) => {
    if (!id) return;
    
    try {
      if (!silent) setLoading(true);
      setError(null);
      
      const response = await apiGet(`/api/app/locations/${id}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Location not found');
        } else {
          setError('Failed to load location');
        }
        return;
      }
      
      const { data } = await response.json();
      setLocation(data);
    } catch (err) {
      setError('Failed to load location');
    } finally {
      setLoading(false);
    }
  }, [id]);
  
  const fetchAssignments = useCallback(async () => {
    if (!id) return;
    try {
      const response = await apiGet(`/api/app/assignments/location/${id}`);
      if (response.ok) {
        const { data } = await response.json();
        setAssignments(data);
      }
    } catch {
      console.error('Failed to fetch assignments');
    }
  }, [id]);
  
  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);
  
  useEffect(() => {
    if (showAssignments) {
      fetchAssignments();
    }
  }, [showAssignments, fetchAssignments]);
  
  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
    } catch {
    }
  };
  
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!location || location.lifecycle !== 'retired') {
      setClosedBy(null);
      return;
    }
    const canLoadCloseAudit = authUser?.role === 'Leader' || authUser?.role === 'Steward' || authUser?.role === 'Admin';
    if (!canLoadCloseAudit) {
      setClosedBy(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        const response = await fetch(`/api/app/audit/location/${location.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          if (!cancelled) setClosedBy(null);
          return;
        }
        const body = await response.json();
        const entries = Array.isArray(body.data) ? body.data : [];
        const closes = entries.filter((entry: { timestamp?: string; userEmail?: string; changes?: { field?: string; newValue?: string }[] }) =>
          (entry.changes || []).some((change) => change.field === 'lifecycle' && change.newValue === 'retired')
        );
        closes.sort((a: { timestamp?: string }, b: { timestamp?: string }) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        const newest = closes[0];
        if (!cancelled) {
          setClosedBy(newest?.timestamp ? { who: (newest.userEmail || '').trim(), at: newest.timestamp } : null);
        }
      } catch {
        if (!cancelled) setClosedBy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // getIdToken is stable in AuthContext; the test mock builds a new function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, authUser?.role]);

  useEffect(() => {
    if (focusClosedBanner.current && location?.lifecycle === 'retired') {
      focusClosedBanner.current = false;
      document.getElementById('permanently-closed-banner')?.focus();
    }
    if (focusPageHeading.current && location && location.lifecycle !== 'retired') {
      focusPageHeading.current = false;
      headingRef.current?.focus();
    }
  }, [location]);
  
  const handleRestoreStore = async () => {
    if (!location) return;
    setRestoreLoading(true);
    setRestoreError(null);
    try {
      const response = await apiPost(`/api/app/hierarchy/locations/${location.id}/reactivate`);
      if (response.ok) {
        setShowRestoreDialog(false);
        setRestoreError(null);
        setSuccessToast('Store restored');
        setTimeout(() => setSuccessToast(null), 3000);
        focusPageHeading.current = true;
        fetchLocation();
      } else {
        const errorData = await response.json();
        const code = errorData.error?.code;
        if (code === 'district_retired') {
          setRestoreError("This store can't be restored because its district was removed. To bring it back, add it as a new store in an active district from Hierarchy.");
        } else if (code === 'region_retired') {
          setRestoreError("This store can't be restored because its region was removed. To bring it back, add it as a new store in an active region from Hierarchy.");
        } else if (code === 'duplicate_store_number') {
          setRestoreError(`Store #${location.storeNumber} is already used by an open store.`);
        } else {
          setRestoreError(errorData.error?.message || 'Failed to restore store. Try again.');
        }
      }
    } catch {
      setRestoreError('Failed to restore store. Try again.');
    } finally {
      setRestoreLoading(false);
    }
  };
  
  const isRetired = location?.lifecycle === 'retired';
  const canManageHierarchy = authUser && ['Steward', 'Admin'].includes(authUser.role);
  const isAdmin = authUser?.role === 'Admin';
  
  if (loading) {
    return (
      <div className="bg-gray-50 min-h-[calc(100vh-56px)]">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (error || !location) {
    return (
      <div className="bg-gray-50 min-h-[calc(100vh-56px)]">
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto" />
          <p className="mt-4 text-gray-600">{error || 'Location not found'}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 text-blue-600 hover:underline"
          >
            Back to Directory
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-gray-50 pb-8 min-h-[calc(100vh-56px)]">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          {/* Breadcrumbs - desktop only */}
          <div className="hidden lg:block mb-3">
            <Breadcrumbs
              items={[
                { label: 'Directory', href: '/' },
                { label: location.districtName || 'District', href: `/?district=${location.districtId || ''}` },
                { label: `#${location.storeNumber} ${location.name}` },
              ]}
            />
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)} 
              className="p-2 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center lg:hidden"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1 min-w-0 lg:flex-none">
              <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-gray-900 truncate outline-none">
                #{location.storeNumber} {location.name}
              </h1>
              <p className="text-sm text-gray-500 hidden lg:block">
                {location.districtName} • {location.regionName}
              </p>
            </div>
            <div className="hidden lg:block ml-auto">
              {isRetired ? (
                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
                  Permanently closed
                </span>
              ) : (
                <StatusBadge status={location.statusNow.state} large />
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 py-4 lg:py-6 space-y-4 lg:space-y-6">
        {isRetired && (
          <div
            id="permanently-closed-banner"
            tabIndex={-1}
            role="status"
            className="bg-gray-100 border border-gray-300 text-gray-800 rounded-lg px-4 py-3 outline-none"
          >
            Permanently closed on {new Date(closedBy?.at || location.updatedAt).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}{closedBy?.who ? ` by ${closedBy.who}` : ''}
          </div>
        )}
        {/* Store Verification for Store accounts */}
        {authUser?.role === 'Store' && (
          <StoreVerificationPanel
            location={location}
            onVerified={fetchLocation}
          />
        )}
        
        {/* Desktop: Grid layout for cards */}
        <div className="grid gap-4 lg:gap-6 lg:grid-cols-2">
          {/* Status & Basic Info */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6 lg:col-span-2 xl:col-span-1">
            <div className="flex items-start justify-between gap-3 mb-4 lg:hidden">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  #{location.storeNumber} {location.name}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {location.districtName} • {location.regionName}
                </p>
              </div>
              {isRetired ? (
                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
                  Permanently closed
                </span>
              ) : (
                <StatusBadge status={location.statusNow.state} large />
              )}
            </div>
          
          {/* Closure Alert */}
          {!isRetired && location.activeClosure && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-red-800">Temporarily Closed</p>
                  <p className="text-sm text-red-700">{location.activeClosure.reason}</p>
                  {location.activeClosure.endsAt && (
                    <p className="text-sm text-red-600 mt-1">
                      Expires: {new Date(location.activeClosure.endsAt).toLocaleString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZoneName: 'short',
                      })}
                    </p>
                  )}
                  {location.activeClosure.type === 'unknown_end' && location.activeClosure.nextReviewDate && (
                    <p className="text-sm text-red-600 mt-1">
                      Next review: {location.activeClosure.nextReviewDate}
                      {location.activeClosure.ownerName && ` · Owner: ${location.activeClosure.ownerName}`}
                    </p>
                  )}
                  {location.activeClosure.renewalCount && location.activeClosure.renewalCount > 0 && (
                    <p className="text-xs text-purple-600 mt-1">
                      Renewed {location.activeClosure.renewalCount} time{location.activeClosure.renewalCount > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>
              {editPermissions.closure && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-red-200">
                  {(!location.activeClosure.type || location.activeClosure.type === 'same_day') && (
                    <button
                      onClick={async () => {
                        const closureId = location.activeClosure!.id;
                        const resp = await apiPost(`/api/app/edit/locations/${location.id}/closures/${closureId}/renew`);
                        if (!resp.ok) {
                          const err = await resp.json().catch(() => ({}));
                          alert(err.error?.message || 'Failed to renew closure');
                          return;
                        }
                        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
                        setUndoToast({ message: 'Closure renewed', action: 'renew', closureId });
                        undoTimeoutRef.current = setTimeout(() => setUndoToast(null), 8000);
                        fetchLocation();
                      }}
                      className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700 min-h-[44px]"
                    >
                      Renew (extend to tomorrow)
                    </button>
                  )}
                  <button
                    onClick={() => setEditingField('closure')}
                    className="text-sm bg-orange-600 text-white px-3 py-1.5 rounded hover:bg-orange-700 min-h-[44px]"
                  >
                    Needs longer closure
                  </button>
                  <button
                    onClick={() => setConfirmReopen(true)}
                    className="text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 min-h-[44px]"
                  >
                    Reopen Store
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Active Notices */}
          {location.activeNotices && location.activeNotices.length > 0 && (
            <div className="space-y-2 mb-4">
              {location.activeNotices.map((notice) => (
                <div
                  key={notice.id}
                  className={`rounded-lg p-3 ${
                    notice.audience === 'public'
                      ? 'bg-blue-50 border border-blue-200'
                      : 'bg-yellow-50 border border-yellow-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                      notice.audience === 'public' ? 'text-blue-600' : 'text-yellow-600'
                    }`} />
                    <div className="flex-1">
                      <p className={`text-sm ${
                        notice.audience === 'public' ? 'text-blue-800' : 'text-yellow-800'
                      }`}>
                        {notice.text}
                      </p>
                      {notice.expectedResolution && (
                        <p className="text-xs text-gray-500 mt-1">
                          Expected resolution: {notice.expectedResolution}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      notice.audience === 'public'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {notice.audience === 'public' ? 'Public' : 'Internal'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Add Closure Button */}
          {editPermissions.closure && !location.activeClosure && (
            <button
              onClick={() => setEditingField('closure')}
              className="w-full text-sm text-gray-700 border border-dashed border-gray-400 rounded-lg py-3 mb-4 hover:bg-gray-100 hover:border-gray-500 min-h-[44px] font-medium"
            >
              + Add Temporary Closure
            </button>
          )}
          
          {!isRetired && (
            <p className="text-sm text-gray-600 mb-4">
              {location.statusNow.reason}
            </p>
          )}
          
          {/* Phone Number */}
          <div className="flex items-center gap-2 mb-3">
            <Phone className="w-4 h-4 text-gray-500" />
            <span className="text-lg font-medium text-gray-900">{location.phoneFormatted}</span>
          </div>
          
          {/* Contact Actions - hide Call Store for closed stores */}
          <div className={`grid gap-3 ${isRetired ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {!isRetired && (
              <a
                href={`tel:${location.mainPhone}`}
                className="flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 min-h-[44px]"
              >
                <Phone className="w-4 h-4" />
                Call Store
              </a>
            )}
            <button
              onClick={() => handleCopy(location.phoneFormatted, 'Phone')}
              className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-200 min-h-[44px]"
            >
              <Copy className="w-4 h-4" />
              Copy Phone
            </button>
          </div>
          
          {location.sharedInboxEmail && (
            <div className="mt-3">
              <a
                href={`mailto:${location.sharedInboxEmail}`}
                className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-200"
              >
                <Mail className="w-4 h-4" />
                Email {location.sharedInboxEmail}
              </a>
            </div>
          )}
        </div>
        
        {/* Address */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Location
            </h2>
            {editPermissions.contactInfo && (
              <button
                onClick={() => setEditingField('contact')}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg -m-2"
                aria-label="Edit contact info"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-gray-700">{location.addressFormatted}</p>
            {location.mallOrCenterName && (
              <p className="text-sm text-gray-500">{location.mallOrCenterName}</p>
            )}
            <a
              href={location.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 text-sm hover:underline min-h-[44px] py-2"
            >
              Open in Maps <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>

        {/* How to Find Us - Wayfinding Directions */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Navigation className="w-4 h-4" />
              How to Find Us
            </h3>
            {editPermissions.directions && (
              <button
                onClick={() => setEditingField('directions')}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg -m-2"
                aria-label="Edit directions"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>
          {location.wayfindingDirections ? (
            <p className="text-gray-700">{location.wayfindingDirections}</p>
          ) : (
            <p className="text-gray-600 italic">
              {editPermissions.directions ? 'No directions added yet. Click edit to add directions.' : 'No directions available.'}
            </p>
          )}
        </div>
        
        {/* Hours */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Store Hours
            </h3>
            {editPermissions.hours && (
              <button
                onClick={() => setEditingField('hours')}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg -m-2"
                aria-label="Edit hours"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>
          
          {/* Today's Hours */}
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">Today ({location.todaySchedule.dayName})</span>
              <span className={`font-medium ${location.statusNow.state === 'Open' ? 'text-green-700' : 'text-gray-700'}`}>
                {formatHoursDisplay(location.todaySchedule.hours)}
              </span>
            </div>
            {location.todaySchedule.label && (
              <p className="text-sm text-gray-500 mt-1">{location.todaySchedule.label}</p>
            )}
          </div>
          
          {/* Week Schedule */}
          <div className="space-y-2">
            {(location.weekSchedule ?? []).slice(1).map(day => (
              <div key={day.date} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                <div className="flex-1">
                  <span className="text-gray-700">{day.dayName}</span>
                  {day.label && (
                    <span className="ml-2 text-xs text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
                      {day.label}
                    </span>
                  )}
                </div>
                <span className={`text-sm ${day.hours.closed ? 'text-gray-500' : 'text-gray-700'}`}>
                  {formatHoursDisplay(day.hours)}
                </span>
              </div>
            ))}
          </div>
          
          {/* Upcoming Exceptions */}
          {(() => {
            const today = location.statusNow.localDate;
            const upcomingExceptions = (location.hoursExceptions ?? [])
              .filter(ex => ex.endDate >= today)
              .sort((a, b) => a.startDate.localeCompare(b.startDate))
              .slice(0, 3);
            
            return upcomingExceptions.length > 0 ? (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Upcoming Exceptions</h4>
                <div className="space-y-2">
                  {upcomingExceptions.map(ex => (
                    <div key={ex.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{ex.label}</span>
                      <span className="text-gray-500">
                        {ex.startDate === ex.endDate 
                          ? ex.startDate 
                          : `${ex.startDate} - ${ex.endDate}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}
        </div>
        
        {/* Leadership */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6 lg:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <User className="w-4 h-4" />
              Leadership
            </h3>
            {editPermissions.assignments && (
              <button
                onClick={() => setShowAssignments(true)}
                className="min-h-[44px] px-3 text-blue-600 hover:bg-blue-50 rounded-lg flex items-center gap-1 text-sm -m-2"
                aria-label="Manage assignments"
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Manage</span>
              </button>
            )}
          </div>
          
          <div className="space-y-3">
            {/* Store Manager */}
            <div className="py-2 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-gray-500">Store Manager</p>
                {location.leadership.smStatus === 'vacant' && <VacantBadge />}
              </div>
              {location.leadership.hasPrimarySm ? (
                <div>
                  {location.leadership.smCoverage?.filter(sm => sm.slot === 'primary').map(sm => (
                    <div key={sm.id} className="flex items-center gap-2">
                      <Link
                        to={`/person/${sm.id}`}
                        className="font-medium text-blue-600 hover:underline inline-flex items-center min-h-[44px]"
                      >
                        {sm.name}
                      </Link>
                      <CapacityBadge capacity={(sm.capacity || 'primary') as AssignmentCapacity} />
                    </div>
                  ))}
                </div>
              ) : location.leadership.smCoverage && location.leadership.smCoverage.length > 0 ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mt-1">
                  <p className="text-yellow-800 font-medium text-sm">Primary unassigned; coverage present</p>
                </div>
              ) : (
                <p className="font-medium text-gray-600 italic">Not assigned</p>
              )}
              
              {/* Additional/Temporary SM coverage */}
              {location.leadership.smCoverage && location.leadership.smCoverage.filter(sm => sm.slot !== 'primary').length > 0 && (
                <div className="mt-2 pl-3 border-l-2 border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">Additional Coverage</p>
                  {location.leadership.smCoverage.filter(sm => sm.slot !== 'primary').map(sm => (
                    <div key={sm.id} className="flex items-center gap-2 min-h-[44px]">
                      <Link
                        to={`/person/${sm.id}`}
                        className="text-sm text-blue-600 hover:underline min-h-[44px] inline-flex items-center"
                      >
                        {sm.name}
                      </Link>
                      <CapacityBadge capacity={(sm.capacity || 'primary') as AssignmentCapacity} />
                      {sm.label && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{sm.label}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* District Manager */}
            <div className="py-2 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-gray-500">District Manager</p>
                {location.leadership.dmStatus === 'vacant' && <VacantBadge />}
              </div>
              {location.leadership.dm ? (
                <div className="flex items-center gap-2">
                  <Link
                    to={`/person/${location.leadership.dm.id}`}
                    className="font-medium text-blue-600 hover:underline inline-flex items-center min-h-[44px]"
                  >
                    {location.leadership.dm.name}
                  </Link>
                  <CapacityBadge capacity={(location.leadership.dm.capacity || 'primary') as AssignmentCapacity} />
                </div>
              ) : (
                <p className="font-medium text-gray-600 italic">Not assigned</p>
              )}
              
              {/* DM Others (Training/Acting) */}
              {location.leadership.dmOthers && location.leadership.dmOthers.length > 0 && (
                <div className="mt-2 pl-3 border-l-2 border-gray-200">
                  {location.leadership.dmOthers.map(dm => (
                    <div key={dm.id} className="flex items-center gap-2 min-h-[44px]">
                      <Link
                        to={`/person/${dm.id}`}
                        className="text-sm text-blue-600 hover:underline min-h-[44px] inline-flex items-center"
                      >
                        {dm.name}
                      </Link>
                      <CapacityBadge capacity={dm.capacity} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Regional Manager */}
            <div className="py-2 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-gray-500">Regional Manager</p>
                {location.leadership.rmStatus === 'vacant' && <VacantBadge />}
              </div>
              {location.leadership.rm ? (
                <div className="flex items-center gap-2">
                  <Link
                    to={`/person/${location.leadership.rm.id}`}
                    className="font-medium text-blue-600 hover:underline inline-flex items-center min-h-[44px]"
                  >
                    {location.leadership.rm.name}
                  </Link>
                  <CapacityBadge capacity={(location.leadership.rm.capacity || 'primary') as AssignmentCapacity} />
                </div>
              ) : (
                <p className="font-medium text-gray-600 italic">Not assigned</p>
              )}
              
              {/* RM Others (Training/Acting) */}
              {location.leadership.rmOthers && location.leadership.rmOthers.length > 0 && (
                <div className="mt-2 pl-3 border-l-2 border-gray-200">
                  {location.leadership.rmOthers.map(rm => (
                    <div key={rm.id} className="flex items-center gap-2 min-h-[44px]">
                      <Link
                        to={`/person/${rm.id}`}
                        className="text-sm text-blue-600 hover:underline min-h-[44px] inline-flex items-center"
                      >
                        {rm.name}
                      </Link>
                      <CapacityBadge capacity={rm.capacity} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* ASMs */}
            <div className="py-2 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-gray-500">Assistant Store Managers</p>
                {location.leadership.asmStatus === 'vacant' && <VacantBadge />}
              </div>
              {(location.leadership.asm ?? []).length > 0 ? (
                (location.leadership.asm ?? []).map(asm => (
                  <div key={asm.id} className="flex items-center gap-2 min-h-[44px]">
                    <Link
                      to={`/person/${asm.id}`}
                      className="font-medium text-blue-600 hover:underline inline-flex items-center min-h-[44px]"
                    >
                      {asm.name}
                    </Link>
                    <CapacityBadge capacity={(asm.capacity || 'primary') as AssignmentCapacity} />
                    {asm.slot === 'additional' && (
                      <span className="text-xs text-gray-500">(Additional)</span>
                    )}
                  </div>
                ))
              ) : (
                <p className="font-medium text-gray-600 italic">None assigned</p>
              )}
            </div>
            
            {/* Key Holders */}
            <div className="py-2">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-gray-500">Key Holders</p>
                {location.leadership.khStatus === 'vacant' && <VacantBadge />}
              </div>
              {(location.leadership.kh ?? []).length > 0 ? (
                (location.leadership.kh ?? []).map(kh => (
                  <div key={kh.id} className="flex items-center gap-2">
                    <Link
                      to={`/person/${kh.id}`}
                      className="font-medium text-blue-600 hover:underline inline-flex items-center min-h-[44px]"
                    >
                      {kh.name}
                    </Link>
                    <CapacityBadge capacity={(kh.capacity || 'primary') as AssignmentCapacity} />
                  </div>
                ))
              ) : (
                <p className="font-medium text-gray-600 italic">None assigned</p>
              )}
            </div>
          </div>
        </div>
        
        {/* Store Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Store Information</h3>
            {!isRetired && authUser && (authUser.role === 'Admin' || authUser.role === 'Steward') && (
              <button
                onClick={() => setEditingField('storeType')}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg -m-2"
                aria-label="Edit store type"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Store Number</dt>
              <dd className="font-medium text-gray-900">{location.storeNumber}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Store Type</dt>
              <dd className="font-medium text-gray-900">
                {location.storeType ? getStoreTypeLabel(location.storeType) : <span className="text-gray-600 italic">Not set</span>}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Time Zone</dt>
              <dd className="font-medium text-gray-900">{location.timeZone}</dd>
            </div>
            {location.lastVerifiedAt && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Last Verified</dt>
                <dd className="font-medium text-gray-900">
                  {new Date(location.lastVerifiedAt).toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>
          
          {/* Close/Restore buttons */}
          {isRetired && isAdmin && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowRestoreDialog(true)}
                className="w-full py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors min-h-[44px]"
              >
                Restore store
              </button>
            </div>
          )}
          {!isRetired && canManageHierarchy && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowCloseDialog(true)}
                className="w-full py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors min-h-[44px]"
              >
                Close store permanently…
              </button>
            </div>
          )}
        </div>

        {location && authUser && canSeeStorePageCard(authUser, location.id) && (
          <StorePageCard
            locationId={location.id}
            storeNumber={location.storeNumber}
            lifecycle={location.lifecycle}
            authUser={authUser}
          />
        )}
        
        {/* Report a Problem - hidden for closed stores. A store login on another store gets a plain message. */}
        {authUser && !isRetired && authUser.role === 'Store' && authUser.storeLocationId !== location.id && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
            <p className="text-sm text-gray-700">You can only report a problem for your own store.</p>
          </div>
        )}
        {authUser && !isRetired && !(authUser.role === 'Store' && authUser.storeLocationId !== location.id) && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">See something wrong?</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Report incorrect information for this location
                </p>
              </div>
              <button
                onClick={() => setShowReportProblem(true)}
                className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors min-h-[44px]"
              >
                Report a Problem
              </button>
            </div>
          </div>
        )}
        </div>
        
        {/* Audit History - visible to Leader/Steward/Admin - full width */}
        <AuditHistory
          locationId={location.id}
          locationName={`${location.storeNumber} ${location.name}`}
        />
      </div>
      
      {/* Edit Panel */}
      {editingField && location && (
        <EditLocationPanel
          location={location}
          field={editingField}
          onSave={() => {
            const savedField = editingField;
            setEditingField(null);
            fetchLocation();
            if (savedField === 'directions') {
              setSuccessToast('Directions saved');
              setTimeout(() => setSuccessToast(null), 3000);
            }
          }}
          onCancel={() => setEditingField(null)}
        />
      )}
      
      {/* Assignment Panel */}
      {showAssignments && location && (
        <AssignmentPanel
          locationId={location.id}
          locationName={`#${location.storeNumber} ${location.name}`}
          existingAssignments={assignments}
          onSave={() => {
            setShowAssignments(false);
            fetchLocation();
            fetchAssignments();
          }}
          onCancel={() => setShowAssignments(false)}
        />
      )}
      
      {/* Report Problem Dialog */}
      {showReportProblem && location && (
        <ReportProblemDialog
          location={location}
          onClose={() => setShowReportProblem(false)}
          onSuccess={() => {
            alert('Your request has been submitted and will be reviewed.');
          }}
        />
      )}
      
      {/* Copy Toast */}
      {copiedText && (
        <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50">
          {copiedText} copied
        </div>
      )}
      
      {/* Success Toast */}
      {successToast && (
        <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm flex items-center gap-2 z-50">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {successToast}
        </div>
      )}
      
      {/* Reopen Confirmation Dialog */}
      <Dialog
        isOpen={confirmReopen}
        onClose={() => setConfirmReopen(false)}
        title="Confirm Reopen Store"
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmReopen(false)}
              className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!location?.activeClosure) return;
                const closureId = location.activeClosure.id;
                setConfirmReopen(false);
                await apiPost(`/api/app/edit/locations/${location.id}/closures/${closureId}/end`);
                if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
                setUndoToast({ message: 'Store reopened', action: 'reopen', closureId });
                undoTimeoutRef.current = setTimeout(() => setUndoToast(null), 8000);
                fetchLocation();
              }}
              className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 min-h-[44px]"
            >
              Yes, Reopen Store
            </button>
          </div>
        }
        size="sm"
      >
        <p className="text-gray-600">
          Are you sure you want to end the closure and reopen the store? This will immediately mark the store as open.
        </p>
      </Dialog>
      
      <CloseStoreDialog
        isOpen={showCloseDialog}
        onClose={() => setShowCloseDialog(false)}
        locationId={location.id}
        storeNumber={location.storeNumber}
        storeName={location.name}
        isAdmin={!!isAdmin}
        onAlreadyRetired={() => {
          void fetchLocation(true);
        }}
        onClosed={() => {
          setShowCloseDialog(false);
          setSuccessToast(`Store #${location.storeNumber} is now permanently closed`);
          setTimeout(() => setSuccessToast(null), 3000);
          focusClosedBanner.current = true;
          fetchLocation();
        }}
      />
      
      {/* Restore Store Dialog */}
      <Dialog
        isOpen={showRestoreDialog}
        onClose={() => {
          setShowRestoreDialog(false);
          setRestoreError(null);
        }}
        title="Restore store"
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowRestoreDialog(false);
                setRestoreError(null);
              }}
              className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleRestoreStore}
              disabled={restoreLoading}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
            >
              {restoreLoading ? 'Restoring...' : 'Restore store'}
            </button>
          </div>
        }
        size="sm"
      >
        <div className="space-y-3">
          {restoreError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3" role="alert">
              <p className="text-sm text-red-700">{restoreError}</p>
            </div>
          )}
          <p className="text-gray-600">
            This will restore <strong>Store #{location?.storeNumber}</strong> to active status.
          </p>
          <p className="text-sm text-gray-500">
            People won't be put back; assign them again from the store page.
          </p>
        </div>
      </Dialog>
      
      {/* Undo Toast */}
      {undoToast && (
        <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-4 z-50">
          <span className="text-sm">{undoToast.message}</span>
          <button
            onClick={async () => {
              if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
              setUndoToast(null);
              if (location) {
                if (undoToast.action === 'reopen') {
                  await apiPost(`/api/app/edit/locations/${location.id}/closures`, {
                    type: 'same_day',
                    reason: 'Closure restored after undo',
                  });
                } else if (undoToast.action === 'renew') {
                  await apiPost(`/api/app/edit/locations/${location.id}/closures/${undoToast.closureId}/undo-renew`, {});
                }
                fetchLocation();
              }
            }}
            className="flex items-center gap-1 px-3 py-1 bg-white/20 rounded text-sm hover:bg-white/30 min-h-[36px]"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Undo
          </button>
          <button
            onClick={() => {
              if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
              setUndoToast(null);
            }}
            aria-label="Dismiss"
            className="p-1 hover:bg-white/20 rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

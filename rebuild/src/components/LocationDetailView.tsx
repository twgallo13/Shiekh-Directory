import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, MapPin, Clock, Copy, ExternalLink, AlertTriangle, User, Pencil, Users, Navigation } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { LocationDetail, AssignmentCapacity } from '../types';
import { StatusBadge } from './StatusBadge';
import { formatHoursDisplay } from '../lib/operatingState';
import { canEditLocation } from '../lib/permissions';
import { EditLocationPanel } from './EditLocationPanel';
import { AuditHistory } from './AuditHistory';
import { AssignmentPanel } from './AssignmentPanel';
import { StoreVerificationPanel } from './StoreVerificationPanel';
import { CapacityBadge, VacantBadge } from './CapacityBadge';
import { ReportProblemDialog } from './ReportProblemDialog';

export function LocationDetailView() {
  const { id } = useParams<{ id: string }>();
  const [location, setLocation] = useState<LocationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'hours' | 'contact' | 'closure' | 'directions' | null>(null);
  const [showAssignments, setShowAssignments] = useState(false);
  const [showReportProblem, setShowReportProblem] = useState(false);
  const [assignments, setAssignments] = useState<{
    id: string;
    personId: string;
    personName: string;
    role: 'SM' | 'ASM' | 'KH' | 'DM' | 'RM' | 'OTHER';
    slot: 'primary' | 'additional';
    label?: string;
    isActive: boolean;
  }[]>([]);
  
  const { getIdToken, authUser } = useAuth();
  const navigate = useNavigate();
  
  const editPermissions = authUser && location
    ? canEditLocation(authUser, location.id)
    : { closure: false, hours: false, contactInfo: false, directions: false, assignments: false };
  
  const fetchLocation = useCallback(async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      setError(null);
      const token = await getIdToken();
      
      const response = await fetch(`/api/app/locations/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
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
  }, [id, getIdToken]);
  
  const fetchAssignments = useCallback(async () => {
    if (!id) return;
    try {
      const token = await getIdToken();
      const response = await fetch(`/api/app/assignments/location/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const { data } = await response.json();
        setAssignments(data);
      }
    } catch {
      console.error('Failed to fetch assignments');
    }
  }, [id, getIdToken]);
  
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
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-blue-700 text-white sticky top-0 z-20">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1 hover:bg-blue-600 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">Loading...</h1>
          </div>
        </header>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }
  
  if (error || !location) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-blue-700 text-white sticky top-0 z-20">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1 hover:bg-blue-600 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">Error</h1>
          </div>
        </header>
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
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <header className="bg-blue-700 text-white sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-blue-600 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">
              #{location.storeNumber} {location.name}
            </h1>
          </div>
        </div>
      </header>
      
      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* Store Verification for Store accounts */}
        {authUser?.role === 'Store' && (
          <StoreVerificationPanel
            location={location}
            onVerified={fetchLocation}
          />
        )}
        
        {/* Status & Basic Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                #{location.storeNumber} {location.name}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {location.districtName} • {location.regionName}
              </p>
            </div>
            <StatusBadge status={location.statusNow.state} large />
          </div>
          
          {/* Closure Alert */}
          {location.activeClosure && (
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
                        const token = await getIdToken();
                        const resp = await fetch(`/api/app/edit/locations/${location.id}/closures/${location.activeClosure!.id}/renew`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}` },
                        });
                        if (!resp.ok) {
                          const err = await resp.json().catch(() => ({}));
                          alert(err.error?.message || 'Failed to renew closure');
                        }
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
                    onClick={async () => {
                      const token = await getIdToken();
                      await fetch(`/api/app/edit/locations/${location.id}/closures/${location.activeClosure!.id}/end`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      fetchLocation();
                    }}
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
              className="w-full text-sm text-gray-600 border border-dashed border-gray-300 rounded-lg py-2 mb-4 hover:bg-gray-50 hover:border-gray-400"
            >
              + Add Temporary Closure
            </button>
          )}
          
          <p className="text-sm text-gray-600 mb-4">
            {location.statusNow.reason}
          </p>
          
          {/* Phone Number */}
          <div className="flex items-center gap-2 mb-3">
            <Phone className="w-4 h-4 text-gray-500" />
            <span className="text-lg font-medium text-gray-900">{location.phoneFormatted}</span>
          </div>
          
          {/* Contact Actions */}
          <div className="grid grid-cols-2 gap-3">
            <a
              href={`tel:${location.mainPhone}`}
              className="flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700"
            >
              <Phone className="w-4 h-4" />
              Call Store
            </a>
            <button
              onClick={() => handleCopy(location.phoneFormatted, 'Phone')}
              className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-200"
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
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Location
            </h3>
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
              className="inline-flex items-center gap-1 text-blue-600 text-sm hover:underline"
            >
              Open in Maps <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* How to Find Us - Wayfinding Directions */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
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
            <p className="text-gray-400 italic">
              {editPermissions.directions ? 'No directions added yet. Click edit to add directions.' : 'No directions available.'}
            </p>
          )}
        </div>
        
        {/* Hours */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
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
            {location.weekSchedule.slice(1).map(day => (
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
            const upcomingExceptions = location.hoursExceptions
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
        <div className="bg-white rounded-lg border border-gray-200 p-4">
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
                <p className="font-medium text-gray-400 italic">Not assigned</p>
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
                <p className="font-medium text-gray-400 italic">Not assigned</p>
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
                <p className="font-medium text-gray-400 italic">Not assigned</p>
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
              {location.leadership.asm.length > 0 ? (
                location.leadership.asm.map(asm => (
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
                <p className="font-medium text-gray-400 italic">None assigned</p>
              )}
            </div>
            
            {/* Key Holders */}
            <div className="py-2">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-gray-500">Key Holders</p>
                {location.leadership.khStatus === 'vacant' && <VacantBadge />}
              </div>
              {location.leadership.kh.length > 0 ? (
                location.leadership.kh.map(kh => (
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
                <p className="font-medium text-gray-400 italic">None assigned</p>
              )}
            </div>
          </div>
        </div>
        
        {/* Store Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Store Information</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Store Number</dt>
              <dd className="font-medium text-gray-900">{location.storeNumber}</dd>
            </div>
            {location.storeType && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Store Type</dt>
                <dd className="font-medium text-gray-900">{location.storeType}</dd>
              </div>
            )}
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
        </div>
        
        {/* Report a Problem - available to all signed-in users */}
        {authUser && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
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
        
        {/* Audit History - visible to Leader/Steward/Admin */}
        <AuditHistory
          locationId={location.id}
          locationName={`${location.storeNumber} ${location.name}`}
        />
      </main>
      
      {/* Edit Panel */}
      {editingField && location && (
        <EditLocationPanel
          location={location}
          field={editingField}
          onSave={() => {
            setEditingField(null);
            fetchLocation();
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
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {copiedText} copied
        </div>
      )}
    </div>
  );
}

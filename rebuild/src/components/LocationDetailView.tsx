import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, MapPin, Clock, Copy, ExternalLink, AlertTriangle, User, Pencil, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { LocationDetail } from '../types';
import { StatusBadge } from './StatusBadge';
import { formatHoursDisplay } from '../lib/operatingState';
import { canEditLocation } from '../lib/permissions';
import { EditLocationPanel } from './EditLocationPanel';
import { AuditHistory } from './AuditHistory';

export function LocationDetailView() {
  const { id } = useParams<{ id: string }>();
  const [location, setLocation] = useState<LocationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'hours' | 'contact' | 'closure' | null>(null);
  
  const { getIdToken, authUser } = useAuth();
  const navigate = useNavigate();
  
  const editPermissions = authUser && location
    ? canEditLocation(authUser, location.id)
    : { closure: false, hours: false, contactInfo: false, assignments: false };
  
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
  
  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);
  
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
                      Expected to reopen: {new Date(location.activeClosure.endsAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {editPermissions.closure && (
                  <button
                    onClick={async () => {
                      const token = await getIdToken();
                      await fetch(`/api/app/edit/locations/${location.id}/closures/${location.activeClosure!.id}/end`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      fetchLocation();
                    }}
                    className="text-xs text-red-700 hover:bg-red-100 px-2 py-1 rounded"
                  >
                    <X className="w-3 h-3 inline mr-1" />
                    End
                  </button>
                )}
              </div>
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
                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
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
            {location.wayfindingDirections && (
              <p className="text-sm text-gray-500 italic">{location.wayfindingDirections}</p>
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
                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
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
          {location.hoursExceptions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Upcoming Exceptions</h4>
              <div className="space-y-2">
                {location.hoursExceptions.slice(0, 3).map(ex => (
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
          )}
        </div>
        
        {/* Leadership */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />
            Leadership
          </h3>
          
          <div className="space-y-3">
            {/* Store Manager */}
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div>
                <p className="text-sm text-gray-500">Store Manager</p>
                <p className="font-medium text-gray-900">
                  {location.leadership.sm?.name || 'Not assigned'}
                </p>
              </div>
              {location.leadership.sm?.slot === 'additional' && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">Additional</span>
              )}
            </div>
            
            {/* District Manager */}
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div>
                <p className="text-sm text-gray-500">District Manager</p>
                <p className="font-medium text-gray-900">
                  {location.leadership.dm?.name || 'Not assigned'}
                </p>
              </div>
            </div>
            
            {/* Regional Manager */}
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div>
                <p className="text-sm text-gray-500">Regional Manager</p>
                <p className="font-medium text-gray-900">
                  {location.leadership.rm?.name || 'Not assigned'}
                </p>
              </div>
            </div>
            
            {/* ASMs */}
            {location.leadership.asm.length > 0 && (
              <div className="py-2 border-b border-gray-100">
                <p className="text-sm text-gray-500 mb-1">Assistant Store Managers</p>
                {location.leadership.asm.map(asm => (
                  <p key={asm.id} className="font-medium text-gray-900">
                    {asm.name}
                    {asm.slot === 'additional' && (
                      <span className="ml-2 text-xs text-gray-500">(Additional)</span>
                    )}
                  </p>
                ))}
              </div>
            )}
            
            {/* Key Holders */}
            {location.leadership.kh.length > 0 && (
              <div className="py-2">
                <p className="text-sm text-gray-500 mb-1">Key Holders</p>
                {location.leadership.kh.map(kh => (
                  <p key={kh.id} className="font-medium text-gray-900">
                    {kh.name}
                  </p>
                ))}
              </div>
            )}
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
          </dl>
        </div>
        
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
      
      {/* Copy Toast */}
      {copiedText && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {copiedText} copied
        </div>
      )}
    </div>
  );
}

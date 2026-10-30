import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, User, Mail, Phone, Briefcase, MapPin, Building, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { PersonDetail, PersonAssignment } from '../types';
import { canViewMobilePhones } from '../lib/permissions';

const ROLE_LABELS: Record<string, string> = {
  SM: 'Store Manager',
  ASM: 'Assistant Store Manager',
  KH: 'Key Holder',
  DM: 'District Manager',
  RM: 'Regional Manager',
  OTHER: 'Other',
};

const SCOPE_ICONS: Record<string, typeof MapPin> = {
  location: MapPin,
  district: Building,
  region: Building,
};

function AssignmentCard({ assignment }: { assignment: PersonAssignment }) {
  const ScopeIcon = SCOPE_ICONS[assignment.scopeType] || Briefcase;
  
  return (
    <div className={`p-3 rounded-lg border ${assignment.isActive ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900">
              {ROLE_LABELS[assignment.role] || assignment.role}
            </span>
            {assignment.slot === 'primary' ? (
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Primary</span>
            ) : (
              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                {assignment.label || 'Additional'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-1 text-sm text-gray-600">
            <ScopeIcon className="w-3.5 h-3.5" />
            {assignment.scopeType === 'location' ? (
              <Link 
                to={`/location/${assignment.scopeId}`}
                className="text-blue-600 hover:underline"
              >
                {assignment.scopeName}
              </Link>
            ) : (
              <span>{assignment.scopeName}</span>
            )}
          </div>
        </div>
        {!assignment.isActive && (
          <span className="text-xs text-gray-500">Ended</span>
        )}
      </div>
      <div className="mt-2 text-xs text-gray-500">
        {assignment.startDate}
        {assignment.endDate && ` – ${assignment.endDate}`}
      </div>
    </div>
  );
}

export function PersonDetailView() {
  const { id } = useParams<{ id: string }>();
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { getIdToken, authUser } = useAuth();
  const navigate = useNavigate();
  const canViewMobile = authUser ? canViewMobilePhones(authUser) : false;
  
  const fetchPerson = useCallback(async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      setError(null);
      const token = await getIdToken();
      
      const response = await fetch(`/api/app/people/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Person not found');
        } else {
          setError('Failed to load person');
        }
        return;
      }
      
      const { data } = await response.json();
      setPerson(data);
    } catch {
      setError('Failed to load person');
    } finally {
      setLoading(false);
    }
  }, [id, getIdToken]);
  
  useEffect(() => {
    fetchPerson();
  }, [fetchPerson]);
  
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
  
  if (error || !person) {
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
          <p className="mt-4 text-gray-600">{error || 'Person not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 text-blue-600 hover:underline"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }
  
  const activeAssignments = person.assignments.filter(a => a.isActive);
  const pastAssignments = person.assignments.filter(a => !a.isActive);
  
  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-blue-700 text-white sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-blue-600 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">{person.fullName}</h1>
          </div>
        </div>
      </header>
      
      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* Basic Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900">{person.fullName}</h2>
              <p className={`text-sm ${person.lifecycle === 'active' ? 'text-green-600' : 'text-gray-500'}`}>
                {person.lifecycle === 'active' ? 'Active' : 'Inactive'}
              </p>
            </div>
          </div>
        </div>
        
        {/* Contact Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Contact Information</h3>
          <div className="space-y-3">
            {person.workEmail && (
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-gray-400" />
                <a href={`mailto:${person.workEmail}`} className="text-blue-600 hover:underline">
                  {person.workEmail}
                </a>
              </div>
            )}
            {person.workPhone && (
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-gray-400" />
                <a href={`tel:${person.workPhone}`} className="text-blue-600 hover:underline">
                  {person.workPhone}
                </a>
                <span className="text-xs text-gray-500">Work</span>
              </div>
            )}
            {canViewMobile && person.mobilePhone && (
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-gray-400" />
                <a href={`tel:${person.mobilePhone}`} className="text-blue-600 hover:underline">
                  {person.mobilePhone}
                </a>
                <span className="text-xs text-gray-500">Mobile</span>
              </div>
            )}
            {!person.workEmail && !person.workPhone && (!canViewMobile || !person.mobilePhone) && (
              <p className="text-gray-500 text-sm">No contact information available</p>
            )}
          </div>
        </div>
        
        {/* Current Responsibilities */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            Current Responsibilities
          </h3>
          {activeAssignments.length > 0 ? (
            <div className="space-y-2">
              {activeAssignments.map(assignment => (
                <AssignmentCard key={assignment.id} assignment={assignment} />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No current assignments</p>
          )}
        </div>
        
        {/* Past Assignments */}
        {pastAssignments.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Past Assignments</h3>
            <div className="space-y-2">
              {pastAssignments.map(assignment => (
                <AssignmentCard key={assignment.id} assignment={assignment} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

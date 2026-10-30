import { useState, useEffect } from 'react';
import { X, Save, UserPlus, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { AssignmentRole, AssignmentSlot, PersonListItem } from '../types';

interface AssignmentPanelProps {
  locationId: string;
  locationName: string;
  existingAssignments: {
    id: string;
    personId: string;
    personName: string;
    role: AssignmentRole;
    slot: AssignmentSlot;
    label?: string;
    isActive: boolean;
  }[];
  onSave: () => void;
  onCancel: () => void;
}

const ROLE_LABELS: Record<AssignmentRole, string> = {
  SM: 'Store Manager',
  ASM: 'Assistant Store Manager',
  KH: 'Key Holder',
  DM: 'District Manager',
  RM: 'Regional Manager',
  OTHER: 'Other',
};

const STORE_ROLES: AssignmentRole[] = ['SM', 'ASM', 'KH'];

export function AssignmentPanel({ locationId, locationName, existingAssignments, onSave, onCancel }: AssignmentPanelProps) {
  const { getIdToken } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const [mode, setMode] = useState<'list' | 'add' | 'end'>('list');
  const [selectedRole, setSelectedRole] = useState<AssignmentRole>('SM');
  const [selectedSlot, setSelectedSlot] = useState<AssignmentSlot>('primary');
  const [label, setLabel] = useState('');
  
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<PersonListItem | null>(null);
  
  const [endingAssignment, setEndingAssignment] = useState<string | null>(null);
  
  useEffect(() => {
    if (mode === 'add') {
      fetchPeople();
    }
  }, [mode]);
  
  const fetchPeople = async () => {
    try {
      setPeopleLoading(true);
      const token = await getIdToken();
      const response = await fetch('/api/app/people?lifecycle=active', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const { data } = await response.json();
        setPeople(data);
      }
    } catch {
      setError('Failed to load people');
    } finally {
      setPeopleLoading(false);
    }
  };
  
  const handleAddAssignment = async () => {
    if (!selectedPerson) {
      setError('Please select a person');
      return;
    }
    
    setError(null);
    setSaving(true);
    
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          personId: selectedPerson.id,
          role: selectedRole,
          scopeType: 'location',
          scopeId: locationId,
          slot: selectedSlot,
          label: selectedSlot === 'additional' ? label || undefined : undefined,
        }),
      });
      
      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.message || 'Failed to create assignment');
        return;
      }
      
      setSuccessMessage(`${selectedPerson.fullName} assigned as ${ROLE_LABELS[selectedRole]}`);
      setTimeout(() => {
        onSave();
      }, 1500);
    } catch {
      setError('Failed to create assignment');
    } finally {
      setSaving(false);
    }
  };
  
  const handleEndAssignment = async (assignmentId: string) => {
    setError(null);
    setEndingAssignment(assignmentId);
    
    try {
      const token = await getIdToken();
      const response = await fetch(`/api/app/assignments/${assignmentId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.message || 'Failed to end assignment');
        return;
      }
      
      setSuccessMessage('Assignment ended');
      setTimeout(() => {
        onSave();
      }, 1500);
    } catch {
      setError('Failed to end assignment');
    } finally {
      setEndingAssignment(null);
    }
  };
  
  const filteredPeople = people.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.fullName.toLowerCase().includes(q) || p.workEmail?.toLowerCase().includes(q);
  });
  
  const activeAssignments = existingAssignments.filter(a => a.isActive);
  
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {mode === 'list' ? 'Manage Assignments' : mode === 'add' ? 'Add Assignment' : 'End Assignment'}
          </h2>
          <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          
          {successMessage && (
            <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm">
              {successMessage}
            </div>
          )}
          
          {mode === 'list' && (
            <>
              <div className="text-sm text-gray-600 mb-2">
                Assignments for {locationName}
              </div>
              
              {activeAssignments.length === 0 ? (
                <p className="text-gray-500 text-sm py-4 text-center">No current assignments</p>
              ) : (
                <div className="space-y-2">
                  {activeAssignments.map(assignment => (
                    <div key={assignment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{assignment.personName}</p>
                        <p className="text-sm text-gray-600">
                          {ROLE_LABELS[assignment.role]}
                          {assignment.slot === 'additional' && (
                            <span className="ml-1 text-gray-500">
                              ({assignment.label || 'Additional'})
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => handleEndAssignment(assignment.id)}
                        disabled={endingAssignment === assignment.id}
                        className="text-sm text-red-600 hover:bg-red-50 px-3 py-1 rounded"
                      >
                        {endingAssignment === assignment.id ? 'Ending...' : 'End'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <button
                onClick={() => setMode('add')}
                className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Add Assignment
              </button>
            </>
          )}
          
          {mode === 'add' && (
            <>
              <button
                onClick={() => setMode('list')}
                className="text-sm text-blue-600 hover:underline"
              >
                ← Back to list
              </button>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as AssignmentRole)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {STORE_ROLES.map(role => (
                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slot</label>
                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value as AssignmentSlot)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="primary">Primary</option>
                  <option value="additional">Additional / Temporary</option>
                </select>
              </div>
              
              {selectedSlot === 'additional' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Label (optional)</label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g., Temporary, Training"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Person</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                
                {peopleLoading ? (
                  <div className="py-4 text-center text-gray-500">Loading...</div>
                ) : (
                  <div className="mt-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                    {filteredPeople.length === 0 ? (
                      <p className="p-3 text-sm text-gray-500">No people found</p>
                    ) : (
                      filteredPeople.map(person => (
                        <button
                          key={person.id}
                          onClick={() => setSelectedPerson(person)}
                          className={`w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0 ${
                            selectedPerson?.id === person.id ? 'bg-blue-50' : ''
                          }`}
                        >
                          <p className="font-medium text-gray-900">{person.fullName}</p>
                          {person.workEmail && (
                            <p className="text-xs text-gray-500">{person.workEmail}</p>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
                
                {selectedPerson && (
                  <div className="mt-2 p-2 bg-blue-50 rounded-lg text-sm">
                    Selected: <strong>{selectedPerson.fullName}</strong>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        
        {mode === 'add' && (
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3">
            <button
              onClick={() => setMode('list')}
              className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleAddAssignment}
              disabled={saving || !selectedPerson}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Add Assignment'}
            </button>
          </div>
        )}
        
        {mode === 'list' && (
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3">
            <button
              onClick={onCancel}
              className="w-full py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

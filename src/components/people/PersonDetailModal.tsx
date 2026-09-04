import React, { useState, useEffect } from 'react';
import { 
  X, 
  User, 
  Phone, 
  Mail, 
  Building, 
  MapPin, 
  Shield, 
  Edit3, 
  CheckCircle2, 
  Copy, 
  Check,
  Briefcase,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import { PersonRecord, LocationRecord, ContactPrivacyLevel } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { PrivacyBadge } from '../common/StatusBadge';

interface PersonDetailModalProps {
  person: PersonRecord | null;
  onClose: () => void;
  onSelectLocationById: (locId: string) => void;
}

export const PersonDetailModal: React.FC<PersonDetailModalProps> = ({
  person,
  onClose,
  onSelectLocationById,
}) => {
  const { locations, currentUser, togglePersonPhonePrivacy } = useDirectory();
  const [copied, setCopied] = useState(false);

  // Escape key accessibility sweep
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!person) return null;

  const isViewer = currentUser.role === 'Viewer';
  const canDirectEdit = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';

  const isQuarantined = person.phoneVisibility === 'Pending Review' || person.isPhoneVerified === false;
  const isManagementOnly = person.phoneVisibility === 'Internal Management Only';
  const shouldMaskPhone = (isQuarantined || isManagementOnly) && isViewer;

  // Find stores overseen by this person if DM or Manager
  const storesOverseen = locations.filter(l => 
    l.districtManagerId === person.id || 
    (l.districtManagerName && l.districtManagerName.includes(person.name)) ||
    l.storeManagerId === person.id ||
    l.storeManagerName === person.name
  );

  const handleCopy = () => {
    const phoneStr = shouldMaskPhone ? '(•••) •••-•••• (Pending Review)' : person.workPhone;
    const text = `${person.name} - ${person.jobTitle}\nDepartment: ${person.department}\nPhone: ${phoneStr}\nEmail: ${person.workEmail}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div 
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 bg-neutral-900 text-white flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              {person.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white">{person.name}</h3>
                {person.isTemporary && (
                  <span className="text-[10px] px-1.5 py-0.2 bg-amber-500 text-white rounded font-bold">
                    Temp Assignment
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-300 font-medium">{person.jobTitle}</p>
              <p className="text-[11px] text-neutral-400">{person.department}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            aria-label="Close personnel details"
            className="p-1.5 text-neutral-400 hover:text-white rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {/* Work Contact Card with Privacy Controls */}
          <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700/60 space-y-2.5">
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center justify-between">
              <span>Work Directory Contact</span>
              <button onClick={handleCopy} className="flex items-center gap-1 text-red-600 dark:text-red-400 lowercase font-medium">
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                    <Phone className="w-3.5 h-3.5" />
                    <span className="text-[10px] uppercase font-bold">Work Phone</span>
                  </div>
                  <PrivacyBadge 
                    visibility={person.phoneVisibility || (person.isPhoneVerified === false ? 'Pending Review' : 'Directory Public')} 
                    isVerified={person.isPhoneVerified ?? true}
                    size="sm"
                  />
                </div>

                {shouldMaskPhone ? (
                  <div className="font-mono text-neutral-400 font-semibold tracking-wider pt-0.5">
                    (•••) •••-••••
                  </div>
                ) : (
                  <a href={`tel:${person.workPhone}`} className="font-bold text-neutral-900 dark:text-neutral-100 hover:text-red-600 block pt-0.5">
                    {person.workPhone}
                  </a>
                )}

                {shouldMaskPhone && (
                  <div className="text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-1">
                    <Lock className="w-3 h-3 shrink-0" />
                    <span>Quarantined contact pending steward review.</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                    <Mail className="w-3.5 h-3.5" />
                    <span className="text-[10px] uppercase font-bold">Work Email</span>
                  </div>
                  <PrivacyBadge 
                    visibility={person.emailVisibility || 'Directory Public'} 
                    isVerified={true}
                    size="sm"
                  />
                </div>

                <a href={`mailto:${person.workEmail}`} className="font-medium text-neutral-900 dark:text-neutral-100 hover:text-red-600 truncate block pt-0.5 max-w-[200px]">
                  {person.workEmail}
                </a>
              </div>
            </div>

            {/* Data Steward Privacy Controls */}
            {canDirectEdit && (
              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700/60 flex items-center justify-between gap-2 flex-wrap text-xs">
                <span className="text-neutral-500 text-[11px]">Contact Privacy Governance:</span>
                <select
                  value={person.phoneVisibility || 'Directory Public'}
                  onChange={(e) => togglePersonPhonePrivacy(person.id, e.target.value as ContactPrivacyLevel)}
                  className="text-[11px] bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded px-2 py-0.5 text-neutral-800 dark:text-neutral-200 font-medium"
                >
                  <option value="Directory Public">Directory Public</option>
                  <option value="Internal Management Only">Management Only</option>
                  <option value="Pending Review">Pending Review</option>
                </select>
              </div>
            )}
          </div>

          {/* Organizational Scope */}
          <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700/60 space-y-2">
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
              Organizational Scope
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-neutral-400">Department:</span>
                <div className="font-semibold text-neutral-800 dark:text-neutral-200">{person.department}</div>
              </div>
              <div>
                <span className="text-neutral-400">District / Region:</span>
                <div className="font-semibold text-neutral-800 dark:text-neutral-200">{person.district || 'Company-wide'}</div>
              </div>
              {person.assignedLocationName && (
                <div className="col-span-2">
                  <span className="text-neutral-400">Primary Assigned Base:</span>
                  <div className="font-semibold text-neutral-800 dark:text-neutral-200">{person.assignedLocationName}</div>
                </div>
              )}
            </div>
          </div>

          {/* Assigned / Overseen Locations Roster */}
          {storesOverseen.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center justify-between">
                <span>Associated Retail Locations ({storesOverseen.length})</span>
                <span className="text-[10px] lowercase text-neutral-400">Click to view store record</span>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1.5 divide-y divide-neutral-100 dark:divide-neutral-800">
                {storesOverseen.map(loc => (
                  <div
                    key={loc.id}
                    onClick={() => {
                      onClose();
                      onSelectLocationById(loc.id);
                    }}
                    className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                        #{loc.storeNumber} · {loc.name}
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        {loc.city}, {loc.state} • Phone: {loc.phone}
                      </div>
                    </div>
                    <span className="text-xs text-red-600 dark:text-red-400 font-semibold">
                      View →
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer (Dead-End Prevention) */}
        <div className="p-3 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-200 rounded-md text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

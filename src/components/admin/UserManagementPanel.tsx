import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  UserMinus,
  Shield, 
  Mail, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Key, 
  Send, 
  Copy, 
  Check, 
  Filter, 
  MoreVertical,
  Building,
  MapPin,
  ChevronRight,
  AlertTriangle,
  FileText,
  UserCheck,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { UserAccount, UserRole, AccessScope, LocationRecord } from '../../types';

export const UserManagementPanel: React.FC = () => {
  const { 
    users, 
    people, 
    locations, 
    inviteUserAccount, 
    activateUserAccount, 
    resendUserInvite, 
    updateUserAccount, 
    deactivateUserAccount,
    offboardUserAccount,
    currentUser 
  } = useDirectory();

  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Wizard State
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [newEmail, setNewEmail] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('Store Manager');
  const [newScope, setNewScope] = useState<AccessScope>('Store');
  const [assignedDistrict, setAssignedDistrict] = useState('District 1 (Rudy Calderon)');
  const [assignedStoreId, setAssignedStoreId] = useState('');
  const [createdUserResult, setCreatedUserResult] = useState<UserAccount | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Offboarding Wizard State (Blueprint Sec 9)
  const [offboardingUser, setOffboardingUser] = useState<UserAccount | null>(null);
  const [offboardStep, setOffboardStep] = useState<1 | 2 | 3 | 4>(1);
  const [offboardReason, setOffboardReason] = useState('Resignation / Voluntary Departure');
  const [deactivateLinkedPerson, setDeactivateLinkedPerson] = useState(true);
  const [setRemainingVacant, setSetRemainingVacant] = useState(true);
  const [reassignmentMap, setReassignmentMap] = useState<Record<string, { newManagerName: string; newManagerPhone: string; newPersonId?: string }>>({});
  const [offboardSummaryResult, setOffboardSummaryResult] = useState<{ affectedStores: number } | null>(null);
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);

  const filteredUsers = users.filter(u => {
    if (filterRole !== 'all' && u.role !== filterRole) return false;
    if (filterStatus !== 'all' && u.status !== filterStatus) return false;
    return true;
  });

  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleResendInvite = async (user: UserAccount) => {
    setResendingUserId(user.id);
    try {
      await resendUserInvite(user.id);
      alert(`Invitation email successfully resent to ${user.email}`);
    } catch (err: any) {
      console.error('Failed to resend invite:', err);
      const msg = err.message || 'Failed to resend invitation email. Please check SMTP configuration.';
      alert(`Resend Invitation Error: ${msg}`);
    } finally {
      setResendingUserId(null);
    }
  };

  const handlePersonSelect = (personId: string) => {
    setSelectedPersonId(personId);
    const person = people.find(p => p.id === personId);
    if (person) {
      setNewDisplayName(person.name);
      setNewEmail(person.email || `${person.name.toLowerCase().replace(/\s+/g, '.')}@shiekhshoes.com`);
      if (person.jobTitle.includes('District Manager')) {
        setNewRole('District Manager');
        setNewScope('District');
      } else if (person.jobTitle.includes('Store Manager')) {
        setNewRole('Store Manager');
        setNewScope('Store');
      } else if (person.department.includes('Executive') || person.jobTitle.includes('IT')) {
        setNewRole('System Administrator');
        setNewScope('Company-wide');
      }
    }
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;

    setIsInviting(true);
    setInviteError(null);

    try {
      const newUser = await inviteUserAccount(
        newEmail,
        newRole,
        newScope,
        selectedPersonId || undefined,
        newScope === 'District' ? assignedDistrict : undefined,
        newScope === 'Store' ? assignedStoreId : undefined
      );

      setCreatedUserResult(newUser);
      setWizardStep(3);
    } catch (err: any) {
      console.error('Failed to issue invitation:', err);
      const msg = err.message || 'Failed to issue invitation and send email. Please verify SMTP settings.';
      setInviteError(msg);
      alert(`Account Onboarding Error: ${msg}`);
    } finally {
      setIsInviting(false);
    }
  };

  const resetWizard = () => {
    setIsWizardOpen(false);
    setWizardStep(1);
    setSelectedPersonId('');
    setNewEmail('');
    setNewDisplayName('');
    setNewRole('Store Manager');
    setNewScope('Store');
    setCreatedUserResult(null);
    setIsInviting(false);
    setInviteError(null);
  };

  // Find stores assigned to the user undergoing offboarding
  const getAssignedStoresForUser = (user: UserAccount): LocationRecord[] => {
    const linkedPerson = user.personId ? people.find(p => p.id === user.personId) : null;
    const nameToMatch = linkedPerson?.name || user.displayName;

    return locations.filter(loc => {
      if (loc.storeManagerId && user.personId && loc.storeManagerId === user.personId) return true;
      if (loc.storeManagerName && loc.storeManagerName.toLowerCase() === nameToMatch.toLowerCase()) return true;
      return false;
    });
  };

  const startOffboarding = (user: UserAccount) => {
    setOffboardingUser(user);
    setOffboardStep(1);
    setOffboardReason('Resignation / Voluntary Departure');
    setDeactivateLinkedPerson(true);
    setSetRemainingVacant(true);
    setReassignmentMap({});
    setOffboardSummaryResult(null);
  };

  const handleExecuteOffboarding = () => {
    if (!offboardingUser) return;

    const reassignmentsArray = Object.entries(reassignmentMap).map(([storeId, data]: [string, { newManagerName: string; newManagerPhone: string; newPersonId?: string }]) => ({
      storeId,
      newManagerName: data.newManagerName,
      newManagerPhone: data.newManagerPhone,
      newPersonId: data.newPersonId
    }));

    const result = offboardUserAccount(offboardingUser.id, {
      deactivateLinkedPerson,
      setRemainingStoresVacant: setRemainingVacant,
      reassignments: reassignmentsArray,
      reason: offboardReason
    });

    setOffboardSummaryResult({ affectedStores: result.affectedStores });
    setOffboardStep(4);
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'System Administrator':
        return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-300';
      case 'Directory Data Steward':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300';
      case 'District Manager':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300';
      case 'Store Manager':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300';
      default:
        return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 border-neutral-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-red-600" />
              <span>User Accounts & Administrative Onboarding (Blueprint Sec 9)</span>
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs font-bold">
              {users.length} Authorized Accounts
            </span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Governance lifecycle: Create Person → Invite Account → Assign Role & Scope → Token Activation.
          </p>
        </div>

        <button
          onClick={() => setIsWizardOpen(true)}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Onboard New User Account</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-neutral-900 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-neutral-500 font-semibold flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter Role:</span>
          </span>
          {['all', 'System Administrator', 'Directory Data Steward', 'District Manager', 'Store Manager', 'Viewer'].map(role => (
            <button
              key={role}
              onClick={() => setFilterRole(role)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filterRole === role
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
              }`}
            >
              {role === 'all' ? 'All Roles' : role}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-neutral-500 font-semibold">Status:</span>
          {['all', 'Active', 'Invited', 'Deactivated'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                filterStatus === status
                  ? 'bg-red-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-800/70 text-neutral-500 dark:text-neutral-400 font-bold border-b border-neutral-200 dark:border-neutral-800">
                <th className="py-3 px-4">User / Display Name</th>
                <th className="py-3 px-3">Role & Scope</th>
                <th className="py-3 px-3">Auth Method</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Assigned Stores</th>
                <th className="py-3 px-3">Last Active</th>
                <th className="py-3 px-4 text-right">Lifecycle Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {filteredUsers.map(user => {
                const linkedPerson = user.personId ? people.find(p => p.id === user.personId) : null;
                const isCurrent = currentUser.id === user.id;
                const assignedStores = getAssignedStoresForUser(user);
                const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://shiekh-sor.web.app';
                const inviteLink = `${originUrl}/?inviteToken=${user.invitationToken || 'pending'}&email=${encodeURIComponent(user.email)}`;

                return (
                  <tr key={user.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 flex items-center justify-center font-bold text-xs shrink-0">
                          {user.displayName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                            <span>{user.displayName}</span>
                            {isCurrent && (
                              <span className="text-[10px] bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 px-1.5 py-0.2 rounded font-bold">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-500 font-mono">{user.email}</div>
                          {linkedPerson && (
                            <div className="text-[10px] text-neutral-400">
                              Linked: {linkedPerson.jobTitle}
                            </div>
                          )}
                          {user.status === 'Invited' && (
                            <div className="mt-1.5 p-1.5 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-md flex items-center justify-between gap-1.5 max-w-sm">
                              <div className="flex items-center gap-1 min-w-0">
                                <Key className="w-3 h-3 text-amber-600 shrink-0" />
                                <a
                                  href={inviteLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] font-mono text-amber-900 dark:text-amber-200 underline truncate hover:text-red-600"
                                  title={inviteLink}
                                >
                                  {inviteLink}
                                </a>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopy(inviteLink)}
                                className="px-1.5 py-0.5 bg-white dark:bg-neutral-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 rounded text-[10px] font-bold shrink-0 flex items-center gap-1 hover:bg-amber-100 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                                title="Copy invitation link to clipboard"
                              >
                                {copiedToken === inviteLink ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
                                <span>{copiedToken === inviteLink ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="space-y-1">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${getRoleBadge(user.role)}`}>
                          {user.role}
                        </span>
                        <div className="text-[11px] text-neutral-500 flex items-center gap-1">
                          <span>Scope: {user.accessScope}</span>
                          {user.assignedDistrict && <span className="font-mono">({user.assignedDistrict.split(' ')[0]})</span>}
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span className="font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                        {user.authMethod === 'google' ? 'Google SSO' : 'Email/Password'}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                        user.status === 'Active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                        user.status === 'Invited' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                        'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                      }`}>
                        {user.status === 'Active' && <CheckCircle2 className="w-3 h-3" />}
                        {user.status === 'Invited' && <Clock className="w-3 h-3" />}
                        {user.status === 'Deactivated' && <XCircle className="w-3 h-3" />}
                        <span>{user.status}</span>
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      {assignedStores.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold rounded text-[10px]">
                            {assignedStores.length} {assignedStores.length === 1 ? 'Store' : 'Stores'}
                          </span>
                          <span className="text-[10px] text-neutral-400 truncate max-w-[120px]">
                            #{assignedStores.map(s => s.storeNumber).join(', #')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-neutral-400 text-[11px]">—</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-[11px] text-neutral-500 font-mono">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {user.status === 'Invited' && (
                          <>
                            <button
                              onClick={() => handleCopy(inviteLink)}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 rounded text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                              title="Copy onboarding invitation link to clipboard"
                            >
                              {copiedToken === inviteLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedToken === inviteLink ? 'Copied' : 'Copy Link'}</span>
                            </button>
                            <button
                              onClick={() => handleResendInvite(user)}
                              disabled={resendingUserId === user.id}
                              className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Resend invitation email"
                            >
                              {resendingUserId === user.id ? (
                                <Loader2 className="w-3 h-3 animate-spin text-neutral-600" />
                              ) : (
                                <Send className="w-3 h-3" />
                              )}
                              <span>{resendingUserId === user.id ? 'Sending...' : 'Resend Email'}</span>
                            </button>
                            <button
                              onClick={() => startOffboarding(user)}
                              className="px-2 py-1 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                              title="Revoke pending invitation and offboard"
                            >
                              <UserMinus className="w-3 h-3 text-red-600" />
                              <span>Offboard</span>
                            </button>
                          </>
                        )}

                        {user.status === 'Active' && !isCurrent && (
                          <button
                            onClick={() => startOffboarding(user)}
                            className="px-2.5 py-1 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                            title="Launch Offboarding Wizard (Soft-delete & Reassign Stores)"
                          >
                            <UserMinus className="w-3.5 h-3.5 text-red-600" />
                            <span>Offboard</span>
                          </button>
                        )}

                        {user.status === 'Deactivated' && (
                          <span className="text-[11px] text-neutral-400 italic">Offboarded</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Onboarding Wizard Modal */}
      {isWizardOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-red-600" />
                  <span>Administrative User Onboarding (4-Step Lifecycle)</span>
                </h3>
                <p className="text-xs text-neutral-500">
                  Step {wizardStep} of 3: {wizardStep === 1 ? 'Link Directory Person' : wizardStep === 2 ? 'Assign Role & Access Scope' : 'Activation & Token Delivery'}
                </p>
              </div>
              <button onClick={resetWizard} className="text-neutral-400 hover:text-neutral-600">✕</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {/* STEP 1: Link Person */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Step 1: Link to Existing Person in Directory (Optional)
                    </label>
                    <p className="text-xs text-neutral-500 mb-2">
                      Linking connects store assignments, job titles, and manager rosters automatically.
                    </p>
                    <select
                      value={selectedPersonId}
                      onChange={e => handlePersonSelect(e.target.value)}
                      className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs"
                    >
                      <option value="">— Create New / Unlinked Account —</option>
                      {people.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.jobTitle} • {p.department})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      User Full Display Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newDisplayName || ''}
                      onChange={e => setNewDisplayName(e.target.value)}
                      placeholder="e.g. Jessica Morales"
                      className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Authorized Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={newEmail || ''}
                      onChange={e => setNewEmail(e.target.value)}
                      placeholder="e.g. j.morales@shiekhshoes.com"
                      className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs"
                    />
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      disabled={!newEmail || !newDisplayName}
                      onClick={() => setWizardStep(2)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
                    >
                      <span>Proceed to Step 2: Role & Scope</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Assign Role & Scope */}
              {wizardStep === 2 && (
                <form onSubmit={handleCompleteOnboarding} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Assign RBAC Role (Blueprint Sec 9)
                    </label>
                    <select
                      value={newRole}
                      onChange={e => setNewRole(e.target.value as UserRole)}
                      className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-bold"
                    >
                      <option value="Viewer">Viewer (Read-only browsing, submit requests)</option>
                      <option value="Store Associate">Store Associate (View schedules, request updates)</option>
                      <option value="Store Manager">Store Manager (Store level authority & updates)</option>
                      <option value="District Manager">District Manager (District multi-store scope)</option>
                      <option value="Directory Data Steward">Directory Data Steward (Full SoR approval & curation)</option>
                      <option value="System Administrator">System Administrator (Master governance & integrations)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Access Scope
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Company-wide', 'District', 'Store'] as AccessScope[]).map(sc => (
                        <button
                          key={sc}
                          type="button"
                          onClick={() => setNewScope(sc)}
                          className={`p-2.5 rounded-lg border text-xs font-semibold ${
                            newScope === sc
                              ? 'border-red-600 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-bold'
                              : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400'
                          }`}
                        >
                          {sc}
                        </button>
                      ))}
                    </div>
                  </div>

                  {newScope === 'District' && (
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                        Assigned District
                      </label>
                      <select
                        value={assignedDistrict}
                        onChange={e => setAssignedDistrict(e.target.value)}
                        className="w-full p-2 bg-neutral-50 dark:bg-neutral-800 border rounded text-xs"
                      >
                        <option value="District 1 (Rudy Calderon)">District 1 (Rudy Calderon)</option>
                        <option value="District 2 (David Castro)">District 2 (David Castro)</option>
                        <option value="District 3 (Karlo Llovido)">District 3 (Karlo Llovido)</option>
                      </select>
                    </div>
                  )}

                  {newScope === 'Store' && (
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                        Assigned Store
                      </label>
                      <select
                        value={assignedStoreId}
                        onChange={e => setAssignedStoreId(e.target.value)}
                        className="w-full p-2 bg-neutral-50 dark:bg-neutral-800 border rounded text-xs"
                      >
                        <option value="">— Select Assigned Store —</option>
                        {locations.map(l => (
                          <option key={l.id} value={l.id}>
                            #{l.storeNumber} - {l.name} ({l.city}, {l.state})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {inviteError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                      <div>
                        <strong>Failed to Issue Invitation:</strong> {inviteError}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex justify-between">
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      disabled={isInviting}
                      className="px-3 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={isInviting}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-neutral-400 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isInviting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Sending Real Invite...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Issue Invitation & Provision Account</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 3: Activation Token & Success */}
              {wizardStep === 3 && createdUserResult && (
                <div className="space-y-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>

                  <div>
                    <h4 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                      User Account Provisioned Successfully!
                    </h4>
                    <p className="text-xs text-neutral-500 mt-1">
                      Invitation dispatched via corporate SMTP relay to <strong>{createdUserResult.email}</strong>.
                    </p>
                  </div>

                  <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl border text-left text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Account Role:</span>
                      <span className="font-bold">{createdUserResult.role}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Scope:</span>
                      <span className="font-bold">{createdUserResult.accessScope}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-neutral-500 font-mono">Activation Token:</span>
                      <button
                        onClick={() => handleCopy(createdUserResult.invitationToken || '')}
                        className="flex items-center gap-1 px-2 py-1 bg-white dark:bg-neutral-700 border rounded text-[11px] font-mono text-neutral-800 dark:text-neutral-200"
                      >
                        {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{createdUserResult.invitationToken}</span>
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-center gap-2">
                    <button
                      onClick={resetWizard}
                      className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 rounded-lg text-xs font-bold"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* User Offboarding Wizard Modal (Blueprint Sec 9) */}
      {offboardingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 bg-red-50/50 dark:bg-red-950/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-xs">
                  <UserMinus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                    <span>User Offboarding Wizard (Blueprint Sec 9)</span>
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Step {offboardStep} of 3: {offboardStep === 1 ? 'Account & Separation Audit' : offboardStep === 2 ? 'Store Leadership Reassignment' : offboardStep === 3 ? 'SOX Preservation & Confirmation' : 'Offboarding Completed'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setOffboardingUser(null)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* STEP 1: Account Audit & Separation Details */}
              {offboardStep === 1 && (
                <div className="space-y-4">
                  {/* Account Summary Card */}
                  <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/80 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                        {offboardingUser.displayName}
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getRoleBadge(offboardingUser.role)}`}>
                        {offboardingUser.role}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-500 font-mono">
                      Email: {offboardingUser.email} · Scope: {offboardingUser.accessScope}
                    </div>
                  </div>

                  {/* Store Associations Banner */}
                  {(() => {
                    const stores = getAssignedStoresForUser(offboardingUser);
                    return (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl space-y-1.5">
                        <div className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <span>Active Store Leadership Assignments Detected ({stores.length})</span>
                        </div>
                        {stores.length > 0 ? (
                          <div className="space-y-1 pt-1">
                            <p className="text-[11px] text-amber-800 dark:text-amber-400">
                              This user is currently assigned as Store Manager for the following retail location(s):
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {stores.map(s => (
                                <span key={s.id} className="px-2 py-0.5 bg-white dark:bg-neutral-900 border border-amber-300 dark:border-amber-700 rounded text-[11px] font-bold text-neutral-800 dark:text-neutral-200 font-mono">
                                  #{s.storeNumber} {s.name} ({s.city}, {s.state})
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-amber-800 dark:text-amber-400">
                            No active store manager assignments currently tied to this user profile.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Reason for Separation */}
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Reason for Offboarding / Deactivation *
                    </label>
                    <select
                      value={offboardReason}
                      onChange={e => setOffboardReason(e.target.value)}
                      className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100"
                    >
                      <option value="Resignation / Voluntary Departure">Resignation / Voluntary Departure</option>
                      <option value="Involuntary Separation">Involuntary Separation</option>
                      <option value="Internal Transfer / Role Reassignment">Internal Transfer / Role Reassignment</option>
                      <option value="Contract Expiration">Contract Expiration</option>
                      <option value="Access Revocation (Security Audit)">Access Revocation (Security Audit)</option>
                    </select>
                  </div>

                  {/* Deactivate linked person in People roster */}
                  {offboardingUser.personId && (
                    <label className="flex items-start gap-2.5 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deactivateLinkedPerson}
                        onChange={e => setDeactivateLinkedPerson(e.target.checked)}
                        className="rounded text-red-600 mt-0.5"
                      />
                      <div>
                        <div className="font-bold text-neutral-800 dark:text-neutral-200">
                          Deactivate linked record in People & Field Organization roster
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Flags person profile as "Inactive" with offboarding timestamp notes.
                        </div>
                      </div>
                    </label>
                  )}

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => setOffboardStep(2)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs"
                    >
                      <span>Next: Store Reassignments</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Store Leadership Reassignments */}
              {offboardStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                      Store Leadership Continuity Matrix
                    </h4>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Blueprint Sec 9: Ensure retail stores are not left without verified management coverage or designate them as Vacant.
                    </p>
                  </div>

                  {(() => {
                    const stores = getAssignedStoresForUser(offboardingUser);
                    if (stores.length === 0) {
                      return (
                        <div className="p-6 text-center text-neutral-500 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700">
                          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                          <div className="font-bold">No Store Leadership Reassignments Required</div>
                          <p className="text-[11px] text-neutral-400 mt-1">This user has no direct store manager assignments.</p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3">
                        {stores.map(store => {
                          const currentReassignment = reassignmentMap[store.id];

                          return (
                            <div key={store.id} className="p-3.5 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <div className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                                  <Building className="w-4 h-4 text-red-600" />
                                  <span>Store #{store.storeNumber} · {store.name}</span>
                                </div>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-mono">
                                  {store.city}, {store.state}
                                </span>
                              </div>

                              <div className="space-y-2">
                                <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                                  Assign Successor Store Manager:
                                </label>
                                <select
                                  value={currentReassignment?.newPersonId || ''}
                                  onChange={e => {
                                    const selectedId = e.target.value;
                                    if (!selectedId) {
                                      const updated = { ...reassignmentMap };
                                      delete updated[store.id];
                                      setReassignmentMap(updated);
                                    } else {
                                      const cand = people.find(p => p.id === selectedId);
                                      if (cand) {
                                        setReassignmentMap({
                                          ...reassignmentMap,
                                          [store.id]: {
                                            newManagerName: cand.name,
                                            newManagerPhone: cand.phone,
                                            newPersonId: cand.id
                                          }
                                        });
                                      }
                                    }
                                  }}
                                  className="w-full p-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100"
                                >
                                  <option value="">— Flag as "Vacant (Needs Steward Review)" —</option>
                                  {people.filter(p => p.id !== offboardingUser.personId && p.activeStatus).map(cand => (
                                    <option key={cand.id} value={cand.id}>
                                      {cand.name} ({cand.jobTitle} · {cand.city}, {cand.state})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  <div className="pt-2 flex justify-between">
                    <button
                      onClick={() => setOffboardStep(1)}
                      className="px-3 py-2 bg-neutral-100 text-neutral-700 rounded-lg text-xs font-bold"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setOffboardStep(3)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs"
                    >
                      <span>Next: Review & Confirm</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: SOX Audit Preservation & Confirmation */}
              {offboardStep === 3 && (
                <div className="space-y-4">
                  <div className="p-4 bg-red-50/70 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl space-y-2">
                    <div className="font-bold text-red-900 dark:text-red-300 flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-red-600" />
                      <span>Immutable SOX Compliance & Audit Retention Guarantee</span>
                    </div>
                    <ul className="text-[11px] text-red-800 dark:text-red-400 space-y-1 list-disc list-inside">
                      <li><strong>Soft Deactivation:</strong> User login credentials and active session tokens are revoked immediately.</li>
                      <li><strong>Audit Trail Preservation:</strong> All historical change requests submitted, approved, or rejected by this user remain permanently intact.</li>
                      <li><strong>Atomic Directory Sync:</strong> Assigned store leadership is updated without orphaned records.</li>
                      <li><strong>Notification Broadcast:</strong> Alert will be dispatched to Directory Data Stewards.</li>
                    </ul>
                  </div>

                  <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl border space-y-1.5">
                    <div className="font-bold text-neutral-800 dark:text-neutral-200">Execution Summary:</div>
                    <div className="text-[11px] text-neutral-600 dark:text-neutral-400 space-y-1">
                      <div>• User to Deactivate: <strong>{offboardingUser.displayName}</strong> ({offboardingUser.email})</div>
                      <div>• Separation Reason: <strong>{offboardReason}</strong></div>
                      <div>• Reassigned / Flagged Stores: <strong>{getAssignedStoresForUser(offboardingUser).length}</strong></div>
                      <div>• Initiated By: <strong>{currentUser.displayName}</strong> ({currentUser.role})</div>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-between">
                    <button
                      onClick={() => setOffboardStep(2)}
                      className="px-3 py-2 bg-neutral-100 text-neutral-700 rounded-lg text-xs font-bold"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleExecuteOffboarding}
                      className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md transition-all"
                    >
                      <UserMinus className="w-4 h-4" />
                      <span>Confirm & Execute Offboarding</span>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: Offboarding Completed */}
              {offboardStep === 4 && offboardSummaryResult && (
                <div className="space-y-4 text-center py-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>

                  <div>
                    <h4 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                      User Successfully Offboarded
                    </h4>
                    <p className="text-xs text-neutral-500 mt-1">
                      Login disabled for <strong>{offboardingUser.email}</strong>. {offboardSummaryResult.affectedStores} store assignment(s) updated.
                    </p>
                  </div>

                  <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl border text-left text-xs space-y-1.5">
                    <div className="font-bold text-neutral-800 dark:text-neutral-200">SOX Audit Confirmation:</div>
                    <div className="text-[11px] text-neutral-500">
                      Audit entry generated and immutable historical log preserved per Blueprint Sec 9.
                    </div>
                  </div>

                  <div className="pt-2 flex justify-center">
                    <button
                      onClick={() => setOffboardingUser(null)}
                      className="px-5 py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 rounded-lg text-xs font-bold"
                    >
                      Close Wizard
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

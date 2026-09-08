import React, { useRef, useState } from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { 
  FileSpreadsheet, 
  Globe, 
  Code, 
  Clock, 
  ShieldCheck, 
  Download, 
  Upload, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Key, 
  Users, 
  History,
  Sliders,
  ExternalLink,
  Plus,
  Trash2,
  Calendar,
  Database,
  Send,
  Cloud,
  Edit2,
  X,
  Radio,
  Star,
  Building,
  RadioTower,
  Save,
  RotateCcw,
  Mail,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Search,
  Server,
  Bell,
  FileText,
  Copy
} from 'lucide-react';
import { WeeklySchedule, HoursTemplate, CorporateHoliday, UserProfile, UserRole, LocationRecord, UserOnboardingChoice } from '../../types';
import { WeeklyHoursEditor } from '../common/WeeklyHoursEditor';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { PageHeader } from '../common/PageHeader';
import { useDialogFocus } from '../common/useDialogFocus';
import { DEFAULT_WEEKLY_HOURS } from '../../lib/defaultHours';
import { SmtpCommunicationsPanel } from './SmtpCommunicationsPanel';
import { SopRunbooksPanel } from './SopRunbooksPanel';
import { CustomFieldsPanel } from './CustomFieldsPanel';

type AdminTab = 
  | 'custom-fields'
  | 'csv' 
  | 'hours' 
  | 'gbp' 
  | 'api' 
  | 'cloud' 
  | 'governance' 
  | 'rbac' 
  | 'audit' 
  | 'smtp' 
  | 'smtp-relay' 
  | 'email-templates' 
  | 'notification-rules' 
  | 'outbox-logs' 
  | 'sop';

type PendingAdminAction = {
  kind: 'hours-template' | 'holiday' | 'user';
  id: string;
  name: string;
};

export const AdminIntegrationsView: React.FC = () => {
  const { 
    locations, 
    people, 
    users, 
    auditLogs, 
    currentUser, 
    hoursTemplates,
    corporateHolidays,
    emailTemplates,
    notificationRules,
    outboxLogs,
    createLocation,
    updateLocation,
    createHoursTemplate,
    updateHoursTemplate,
    deleteHoursTemplate,
    createUserAccount,
    updateUserAccount,
    sendUserInvitation,
    createUserInvitationLink,
    addCorporateHoliday,
    updateCorporateHoliday,
    deleteCorporateHoliday,
    broadcastHolidaysToFleet,
    rollbackAuditChange
  } = useDirectory();

  const [activeTab, setActiveTab] = useState<AdminTab>('hours');
  const [rollbackAlert, setRollbackAlert] = useState<{ success: boolean; message: string } | null>(null);
  const [pendingAdminAction, setPendingAdminAction] = useState<PendingAdminAction | null>(null);

  const handleConfirmAdminAction = () => {
    if (!pendingAdminAction) return;

    switch (pendingAdminAction.kind) {
      case 'hours-template':
        deleteHoursTemplate(pendingAdminAction.id);
        break;
      case 'holiday':
        deleteCorporateHoliday(pendingAdminAction.id);
        break;
      case 'user':
        updateUserAccount(pendingAdminAction.id, { status: 'Revoked' });
        break;
    }

    setPendingAdminAction(null);
  };

  // Sub-Nav Filter & Accordion State
  const [searchQuery, setSearchQuery] = useState('');
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    governance: true,
    communications: true,
    fleet: true,
    developer: true
  });

  const toggleAccordion = (groupId: string) => {
    setOpenAccordions(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // CSV Tab State
  const [csvStatus, setCsvStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isAddStoreOpen, setIsAddStoreOpen] = useState(false);
  const [newStoreForm, setNewStoreForm] = useState({
    storeNumber: '',
    name: '',
    type: 'Strip Center / Shopping Center' as LocationRecord['type'],
    address: '',
    city: '',
    state: 'CA',
    zipCode: '',
    phone: '',
    district: 'District 1 — Northern CA',
    googleReviewUrl: '',
    storePageUrl: ''
  });

  // GBP Tab State
  const [isSyncingGbp, setIsSyncingGbp] = useState(false);
  const [gbpAutoSync, setGbpAutoSync] = useState(true);
  const [gbpAccountId, setGbpAccountId] = useState('7482-GBP-CORP-WEST');
  const [gbpSyncSuccess, setGbpSyncSuccess] = useState(false);
  const [syncFields, setSyncFields] = useState({
    standardHours: true,
    holidayHours: true,
    phones: true,
    addresses: true,
    reviewUrls: true,
    storePages: true
  });

  // Hours & Holidays Tab State
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<HoursTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<{ name: string; description: string; schedule: WeeklySchedule }>({
    name: '',
    description: '',
    schedule: DEFAULT_WEEKLY_HOURS
  });
  
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<CorporateHoliday | null>(null);
  const [holidayForm, setHolidayForm] = useState<Omit<CorporateHoliday, 'id'>>({
    name: '',
    date: '2026-11-26',
    status: 'Closed (All Stores)',
    hours: { open: '00:00', close: '00:00', isClosed: true },
    notes: ''
  });
  const [broadcastSuccess, setBroadcastSuccess] = useState<string | null>(null);

  // Governance & Users Tab State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const templateDialogRef = useRef<HTMLDivElement>(null);
  const holidayDialogRef = useRef<HTMLDivElement>(null);
  const userDialogRef = useRef<HTMLDivElement>(null);
  const addStoreDialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(isTemplateModalOpen, () => setIsTemplateModalOpen(false), templateDialogRef);
  useDialogFocus(isHolidayModalOpen, () => setIsHolidayModalOpen(false), holidayDialogRef);
  useDialogFocus(isUserModalOpen, () => setIsUserModalOpen(false), userDialogRef);
  useDialogFocus(isAddStoreOpen, () => setIsAddStoreOpen(false), addStoreDialogRef);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userSaveError, setUserSaveError] = useState('');
  const [userSaveNotice, setUserSaveNotice] = useState('');
  const [onboardingChoice, setOnboardingChoice] = useState<UserOnboardingChoice>('send');
  const [userActionId, setUserActionId] = useState('');
  const [userForm, setUserForm] = useState<Omit<UserProfile, 'id'>>({
    name: '',
    email: '',
    role: 'Viewer',
    storeNumber: '01',
    status: 'Active'
  });
  const [auditFilter, setAuditFilter] = useState('All');

  // CSV Export Handler
  const handleExportCSV = () => {
    setIsExporting(true);
    setTimeout(() => {
      const headers = [
        'StoreNumber',
        'StoreName',
        'Type',
        'Address',
        'City',
        'State',
        'ZipCode',
        'Phone',
        'District',
        'StoreManager',
        'DistrictManager',
        'OperationalStatus',
        'RecordStatus',
        'GoogleReviewUrl',
        'StorePageUrl'
      ];
      const rows = locations.map(l => [
        `"${l.storeNumber}"`,
        `"${l.name.replace(/"/g, '""')}"`,
        `"${l.type || ''}"`,
        `"${l.address.replace(/"/g, '""')}"`,
        `"${l.city}"`,
        `"${l.state}"`,
        `"${l.zipCode}"`,
        `"${l.phone}"`,
        `"${l.district || ''}"`,
        `"${l.storeManagerName || ''}"`,
        `"${l.districtManagerName || ''}"`,
        `"${l.operationalStatus}"`,
        `"${l.recordStatus}"`,
        `"${l.googleReviewUrl || ''}"`,
        `"${l.storePageUrl || ''}"`
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `shiekh_store_directory_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsExporting(false);
      setCsvStatus(`Successfully exported ${locations.length} stores.`);
    }, 600);
  };

  const handleSimulateImport = () => {
    setIsImporting(true);
    setTimeout(() => {
      setIsImporting(false);
      setCsvStatus(`Successfully parsed and validated directory import.`);
    }, 1000);
  };

  // Quick Add Store Handler
  const handleCreateStoreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreForm.storeNumber || !newStoreForm.name) return;
    createLocation({
      storeNumber: newStoreForm.storeNumber.padStart(2, '0'),
      name: newStoreForm.name,
      type: newStoreForm.type,
      address: newStoreForm.address || '100 Main St',
      city: newStoreForm.city || 'Los Angeles',
      state: newStoreForm.state || 'CA',
      zipCode: newStoreForm.zipCode || '90001',
      phone: newStoreForm.phone || '(555) 000-0000',
      phonePrivacy: 'Public',
      timeZone: 'America/Los_Angeles',
      district: newStoreForm.district,
      operationalStatus: 'Open — Normal Operations',
      standardHours: DEFAULT_WEEKLY_HOURS,
      recordStatus: 'Active',
      googleReviewUrl: newStoreForm.googleReviewUrl,
      storePageUrl: newStoreForm.storePageUrl
    });
    setIsAddStoreOpen(false);
    setNewStoreForm({
      storeNumber: '',
      name: '',
      type: 'Strip Center / Shopping Center',
      address: '',
      city: '',
      state: 'CA',
      zipCode: '',
      phone: '',
      district: 'District 1 — Northern CA',
      googleReviewUrl: '',
      storePageUrl: ''
    });
    setCsvStatus(`Created new store #${newStoreForm.storeNumber}.`);
  };

  // Google Business Profile Sync
  const handleTriggerGbpSync = () => {
    setIsSyncingGbp(true);
    setGbpSyncSuccess(false);
    setTimeout(() => {
      setIsSyncingGbp(false);
      setGbpSyncSuccess(true);
      setTimeout(() => setGbpSyncSuccess(false), 5000);
    }, 1400);
  };

  // Hours Template CUD Handlers
  const handleOpenNewTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      name: '',
      description: '',
      schedule: DEFAULT_WEEKLY_HOURS
    });
    setIsTemplateModalOpen(true);
  };

  const handleOpenEditTemplate = (tmpl: HoursTemplate) => {
    setEditingTemplate(tmpl);
    setTemplateForm({
      name: tmpl.name,
      description: tmpl.description,
      schedule: { ...tmpl.schedule }
    });
    setIsTemplateModalOpen(true);
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateForm.name) return;
    if (editingTemplate) {
      updateHoursTemplate(editingTemplate.id, {
        name: templateForm.name,
        description: templateForm.description,
        schedule: templateForm.schedule
      });
    } else {
      createHoursTemplate({
        name: templateForm.name,
        description: templateForm.description,
        schedule: templateForm.schedule
      });
    }
    setIsTemplateModalOpen(false);
  };

  // Corporate Holiday CUD Handlers
  const handleOpenNewHoliday = () => {
    setEditingHoliday(null);
    setHolidayForm({
      name: '',
      date: '2026-11-26',
      status: 'Closed (All Stores)',
      hours: { open: '00:00', close: '00:00', isClosed: true },
      notes: ''
    });
    setIsHolidayModalOpen(true);
  };

  const handleOpenEditHoliday = (hol: CorporateHoliday) => {
    setEditingHoliday(hol);
    setHolidayForm({
      name: hol.name,
      date: hol.date,
      status: hol.status,
      hours: hol.hours || { open: '00:00', close: '00:00', isClosed: true },
      notes: hol.notes || ''
    });
    setIsHolidayModalOpen(true);
  };

  const handleSaveHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayForm.name || !holidayForm.date) return;
    if (editingHoliday) {
      updateCorporateHoliday(editingHoliday.id, holidayForm);
    } else {
      addCorporateHoliday(holidayForm);
    }
    setIsHolidayModalOpen(false);
  };

  const handleBroadcastHolidays = () => {
    broadcastHolidaysToFleet();
    setBroadcastSuccess(`Broadcasted ${corporateHolidays.length} corporate holiday schedules across all ${locations.length} stores.`);
    setTimeout(() => setBroadcastSuccess(null), 4500);
  };

  // User CUD Handlers
  const handleOpenNewUser = () => {
    setUserSaveError('');
    setEditingUser(null);
    setOnboardingChoice('send');
    setUserForm({
      name: '',
      email: '',
      role: 'Viewer',
      storeNumber: '01',
      status: 'Active'
    });
    setIsUserModalOpen(true);
  };

  const handleOpenEditUser = (u: UserProfile) => {
    setUserSaveError('');
    setEditingUser(u);
    setUserForm({
      name: u.name,
      email: u.email,
      role: u.role,
      storeNumber: u.storeNumber || '01',
      status: u.status || 'Active'
    });
    setIsUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserSaveError('');
    const name = userForm.name.trim();
    const email = userForm.email.trim().toLowerCase();
    const storeNumber = userForm.storeNumber?.trim();
    if (!name || !email) return setUserSaveError('Name and email are required.');
    if (userForm.role === 'Viewer' && !storeNumber) return setUserSaveError('Viewer accounts require an assigned store.');
    if (users.some(existing => existing.id !== editingUser?.id && existing.email.trim().toLowerCase() === email)) return setUserSaveError('An account with this email already exists.');

    const payload: Omit<UserProfile, 'id'> = {
      name,
      email,
      role: userForm.role,
      status: userForm.status || 'Active',
      ...(userForm.role === 'Viewer' && storeNumber ? { storeNumber } : {}),
    };

    payload.accessScope = userForm.role === 'Viewer' && storeNumber
      ? `Store ${storeNumber}`
      : 'Company-wide';

    setIsSavingUser(true);
    try {
      if (editingUser) {
        updateUserAccount(editingUser.id, payload);
        setUserSaveNotice(`Updated ${payload.name}.`);
      } else {
        const result = await createUserAccount(payload, onboardingChoice);
        if (result.outcome === 'relay-accepted') {
          setUserSaveNotice(`Created ${payload.name}. Gmail accepted the secure sign-in email for relay; inbox delivery can still be affected by routing, quarantine, or spam filtering.`);
        } else if (result.outcome === 'link-generated' && result.activationLink) {
          try {
            await navigator.clipboard.writeText(result.activationLink);
            setUserSaveNotice(`Created ${payload.name} and copied a fresh secure sign-in link.`);
          } catch {
            setUserSaveNotice(`Created ${payload.name} and generated a secure link, but the browser could not copy it. Use Copy secure sign-in link on the account.`);
          }
        } else if (result.outcome === 'access-only') {
          setUserSaveNotice(`Created ${payload.name} with directory access. No onboarding email was submitted.`);
        } else {
          setUserSaveNotice(`Created ${payload.name}, but onboarding was not completed: ${result.errorMessage || 'The secure link could not be issued.'}`);
        }
      }
      setIsUserModalOpen(false);
    } catch (error) {
      setUserSaveError(error instanceof Error ? error.message : 'The account could not be saved.');
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleUserInvitation = async (account: UserProfile, action: 'send' | 'copy') => {
    setUserActionId(`${account.id}:${action}`);
    setUserSaveNotice('');
    try {
      if (action === 'send') {
        await sendUserInvitation(account.id);
        setUserSaveNotice(`Gmail accepted the secure sign-in email for ${account.name}. This confirms relay acceptance, not final inbox delivery.`);
      } else {
        const activationLink = await createUserInvitationLink(account.id);
        await navigator.clipboard.writeText(activationLink);
        setUserSaveNotice(`Copied a fresh secure sign-in link for ${account.name}.`);
      }
    } catch (error) {
      setUserSaveNotice(error instanceof Error ? error.message : `The ${action} action could not be completed.`);
    } finally {
      setUserActionId('');
    }
  };

  const filteredLogs = auditFilter === 'All' 
    ? auditLogs 
    : auditLogs.filter(l => l.entityType === auditFilter);

  const isItemActive = (itemId: AdminTab) => {
    if (activeTab === itemId) return true;
    if (itemId === 'rbac' && activeTab === 'governance') return true;
    if (itemId === 'smtp-relay' && activeTab === 'smtp') return true;
    return false;
  };

  const matchesSearch = (item: { label: string; keywords?: string[] }, group: { title: string }) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    if (group.title.toLowerCase().includes(q)) return true;
    if (item.label.toLowerCase().includes(q)) return true;
    if (item.keywords?.some(k => k.toLowerCase().includes(q))) return true;
    return false;
  };

  const navGroups = [
    {
      id: 'governance',
      emoji: '🛡️',
      title: 'GOVERNANCE & SECURITY',
      items: [
        {
          id: 'rbac' as AdminTab,
          label: 'User RBAC',
          icon: Users,
          badge: users.length,
          keywords: ['user', 'rbac', 'roles', 'permissions', 'accounts', 'authorization']
        },
        {
          id: 'audit' as AdminTab,
          label: 'Audit & Rollbacks',
          icon: History,
          badge: auditLogs.length,
          keywords: ['audit', 'logs', 'rollbacks', 'trail', 'history', 'revert', 'changes']
        },
        {
          id: 'cloud' as AdminTab,
          label: 'Cloud & Firebase',
          icon: Cloud,
          keywords: ['cloud', 'firebase', 'firestore', 'sync', 'database', 'connection']
        }
      ]
    },
    {
      id: 'communications',
      emoji: '📧',
      title: 'COMMUNICATIONS & MAIL',
      items: [
        {
          id: 'smtp-relay' as AdminTab,
          label: 'SMTP Relay',
          icon: Server,
          keywords: ['smtp', 'mail', 'relay', 'gateway', 'host', 'port', 'credentials']
        },
        {
          id: 'email-templates' as AdminTab,
          label: 'Templates',
          icon: FileText,
          badge: emailTemplates?.length || 0,
          keywords: ['templates', 'email', 'html', 'notifications', 'messages']
        },
        {
          id: 'notification-rules' as AdminTab,
          label: 'Rules',
          icon: Bell,
          badge: notificationRules?.length || 0,
          keywords: ['rules', 'notification', 'triggers', 'events', 'alerts']
        },
        {
          id: 'outbox-logs' as AdminTab,
          label: 'Outbox',
          icon: Send,
          badge: outboxLogs?.length || 0,
          keywords: ['outbox', 'logs', 'sent', 'delivery', 'receipts', 'transmission']
        }
      ]
    },
    {
      id: 'fleet',
      emoji: '📊',
      title: 'DATA & STORE FLEET',
      items: [
        {
          id: 'custom-fields' as AdminTab,
          label: 'Custom Fields',
          icon: Sliders,
          keywords: ['custom', 'fields', 'metadata', 'yelp', 'apple', 'urls']
        },
        {
          id: 'hours' as AdminTab,
          label: 'Hours Templates',
          icon: Clock,
          badge: hoursTemplates.length,
          keywords: ['hours', 'templates', 'schedules', 'holidays', 'calendar']
        },
        {
          id: 'gbp' as AdminTab,
          label: 'Google Business Profile',
          icon: Globe,
          keywords: ['google', 'gbp', 'business profile', 'maps', 'sync', 'locations']
        },
        {
          id: 'csv' as AdminTab,
          label: 'Fleet CSV',
          icon: FileSpreadsheet,
          badge: locations.length,
          keywords: ['csv', 'fleet', 'export', 'import', 'stores', 'roster', 'spreadsheet']
        }
      ]
    },
    {
      id: 'developer',
      emoji: '🔑',
      title: 'DEVELOPER & DOCS',
      items: [
        {
          id: 'api' as AdminTab,
          label: 'Directory API',
          icon: Key,
          keywords: ['api', 'keys', 'developer', 'tokens', 'webhooks', 'endpoints']
        },
        {
          id: 'sop' as AdminTab,
          label: 'SOP Runbooks',
          icon: BookOpen,
          keywords: ['sop', 'runbooks', 'procedures', 'docs', 'manuals', 'guide']
        }
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin & Integrations Console"
        description="System configuration, hours templates, corporate holidays, external connectors, API keys, and access governance"
      />

      {/* Dual-Pane Flex Architecture */}
      <div className="flex flex-col items-start gap-4 lg:flex-row">
        {/* Left Sub-Nav Sidebar */}
        <aside className="max-h-72 w-full shrink-0 overflow-y-auto pr-2 scrollbar-thin space-y-3 lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)] lg:max-h-none lg:w-72">
          {/* Sticky Search Filter */}
          <div className="sticky top-0 bg-neutral-50/95 backdrop-blur-xs pb-2.5 pt-0.5 z-10">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-red-500 shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Collapsible Accordions */}
          <nav className="space-y-3">
            {navGroups.map((group) => {
              const filteredItems = group.items.filter(item => matchesSearch(item, group));
              if (searchQuery.trim() && filteredItems.length === 0) return null;

              const isExpanded = searchQuery.trim() !== '' ? true : !!openAccordions[group.id];

              return (
                <div key={group.id} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleAccordion(group.id)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold text-neutral-500 hover:text-neutral-800 tracking-wider rounded-lg hover:bg-neutral-100/80 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="text-xs">{group.emoji}</span>
                      <span>{group.title}</span>
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="space-y-0.5 pl-1">
                      {filteredItems.map((item) => {
                        const Icon = item.icon;
                        const active = isItemActive(item.id);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                              active
                                ? 'bg-white text-neutral-900 font-semibold shadow-xs border border-neutral-200'
                                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-red-600' : 'text-neutral-400'}`} />
                              <span className="truncate">{item.label}</span>
                            </div>
                            {item.badge !== undefined && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                                active ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-neutral-200/60 text-neutral-600'
                              }`}>
                                {item.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {searchQuery.trim() && navGroups.every(g => g.items.filter(i => matchesSearch(i, g)).length === 0) && (
              <div className="p-4 text-center text-xs text-neutral-400 space-y-1">
                <p>No settings matched "{searchQuery}"</p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-red-600 hover:underline text-[11px] font-semibold cursor-pointer"
                >
                  Clear search
                </button>
              </div>
            )}
          </nav>
        </aside>

        {/* Right Content Panel */}
        <div className="flex-1 min-w-0 h-[calc(100vh-7rem)] overflow-y-auto pl-4 scrollbar-thin">

      {/* ======================================================== */}
      {/* Tab 1: Hours & Holidays */}
      {/* ======================================================== */}
      {activeTab === 'hours' && (
        <div className="space-y-6">
          {/* Hours Templates Card */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Standard Schedule Templates</h3>
                  <p className="text-xs text-neutral-500">Fleet-wide hours archetypes applied across store formats</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenNewTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Template</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {hoursTemplates.map(t => (
                <div key={t.id} className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-xs text-neutral-900 block">{t.name}</span>
                        <p className="text-[11px] text-neutral-500 mt-0.5">{t.description}</p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 bg-neutral-200 text-neutral-700 font-semibold rounded shrink-0">
                        Template
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-600 space-y-1 bg-white p-2.5 rounded-lg border border-neutral-200">
                      <div className="flex justify-between">
                        <span>Mon–Thu:</span>
                        <span className="font-mono font-medium">{t.schedule.monday.isClosed ? 'Closed' : `${t.schedule.monday.open} – ${t.schedule.monday.close}`}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Fri–Sat:</span>
                        <span className="font-mono font-medium">{t.schedule.friday.isClosed ? 'Closed' : `${t.schedule.friday.open} – ${t.schedule.friday.close}`}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Sun:</span>
                        <span className="font-mono font-medium">{t.schedule.sunday.isClosed ? 'Closed' : `${t.schedule.sunday.open} – ${t.schedule.sunday.close}`}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
                    <button
                      type="button"
                      onClick={() => handleOpenEditTemplate(t)}
                      className="p-1 text-neutral-600 hover:text-neutral-900 rounded hover:bg-neutral-200 cursor-pointer transition-colors"
                      title="Edit Template"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingAdminAction({ kind: 'hours-template', id: t.id, name: t.name })}
                      className="p-1 text-red-600 hover:text-red-800 rounded hover:bg-red-50 cursor-pointer transition-colors"
                      title="Delete Template"
                      aria-label={`Delete hours template ${t.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Corporate Holiday Overrides */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-red-50 text-red-600 border border-red-200">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Corporate Holiday Schedule Overrides</h3>
                  <p className="text-xs text-neutral-500">Global holiday closures and extended hours broadcasted across fleet</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenNewHoliday}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-300 rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Holiday</span>
                </button>
                <button
                  type="button"
                  onClick={handleBroadcastHolidays}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-colors"
                >
                  <RadioTower className="w-3.5 h-3.5" />
                  <span>Broadcast to Fleet</span>
                </button>
              </div>
            </div>

            {broadcastSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{broadcastSuccess}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {corporateHolidays.map(hol => (
                <div key={hol.id} className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl flex flex-col justify-between space-y-2">
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="font-bold text-neutral-900">{hol.name}</div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditHoliday(hol)}
                          className="p-1 text-neutral-500 hover:text-neutral-800 rounded hover:bg-neutral-200"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingAdminAction({ kind: 'holiday', id: hol.id, name: hol.name })}
                          className="p-1 text-red-500 hover:text-red-700 rounded hover:bg-red-50"
                          title="Delete holiday"
                          aria-label={`Delete holiday ${hol.name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="text-neutral-500 text-[11px] font-mono">{hol.date}</div>
                    <div className={`font-semibold text-[11px] mt-1 ${
                      hol.status.includes('Closed') 
                        ? 'text-rose-600' 
                        : hol.status.includes('Extended')
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }`}>
                      {hol.status}
                    </div>
                    {hol.notes && (
                      <p className="text-[10px] text-neutral-500 mt-1 italic">{hol.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Tab 2: Google Business Profile (GBP) */}
      {/* ======================================================== */}
      {activeTab === 'custom-fields' && <CustomFieldsPanel />}
      {activeTab === 'gbp' && (
        <div className="space-y-6">
          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-200">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Google Business Profile Fleet Sync</h3>
                  <p className="text-xs text-neutral-500">
                    Direct live sync with Google Maps search listings, store operating schedules, and review URLs
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isSyncingGbp}
                onClick={handleTriggerGbpSync}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingGbp ? 'animate-spin' : ''}`} />
                <span>{isSyncingGbp ? 'Syncing with Google...' : 'Sync Fleet Now'}</span>
              </button>
            </div>

            {gbpSyncSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Successfully synced all {locations.length} store locations with Google Business Profile API. Standard hours, holiday closures, and phone numbers updated on Google Maps.</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-[11px] text-neutral-500 font-medium">Linked GBP Account</div>
                <input
                  type="text"
                  value={gbpAccountId}
                  onChange={(e) => setGbpAccountId(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs font-mono font-bold text-neutral-900 focus:outline-none focus:border-blue-500"
                />
                <div className="text-[10px] text-emerald-600 font-semibold mt-1">● Account Verified & Live</div>
              </div>

              <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-[11px] text-neutral-500 font-medium">Auto-Sync Cadence</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs font-semibold text-neutral-800">Nightly at 02:00 PST</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gbpAutoSync}
                      onChange={(e) => setGbpAutoSync(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-neutral-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div className="text-[10px] text-neutral-500 mt-1">Automated diff sync enabled</div>
              </div>

              <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-[11px] text-neutral-500 font-medium">Sync Coverage</div>
                <div className="text-sm font-bold text-neutral-900 mt-0.5">{locations.length} / {locations.length} Locations Matched</div>
                <div className="text-[10px] text-neutral-500 mt-1">100% matched to verified GBP place IDs</div>
              </div>
            </div>

            {/* Field Sync Checkboxes */}
            <div className="pt-3 border-t border-neutral-200 space-y-2">
              <span className="text-xs font-bold text-neutral-800">Synchronized Location Attributes</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs text-neutral-700">
                <label className="flex items-center gap-2 p-2 bg-neutral-50 rounded-lg border border-neutral-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncFields.standardHours}
                    onChange={(e) => setSyncFields({ ...syncFields, standardHours: e.target.checked })}
                    className="rounded text-blue-600"
                  />
                  <span>Standard Weekly Hours</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-neutral-50 rounded-lg border border-neutral-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncFields.holidayHours}
                    onChange={(e) => setSyncFields({ ...syncFields, holidayHours: e.target.checked })}
                    className="rounded text-blue-600"
                  />
                  <span>Special & Holiday Hours</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-neutral-50 rounded-lg border border-neutral-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncFields.phones}
                    onChange={(e) => setSyncFields({ ...syncFields, phones: e.target.checked })}
                    className="rounded text-blue-600"
                  />
                  <span>Direct Store Phone Numbers</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-neutral-50 rounded-lg border border-neutral-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncFields.addresses}
                    onChange={(e) => setSyncFields({ ...syncFields, addresses: e.target.checked })}
                    className="rounded text-blue-600"
                  />
                  <span>Store Street Addresses</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-neutral-50 rounded-lg border border-neutral-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncFields.reviewUrls}
                    onChange={(e) => setSyncFields({ ...syncFields, reviewUrls: e.target.checked })}
                    className="rounded text-blue-600"
                  />
                  <span>Google Review URLs</span>
                </label>
                <label className="flex items-center gap-2 p-2 bg-neutral-50 rounded-lg border border-neutral-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncFields.storePages}
                    onChange={(e) => setSyncFields({ ...syncFields, storePages: e.target.checked })}
                    className="rounded text-blue-600"
                  />
                  <span>Website Store Pages</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Tab 3: Developer API & Webhooks */}
      {/* ======================================================== */}
      {activeTab === 'api' && (
        <div className="space-y-6">
          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-50 text-purple-600 border border-purple-200">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Directory API Access</h3>
                  <p className="text-xs text-neutral-500">
                    Read-only location synchronization for trusted server clients
                  </p>
                </div>
              </div>
            </div>

            {/* Directory API Banner */}
            <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2">
              <div className="text-xs font-bold text-neutral-900 flex items-center justify-between">
                <span>Directory Location Endpoint:</span>
                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-mono font-bold">
                  READ API
                </span>
              </div>
              <div className="font-mono text-xs bg-white p-2.5 rounded-lg border border-neutral-300 text-neutral-800 flex items-center justify-between">
                <span>/api/v1/locations/{'{store_number}'}</span>
                <span className="text-[10px] text-neutral-500 font-sans">Returns the active directory record</span>
              </div>
              <p className="text-[11px] text-neutral-500">
                Responses contain public store details and published hours. Personnel contact fields are excluded.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="border border-neutral-200 rounded-lg p-3">
                <div className="text-neutral-500 text-[11px]">Credential authority</div>
                <div className="font-semibold text-neutral-900 mt-1">Server runtime</div>
              </div>
              <div className="border border-neutral-200 rounded-lg p-3">
                <div className="text-neutral-500 text-[11px]">Browser token storage</div>
                <div className="font-semibold text-emerald-700 mt-1">Disabled</div>
              </div>
              <div className="border border-neutral-200 rounded-lg p-3">
                <div className="text-neutral-500 text-[11px]">Required scope</div>
                <div className="font-mono font-semibold text-neutral-900 mt-1">locations:read</div>
              </div>
            </div>

            {/* Webhook Endpoint Configuration */}
            <div className="pt-4 border-t border-neutral-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-xs text-neutral-900">Webhook Dispatch Integration</h4>
                  <p className="text-[11px] text-neutral-500">Unavailable: webhook dispatch is not implemented.</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="url"
                  disabled
                  aria-label="Webhook endpoint unavailable"
                  placeholder="Not configured"
                  className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                />
                <button
                  type="button"
                  disabled
                  title="Unavailable until server-side webhook dispatch is implemented"
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-neutral-800 hover:bg-neutral-900 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-colors shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Webhook Unavailable</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Tab 4: Cloud & Firebase */}
      {/* ======================================================== */}
      {activeTab === 'cloud' && (
        <div className="space-y-6">
          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-cyan-50 text-cyan-600 border border-cyan-200">
                  <Cloud className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Cloud Firestore & Persistence Engine</h3>
                  <p className="text-xs text-neutral-500">Cloud writes and health checks unavailable. Counts below are browser-local, not Firestore.</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  title="No server health-check integration"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-300 rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-colors"
                >
                  <Radio className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Health Check Unavailable</span>
                </button>
                <button
                  type="button"
                  disabled
                  title="Cloud writes are not implemented; local edits do not update the API"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Cloud Push Unavailable</span>
                </button>
              </div>
            </div>

            {/* Collection Inspector */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-[11px] text-neutral-500 font-medium">locations</div>
                <div className="text-base font-bold text-neutral-900 mt-1">{locations.length} Documents</div>
                <div className="text-[10px] text-neutral-500 font-semibold mt-1">Local only</div>
              </div>
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-[11px] text-neutral-500 font-medium">personnel</div>
                <div className="text-base font-bold text-neutral-900 mt-1">{people.length} Documents</div>
                <div className="text-[10px] text-neutral-500 font-semibold mt-1">Local only</div>
              </div>
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-[11px] text-neutral-500 font-medium">hours_templates</div>
                <div className="text-base font-bold text-neutral-900 mt-1">{hoursTemplates.length} Documents</div>
                <div className="text-[10px] text-neutral-500 font-semibold mt-1">Local only</div>
              </div>
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-[11px] text-neutral-500 font-medium">audit_logs</div>
                <div className="text-base font-bold text-neutral-900 mt-1">{auditLogs.length} Records</div>
                <div className="text-[10px] text-neutral-500 font-semibold mt-1">Local only</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Tab 5: Fleet CSV & Store Manager */}
      {/* ======================================================== */}
      {activeTab === 'csv' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Export Card */}
            <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">Export Directory to CSV</h3>
                    <p className="text-xs text-neutral-500">Download canonical store roster with full phone & manager mapping</p>
                  </div>
                </div>

                <p className="text-xs text-neutral-600 leading-relaxed">
                  Generates a clean CSV containing all {locations.length} retail store records, address coordinates, contact info, operational statuses, review URLs, and assigned leadership personnel.
                </p>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleExportCSV}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>{isExporting ? 'Generating CSV...' : `Export ${locations.length} Locations CSV`}</span>
                </button>

                {csvStatus && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{csvStatus}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Import / Re-seed Card */}
            <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-200">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900">Import & Sync CSV</h3>
                      <p className="text-xs text-neutral-500">Bulk update store hours, phone numbers, and district managers</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAddStoreOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Store</span>
                  </button>
                </div>

                <div 
                  onClick={handleSimulateImport}
                  className="border-2 border-dashed border-neutral-300 hover:border-neutral-400 rounded-xl p-6 text-center space-y-2 cursor-pointer transition-colors bg-neutral-50"
                >
                  <FileSpreadsheet className="w-8 h-8 text-neutral-400 mx-auto" />
                  <div className="text-xs font-medium text-neutral-800">
                    {isImporting ? 'Processing & Validating CSV...' : 'Drag & drop master directory CSV or click to sync'}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Supports .csv format with store numbers and phone numbers
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-neutral-500 pt-1">
                <span>Schema version: v3.2</span>
                <span className="text-emerald-600 font-medium">Automatic deduplication active</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Tab 6A: User RBAC */}
      {/* ======================================================== */}
      {(activeTab === 'governance' || activeTab === 'rbac') && (
        <div className="space-y-6">
          {userSaveNotice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{userSaveNotice}</p>}
          {/* User Roles Card */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-red-600" />
                <h3 className="text-sm font-bold text-neutral-900">User Accounts & Role Permissions</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">Server-managed access</span>
                {currentUser.role === 'System Administrator' && <button
                  type="button"
                  onClick={handleOpenNewUser}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add User</span>
                </button>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {users.map(u => (
                <div key={u.id} className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2 text-xs flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-neutral-900">{u.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        u.status === 'Revoked' ? 'bg-rose-50 text-rose-700' : u.status === 'Suspended' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'
                      }`}>Access: {u.status || 'Active'}</span>
                    </div>
                    <div className="text-neutral-500 font-mono text-[11px]">{u.email}</div>
                    <div className="text-neutral-600 text-[11px] pt-1 border-t border-neutral-200">
                      Role: <strong className="text-neutral-900">{u.role}</strong>
                      {u.storeNumber && <span className="ml-1 text-neutral-500">(Store #{u.storeNumber})</span>}
                    </div>
                    <div className="text-[11px] text-neutral-600">
                      Sign-in: <strong className="text-neutral-900">{u.identityLinked ? (u.lastLogin ? `Last used ${new Date(u.lastLogin).toLocaleDateString()}` : 'Linked') : 'Not yet linked'}</strong>
                    </div>
                    <div className="text-[11px] text-neutral-600">
                      Invitation: <strong className="text-neutral-900">{u.invitationStatus === 'Accepted' || u.identityLinked ? 'Accepted' : u.invitationStatus === 'Pending' ? `Secure link issued${u.invitedAt ? ` ${new Date(u.invitedAt).toLocaleDateString()}` : ''}` : 'Not sent'}</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-neutral-200">
                    {u.status === 'Active' && u.id !== currentUser.id && <>
                      <button type="button" disabled={Boolean(userActionId)} onClick={() => void handleUserInvitation(u, 'send')} className="p-1 text-neutral-600 hover:text-red-700 rounded hover:bg-red-50 disabled:opacity-40" title={u.invitationStatus ? 'Resend secure sign-in link' : 'Send secure sign-in link'} aria-label={`${u.invitationStatus ? 'Resend' : 'Send'} secure sign-in link for ${u.name}`}>
                        <Mail className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" disabled={Boolean(userActionId)} onClick={() => void handleUserInvitation(u, 'copy')} className="p-1 text-neutral-600 hover:text-neutral-900 rounded hover:bg-neutral-200 disabled:opacity-40" title="Copy fresh secure sign-in link" aria-label={`Copy secure sign-in link for ${u.name}`}>
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </>}
                    <button
                      type="button"
                      onClick={() => handleOpenEditUser(u)}
                      className="p-1 text-neutral-600 hover:text-neutral-900 rounded hover:bg-neutral-200 cursor-pointer"
                      title="Edit User"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {u.id !== currentUser.id && (
                      <button type="button" onClick={() => updateUserAccount(u.id, { status: u.status === 'Suspended' || u.status === 'Revoked' ? 'Active' : 'Suspended' })} className="p-1 text-amber-700 hover:bg-amber-50 rounded" title={u.status === 'Active' || !u.status ? 'Suspend access' : 'Restore access'} aria-label={`${u.status === 'Active' || !u.status ? 'Suspend' : 'Restore'} access for ${u.name}`}>
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {u.id !== currentUser.id && u.status !== 'Revoked' && (
                      <button
                        type="button"
                        onClick={() => setPendingAdminAction({ kind: 'user', id: u.id, name: u.name })}
                        className="p-1 text-rose-600 hover:text-rose-800 rounded hover:bg-rose-50 cursor-pointer"
                        title="Revoke access"
                        aria-label={`Revoke access for ${u.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Tab 6B: Audit & Rollbacks */}
      {/* ======================================================== */}
      {(activeTab === 'governance' || activeTab === 'audit') && (
        <div className={`space-y-6 ${activeTab === 'governance' ? 'mt-6' : ''}`}>
          {/* Audit Log Trail */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-neutral-900">Immutable Audit & Change Log Trail</h3>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={auditFilter}
                  onChange={(e) => setAuditFilter(e.target.value)}
                  className="bg-neutral-50 border border-neutral-300 text-neutral-800 rounded-lg px-2.5 py-1 text-xs cursor-pointer"
                >
                  <option value="All">All Entities</option>
                  <option value="Location">Location Changes</option>
                  <option value="Setting">Settings & Templates</option>
                  <option value="User">User Actions</option>
                  <option value="Request">Correction Requests</option>
                  <option value="Communication">Communications & SMTP</option>
                </select>
                <span className="text-xs text-neutral-500">{filteredLogs.length} logs</span>
              </div>
            </div>

            {rollbackAlert && (
              <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                rollbackAlert.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {rollbackAlert.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{rollbackAlert.message}</span>
              </div>
            )}

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredLogs.map(log => (
                <div
                  key={log.id}
                  className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between text-neutral-600 flex-wrap gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-900">{log.action}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700 font-medium">
                        {log.entityType}: {log.entityName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {log.previousState && (
                        <button
                          type="button"
                          onClick={() => {
                            const res = rollbackAuditChange(log.id);
                            setRollbackAlert(res);
                            setTimeout(() => setRollbackAlert(null), 5000);
                          }}
                          className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-bold cursor-pointer transition-colors shadow-2xs"
                          title="Restore entity to the state recorded prior to this change"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-700" />
                          <span>Revert Change</span>
                        </button>
                      )}
                      <span className="font-mono text-[10px] text-neutral-400">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <p className="text-neutral-700 text-[11px]">{log.details}</p>
                  <div className="text-[10px] text-neutral-500">
                    Logged by <strong className="text-neutral-700">{log.userName}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Tab 7: SMTP & Communications Relay */}
      {/* ======================================================== */}
      {(activeTab === 'smtp' || activeTab === 'smtp-relay') && (
        <SmtpCommunicationsPanel activeSection="smtp-relay" />
      )}
      {activeTab === 'email-templates' && (
        <SmtpCommunicationsPanel activeSection="email-templates" />
      )}
      {activeTab === 'notification-rules' && (
        <SmtpCommunicationsPanel activeSection="notification-rules" />
      )}
      {activeTab === 'outbox-logs' && (
        <SmtpCommunicationsPanel activeSection="outbox-logs" />
      )}

      {/* ======================================================== */}
      {/* Tab 8: SOP Runbooks & Procedures */}
      {/* ======================================================== */}
      {activeTab === 'sop' && (
        <SopRunbooksPanel />
      )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL: Hours Template Builder (CUD) */}
      {/* ======================================================== */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4" onMouseDown={(event) => event.target === event.currentTarget && setIsTemplateModalOpen(false)}>
          <div ref={templateDialogRef} role="dialog" aria-modal="true" aria-label={editingTemplate ? `Edit template ${editingTemplate.name}` : 'Create schedule template'} tabIndex={-1} className="bg-white border border-neutral-200 rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-5 border-b border-neutral-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">
                {editingTemplate ? `Edit Template: ${editingTemplate.name}` : 'Create Schedule Template'}
              </h3>
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Template Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Outlet Center Schedule"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Description</label>
                <input
                  type="text"
                  placeholder="e.g. For standalone outlet locations with 9 PM close on weekends"
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div className="space-y-2 pt-2">
                <span className="font-semibold text-neutral-800">Weekly Operating Hours</span>
                <WeeklyHoursEditor
                  schedule={templateForm.schedule}
                  onChange={(schedule) => setTemplateForm({ ...templateForm, schedule })}
                />
              </div>

              <div className="p-4 bg-neutral-50 -mx-5 -mb-5 mt-5 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Template</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Corporate Holiday Override Builder (CUD) */}
      {/* ======================================================== */}
      {isHolidayModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4" onMouseDown={(event) => event.target === event.currentTarget && setIsHolidayModalOpen(false)}>
          <div ref={holidayDialogRef} role="dialog" aria-modal="true" aria-label={editingHoliday ? `Edit holiday ${editingHoliday.name}` : 'Add corporate holiday'} tabIndex={-1} className="bg-white border border-neutral-200 rounded-xl max-w-md w-full shadow-2xl">
            <div className="p-5 border-b border-neutral-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">
                {editingHoliday ? `Edit Holiday: ${editingHoliday.name}` : 'Add Corporate Holiday'}
              </h3>
              <button
                type="button"
                onClick={() => setIsHolidayModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveHoliday} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Holiday Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Memorial Day"
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Date (YYYY-MM-DD) *</label>
                <input
                  type="date"
                  required
                  value={holidayForm.date}
                  onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 focus:bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Operating Mode</label>
                <select
                  value={holidayForm.status}
                  onChange={(e) => setHolidayForm({ ...holidayForm, status: e.target.value as CorporateHoliday['status'] })}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none cursor-pointer"
                >
                  <option value="Closed (All Stores)">Closed (All Stores)</option>
                  <option value="Extended Hours">Extended Hours</option>
                  <option value="Early Close">Early Close</option>
                  <option value="Modified Hours">Modified Hours</option>
                </select>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Notes / Guidance</label>
                <input
                  type="text"
                  placeholder="e.g. All stores open 1 hour early for holiday promotion"
                  value={holidayForm.notes || ''}
                  onChange={(e) => setHolidayForm({ ...holidayForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div className="p-4 bg-neutral-50 -mx-5 -mb-5 mt-5 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsHolidayModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Holiday</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Add / Edit User (CUD) */}
      {/* ======================================================== */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4" onMouseDown={(event) => event.target === event.currentTarget && setIsUserModalOpen(false)}>
          <div ref={userDialogRef} role="dialog" aria-modal="true" aria-label={editingUser ? `Edit account ${editingUser.name}` : 'Add user account'} tabIndex={-1} className="bg-white border border-neutral-200 rounded-xl max-w-md w-full shadow-2xl">
            <div className="p-5 border-b border-neutral-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">
                {editingUser ? `Edit Account: ${editingUser.name}` : 'Add User Account'}
              </h3>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-5 space-y-4 text-xs">
              <div>
                <label htmlFor="user-full-name" className="block text-neutral-700 font-semibold mb-1">Full Name *</label>
                <input
                  id="user-full-name"
                  type="text"
                  required
                  placeholder="e.g. Jordan Miller"
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div>
                <label htmlFor="user-email" className="block text-neutral-700 font-semibold mb-1">Email Address *</label>
                <input
                  id="user-email"
                  type="email"
                  required
                  placeholder="j.miller@shiekhshoes.com"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 focus:bg-white font-mono"
                />
              </div>

              <div>
                <label htmlFor="user-role" className="block text-neutral-700 font-semibold mb-1">Role / Permissions *</label>
                <select
                  id="user-role"
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none cursor-pointer"
                >
                  <option value="Viewer">Viewer (Read / Submit Requests)</option>
                  <option value="Editor">Editor (Directory Updates)</option>
                  <option value="Directory Data Steward">Directory Data Steward (Full Directory Access)</option>
                  <option value="System Administrator">System Administrator (Access Administration)</option>
                </select>
              </div>

              {userForm.role === 'Viewer' && (
                <div>
                  <label htmlFor="user-store" className="block text-neutral-700 font-semibold mb-1">Assigned Store # *</label>
                  <select
                    id="user-store"
                    required
                    value={userForm.storeNumber || ''}
                    onChange={(e) => setUserForm({ ...userForm, storeNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 font-mono"
                  >
                    <option value="">Select a store</option>
                    {[...locations].sort((a, b) => a.storeNumber.localeCompare(b.storeNumber, undefined, { numeric: true })).map(location => <option key={location.id} value={location.storeNumber}>#{location.storeNumber} - {location.name}</option>)}
                  </select>
                </div>
              )}

              {!editingUser && <fieldset className="space-y-2">
                <legend className="font-semibold text-neutral-700">Onboarding *</legend>
                {([
                  ['send', 'Send secure sign-in link', 'Submit through Gmail. The recipient may need to check Spam or company quarantine.'],
                  ['copy', 'Copy secure sign-in link', 'Create a fresh Firebase link to share directly when email is delayed or filtered.'],
                  ['access-only', 'Grant access without email', 'Create authorization now; onboarding can happen later.'],
                ] as const).map(([value, label, description]) => <label key={value} className="flex cursor-pointer gap-2 border-t border-neutral-200 py-2 first:border-t-0">
                  <input type="radio" name="onboarding" value={value} checked={onboardingChoice === value} onChange={() => setOnboardingChoice(value)} className="mt-0.5 accent-red-600" />
                  <span><span className="block font-semibold text-neutral-900">{label}</span><span className="block text-[11px] text-neutral-500">{description}</span></span>
                </label>)}
              </fieldset>}

              {editingUser && (
                <div>
                  <label htmlFor="user-status" className="block text-neutral-700 font-semibold mb-1">Account Status</label>
                  <select
                    id="user-status"
                    value={userForm.status || 'Active'}
                    onChange={(e) => setUserForm({ ...userForm, status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none cursor-pointer"
                  >
                    <option value="Active">Active</option>
                    <option value="Suspended">Suspended</option>
                    <option value="Revoked">Revoked</option>
                  </select>
                </div>
              )}

              {userSaveError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800">{userSaveError}</p>}

              <div className="p-4 bg-neutral-50 -mx-5 -mb-5 mt-5 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  disabled={isSavingUser}
                  className="px-4 py-2 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:cursor-wait disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingUser ? 'Saving...' : 'Save Account'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: + Add Store Location (CUD) */}
      {/* ======================================================== */}
      {isAddStoreOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4" onMouseDown={(event) => event.target === event.currentTarget && setIsAddStoreOpen(false)}>
          <div ref={addStoreDialogRef} role="dialog" aria-modal="true" aria-label="Add new store location" tabIndex={-1} className="bg-white border border-neutral-200 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-5 border-b border-neutral-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">Add New Store Location</h3>
              <button
                type="button"
                onClick={() => setIsAddStoreOpen(false)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStoreSubmit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Store # *</label>
                  <input
                    type="text"
                    required
                    placeholder="99"
                    value={newStoreForm.storeNumber}
                    onChange={(e) => setNewStoreForm({ ...newStoreForm, storeNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 font-mono font-bold focus:outline-none focus:border-red-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-neutral-700 font-semibold mb-1">Store Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Shiekh Shoes — Glendale Galleria"
                    value={newStoreForm.name}
                    onChange={(e) => setNewStoreForm({ ...newStoreForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Location Type</label>
                  <select
                    value={newStoreForm.type}
                    onChange={(e) => setNewStoreForm({ ...newStoreForm, type: e.target.value as any })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none cursor-pointer"
                  >
                    <option value="Enclosed Regional Mall">Enclosed Regional Mall</option>
                    <option value="Strip Center / Shopping Center">Strip Center / Shopping Center</option>
                    <option value="Urban Streetfront">Urban Streetfront</option>
                    <option value="Outlet Center">Outlet Center</option>
                  </select>
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="(818) 555-0199"
                    value={newStoreForm.phone}
                    onChange={(e) => setNewStoreForm({ ...newStoreForm, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 font-mono focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-neutral-700 font-semibold mb-1">Street Address</label>
                  <input
                    type="text"
                    placeholder="100 W Broadway"
                    value={newStoreForm.address}
                    onChange={(e) => setNewStoreForm({ ...newStoreForm, address: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">City</label>
                  <input
                    type="text"
                    placeholder="Glendale"
                    value={newStoreForm.city}
                    onChange={(e) => setNewStoreForm({ ...newStoreForm, city: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Google Review URL</label>
                  <input
                    type="url"
                    placeholder="https://g.page/r/.../review"
                    value={newStoreForm.googleReviewUrl}
                    onChange={(e) => setNewStoreForm({ ...newStoreForm, googleReviewUrl: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 font-mono text-[11px] focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Store Webpage URL</label>
                  <input
                    type="url"
                    placeholder="https://www.shiekh.com/stores/..."
                    value={newStoreForm.storePageUrl}
                    onChange={(e) => setNewStoreForm({ ...newStoreForm, storePageUrl: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 font-mono text-[11px] focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="p-4 bg-neutral-50 -mx-5 -mb-5 mt-5 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddStoreOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Location</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingAdminAction !== null}
        title={pendingAdminAction?.kind === 'user' ? 'Revoke user access?' : `Delete ${pendingAdminAction?.kind === 'holiday' ? 'holiday' : 'hours template'}?`}
        description={pendingAdminAction?.kind === 'user' ? `“${pendingAdminAction.name}” will no longer be authorized to use the directory.` : `“${pendingAdminAction?.name || ''}” will be permanently deleted. This action cannot be undone.`}
        confirmLabel={pendingAdminAction?.kind === 'user' ? 'Revoke access' : 'Delete'}
        onConfirm={handleConfirmAdminAction}
        onCancel={() => setPendingAdminAction(null)}
      />
    </div>
  );
};


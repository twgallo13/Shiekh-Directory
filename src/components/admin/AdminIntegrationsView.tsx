import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Database, 
  History, 
  Mail, 
  Users, 
  FileSpreadsheet, 
  Zap, 
  Code2,
  HardDrive,
  UserCheck,
  BookOpen,
  Award,
  Globe,
  Cloud,
  Clock
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { AuditRollbackPanel } from './AuditRollbackPanel';
import { UserManagementPanel } from './UserManagementPanel';
import { SmtpConfigPanel } from './SmtpConfigPanel';
import { MigrationImportPanel } from './MigrationImportPanel';
import { ApiClientsPanel } from './ApiClientsPanel';
import { BackupRecoveryPanel } from './BackupRecoveryPanel';
import { StewardVerificationPanel } from './StewardVerificationPanel';
import { SopKnowledgeBasePanel } from './SopKnowledgeBasePanel';
import { CutoverSignoffModal } from './CutoverSignoffModal';
import { GbpSyncPanel } from './GbpSyncPanel';
import { CloudInfrastructurePanel } from './CloudInfrastructurePanel';
import { HoursTemplateManagerPanel } from './HoursTemplateManagerPanel';
import { EmailTemplatesPanel } from './EmailTemplatesPanel';

export const AdminIntegrationsView: React.FC = () => {
  const { 
    apiClients, 
    triggerApiSync,
    locations,
    currentUser,
    cloudSyncStatus,
    emailTemplates
  } = useDirectory();

  const [activeTab, setActiveTab] = useState<'cloud' | 'steward' | 'templates' | 'email_templates' | 'gbp' | 'sops' | 'audit' | 'users' | 'smtp' | 'migration' | 'api' | 'backup'>('cloud');
  const [syncAllStatus, setSyncAllStatus] = useState<'idle' | 'syncing' | 'completed'>('idle');
  const [isSignoffModalOpen, setIsSignoffModalOpen] = useState(false);

  const quarantinedCount = locations.filter(l => 
    l.storeManagerPhoneVisibility === 'Pending Review' || l.isStoreManagerPhoneVerified === false
  ).length;

  const handleSyncAll = async () => {
    setSyncAllStatus('syncing');
    for (const client of apiClients) {
      triggerApiSync(client.id);
    }
    await new Promise(r => setTimeout(r, 800));
    setSyncAllStatus('completed');
    setTimeout(() => setSyncAllStatus('idle'), 2500);
  };

  const navGroups: {
    category: string;
    items: {
      id: typeof activeTab;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      badge?: number | string;
      isWarning?: boolean;
      isPulse?: boolean;
    }[];
  }[] = [
    {
      category: 'Governance & Approvals',
      items: [
        { 
          id: 'steward', 
          label: 'Data Steward Queue', 
          icon: UserCheck, 
          badge: quarantinedCount > 0 ? quarantinedCount : undefined, 
          isWarning: quarantinedCount > 0 
        },
        { 
          id: 'audit', 
          label: 'Audit & Rollbacks', 
          icon: History 
        },
      ],
    },
    {
      category: 'System & Access',
      items: [
        { 
          id: 'users', 
          label: 'User Onboarding & RBAC', 
          icon: Users 
        },
        { 
          id: 'cloud', 
          label: 'Cloud & Firebase', 
          icon: Cloud, 
          isPulse: cloudSyncStatus === 'syncing' 
        },
        { 
          id: 'api', 
          label: 'Directory API & Service Keys', 
          icon: Code2 
        },
        { 
          id: 'backup', 
          label: 'Backup & Disaster Recovery', 
          icon: HardDrive 
        },
      ],
    },
    {
      category: 'Communications',
      items: [
        { 
          id: 'smtp', 
          label: 'SMTP & Notifications', 
          icon: Mail 
        },
        { 
          id: 'email_templates', 
          label: 'Transactional Emails', 
          icon: Mail, 
          badge: emailTemplates.length > 0 ? emailTemplates.length : undefined 
        },
      ],
    },
    {
      category: 'Data & Integrations',
      items: [
        { 
          id: 'templates', 
          label: 'Hours Templates', 
          icon: Clock 
        },
        { 
          id: 'gbp', 
          label: 'Google Business Profile', 
          icon: Globe 
        },
        { 
          id: 'migration', 
          label: 'CSV Migration Pipeline', 
          icon: FileSpreadsheet 
        },
      ],
    },
    {
      category: 'Documentation',
      items: [
        { 
          id: 'sops', 
          label: 'Admin SOPs & Runbooks', 
          icon: BookOpen 
        },
      ],
    },
  ];

  return (
    <div className="space-y-5" id="admin-integrations-view">
      {/* Top Banner */}
      <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-red-600" />
            <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              System Administration & SoR Governance Console
            </h1>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Authoritative Master System of Record governance: Steward verification queue, Google Business Profile API sync, Administrator SOP runbooks, Audit rollback, User onboarding, SMTP relay, CSV migration, Scoped API keys, and Point-in-time SoR Backups.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="cutover-signoff-btn"
            onClick={() => setIsSignoffModalOpen(true)}
            className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <Award className="w-3.5 h-3.5 text-amber-400 dark:text-amber-600" />
            <span>Cutover Sign-Off</span>
          </button>

          <button
            id="dispatch-webhook-sync-btn"
            onClick={handleSyncAll}
            disabled={syncAllStatus === 'syncing'}
            className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-neutral-400 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <Zap className={`w-3.5 h-3.5 ${syncAllStatus === 'syncing' ? 'animate-spin' : ''}`} />
            <span>{syncAllStatus === 'syncing' ? 'Broadcasting...' : syncAllStatus === 'completed' ? 'Dispatched to All Clients!' : 'Dispatch Webhook Sync'}</span>
          </button>
        </div>
      </div>

      {/* Two-Column Layout: Left Vertical Sub-Navigation, Right Content Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Sub-Navigation */}
        <div id="admin-subnav-sidebar" className="lg:col-span-3 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 shadow-xs space-y-4">
          {navGroups.map(group => (
            <div key={group.category} className="space-y-1">
              <div className="text-[10px] font-bold tracking-wider uppercase text-neutral-400 dark:text-neutral-500 px-2.5 pt-1.5 pb-0.5">
                {group.category}
              </div>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      id={`admin-nav-item-${item.id}`}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left cursor-pointer ${
                        isActive
                          ? 'bg-red-600 text-white shadow-xs font-bold'
                          : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800/70'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-neutral-400 dark:text-neutral-500'}`} />
                        <span className="truncate">{item.label}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {item.isPulse && (
                          <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : 'bg-amber-500'} animate-pulse`} />
                        )}
                        {item.badge !== undefined && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                              isActive
                                ? 'bg-white/25 text-white'
                                : item.isWarning
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: Active Content Panel */}
        <div id="admin-content-panel" className="lg:col-span-9 min-w-0">
          {activeTab === 'cloud' && <CloudInfrastructurePanel />}
          {activeTab === 'steward' && <StewardVerificationPanel />}
          {activeTab === 'templates' && <HoursTemplateManagerPanel />}
          {activeTab === 'email_templates' && <EmailTemplatesPanel />}
          {activeTab === 'gbp' && <GbpSyncPanel />}
          {activeTab === 'sops' && <SopKnowledgeBasePanel />}
          {activeTab === 'audit' && <AuditRollbackPanel />}
          {activeTab === 'users' && <UserManagementPanel />}
          {activeTab === 'smtp' && <SmtpConfigPanel />}
          {activeTab === 'migration' && <MigrationImportPanel />}
          {activeTab === 'api' && <ApiClientsPanel />}
          {activeTab === 'backup' && <BackupRecoveryPanel />}
        </div>
      </div>

      {/* Cutover Sign-Off Modal */}
      <CutoverSignoffModal
        isOpen={isSignoffModalOpen}
        onClose={() => setIsSignoffModalOpen(false)}
      />
    </div>
  );
};


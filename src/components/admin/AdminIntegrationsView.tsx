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

  return (
    <div className="space-y-5">
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
            onClick={() => setIsSignoffModalOpen(true)}
            className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
          >
            <Award className="w-3.5 h-3.5 text-amber-400 dark:text-amber-600" />
            <span>Cutover Sign-Off</span>
          </button>

          <button
            onClick={handleSyncAll}
            disabled={syncAllStatus === 'syncing'}
            className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-neutral-400 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
          >
            <Zap className={`w-3.5 h-3.5 ${syncAllStatus === 'syncing' ? 'animate-spin' : ''}`} />
            <span>{syncAllStatus === 'syncing' ? 'Broadcasting...' : syncAllStatus === 'completed' ? 'Dispatched to All Clients!' : 'Dispatch Webhook Sync'}</span>
          </button>
        </div>
      </div>

      {/* Admin Tabs */}
      <div className="flex items-center gap-1.5 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto pb-1 text-xs font-bold">
        {[
          { id: 'cloud', label: 'Cloud & Firebase (Sec 16)', icon: Cloud, highlight: cloudSyncStatus === 'syncing' },
          { id: 'steward', label: `Data Steward Queue ${quarantinedCount > 0 ? `(${quarantinedCount})` : ''}`, icon: UserCheck, highlight: quarantinedCount > 0 },
          { id: 'templates', label: 'Hours Templates (DISPATCH-012)', icon: Clock },
          { id: 'email_templates', label: `Transactional Emails (${emailTemplates.length})`, icon: Mail },
          { id: 'gbp', label: 'Google Business Profile (Sec 14)', icon: Globe },
          { id: 'sops', label: 'Admin SOPs & Runbooks (Sec 22)', icon: BookOpen },
          { id: 'audit', label: 'Audit & Rollbacks (Sec 22)', icon: History },
          { id: 'users', label: 'User Onboarding & RBAC (Sec 9)', icon: Users },
          { id: 'smtp', label: 'SMTP & Notifications (Sec 10A)', icon: Mail },
          { id: 'migration', label: 'CSV Migration Pipeline (Sec 16)', icon: FileSpreadsheet },
          { id: 'api', label: 'Directory API & Service Keys (Sec 14)', icon: Code2 },
          { id: 'backup', label: 'Backup & Disaster Recovery (Sec 22)', icon: HardDrive },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-2 rounded-t-lg transition-all flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
                isActive
                  ? 'border-red-600 text-red-600 dark:text-red-400 bg-white dark:bg-neutral-900 shadow-2xs'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.highlight && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div>
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

      {/* Cutover Sign-Off Modal */}
      <CutoverSignoffModal
        isOpen={isSignoffModalOpen}
        onClose={() => setIsSignoffModalOpen(false)}
      />
    </div>
  );
};


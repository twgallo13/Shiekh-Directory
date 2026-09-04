import React, { useState } from 'react';
import { 
  BookOpen, 
  Key, 
  HardDrive, 
  Mail, 
  ShieldCheck, 
  Printer, 
  Copy, 
  Check, 
  Terminal, 
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Lock,
  Layers,
  FileText
} from 'lucide-react';

interface SopDoc {
  id: string;
  code: string;
  title: string;
  category: string;
  icon: any;
  summary: string;
  targetRole: string;
  steps: { title: string; instruction: string; command?: string }[];
  emergencyContacts: string;
}

const SOPS: SopDoc[] = [
  {
    id: 'sop-001',
    code: 'SOP-001',
    title: 'API Service Token Rotation & Revocation Procedure',
    category: 'Security & API Infrastructure',
    icon: Key,
    summary: 'Standard protocol for scheduled quarterly rotation and immediate emergency revocation of downstream API service keys (e.g. Shiekh.com Store Locator, ERP/POS gateway).',
    targetRole: 'System Administrator',
    steps: [
      {
        title: '1. Access API Client Console',
        instruction: 'Navigate to Admin Console → Directory API & Service Keys (Sec 14). Locate the active client requiring rotation (e.g., Shiekh.com Web Locator).'
      },
      {
        title: '2. Initiate Secret Key Rotation',
        instruction: 'Click the "Rotate Key" button. The system generates a cryptographically secure 256-bit token (prefixed with `shk_live_`).'
      },
      {
        title: '3. Secure Distribution (Zero-Downtime Grace Period)',
        instruction: 'Copy the one-time plaintext key. Transmit securely via corporate password vault / encrypted secret manager to downstream tech leads (Store Locator engineering team or POS vendor).'
      },
      {
        title: '4. Environment Variable Replacement',
        instruction: 'Update the downstream service environment configuration with the new bearer token.',
        command: 'export SHIEKH_DIRECTORY_API_KEY="shk_live_web_loc_..."'
      },
      {
        title: '5. Webhook Handshake Verification',
        instruction: 'Use the API Endpoint Explorer to trigger a live GET request using the newly issued token and confirm HTTP 200 OK with accurate `last_updated` payload.'
      },
      {
        title: '6. Revocation of Deprecated or Compromised Tokens',
        instruction: 'If a token has been exposed or decommissioned, click "Revoke Key". Access is severed globally across all edge endpoints within 0 milliseconds.'
      }
    ],
    emergencyContacts: 'Security Team: security@shiekhshoes.com | SysAdmin Lead: theo@shiekhshoes.org'
  },
  {
    id: 'sop-002',
    code: 'SOP-002',
    title: 'Point-in-Time Database Backup & Disaster Recovery Rollback',
    category: 'Data Durability & High Availability',
    icon: HardDrive,
    summary: 'Procedures for automated snapshot scheduling, off-site JSON cold backup exports, and zero-data-loss rollback to previous verified states.',
    targetRole: 'System Administrator / Data Steward',
    steps: [
      {
        title: '1. Verify Automated Snapshots',
        instruction: 'The Master System of Record generates automated snapshots every 60 minutes. Open Admin Console → Backup & Disaster Recovery to check snapshot integrity.'
      },
      {
        title: '2. Execute Manual Snapshot Prior to Bulk Operations',
        instruction: 'Before running large CSV bulk migrations or store redistricting, click "Create Point-in-Time Snapshot" and supply an operational reason (e.g., "Pre-Q4 Cutover").'
      },
      {
        title: '3. Cold Backup JSON Export',
        instruction: 'Click "Export Full JSON Backup" to download the complete canonical database file including locations, personnel, audit logs, and security ACLs.'
      },
      {
        title: '4. Emergency Disaster Recovery Rollback',
        instruction: 'In the event of accidental bulk corruption, locate the verified prior snapshot in the Recovery list and click "Restore This Snapshot". All records are restored atomically in < 1 second.'
      },
      {
        title: '5. Audit Trail Verification',
        instruction: 'Review the Audit & Rollbacks ledger (Sec 22) to verify that the rollback event is recorded with the operator name and exact timestamp.'
      }
    ],
    emergencyContacts: 'Database Operations: it-ops@shiekhshoes.com | Lead Steward: m.vargas@shiekhshoes.com'
  },
  {
    id: 'sop-003',
    code: 'SOP-003',
    title: 'SMTP & Corporate Notification Credential Management',
    category: 'Communications & Outbox',
    icon: Mail,
    summary: 'Configuration guidelines for Google Workspace SMTP relay, TLS certificate verification, and automated store alert notifications.',
    targetRole: 'System Administrator',
    steps: [
      {
        title: '1. Access SMTP Configuration Panel',
        instruction: 'Navigate to Admin Console → SMTP & Notifications (Sec 10A).'
      },
      {
        title: '2. Configure Google Workspace Relay Host',
        instruction: 'Set Host to `smtp.gmail.com`, Port to `587`, and ensure Secure TLS is toggled ON.',
        command: 'Host: smtp.gmail.com | Port: 587 | Protocol: STARTTLS'
      },
      {
        title: '3. Service Account Credentials',
        instruction: 'Provide the dedicated service account username `directory-notifications@shiekhshoes.com` with a 16-character Google Workspace App Password.'
      },
      {
        title: '4. Execute End-to-End Test Handshake',
        instruction: 'Enter your corporate email address and click "Send Verification Test Email". Verify the TCP handshake in the Outbox logs.'
      },
      {
        title: '5. Alert Distribution Matrix',
        instruction: 'Ensure `notifyOnNewRequest` and `notifyOnMajorChange` flags are active so District Managers receive immediate alerts on operational changes.'
      }
    ],
    emergencyContacts: 'Enterprise Email Admin: postmaster@shiekhshoes.com'
  },
  {
    id: 'sop-004',
    code: 'SOP-004',
    title: 'Contact Privacy, Quarantine & Data Steward Verification',
    category: 'Data Governance & Compliance',
    icon: ShieldCheck,
    summary: 'Rules governing employee mobile phone visibility, migration quarantine, and the Data Steward certification pipeline.',
    targetRole: 'Directory Data Steward',
    steps: [
      {
        title: '1. Migration Quarantine Default Rule',
        instruction: 'Any store manager phone number imported via CSV starts in "Pending Review" and is quarantined. Viewers only see `(•••) •••-••••`.'
      },
      {
        title: '2. Review Quarantined Contacts',
        instruction: 'Navigate to Admin Console → Data Steward Queue. Review unverified store manager contact lines.'
      },
      {
        title: '3. Verify Public Work Contact',
        instruction: 'Verify the phone is an authorized public company-provided line. Click "Verify Public" to lift the mask company-wide.'
      },
      {
        title: '4. Set Internal Management Only',
        instruction: 'If the phone number is a sensitive direct mobile line, select "Management Only". Only District Managers, Data Stewards, and Admins will have access.'
      },
      {
        title: '5. Sign-Off Reconciled Master',
        instruction: 'When all records are certified, execute the batch sign-off to ensure zero pending quarantine items remain.'
      }
    ],
    emergencyContacts: 'Chief Compliance Officer & Data Privacy Officer: privacy@shiekhshoes.com'
  },
  {
    id: 'sop-005',
    code: 'SOP-005',
    title: 'Official 1-Sheet Master PDF Generation & Multi-Channel Distribution',
    category: 'Operations & Publishing',
    icon: Printer,
    summary: 'Standard procedure for printing the 11x8.5 binder sheet and emailing official PDF copies to all District Managers and Store Managers.',
    targetRole: 'Operations / Store Support',
    steps: [
      {
        title: '1. Access Master Print Sheet View',
        instruction: 'Click "Official 1-Sheet PDF" in the navigation sidebar.'
      },
      {
        title: '2. Verify Display Settings & Contrast',
        instruction: 'Ensure Hours, Managers, and Operational Status checkboxes are active. District headers automatically use WCAG AAA contrast colors.'
      },
      {
        title: '3. Browser Print / Save as PDF',
        instruction: 'Click "Print Sheet (PDF)". Select Landscape layout and "Letter (11 x 8.5 in)" paper size.'
      },
      {
        title: '4. Multi-Channel Email Distribution',
        instruction: 'Click "Email 1-Sheet PDF". Select target group: "All District Managers" or "Corporate Executive Leadership". Click "Send PDF".'
      },
      {
        title: '5. Archive in Store Binder',
        instruction: 'Each retail store manager prints the received PDF and places it in Section 1 of the Store Operations Binder.'
      }
    ],
    emergencyContacts: 'Retail Operations: retail-ops@shiekhshoes.com'
  }
];

export const SopKnowledgeBasePanel: React.FC = () => {
  const [selectedSopId, setSelectedSopId] = useState<string>('sop-001');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const selectedSop = SOPS.find(s => s.id === selectedSopId) || SOPS[0];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2500);
  };

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-red-600" />
          <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            Administrator Standard Operating Procedures (SOPs) & Handover Guide (Sec 22)
          </h2>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Production Runbooks, Disaster Recovery Guides, Security Token Lifecycle, and Operational Handover documentation for the Shiekh Shoes SysAdmin & Data Steward teams.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-4 space-y-2">
          <div className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider px-1">
            Authoritative Runbooks & SOPs
          </div>
          {SOPS.map(sop => {
            const Icon = sop.icon;
            const isSelected = sop.id === selectedSopId;
            return (
              <button
                key={sop.id}
                onClick={() => setSelectedSopId(sop.id)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 ${
                  isSelected
                    ? 'border-red-600 bg-red-50/40 dark:bg-red-950/30 shadow-2xs'
                    : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700'
                }`}
              >
                <div className={`p-2 rounded-lg ${isSelected ? 'bg-red-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 bg-neutral-200 dark:bg-neutral-800 rounded text-neutral-700 dark:text-neutral-300">
                      {sop.code}
                    </span>
                    <span className="text-[10px] text-neutral-400 truncate">{sop.category}</span>
                  </div>
                  <div className="font-bold text-xs text-neutral-900 dark:text-neutral-100 mt-1 truncate">
                    {sop.title}
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? 'text-red-600 translate-x-0.5' : 'text-neutral-400'}`} />
              </button>
            );
          })}
        </div>

        {/* SOP Content Viewer */}
        <div className="lg:col-span-8 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs p-6 space-y-6">
          {/* Header */}
          <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-red-600 text-white rounded text-xs font-mono font-bold">
                  {selectedSop.code}
                </span>
                <span className="text-xs font-bold text-neutral-500">{selectedSop.category}</span>
              </div>
              <span className="px-2.5 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded text-xs font-semibold">
                Target Role: {selectedSop.targetRole}
              </span>
            </div>

            <h3 className="text-lg font-black text-neutral-900 dark:text-neutral-100 mt-2">
              {selectedSop.title}
            </h3>

            <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-2 leading-relaxed">
              {selectedSop.summary}
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Execution Runbook & Step-by-Step Procedure
            </h4>

            <div className="space-y-3.5">
              {selectedSop.steps.map((step, idx) => (
                <div 
                  key={idx}
                  className="p-3.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 space-y-1.5"
                >
                  <div className="font-bold text-xs text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 flex items-center justify-center text-[11px] shrink-0">
                      {idx + 1}
                    </span>
                    <span>{step.title}</span>
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 pl-7">
                    {step.instruction}
                  </p>

                  {step.command && (
                    <div className="ml-7 mt-2 p-2.5 bg-neutral-900 text-emerald-400 font-mono text-[11px] rounded-md flex items-center justify-between gap-2 overflow-x-auto">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span>{step.command}</span>
                      </div>
                      <button
                        onClick={() => handleCopy(step.command!, `cmd-${idx}`)}
                        className="text-neutral-400 hover:text-white p-1"
                        title="Copy command"
                      >
                        {copiedCmd === `cmd-${idx}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Emergency Escalation */}
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Escalation & Emergency Contacts</span>
            </div>
            <p className="text-[11px] opacity-90 pl-5.5">
              {selectedSop.emergencyContacts}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

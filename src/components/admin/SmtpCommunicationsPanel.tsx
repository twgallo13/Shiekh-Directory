import React, { useState, useRef } from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { 
  Mail, 
  Send, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Plus, 
  Edit2, 
  Trash2, 
  Eye, 
  EyeOff,
  Bell, 
  Lock, 
  ShieldCheck,
  Server, 
  FileText, 
  Clock, 
  X,
  Code
} from 'lucide-react';
import { EmailTemplate } from '../../types';
import { SecureMailPanel } from './SecureMailPanel';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useDialogFocus } from '../common/useDialogFocus';

interface SmtpCommunicationsPanelProps {
  activeSection?: 'all' | 'smtp-relay' | 'email-templates' | 'notification-rules' | 'outbox-logs';
}

export const SmtpCommunicationsPanel: React.FC<SmtpCommunicationsPanelProps> = ({ 
  activeSection = 'all' 
}) => {
  const { 
    emailTemplates, 
    createEmailTemplate, 
    updateEmailTemplate, 
    deleteEmailTemplate, 
    notificationRules, 
    updateNotificationRule, 
    outboxLogs,
  } = useDirectory();

  // Email Template Modal State
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<EmailTemplate | null>(null);
  const templateDialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(isTemplateModalOpen, () => setIsTemplateModalOpen(false), templateDialogRef);
  const [templateForm, setTemplateForm] = useState<{
    name: string;
    subject: string;
    triggerEvent: string;
    bodyHtml: string;
    variables: string[];
  }>({
    name: '',
    subject: '',
    triggerEvent: 'Request Submitted',
    bodyHtml: '',
    variables: ['{{store_number}}', '{{store_name}}', '{{requester_name}}']
  });
  const [activePreviewMode, setActivePreviewMode] = useState<'edit' | 'preview'>('edit');

  // Template Modal Handlers
  const handleOpenNewTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      name: '',
      subject: '',
      triggerEvent: 'Request Submitted',
      bodyHtml: '<p>Hello {{requester_name}},</p><p>We received your request for Store #{{store_number}} ({{store_name}}).</p><p><strong>Status:</strong> Processing</p>',
      variables: ['{{store_number}}', '{{store_name}}', '{{requester_name}}', '{{details}}', '{{timestamp}}']
    });
    setActivePreviewMode('edit');
    setIsTemplateModalOpen(true);
  };

  const handleOpenEditTemplate = (tmpl: EmailTemplate) => {
    setEditingTemplate(tmpl);
    setTemplateForm({
      name: tmpl.name,
      subject: tmpl.subject,
      triggerEvent: tmpl.triggerEvent,
      bodyHtml: tmpl.bodyHtml,
      variables: tmpl.variables || []
    });
    setActivePreviewMode('edit');
    setIsTemplateModalOpen(true);
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateForm.name || !templateForm.subject) return;

    if (editingTemplate) {
      updateEmailTemplate(editingTemplate.id, {
        name: templateForm.name,
        subject: templateForm.subject,
        triggerEvent: templateForm.triggerEvent,
        bodyHtml: templateForm.bodyHtml,
        variables: templateForm.variables
      });
    } else {
      createEmailTemplate({
        name: templateForm.name,
        subject: templateForm.subject,
        triggerEvent: templateForm.triggerEvent,
        bodyHtml: templateForm.bodyHtml,
        variables: templateForm.variables
      });
    }
    setIsTemplateModalOpen(false);
  };

  const insertVariableTag = (tag: string) => {
    setTemplateForm(prev => ({
      ...prev,
      bodyHtml: prev.bodyHtml + ` ${tag} `
    }));
  };

  // Helper to render preview with dummy values
  const renderTemplatePreview = (html: string) => {
    let output = html
      .replace(/{{store_number}}/g, '01')
      .replace(/{{store_name}}/g, 'Shiekh Shoes — San Francisco Centre')
      .replace(/{{requester_name}}/g, 'Marcus Vance')
      .replace(/{{approver_name}}/g, 'Theo (Data Steward)')
      .replace(/{{details}}/g, 'Update Sunday operating hours to 11:00 AM - 7:00 PM')
      .replace(/{{status}}/g, 'Approved')
      .replace(/{{action}}/g, 'Standard Schedule Updated')
      .replace(/{{entity_name}}/g, 'Store #01 Schedule')
      .replace(/{{user_name}}/g, 'Theo')
      .replace(/{{timestamp}}/g, new Date().toLocaleString());
    return output;
  };

  const showRelay = activeSection === 'all' || activeSection === 'smtp-relay';
  const showTemplates = activeSection === 'all' || activeSection === 'email-templates';
  const showRules = activeSection === 'all' || activeSection === 'notification-rules';
  const showOutbox = activeSection === 'all' || activeSection === 'outbox-logs';

  return (
    <div className="space-y-6">
      {showRelay && <SecureMailPanel />}

      {/* 3. Transactional Email Template Builder */}
      {showTemplates && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600 border border-purple-200">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Transactional Email Template Builder</h3>
                <p className="text-xs text-neutral-500">Database-backed templates for server-approved directory notifications.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenNewTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Template</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {emailTemplates.map(tmpl => (
              <div key={tmpl.id} className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-xs text-neutral-900">{tmpl.name}</h4>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold inline-block mt-0.5">
                        {tmpl.triggerEvent}
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-400 font-mono shrink-0">
                      {tmpl.updatedAt}
                    </span>
                  </div>

                  <div className="text-[11px] text-neutral-600 bg-white p-2.5 rounded-lg border border-neutral-200 space-y-1">
                    <div>
                      <span className="text-neutral-400 font-medium">Subject: </span>
                      <span className="font-semibold text-neutral-800">{tmpl.subject}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {tmpl.variables.map(v => (
                        <span key={v} className="text-[9px] px-1.5 py-0.5 bg-neutral-100 border border-neutral-200 text-neutral-600 rounded font-mono">
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
                  <button
                    type="button"
                    onClick={() => handleOpenEditTemplate(tmpl)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-neutral-700 bg-white border border-neutral-200 rounded-md hover:bg-neutral-100 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3 text-neutral-500" />
                    <span>Edit / Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateToDelete(tmpl)}
                    className="p-1 text-rose-600 hover:text-rose-800 rounded hover:bg-rose-50 cursor-pointer transition-colors"
                    title="Delete Template"
                    aria-label={`Delete email template ${tmpl.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Notification Rules Matrix */}
      {showRules && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Automated Notification Rules Matrix</h3>
                <p className="text-xs text-neutral-500">Configure role-based alert dispatches for directory mutations and requests</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 font-semibold border-b border-neutral-200">
                <tr>
                  <th className="py-2.5 px-3">Trigger Event</th>
                  <th className="py-2.5 px-3">Target Recipient Role</th>
                  <th className="py-2.5 px-3">Delivery Channel</th>
                  <th className="py-2.5 px-3 text-right">Active Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {notificationRules.map(rule => (
                  <tr key={rule.id} className="hover:bg-neutral-50/50">
                    <td className="py-2.5 px-3 font-semibold text-neutral-900">{rule.eventName}</td>
                    <td className="py-2.5 px-3 text-neutral-700">{rule.recipientRole}</td>
                    <td className="py-2.5 px-3">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200 font-mono text-neutral-600">
                        {rule.deliveryChannel}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => updateNotificationRule(rule.id, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-neutral-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Live Outbox & Dispatch Logs */}
      {showOutbox && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Recent Outbound Dispatch Logs</h3>
                <p className="text-xs text-neutral-500">Server-recorded SMTP attempts. Accepted confirms relay acceptance, not inbox delivery. Capped at 50.</p>
              </div>
            </div>
            <span className="text-xs text-neutral-500 font-mono">{outboxLogs.length} recorded attempts</span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {outboxLogs.length === 0 ? (
              <div className="text-center py-6 text-xs text-neutral-400">No outbound transmissions recorded yet.</div>
            ) : (
              outboxLogs.map(log => (
                <div
                  key={log.id}
                  className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs flex items-center justify-between gap-3"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-neutral-900 truncate">{log.subject}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${log.status === 'Failed' ? 'bg-rose-100 text-rose-800' : log.status === 'Accepted' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                        {log.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-500 truncate">
                      Recipient: <span className="font-mono text-neutral-700">{log.recipient}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono text-[10px] text-neutral-400 block">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      {new Date(log.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Email Template Editor / Live HTML Preview */}
      {/* ======================================================== */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4" onMouseDown={(event) => event.target === event.currentTarget && setIsTemplateModalOpen(false)}>
          <div ref={templateDialogRef} role="dialog" aria-modal="true" aria-label={editingTemplate ? `Edit email template ${editingTemplate.name}` : 'Create email template'} tabIndex={-1} className="bg-white border border-neutral-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-5 border-b border-neutral-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">
                {editingTemplate ? `Edit Template: ${editingTemplate.name}` : 'Create Email Template'}
              </h3>
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Template Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Schedule Change Approval"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Trigger Event</label>
                  <select
                    value={templateForm.triggerEvent}
                    onChange={(e) => setTemplateForm({ ...templateForm, triggerEvent: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none cursor-pointer"
                  >
                    <option value="Request Submitted">Request Submitted</option>
                    <option value="Request Approved">Request Approved</option>
                    <option value="Request Rejected">Request Rejected</option>
                    <option value="Emergency Alert">Emergency Alert</option>
                    <option value="System Rollback Alert">System Rollback Alert</option>
                    <option value="Quarterly Audit Reminder">Quarterly Audit Reminder</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Subject Line *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Approved: Schedule Update for Store #{{store_number}}"
                  value={templateForm.subject}
                  onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                />
              </div>

              {/* Variable Substitution Chips */}
              <div className="space-y-1 bg-purple-50/60 p-3 rounded-lg border border-purple-100">
                <span className="font-semibold text-purple-900 text-[11px] block">Click variable tag to insert into HTML body:</span>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['{{store_number}}', '{{store_name}}', '{{requester_name}}', '{{approver_name}}', '{{details}}', '{{status}}', '{{timestamp}}'].map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => insertVariableTag(tag)}
                      className="px-2 py-1 bg-white hover:bg-purple-100 text-purple-800 border border-purple-200 rounded font-mono text-[10px] cursor-pointer shadow-2xs transition-colors"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* View Switcher: Edit HTML vs Rendered Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-neutral-200 pb-1.5">
                  <span className="font-semibold text-neutral-800">Email Body</span>
                  <div className="flex items-center gap-1 bg-neutral-100 p-0.5 rounded-lg border border-neutral-200">
                    <button
                      type="button"
                      onClick={() => setActivePreviewMode('edit')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                        activePreviewMode === 'edit' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-500 hover:text-neutral-800'
                      }`}
                    >
                      <Code className="w-3 h-3" />
                      <span>HTML Editor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePreviewMode('preview')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                        activePreviewMode === 'preview' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-500 hover:text-neutral-800'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>Live Preview</span>
                    </button>
                  </div>
                </div>

                {activePreviewMode === 'edit' ? (
                  <textarea
                    rows={8}
                    required
                    value={templateForm.bodyHtml}
                    onChange={(e) => setTemplateForm({ ...templateForm, bodyHtml: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 font-mono text-[11px] focus:outline-none focus:border-purple-500 focus:bg-white"
                  />
                ) : (
                  <div className="p-4 bg-white border border-neutral-200 rounded-lg min-h-[160px] text-neutral-800 prose prose-sm max-w-none shadow-inner">
                    <div 
                      dangerouslySetInnerHTML={{ __html: renderTemplatePreview(templateForm.bodyHtml) }}
                    />
                  </div>
                )}
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
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Template</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={templateToDelete !== null}
        title="Delete email template?"
        description={`“${templateToDelete?.name || ''}” will be permanently deleted. Notification rules that refer to it may stop sending expected messages.`}
        confirmLabel="Delete template"
        onConfirm={() => {
          if (templateToDelete) deleteEmailTemplate(templateToDelete.id);
          setTemplateToDelete(null);
        }}
        onCancel={() => setTemplateToDelete(null)}
      />
    </div>
  );
};

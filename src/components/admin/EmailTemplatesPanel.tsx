import React, { useState } from 'react';
import { 
  FileCode, 
  Save, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Eye, 
  Code, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  Copy,
  Send,
  HelpCircle,
  Info
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { EmailTemplate } from '../../types';
import { renderEmailTemplate } from '../../data/initialEmailTemplates';

export const EmailTemplatesPanel: React.FC = () => {
  const { 
    emailTemplates, 
    updateEmailTemplate, 
    addEmailTemplate, 
    deleteEmailTemplate, 
    resetEmailTemplatesToDefault,
    currentUser,
    sendTestEmail
  } = useDirectory();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    emailTemplates[0]?.id || 'user_invitation'
  );
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor');
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isTestSending, setIsTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Selected template state for editing
  const currentTemplate = emailTemplates.find(t => t.id === selectedTemplateId) || emailTemplates[0];

  const [editName, setEditName] = useState(currentTemplate?.name || '');
  const [editDescription, setEditDescription] = useState(currentTemplate?.description || '');
  const [editSubject, setEditSubject] = useState(currentTemplate?.subjectTemplate || '');
  const [editHtml, setEditHtml] = useState(currentTemplate?.htmlTemplate || '');

  // New template form state
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newHtml, setNewHtml] = useState('');
  const [newVars, setNewVars] = useState('recipientName, storeName, appUrl');

  // Update form fields when selected template changes
  React.useEffect(() => {
    if (currentTemplate) {
      setEditName(currentTemplate.name);
      setEditDescription(currentTemplate.description);
      setEditSubject(currentTemplate.subjectTemplate);
      setEditHtml(currentTemplate.htmlTemplate);
      setTestResult(null);
    }
  }, [selectedTemplateId, currentTemplate]);

  // Sample data dictionary for previewing
  const sampleVariables: Record<string, string> = {
    recipientName: currentUser.displayName || 'Marcus Aurelius',
    userRole: 'Store Manager',
    storeNumber: '007',
    storeName: 'Downtown Flagship',
    inviteUrl: `${window.location.origin}/?inviteToken=inv_sample999&email=store007@shiekhshoes.com`,
    tempPassword: 'shk-auth-98231',
    accessScope: 'Store 007 Only',
    assignedDistrict: 'District 3 - Northern California',
    assignedStoreId: 'loc-shk-007',
    adminName: currentUser.displayName,
    appUrl: window.location.origin,
    requestId: 'req-001',
    locationName: 'Eastmont Town Center (#115)',
    changeType: 'Store Manager & Operational Hours Update',
    requesterName: 'Rudy Calderon',
    requesterEmail: 'r.calderon@shiekhshoes.com',
    submittedAt: new Date().toLocaleString(),
    reviewedAt: new Date().toLocaleString(),
    reviewerName: currentUser.displayName,
    reviewerRole: currentUser.role,
    reviewerNotes: 'Approved during Q3 operational alignment review.',
    rejectionReason: 'Hours overlap with regional mall lease guidelines.',
    targetEmail: currentUser.email || 'theo@shiekhshoes.org',
    senderName: currentUser.displayName,
    senderRole: currentUser.role,
    host: 'smtp.shiekhshoes.com',
    port: '587',
    tlsStatus: 'STARTTLS Enforced',
    fromName: 'Shiekh Directory Notifications',
    fromEmail: 'noreply@shiekhshoes.com',
    timestamp: new Date().toLocaleString(),
    serverIso: new Date().toISOString()
  };

  const handleCopyVariable = (varName: string) => {
    const textToCopy = `{{${varName}}}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedVar(varName);
    setTimeout(() => setCopiedVar(null), 1500);
  };

  const handleSaveCurrent = async () => {
    if (!currentTemplate) return;
    try {
      await updateEmailTemplate(currentTemplate.id, {
        name: editName,
        description: editDescription,
        subjectTemplate: editSubject,
        htmlTemplate: editHtml
      });
      setSaveStatus('Template saved successfully to Firestore & live memory.');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      setSaveStatus(`Failed to save: ${err.message}`);
    }
  };

  const handleCreateNewTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId || !newName || !newSubject || !newHtml) return;

    const parsedVars = newVars.split(',').map(v => v.trim()).filter(Boolean);
    await addEmailTemplate({
      id: newId.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      name: newName,
      description: newDesc,
      subjectTemplate: newSubject,
      htmlTemplate: newHtml,
      variables: parsedVars,
      availableVariables: parsedVars
    });

    setSelectedTemplateId(newId);
    setIsCreatingNew(false);
    setNewId('');
    setNewName('');
    setNewDesc('');
    setNewSubject('');
    setNewHtml('');
  };

  const handleDeleteCurrent = async () => {
    if (!currentTemplate) return;
    if (window.confirm(`Are you sure you want to delete the email template "${currentTemplate.name}"?`)) {
      await deleteEmailTemplate(currentTemplate.id);
      const remaining = emailTemplates.filter(t => t.id !== currentTemplate.id);
      if (remaining.length > 0) {
        setSelectedTemplateId(remaining[0].id);
      }
    }
  };

  const handleResetDefaults = async () => {
    if (window.confirm('Reset all transactional email templates to the default System Blueprints? Any custom changes will be overwritten.')) {
      await resetEmailTemplatesToDefault();
      setSaveStatus('All email templates restored to default System Blueprints.');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const handleSendSampleTest = async () => {
    setIsTestSending(true);
    setTestResult(null);
    try {
      const res = await sendTestEmail(currentUser.email || 'theo@shiekhshoes.org');
      setIsTestSending(false);
      if (res.success) {
        setTestResult({
          success: true,
          message: `Sample diagnostic dispatched to ${currentUser.email || 'theo@shiekhshoes.org'}.`
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Failed to dispatch test email.'
        });
      }
    } catch (err: any) {
      setIsTestSending(false);
      setTestResult({
        success: false,
        message: err.message || 'SMTP network error.'
      });
    }
  };

  const renderedPreviewSubject = currentTemplate 
    ? renderEmailTemplate(editSubject, sampleVariables) 
    : '';

  const renderedPreviewHtml = currentTemplate 
    ? renderEmailTemplate(editHtml, sampleVariables) 
    : '';

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <FileCode className="w-4 h-4 text-red-600" />
              <span>Transactional Email Templates & Interpolation Engine (DISPATCH-015)</span>
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Authoritative HTML and plain-text message templates dispatched by the SMTP relay. Templates support mustache-style interpolations (e.g. <code className="text-red-600 dark:text-red-400 font-mono text-[11px]">{`{{recipientName}}`}</code>) and sync directly to Firestore.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsCreatingNew(true)}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Template</span>
            </button>
            <button
              onClick={handleResetDefaults}
              className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Revert all templates to hardcoded seed defaults"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Defaults</span>
            </button>
          </div>
        </div>

        {saveStatus && (
          <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{saveStatus}</span>
          </div>
        )}
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Template List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 px-1">
            Active Email Templates ({emailTemplates.length})
          </div>

          <div className="space-y-2">
            {emailTemplates.map(tmpl => {
              const isSelected = tmpl.id === selectedTemplateId;
              return (
                <button
                  key={tmpl.id}
                  onClick={() => {
                    setSelectedTemplateId(tmpl.id);
                    setIsCreatingNew(false);
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-red-500 bg-red-50/50 dark:bg-red-950/30 shadow-xs ring-1 ring-red-500/20'
                      : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 bg-white dark:bg-neutral-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
                      {tmpl.name}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                      {tmpl.id}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-2 mt-1">
                    {tmpl.description}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {(tmpl.availableVariables || tmpl.variables || []).slice(0, 3).map(v => (
                      <span key={v} className="text-[9px] font-mono bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 px-1.5 py-0.5 rounded">
                        {`{${v}}`}
                      </span>
                    ))}
                    {(tmpl.availableVariables || tmpl.variables || []).length > 3 && (
                      <span className="text-[9px] text-neutral-400">
                        +{(tmpl.availableVariables || tmpl.variables || []).length - 3} more
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Template Editor & Live Preview */}
        <div className="lg:col-span-8 space-y-4">
          {isCreatingNew ? (
            /* Create New Template Form */
            <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    Create New Transactional Email Template
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="text-xs text-neutral-500 hover:text-neutral-700"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleCreateNewTemplate} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Template ID (e.g. monthly_digest)
                    </label>
                    <input
                      type="text"
                      required
                      value={newId}
                      onChange={e => setNewId(e.target.value)}
                      placeholder="custom_notification"
                      className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="Monthly Store Hours Digest"
                      className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="Dispatched to District Managers when monthly schedules update."
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Available Interpolation Variables (Comma-separated)
                  </label>
                  <input
                    type="text"
                    value={newVars}
                    onChange={e => setNewVars(e.target.value)}
                    placeholder="recipientName, storeNumber, appUrl"
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    Subject Line Template
                  </label>
                  <input
                    type="text"
                    required
                    value={newSubject}
                    onChange={e => setNewSubject(e.target.value)}
                    placeholder="[Shiekh Directory] Monthly Schedule for {{storeName}}"
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                    HTML Message Body
                  </label>
                  <textarea
                    required
                    rows={8}
                    value={newHtml}
                    onChange={e => setNewHtml(e.target.value)}
                    placeholder={`<div style="font-family: sans-serif; padding: 16px;">\n  <h2>Hello {{recipientName}},</h2>\n  <p>Your directory update is confirmed.</p>\n</div>`}
                    className="w-full px-3 py-2 bg-neutral-900 text-neutral-100 border border-neutral-700 rounded-lg text-xs font-mono"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingNew(false)}
                    className="px-4 py-2 bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Create Template</span>
                  </button>
                </div>
              </form>
            </div>
          ) : currentTemplate ? (
            /* Edit Existing Template */
            <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
              {/* Header & Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200 dark:border-neutral-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      {currentTemplate.name}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                      {currentTemplate.id}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {currentTemplate.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* View Mode Toggle */}
                  <div className="flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg text-xs font-semibold">
                    <button
                      onClick={() => setViewMode('editor')}
                      className={`px-3 py-1 rounded-md flex items-center gap-1.5 transition-colors ${
                        viewMode === 'editor'
                          ? 'bg-white dark:bg-neutral-900 text-red-600 shadow-2xs font-bold'
                          : 'text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      <Code className="w-3.5 h-3.5" />
                      <span>Code Editor</span>
                    </button>
                    <button
                      onClick={() => setViewMode('preview')}
                      className={`px-3 py-1 rounded-md flex items-center gap-1.5 transition-colors ${
                        viewMode === 'preview'
                          ? 'bg-white dark:bg-neutral-900 text-red-600 shadow-2xs font-bold'
                          : 'text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Live Preview</span>
                    </button>
                  </div>

                  <button
                    onClick={handleSaveCurrent}
                    className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Template</span>
                  </button>

                  <button
                    onClick={handleDeleteCurrent}
                    className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                    title="Delete this template"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Variable Helper Chips */}
              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700/60 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Available Dynamic Placeholders (Click to Copy)</span>
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    Supports <code className="font-mono">{`{{var}}`}</code> or <code className="font-mono">{`{var}`}</code>
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {(currentTemplate.availableVariables || currentTemplate.variables || []).map(varName => (
                    <button
                      key={varName}
                      type="button"
                      onClick={() => handleCopyVariable(varName)}
                      className="px-2 py-1 rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-red-400 dark:hover:border-red-500 text-[11px] font-mono text-neutral-800 dark:text-neutral-200 flex items-center gap-1 transition-all shadow-2xs group"
                    >
                      <span>{`{{${varName}}}`}</span>
                      {copiedVar === varName ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      ) : (
                        <Copy className="w-2.5 h-2.5 text-neutral-400 group-hover:text-red-500 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* EDITOR VIEW */}
              {viewMode === 'editor' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                      Subject Line Template
                    </label>
                    <input
                      type="text"
                      value={editSubject}
                      onChange={e => setEditSubject(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-red-500 outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                        HTML Message Body Template
                      </label>
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {editHtml.length} characters
                      </span>
                    </div>
                    <textarea
                      rows={14}
                      value={editHtml}
                      onChange={e => setEditHtml(e.target.value)}
                      className="w-full p-3 bg-neutral-950 text-neutral-100 font-mono text-xs border border-neutral-800 rounded-xl leading-relaxed focus:ring-2 focus:ring-red-500 outline-none resize-y"
                    />
                  </div>
                </div>
              )}

              {/* PREVIEW VIEW */}
              {viewMode === 'preview' && (
                <div className="space-y-4">
                  <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-500">Subject:</span>
                      <span className="font-bold text-neutral-900 dark:text-neutral-100 font-mono">
                        {renderedPreviewSubject}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                      <span>Sender:</span>
                      <span className="font-mono">Shiekh Directory Notifications &lt;noreply@shiekhshoes.com&gt;</span>
                    </div>
                  </div>

                  {/* Rendered HTML Container */}
                  <div className="p-4 bg-white rounded-xl border border-neutral-300 shadow-inner text-neutral-900 min-h-[350px]">
                    <div 
                      dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }} 
                      className="max-w-full"
                    />
                  </div>

                  {/* Test Dispatch Bar */}
                  <div className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700">
                    <div className="text-xs text-neutral-500 flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-blue-500" />
                      <span>Preview rendered using sample directory context.</span>
                    </div>
                    <button
                      onClick={handleSendSampleTest}
                      disabled={isTestSending}
                      className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isTestSending ? 'Dispatching...' : 'Send Live Test Ping'}</span>
                    </button>
                  </div>

                  {testResult && (
                    <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                      testResult.success
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-700 dark:text-emerald-300'
                        : 'bg-red-50 dark:bg-red-950/40 border-red-200 text-red-700 dark:text-red-300'
                    }`}>
                      {testResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                      )}
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

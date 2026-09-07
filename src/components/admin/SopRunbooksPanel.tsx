import React, { useState } from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { 
  BookOpen, 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  Save, 
  X, 
  FileText, 
  User, 
  Calendar,
  Tag
} from 'lucide-react';
import { SopRunbook } from '../../types';

export const SopRunbooksPanel: React.FC = () => {
  const { 
    sopRunbooks, 
    createSopRunbook, 
    updateSopRunbook, 
    deleteSopRunbook,
    currentUser 
  } = useDirectory();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedRunbookId, setSelectedRunbookId] = useState<string>(sopRunbooks[0]?.id || '');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRunbook, setEditingRunbook] = useState<SopRunbook | null>(null);
  const [formState, setFormState] = useState({
    title: '',
    category: 'Store Operations',
    author: currentUser.name || 'Theo (Data Steward)',
    content: ''
  });

  const categories = ['All', 'Store Operations', 'Crisis & Outages', 'Governance & Audit', 'Integrations & API'];

  const filteredRunbooks = sopRunbooks.filter(r => {
    const matchesCat = selectedCategory === 'All' || r.category === selectedCategory;
    const matchesSearch = searchQuery === '' || 
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      r.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const activeRunbook = sopRunbooks.find(r => r.id === selectedRunbookId) || filteredRunbooks[0] || sopRunbooks[0];

  const handleOpenCreate = () => {
    setEditingRunbook(null);
    setFormState({
      title: '',
      category: 'Store Operations',
      author: currentUser.name || 'Theo (Data Steward)',
      content: '## Objective\nDescribe the procedural purpose...\n\n## Step-by-Step Instructions\n1. First step\n2. Second step\n\n## Verification & Audit Requirements\n- Confirm status on dashboard\n- Record audit change entry'
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (runbook: SopRunbook) => {
    setEditingRunbook(runbook);
    setFormState({
      title: runbook.title,
      category: runbook.category,
      author: runbook.author,
      content: runbook.content
    });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.title || !formState.content) return;

    if (editingRunbook) {
      updateSopRunbook(editingRunbook.id, formState);
    } else {
      const created = createSopRunbook(formState);
      setSelectedRunbookId(created.id);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-red-50 text-red-600 border border-red-200">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Standard Operating Procedures (SOP) & Steward Runbooks</h3>
              <p className="text-xs text-neutral-500">Official protocol runbooks for store lifecycle management, emergency closures, and audits</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create SOP Runbook</span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search runbook title or markdown instructions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs text-neutral-900 focus:bg-white focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  selectedCategory === cat
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main 2-Column Runbook Explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Runbook Index List */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider px-1">Runbook Catalog ({filteredRunbooks.length})</h4>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredRunbooks.length === 0 ? (
              <div className="p-4 bg-white border border-neutral-200 rounded-xl text-center text-xs text-neutral-400">
                No SOP runbooks match current filters.
              </div>
            ) : (
              filteredRunbooks.map(runbook => (
                <div
                  key={runbook.id}
                  onClick={() => setSelectedRunbookId(runbook.id)}
                  className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                    activeRunbook?.id === runbook.id
                      ? 'bg-red-50/70 border-red-300 shadow-xs'
                      : 'bg-white border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-neutral-900 leading-tight">{runbook.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200/80 text-neutral-700 font-semibold shrink-0">
                      {runbook.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-neutral-500 mt-2">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-neutral-400" />
                      {runbook.author}
                    </span>
                    <span className="flex items-center gap-1 font-mono">
                      <Calendar className="w-3 h-3 text-neutral-400" />
                      {runbook.lastUpdated}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right column: Active Runbook Viewer & Controls */}
        <div className="lg:col-span-2">
          {activeRunbook ? (
            <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-6 shadow-xs">
              {/* Active Runbook Header */}
              <div className="flex items-start justify-between flex-wrap gap-3 pb-4 border-b border-neutral-200">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold">
                      {activeRunbook.category}
                    </span>
                    <span className="text-xs text-neutral-400 font-mono">
                      Last Updated: {activeRunbook.lastUpdated}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-neutral-900">{activeRunbook.title}</h2>
                  <div className="text-xs text-neutral-500">
                    Author / Sign-off: <strong className="text-neutral-700">{activeRunbook.author}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(activeRunbook)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg cursor-pointer transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Edit Runbook</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSopRunbook(activeRunbook.id)}
                    className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-200 cursor-pointer transition-colors"
                    title="Delete Runbook"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Formatted Markdown Content Viewer */}
              <div className="prose prose-sm max-w-none text-neutral-800 space-y-4 font-sans text-xs leading-relaxed bg-neutral-50/50 p-5 rounded-xl border border-neutral-200">
                {activeRunbook.content.split('\n\n').map((paragraph, idx) => {
                  if (paragraph.startsWith('# ')) {
                    return <h1 key={idx} className="text-lg font-bold text-neutral-900 border-b border-neutral-300 pb-1">{paragraph.replace('# ', '')}</h1>;
                  }
                  if (paragraph.startsWith('## ')) {
                    return <h2 key={idx} className="text-sm font-bold text-neutral-900 mt-4 mb-1 text-red-900">{paragraph.replace('## ', '')}</h2>;
                  }
                  if (paragraph.startsWith('### ')) {
                    return <h3 key={idx} className="text-xs font-bold text-neutral-800 mt-2">{paragraph.replace('### ', '')}</h3>;
                  }
                  if (paragraph.startsWith('- ') || paragraph.startsWith('* ')) {
                    const items = paragraph.split('\n');
                    return (
                      <ul key={idx} className="list-disc pl-5 space-y-1">
                        {items.map((item, i) => (
                          <li key={i}>{item.replace(/^[-*]\s+/, '')}</li>
                        ))}
                      </ul>
                    );
                  }
                  if (/^\d+\.\s/.test(paragraph)) {
                    const items = paragraph.split('\n');
                    return (
                      <ol key={idx} className="list-decimal pl-5 space-y-1">
                        {items.map((item, i) => (
                          <li key={i}>{item.replace(/^\d+\.\s+/, '')}</li>
                        ))}
                      </ol>
                    );
                  }
                  return <p key={idx}>{paragraph}</p>;
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center text-xs text-neutral-400">
              Select an SOP Runbook from the catalog to view procedural documentation.
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL: SOP Runbook Editor */}
      {/* ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-5 border-b border-neutral-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">
                {editingRunbook ? `Edit Runbook: ${editingRunbook.title}` : 'Create SOP Runbook'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg hover:bg-neutral-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Runbook Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Store Location Lifecycle & Retirement Runbook"
                  value={formState.title}
                  onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Category</label>
                  <select
                    value={formState.category}
                    onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none cursor-pointer"
                  >
                    <option value="Store Operations">Store Operations</option>
                    <option value="Crisis & Outages">Crisis & Outages</option>
                    <option value="Governance & Audit">Governance & Audit</option>
                    <option value="Integrations & API">Integrations & API</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Author / Sign-off Role</label>
                  <input
                    type="text"
                    required
                    value={formState.author}
                    onChange={(e) => setFormState({ ...formState, author: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Runbook Instructions (Markdown Supported) *</label>
                <textarea
                  rows={12}
                  required
                  value={formState.content}
                  onChange={(e) => setFormState({ ...formState, content: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 font-mono text-[11px] focus:outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div className="p-4 bg-neutral-50 -mx-5 -mb-5 mt-5 border-t border-neutral-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-lg font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Runbook</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

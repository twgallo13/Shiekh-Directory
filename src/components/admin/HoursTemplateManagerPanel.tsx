import React, { useState } from 'react';
import { 
  Clock, 
  Plus, 
  Edit, 
  Trash2, 
  Check, 
  Building, 
  Sparkles, 
  Calendar, 
  ShieldCheck, 
  Save, 
  X,
  AlertCircle
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { HoursTemplate, WeeklySchedule, LocationType } from '../../types';
import { WeeklyHoursEditor } from '../common/WeeklyHoursEditor';

export const HoursTemplateManagerPanel: React.FC = () => {
  const { hoursTemplates, addHoursTemplate, updateHoursTemplate, deleteHoursTemplate, currentUser } = useDirectory();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<HoursTemplate | null>(null);

  // Form State
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [defaultLocType, setDefaultLocType] = useState<LocationType>('Enclosed Mall');
  const [isDefault, setIsDefault] = useState(false);
  const [schedule, setSchedule] = useState<WeeklySchedule>({
    monday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    tuesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    wednesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    thursday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    friday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    saturday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    sunday: { open: '11:00 AM', close: '07:00 PM', isClosed: false },
  });

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const openCreateModal = () => {
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateDesc('');
    setDefaultLocType('Enclosed Mall');
    setIsDefault(false);
    setSchedule({
      monday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
      tuesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
      wednesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
      thursday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
      friday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
      saturday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
      sunday: { open: '11:00 AM', close: '07:00 PM', isClosed: false },
    });
    setIsModalOpen(true);
  };

  const openEditModal = (tmpl: HoursTemplate) => {
    setEditingTemplate(tmpl);
    setTemplateName(tmpl.name);
    setTemplateDesc(tmpl.description);
    setDefaultLocType(tmpl.defaultForType || 'Enclosed Mall');
    setIsDefault(tmpl.isDefault || false);
    setSchedule(JSON.parse(JSON.stringify(tmpl.schedule)));
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    if (editingTemplate) {
      updateHoursTemplate(editingTemplate.id, {
        name: templateName.trim(),
        description: templateDesc.trim(),
        defaultForType: defaultLocType,
        isDefault,
        schedule,
      });
    } else {
      addHoursTemplate({
        name: templateName.trim(),
        description: templateDesc.trim(),
        defaultForType: defaultLocType,
        isDefault,
        schedule,
      });
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    deleteHoursTemplate(id);
    setDeleteConfirmId(null);
  };

  return (
    <div className="space-y-4">
      {/* Header & Description */}
      <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-red-600" />
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              Global Operating Hours Template Engine
            </h2>
            <span className="px-2 py-0.5 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 rounded-full font-bold text-[10px]">
              DISPATCH-012
            </span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Manage enterprise operating schedules for Mall, Street, Outlet, Flagship, and Corporate facilities. Templates can be applied directly in store edit forms or broadcast to multiple locations simultaneously.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create Hours Template</span>
        </button>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {hoursTemplates.map(tmpl => (
          <div
            key={tmpl.id}
            className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-3"
          >
            <div>
              {/* Card Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                      {tmpl.name}
                    </h3>
                    {tmpl.isDefault && (
                      <span className="px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded text-[9px] font-bold uppercase">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {tmpl.description}
                  </p>
                </div>
                <div className="p-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-md text-neutral-600 dark:text-neutral-300">
                  <Building className="w-4 h-4" />
                </div>
              </div>

              {/* Default Location Type */}
              {tmpl.defaultForType && (
                <div className="mt-2 text-[10px] text-neutral-400 font-medium">
                  Default for: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{tmpl.defaultForType}</span>
                </div>
              )}

              {/* 7-Day Schedule Preview Mini-Table */}
              <div className="mt-3 p-2 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700/60 font-mono text-[10px] space-y-1">
                {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map(day => {
                  const dayInfo = tmpl.schedule[day];
                  return (
                    <div key={day} className="flex justify-between items-center text-neutral-600 dark:text-neutral-300 py-0.2">
                      <span className="capitalize font-bold text-neutral-500">{day.slice(0, 3)}</span>
                      <span>
                        {dayInfo?.isClosed ? (
                          <span className="text-neutral-400 font-semibold">Closed</span>
                        ) : (
                          `${dayInfo?.open} – ${dayInfo?.close}`
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Card Footer Actions */}
            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs">
              <span className="text-[10px] text-neutral-400 font-mono">
                {tmpl.createdBy ? `By ${tmpl.createdBy}` : 'System Baseline'}
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditModal(tmpl)}
                  className="p-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
                  title="Edit Template"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>

                {deleteConfirmId === tmpl.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(tmpl.id)}
                      className="px-2 py-0.5 bg-red-600 text-white rounded text-[10px] font-bold hover:bg-red-700"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="px-1 py-0.5 text-neutral-400 hover:text-neutral-600 text-[10px]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(tmpl.id)}
                    className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors"
                    title="Delete Template"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Template Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
          <div 
            className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 bg-neutral-900 text-white flex items-center justify-between border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-red-500" />
                <div>
                  <h3 className="font-bold text-base">
                    {editingTemplate ? `Edit Template: ${editingTemplate.name}` : 'Create Operating Hours Template'}
                  </h3>
                  <p className="text-[11px] text-neutral-400">
                    7-Day Visual Builder & Standard Schedule Definition (DISPATCH-012)
                  </p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-neutral-400 hover:text-white rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-500 mb-1 font-semibold">Template Name *</label>
                  <input
                    type="text"
                    required
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    placeholder="e.g. Standard Enclosed Mall Schedule"
                    className="w-full px-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs text-neutral-900 dark:text-neutral-100 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-neutral-500 mb-1 font-semibold">Default Store Format</label>
                  <select
                    value={defaultLocType}
                    onChange={e => setDefaultLocType(e.target.value as LocationType)}
                    className="w-full px-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs text-neutral-900 dark:text-neutral-100"
                  >
                    <option value="Enclosed Mall">Enclosed Mall</option>
                    <option value="Strip Center / Shopping Center">Strip Center / Shopping Center</option>
                    <option value="Street / Standalone Location">Street / Standalone Location</option>
                    <option value="Corporate Office">Corporate Office</option>
                    <option value="Warehouse / Distribution Center">Warehouse / Distribution Center</option>
                    <option value="Other Company Location">Other Company Location</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-neutral-500 mb-1 font-semibold">Description</label>
                <input
                  type="text"
                  value={templateDesc}
                  onChange={e => setTemplateDesc(e.target.value)}
                  placeholder="e.g. Mon-Sat 10 AM - 9 PM, Sun 11 AM - 7 PM"
                  className="w-full px-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div className="pt-2">
                <WeeklyHoursEditor
                  value={schedule}
                  onChange={setSchedule}
                />
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded font-medium text-xs hover:bg-neutral-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Template</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

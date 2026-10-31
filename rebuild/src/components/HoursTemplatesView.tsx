import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import type { HoursTemplate, StandardHours, DayOfWeek, District, Region, LocationKind } from '../types';

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

const createEmptyHours = (): StandardHours => {
  const hours: Partial<StandardHours> = {};
  for (const day of DAYS) {
    hours[day] = { closed: false, intervals: [{ open: '09:00', close: '21:00' }] };
  }
  return hours as StandardHours;
};

interface BulkApplyPreview {
  templateName: string;
  templateVersion: number;
  totalLocations: number;
  locationsWithChanges: number;
  locations: {
    id: string;
    storeNumber: string;
    name: string;
    hasChanges: boolean;
  }[];
}

export function HoursTemplatesView() {
  const { getIdToken } = useAuth();
  const [templates, setTemplates] = useState<HoursTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<HoursTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editData, setEditData] = useState<{ name: string; description: string; hours: StandardHours }>({
    name: '',
    description: '',
    hours: createEmptyHours(),
  });
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Bulk apply state
  const [showBulkApply, setShowBulkApply] = useState(false);
  const [districts, setDistricts] = useState<District[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [bulkFilters, setBulkFilters] = useState<{ districtId?: string; regionId?: string; kind?: LocationKind }>({});
  const [bulkPreview, setBulkPreview] = useState<BulkApplyPreview | null>(null);
  const [applying, setApplying] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getIdToken();
      const response = await fetch('/api/app/hours-templates', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Failed to load templates');
      }
      const { data } = await response.json();
      setTemplates(data || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  const loadFiltersData = useCallback(async () => {
    try {
      const token = await getIdToken();
      const [districtsRes, regionsRes] = await Promise.all([
        fetch('/api/app/districts', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/app/regions', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (districtsRes.ok) {
        const { data } = await districtsRes.json();
        setDistricts(data || []);
      }
      if (regionsRes.ok) {
        const { data } = await regionsRes.json();
        setRegions(data || []);
      }
    } catch (err) {
      console.error('Failed to load filter data:', err);
    }
  }, [getIdToken]);

  useEffect(() => {
    loadTemplates();
    loadFiltersData();
  }, [loadTemplates, loadFiltersData]);

  const handleCreate = () => {
    setIsCreating(true);
    setIsEditing(true);
    setSelectedTemplate(null);
    setEditData({
      name: '',
      description: '',
      hours: createEmptyHours(),
    });
    setActionError(null);
  };

  const handleEdit = (template: HoursTemplate) => {
    setSelectedTemplate(template);
    setIsEditing(true);
    setIsCreating(false);
    setEditData({
      name: template.name,
      description: template.description || '',
      hours: JSON.parse(JSON.stringify(template.hours)),
    });
    setActionError(null);
  };

  const handleSave = async () => {
    if (!editData.name.trim()) {
      setActionError('Template name is required');
      return;
    }

    try {
      setSaving(true);
      setActionError(null);
      const token = await getIdToken();
      const url = isCreating ? '/api/app/hours-templates' : `/api/app/hours-templates/${selectedTemplate!.id}`;
      const method = isCreating ? 'POST' : 'PATCH';

      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editData.name.trim(),
          description: editData.description.trim() || undefined,
          hours: editData.hours,
        }),
      });

      if (!response.ok) {
        const { error: err } = await response.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to save template');
      }

      await loadTemplates();
      setIsEditing(false);
      setIsCreating(false);
      setSelectedTemplate(null);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (template: HoursTemplate) => {
    if (!confirm(`Archive template "${template.name}"? It can no longer be applied to stores.`)) return;

    try {
      setActionError(null);
      const token = await getIdToken();
      const response = await fetch(`/api/app/hours-templates/${template.id}/archive`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const { error: err } = await response.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to archive template');
      }
      await loadTemplates();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleBulkApply = (template: HoursTemplate) => {
    setSelectedTemplate(template);
    setShowBulkApply(true);
    setBulkFilters({});
    setBulkPreview(null);
    setActionError(null);
  };

  const handlePreview = async () => {
    if (!selectedTemplate) return;

    try {
      setActionError(null);
      const token = await getIdToken();
      const response = await fetch(`/api/app/hours-templates/${selectedTemplate.id}/bulk-apply`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          filters: bulkFilters,
          preview: true,
        }),
      });

      if (!response.ok) {
        const { error: err } = await response.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to load preview');
      }
      const { data } = await response.json();
      setBulkPreview(data);
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleApply = async () => {
    if (!selectedTemplate || !bulkPreview) return;
    if (!confirm(`Apply "${selectedTemplate.name}" to ${bulkPreview.locationsWithChanges} locations?`)) return;

    try {
      setApplying(true);
      setActionError(null);
      const token = await getIdToken();
      const response = await fetch(`/api/app/hours-templates/${selectedTemplate.id}/bulk-apply`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          filters: bulkFilters,
          preview: false,
        }),
      });

      if (!response.ok) {
        const { error: err } = await response.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to apply template');
      }
      const { data } = await response.json();
      alert(`Applied to ${data.appliedCount} locations`);
      setShowBulkApply(false);
      setBulkPreview(null);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const formatTime12h = (time24: string) => {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const renderHoursSummary = (hours: StandardHours) => {
    const summaries: string[] = [];
    for (const day of DAYS) {
      const dayHours = hours[day];
      if (dayHours.closed) {
        summaries.push(`${DAY_LABELS[day]}: Closed`);
      } else if (dayHours.intervals.length > 0) {
        const interval = dayHours.intervals[0];
        summaries.push(`${DAY_LABELS[day]}: ${formatTime12h(interval.open)}-${formatTime12h(interval.close)}`);
      }
    }
    return summaries.join(' · ');
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        Loading templates...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ color: '#dc2626', marginBottom: '1rem' }}>{error}</div>
        <button
          onClick={loadTemplates}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.25rem',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (showBulkApply && selectedTemplate) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <button
            onClick={() => { setShowBulkApply(false); setBulkPreview(null); setActionError(null); }}
            style={{
              padding: '0.5rem',
              borderRadius: '0.25rem',
              border: '1px solid #d1d5db',
              backgroundColor: 'white',
              cursor: 'pointer',
              minHeight: '44px',
              minWidth: '44px',
            }}
          >
            ← Back
          </button>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
            Bulk Apply: {selectedTemplate.name}
          </h2>
        </div>

        {actionError && (
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            fontSize: '0.875rem',
          }}>
            {actionError}
          </div>
        )}

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
              District
            </label>
            <select
              value={bulkFilters.districtId || ''}
              onChange={(e) => setBulkFilters({ ...bulkFilters, districtId: e.target.value || undefined })}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
              }}
            >
              <option value="">All Districts</option>
              {districts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
              Region
            </label>
            <select
              value={bulkFilters.regionId || ''}
              onChange={(e) => setBulkFilters({ ...bulkFilters, regionId: e.target.value || undefined })}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
              }}
            >
              <option value="">All Regions</option>
              {regions.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
              Type
            </label>
            <select
              value={bulkFilters.kind || ''}
              onChange={(e) => setBulkFilters({ ...bulkFilters, kind: (e.target.value || undefined) as LocationKind })}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
              }}
            >
              <option value="">All Types</option>
              <option value="store">Stores</option>
              <option value="warehouse">Warehouses</option>
              <option value="office">Offices</option>
              <option value="facility">Facilities</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <button
            onClick={handlePreview}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: '1px solid #3b82f6',
              backgroundColor: 'white',
              color: '#3b82f6',
              cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            Preview Changes
          </button>
          {bulkPreview && bulkPreview.locationsWithChanges > 0 && (
            <button
              onClick={handleApply}
              disabled={applying}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: 'none',
                backgroundColor: applying ? '#9ca3af' : '#059669',
                color: 'white',
                cursor: applying ? 'not-allowed' : 'pointer',
                minHeight: '44px',
              }}
            >
              {applying ? 'Applying...' : `Apply to ${bulkPreview.locationsWithChanges} Locations`}
            </button>
          )}
        </div>

        {bulkPreview && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden' }}>
            <div style={{ 
              padding: '1rem', 
              backgroundColor: '#f9fafb', 
              borderBottom: '1px solid #e5e7eb',
              fontSize: '0.875rem',
            }}>
              <strong>{bulkPreview.totalLocations}</strong> locations matched, <strong>{bulkPreview.locationsWithChanges}</strong> will be updated
            </div>
            <div style={{ maxHeight: '300px', overflow: 'auto' }}>
              {bulkPreview.locations.map(loc => (
                <div
                  key={loc.id}
                  style={{
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: loc.hasChanges ? 'white' : '#f9fafb',
                    color: loc.hasChanges ? 'inherit' : '#9ca3af',
                  }}
                >
                  <span>{loc.storeNumber} · {loc.name}</span>
                  <span style={{ fontSize: '0.75rem' }}>
                    {loc.hasChanges ? '✓ Will update' : 'No change'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isEditing) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <button
            onClick={() => { setIsEditing(false); setIsCreating(false); setActionError(null); }}
            style={{
              padding: '0.5rem',
              borderRadius: '0.25rem',
              border: '1px solid #d1d5db',
              backgroundColor: 'white',
              cursor: 'pointer',
              minHeight: '44px',
              minWidth: '44px',
            }}
          >
            ← Back
          </button>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
            {isCreating ? 'Create Template' : 'Edit Template'}
          </h2>
        </div>

        {actionError && (
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            fontSize: '0.875rem',
          }}>
            {actionError}
          </div>
        )}

        <div style={{ maxWidth: '600px' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
              Template Name *
            </label>
            <input
              type="text"
              value={editData.name}
              onChange={(e) => setEditData({ ...editData, name: e.target.value })}
              placeholder="e.g., Standard Store Hours"
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
              Description
            </label>
            <textarea
              value={editData.description}
              onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              placeholder="Optional description..."
              rows={2}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              Weekly Hours
            </label>
            {DAYS.map(day => {
              const dayHours = editData.hours[day];
              return (
                <div
                  key={day}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid #f3f4f6',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ width: '60px', fontWeight: 500 }}>{DAY_LABELS[day]}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={dayHours.closed}
                      onChange={(e) => {
                        const newHours = { ...editData.hours };
                        newHours[day] = { ...dayHours, closed: e.target.checked };
                        setEditData({ ...editData, hours: newHours });
                      }}
                      style={{ width: '18px', height: '18px' }}
                    />
                    Closed
                  </label>
                  {!dayHours.closed && dayHours.intervals[0] && (
                    <>
                      <input
                        type="time"
                        value={dayHours.intervals[0].open}
                        onChange={(e) => {
                          const newHours = { ...editData.hours };
                          newHours[day] = {
                            ...dayHours,
                            intervals: [{ ...dayHours.intervals[0], open: e.target.value }],
                          };
                          setEditData({ ...editData, hours: newHours });
                        }}
                        style={{
                          padding: '0.375rem',
                          borderRadius: '0.25rem',
                          border: '1px solid #d1d5db',
                        }}
                      />
                      <span>to</span>
                      <input
                        type="time"
                        value={dayHours.intervals[0].close}
                        onChange={(e) => {
                          const newHours = { ...editData.hours };
                          newHours[day] = {
                            ...dayHours,
                            intervals: [{ ...dayHours.intervals[0], close: e.target.value }],
                          };
                          setEditData({ ...editData, hours: newHours });
                        }}
                        style={{
                          padding: '0.375rem',
                          borderRadius: '0.25rem',
                          border: '1px solid #d1d5db',
                        }}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => { setIsEditing(false); setIsCreating(false); setActionError(null); }}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                backgroundColor: 'white',
                cursor: 'pointer',
                minHeight: '44px',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: 'none',
                backgroundColor: saving ? '#9ca3af' : '#3b82f6',
                color: 'white',
                cursor: saving ? 'not-allowed' : 'pointer',
                minHeight: '44px',
              }}
            >
              {saving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Hours Templates</h2>
        <button
          onClick={handleCreate}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.375rem',
            border: 'none',
            backgroundColor: '#3b82f6',
            color: 'white',
            cursor: 'pointer',
            minHeight: '44px',
          }}
        >
          + Create Template
        </button>
      </div>

      {actionError && (
        <div style={{
          padding: '0.75rem',
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          borderRadius: '0.375rem',
          marginBottom: '1rem',
          fontSize: '0.875rem',
        }}>
          {actionError}
        </div>
      )}

      {templates.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          color: '#6b7280',
          backgroundColor: '#f9fafb',
          borderRadius: '0.5rem',
        }}>
          No hours templates yet. Create one to apply consistent hours across multiple stores.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {templates.map(template => (
            <div
              key={template.id}
              style={{
                padding: '1rem',
                backgroundColor: 'white',
                borderRadius: '0.5rem',
                border: '1px solid #e5e7eb',
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontWeight: 600 }}>
                    {template.name}
                    <span style={{ 
                      marginLeft: '0.5rem', 
                      fontSize: '0.75rem', 
                      color: '#6b7280',
                      fontWeight: 400,
                    }}>
                      v{template.version}
                    </span>
                  </div>
                  {template.description && (
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      {template.description}
                    </div>
                  )}
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: '#9ca3af', 
                    marginTop: '0.5rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {renderHoursSummary(template.hours)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleBulkApply(template)}
                    style={{
                      padding: '0.375rem 0.75rem',
                      fontSize: '0.75rem',
                      backgroundColor: '#059669',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      minHeight: '44px',
                      minWidth: '44px',
                    }}
                  >
                    Bulk Apply
                  </button>
                  <button
                    onClick={() => handleEdit(template)}
                    style={{
                      padding: '0.375rem 0.75rem',
                      fontSize: '0.75rem',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      minHeight: '44px',
                      minWidth: '44px',
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleArchive(template)}
                    style={{
                      padding: '0.375rem 0.75rem',
                      fontSize: '0.75rem',
                      backgroundColor: '#dc2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      minHeight: '44px',
                      minWidth: '44px',
                    }}
                  >
                    Archive
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

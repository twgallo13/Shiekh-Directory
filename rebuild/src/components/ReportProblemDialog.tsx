import React, { useState } from 'react';
import type { Location, CorrectionCategory } from '../types';
import { apiPost } from '../lib/api';

interface Props {
  location: Location;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORIES: { value: CorrectionCategory; label: string; description: string }[] = [
  { value: 'address', label: 'Address', description: 'Street address is incorrect' },
  { value: 'suite', label: 'Suite/Unit', description: 'Suite or unit number is wrong' },
  { value: 'directions', label: 'Directions', description: 'Wayfinding directions need update' },
  { value: 'phone', label: 'Phone Number', description: 'Phone number is incorrect' },
  { value: 'hours', label: 'Hours', description: 'Store hours are wrong' },
  { value: 'manager', label: 'Manager Info', description: 'Manager information is incorrect' },
  { value: 'other', label: 'Other', description: 'Something else needs correction' },
];

export function ReportProblemDialog({ location, onClose, onSuccess }: Props) {
  const [category, setCategory] = useState<CorrectionCategory | ''>('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) {
      setError('Please select a category');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const response = await apiPost('/api/app/corrections', {
        locationId: location.id,
        category,
        proposedNote: note.trim() || undefined,
      });

      if (!response.ok) {
        const { error: err } = await response.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to submit request');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 600 }}>
          Report a Problem
        </h2>
        <p style={{ margin: '0 0 1rem 0', color: '#6b7280', fontSize: '0.875rem' }}>
          {location.storeNumber} · {location.name}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: 500,
              fontSize: '0.875rem',
            }}>
              What needs correction?
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {CATEGORIES.map(cat => (
                <label
                  key={cat.value}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: '0.75rem',
                    borderRadius: '0.375rem',
                    border: `2px solid ${category === cat.value ? '#3b82f6' : '#e5e7eb'}`,
                    backgroundColor: category === cat.value ? '#eff6ff' : 'white',
                    cursor: 'pointer',
                    minHeight: '44px',
                  }}
                >
                  <input
                    type="radio"
                    name="category"
                    value={cat.value}
                    checked={category === cat.value}
                    onChange={(e) => setCategory(e.target.value as CorrectionCategory)}
                    style={{ 
                      marginRight: '0.75rem', 
                      marginTop: '0.125rem',
                      width: '18px',
                      height: '18px',
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{cat.label}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{cat.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: 500,
              fontSize: '0.875rem',
            }}>
              Additional details (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe the issue or what the correct information should be..."
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                resize: 'vertical',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '0.75rem',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              borderRadius: '0.375rem',
              marginBottom: '1rem',
              fontSize: '0.875rem',
            }}>
              {error}
            </div>
          )}

          <div style={{ 
            display: 'flex', 
            gap: '0.75rem', 
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                backgroundColor: 'white',
                fontSize: '0.875rem',
                cursor: 'pointer',
                minHeight: '44px',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !category}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                border: 'none',
                backgroundColor: submitting || !category ? '#9ca3af' : '#3b82f6',
                color: 'white',
                fontSize: '0.875rem',
                cursor: submitting || !category ? 'not-allowed' : 'pointer',
                minHeight: '44px',
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

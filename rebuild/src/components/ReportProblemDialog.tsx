import React, { useState } from 'react';
import type { Location, CorrectionCategory } from '../types';
import { apiPost } from '../lib/api';
import { Dialog } from './Dialog';

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

  const footer = (
    <div className="flex gap-3 justify-end flex-wrap">
      <button
        type="button"
        onClick={onClose}
        disabled={submitting}
        className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:bg-gray-50 disabled:opacity-50 min-h-[44px]"
      >
        Cancel
      </button>
      <button
        type="submit"
        form="report-problem-form"
        disabled={submitting || !category}
        className="px-4 py-2 rounded-lg text-sm text-white min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
      >
        {submitting ? 'Submitting...' : 'Submit Request'}
      </button>
    </div>
  );

  return (
    <Dialog isOpen={true} onClose={onClose} title="Report a Problem" footer={footer}>
      <p className="text-sm text-gray-600 mb-4">
        {location.storeNumber} · {location.name}
      </p>

      <form id="report-problem-form" onSubmit={handleSubmit}>
        <fieldset className="mb-4">
          <legend className="block mb-2 font-medium text-sm text-gray-700">
            What needs correction?
          </legend>
          <div className="flex flex-col gap-2">
            {CATEGORIES.map(cat => (
              <label
                key={cat.value}
                className={`flex items-start p-3 rounded-md border-2 cursor-pointer min-h-[44px] ${
                  category === cat.value 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  value={cat.value}
                  checked={category === cat.value}
                  onChange={(e) => setCategory(e.target.value as CorrectionCategory)}
                  className="mt-0.5 mr-3 w-[18px] h-[18px]"
                />
                <div>
                  <div className="font-medium text-sm">{cat.label}</div>
                  <div className="text-xs text-gray-500">{cat.description}</div>
                </div>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mb-4">
          <label htmlFor="report-note" className="block mb-2 font-medium text-sm text-gray-700">
            Additional details (optional)
          </label>
          <textarea
            id="report-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Describe the issue or what the correct information should be..."
            rows={3}
            className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm resize-y"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-800 rounded-md mb-4 text-sm">
            {error}
          </div>
        )}
      </form>
    </Dialog>
  );
}

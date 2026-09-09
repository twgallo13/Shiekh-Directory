import React, { useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { sortedCustomFields, validCustomFieldValue, type CustomFieldDefinition, type CustomFieldValue } from '../../lib/customFields';
import { normalizeWebUrl } from '../../lib/contactNormalization';

interface Props {
  definitions: CustomFieldDefinition[];
  values: Record<string, CustomFieldValue>;
  onChange?: (values: Record<string, CustomFieldValue>) => void;
}

export function CustomMetadataFields({ definitions, values, onChange }: Props) {
  const [urlErrors, setUrlErrors] = useState<Record<string, string>>({});
  const fields = sortedCustomFields(definitions).filter(field => !field.retired && (onChange || Object.hasOwn(values, field.id)));
  if (!fields.length) return null;
  const update = (id: string, value: CustomFieldValue | undefined) => {
    const next = { ...values };
    if (value === undefined || value === '') delete next[id]; else next[id] = value;
    onChange?.(next);
  };
  const normalizeUrl = (id: string, value: string) => {
    if (!value) return;
    const normalized = normalizeWebUrl(value);
    if (normalized) {
      update(id, normalized);
      setUrlErrors(errors => ({ ...errors, [id]: '' }));
    } else setUrlErrors(errors => ({ ...errors, [id]: 'Enter a valid HTTP or HTTPS URL.' }));
  };
  const controlClass = 'w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900';
  return (
    <section className="min-w-0 space-y-4 border-t border-neutral-200 pt-4" aria-label="Custom Metadata">
      <h3 className="text-sm font-bold text-neutral-900">Custom Metadata</h3>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {fields.map(field => {
          const value = values[field.id];
          const id = `custom-field-${field.id}`;
          return (
            <div key={field.id} className="min-w-0 space-y-1.5">
              <label htmlFor={onChange ? id : undefined} className="block break-words text-xs font-medium text-neutral-700">{field.label}</label>
              {onChange ? <div className="flex min-w-0 items-center gap-2">
                {field.type === 'boolean' ? <div className="flex min-h-10 flex-1 items-center gap-2"><input id={id} type="checkbox" checked={value === true} onChange={event => update(field.id, event.target.checked)} aria-describedby={field.helpText ? `${id}-help` : undefined} /><span className="text-xs text-neutral-500">{value === undefined ? 'Not set' : value ? 'Yes' : 'No'}</span></div>
                  : field.type === 'select' ? <select id={id} value={typeof value === 'string' ? value : ''} onChange={event => update(field.id, event.target.value)} className={controlClass} aria-describedby={field.helpText ? `${id}-help` : undefined}><option value="">Not set</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select>
                  : <input id={id} type={field.type === 'number' ? 'number' : 'text'} step={field.type === 'number' ? 'any' : undefined} maxLength={field.type === 'url' ? 2048 : 2000} value={typeof value === 'boolean' ? '' : value ?? ''} onChange={event => { update(field.id, event.target.value === '' ? undefined : field.type === 'number' ? Number(event.target.value) : event.target.value); if (field.type === 'url') setUrlErrors(errors => ({ ...errors, [field.id]: '' })); }} onBlur={event => field.type === 'url' && normalizeUrl(field.id, event.target.value)} className={controlClass} aria-describedby={field.helpText ? `${id}-help` : undefined} />}
                <button type="button" disabled={value === undefined} onClick={() => update(field.id, undefined)} aria-label={`Clear ${field.label}`} title={`Clear ${field.label}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"><X className="h-4 w-4" /></button>
              </div> : field.type === 'url' && validCustomFieldValue(field, value) ? <a href={String(value)} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-start gap-1 text-sm text-red-700 underline"><span className="min-w-0 break-all">{String(value)}</span><ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" /></a> : <p className="break-words text-sm text-neutral-900">{typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value)}</p>}
              {onChange && field.helpText && <p id={`${id}-help`} className="break-words text-xs text-neutral-500">{field.helpText}</p>}
              {onChange && urlErrors[field.id] && <p className="text-xs text-red-600">{urlErrors[field.id]}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
import React, { useId, useMemo, useState } from 'react';
import type { LocationRecord } from '../../types';
import { FormLabel } from '../common/FormLabel';

interface PersonLocationRelationshipFieldsProps {
  locations: LocationRecord[];
  primaryLocationId?: string;
  supportedLocationIds: string[];
  onPrimaryLocationChange: (locationId?: string) => void;
  onSupportedLocationIdsChange: (locationIds: string[]) => void;
}

const locationLabel = (location: LocationRecord) => `#${location.storeNumber} · ${location.name} · ${location.type}`;

export function reconcileSupportedLocationIds(primaryLocationId: string | undefined, locationIds: string[]): string[] {
  return [...new Set(locationIds)].filter(locationId => locationId !== primaryLocationId);
}

export function PersonLocationRelationshipFields({
  locations,
  primaryLocationId,
  supportedLocationIds,
  onPrimaryLocationChange,
  onSupportedLocationIdsChange,
}: PersonLocationRelationshipFieldsProps) {
  const fieldId = useId();
  const [search, setSearch] = useState('');
  const eligibleLocations = useMemo(() => locations
    .filter(location => location.recordStatus !== 'Retired')
    .sort((left, right) => left.storeNumber.localeCompare(right.storeNumber, undefined, { numeric: true })), [locations]);
  const eligibleIds = new Set(eligibleLocations.map(location => location.id));
  const unavailablePrimary = primaryLocationId && !eligibleIds.has(primaryLocationId)
    ? locations.find(location => location.id === primaryLocationId)
    : undefined;
  const unavailableSupportIds = supportedLocationIds.filter(locationId => !eligibleIds.has(locationId));
  const matchingLocations = eligibleLocations.filter(location => location.id !== primaryLocationId && locationLabel(location).toLowerCase().includes(search.trim().toLowerCase()));

  const setPrimaryLocation = (locationId?: string) => {
    onPrimaryLocationChange(locationId);
    onSupportedLocationIdsChange(reconcileSupportedLocationIds(locationId, supportedLocationIds));
  };

  const toggleSupportLocation = (locationId: string, selected: boolean) => {
    const nextIds = selected
      ? [...supportedLocationIds, locationId]
      : supportedLocationIds.filter(id => id !== locationId);
    onSupportedLocationIdsChange(reconcileSupportedLocationIds(primaryLocationId, nextIds));
  };

  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="px-1 text-sm font-semibold text-neutral-900">Work locations</legend>
      <p className="text-xs text-neutral-600">Where this person works or helps. Leadership is assigned separately.</p>
      <div>
        <FormLabel htmlFor={`${fieldId}-primary`}>Works at</FormLabel>
        <select
          id={`${fieldId}-primary`}
          value={primaryLocationId || ''}
          onChange={event => setPrimaryLocation(event.target.value || undefined)}
          className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-red-500 focus:bg-white focus:outline-none"
        >
          <option value="">Unassigned</option>
          {unavailablePrimary && (
            <option value={primaryLocationId}>{locationLabel(unavailablePrimary)} · Unavailable</option>
          )}
          {primaryLocationId && !unavailablePrimary && !locations.some(location => location.id === primaryLocationId) && (
            <option value={primaryLocationId}>Unavailable Location · {primaryLocationId}</option>
          )}
          {eligibleLocations.map(location => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        {supportedLocationIds.length > 0 && (<div className="flex flex-wrap gap-2" aria-label="Selected support locations">{supportedLocationIds.map(locationId => <button key={locationId} type="button" onClick={() => toggleSupportLocation(locationId, false)} className="max-w-full break-words rounded-full border border-red-200 bg-red-50 px-3 py-1 text-left text-xs text-red-800" aria-label={`Remove support ${locations.find(l => l.id === locationId)?.name || locationId}`}>{locations.find(l => l.id === locationId)?.name || locationId} ×</button>)}</div>)}
        {unavailableSupportIds.length > 0 && <p className="text-xs text-amber-900">{unavailableSupportIds.length} saved support {unavailableSupportIds.length === 1 ? 'location is' : 'locations are'} unavailable. Review these links before changing them.</p>}
        <details className="rounded-lg border border-neutral-200 p-3">
          <summary className="cursor-pointer text-xs font-medium text-neutral-700"><span>Choose support locations</span><span className="ml-2 text-neutral-500">{supportedLocationIds.length} selected</span></summary>
          <div className="mt-3 space-y-2">
        <FormLabel htmlFor={`${fieldId}-search`}>Find support locations</FormLabel>
        <input id={`${fieldId}-search`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search store number or location name" className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs" />

        <p className="text-xs text-neutral-600">Search does not clear selected locations.</p>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 p-2">
          {matchingLocations.map(location => (
            <label key={location.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-white">
              <input
                type="checkbox"
                checked={supportedLocationIds.includes(location.id)}
                onChange={event => toggleSupportLocation(location.id, event.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-red-700"
              />
              <span className="text-xs text-neutral-800">{locationLabel(location)}</span>
            </label>
          ))}
          {unavailableSupportIds.map(locationId => {
            const location = locations.find(item => item.id === locationId);
            return (
              <label key={locationId} className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">
                <input
                  type="checkbox"
                  checked
                  onChange={() => toggleSupportLocation(locationId, false)}
                  className="mt-0.5 h-3.5 w-3.5 accent-red-700"
                />
                <span className="text-xs text-amber-900">{location ? locationLabel(location) : `Unavailable Location · ${locationId}`} · Unavailable</span>
              </label>
            );
          })}
          {matchingLocations.length === 0 && unavailableSupportIds.length === 0 && (
            <p className="px-2 py-1 text-xs text-neutral-500">{search.trim() ? 'No matching locations. Selected links are retained above.' : 'No additional eligible Locations.'}</p>
          )}
        </div>
          </div>
        </details>
      </div>
    </fieldset>
  );
}

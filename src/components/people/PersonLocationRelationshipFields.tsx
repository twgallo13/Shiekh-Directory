import React, { useMemo } from 'react';
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
  const eligibleLocations = useMemo(() => locations
    .filter(location => location.recordStatus !== 'Retired')
    .sort((left, right) => left.storeNumber.localeCompare(right.storeNumber, undefined, { numeric: true })), [locations]);
  const eligibleIds = new Set(eligibleLocations.map(location => location.id));
  const unavailablePrimary = primaryLocationId && !eligibleIds.has(primaryLocationId)
    ? locations.find(location => location.id === primaryLocationId)
    : undefined;
  const unavailableSupportIds = supportedLocationIds.filter(locationId => !eligibleIds.has(locationId));

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
    <fieldset className="space-y-3 border-t border-neutral-200 pt-3">
      <legend className="px-1 text-xs font-semibold text-neutral-900">Employment Locations</legend>
      <div>
        <FormLabel>Works at</FormLabel>
        <select
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
        <FormLabel>Supports</FormLabel>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 p-2">
          {eligibleLocations.filter(location => location.id !== primaryLocationId).map(location => (
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
          {eligibleLocations.filter(location => location.id !== primaryLocationId).length === 0 && unavailableSupportIds.length === 0 && (
            <p className="px-2 py-1 text-xs text-neutral-500">No additional eligible Locations.</p>
          )}
        </div>
      </div>
    </fieldset>
  );
}

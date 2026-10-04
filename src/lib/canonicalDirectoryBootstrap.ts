import type { HoursTemplate, LocationRecord, Person } from '../types';
import { structurallyEqual } from './correctionRequest';

export function canonicalDirectoryBootstrap(locations: LocationRecord[], people: Person[], templates: HoursTemplate[]) {
  return {
    people,
    locations: locations.map(location => {
      if (location.hoursMode === 'custom') return location;
      const matched = location.hoursTemplateId
        ? templates.find(template => template.id === location.hoursTemplateId)
        : templates.find(template => structurallyEqual(template.schedule, location.standardHours));
      return {
        ...location,
        hoursTemplateId: matched?.id || location.hoursTemplateId,
        hoursMode: location.hoursMode || (matched ? 'template' : 'custom'),
      } satisfies LocationRecord;
    }),
  };
}

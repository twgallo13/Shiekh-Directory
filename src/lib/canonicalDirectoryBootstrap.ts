import type { HoursTemplate, LocationRecord, Person } from '../types';

export function canonicalDirectoryBootstrap(locations: LocationRecord[], people: Person[], templates: HoursTemplate[]) {
  return {
    people,
    locations: locations.map(location => {
      const matched = location.hoursTemplateId
        ? templates.find(template => template.id === location.hoursTemplateId)
        : templates.find(template => JSON.stringify(template.schedule) === JSON.stringify(location.standardHours));
      return {
        ...location,
        hoursTemplateId: matched?.id || location.hoursTemplateId,
        hoursMode: location.hoursMode || (matched ? 'template' : 'custom'),
      } satisfies LocationRecord;
    }),
  };
}

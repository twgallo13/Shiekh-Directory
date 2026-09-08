import type { HoursTemplate, LocationRecord, Person, WeeklySchedule } from '../types';

const normalizeName = (value?: string) => value?.trim().toLocaleLowerCase() || '';

const personIdForName = (name: string) => {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `per-${slug || 'legacy'}-migrated`;
};

const cloneSchedule = (schedule: WeeklySchedule): WeeklySchedule =>
  Object.fromEntries(
    Object.entries(schedule).map(([day, hours]) => [day, { ...hours }]),
  ) as unknown as WeeklySchedule;

const schedulesMatch = (left?: WeeklySchedule, right?: WeeklySchedule) =>
  Boolean(left && right && JSON.stringify(left) === JSON.stringify(right));

export const mergeHoursTemplates = (
  savedTemplates: HoursTemplate[],
  defaultTemplates: HoursTemplate[],
): HoursTemplate[] => {
  const savedById = new Map(savedTemplates.map(template => [template.id, template]));
  return [
    ...defaultTemplates.map(template => ({
      ...template,
      ...savedById.get(template.id),
      schedule: cloneSchedule(savedById.get(template.id)?.schedule || template.schedule),
    })),
    ...savedTemplates.filter(template => !defaultTemplates.some(item => item.id === template.id)),
  ];
};

export const migrateDirectoryRelationships = (
  sourceLocations: LocationRecord[],
  sourcePeople: Person[],
  hoursTemplates: HoursTemplate[],
) => {
  const people = sourcePeople.map(person => ({
    ...person,
    assignedLocations: [...new Set(person.assignedLocations || [])],
  }));
  const peopleById = new Map(people.map(person => [person.id, person]));
  const peopleByName = new Map(people.map(person => [normalizeName(person.fullName), person]));

  const assignLocation = (person: Person, storeNumber: string) => {
    if (!person.assignedLocations?.includes(storeNumber)) {
      person.assignedLocations = [...(person.assignedLocations || []), storeNumber];
    }
  };

  const resolveLegacyPerson = (name: string, role: string, storeNumber: string) => {
    const normalizedName = normalizeName(name);
    let person = peopleByName.get(normalizedName);
    if (!person) {
      let id = personIdForName(name);
      let suffix = 2;
      while (peopleById.has(id)) {
        id = `${personIdForName(name)}-${suffix++}`;
      }
      person = {
        id,
        fullName: name.trim(),
        name: name.trim(),
        jobTitle: role,
        role,
        status: 'Active',
        activeStatus: true,
        phonePrivacy: 'Internal',
        assignedLocations: [storeNumber],
      };
      people.push(person);
      peopleById.set(person.id, person);
      peopleByName.set(normalizedName, person);
    } else {
      assignLocation(person, storeNumber);
    }
    return person.id;
  };

  const locations = sourceLocations.map(location => {
    const storeManager = location.storeManagerId
      ? peopleById.get(location.storeManagerId)
      : peopleByName.get(normalizeName(location.storeManagerName));
    if (storeManager) assignLocation(storeManager, location.storeNumber);

    const districtManager = location.districtManagerId
      ? peopleById.get(location.districtManagerId)
      : peopleByName.get(normalizeName(location.districtManagerName));

    const assistantStoreManagerIds = location.assistantStoreManagerIds?.filter(id => peopleById.has(id)) ||
      (location.assistantStoreManagerNames || []).map(name =>
        resolveLegacyPerson(name, 'Assistant Store Manager', location.storeNumber),
      );
    const keyHolderIds = location.keyHolderIds?.filter(id => peopleById.has(id)) ||
      (location.keyHolderNames || []).map(name =>
        resolveLegacyPerson(name, 'Key Holder', location.storeNumber),
      );

    const matchedTemplate = location.hoursTemplateId
      ? hoursTemplates.find(template => template.id === location.hoursTemplateId)
      : hoursTemplates.find(template => schedulesMatch(template.schedule, location.standardHours));

    return {
      ...location,
      districtManagerId: districtManager?.id || location.districtManagerId,
      districtManagerName: districtManager?.fullName || location.districtManagerName,
      storeManagerId: storeManager?.id || location.storeManagerId,
      storeManagerName: storeManager?.fullName || location.storeManagerName,
      storeManagerPhone: storeManager?.phone || storeManager?.workPhone || location.storeManagerPhone,
      assistantStoreManagerIds,
      assistantStoreManagerNames: assistantStoreManagerIds
        .map(id => peopleById.get(id)?.fullName)
        .filter((name): name is string => Boolean(name)),
      keyHolderIds,
      keyHolderNames: keyHolderIds
        .map(id => peopleById.get(id)?.fullName)
        .filter((name): name is string => Boolean(name)),
      hoursTemplateId: matchedTemplate?.id || location.hoursTemplateId,
      hoursMode: location.hoursMode || (matchedTemplate ? 'template' : 'custom'),
    } satisfies LocationRecord;
  });

  return { locations, people };
};

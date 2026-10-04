import type { LocationRecord, UpdateRequest, WeeklySchedule } from '../types';

export function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => structurallyEqual(value, right[index]));
  }
  const entries = Object.entries(left);
  return entries.length === Object.keys(right).length
    && entries.every(([key, value]) => Object.hasOwn(right, key) && structurallyEqual(value, Reflect.get(right, key)));
}

export function hoursDraft(location: LocationRecord | undefined, fallback: WeeklySchedule): WeeklySchedule {
  return structuredClone(location?.standardHours ?? fallback);
}

export function applyCorrection<T extends object>(target: T, changes: object): T {
  const updated = { ...target, ...changes };
  if (Object.hasOwn(changes, 'standardHours')) {
    Object.assign(updated, { hoursMode: 'custom' });
    Reflect.deleteProperty(updated, 'hoursTemplateId');
  }
  return updated;
}

export function correctionReview(
  request: Pick<UpdateRequest, 'requestedChanges' | 'currentSnapshot'>,
  target: object | undefined,
): { blockedReason: string | null; currentValues: Record<string, unknown> } {
  const entries = Object.entries(request.requestedChanges || {});
  const currentValues = Object.fromEntries(entries.map(([key]) => [key, target ? Reflect.get(target, key) : undefined]));
  if (!target) return { blockedReason: 'The request target is missing or unsupported. Reject this request or submit a replacement for an existing record.', currentValues };
  if (!entries.length) return { blockedReason: 'No changes were requested. Reject this request or submit a replacement.', currentValues };
  if ((Object.hasOwn(request.requestedChanges, 'standardHours') && structurallyEqual(currentValues.standardHours, request.requestedChanges.standardHours))
    || entries.every(([key, value]) => structurallyEqual(currentValues[key] ?? null, value ?? null))) {
    return { blockedReason: 'No change to apply: the requested values already match the current record. Reject this request or submit a replacement with different values.', currentValues };
  }
  if (Object.hasOwn(request.requestedChanges, 'standardHours')) {
    const baseline = request.currentSnapshot || {};
    if (!Object.hasOwn(baseline, 'standardHours')) {
      return { blockedReason: 'The submission hours baseline is missing. Reject this request and submit a replacement after reviewing current hours.', currentValues };
    }
    for (const field of ['standardHours', 'hoursMode', 'hoursTemplateId']) {
      if (Object.hasOwn(baseline, field) && !structurallyEqual(Reflect.get(baseline, field) ?? null, Reflect.get(target, field) ?? null)) {
        return { blockedReason: 'Hours or their template selection changed since submission. Reject this stale request and submit a replacement after reviewing current hours.', currentValues };
      }
    }
  }
  for (const [field] of entries) {
    if (Object.hasOwn(request.currentSnapshot || {}, field)
      && !structurallyEqual(Reflect.get(request.currentSnapshot, field) ?? null, currentValues[field] ?? null)) {
      return { blockedReason: `${field} changed since submission. Reject this stale request and submit a replacement after reviewing the current record.`, currentValues };
    }
  }
  return { blockedReason: null, currentValues };
}

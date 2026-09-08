export type CustomFieldType = 'url' | 'text' | 'number' | 'boolean' | 'select';
export type CustomFieldValue = string | number | boolean;

export interface CustomFieldDefinition {
  id: string;
  label: string;
  type: CustomFieldType;
  helpText: string;
  options: string[];
  order: number;
  apiVisible: boolean;
  retired: boolean;
}

const RESERVED_KEYS = new Set(['constructor', 'prototype', '__proto__', 'googleReviewUrl', 'storePageUrl']);
const FIELD_TYPES: CustomFieldType[] = ['url', 'text', 'number', 'boolean', 'select'];
const DEFINITION_KEYS = new Set(['id', 'label', 'type', 'helpText', 'options', 'order', 'apiVisible', 'retired']);

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function parseCustomFieldDefinition(value: unknown): CustomFieldDefinition {
  if (!isPlainRecord(value) || Object.keys(value).some(key => !DEFINITION_KEYS.has(key))
    || typeof value.id !== 'string' || !/^[a-z][A-Za-z0-9]{0,47}$/.test(value.id) || RESERVED_KEYS.has(value.id)
    || typeof value.label !== 'string' || !value.label.trim() || value.label.length > 80
    || !FIELD_TYPES.includes(value.type as CustomFieldType)
    || typeof value.helpText !== 'string' || value.helpText.length > 300
    || typeof value.order !== 'number' || !Number.isInteger(value.order) || value.order < 0 || value.order > 999
    || typeof value.apiVisible !== 'boolean' || typeof value.retired !== 'boolean'
    || !Array.isArray(value.options) || value.options.length > 50
    || value.options.some(option => typeof option !== 'string' || !option.trim() || option.length > 100)
    || new Set(value.options).size !== value.options.length
    || (value.type === 'select' ? value.options.length === 0 : value.options.length !== 0)) {
    throw new Error('Invalid custom field definition. Check the key, label, type, and choices.');
  }
  return { ...value, label: value.label.trim(), helpText: value.helpText.trim() } as unknown as CustomFieldDefinition;
}

export function validCustomFieldValue(definition: CustomFieldDefinition, value: unknown): value is CustomFieldValue {
  switch (definition.type) {
    case 'url': return isWebUrl(value);
    case 'text': return typeof value === 'string' && value.length > 0 && value.length <= 2000;
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'boolean': return typeof value === 'boolean';
    case 'select': return typeof value === 'string' && definition.options.includes(value);
  }
}

export function validateCustomMetadata(value: unknown, definitions: CustomFieldDefinition[], previous: unknown = {}): Record<string, CustomFieldValue> {
  if (!isPlainRecord(value) || Object.keys(value).length > 100) throw new Error('Custom metadata must contain at most 100 defined fields.');
  const existing = isPlainRecord(previous) ? previous : {};
  const byId = new Map(definitions.map(definition => [definition.id, definition]));
  const result: Record<string, CustomFieldValue> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    const definition = byId.get(key);
    if (!definition || RESERVED_KEYS.has(key)) throw new Error(`Unknown custom field: ${key}.`);
    if (definition.retired) {
      if (fieldValue !== existing[key]) throw new Error(`The ${definition.label} field is retired.`);
    } else if (!validCustomFieldValue(definition, fieldValue)) {
      throw new Error(`Invalid value for ${definition.label}.`);
    }
    result[key] = fieldValue as CustomFieldValue;
  }
  for (const definition of definitions.filter(field => field.retired)) {
    if (Object.hasOwn(existing, definition.id)) result[definition.id] = existing[definition.id] as CustomFieldValue;
  }
  return result;
}

export function publicCustomMetadata(value: unknown, definitions: CustomFieldDefinition[]): Record<string, CustomFieldValue> {
  if (!isPlainRecord(value)) return {};
  return Object.fromEntries(definitions
    .filter(definition => definition.apiVisible && !definition.retired && validCustomFieldValue(definition, value[definition.id]))
    .map(definition => [definition.id, value[definition.id] as CustomFieldValue]));
}

export function sortedCustomFields(definitions: CustomFieldDefinition[]): CustomFieldDefinition[] {
  return [...definitions].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}
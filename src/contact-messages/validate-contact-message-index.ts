import { ContactMessageIndex } from './contact-message-index.model.js';
import {
  contactMessageObjectKeyPattern,
  createContactMessageIndexObjectKey,
} from './contact-message-storage.js';

const indexPropertyNames = ['id', 'objectKey', 'schemaVersion'] as const;

export function isValidContactMessageIndex(
  value: unknown,
  indexObjectKey: string,
): value is ContactMessageIndex {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;

  const record = value as Readonly<Record<string, unknown>>;
  const propertyNames = Object.keys(record).sort();

  if (
    propertyNames.length !== indexPropertyNames.length ||
    propertyNames.some((name, index) => name !== indexPropertyNames[index])
  )
    return false;

  if (
    record['schemaVersion'] !== 1 ||
    typeof record['id'] !== 'string' ||
    typeof record['objectKey'] !== 'string'
  )
    return false;

  return (
    createContactMessageIndexObjectKey(record['id']) === indexObjectKey &&
    contactMessageObjectKeyPattern.test(record['objectKey']) &&
    record['objectKey'].endsWith(`-${record['id']}.json`)
  );
}

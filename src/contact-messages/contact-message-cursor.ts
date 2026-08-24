import { ContactMessageCursor } from './contact-message-cursor.model.js';
import { contactMessageIdPattern } from './contact-message-storage.js';
import { InvalidContactMessageCursorError } from './invalid-contact-message-cursor.error.js';

export const contactMessageCursorPattern = '^[A-Za-z0-9_-]{1,256}$';

const cursorPattern = new RegExp(contactMessageCursorPattern);
const messageIdPattern = new RegExp(contactMessageIdPattern);
const cursorPropertyNames = ['id', 'receivedAt', 'schemaVersion'] as const;

export function encodeContactMessageCursor(cursor: ContactMessageCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeContactMessageCursor(value: string | undefined): ContactMessageCursor | null {
  if (value === undefined)
    return null;

  if (!cursorPattern.test(value))
    throw new InvalidContactMessageCursorError();

  try {
    const decodedValue = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;

    if (!isContactMessageCursor(decodedValue))
      throw new InvalidContactMessageCursorError();

    if (encodeContactMessageCursor(decodedValue) !== value)
      throw new InvalidContactMessageCursorError();

    return decodedValue;
  } catch (error: unknown) {
    if (error instanceof InvalidContactMessageCursorError)
      throw error;

    throw new InvalidContactMessageCursorError();
  }
}

function isContactMessageCursor(value: unknown): value is ContactMessageCursor {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;

  const record = value as Readonly<Record<string, unknown>>;
  const propertyNames = Object.keys(record).sort();

  if (
    propertyNames.length !== cursorPropertyNames.length ||
    propertyNames.some((name, index) => name !== cursorPropertyNames[index])
  )
    return false;

  if (
    record['schemaVersion'] !== 1 ||
    typeof record['receivedAt'] !== 'string' ||
    typeof record['id'] !== 'string' ||
    !messageIdPattern.test(record['id'])
  )
    return false;

  const timestamp = Date.parse(record['receivedAt']);

  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === record['receivedAt'];
}

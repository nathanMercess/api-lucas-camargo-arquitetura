import { ContactMessageIngestionContext } from './contact-message-ingestion-context.model.js';
import { ContactMessageIngestionInput } from './contact-message-ingestion-input.model.js';
import { ContactMessage } from './contact-message.model.js';
import { ContactMessageStatus } from './contact-message-status.enum.js';
import { createContactMessageObjectKey } from './contact-message-storage.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const hostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const contactMessagePropertyNames = [
  'email',
  'id',
  'message',
  'name',
  'phone',
  'receivedAt',
  'requestId',
  'schemaVersion',
  'source',
  'status',
  'subject',
  'turnstileHostname',
] as const;

export function normalizeContactMessageInput(
  input: ContactMessageIngestionInput,
): ContactMessageIngestionInput {
  return {
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    subject: input.subject.trim(),
    message: input.message.trim(),
  };
}

export function validateContactMessageInput(
  input: ContactMessageIngestionInput,
  context: ContactMessageIngestionContext,
): readonly string[] {
  const errors: string[] = [];

  validateSafeText(input.name, 'name', 2, 120, false, errors);

  if (input.email.length > 254 || !emailPattern.test(input.email))
    errors.push('email must contain a valid address with at most 254 characters.');

  if (input.phone.length < 8 || input.phone.length > 32 || !/^[+0-9() .-]+$/.test(input.phone))
    errors.push('phone must contain a valid telephone number.');
  else {
    const digits = input.phone.replace(/[^0-9]/g, '');

    if (digits.length < 8 || digits.length > 15)
      errors.push('phone must contain between 8 and 15 digits.');
  }

  validateSafeText(input.subject, 'subject', 2, 160, false, errors);
  validateSafeText(input.message, 'message', 10, 5_000, true, errors);

  if (!requestIdPattern.test(context.requestId))
    errors.push('requestId must contain a safe request identifier.');

  if (!hostnamePattern.test(context.turnstileHostname.toLowerCase()))
    errors.push('turnstileHostname must contain a valid hostname.');

  return errors;
}

export function isValidStoredContactMessage(value: unknown, objectKey: string): value is ContactMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;

  const record = value as Readonly<Record<string, unknown>>;
  const propertyNames = Object.keys(record).sort();

  if (
    propertyNames.length !== contactMessagePropertyNames.length ||
    propertyNames.some((name, index) => name !== contactMessagePropertyNames[index])
  )
    return false;

  if (
    typeof record['id'] !== 'string' ||
    typeof record['receivedAt'] !== 'string' ||
    typeof record['status'] !== 'string' ||
    typeof record['name'] !== 'string' ||
    typeof record['email'] !== 'string' ||
    typeof record['phone'] !== 'string' ||
    typeof record['subject'] !== 'string' ||
    typeof record['message'] !== 'string' ||
    typeof record['requestId'] !== 'string' ||
    typeof record['turnstileHostname'] !== 'string'
  )
    return false;

  const message = record as unknown as ContactMessage;

  return (
    message.schemaVersion === 1 &&
    uuidPattern.test(message.id) &&
    isCanonicalDateTime(message.receivedAt) &&
    Object.values(ContactMessageStatus).includes(message.status) &&
    message.source === 'website' &&
    createContactMessageObjectKey(message.receivedAt, message.id) === objectKey &&
    validateContactMessageInput(message, {
      requestId: message.requestId,
      turnstileHostname: message.turnstileHostname,
    }).length === 0
  );
}

function validateSafeText(
  value: string,
  field: string,
  minimumLength: number,
  maximumLength: number,
  allowLineBreaks: boolean,
  errors: string[],
): void {
  const hasUnsafeCharacter = Array.from(value).some((character) => {
    const codePoint = character.charCodeAt(0);

    if (character === '<' || character === '>' || codePoint === 127)
      return true;

    if (codePoint >= 32)
      return false;

    return !allowLineBreaks || ![9, 10, 13].includes(codePoint);
  });

  if (value.length < minimumLength || value.length > maximumLength || hasUnsafeCharacter)
    errors.push(`${field} must contain between ${minimumLength} and ${maximumLength} safe characters.`);
}

function isCanonicalDateTime(value: string): boolean {
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

const contactMessagePrefix = 'contacts/messages/';
const contactMessageIndexPrefix = 'contacts/index/';
const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

export const contactMessageObjectPrefix = contactMessagePrefix;
export const contactMessageIndexObjectPrefix = contactMessageIndexPrefix;
export const contactMessageIdPattern = `^${uuidPattern}$`;
export const contactMessageObjectKeyPattern = new RegExp(
  `^contacts/messages/[0-9]{4}/[0-9]{2}/[0-9]{2}/[0-9]{8}T[0-9]{9}Z-${uuidPattern}\\.json$`,
);

export function createContactMessageObjectKey(receivedAt: string, id: string): string {
  const dayPath = receivedAt.slice(0, 10).replaceAll('-', '/');
  const compactReceivedAt = receivedAt.replace(/[-:.]/g, '');

  return `${contactMessagePrefix}${dayPath}/${compactReceivedAt}-${id}.json`;
}

export function createContactMessageIndexObjectKey(id: string): string {
  return `${contactMessageIndexPrefix}${id}.json`;
}

export function createContactMessageMonthPrefix(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');

  return `${contactMessagePrefix}${year}/${month}/`;
}

import { ContactMessageStatus } from './contact-message-status.enum.js';

export interface ContactMessage {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly receivedAt: string;
  readonly status: ContactMessageStatus;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly subject: string;
  readonly message: string;
  readonly source: 'website';
  readonly requestId: string;
  readonly turnstileHostname: string;
}

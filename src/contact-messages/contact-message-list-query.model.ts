import { ContactMessageStatus } from './contact-message-status.enum.js';

export interface ContactMessageListQuery {
  readonly limit?: number;
  readonly cursor?: string;
  readonly status?: ContactMessageStatus;
}

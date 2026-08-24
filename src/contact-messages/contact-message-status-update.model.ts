import { ContactMessageStatus } from './contact-message-status.enum.js';

export interface ContactMessageStatusUpdate {
  readonly status: ContactMessageStatus;
}

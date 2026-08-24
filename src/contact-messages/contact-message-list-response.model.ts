import { ContactMessageSummary } from './contact-message-summary.model.js';

export interface ContactMessageListResponse {
  readonly items: readonly ContactMessageSummary[];
  readonly nextCursor?: string;
}

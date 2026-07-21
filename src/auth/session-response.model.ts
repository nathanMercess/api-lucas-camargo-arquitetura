import { AdminRole } from './admin-role.enum.js';
import { Permission } from './permission.enum.js';

export interface SessionResponse {
  readonly subject: string;
  readonly email: string;
  readonly role: AdminRole;
  readonly permissions: readonly Permission[];
  readonly publishedContentBaseUrl: string;
}

import { AdminRole } from './admin-role.enum.js';

export interface AdminCredential {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: AdminRole;
  readonly active: boolean;
}

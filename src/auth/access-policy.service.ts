import { AdminRole } from './admin-role.enum.js';
import { AdminPrincipal } from './admin-principal.model.js';
import { Permission } from './permission.enum.js';

const ownerPermissions: readonly Permission[] = [
  Permission.SessionRead,
  Permission.ContentRead,
  Permission.ContentWrite,
  Permission.ReleaseRead,
  Permission.Publish,
  Permission.Rollback,
  Permission.MediaRead,
  Permission.MediaWrite,
  Permission.ContactMessageRead,
  Permission.ContactMessageWrite,
  Permission.AuditRead,
];

export class AccessPolicyService {
  private readonly ownerEmails: ReadonlySet<string>;

  public constructor(ownerEmails: readonly string[]) {
    this.ownerEmails = new Set(ownerEmails.map((email) => email.toLowerCase()));
  }

  public getRole(principal: AdminPrincipal): AdminRole | null {
    if (this.ownerEmails.has(principal.email.toLowerCase()))
      return AdminRole.Owner;

    return null;
  }

  public getPermissions(role: AdminRole): readonly Permission[] {
    switch (role) {
      case AdminRole.Owner:
        return ownerPermissions;
    }
  }

  public hasPermission(principal: AdminPrincipal, permission: Permission): boolean {
    const role = this.getRole(principal);

    if (role === null)
      return false;

    return this.getPermissions(role).includes(permission);
  }
}

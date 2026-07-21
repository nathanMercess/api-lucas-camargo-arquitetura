import { AdminRole } from './admin-role.enum.js';
import { IapPrincipal } from './iap-principal.model.js';
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
  Permission.AuditRead,
];

export class AccessPolicyService {
  private readonly ownerEmails: ReadonlySet<string>;

  public constructor(initialOwnerEmail: string) {
    this.ownerEmails = new Set([initialOwnerEmail.toLowerCase()]);
  }

  public getRole(principal: IapPrincipal): AdminRole | null {
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

  public hasPermission(principal: IapPrincipal, permission: Permission): boolean {
    const role = this.getRole(principal);

    if (role === null)
      return false;

    return this.getPermissions(role).includes(permission);
  }
}

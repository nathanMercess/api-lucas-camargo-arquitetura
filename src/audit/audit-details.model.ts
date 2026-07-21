import { AuditAction } from './audit-action.enum.js';

export interface AuditDetails {
  readonly action: AuditAction;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly beforeEtag?: string;
  readonly afterEtag?: string;
  readonly beforeSha256?: string;
  readonly afterSha256?: string;
  readonly releaseId?: string;
  readonly manifestBeforeEtag?: string;
  readonly manifestAfterEtag?: string;
}

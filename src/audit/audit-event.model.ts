import { AuditAction } from './audit-action.enum.js';

export interface AuditEvent {
  readonly id: string;
  readonly occurredAt: string;
  readonly action: AuditAction;
  readonly actorId: string;
  readonly actorEmail: string;
  readonly requestId: string;
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

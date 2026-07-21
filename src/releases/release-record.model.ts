import { ReleaseStatus } from './release-status.type.js';

export interface ReleaseRecord {
  readonly schemaVersion: 1;
  readonly releaseId: string;
  readonly siteConfigKey: string;
  readonly sha256: string;
  readonly publishedAt: string;
  readonly actorId: string;
  readonly actorEmail: string;
  readonly sourceDraftEtag: string;
  readonly status: ReleaseStatus;
  readonly previousReleaseId?: string;
}

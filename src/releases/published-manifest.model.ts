export interface PublishedManifest {
  readonly schemaVersion: 1;
  readonly releaseId: string;
  readonly siteConfigKey: string;
  readonly sha256: string;
  readonly publishedAt: string;
  readonly previousReleaseId?: string;
}

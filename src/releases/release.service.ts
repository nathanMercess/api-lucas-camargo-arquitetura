import { randomUUID } from 'node:crypto';
import { FastifyRequest } from 'fastify';
import { AuditAction } from '../audit/audit-action.enum.js';
import { AuditService } from '../audit/audit.service.js';
import { DraftService } from '../content/draft.service.js';
import { InvalidSiteDocumentError } from '../content/invalid-site-document.error.js';
import { SiteDocument } from '../content/site-document.model.js';
import { validateSiteDocumentRelationships } from '../content/validate-site-document-relationships.js';
import { MediaAsset } from '../media/media-asset.model.js';
import { calculateJsonSha256 } from '../shared/calculate-json-sha256.js';
import { ResourceNotFoundError } from '../shared/resource-not-found.error.js';
import { ObjectStore } from '../storage/object-store.interface.js';
import { MediaStore } from '../storage/media-store.interface.js';
import { PreconditionFailedError } from '../storage/precondition-failed.error.js';
import { PublishedManifest } from './published-manifest.model.js';
import { ReleaseMutationResult } from './release-mutation-result.model.js';
import { ReleaseRecord } from './release-record.model.js';

const manifestObjectKey = 'published/manifest.json';
const releaseRecordPrefix = 'releases/';
const mediaAssetPrefix = 'media/assets/';
const mediaValidationConcurrency = 4;
const extensionByMimeType: Readonly<Record<string, string>> = {
  'image/avif': 'avif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export class ReleaseService {
  public constructor(
    private readonly privateObjects: ObjectStore,
    private readonly publishedObjects: ObjectStore,
    private readonly mediaStore: MediaStore,
    private readonly draftService: DraftService,
    private readonly auditService: AuditService,
  ) {}

  public async publish(request: FastifyRequest, expectedDraftEtag: string): Promise<ReleaseMutationResult> {
    const draft = await this.draftService.getDraft();

    if (draft === null)
      throw new ResourceNotFoundError('No draft content has been created yet.');

    if (draft.etag !== expectedDraftEtag)
      throw new PreconditionFailedError();

    this.assertValidRelationships(draft.value);
    await this.assertPublishedMediaAvailable(draft.value);

    const principal = request.principal;

    if (principal === null)
      throw new Error('Publishing requires an authenticated principal.');

    const publishedAt = new Date().toISOString();
    const releaseId = createReleaseId(publishedAt);
    const siteConfigKey = `versions/${releaseId}/site.json`;
    const releaseDocument: SiteDocument = {
      ...draft.value,
      releaseId,
      publishedAt,
    };
    const sha256 = calculateJsonSha256(releaseDocument);
    const currentManifest = await this.publishedObjects.getJson<PublishedManifest>(manifestObjectKey);

    await this.publishedObjects.putJson(siteConfigKey, releaseDocument, {
      ifNoneMatch: '*',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    const releaseRecord: ReleaseRecord = {
      schemaVersion: 1,
      releaseId,
      siteConfigKey,
      sha256,
      publishedAt,
      actorId: principal.subject,
      actorEmail: principal.email,
      sourceDraftEtag: draft.etag,
      status: 'prepared',
      ...(currentManifest === null ? {} : { previousReleaseId: currentManifest.value.releaseId }),
    };
    const preparedRelease = await this.privateObjects.putJson(
      `${releaseRecordPrefix}${releaseId}.json`,
      releaseRecord,
      {
        ifNoneMatch: '*',
        cacheControl: 'no-store',
      },
    );
    const manifestValue: PublishedManifest = {
      schemaVersion: 1,
      releaseId,
      siteConfigKey,
      sha256,
      publishedAt,
      ...(currentManifest === null ? {} : { previousReleaseId: currentManifest.value.releaseId }),
    };
    const manifest = await this.publishedObjects.putJson(manifestObjectKey, manifestValue, currentManifest === null ? {
      ifNoneMatch: '*',
      cacheControl: 'public, max-age=60, must-revalidate',
    } : {
      ifMatch: currentManifest.etag,
      cacheControl: 'public, max-age=60, must-revalidate',
    });
    await this.tryFinalizeReleaseRecord(request, preparedRelease.value, preparedRelease.etag);

    const synchronizedDraft = await this.trySynchronizeDraft(request, releaseDocument, draft.etag, releaseId);

    await this.tryRecordAudit(request, releaseId, async () => this.auditService.record(request, {
        action: AuditAction.ReleasePublish,
        resourceType: 'site-release',
        resourceId: releaseId,
        beforeEtag: draft.etag,
        ...(synchronizedDraft.etag === undefined ? {} : { afterEtag: synchronizedDraft.etag }),
        beforeSha256: calculateJsonSha256(draft.value),
        afterSha256: sha256,
        releaseId,
        ...(currentManifest === null ? {} : { manifestBeforeEtag: currentManifest.etag }),
        manifestAfterEtag: manifest.etag,
      }));

    return {
      manifest,
      draftSynchronized: synchronizedDraft.synchronized,
    };
  }

  public async list(): Promise<readonly ReleaseRecord[]> {
    const [objects, currentManifest] = await Promise.all([
      this.privateObjects.listJson<ReleaseRecord>(releaseRecordPrefix),
      this.publishedObjects.getJson<PublishedManifest>(manifestObjectKey),
    ]);

    const releaseRecords: ReleaseRecord[] = [];
    const matchingObjects = objects
      .filter((object) => /^releases\/[^/]+\.json$/.test(object.key))
      .sort((left, right) => right.value.publishedAt.localeCompare(left.value.publishedAt));

    for (const object of matchingObjects) {
      if (object.value.status === 'committed') {
        releaseRecords.push(object.value);
        continue;
      }

      if (object.value.releaseId !== currentManifest?.value.releaseId)
        continue;

      const committedRecord: ReleaseRecord = { ...object.value, status: 'committed' };

      try {
        await this.privateObjects.putJson(object.key, committedRecord, {
          ifMatch: object.etag,
          cacheControl: 'no-store',
        });
      } catch {
        // The live manifest remains the source of truth; a later history read retries this repair.
      }

      releaseRecords.push(committedRecord);
    }

    return releaseRecords;
  }

  public async rollback(
    request: FastifyRequest,
    releaseId: string,
    expectedDraftEtag: string,
  ): Promise<ReleaseMutationResult> {
    const targetRecord = await this.privateObjects.getJson<ReleaseRecord>(`${releaseRecordPrefix}${releaseId}.json`);
    const currentManifest = await this.publishedObjects.getJson<PublishedManifest>(manifestObjectKey);
    const draft = await this.draftService.getDraft();

    if (targetRecord === null)
      throw new ResourceNotFoundError('The requested release does not exist.');

    if (currentManifest === null)
      throw new ResourceNotFoundError('No release has been published yet.');

    if (draft === null)
      throw new ResourceNotFoundError('No draft content has been created yet.');

    if (draft.etag !== expectedDraftEtag)
      throw new PreconditionFailedError();

    if (targetRecord.value.status !== 'committed' && targetRecord.value.releaseId !== currentManifest.value.releaseId)
      throw new ResourceNotFoundError('The requested release was not committed.');

    const targetDocument = await this.publishedObjects.getJson<SiteDocument>(targetRecord.value.siteConfigKey);

    if (targetDocument === null)
      throw new ResourceNotFoundError('The immutable release document is missing.');

    this.assertValidRelationships(targetDocument.value);
    await this.assertPublishedMediaAvailable(targetDocument.value);

    if (calculateJsonSha256(targetDocument.value) !== targetRecord.value.sha256)
      throw new InvalidSiteDocumentError(['The immutable release document does not match its recorded SHA-256.']);

    const activatedAt = new Date().toISOString();
    const manifestValue: PublishedManifest = {
      schemaVersion: 1,
      releaseId: targetRecord.value.releaseId,
      siteConfigKey: targetRecord.value.siteConfigKey,
      sha256: targetRecord.value.sha256,
      publishedAt: activatedAt,
      previousReleaseId: currentManifest.value.releaseId,
    };
    const manifest = await this.publishedObjects.putJson(manifestObjectKey, manifestValue, {
      ifMatch: currentManifest.etag,
      cacheControl: 'public, max-age=60, must-revalidate',
    });
    const synchronizedDraft = await this.trySynchronizeDraft(
      request,
      targetDocument.value,
      draft.etag,
      targetRecord.value.releaseId,
    );

    await this.tryRecordAudit(request, targetRecord.value.releaseId, async () => this.auditService.record(request, {
        action: AuditAction.ReleaseRollback,
        resourceType: 'site-release',
        resourceId: targetRecord.value.releaseId,
        beforeEtag: draft.etag,
        ...(synchronizedDraft.etag === undefined ? {} : { afterEtag: synchronizedDraft.etag }),
        beforeSha256: calculateJsonSha256(draft.value),
        afterSha256: targetRecord.value.sha256,
        releaseId: targetRecord.value.releaseId,
        manifestBeforeEtag: currentManifest.etag,
        manifestAfterEtag: manifest.etag,
      }));

    return {
      manifest,
      draftSynchronized: synchronizedDraft.synchronized,
    };
  }

  private async trySynchronizeDraft(
    request: FastifyRequest,
    document: SiteDocument,
    expectedEtag: string,
    releaseId: string,
  ): Promise<{ readonly synchronized: boolean; readonly etag?: string }> {
    try {
      const synchronizedDraft = await this.draftService.synchronizeDraft(document, expectedEtag);

      return { synchronized: true, etag: synchronizedDraft.etag };
    } catch (error: unknown) {
      if (error instanceof PreconditionFailedError)
        return { synchronized: false };

      request.log.error(
        { err: error, releaseId, repairNeeded: true },
        'The release was committed, but the draft could not be synchronized.',
      );

      return { synchronized: false };
    }
  }

  private async tryFinalizeReleaseRecord(
    request: FastifyRequest,
    releaseRecord: ReleaseRecord,
    expectedEtag: string,
  ): Promise<void> {
    try {
      await this.privateObjects.putJson(`${releaseRecordPrefix}${releaseRecord.releaseId}.json`, {
        ...releaseRecord,
        status: 'committed',
      }, {
        ifMatch: expectedEtag,
        cacheControl: 'no-store',
      });
    } catch (error: unknown) {
      request.log.error(
        { err: error, releaseId: releaseRecord.releaseId, repairNeeded: true },
        'The manifest was committed, but its release record still needs finalization.',
      );
    }
  }

  private async tryRecordAudit(
    request: FastifyRequest,
    releaseId: string,
    record: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await record();
    } catch (error: unknown) {
      request.log.error(
        { err: error, releaseId, repairNeeded: true },
        'The release was committed, but its audit persistence failed.',
      );
    }
  }

  private async assertPublishedMediaAvailable(document: SiteDocument): Promise<void> {
    const errors: string[] = [];
    const referencedMediaIds = collectReferencedMediaIds(document);
    const publishedAssets = document.media.filter((asset) => (
      typeof asset['id'] === 'string' &&
      referencedMediaIds.has(asset['id']) &&
      typeof asset['path'] === 'string' &&
      asset['path'].startsWith('/content/media/')
    ));

    for (let offset = 0; offset < publishedAssets.length; offset += mediaValidationConcurrency) {
      const batch = publishedAssets.slice(offset, offset + mediaValidationConcurrency);
      const batchErrors = await Promise.all(batch.map((asset) => this.validatePublishedMediaAsset(asset)));

      for (const assetErrors of batchErrors)
        errors.push(...assetErrors);
    }

    if (errors.length > 0)
      throw new InvalidSiteDocumentError(errors);
  }

  private async validatePublishedMediaAsset(
    asset: Readonly<Record<string, unknown>>,
  ): Promise<readonly string[]> {
    const errors: string[] = [];
    const path = typeof asset['path'] === 'string' ? asset['path'] : '';
    const assetId = typeof asset['id'] === 'string' ? asset['id'] : 'unknown';
    const mimeType = typeof asset['mimeType'] === 'string' ? asset['mimeType'] : '';
    const sha256 = typeof asset['sha256'] === 'string' ? asset['sha256'] : '';
    const extension = extensionByMimeType[mimeType];

    if (extension === undefined)
      return [`media.${assetId} has an unsupported MIME type.`];

    const expectedPath = `/content/media/${sha256}.${extension}`;

    if (path !== expectedPath)
      return [`media.${assetId}.path does not match its SHA-256 and MIME type.`];

    const registeredAsset = await this.privateObjects.getJson<MediaAsset>(`${mediaAssetPrefix}${assetId}.json`);

    if (registeredAsset === null || !matchesRegisteredAsset(asset, registeredAsset.value))
      return [`media.${assetId} was not completed by the trusted upload flow.`];

    const storedObject = await this.mediaStore.headObject(`media/${sha256}.${extension}`);

    if (storedObject === null)
      return [`media.${assetId} is missing from the published bucket.`];

    const storedMimeType = storedObject.contentType.split(';', 1)[0]?.trim().toLowerCase();

    if (storedMimeType !== mimeType)
      errors.push(`media.${assetId} does not match its declared MIME type.`);

    if (storedObject.sizeBytes < 1)
      errors.push(`media.${assetId} is empty in the published bucket.`);

    return errors;
  }

  private assertValidRelationships(document: SiteDocument): void {
    const errors = validateSiteDocumentRelationships(document);

    if (errors.length > 0)
      throw new InvalidSiteDocumentError(errors);
  }
}

function matchesRegisteredAsset(
  documentAsset: Readonly<Record<string, unknown>>,
  registeredAsset: MediaAsset,
): boolean {
  return (
    documentAsset['id'] === registeredAsset.id &&
    documentAsset['path'] === registeredAsset.path &&
    documentAsset['mimeType'] === registeredAsset.mimeType &&
    documentAsset['width'] === registeredAsset.width &&
    documentAsset['height'] === registeredAsset.height &&
    documentAsset['sha256'] === registeredAsset.sha256 &&
    documentAsset['provenance'] === registeredAsset.provenance
  );
}

function collectReferencedMediaIds(document: SiteDocument): ReadonlySet<string> {
  const mediaIds = new Set<string>();
  const roots: readonly unknown[] = [
    document.identity,
    document.seo,
    document.header,
    document.footer,
    document.sections,
    document.portfolioCategories,
    document.projects,
  ];

  for (const root of roots)
    collectMediaIds(root, mediaIds);

  return mediaIds;
}

function collectMediaIds(value: unknown, mediaIds: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value)
      collectMediaIds(item, mediaIds);

    return;
  }

  if (typeof value !== 'object' || value === null)
    return;

  for (const [key, item] of Object.entries(value)) {
    if ((key === 'assetId' || key.endsWith('MediaId')) && typeof item === 'string') {
      mediaIds.add(item);
      continue;
    }

    collectMediaIds(item, mediaIds);
  }
}

function createReleaseId(publishedAt: string): string {
  const timestamp = publishedAt.replace(/[-:.TZ]/g, '').toLowerCase();

  return `${timestamp}-${randomUUID()}`;
}

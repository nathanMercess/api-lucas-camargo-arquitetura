import { createHash, randomUUID } from 'node:crypto';
import { FastifyRequest } from 'fastify';
import { AuditAction } from '../audit/audit-action.enum.js';
import { AuditService } from '../audit/audit.service.js';
import { ResourceNotFoundError } from '../shared/resource-not-found.error.js';
import { MediaStore } from '../storage/media-store.interface.js';
import { ObjectStore } from '../storage/object-store.interface.js';
import { MediaAsset } from './media-asset.model.js';
import { MediaNotReadyError } from './media-not-ready.error.js';
import { MediaUploadRequest } from './media-upload-request.model.js';
import { MediaUploadSession } from './media-upload-session.model.js';
import { MediaUploadTicket } from './media-upload-ticket.model.js';

const uploadExpirationSeconds = 300;
const uploadSessionPrefix = 'media/uploads/';
const mediaAssetPrefix = 'media/assets/';

export class MediaService {
  public constructor(
    private readonly privateObjects: ObjectStore,
    private readonly mediaStore: MediaStore,
    private readonly auditService: AuditService,
  ) {}

  public async requestUpload(request: FastifyRequest, input: MediaUploadRequest): Promise<MediaUploadTicket> {
    const principal = request.principal;

    if (principal === null)
      throw new Error('Requesting an upload requires an authenticated principal.');

    const uploadId = randomUUID();
    const assetId = `asset-${input.sha256.slice(0, 32)}`;
    const objectKey = `media/${input.sha256}.${extensionFor(input.mimeType)}`;
    const presignedUpload = await this.mediaStore.createPresignedPut({
      objectKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      expiresInSeconds: uploadExpirationSeconds,
    });
    const session: MediaUploadSession = {
      uploadId,
      assetId,
      objectKey,
      ...input,
      expiresAt: presignedUpload.expiresAt,
      requestedById: principal.subject,
      requestedByEmail: principal.email,
    };

    await this.privateObjects.putJson(`${uploadSessionPrefix}${uploadId}.json`, session, {
      ifNoneMatch: '*',
      cacheControl: 'no-store',
    });

    return {
      uploadId,
      assetId,
      objectKey,
      ...presignedUpload,
    };
  }

  public async completeUpload(request: FastifyRequest, uploadId: string): Promise<MediaAsset> {
    const storedSession = await this.privateObjects.getJson<MediaUploadSession>(`${uploadSessionPrefix}${uploadId}.json`);

    if (storedSession === null)
      throw new ResourceNotFoundError('The upload session does not exist.');

    const principal = request.principal;

    if (principal === null || principal.subject !== storedSession.value.requestedById)
      throw new ResourceNotFoundError('The upload session does not exist.');

    const mediaObject = await this.mediaStore.getObject(storedSession.value.objectKey);

    if (mediaObject === null)
      throw new MediaNotReadyError('The media object has not reached storage yet.');

    const contentType = mediaObject.contentType.split(';', 1)[0]?.trim().toLowerCase();

    if (contentType !== storedSession.value.mimeType)
      throw new MediaNotReadyError('The uploaded media MIME type does not match the signed request.');

    if (mediaObject.body.byteLength !== storedSession.value.sizeBytes)
      throw new MediaNotReadyError('The uploaded media size does not match the signed request.');

    const sha256 = createHash('sha256').update(mediaObject.body).digest('hex');

    if (sha256 !== storedSession.value.sha256)
      throw new MediaNotReadyError('The uploaded media checksum does not match the signed request.');

    if (!hasExpectedFileSignature(mediaObject.body, storedSession.value.mimeType))
      throw new MediaNotReadyError('The uploaded bytes do not match the declared image format.');

    const asset: MediaAsset = {
      id: storedSession.value.assetId,
      path: `/content/${storedSession.value.objectKey}`,
      mimeType: storedSession.value.mimeType,
      width: storedSession.value.width,
      height: storedSession.value.height,
      sha256,
      provenance: storedSession.value.provenance,
    };

    await this.privateObjects.putJson(`${mediaAssetPrefix}${asset.id}.json`, asset, {
      ifNoneMatch: '*',
      cacheControl: 'no-store',
    });
    await this.auditService.record(request, {
      action: AuditAction.MediaComplete,
      resourceType: 'media-asset',
      resourceId: asset.id,
      afterSha256: asset.sha256,
    });

    return asset;
  }

  public async listAssets(): Promise<readonly MediaAsset[]> {
    const objects = await this.privateObjects.listJson<MediaAsset>(mediaAssetPrefix);

    return objects.map((object) => object.value).sort((left, right) => left.id.localeCompare(right.id));
  }
}

function extensionFor(mimeType: MediaUploadRequest['mimeType']): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/avif':
      return 'avif';
  }
}

function hasExpectedFileSignature(body: Uint8Array, mimeType: MediaUploadRequest['mimeType']): boolean {
  switch (mimeType) {
    case 'image/jpeg':
      return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
    case 'image/png':
      return body.length >= 8 && body.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
    case 'image/webp':
      return body.length >= 12 && toAscii(body.slice(0, 4)) === 'RIFF' && toAscii(body.slice(8, 12)) === 'WEBP';
    case 'image/avif':
      return body.length >= 12 && toAscii(body.slice(4, 8)) === 'ftyp' && ['avif', 'avis'].includes(toAscii(body.slice(8, 12)));
  }
}

function toAscii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

import { MediaPresignRequest } from './media-presign-request.model.js';
import { MediaStore } from './media-store.interface.js';
import { PresignedMediaUpload } from './presigned-media-upload.model.js';
import { StoredMediaObject } from './stored-media-object.model.js';
import { StoredMediaMetadata } from './stored-media-metadata.model.js';

export class InMemoryMediaStore implements MediaStore {
  private readonly objects = new Map<string, StoredMediaObject>();

  public async createPresignedPut(request: MediaPresignRequest): Promise<PresignedMediaUpload> {
    return {
      uploadUrl: `https://uploads.invalid/${encodeURIComponent(request.objectKey)}`,
      expiresAt: new Date(Date.now() + request.expiresInSeconds * 1_000).toISOString(),
      requiredHeaders: {
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': request.mimeType,
        'if-none-match': '*',
      },
    };
  }

  public async getObject(key: string): Promise<StoredMediaObject | null> {
    const storedObject = this.objects.get(key);

    if (storedObject === undefined)
      return null;

    return {
      body: storedObject.body.slice(),
      contentType: storedObject.contentType,
    };
  }

  public async headObject(key: string): Promise<StoredMediaMetadata | null> {
    const storedObject = this.objects.get(key);

    if (storedObject === undefined)
      return null;

    return {
      contentType: storedObject.contentType,
      sizeBytes: storedObject.body.byteLength,
    };
  }

  public putUploadedObject(key: string, body: Uint8Array, contentType: string): void {
    this.objects.set(key, {
      body: body.slice(),
      contentType,
    });
  }
}

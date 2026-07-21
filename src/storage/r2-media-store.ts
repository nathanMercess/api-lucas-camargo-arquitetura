import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { R2Config } from '../config/r2-config.model.js';
import { MediaPresignRequest } from './media-presign-request.model.js';
import { MediaStore } from './media-store.interface.js';
import { PresignedMediaUpload } from './presigned-media-upload.model.js';
import { StoredMediaObject } from './stored-media-object.model.js';
import { StoredMediaMetadata } from './stored-media-metadata.model.js';

export class R2MediaStore implements MediaStore {
  private readonly client: S3Client;

  public constructor(private readonly config: R2Config) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: 'auto',
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  public async createPresignedPut(request: MediaPresignRequest): Promise<PresignedMediaUpload> {
    const uploadUrl = await getSignedUrl(this.client, new PutObjectCommand({
      Bucket: this.config.publishedBucket,
      Key: request.objectKey,
      ContentLength: request.sizeBytes,
      ContentType: request.mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
      IfNoneMatch: '*',
    }), {
      expiresIn: request.expiresInSeconds,
      signableHeaders: new Set(['cache-control', 'content-type', 'if-none-match']),
    });

    return {
      uploadUrl,
      expiresAt: new Date(Date.now() + request.expiresInSeconds * 1_000).toISOString(),
      requiredHeaders: {
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': request.mimeType,
        'if-none-match': '*',
      },
    };
  }

  public async getObject(key: string): Promise<StoredMediaObject | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.config.publishedBucket,
        Key: key,
      }));

      if (response.Body === undefined || response.ContentType === undefined)
        throw new Error('R2 returned an incomplete media object response.');

      return {
        body: await response.Body.transformToByteArray(),
        contentType: response.ContentType,
      };
    } catch (error: unknown) {
      if (error instanceof S3ServiceException && (error.name === 'NoSuchKey' || error.$metadata.httpStatusCode === 404))
        return null;

      throw error;
    }
  }

  public async headObject(key: string): Promise<StoredMediaMetadata | null> {
    try {
      const response = await this.client.send(new HeadObjectCommand({
        Bucket: this.config.publishedBucket,
        Key: key,
      }));

      if (response.ContentLength === undefined || response.ContentType === undefined)
        throw new Error('R2 returned incomplete media metadata.');

      return {
        contentType: response.ContentType,
        sizeBytes: response.ContentLength,
      };
    } catch (error: unknown) {
      if (error instanceof S3ServiceException && (error.name === 'NotFound' || error.$metadata.httpStatusCode === 404))
        return null;

      throw error;
    }
  }
}

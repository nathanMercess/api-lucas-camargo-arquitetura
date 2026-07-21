import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { R2Config } from '../config/r2-config.model.js';
import { ObjectStore } from './object-store.interface.js';
import { ListedObject } from './listed-object.model.js';
import { PreconditionFailedError } from './precondition-failed.error.js';
import { PutObjectOptions } from './put-object-options.model.js';
import { StoredObject } from './stored-object.model.js';

export class R2ObjectStore implements ObjectStore {
  private readonly client: S3Client;

  public constructor(private readonly config: R2Config, private readonly bucketName: string) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: 'auto',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  public async getJson<T>(key: string): Promise<StoredObject<T> | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }));

      if (response.Body === undefined || response.ETag === undefined)
        throw new Error('R2 returned an incomplete JSON object response.');

      const serializedValue = await response.Body.transformToString('utf-8');

      return {
        value: JSON.parse(serializedValue) as T,
        etag: response.ETag,
        updatedAt: (response.LastModified ?? new Date()).toISOString(),
      };
    } catch (error: unknown) {
      if (isNotFoundError(error))
        return null;

      throw error;
    }
  }

  public async listJson<T>(prefix: string): Promise<readonly ListedObject<T>[]> {
    const listedObjects: ListedObject<T>[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        ...(continuationToken === undefined ? {} : { ContinuationToken: continuationToken }),
      }));

      for (const listedObject of response.Contents ?? []) {
        if (listedObject.Key === undefined)
          continue;

        const storedObject = await this.getJson<T>(listedObject.Key);

        if (storedObject !== null)
          listedObjects.push({ key: listedObject.Key, ...storedObject });
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken !== undefined);

    return listedObjects;
  }

  public async putJson<T>(key: string, value: T, options: PutObjectOptions = {}): Promise<StoredObject<T>> {
    const serializedValue = JSON.stringify(value);

    try {
      const response = await this.client.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: serializedValue,
        ContentType: 'application/json; charset=utf-8',
        CacheControl: options.cacheControl ?? 'no-store',
        ...(options.ifMatch === undefined ? {} : { IfMatch: options.ifMatch }),
        ...(options.ifNoneMatch === undefined ? {} : { IfNoneMatch: options.ifNoneMatch }),
      }));

      if (response.ETag === undefined)
        throw new Error('R2 did not return an ETag after writing JSON.');

      return {
        value: structuredClone(value),
        etag: response.ETag,
        updatedAt: new Date().toISOString(),
      };
    } catch (error: unknown) {
      if (isPreconditionFailedError(error))
        throw new PreconditionFailedError();

      throw error;
    }
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof S3ServiceException && (error.name === 'NoSuchKey' || error.$metadata.httpStatusCode === 404);
}

function isPreconditionFailedError(error: unknown): boolean {
  return error instanceof S3ServiceException && error.$metadata.httpStatusCode === 412;
}

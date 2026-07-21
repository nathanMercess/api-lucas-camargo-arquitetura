import { createHash } from 'node:crypto';
import { ObjectStore } from './object-store.interface.js';
import { ListedObject } from './listed-object.model.js';
import { PreconditionFailedError } from './precondition-failed.error.js';
import { PutObjectOptions } from './put-object-options.model.js';
import { StoredObject } from './stored-object.model.js';

export class InMemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, StoredObject<unknown>>();

  public async getJson<T>(key: string): Promise<StoredObject<T> | null> {
    const storedObject = this.objects.get(key);

    if (storedObject === undefined)
      return null;

    return cloneStoredObject(storedObject) as StoredObject<T>;
  }

  public async listJson<T>(prefix: string): Promise<readonly ListedObject<T>[]> {
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({
        key,
        ...cloneStoredObject(value) as StoredObject<T>,
      }));
  }

  public async putJson<T>(key: string, value: T, options: PutObjectOptions = {}): Promise<StoredObject<T>> {
    const currentObject = this.objects.get(key);

    if (options.ifMatch !== undefined && currentObject?.etag !== options.ifMatch)
      throw new PreconditionFailedError();

    if (options.ifNoneMatch === '*' && currentObject !== undefined)
      throw new PreconditionFailedError();

    const serializedValue = JSON.stringify(value);
    const storedObject: StoredObject<T> = {
      value: structuredClone(value),
      etag: `"${createHash('sha256').update(serializedValue).digest('hex')}"`,
      updatedAt: new Date().toISOString(),
    };

    this.objects.set(key, cloneStoredObject(storedObject));

    return cloneStoredObject(storedObject);
  }
}

function cloneStoredObject<T>(storedObject: StoredObject<T>): StoredObject<T> {
  return {
    value: structuredClone(storedObject.value),
    etag: storedObject.etag,
    updatedAt: storedObject.updatedAt,
  };
}

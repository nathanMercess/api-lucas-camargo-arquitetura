import { PutObjectOptions } from './put-object-options.model.js';
import { ListedObject } from './listed-object.model.js';
import { StoredObject } from './stored-object.model.js';

export interface ObjectStore {
  getJson<T>(key: string): Promise<StoredObject<T> | null>;
  listJson<T>(prefix: string): Promise<readonly ListedObject<T>[]>;
  putJson<T>(key: string, value: T, options?: PutObjectOptions): Promise<StoredObject<T>>;
}

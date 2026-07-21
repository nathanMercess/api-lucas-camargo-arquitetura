import { AppConfig } from '../config/app-config.model.js';
import { AdminStorage } from './admin-storage.interface.js';
import { InMemoryMediaStore } from './in-memory-media-store.js';
import { InMemoryObjectStore } from './in-memory-object-store.js';
import { R2MediaStore } from './r2-media-store.js';
import { R2ObjectStore } from './r2-object-store.js';
import { StorageDriver } from './storage-driver.enum.js';

export function createAdminStorage(config: AppConfig): AdminStorage {
  if (config.storageDriver === StorageDriver.Memory)
    return {
      privateObjects: new InMemoryObjectStore(),
      publishedObjects: new InMemoryObjectStore(),
      media: new InMemoryMediaStore(),
    };

  if (config.r2 === undefined)
    throw new Error('R2 configuration is required when STORAGE_DRIVER is r2.');

  return {
    privateObjects: new R2ObjectStore(config.r2, config.r2.privateBucket),
    publishedObjects: new R2ObjectStore(config.r2, config.r2.publishedBucket),
    media: new R2MediaStore(config.r2),
  };
}

import { MediaStore } from './media-store.interface.js';
import { ObjectStore } from './object-store.interface.js';

export interface AdminStorage {
  readonly privateObjects: ObjectStore;
  readonly publishedObjects: ObjectStore;
  readonly media: MediaStore;
}

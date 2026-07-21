import { StoredObject } from '../storage/stored-object.model.js';
import { PublishedManifest } from './published-manifest.model.js';

export interface ReleaseMutationResult {
  readonly manifest: StoredObject<PublishedManifest>;
  readonly draftSynchronized: boolean;
}

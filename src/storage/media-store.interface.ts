import { MediaPresignRequest } from './media-presign-request.model.js';
import { PresignedMediaUpload } from './presigned-media-upload.model.js';
import { StoredMediaObject } from './stored-media-object.model.js';
import { StoredMediaMetadata } from './stored-media-metadata.model.js';

export interface MediaStore {
  createPresignedPut(request: MediaPresignRequest): Promise<PresignedMediaUpload>;
  headObject(key: string): Promise<StoredMediaMetadata | null>;
  getObject(key: string): Promise<StoredMediaObject | null>;
}

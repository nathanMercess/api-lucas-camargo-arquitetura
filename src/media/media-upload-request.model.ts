export interface MediaUploadRequest {
  readonly fileName: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly provenance: 'brand' | 'project' | 'reference';
}

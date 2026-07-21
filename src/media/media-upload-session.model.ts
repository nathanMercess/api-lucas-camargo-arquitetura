export interface MediaUploadSession {
  readonly uploadId: string;
  readonly assetId: string;
  readonly objectKey: string;
  readonly fileName: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly provenance: 'brand' | 'project' | 'reference';
  readonly expiresAt: string;
  readonly requestedById: string;
  readonly requestedByEmail: string;
}

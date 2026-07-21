export interface MediaAsset {
  readonly id: string;
  readonly path: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly provenance: 'brand' | 'project' | 'reference';
}

export interface MediaPresignRequest {
  readonly objectKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly expiresInSeconds: number;
}

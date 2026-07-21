export interface PutObjectOptions {
  readonly ifMatch?: string;
  readonly ifNoneMatch?: '*';
  readonly cacheControl?: string;
}

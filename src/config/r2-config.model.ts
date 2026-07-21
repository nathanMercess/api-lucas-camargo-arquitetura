export interface R2Config {
  readonly endpoint: string;
  readonly privateBucket: string;
  readonly publishedBucket: string;
  readonly publishedBaseUrl?: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

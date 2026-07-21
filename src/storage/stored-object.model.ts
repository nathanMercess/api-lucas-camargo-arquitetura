export interface StoredObject<T> {
  readonly value: T;
  readonly etag: string;
  readonly updatedAt: string;
}

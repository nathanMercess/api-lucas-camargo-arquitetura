export interface ListedObject<T> {
  readonly key: string;
  readonly value: T;
  readonly etag: string;
  readonly updatedAt: string;
}

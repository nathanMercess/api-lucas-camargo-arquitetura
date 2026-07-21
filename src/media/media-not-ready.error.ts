export class MediaNotReadyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'MediaNotReadyError';
  }
}

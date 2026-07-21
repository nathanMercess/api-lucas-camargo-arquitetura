export class PreconditionFailedError extends Error {
  public constructor() {
    super('The stored object no longer matches the supplied condition.');
    this.name = 'PreconditionFailedError';
  }
}

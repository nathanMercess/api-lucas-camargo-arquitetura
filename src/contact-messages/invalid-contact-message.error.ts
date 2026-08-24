export class InvalidContactMessageError extends Error {
  public constructor(public readonly validationErrors: readonly string[]) {
    super('The contact message does not match the internal ingestion contract.');
    this.name = 'InvalidContactMessageError';
  }
}

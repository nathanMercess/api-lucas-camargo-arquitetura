export class InvalidSiteDocumentError extends Error {
  public constructor(public readonly relationshipErrors: readonly string[]) {
    super('The site document contains invalid relationships.');
    this.name = 'InvalidSiteDocumentError';
  }
}

export class InvalidContactMessageCursorError extends Error {
  public constructor() {
    super('The contact message cursor is invalid or no longer available.');
    this.name = 'InvalidContactMessageCursorError';
  }
}

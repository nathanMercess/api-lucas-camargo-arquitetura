import { randomUUID } from 'node:crypto';
import { ObjectStore } from '../storage/object-store.interface.js';
import { StoredObject } from '../storage/stored-object.model.js';
import { ContactMessageIngestionContext } from './contact-message-ingestion-context.model.js';
import { ContactMessageIngestionInput } from './contact-message-ingestion-input.model.js';
import { ContactMessageIndex } from './contact-message-index.model.js';
import { ContactMessage } from './contact-message.model.js';
import { ContactMessageStatus } from './contact-message-status.enum.js';
import {
  createContactMessageIndexObjectKey,
  createContactMessageObjectKey,
} from './contact-message-storage.js';
import { InvalidContactMessageError } from './invalid-contact-message.error.js';
import { normalizeContactMessageInput, validateContactMessageInput } from './validate-contact-message.js';

export class ContactMessageIngestionService {
  public constructor(
    private readonly privateObjects: ObjectStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async ingest(
    rawInput: ContactMessageIngestionInput,
    rawContext: ContactMessageIngestionContext,
  ): Promise<StoredObject<ContactMessage>> {
    const input = normalizeContactMessageInput(rawInput);
    const context: ContactMessageIngestionContext = {
      requestId: rawContext.requestId.trim(),
      turnstileHostname: rawContext.turnstileHostname.trim().toLowerCase(),
    };
    const validationErrors = validateContactMessageInput(input, context);

    if (validationErrors.length > 0)
      throw new InvalidContactMessageError(validationErrors);

    const id = randomUUID();
    const receivedAt = this.now().toISOString();
    const message: ContactMessage = {
      schemaVersion: 1,
      id,
      receivedAt,
      status: ContactMessageStatus.New,
      ...input,
      source: 'website',
      requestId: context.requestId,
      turnstileHostname: context.turnstileHostname,
    };

    const objectKey = createContactMessageObjectKey(receivedAt, id);
    const storedMessage = await this.privateObjects.putJson(objectKey, message, {
      ifNoneMatch: '*',
      cacheControl: 'no-store',
    });
    const index: ContactMessageIndex = {
      schemaVersion: 1,
      id,
      objectKey,
    };

    await this.privateObjects.putJson(createContactMessageIndexObjectKey(id), index, {
      ifNoneMatch: '*',
      cacheControl: 'no-store',
    });

    return storedMessage;
  }
}

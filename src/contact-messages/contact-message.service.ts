import { FastifyRequest } from 'fastify';
import { AuditAction } from '../audit/audit-action.enum.js';
import { AuditService } from '../audit/audit.service.js';
import { calculateJsonSha256 } from '../shared/calculate-json-sha256.js';
import { ResourceNotFoundError } from '../shared/resource-not-found.error.js';
import { ListedObject } from '../storage/listed-object.model.js';
import { ObjectStore } from '../storage/object-store.interface.js';
import { PreconditionFailedError } from '../storage/precondition-failed.error.js';
import { StoredObject } from '../storage/stored-object.model.js';
import {
  decodeContactMessageCursor,
  encodeContactMessageCursor,
} from './contact-message-cursor.js';
import { ContactMessageCursor } from './contact-message-cursor.model.js';
import { ContactMessageListQuery } from './contact-message-list-query.model.js';
import { ContactMessageListResponse } from './contact-message-list-response.model.js';
import { ContactMessage } from './contact-message.model.js';
import {
  createContactMessageIndexObjectKey,
  createContactMessageMonthPrefix,
} from './contact-message-storage.js';
import { ContactMessageSummary } from './contact-message-summary.model.js';
import { ContactMessageStatus } from './contact-message-status.enum.js';
import { InvalidContactMessageCursorError } from './invalid-contact-message-cursor.error.js';
import { isValidStoredContactMessage } from './validate-contact-message.js';
import { isValidContactMessageIndex } from './validate-contact-message-index.js';

export const contactMessageRetentionDays = 730;
export const defaultContactMessagePageSize = 25;
export const maximumContactMessagePageSize = 100;

export class ContactMessageService {
  public constructor(
    private readonly privateObjects: ObjectStore,
    private readonly auditService: AuditService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async list(query: ContactMessageListQuery): Promise<ContactMessageListResponse> {
    const cursor = decodeContactMessageCursor(query.cursor);
    const limit = Math.min(
      maximumContactMessagePageSize,
      Math.max(1, query.limit ?? defaultContactMessagePageSize),
    );
    const messages = await this.listPage(query.status, cursor, limit + 1);
    const page = messages.slice(0, limit);
    const items = page.map((storedMessage): ContactMessageSummary => ({
      id: storedMessage.value.id,
      receivedAt: storedMessage.value.receivedAt,
      status: storedMessage.value.status,
      name: storedMessage.value.name,
      email: storedMessage.value.email,
      subject: storedMessage.value.subject,
    }));
    const lastMessage = page.at(-1)?.value;
    const nextCursor = messages.length > limit && lastMessage !== undefined
      ? encodeContactMessageCursor({
          schemaVersion: 1,
          receivedAt: lastMessage.receivedAt,
          id: lastMessage.id,
        })
      : undefined;

    return {
      items,
      ...(nextCursor === undefined ? {} : { nextCursor }),
    };
  }

  public async get(messageId: string): Promise<StoredObject<ContactMessage> | null> {
    const storedMessage = await this.findMessage(messageId);

    if (storedMessage === null)
      return null;

    return {
      value: storedMessage.value,
      etag: storedMessage.etag,
      updatedAt: storedMessage.updatedAt,
    };
  }

  public async updateStatus(
    request: FastifyRequest,
    messageId: string,
    status: ContactMessageStatus,
    expectedEtag: string,
  ): Promise<StoredObject<ContactMessage>> {
    const storedMessage = await this.findMessage(messageId);

    if (storedMessage === null)
      throw new ResourceNotFoundError('The contact message does not exist.');

    if (storedMessage.etag !== expectedEtag)
      throw new PreconditionFailedError();

    if (storedMessage.value.status === status)
      return storedMessage;

    const updatedMessage: ContactMessage = {
      ...storedMessage.value,
      status,
    };
    const savedMessage = await this.privateObjects.putJson(storedMessage.key, updatedMessage, {
      ifMatch: expectedEtag,
      cacheControl: 'no-store',
    });

    await this.auditService.record(request, {
      action: AuditAction.ContactMessageStatusUpdate,
      resourceType: 'contact-message',
      resourceId: messageId,
      beforeEtag: storedMessage.etag,
      afterEtag: savedMessage.etag,
      beforeSha256: calculateJsonSha256(storedMessage.value),
      afterSha256: calculateJsonSha256(savedMessage.value),
    });

    return savedMessage;
  }

  private async listPage(
    status: ContactMessageStatus | undefined,
    cursor: ContactMessageCursor | null,
    requiredItems: number,
  ): Promise<readonly ListedObject<ContactMessage>[]> {
    const now = this.now();
    const retentionThreshold = readRetentionThreshold(now);

    if (cursor !== null && Date.parse(cursor.receivedAt) < retentionThreshold)
      throw new InvalidContactMessageCursorError();

    const cursorDate = cursor === null ? null : new Date(cursor.receivedAt);
    const startDate = cursorDate !== null && cursorDate.getTime() < now.getTime()
      ? cursorDate
      : now;
    const oldestMonth = startOfUtcMonth(new Date(retentionThreshold));
    const messages: ListedObject<ContactMessage>[] = [];
    let month = startOfUtcMonth(startDate);

    while (month.getTime() >= oldestMonth.getTime()) {
      const monthlyObjects = await this.privateObjects.listJson<unknown>(
        createContactMessageMonthPrefix(month),
      );
      const monthlyMessages = monthlyObjects
        .filter((object): object is ListedObject<ContactMessage> => (
          isValidStoredContactMessage(object.value, object.key)
        ))
        .filter((object) => Date.parse(object.value.receivedAt) >= retentionThreshold)
        .filter((object) => status === undefined || object.value.status === status)
        .filter((object) => cursor === null || isAfterCursor(object.value, cursor))
        .sort(compareStoredMessages);

      messages.push(...monthlyMessages);

      if (messages.length >= requiredItems)
        break;

      month = previousUtcMonth(month);
    }

    return messages.slice(0, requiredItems);
  }

  private async findMessage(messageId: string): Promise<ListedObject<ContactMessage> | null> {
    const indexedMessage = await this.findIndexedMessage(messageId);

    if (indexedMessage !== null)
      return indexedMessage;

    return this.findLegacyMessage(messageId);
  }

  private async findIndexedMessage(messageId: string): Promise<ListedObject<ContactMessage> | null> {
    const indexObjectKey = createContactMessageIndexObjectKey(messageId);
    const storedIndex = await this.privateObjects.getJson<unknown>(indexObjectKey);

    if (storedIndex === null || !isValidContactMessageIndex(storedIndex.value, indexObjectKey))
      return null;

    const storedMessage = await this.privateObjects.getJson<unknown>(storedIndex.value.objectKey);

    if (
      storedMessage === null ||
      !isValidStoredContactMessage(storedMessage.value, storedIndex.value.objectKey) ||
      storedMessage.value.id !== messageId ||
      Date.parse(storedMessage.value.receivedAt) < readRetentionThreshold(this.now())
    )
      return null;

    return {
      key: storedIndex.value.objectKey,
      value: storedMessage.value,
      etag: storedMessage.etag,
      updatedAt: storedMessage.updatedAt,
    };
  }

  private async findLegacyMessage(messageId: string): Promise<ListedObject<ContactMessage> | null> {
    const now = this.now();
    const retentionThreshold = readRetentionThreshold(now);
    const oldestMonth = startOfUtcMonth(new Date(retentionThreshold));
    let month = startOfUtcMonth(now);

    while (month.getTime() >= oldestMonth.getTime()) {
      const monthlyObjects = await this.privateObjects.listJson<unknown>(
        createContactMessageMonthPrefix(month),
      );
      const message = monthlyObjects.find((object): object is ListedObject<ContactMessage> => (
        isValidStoredContactMessage(object.value, object.key) &&
        object.value.id === messageId &&
        Date.parse(object.value.receivedAt) >= retentionThreshold
      ));

      if (message !== undefined)
        return message;

      month = previousUtcMonth(month);
    }

    return null;
  }
}

function compareStoredMessages(
  left: ListedObject<ContactMessage>,
  right: ListedObject<ContactMessage>,
): number {
  return (
    right.value.receivedAt.localeCompare(left.value.receivedAt) ||
    right.value.id.localeCompare(left.value.id)
  );
}

function isAfterCursor(message: ContactMessage, cursor: ContactMessageCursor): boolean {
  return (
    message.receivedAt < cursor.receivedAt ||
    (message.receivedAt === cursor.receivedAt && message.id < cursor.id)
  );
}

function readRetentionThreshold(now: Date): number {
  return now.getTime() - contactMessageRetentionDays * 24 * 60 * 60 * 1_000;
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function previousUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}

import { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { AuditAction } from '../audit/audit-action.enum.js';
import { AuditEvent } from '../audit/audit-event.model.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthMode } from '../auth/auth-mode.enum.js';
import { AppConfig } from '../config/app-config.model.js';
import { AdminStorage } from '../storage/admin-storage.interface.js';
import { InMemoryMediaStore } from '../storage/in-memory-media-store.js';
import { InMemoryObjectStore } from '../storage/in-memory-object-store.js';
import { ListedObject } from '../storage/listed-object.model.js';
import { ObjectStore } from '../storage/object-store.interface.js';
import { PutObjectOptions } from '../storage/put-object-options.model.js';
import { StorageDriver } from '../storage/storage-driver.enum.js';
import { StoredObject } from '../storage/stored-object.model.js';
import { decodeContactMessageCursor } from './contact-message-cursor.js';
import { ContactMessageIngestionService } from './contact-message-ingestion.service.js';
import { ContactMessageIndex } from './contact-message-index.model.js';
import { ContactMessageListResponse } from './contact-message-list-response.model.js';
import { ContactMessageService } from './contact-message.service.js';
import {
  contactMessageIndexObjectPrefix,
  contactMessageObjectPrefix,
} from './contact-message-storage.js';
import { ContactMessageStatus } from './contact-message-status.enum.js';
import { InvalidContactMessageError } from './invalid-contact-message.error.js';

const ownerEmail = 'nathan66merces@gmail.com';
const adminOrigin = 'http://localhost:4201';

describe('contact message administration', () => {
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it.each([
    ['name', { name: '<script>' }],
    ['email', { email: 'invalid-address' }],
    ['phone', { phone: '12' }],
    ['subject', { subject: 'x' }],
    ['message', { message: '<script>alert(1)</script>' }],
  ])('rejects unsafe or invalid %s at the reusable ingestion boundary', async (_field, override) => {
    const storage = createTestStorage();
    const ingestion = createIngestion(storage);

    await expect(ingestion.ingest({
      name: 'Ana Souza',
      email: 'ana@example.com',
      phone: '+55 11 99999-9999',
      subject: 'Novo projeto',
      message: 'Gostaria de conversar sobre um novo projeto residencial.',
      ...override,
    }, {
      requestId: 'worker-request-1',
      turnstileHostname: 'lucascamargo.com',
    })).rejects.toBeInstanceOf(InvalidContactMessageError);

    expect(await storage.privateObjects.listJson(contactMessageObjectPrefix)).toEqual([]);
  });

  it('stores the exact private Worker contract under a safe immutable key without sensitive metadata', async () => {
    const storage = createTestStorage();
    const ingestion = createIngestion(storage);
    const storedMessage = await ingestMessage(ingestion, 1);
    const objects = await storage.privateObjects.listJson(contactMessageObjectPrefix);
    const indexes = await storage.privateObjects.listJson<ContactMessageIndex>(contactMessageIndexObjectPrefix);

    expect(objects).toHaveLength(1);
    expect(objects[0]?.key).toMatch(
      /^contacts\/messages\/2026\/08\/24\/20260824T120001000Z-[0-9a-f-]{36}\.json$/,
    );
    expect(storedMessage.value).toEqual({
      schemaVersion: 1,
      id: expect.any(String),
      receivedAt: '2026-08-24T12:00:01.000Z',
      status: ContactMessageStatus.New,
      name: 'Cliente 1',
      email: 'cliente1@example.com',
      phone: '+55 11 99999-0001',
      subject: 'Assunto 1',
      message: 'Mensagem segura de contato número 1.',
      source: 'website',
      requestId: 'worker-request-1',
      turnstileHostname: 'lucascamargo.com',
    });
    expect(JSON.stringify(storedMessage.value)).not.toMatch(/token|cookie|ipAddress/i);
    expect(indexes).toHaveLength(1);
    expect(indexes[0]?.value).toEqual({
      schemaVersion: 1,
      id: storedMessage.value.id,
      objectKey: objects[0]?.key,
    });
  });

  it('ignores expired or extended storage objects instead of exposing untrusted fields', async () => {
    const storage = createTestStorage();
    const ingestion = createIngestion(storage);
    const storedMessage = await ingestMessage(ingestion, 1);
    const validMessage = await ingestMessage(ingestion, 2);
    const objects = await storage.privateObjects.listJson(contactMessageObjectPrefix);
    const objectKey = objects.find((object) => object.value !== null && (
      object.value as { id?: string }
    ).id === storedMessage.value.id)?.key;

    if (objectKey === undefined)
      throw new Error('The ingested contact message must exist.');

    await storage.privateObjects.putJson(objectKey, {
      ...storedMessage.value,
      turnstileToken: 'must-never-be-exposed',
    }, { ifMatch: storedMessage.etag });

    const currentService = new ContactMessageService(
      storage.privateObjects,
      new AuditService(storage.privateObjects),
      () => new Date('2026-08-24T13:00:00.000Z'),
    );
    const expiredService = new ContactMessageService(
      storage.privateObjects,
      new AuditService(storage.privateObjects),
      () => new Date('2029-08-24T13:00:00.000Z'),
    );

    expect((await currentService.list({})).items).toEqual([
      expect.objectContaining({ id: validMessage.value.id }),
    ]);
    expect((await expiredService.list({})).items).toEqual([]);
  });

  it('lists with bounded cursor pagination, filters status and returns details with ETag', async () => {
    const storage = createTestStorage();
    const ingestion = createIngestion(storage);
    await ingestMessage(ingestion, 1);
    await ingestMessage(ingestion, 2);
    await ingestMessage(ingestion, 3);
    const app = await createApp(storage);
    const firstPageResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/contact-messages?limit=2',
    });
    const firstPage = firstPageResponse.json() as ContactMessageListResponse;
    const secondPageResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/contact-messages?limit=2&cursor=${firstPage.nextCursor ?? ''}`,
    });
    const secondPage = secondPageResponse.json() as ContactMessageListResponse;
    const newMessages = (await app.inject({
      method: 'GET',
      url: `/api/v1/contact-messages?status=${ContactMessageStatus.New}`,
    })).json() as ContactMessageListResponse;
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/contact-messages/${firstPage.items[0]?.id ?? ''}`,
    });

    expect(firstPageResponse.statusCode).toBe(200);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeContactMessageCursor(firstPage.nextCursor)).toMatchObject({
      schemaVersion: 1,
      id: firstPage.items[1]?.id,
      receivedAt: firstPage.items[1]?.receivedAt,
    });
    expect(secondPageResponse.statusCode).toBe(200);
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeUndefined();
    expect(newMessages.items).toHaveLength(3);
    expect(detail.statusCode).toBe(200);
    expect(detail.headers.etag).toMatch(/^"[a-f0-9]{64}"$/);
    expect(detail.json()).toMatchObject({ id: firstPage.items[0]?.id, message: expect.any(String) });
  });

  it('continues filtered pagination when the message that produced the cursor changes status', async () => {
    const storage = createTestStorage();
    const ingestion = createIngestion(storage);
    await ingestMessage(ingestion, 1);
    await ingestMessage(ingestion, 2);
    await ingestMessage(ingestion, 3);
    const app = await createApp(storage);
    const firstPage = (await app.inject({
      method: 'GET',
      url: `/api/v1/contact-messages?limit=1&status=${ContactMessageStatus.New}`,
    })).json() as ContactMessageListResponse;
    const cursorMessageId = firstPage.items[0]?.id ?? '';
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/contact-messages/${cursorMessageId}`,
    });
    const update = await app.inject({
      method: 'PATCH',
      url: `/api/v1/contact-messages/${cursorMessageId}/status`,
      headers: mutationHeaders({ 'if-match': detail.headers.etag ?? '' }),
      payload: { status: ContactMessageStatus.Read },
    });
    const secondPageResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/contact-messages?limit=1&status=${ContactMessageStatus.New}&cursor=${firstPage.nextCursor ?? ''}`,
    });
    const secondPage = secondPageResponse.json() as ContactMessageListResponse;

    expect(update.statusCode).toBe(200);
    expect(secondPageResponse.statusCode).toBe(200);
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).not.toBe(cursorMessageId);
  });

  it('reads only the newest monthly prefixes needed to fill the page and lookahead item', async () => {
    const privateObjects = new CountingObjectStore();
    const ingestion = new ContactMessageIngestionService(
      privateObjects,
      createSequenceClock('2026-06-15T12:00:00.000Z'),
    );
    await ingestMessage(ingestion, 1);
    await ingestMessage(ingestion, 2);
    privateObjects.clearListPrefixes();
    const service = new ContactMessageService(
      privateObjects,
      new AuditService(privateObjects),
      () => new Date('2026-08-24T12:00:00.000Z'),
    );
    const page = await service.list({ limit: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeTruthy();
    expect(privateObjects.listPrefixes).toEqual([
      'contacts/messages/2026/08/',
      'contacts/messages/2026/07/',
      'contacts/messages/2026/06/',
    ]);
  });

  it('resolves details through the immutable index and falls back safely for an invalid legacy index', async () => {
    const privateObjects = new CountingObjectStore();
    const storage = createTestStorage(privateObjects);
    const ingestion = createIngestion(storage);
    const message = await ingestMessage(ingestion, 1);
    const app = await createApp(storage);
    privateObjects.clearListPrefixes();
    const indexedDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/contact-messages/${message.value.id}`,
    });

    expect(indexedDetail.statusCode).toBe(200);
    expect(privateObjects.listPrefixes).toEqual([]);

    const indexKey = `${contactMessageIndexObjectPrefix}${message.value.id}.json`;
    const storedIndex = await privateObjects.getJson<ContactMessageIndex>(indexKey);

    if (storedIndex === null)
      throw new Error('The immutable contact index must exist.');

    await privateObjects.putJson(indexKey, {
      ...storedIndex.value,
      objectKey: 'contacts/messages/invalid.json',
    }, { ifMatch: storedIndex.etag });
    privateObjects.clearListPrefixes();
    const fallbackDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/contact-messages/${message.value.id}`,
    });

    expect(fallbackDetail.statusCode).toBe(200);
    expect(privateObjects.listPrefixes).toContain('contacts/messages/2026/08/');
  });

  it('updates status conditionally and audits hashes and ETags without message content', async () => {
    const storage = createTestStorage();
    const ingestion = createIngestion(storage);
    const message = await ingestMessage(ingestion, 1);
    const app = await createApp(storage);
    const url = `/api/v1/contact-messages/${message.value.id}/status`;
    const missingCondition = await app.inject({
      method: 'PATCH',
      url,
      headers: mutationHeaders(),
      payload: { status: ContactMessageStatus.Read },
    });
    const staleCondition = await app.inject({
      method: 'PATCH',
      url,
      headers: mutationHeaders({ 'if-match': '"outdated"' }),
      payload: { status: ContactMessageStatus.Read },
    });
    const update = await app.inject({
      method: 'PATCH',
      url,
      headers: mutationHeaders({ 'if-match': message.etag }),
      payload: { status: ContactMessageStatus.Resolved },
    });
    const events = (await app.inject({
      method: 'GET',
      url: '/api/v1/audit-events',
    })).json() as AuditEvent[];
    const event = events.find((candidate) => candidate.action === AuditAction.ContactMessageStatusUpdate);

    expect(missingCondition.statusCode).toBe(428);
    expect(staleCondition.statusCode).toBe(412);
    expect(update.statusCode).toBe(200);
    expect(update.headers.etag).not.toBe(message.etag);
    expect(update.json()).toMatchObject({ id: message.value.id, status: ContactMessageStatus.Resolved });
    expect(event).toMatchObject({
      resourceType: 'contact-message',
      resourceId: message.value.id,
      beforeEtag: message.etag,
      afterEtag: update.headers.etag,
      beforeSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      afterSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(event)).not.toContain(message.value.message);
  });

  it('keeps ingestion private and enforces IAP, backend authorization, origin and CSRF', async () => {
    const storage = createTestStorage();
    const developmentApp = await createApp(storage);
    const noPublicIngestion = await developmentApp.inject({
      method: 'POST',
      url: '/api/v1/contact-messages',
      headers: mutationHeaders(),
      payload: validPublicLookingPayload(),
    });
    const iapApp = await createApp(createTestStorage(), createTestConfig(AuthMode.Iap));
    const unauthenticated = await iapApp.inject({ method: 'GET', url: '/api/v1/contact-messages' });
    const outsiderApp = await createApp(createTestStorage(), {
      ...createTestConfig(AuthMode.Development),
      developmentPrincipalEmail: 'outsider@example.com',
    });
    const unauthorized = await outsiderApp.inject({ method: 'GET', url: '/api/v1/contact-messages' });
    const ingestion = createIngestion(storage);
    const message = await ingestMessage(ingestion, 1);
    const crossOrigin = await developmentApp.inject({
      method: 'PATCH',
      url: `/api/v1/contact-messages/${message.value.id}/status`,
      headers: {
        host: 'localhost:4201',
        origin: 'https://attacker.invalid',
        'x-admin-csrf': '1',
        'if-match': message.etag,
      },
      payload: { status: ContactMessageStatus.Read },
    });

    expect(noPublicIngestion.statusCode).toBe(404);
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthorized.statusCode).toBe(403);
    expect(crossOrigin.statusCode).toBe(403);
  });

  it('rejects invalid identifiers, filters and oversized status bodies', async () => {
    const app = await createApp(createTestStorage());
    const invalidIdentifier = await app.inject({
      method: 'GET',
      url: '/api/v1/contact-messages/not-a-uuid',
    });
    const invalidFilter = await app.inject({
      method: 'GET',
      url: '/api/v1/contact-messages?limit=101&status=deleted',
    });
    const oversizedBody = await app.inject({
      method: 'PATCH',
      url: '/api/v1/contact-messages/00000000-0000-4000-8000-000000000000/status',
      headers: mutationHeaders({ 'if-match': '"etag"' }),
      payload: {
        status: ContactMessageStatus.Read,
        padding: 'x'.repeat(2_000),
      },
    });

    expect(invalidIdentifier.statusCode).toBe(400);
    expect(invalidFilter.statusCode).toBe(400);
    expect(oversizedBody.statusCode).toBe(413);
  });

  it('returns an opaque 500 response while retaining diagnostics only in server logs', async () => {
    const storage = createTestStorage(new FailingListObjectStore());
    const app = await createApp(storage);
    const response = await app.inject({ method: 'GET', url: '/api/v1/contact-messages' });
    const serializedResponse = JSON.stringify(response.json());

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      type: 'about:blank',
      title: 'Internal server error',
      status: 500,
      detail: 'The request could not be completed.',
    });
    expect(serializedResponse).not.toMatch(/diagnostic|stack|private-storage-secret/i);
  });

  async function createApp(
    storage: AdminStorage,
    config: AppConfig = createTestConfig(AuthMode.Development),
  ): Promise<FastifyInstance> {
    const app = await buildApp(config, storage);

    apps.push(app);

    return app;
  }
});

function createIngestion(storage: AdminStorage): ContactMessageIngestionService {
  return new ContactMessageIngestionService(
    storage.privateObjects,
    createSequenceClock('2026-08-24T12:00:00.000Z'),
  );
}

function createSequenceClock(start: string): () => Date {
  let timestamp = Date.parse(start);

  return () => {
    timestamp += 1_000;

    return new Date(timestamp);
  };
}

function ingestMessage(ingestion: ContactMessageIngestionService, index: number) {
  return ingestion.ingest({
    name: `Cliente ${index}`,
    email: `cliente${index}@example.com`,
    phone: `+55 11 99999-${String(index).padStart(4, '0')}`,
    subject: `Assunto ${index}`,
    message: `Mensagem segura de contato número ${index}.`,
  }, {
    requestId: `worker-request-${index}`,
    turnstileHostname: 'lucascamargo.com',
  });
}

function validPublicLookingPayload() {
  return {
    name: 'Ana Souza',
    email: 'ana@example.com',
    phone: '+55 11 99999-9999',
    subject: 'Novo projeto',
    message: 'Gostaria de conversar sobre um novo projeto.',
  };
}

function mutationHeaders(additionalHeaders: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> {
  return {
    host: 'localhost:4201',
    origin: adminOrigin,
    'sec-fetch-site': 'same-origin',
    'x-admin-csrf': '1',
    ...additionalHeaders,
  };
}

function createTestStorage(privateObjects: ObjectStore = new InMemoryObjectStore()): AdminStorage {
  return {
    privateObjects,
    publishedObjects: new InMemoryObjectStore(),
    media: new InMemoryMediaStore(),
  };
}

class CountingObjectStore implements ObjectStore {
  private readonly delegate = new InMemoryObjectStore();

  public readonly listPrefixes: string[] = [];

  public getJson<T>(key: string): Promise<StoredObject<T> | null> {
    return this.delegate.getJson<T>(key);
  }

  public listJson<T>(prefix: string): Promise<readonly ListedObject<T>[]> {
    this.listPrefixes.push(prefix);

    return this.delegate.listJson<T>(prefix);
  }

  public putJson<T>(
    key: string,
    value: T,
    options?: PutObjectOptions,
  ): Promise<StoredObject<T>> {
    return this.delegate.putJson(key, value, options);
  }

  public clearListPrefixes(): void {
    this.listPrefixes.splice(0);
  }
}

class FailingListObjectStore implements ObjectStore {
  public async getJson<T>(key: string): Promise<StoredObject<T> | null> {
    void key;

    return null;
  }

  public async listJson<T>(prefix: string): Promise<readonly ListedObject<T>[]> {
    void prefix;

    throw new Error('private-storage-secret');
  }

  public async putJson<T>(
    key: string,
    value: T,
    options?: PutObjectOptions,
  ): Promise<StoredObject<T>> {
    void key;
    void value;
    void options;

    throw new Error('private-storage-secret');
  }
}

function createTestConfig(authMode: AuthMode): AppConfig {
  return {
    environment: 'test',
    host: '127.0.0.1',
    port: 8080,
    authMode,
    ...(authMode === AuthMode.Iap ? {
      iapExpectedAudience: '/projects/123/locations/us-east1/services/lucas-camargo-admin',
    } : {}),
    initialOwnerEmail: ownerEmail,
    developmentPrincipalEmail: ownerEmail,
    storageDriver: StorageDriver.Memory,
    adminAllowedOrigins: [adminOrigin],
  };
}

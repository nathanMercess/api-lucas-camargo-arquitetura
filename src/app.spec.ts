import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { AuditAction } from './audit/audit-action.enum.js';
import { AuditEvent } from './audit/audit-event.model.js';
import { AdminRole } from './auth/admin-role.enum.js';
import { AuthMode } from './auth/auth-mode.enum.js';
import { Permission } from './auth/permission.enum.js';
import { AppConfig } from './config/app-config.model.js';
import { loadAppConfig } from './config/load-app-config.js';
import { draftObjectKey } from './content/draft.service.js';
import { SiteDocument } from './content/site-document.model.js';
import { MediaAsset } from './media/media-asset.model.js';
import { MediaUploadTicket } from './media/media-upload-ticket.model.js';
import { PublishedManifest } from './releases/published-manifest.model.js';
import { ReleaseRecord } from './releases/release-record.model.js';
import { AdminStorage } from './storage/admin-storage.interface.js';
import { InMemoryMediaStore } from './storage/in-memory-media-store.js';
import { InMemoryObjectStore } from './storage/in-memory-object-store.js';
import { ListedObject } from './storage/listed-object.model.js';
import { ObjectStore } from './storage/object-store.interface.js';
import { PutObjectOptions } from './storage/put-object-options.model.js';
import { R2MediaStore } from './storage/r2-media-store.js';
import { StorageDriver } from './storage/storage-driver.enum.js';
import { StoredObject } from './storage/stored-object.model.js';

const ownerEmail = 'nathan66merces@gmail.com';
const adminOrigin = 'http://localhost:4201';
const publicSiteConfig = JSON.parse(readFileSync(
  new URL('../test/fixtures/site-config.v1.json', import.meta.url),
  'utf-8',
)) as SiteDocument;

describe('admin API', () => {
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('serves health without an IAP assertion and applies security headers', async () => {
    const app = await createApp(AuthMode.Iap);
    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['x-frame-options']).toBe('DENY');
  });

  it('rejects a protected route when the IAP assertion is absent', async () => {
    const app = await createApp(AuthMode.Iap);
    const response = await app.inject({ method: 'GET', url: '/api/v1/session' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ title: 'Authentication required', status: 401 });
  });

  it('returns explicit owner permissions in a development session', async () => {
    const app = await createApp(AuthMode.Development);
    const response = await app.inject({ method: 'GET', url: '/api/v1/session' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      email: ownerEmail,
      role: AdminRole.Owner,
      publishedContentBaseUrl: '/content',
      permissions: expect.arrayContaining([
        Permission.Publish,
        Permission.Rollback,
        Permission.MediaWrite,
        Permission.AuditRead,
      ]),
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('denies an authenticated identity that has no admin role', async () => {
    const config: AppConfig = {
      ...createTestConfig(AuthMode.Development),
      developmentPrincipalEmail: 'outsider@example.com',
    };
    const app = await buildApp(config, createTestStorage());
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/v1/session' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ title: 'Access denied', status: 403 });
  });

  it('loads both R2 buckets in production without requiring the not-yet-known Worker URL', () => {
    const config = loadAppConfig({
      NODE_ENV: 'production',
      AUTH_MODE: 'iap',
      STORAGE_DRIVER: 'r2',
      IAP_EXPECTED_AUDIENCE: '/projects/123/locations/us-east1/services/lucas-camargo-admin',
      ADMIN_ALLOWED_ORIGINS: 'https://admin.example.com',
      R2_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
      R2_PRIVATE_BUCKET: 'lucas-private',
      R2_PUBLISHED_BUCKET: 'lucas-published',
      R2_ACCESS_KEY_ID: 'access-key',
      R2_SECRET_ACCESS_KEY: 'secret-key',
    });

    expect(config.r2).toMatchObject({
      privateBucket: 'lucas-private',
      publishedBucket: 'lucas-published',
    });
    expect(config.publishedBaseUrl).toBeUndefined();
  });

  it('rejects a non-Cloudflare R2 endpoint in production', () => {
    expect(() => loadAppConfig({
      NODE_ENV: 'production',
      AUTH_MODE: 'iap',
      STORAGE_DRIVER: 'r2',
      IAP_EXPECTED_AUDIENCE: '/projects/123/locations/us-east1/services/lucas-camargo-admin',
      ADMIN_ALLOWED_ORIGINS: 'https://admin.example.com',
      R2_ENDPOINT: 'https://storage.example.com',
      R2_PRIVATE_BUCKET: 'lucas-private',
      R2_PUBLISHED_BUCKET: 'lucas-published',
      R2_ACCESS_KEY_ID: 'access-key',
      R2_SECRET_ACCESS_KEY: 'secret-key',
    })).toThrow('official HTTPS Cloudflare R2 S3 endpoint');
  });

  it('presigns R2 uploads without an empty-body checksum and binds all immutable headers', async () => {
    const mediaStore = new R2MediaStore({
      endpoint: 'https://account.r2.cloudflarestorage.com',
      privateBucket: 'lucas-private',
      publishedBucket: 'lucas-published',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
    });
    const upload = await mediaStore.createPresignedPut({
      objectKey: `media/${'a'.repeat(64)}.png`,
      mimeType: 'image/png',
      sizeBytes: 8,
      expiresInSeconds: 300,
    });
    const uploadUrl = new URL(upload.uploadUrl);
    const signedHeaders = uploadUrl.searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? [];

    expect(uploadUrl.searchParams.has('x-amz-checksum-crc32')).toBe(false);
    expect(signedHeaders).toEqual(expect.arrayContaining([
      'cache-control',
      'content-length',
      'content-type',
      'if-none-match',
    ]));
  });

  it('accepts the complete public SiteConfigV1 fixture for first-draft bootstrap', async () => {
    const app = await createApp(AuthMode.Development);
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/content/draft',
      headers: mutationHeaders({ 'if-none-match': '*' }),
      payload: publicSiteConfig,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(publicSiteConfig);
    expect(response.headers.etag).toMatch(/^"[a-f0-9]{64}"$/);
  });

  it('rejects a structurally valid draft with dangling relationships', async () => {
    const app = await createApp(AuthMode.Development);
    const invalidDocument: SiteDocument = {
      ...publicSiteConfig,
      identity: {
        ...publicSiteConfig.identity,
        faviconMediaId: 'missing-media',
      },
    };
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/content/draft',
      headers: mutationHeaders({ 'if-none-match': '*' }),
      payload: invalidDocument,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      title: 'Invalid content relationships',
      status: 422,
    });
  });

  it('protects first creation and updates with HTTP preconditions', async () => {
    const storage = createTestStorage();
    const app = await createApp(AuthMode.Development, storage);
    const firstCreate = await bootstrapDraft(app);
    const duplicateCreate = await app.inject({
      method: 'PUT',
      url: '/api/v1/content/draft',
      headers: mutationHeaders({ 'if-none-match': '*' }),
      payload: publicSiteConfig,
    });
    const staleUpdate = await app.inject({
      method: 'PUT',
      url: '/api/v1/content/draft',
      headers: mutationHeaders({ 'if-match': '"outdated"' }),
      payload: { ...publicSiteConfig, releaseId: 'draft-two' },
    });
    const validUpdate = await app.inject({
      method: 'PUT',
      url: '/api/v1/content/draft',
      headers: mutationHeaders({ 'if-match': firstCreate.headers.etag ?? '' }),
      payload: { ...publicSiteConfig, releaseId: 'draft-two' },
    });

    expect(duplicateCreate.statusCode).toBe(412);
    expect(staleUpdate.statusCode).toBe(412);
    expect(validUpdate.statusCode).toBe(200);
    expect(validUpdate.headers.etag).not.toBe(firstCreate.headers.etag);

    const storedDraft = await storage.privateObjects.getJson<SiteDocument>(draftObjectKey);

    expect(storedDraft?.value.releaseId).toBe('draft-two');
  });

  it('requires a conditional header, approved same origin and CSRF header for writes', async () => {
    const app = await createApp(AuthMode.Development);
    const missingCondition = await app.inject({
      method: 'PUT',
      url: '/api/v1/content/draft',
      headers: mutationHeaders(),
      payload: publicSiteConfig,
    });
    const missingCsrf = await app.inject({
      method: 'PUT',
      url: '/api/v1/content/draft',
      headers: {
        host: 'localhost:4201',
        origin: adminOrigin,
        'if-none-match': '*',
      },
      payload: publicSiteConfig,
    });
    const crossOrigin = await app.inject({
      method: 'PUT',
      url: '/api/v1/content/draft',
      headers: {
        host: 'localhost:4201',
        origin: 'https://attacker.invalid',
        'x-admin-csrf': '1',
        'if-none-match': '*',
      },
      payload: publicSiteConfig,
    });

    expect(missingCondition.statusCode).toBe(428);
    expect(missingCsrf.statusCode).toBe(403);
    expect(crossOrigin.statusCode).toBe(403);
  });

  it('rejects unknown fields and HTML-bearing content', async () => {
    const app = await createApp(AuthMode.Development);
    const unsafeDocument = {
      ...publicSiteConfig,
      identity: {
        ...publicSiteConfig.identity,
        descriptor: '<script>alert(1)</script>',
      },
      customCss: 'body { display: none; }',
    };
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/content/draft',
      headers: mutationHeaders({ 'if-none-match': '*' }),
      payload: unsafeDocument,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ title: 'Invalid request' });
  });

  it('publishes immutable content, moves the manifest atomically and synchronizes the draft', async () => {
    const storage = createTestStorage();
    const app = await createApp(AuthMode.Development, storage);
    const createdDraft = await bootstrapDraft(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/releases',
      headers: mutationHeaders({ 'if-match': createdDraft.headers.etag ?? '' }),
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['x-draft-synchronized']).toBe('true');

    const manifest = response.json() as PublishedManifest;

    expect(manifest.siteConfigKey).toMatch(/^versions\/[a-z0-9-]+\/site\.json$/);
    expect(manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await storage.publishedObjects.getJson(manifest.siteConfigKey)).not.toBeNull();
    expect((await storage.publishedObjects.getJson<PublishedManifest>('published/manifest.json'))?.value).toEqual(manifest);

    const draft = await storage.privateObjects.getJson<SiteDocument>(draftObjectKey);

    expect(draft?.value.releaseId).toBe(manifest.releaseId);
    expect(draft?.value.publishedAt).toBe(manifest.publishedAt);

    const releasesResponse = await app.inject({ method: 'GET', url: '/api/v1/releases' });
    const releases = releasesResponse.json() as ReleaseRecord[];

    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({
      releaseId: manifest.releaseId,
      sha256: manifest.sha256,
      status: 'committed',
    });
  });

  it('returns a committed release after the manifest commit even when record finalization fails', async () => {
    const storage: AdminStorage = {
      ...createTestStorage(),
      privateObjects: new FinalizationFailingObjectStore(),
    };
    const app = await createApp(AuthMode.Development, storage);
    const createdDraft = await bootstrapDraft(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/releases',
      headers: mutationHeaders({ 'if-match': createdDraft.headers.etag ?? '' }),
    });

    expect(response.statusCode).toBe(201);

    const manifest = response.json() as PublishedManifest;
    const storedManifest = await storage.publishedObjects.getJson<PublishedManifest>('published/manifest.json');
    const releases = (await app.inject({ method: 'GET', url: '/api/v1/releases' })).json() as ReleaseRecord[];

    expect(storedManifest?.value.releaseId).toBe(manifest.releaseId);
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ releaseId: manifest.releaseId, status: 'committed' });
  });

  it('rejects publication when a registered dynamic media object is missing', async () => {
    const storage = createTestStorage();
    const app = await createApp(AuthMode.Development, storage);
    const sha256 = 'b'.repeat(64);
    const asset: MediaAsset = {
      id: 'asset-missing',
      path: `/content/media/${sha256}.png`,
      mimeType: 'image/png',
      width: 1200,
      height: 800,
      sha256,
      provenance: 'project',
    };

    await storage.privateObjects.putJson(`media/assets/${asset.id}.json`, asset, { ifNoneMatch: '*' });

    const draft = await app.inject({
      method: 'PUT',
      url: '/api/v1/content/draft',
      headers: mutationHeaders({ 'if-none-match': '*' }),
      payload: {
        ...publicSiteConfig,
        identity: {
          ...publicSiteConfig.identity,
          logoLightMediaId: asset.id,
        },
        media: [...publicSiteConfig.media, asset],
      },
    });
    const publish = await app.inject({
      method: 'POST',
      url: '/api/v1/releases',
      headers: mutationHeaders({ 'if-match': draft.headers.etag ?? '' }),
    });

    expect(draft.statusCode).toBe(201);
    expect(publish.statusCode).toBe(422);
    expect(publish.json()).toMatchObject({ title: 'Invalid content relationships' });
    expect(await storage.publishedObjects.getJson('published/manifest.json')).toBeNull();
  });

  it('lists releases and rolls the manifest and draft back to an immutable version', async () => {
    const storage = createTestStorage();
    const app = await createApp(AuthMode.Development, storage);
    const createdDraft = await bootstrapDraft(app);
    const firstPublish = await publishDraft(app, createdDraft.headers.etag ?? '');
    const draftAfterFirstPublish = await app.inject({ method: 'GET', url: '/api/v1/content/draft' });
    const update = await app.inject({
      method: 'PUT',
      url: '/api/v1/content/draft',
      headers: mutationHeaders({ 'if-match': draftAfterFirstPublish.headers.etag ?? '' }),
      payload: { ...publicSiteConfig, releaseId: 'second-draft' },
    });
    const secondPublish = await publishDraft(app, update.headers.etag ?? '');
    const draftAfterSecondPublish = await app.inject({ method: 'GET', url: '/api/v1/content/draft' });
    const rollback = await app.inject({
      method: 'POST',
      url: `/api/v1/releases/${firstPublish.releaseId}/rollback`,
      headers: mutationHeaders({ 'if-match': draftAfterSecondPublish.headers.etag ?? '' }),
    });

    expect(secondPublish.releaseId).not.toBe(firstPublish.releaseId);
    expect(rollback.statusCode).toBe(200);
    expect(rollback.json()).toMatchObject({
      releaseId: firstPublish.releaseId,
      previousReleaseId: secondPublish.releaseId,
      sha256: firstPublish.sha256,
    });

    const restoredDraft = await app.inject({ method: 'GET', url: '/api/v1/content/draft' });

    expect(restoredDraft.json()).toMatchObject({ releaseId: firstPublish.releaseId });

    const releases = (await app.inject({ method: 'GET', url: '/api/v1/releases' })).json() as ReleaseRecord[];

    expect(releases).toHaveLength(2);

    const events = (await app.inject({ method: 'GET', url: '/api/v1/audit-events' })).json() as AuditEvent[];

    expect(events.map((event) => event.action)).toEqual(expect.arrayContaining([
      AuditAction.DraftSave,
      AuditAction.ReleasePublish,
      AuditAction.ReleaseRollback,
    ]));
  });

  it('presigns, verifies and registers an immutable media asset in the published namespace', async () => {
    const storage = createTestStorage();
    const app = await createApp(AuthMode.Development, storage);
    const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const sha256 = createHash('sha256').update(pngHeader).digest('hex');
    const requestUpload = await app.inject({
      method: 'POST',
      url: '/api/v1/media/uploads',
      headers: mutationHeaders(),
      payload: {
        fileName: 'portfolio.png',
        mimeType: 'image/png',
        sizeBytes: pngHeader.byteLength,
        sha256,
        width: 1200,
        height: 800,
        provenance: 'project',
      },
    });

    expect(requestUpload.statusCode).toBe(201);

    const ticket = requestUpload.json() as MediaUploadTicket;

    expect(ticket.objectKey).toBe(`media/${sha256}.png`);
    expect(ticket.requiredHeaders).toEqual({
      'cache-control': 'public, max-age=31536000, immutable',
      'content-type': 'image/png',
      'if-none-match': '*',
    });
    (storage.media as InMemoryMediaStore).putUploadedObject(ticket.objectKey, pngHeader, 'image/png');

    const complete = await app.inject({
      method: 'POST',
      url: `/api/v1/media/uploads/${ticket.uploadId}/complete`,
      headers: mutationHeaders(),
    });

    expect(complete.statusCode).toBe(201);
    expect(complete.json()).toMatchObject({
      id: ticket.assetId,
      path: `/content/media/${sha256}.png`,
      mimeType: 'image/png',
      sha256,
    });

    const assets = (await app.inject({ method: 'GET', url: '/api/v1/media/assets' })).json() as MediaAsset[];

    expect(assets).toHaveLength(1);
  });

  it('rejects media completion when bytes do not match the declared image format', async () => {
    const storage = createTestStorage();
    const app = await createApp(AuthMode.Development, storage);
    const unsafeBytes = new TextEncoder().encode('<script>');
    const sha256 = createHash('sha256').update(unsafeBytes).digest('hex');
    const invalidName = await app.inject({
      method: 'POST',
      url: '/api/v1/media/uploads',
      headers: mutationHeaders(),
      payload: {
        fileName: '../fake.png',
        mimeType: 'image/png',
        sizeBytes: unsafeBytes.byteLength,
        sha256,
        width: 1,
        height: 1,
        provenance: 'reference',
      },
    });
    const requestUpload = await app.inject({
      method: 'POST',
      url: '/api/v1/media/uploads',
      headers: mutationHeaders(),
      payload: {
        fileName: 'fake.png',
        mimeType: 'image/png',
        sizeBytes: unsafeBytes.byteLength,
        sha256,
        width: 1,
        height: 1,
        provenance: 'reference',
      },
    });

    expect(invalidName.statusCode).toBe(400);
    const ticket = requestUpload.json() as MediaUploadTicket;

    (storage.media as InMemoryMediaStore).putUploadedObject(ticket.objectKey, unsafeBytes, 'image/png');

    const complete = await app.inject({
      method: 'POST',
      url: `/api/v1/media/uploads/${ticket.uploadId}/complete`,
      headers: mutationHeaders(),
    });

    expect(complete.statusCode).toBe(409);
    expect(complete.json()).toMatchObject({ title: 'Upload not ready' });
  });

  it('records structured actor, request, hash and ETag audit data', async () => {
    const app = await createApp(AuthMode.Development);
    const createdDraft = await bootstrapDraft(app);

    await publishDraft(app, createdDraft.headers.etag ?? '');

    const response = await app.inject({ method: 'GET', url: '/api/v1/audit-events' });
    const events = response.json() as AuditEvent[];
    const publishEvent = events.find((event) => event.action === AuditAction.ReleasePublish);

    expect(response.statusCode).toBe(200);
    expect(events.map((event) => event.action)).toEqual(expect.arrayContaining([
      AuditAction.DraftCreate,
      AuditAction.ReleasePublish,
    ]));
    expect(publishEvent).toMatchObject({
      actorId: `development:${ownerEmail}`,
      actorEmail: ownerEmail,
      resourceType: 'site-release',
    });
    expect(publishEvent?.requestId).toBeTruthy();
    expect(publishEvent?.beforeEtag).toMatch(/^"[a-f0-9]{64}"$/);
    expect(publishEvent?.afterSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(publishEvent?.manifestAfterEtag).toMatch(/^"[a-f0-9]{64}"$/);
  });

  async function createApp(authMode: AuthMode, storage = createTestStorage()): Promise<FastifyInstance> {
    const app = await buildApp(createTestConfig(authMode), storage);

    apps.push(app);

    return app;
  }
});

async function bootstrapDraft(app: FastifyInstance) {
  return app.inject({
    method: 'PUT',
    url: '/api/v1/content/draft',
    headers: mutationHeaders({ 'if-none-match': '*' }),
    payload: publicSiteConfig,
  });
}

async function publishDraft(app: FastifyInstance, draftEtag: string): Promise<PublishedManifest> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/releases',
    headers: mutationHeaders({ 'if-match': draftEtag }),
  });

  expect(response.statusCode).toBe(201);

  return response.json() as PublishedManifest;
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

function createTestStorage(): AdminStorage {
  return {
    privateObjects: new InMemoryObjectStore(),
    publishedObjects: new InMemoryObjectStore(),
    media: new InMemoryMediaStore(),
  };
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

class FinalizationFailingObjectStore implements ObjectStore {
  private readonly delegate = new InMemoryObjectStore();

  private releaseRecordWrites = 0;

  public getJson<T>(key: string): Promise<StoredObject<T> | null> {
    return this.delegate.getJson<T>(key);
  }

  public listJson<T>(prefix: string): Promise<readonly ListedObject<T>[]> {
    return this.delegate.listJson<T>(prefix);
  }

  public putJson<T>(key: string, value: T, options?: PutObjectOptions): Promise<StoredObject<T>> {
    if (key.startsWith('releases/')) {
      this.releaseRecordWrites += 1;

      if (this.releaseRecordWrites === 2)
        throw new Error('Simulated release record finalization failure.');
    }

    return this.delegate.putJson(key, value, options);
  }
}

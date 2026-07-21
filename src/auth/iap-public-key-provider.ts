import { Certificates, OAuth2Client } from 'google-auth-library';

const defaultCacheTtlMs = 60 * 60 * 1_000;
const maximumCacheTtlMs = 24 * 60 * 60 * 1_000;
const minimumRefreshIntervalMs = 60 * 1_000;

export class IapPublicKeyProvider {
  private cachedKeys: Certificates | null = null;

  private expiresAt = 0;

  private lastRefreshAt = 0;

  private refreshPromise: Promise<Certificates> | null = null;

  public constructor(
    private readonly client: OAuth2Client,
    private readonly now: () => number = Date.now,
  ) {}

  public async getKeys(forceRefresh = false): Promise<Certificates> {
    const now = this.now();
    const cachedKeys = this.cachedKeys;
    const refreshIsRateLimited = now - this.lastRefreshAt < minimumRefreshIntervalMs;

    if (cachedKeys !== null && now < this.expiresAt && (!forceRefresh || refreshIsRateLimited))
      return cachedKeys;

    if (this.refreshPromise !== null)
      return this.refreshPromise;

    this.refreshPromise = this.refreshKeys();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async refreshKeys(): Promise<Certificates> {
    const response = await this.client.getIapPublicKeysAsync();
    const refreshedAt = this.now();
    const cacheControl = response.res?.headers.get('cache-control') ?? '';

    this.cachedKeys = response.pubkeys;
    this.lastRefreshAt = refreshedAt;
    this.expiresAt = refreshedAt + parseCacheTtlMs(cacheControl);

    return response.pubkeys;
  }
}

function parseCacheTtlMs(cacheControl: string): number {
  const maxAgeMatch = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl);
  const maxAgeSeconds = maxAgeMatch?.[1] === undefined ? NaN : Number(maxAgeMatch[1]);

  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1)
    return defaultCacheTtlMs;

  return Math.min(maxAgeSeconds * 1_000, maximumCacheTtlMs);
}

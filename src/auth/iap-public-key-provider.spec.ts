import { OAuth2Client } from 'google-auth-library';
import { describe, expect, it, vi } from 'vitest';
import { IapPublicKeyProvider } from './iap-public-key-provider.js';

describe('IapPublicKeyProvider', () => {
  it('caches keys by max-age and refreshes them only after expiration', async () => {
    let now = 1_000_000;
    const client = new OAuth2Client();
    const getKeys = vi.spyOn(client, 'getIapPublicKeysAsync')
      .mockResolvedValueOnce(createResponse('first-key', 120))
      .mockResolvedValueOnce(createResponse('second-key', 120));
    const provider = new IapPublicKeyProvider(client, () => now);

    expect(await provider.getKeys()).toEqual({ key: 'first-key' });
    expect(await provider.getKeys()).toEqual({ key: 'first-key' });
    expect(getKeys).toHaveBeenCalledTimes(1);

    now += 121_000;

    expect(await provider.getKeys()).toEqual({ key: 'second-key' });
    expect(getKeys).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent refreshes and rate-limits forced refreshes', async () => {
    let now = 1_000_000;
    const client = new OAuth2Client();
    const getKeys = vi.spyOn(client, 'getIapPublicKeysAsync')
      .mockResolvedValueOnce(createResponse('first-key', 120))
      .mockResolvedValueOnce(createResponse('rotated-key', 120));
    const provider = new IapPublicKeyProvider(client, () => now);

    const [first, second] = await Promise.all([provider.getKeys(), provider.getKeys()]);

    expect(first).toEqual(second);
    expect(getKeys).toHaveBeenCalledTimes(1);
    expect(await provider.getKeys(true)).toEqual({ key: 'first-key' });
    expect(getKeys).toHaveBeenCalledTimes(1);

    now += 61_000;

    expect(await provider.getKeys(true)).toEqual({ key: 'rotated-key' });
    expect(getKeys).toHaveBeenCalledTimes(2);
  });
});

function createResponse(key: string, maxAgeSeconds: number) {
  return {
    pubkeys: { key },
    res: {
      headers: {
        get: (name: string) => name.toLowerCase() === 'cache-control'
          ? `public, max-age=${maxAgeSeconds}`
          : null,
      },
    },
  } as never;
}

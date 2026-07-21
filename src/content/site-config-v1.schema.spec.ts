import { readFileSync } from 'node:fs';
import Fastify, { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { SiteDocument } from './site-document.model.js';
import { siteConfigV1Schema } from './site-config-v1.schema.js';

const publicSiteConfig = JSON.parse(readFileSync(
  new URL('../../test/fixtures/site-config.v1.json', import.meta.url),
  'utf-8',
)) as SiteDocument;

describe('siteConfigV1Schema templates', () => {
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it.each([
    'lucas-camargo-v1',
    'gallery-v1',
    'minimal-v1',
    'contrast-v1',
  ])('accepts the approved %s template', async (presetId) => {
    const app = createValidationApp();
    const response = await app.inject({
      method: 'POST',
      url: '/validate',
      payload: {
        ...publicSiteConfig,
        theme: {
          ...publicSiteConfig.theme,
          presetId,
        },
      },
    });

    expect(response.statusCode).toBe(204);
  });

  it('rejects an unapproved template identifier', async () => {
    const app = createValidationApp();
    const response = await app.inject({
      method: 'POST',
      url: '/validate',
      payload: {
        ...publicSiteConfig,
        theme: {
          ...publicSiteConfig.theme,
          presetId: 'custom-css-template',
        },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  function createValidationApp(): FastifyInstance {
    const app = Fastify();

    app.post('/validate', {
      schema: { body: siteConfigV1Schema },
    }, (_request, reply) => reply.code(204).send());
    apps.push(app);

    return app;
  }
});

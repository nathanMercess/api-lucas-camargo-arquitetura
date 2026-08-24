import { readFileSync } from 'node:fs';
import Fastify, { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { SiteConfigV1 } from './site-config-v1.model.js';
import { SiteConfigV2 } from './site-config-v2.model.js';
import { siteDocumentSchema } from './site-document.schema.js';

const siteConfigV1 = JSON.parse(readFileSync(
  new URL('../../test/fixtures/site-config.v1.json', import.meta.url),
  'utf-8',
)) as SiteConfigV1;
const siteConfigV2 = JSON.parse(readFileSync(
  new URL('../../test/fixtures/site-config.v2.json', import.meta.url),
  'utf-8',
)) as SiteConfigV2;

describe('siteDocumentSchema', () => {
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it.each([
    ['SiteConfigV1', siteConfigV1],
    ['SiteConfigV2', siteConfigV2],
  ])('accepts %s without weakening the other version', async (_name, document) => {
    const response = await validate(document);

    expect(response.statusCode).toBe(204);
  });

  it('accepts an initially empty project grid', async () => {
    const document = structuredClone(siteConfigV2);
    const home = document.pages[0];

    if (home === undefined)
      throw new Error('The V2 fixture must contain a home page.');

    const projectGrid = home.sections.find((section) => section.type === 'project-grid');

    if (projectGrid === undefined || projectGrid.type !== 'project-grid')
      throw new Error('The V2 fixture must contain a project grid.');

    const response = await validate({
      ...document,
      projects: [],
      pages: [{
        ...home,
        sections: home.sections.map((section) => section.id === projectGrid.id ? {
          ...projectGrid,
          projectIds: [],
        } : section),
      }],
    });

    expect(response.statusCode).toBe(204);
  });

  it('rejects V2-only fields under schemaVersion 1', async () => {
    const response = await validate({
      ...siteConfigV1,
      contact: siteConfigV2.contact,
      pages: siteConfigV2.pages,
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects section types outside the strict V2 catalog', async () => {
    const home = siteConfigV2.pages[0];

    if (home === undefined)
      throw new Error('The V2 fixture must contain a home page.');

    const response = await validate({
      ...siteConfigV2,
      pages: [{
        ...home,
        sections: [{
          ...home.sections[0],
          type: 'portfolio',
        }],
      }],
    });

    expect(response.statusCode).toBe(400);
  });

  it('requires WhatsApp international digits without a plus sign', async () => {
    const response = await validate({
      ...siteConfigV2,
      contact: {
        ...siteConfigV2.contact,
        whatsappNumber: '+5511986681572',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('keeps contact-form content structured without endpoint keys or URLs', async () => {
    const home = siteConfigV2.pages[0];

    if (home === undefined)
      throw new Error('The V2 fixture must contain a home page.');

    const contactForm = home.sections.find((section) => section.type === 'contact-form');

    if (contactForm === undefined || contactForm.type !== 'contact-form')
      throw new Error('The V2 fixture must contain a contact form.');

    const response = await validate(siteConfigV2);
    const propertyNames = Object.keys(contactForm);

    expect(response.statusCode).toBe(204);
    expect(propertyNames.some((name) => /(?:url|key|token)/i.test(name))).toBe(false);
  });

  async function validate(document: unknown) {
    const app = Fastify();

    app.post('/validate', {
      schema: { body: siteDocumentSchema },
    }, (_request, reply) => reply.code(204).send());
    apps.push(app);

    return app.inject({ method: 'POST', url: '/validate', payload: document });
  }
});

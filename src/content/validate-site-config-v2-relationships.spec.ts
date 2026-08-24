import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SiteConfigV2 } from './site-config-v2.model.js';
import { validateSiteDocumentRelationships } from './validate-site-document-relationships.js';

const validDocument = JSON.parse(readFileSync(
  new URL('../../test/fixtures/site-config.v2.json', import.meta.url),
  'utf-8',
)) as SiteConfigV2;

describe('SiteConfigV2 relationships', () => {
  it('accepts the complete V2 fixture', () => {
    expect(validateSiteDocumentRelationships(validDocument)).toEqual([]);
  });

  it('requires exactly one home and derives every page path from its slug', () => {
    const home = readHome();
    const document: SiteConfigV2 = {
      ...validDocument,
      pages: [{ ...home, slug: 'studio', path: '/wrong-path' }],
    };

    expect(validateSiteDocumentRelationships(document)).toEqual(expect.arrayContaining([
      'pages must contain exactly one home page.',
      'pages.home.path must match /studio.',
    ]));
  });

  it('requires the single home page to be visible', () => {
    const home = readHome();
    const document: SiteConfigV2 = {
      ...validDocument,
      pages: [{ ...home, visible: false }],
    };

    expect(validateSiteDocumentRelationships(document)).toContain('pages.home must be visible.');
  });

  it('rejects missing media and project references inside pages', () => {
    const home = readHome();
    const document: SiteConfigV2 = {
      ...validDocument,
      pages: [{
        ...home,
        sections: home.sections.map((section) => {
          if (section.type === 'hero')
            return { ...section, background: { ...section.background, assetId: 'missing-media' } };

          if (section.type === 'project-grid')
            return { ...section, projectIds: ['missing-project'] };

          return section;
        }),
      }],
    };
    const errors = validateSiteDocumentRelationships(document);

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('references missing media missing-media'),
      expect.stringContaining('references missing project missing-project'),
    ]));
  });

  it('requires contact data to remain consistent with the global organization', () => {
    const document: SiteConfigV2 = {
      ...validDocument,
      contact: {
        ...validDocument.contact,
        email: 'outro@example.com',
        phoneE164: '+5511000000000',
      },
    };

    expect(validateSiteDocumentRelationships(document)).toEqual(expect.arrayContaining([
      'contact.email must match seo.organization.email.',
      'contact.phoneE164 must match seo.organization.telephone.',
    ]));
  });

  function readHome() {
    const home = validDocument.pages[0];

    if (home === undefined)
      throw new Error('The V2 fixture must contain a home page.');

    return home;
  }
});

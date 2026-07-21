import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SiteDocument } from './site-document.model.js';
import { validateSiteDocumentRelationships } from './validate-site-document-relationships.js';

const validDocument = JSON.parse(readFileSync(
  new URL('../../test/fixtures/site-config.v1.json', import.meta.url),
  'utf-8',
)) as SiteDocument;

describe('validateSiteDocumentRelationships', () => {
  it('accepts the public fallback configuration', () => {
    expect(validateSiteDocumentRelationships(validDocument)).toEqual([]);
  });

  it('rejects missing media references', () => {
    const document: SiteDocument = {
      ...validDocument,
      identity: {
        ...validDocument.identity,
        faviconMediaId: 'missing-media',
      },
    };

    expect(validateSiteDocumentRelationships(document)).toContain(
      'identity.faviconMediaId references missing media missing-media.',
    );
  });

  it('rejects duplicate identifiers and ordering values', () => {
    const document: SiteDocument = {
      ...validDocument,
      media: [...validDocument.media, validDocument.media[0]],
      sections: [...validDocument.sections, {
        ...validDocument.sections[0],
        id: 'duplicate-section',
      }],
    };

    expect(validateSiteDocumentRelationships(document)).toEqual(expect.arrayContaining([
      'media.id values must be unique.',
      'sections.anchor values must be unique.',
      'sections.order values must be unique.',
    ]));
  });
});

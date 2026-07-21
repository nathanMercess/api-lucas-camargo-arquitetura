import { SiteDocument } from './site-document.model.js';
import { validateSiteDocumentRelationships } from './validate-site-document-relationships.js';
import { validateVisualBuilderDocument } from './validate-visual-builder-document.js';

export function validateSiteDocument(document: SiteDocument): readonly string[] {
  return [
    ...validateSiteDocumentRelationships(document),
    ...validateVisualBuilderDocument(document),
  ];
}

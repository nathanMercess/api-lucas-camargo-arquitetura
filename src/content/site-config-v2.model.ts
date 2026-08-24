import { SiteConfigV1 } from './site-config-v1.model.js';
import { SiteConfigV2Contact } from './site-config-v2-contact.model.js';
import { SiteConfigV2Page } from './site-config-v2-page.model.js';

export interface SiteConfigV2 {
  readonly schemaVersion: 2;
  readonly releaseId: string;
  readonly publishedAt: string;
  readonly locale: 'pt-BR';
  readonly identity: SiteConfigV1['identity'];
  readonly seo: SiteConfigV1['seo'];
  readonly theme: SiteConfigV1['theme'];
  readonly uiLabels: SiteConfigV1['uiLabels'];
  readonly media: SiteConfigV1['media'];
  readonly header: SiteConfigV1['header'];
  readonly navigationItems: SiteConfigV1['navigationItems'];
  readonly portfolioCategories: SiteConfigV1['portfolioCategories'];
  readonly projects: SiteConfigV1['projects'];
  readonly footer: SiteConfigV1['footer'];
  readonly contact: SiteConfigV2Contact;
  readonly pages: readonly SiteConfigV2Page[];
}

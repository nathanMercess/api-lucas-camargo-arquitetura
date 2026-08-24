import { SiteConfigV2Section } from './site-config-v2-section.type.js';

export interface SiteConfigV2Page {
  readonly id: string;
  readonly slug: string;
  readonly path: string;
  readonly order: number;
  readonly visible: boolean;
  readonly seo: Readonly<Record<string, unknown>>;
  readonly sections: readonly SiteConfigV2Section[];
}

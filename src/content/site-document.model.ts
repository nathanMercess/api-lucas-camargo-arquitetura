import { SiteConfigV1 } from './site-config-v1.model.js';
import { SiteConfigV2 } from './site-config-v2.model.js';

export type SiteDocument = SiteConfigV1 | SiteConfigV2;

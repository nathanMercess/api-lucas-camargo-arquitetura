import { SiteConfigV2ContactFormSection } from './site-config-v2-contact-form-section.model.js';
import { SiteConfigV2HeroSection } from './site-config-v2-hero-section.model.js';
import { SiteConfigV2ProjectGridSection } from './site-config-v2-project-grid-section.model.js';
import { SiteConfigV2WhatsappCtaSection } from './site-config-v2-whatsapp-cta-section.model.js';

export type SiteConfigV2Section =
  | SiteConfigV2ContactFormSection
  | SiteConfigV2HeroSection
  | SiteConfigV2ProjectGridSection
  | SiteConfigV2WhatsappCtaSection;

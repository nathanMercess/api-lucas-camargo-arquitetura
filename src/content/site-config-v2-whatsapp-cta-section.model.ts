export interface SiteConfigV2WhatsappCtaSection {
  readonly id: string;
  readonly type: 'whatsapp-cta';
  readonly variant: 'editorial-v1';
  readonly order: number;
  readonly visible: boolean;
  readonly anchor: string;
  readonly overline: string;
  readonly title: Readonly<Record<string, unknown>>;
  readonly body: readonly string[];
  readonly label: string;
  readonly message: string;
}

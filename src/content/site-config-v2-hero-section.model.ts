export interface SiteConfigV2HeroSection {
  readonly id: string;
  readonly type: 'hero';
  readonly variant: 'editorial-v1';
  readonly order: number;
  readonly visible: boolean;
  readonly anchor: string;
  readonly overline: string;
  readonly title: Readonly<Record<string, unknown>>;
  readonly supportingText: Readonly<Record<string, unknown>>;
  readonly portfolioLink: Readonly<Record<string, unknown>>;
  readonly background: Readonly<Record<string, unknown>>;
  readonly indexLabel: string;
  readonly caption: string;
}

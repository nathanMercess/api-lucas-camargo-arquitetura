export interface SiteDocument {
  readonly schemaVersion: 1;
  readonly releaseId: string;
  readonly publishedAt: string;
  readonly locale: 'pt-BR';
  readonly identity: Readonly<Record<string, unknown>>;
  readonly seo: Readonly<Record<string, unknown>>;
  readonly theme: Readonly<Record<string, unknown>>;
  readonly uiLabels: Readonly<Record<string, unknown>>;
  readonly media: readonly Readonly<Record<string, unknown>>[];
  readonly header: Readonly<Record<string, unknown>>;
  readonly navigationItems: readonly Readonly<Record<string, unknown>>[];
  readonly sections: readonly Readonly<Record<string, unknown>>[];
  readonly portfolioCategories: readonly Readonly<Record<string, unknown>>[];
  readonly projects: readonly Readonly<Record<string, unknown>>[];
  readonly footer: Readonly<Record<string, unknown>>;
}

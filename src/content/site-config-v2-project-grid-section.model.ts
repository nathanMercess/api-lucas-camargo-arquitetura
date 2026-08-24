export interface SiteConfigV2ProjectGridSection {
  readonly id: string;
  readonly type: 'project-grid';
  readonly variant: 'grid-v1';
  readonly order: number;
  readonly visible: boolean;
  readonly anchor: string;
  readonly overline: string;
  readonly title: Readonly<Record<string, unknown>>;
  readonly description: readonly string[];
  readonly projectIds: readonly string[];
  readonly maxColumns: number;
}

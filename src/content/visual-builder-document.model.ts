import { VisualBuilderProjectValue } from './visual-builder-project-value.type.js';

export interface VisualBuilderDocument {
  readonly enabled: boolean;
  readonly projectData: Readonly<Record<string, VisualBuilderProjectValue>>;
  readonly html: string;
  readonly css: string;
}

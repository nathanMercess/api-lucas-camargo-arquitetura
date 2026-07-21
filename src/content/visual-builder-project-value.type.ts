export type VisualBuilderProjectValue =
  | boolean
  | null
  | number
  | string
  | readonly VisualBuilderProjectValue[]
  | { readonly [key: string]: VisualBuilderProjectValue };

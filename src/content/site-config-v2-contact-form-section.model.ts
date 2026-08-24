export interface SiteConfigV2ContactFormSection {
  readonly id: string;
  readonly type: 'contact-form';
  readonly variant: 'default-v1';
  readonly order: number;
  readonly visible: boolean;
  readonly anchor: string;
  readonly overline: string;
  readonly title: Readonly<Record<string, unknown>>;
  readonly description: readonly string[];
  readonly nameLabel: string;
  readonly emailLabel: string;
  readonly phoneLabel: string;
  readonly subjectLabel: string;
  readonly messageLabel: string;
  readonly submitLabel: string;
  readonly successMessage: string;
  readonly errorMessage: string;
  readonly privacyNotice: string;
}

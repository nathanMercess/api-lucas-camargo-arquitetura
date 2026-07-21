export interface MediaUploadTicket {
  readonly uploadId: string;
  readonly assetId: string;
  readonly objectKey: string;
  readonly uploadUrl: string;
  readonly expiresAt: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

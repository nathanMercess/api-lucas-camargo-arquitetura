import { AuthMode } from '../auth/auth-mode.enum.js';
import { StorageDriver } from '../storage/storage-driver.enum.js';
import { AppEnvironment } from './app-environment.type.js';
import { R2Config } from './r2-config.model.js';

export interface AppConfig {
  readonly environment: AppEnvironment;
  readonly host: string;
  readonly port: number;
  readonly authMode: AuthMode;
  readonly iapExpectedAudience?: string;
  readonly initialOwnerEmail: string;
  readonly developmentPrincipalEmail: string;
  readonly storageDriver: StorageDriver;
  readonly r2?: R2Config;
  readonly adminAllowedOrigins: readonly string[];
  readonly publishedBaseUrl?: string;
}

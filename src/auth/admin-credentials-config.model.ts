import { AdminCredential } from './admin-credential.model.js';

export interface AdminCredentialsConfig {
  readonly version: 1;
  readonly users: readonly AdminCredential[];
}

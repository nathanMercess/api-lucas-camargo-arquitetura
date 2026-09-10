import { argon2Verify } from 'hash-wasm';
import { AdminCredential } from './admin-credential.model.js';
import { AdminPrincipal } from './admin-principal.model.js';

const dummyPasswordHash = '$argon2id$v=19$m=19456,t=2,p=1$bHVjYXMtY2FtYXJnby1kdW1teQ$i8rjww9Ap+FGFT3SNUXb9+gxN4t/TxHTQYTsWnB0PJs';

export class CredentialsAuthenticationService {
  public constructor(private readonly credentials: readonly AdminCredential[]) {}

  public async authenticate(username: string, password: string): Promise<AdminPrincipal | null> {
    const normalizedUsername = username.trim().toLowerCase();
    const credential = this.credentials.find((item) =>
      item.username.toLowerCase() === normalizedUsername && item.active);
    const passwordHash = credential?.passwordHash ?? dummyPasswordHash;
    let passwordMatches = false;

    try {
      passwordMatches = await argon2Verify({ password, hash: passwordHash });
    } catch {
      return null;
    }

    if (!credential || !passwordMatches)
      return null;

    return {
      subject: `credentials:${credential.id}`,
      email: credential.email,
    };
  }
}

import { createHash, randomBytes } from 'node:crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AdminPrincipal } from './admin-principal.model.js';

const sessionTtlSeconds = 8 * 60 * 60;

export class AdminSessionService {
  private readonly sessions = new Map<string, {
    readonly principal: AdminPrincipal;
    readonly expiresAt: number;
  }>();
  private readonly cookieName: string;

  public constructor(private readonly secureCookies: boolean) {
    this.cookieName = secureCookies ? '__Host-lc-admin-session' : 'lc-admin-session';
  }

  public create(principal: AdminPrincipal, reply: FastifyReply): void {
    this.removeExpiredSessions();

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);

    this.sessions.set(tokenHash, {
      principal,
      expiresAt: Date.now() + sessionTtlSeconds * 1_000,
    });
    reply.setCookie(this.cookieName, token, {
      path: '/',
      httpOnly: true,
      secure: this.secureCookies,
      sameSite: 'strict',
      maxAge: sessionTtlSeconds,
    });
  }

  public resolve(request: FastifyRequest): AdminPrincipal | null {
    const token = request.cookies[this.cookieName];

    if (!token)
      return null;

    const tokenHash = this.hashToken(token);
    const session = this.sessions.get(tokenHash);

    if (!session)
      return null;

    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(tokenHash);
      return null;
    }

    return session.principal;
  }

  public invalidate(request: FastifyRequest, reply: FastifyReply): void {
    const token = request.cookies[this.cookieName];

    if (token)
      this.sessions.delete(this.hashToken(token));

    reply.clearCookie(this.cookieName, {
      path: '/',
      httpOnly: true,
      secure: this.secureCookies,
      sameSite: 'strict',
    });
  }

  private removeExpiredSessions(): void {
    const now = Date.now();

    for (const [tokenHash, session] of this.sessions)
      if (session.expiresAt <= now)
        this.sessions.delete(tokenHash);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

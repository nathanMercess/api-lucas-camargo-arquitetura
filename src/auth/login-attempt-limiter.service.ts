const attemptWindowMs = 15 * 60 * 1_000;
const accountAttemptLimit = 5;
const addressAttemptLimit = 20;

export class LoginAttemptLimiterService {
  private readonly attempts = new Map<string, {
    readonly count: number;
    readonly expiresAt: number;
  }>();

  public canAttempt(username: string, address: string): boolean {
    return this.getAttemptCount(this.accountKey(username)) < accountAttemptLimit
      && this.getAttemptCount(this.addressKey(address)) < addressAttemptLimit;
  }

  public recordFailure(username: string, address: string): void {
    this.increment(this.accountKey(username));
    this.increment(this.addressKey(address));
  }

  public recordSuccess(username: string, address: string): void {
    this.attempts.delete(this.accountKey(username));
    this.attempts.delete(this.addressKey(address));
  }

  private increment(key: string): void {
    const currentCount = this.getAttemptCount(key);

    this.attempts.set(key, {
      count: currentCount + 1,
      expiresAt: Date.now() + attemptWindowMs,
    });
  }

  private getAttemptCount(key: string): number {
    const attempt = this.attempts.get(key);

    if (!attempt)
      return 0;

    if (attempt.expiresAt > Date.now())
      return attempt.count;

    this.attempts.delete(key);
    return 0;
  }

  private accountKey(username: string): string {
    return `account:${username.trim().toLowerCase()}`;
  }

  private addressKey(address: string): string {
    return `address:${address}`;
  }
}

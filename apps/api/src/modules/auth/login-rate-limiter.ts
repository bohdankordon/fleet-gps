import { Inject, Injectable, Optional } from "@nestjs/common";

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1_000;
export const LOGIN_RATE_LIMIT_BLOCK_MS = 15 * 60 * 1_000;
export const LOGIN_RATE_LIMIT_FAILURES = 5;
export const LOGIN_RATE_LIMIT_MAX_ENTRIES = 10_000;
export const LOGIN_RATE_LIMITER_OPTIONS = Symbol("LOGIN_RATE_LIMITER_OPTIONS");

type Entry = {
  failures: number[];
  blockedUntil: number | null;
};

export type LoginRateLimiterOptions = Readonly<{
  now?: () => number;
  maxEntries?: number;
  windowMs?: number;
  blockMs?: number;
  failureLimit?: number;
}>;

@Injectable()
export class LoginRateLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly maxEntries: number;
  private readonly windowMs: number;
  private readonly blockMs: number;
  private readonly failureLimit: number;

  public constructor(@Optional() @Inject(LOGIN_RATE_LIMITER_OPTIONS) options: LoginRateLimiterOptions = {}) {
    this.now = options.now ?? Date.now;
    this.maxEntries = options.maxEntries ?? LOGIN_RATE_LIMIT_MAX_ENTRIES;
    this.windowMs = options.windowMs ?? LOGIN_RATE_LIMIT_WINDOW_MS;
    this.blockMs = options.blockMs ?? LOGIN_RATE_LIMIT_BLOCK_MS;
    this.failureLimit = options.failureLimit ?? LOGIN_RATE_LIMIT_FAILURES;
    if (!Number.isInteger(this.maxEntries) || this.maxEntries < 1) throw new Error("Login limiter capacity must be a positive integer.");
  }

  public isBlocked(canonicalLogin: string): boolean {
    const now = this.now();
    this.reclaimExpired(now);
    const entry = this.entries.get(canonicalLogin);
    return entry?.blockedUntil !== null && entry?.blockedUntil !== undefined && entry.blockedUntil > now;
  }

  public recordFailure(canonicalLogin: string): void {
    const now = this.now();
    this.reclaimExpired(now);
    let entry = this.entries.get(canonicalLogin);
    if (!entry) {
      this.ensureCapacity();
      entry = { failures: [], blockedUntil: null };
    }
    if (entry.blockedUntil !== null && entry.blockedUntil > now) return;
    entry.failures = entry.failures.filter((failedAt) => failedAt > now - this.windowMs);
    entry.failures.push(now);
    if (entry.failures.length >= this.failureLimit) entry.blockedUntil = now + this.blockMs;
    this.touch(canonicalLogin, entry);
  }

  public clear(canonicalLogin: string): void {
    this.entries.delete(canonicalLogin);
  }

  public get size(): number {
    return this.entries.size;
  }

  private reclaimExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      const blockExpired = entry.blockedUntil !== null && entry.blockedUntil <= now;
      const failuresExpired = entry.blockedUntil === null && (entry.failures.at(-1) ?? -Infinity) <= now - this.windowMs;
      if (blockExpired || failuresExpired) this.entries.delete(key);
    }
  }

  private ensureCapacity(): void {
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
    }
  }

  private touch(key: string, entry: Entry): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }
}

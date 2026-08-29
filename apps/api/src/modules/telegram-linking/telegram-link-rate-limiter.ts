import { Injectable } from "@nestjs/common";

const WINDOW_MS = 10 * 60 * 1_000;
const LIMIT = 5;
type Entry = { startedAt: number; count: number };
@Injectable()
export class TelegramLinkRateLimiter {
  private readonly entries = new Map<string, Entry>();
  public check(userId: string, now = Date.now()): boolean {
    const current = this.entries.get(userId);
    if (!current || now - current.startedAt >= WINDOW_MS) { this.entries.set(userId, { startedAt: now, count: 1 }); return true; }
    if (current.count >= LIMIT) return false;
    current.count += 1; return true;
  }
}
export const TELEGRAM_LINK_RATE_LIMIT = Object.freeze({ limit: LIMIT, windowMs: WINDOW_MS });

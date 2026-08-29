import { RECIPIENT_DELIVERY_MAX_AGE_MS } from "./recipient-delivery.repository";
export const RECIPIENT_DELIVERY_MAX_ATTEMPTS = 12;
export function recipientDeliveryRetryDelayMs(attemptNumber: number): number { if (!Number.isInteger(attemptNumber) || attemptNumber < 1) throw new RangeError("Attempt number must be positive"); return Math.min(60, 2 ** (attemptNumber - 1)) * 60_000; }
export function recipientDeliveryExhausted(attemptNumber: number, createdAt: Date, now = new Date()): "MAX_ATTEMPTS" | "MAX_AGE" | null { if (now.getTime() - createdAt.getTime() >= RECIPIENT_DELIVERY_MAX_AGE_MS) return "MAX_AGE"; return attemptNumber >= RECIPIENT_DELIVERY_MAX_ATTEMPTS ? "MAX_ATTEMPTS" : null; }

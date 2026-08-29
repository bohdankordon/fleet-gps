import { timingSafeEqual } from "node:crypto";

/** Server-only ingress check: API repeats the check at the semantic boundary. */
export function verifyTelegramWebhookSecret(value: string | null, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const expected = env.TELEGRAM_PRODUCT_WEBHOOK_SECRET?.trim();
  if (!expected || !value) return false;
  const supplied = Buffer.from(value);
  const configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

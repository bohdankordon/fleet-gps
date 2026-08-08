import type { AlertNotificationErrorCode } from "./alert-notification-outbox.types";

export type TelegramNotificationTransport = Readonly<{
  sendAlertConfirmed(message: string): Promise<void>;
}>;

export class TelegramTransportError extends Error {
  public constructor(public readonly code: AlertNotificationErrorCode, public readonly retryable: boolean) {
    super(`Telegram notification transport failed (${code})`);
    this.name = "TelegramTransportError";
  }
}

export type TelegramFailureClassification = Readonly<{ code: AlertNotificationErrorCode; retryable: boolean }>;

export function classifyTelegramHttpStatus(status: number): TelegramFailureClassification {
  if (status === 429) return Object.freeze({ code: "HTTP_429", retryable: true });
  if (status >= 500 && status <= 599) return Object.freeze({ code: "HTTP_5XX", retryable: true });
  if (status >= 400 && status <= 499) return Object.freeze({ code: "HTTP_4XX", retryable: false });
  return Object.freeze({ code: "INVALID_RESPONSE", retryable: true });
}

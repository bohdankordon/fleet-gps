import type { TelegramNotificationsConfig } from "../../config/api-config";
import { TelegramTransportError, classifyTelegramHttpStatus, type TelegramNotificationTransport } from "./telegram-notification.transport";

export const TELEGRAM_REQUEST_TIMEOUT_MS = 10_000;

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function telegramEndpoint(token: string): string {
  return `https://api.telegram.org/bot${token}/sendMessage`;
}

function isTelegramSuccessPayload(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === true;
}

export class TelegramBotNotificationTransport implements TelegramNotificationTransport {
  public constructor(
    private readonly config: TelegramNotificationsConfig,
    private readonly fetchImplementation: FetchImplementation = globalThis.fetch,
    private readonly requestTimeoutMs = TELEGRAM_REQUEST_TIMEOUT_MS,
  ) {}

  public async sendAlertConfirmed(message: string): Promise<void> {
    const token = this.config.botToken;
    const chatId = this.config.chatId;
    if (!this.config.enabled || token === null || chatId === null) throw new TelegramTransportError("HTTP_4XX", false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      let response: Response;
      try {
        response = await this.fetchImplementation(telegramEndpoint(token), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: message }),
          signal: controller.signal,
        });
      } catch {
        throw new TelegramTransportError(controller.signal.aborted ? "TIMEOUT" : "NETWORK", true);
      }

      if (!response.ok) {
        const classified = classifyTelegramHttpStatus(response.status);
        throw new TelegramTransportError(classified.code, classified.retryable);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new TelegramTransportError(controller.signal.aborted ? "TIMEOUT" : "INVALID_RESPONSE", true);
      }
      if (!isTelegramSuccessPayload(payload)) throw new TelegramTransportError("TELEGRAM_REJECTED", false);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const telegramBotNotificationTransportInternals = Object.freeze({ telegramEndpoint, isTelegramSuccessPayload });

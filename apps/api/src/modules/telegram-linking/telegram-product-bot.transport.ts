import { Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
export type TelegramProductFailureCode = "NETWORK" | "TIMEOUT" | "HTTP_429" | "HTTP_4XX" | "HTTP_5XX" | "INVALID_RESPONSE";
export interface TelegramProductBotTransport { sendLinkSuccess(chatId: bigint): Promise<void>; sendLinkFailure(chatId: bigint): Promise<void>; sendHelp(chatId: bigint): Promise<void>; sendAlertConfirmed(chatId: bigint, text: string): Promise<void>; }
export const TELEGRAM_PRODUCT_BOT_TRANSPORT = Symbol("TELEGRAM_PRODUCT_BOT_TRANSPORT");
export const TELEGRAM_PRODUCT_BOT_TIMEOUT_MS = 5_000;
export class TelegramProductTransportError extends Error {
  public constructor(public readonly code: TelegramProductFailureCode = "INVALID_RESPONSE", public readonly retryable = false, public readonly recipientPermanent = false) { super("TELEGRAM_PRODUCT_TRANSPORT_FAILED"); this.name = "TelegramProductTransportError"; }
}
@Injectable()
export class TelegramProductBotHttpTransport implements TelegramProductBotTransport {
  private fetcher: typeof fetch = fetch;
  private timeoutMs = TELEGRAM_PRODUCT_BOT_TIMEOUT_MS;
  public constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}
  private async send(chatId: bigint, text: string, requireLinkingEnabled: boolean): Promise<void> {
    const token = this.config.telegramProductLinking?.botToken;
    if (!token || (requireLinkingEnabled && !this.config.telegramProductLinking?.enabled)) return;
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ chat_id: chatId.toString(), text }), signal: controller.signal });
      const payload: unknown = await response.json().catch(() => null);
      if (response.ok && typeof payload === "object" && payload !== null && !Array.isArray(payload) && (payload as Record<string, unknown>).ok === true && typeof (payload as Record<string, unknown>).result === "object" && (payload as Record<string, unknown>).result !== null) return;
      const description = typeof payload === "object" && payload !== null && !Array.isArray(payload) ? (payload as Record<string, unknown>).description : undefined;
      const recipientPermanent = response.status === 403 || (response.status === 400 && typeof description === "string" && /chat not found|user is deactivated|bot was blocked/i.test(description));
      if (response.status === 429) throw new TelegramProductTransportError("HTTP_429", true);
      if (response.status >= 500) throw new TelegramProductTransportError("HTTP_5XX", true);
      if (response.status >= 400) throw new TelegramProductTransportError("HTTP_4XX", false, recipientPermanent);
      throw new TelegramProductTransportError("INVALID_RESPONSE", true);
    } catch (error) {
      if (error instanceof TelegramProductTransportError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") throw new TelegramProductTransportError("TIMEOUT", true);
      throw new TelegramProductTransportError("NETWORK", true);
    } finally { clearTimeout(timeout); }
  }
  public sendLinkSuccess(chatId: bigint): Promise<void> { return this.send(chatId, "Telegram підключено до Fleet GPS.", true); }
  public sendLinkFailure(chatId: bigint): Promise<void> { return this.send(chatId, "Посилання недійсне. Створіть нове в Fleet GPS.", true); }
  public sendHelp(chatId: bigint): Promise<void> { return this.send(chatId, "Відкрийте Fleet GPS, щоб підключити Telegram.", true); }
  public sendAlertConfirmed(chatId: bigint, text: string): Promise<void> { return this.send(chatId, text, false); }
}

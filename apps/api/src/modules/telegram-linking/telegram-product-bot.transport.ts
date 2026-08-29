import { Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
export interface TelegramProductBotTransport { sendLinkSuccess(chatId: bigint): Promise<void>; sendLinkFailure(chatId: bigint): Promise<void>; sendHelp(chatId: bigint): Promise<void>; }
export const TELEGRAM_PRODUCT_BOT_TRANSPORT = Symbol("TELEGRAM_PRODUCT_BOT_TRANSPORT");
export const TELEGRAM_PRODUCT_BOT_TIMEOUT_MS = 5_000;
export class TelegramProductTransportError extends Error {
  public constructor() { super("TELEGRAM_PRODUCT_TRANSPORT_FAILED"); this.name = "TelegramProductTransportError"; }
}
@Injectable()
export class TelegramProductBotHttpTransport implements TelegramProductBotTransport {
  private fetcher: typeof fetch = fetch;
  private timeoutMs = TELEGRAM_PRODUCT_BOT_TIMEOUT_MS;
  public constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}
  private async send(chatId: bigint, text: string): Promise<void> {
    const token = this.config.telegramProductLinking?.botToken;
    if (!this.config.telegramProductLinking?.enabled || !token) return;
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ chat_id: chatId.toString(), text }), signal: controller.signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || typeof payload !== "object" || payload === null || Array.isArray(payload) || (payload as Record<string, unknown>).ok !== true || typeof (payload as Record<string, unknown>).result !== "object" || (payload as Record<string, unknown>).result === null) throw new TelegramProductTransportError();
    } catch {
      throw new TelegramProductTransportError();
    } finally { clearTimeout(timeout); }
  }
  public sendLinkSuccess(chatId: bigint): Promise<void> { return this.send(chatId, "Telegram підключено до Taxi GPS."); }
  public sendLinkFailure(chatId: bigint): Promise<void> { return this.send(chatId, "Посилання недійсне. Створіть нове в Taxi GPS."); }
  public sendHelp(chatId: bigint): Promise<void> { return this.send(chatId, "Відкрийте Taxi GPS, щоб підключити Telegram."); }
}

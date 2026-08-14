// Host-level Telegram operational notifier. The bot token is held in memory
// only: it is never passed through process argv, never written to stdout/stderr
// or the journal, never embedded in an incident body, and never included in an
// exception message. Raw Telegram response bodies are never logged.

import { NOTIFICATION_KIND } from "./monitor-state.mjs";

export const TELEGRAM_REQUEST_TIMEOUT_MS = 10_000;

export class TelegramNotifyError extends Error {
  constructor(code) {
    super("Telegram operational notification failed (" + code + ")");
    this.name = "TelegramNotifyError";
    this.code = code;
  }
}

function telegramEndpoint(apiBase, botToken) {
  return apiBase + "/bot" + botToken + "/sendMessage";
}

function classifyStatus(status) {
  if (status === 429) return "HTTP_429";
  if (typeof status === "number" && status >= 500 && status <= 599) return "HTTP_5XX";
  if (typeof status === "number" && status >= 400 && status <= 499) return "HTTP_4XX";
  return "INVALID_RESPONSE";
}

export class TelegramNotifier {
  constructor({ botToken, chatId, fetchImplementation = globalThis.fetch, requestTimeoutMs = TELEGRAM_REQUEST_TIMEOUT_MS, apiBase = "https://api.telegram.org" }) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.fetchImplementation = fetchImplementation;
    this.requestTimeoutMs = requestTimeoutMs;
    this.apiBase = apiBase;
  }

  async sendMessage(text) {
    if (typeof this.botToken !== "string" || this.botToken === "" || typeof this.chatId !== "string" || this.chatId === "") {
      throw new TelegramNotifyError("MISSING_CREDENTIALS");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      let response;
      try {
        response = await this.fetchImplementation(telegramEndpoint(this.apiBase, this.botToken), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: this.chatId, text }),
          signal: controller.signal,
        });
      } catch {
        throw new TelegramNotifyError(controller.signal.aborted ? "TIMEOUT" : "NETWORK");
      }

      if (!response || typeof response.ok !== "boolean") throw new TelegramNotifyError("INVALID_RESPONSE");
      if (!response.ok) throw new TelegramNotifyError(classifyStatus(response.status));

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new TelegramNotifyError("INVALID_RESPONSE");
      }
      if (typeof payload !== "object" || payload === null || payload.ok !== true) {
        throw new TelegramNotifyError("TELEGRAM_REJECTED");
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const telegramNotifierInternals = Object.freeze({ telegramEndpoint, classifyStatus });

// Deliver the notification decided by the incident state machine and commit the
// success/failure next-state it prescribed. A NONE decision performs zero
// transport calls. A delivery failure advances no notification state.
export async function deliverOperationalNotification({ plan, buildText, send }) {
  if (plan.kind === NOTIFICATION_KIND.NONE) {
    return { nextState: plan.nextOnSuccess, delivered: null };
  }
  try {
    await send(buildText(plan.kind, plan.reportFingerprints));
    return { nextState: plan.nextOnSuccess, delivered: true };
  } catch {
    return { nextState: plan.nextOnFailure, delivered: false };
  }
}

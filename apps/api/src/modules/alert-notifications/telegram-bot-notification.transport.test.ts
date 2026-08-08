import assert from "node:assert/strict";
import test from "node:test";
import type { TelegramNotificationsConfig } from "../../config/api-config";
import { TelegramBotNotificationTransport } from "./telegram-bot-notification.transport";
import { TelegramTransportError } from "./telegram-notification.transport";

const token = "test-token-never-log";
const chatId = "test-chat-never-log";
const config: TelegramNotificationsConfig = Object.freeze({ enabled: true, botToken: token, chatId });

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

test("Telegram transport forms the internal sendMessage URL and sends POST JSON without parse mode", async () => {
  let input: string | URL | Request | undefined;
  let init: RequestInit | undefined;
  const transport = new TelegramBotNotificationTransport(config, async (value, options) => {
    input = value;
    init = options;
    return jsonResponse({ ok: true, result: {} });
  });
  const message = "safe alert text";

  await transport.sendAlertConfirmed(message);

  assert.equal(input, `https://api.telegram.org/bot${token}/sendMessage`);
  assert.equal(init?.method, "POST");
  assert.equal((init?.headers as Record<string, string>)["content-type"], "application/json");
  assert.deepEqual(JSON.parse(String(init?.body)), { chat_id: chatId, text: message });
  assert.equal("parse_mode" in JSON.parse(String(init?.body)), false);
  assert.ok(init?.signal instanceof AbortSignal);
});

test("HTTP 200 with Telegram ok false is a safe permanent failure", async () => {
  const leakedBody = "private raw response";
  const transport = new TelegramBotNotificationTransport(config, async () => jsonResponse({ ok: false, description: leakedBody }));
  await assert.rejects(transport.sendAlertConfirmed("safe"), (error: unknown) => {
    assert.ok(error instanceof TelegramTransportError);
    assert.equal(error.code, "TELEGRAM_REJECTED");
    assert.equal(error.retryable, false);
    assert.equal(`${error.message} ${JSON.stringify(error)}`.includes(leakedBody), false);
    assert.equal(`${error.message} ${JSON.stringify(error)}`.includes(token), false);
    assert.equal(`${error.message} ${JSON.stringify(error)}`.includes(chatId), false);
    return true;
  });
});

test("HTTP status classification distinguishes 429, 5xx, and permanent 4xx", async () => {
  const cases = [
    { status: 429, code: "HTTP_429", retryable: true },
    { status: 500, code: "HTTP_5XX", retryable: true },
    { status: 400, code: "HTTP_4XX", retryable: false },
  ] as const;
  for (const expected of cases) {
    const transport = new TelegramBotNotificationTransport(config, async () => jsonResponse({ private: "body" }, expected.status));
    await assert.rejects(transport.sendAlertConfirmed("safe"), (error: unknown) => {
      assert.ok(error instanceof TelegramTransportError);
      assert.equal(error.code, expected.code);
      assert.equal(error.retryable, expected.retryable);
      assert.equal(JSON.stringify(error).includes("body"), false);
      return true;
    });
  }
});

test("timeout aborts the bounded request and returns only a safe timeout code", async () => {
  let observedSignal: AbortSignal | undefined;
  const transport = new TelegramBotNotificationTransport(config, async (_input, init) => {
    observedSignal = init?.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => observedSignal?.addEventListener("abort", () => reject(new Error(`request failed ${token}`)), { once: true }));
  }, 5);
  await assert.rejects(transport.sendAlertConfirmed("safe"), (error: unknown) => {
    assert.ok(error instanceof TelegramTransportError);
    assert.equal(error.code, "TIMEOUT");
    assert.equal(error.retryable, true);
    assert.equal(error.message.includes(token), false);
    return true;
  });
  assert.equal(observedSignal?.aborted, true);
});

test("network failures are retryable and do not retain the raw error", async () => {
  const transport = new TelegramBotNotificationTransport(config, async () => { throw new Error(`network leaked ${token} ${chatId}`); });
  await assert.rejects(transport.sendAlertConfirmed("safe"), (error: unknown) => {
    assert.ok(error instanceof TelegramTransportError);
    assert.equal(error.code, "NETWORK");
    assert.equal(error.retryable, true);
    const serialized = `${error.message} ${JSON.stringify(error)}`;
    assert.equal(serialized.includes(token), false);
    assert.equal(serialized.includes(chatId), false);
    return true;
  });
});

test("malformed success JSON is a retryable invalid response without body leakage", async () => {
  const leakedBody = `malformed ${token} ${chatId}`;
  const transport = new TelegramBotNotificationTransport(config, async () => new Response(leakedBody, { status: 200 }));
  await assert.rejects(transport.sendAlertConfirmed("safe"), (error: unknown) => {
    assert.ok(error instanceof TelegramTransportError);
    assert.equal(error.code, "INVALID_RESPONSE");
    assert.equal(error.retryable, true);
    assert.equal(`${error.message} ${JSON.stringify(error)}`.includes(leakedBody), false);
    return true;
  });
});

test("disabled or incomplete transport fails before fetch", async () => {
  let calls = 0;
  const transport = new TelegramBotNotificationTransport({ enabled: false, botToken: null, chatId: null }, async () => { calls += 1; return jsonResponse({ ok: true }); });
  await assert.rejects(transport.sendAlertConfirmed("safe"), TelegramTransportError);
  assert.equal(calls, 0);
});

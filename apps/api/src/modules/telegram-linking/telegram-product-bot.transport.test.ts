import assert from "node:assert/strict";
import test from "node:test";
import { TelegramProductBotHttpTransport, TelegramProductTransportError } from "./telegram-product-bot.transport";

const config = Object.freeze({ telegramProductLinking: Object.freeze({ enabled: true, botUsername: "TaxiGpsTestBot", botToken: "test-product-token", webhookSecret: "test-secret" }) }) as any;
const chatId = 4_000_000_001n;
function transport(fetcher: typeof fetch, timeoutMs?: number): TelegramProductBotHttpTransport { const value = new TelegramProductBotHttpTransport(config); (value as any).fetcher = fetcher; if (timeoutMs !== undefined) (value as any).timeoutMs = timeoutMs; return value; }

test("product transport sends only the explicit webhook chat ID and a minimal Ukrainian confirmation", async () => {
  const calls: Request[] = [];
  const sender = transport((async (input, init) => { calls.push(new Request(input, init)); return Response.json({ ok: true, result: { message_id: 1 } }); }) as typeof fetch);
  await sender.sendLinkSuccess(chatId);
  assert.equal(calls.length, 1); assert.match(calls[0]!.url, /bottest-product-token\/sendMessage$/);
  assert.deepEqual(await calls[0]!.json(), { chat_id: "4000000001", text: "Telegram підключено до Taxi GPS." });
  assert.equal(calls[0]!.url.includes("TELEGRAM_CHAT_ID"), false);
});

test("product transport strictly rejects Telegram HTTP, payload, network, and timeout failures without leaking credentials", async () => {
  const failures: Array<[string, typeof fetch]> = [
    ["ok false", async () => Response.json({ ok: false, result: {} })],
    ["malformed json", async () => new Response("not json", { status: 200, headers: { "content-type": "application/json" } })],
    ["missing result", async () => Response.json({ ok: true })],
    ["4xx", async () => Response.json({ ok: false }, { status: 400 })],
    ["429", async () => Response.json({ ok: false }, { status: 429 })],
    ["5xx", async () => Response.json({ ok: false }, { status: 503 })],
    ["network", async () => { throw new Error("network detail that must not escape"); }],
  ];
  for (const [label, fetcher] of failures) {
    await assert.rejects(transport(fetcher).sendHelp(chatId), (error: unknown) => {
      assert.ok(error instanceof TelegramProductTransportError, label);
      const value = `${error.message} ${JSON.stringify(error)}`;
      assert.equal(value.includes("test-product-token"), false); assert.equal(value.includes("network detail"), false);
      return true;
    });
  }
  let sawAbort = false;
  const timeoutFetcher: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
    const signal = init?.signal as AbortSignal; signal.addEventListener("abort", () => { sawAbort = true; reject(new DOMException("aborted", "AbortError")); }, { once: true });
  });
  await assert.rejects(transport(timeoutFetcher, 1).sendLinkFailure(chatId), TelegramProductTransportError);
  assert.equal(sawAbort, true);
});

test("product bot messages provide only minimal Ukrainian linking guidance", async () => {
  const messages: string[] = [];
  const sender = transport((async (_input, init) => { messages.push(JSON.parse(String(init?.body)).text); return Response.json({ ok: true, result: {} }); }) as typeof fetch);
  await sender.sendLinkFailure(chatId); await sender.sendHelp(chatId);
  assert.deepEqual(messages, ["Посилання недійсне. Створіть нове в Taxi GPS.", "Відкрийте Taxi GPS, щоб підключити Telegram."]);
  for (const message of messages) for (const sensitive of ["4000000001", "token", "secret", "hash"]) assert.equal(message.toLowerCase().includes(sensitive), false);
});

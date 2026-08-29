import assert from "node:assert/strict";
import test from "node:test";
import { BFF_REQUEST_BODY_LIMIT_BYTES } from "../http/bounded-body";
import { forwardTelegramWebhook } from "./telegram-webhook-ingress";

const env = Object.freeze({ API_INTERNAL_BASE_URL: "http://api.internal.test", TELEGRAM_PRODUCT_WEBHOOK_SECRET: "webhook-test-secret" });
function request(body: string, headers: Record<string, string> = {}): Request { return new Request("http://web.test/api/telegram/product/webhook", { method: "POST", headers: { "content-type": "application/json", ...headers }, body }); }

test("public Telegram ingress authenticates before reading a body and forwards only bounded JSON plus the secret header", async () => {
  const calls: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => { calls.push(new Request(input, init)); return Response.json({ ok: true }); };
  assert.equal((await forwardTelegramWebhook(request("x".repeat(BFF_REQUEST_BODY_LIMIT_BYTES + 1)), env, fetcher)).status, 401);
  assert.equal(calls.length, 0);
  assert.equal((await forwardTelegramWebhook(request("{}", { "x-telegram-bot-api-secret-token": "wrong" }), env, fetcher)).status, 401);
  assert.equal(calls.length, 0);
  const body = JSON.stringify({ update_id: 12, message: { text: "/help" } });
  const response = await forwardTelegramWebhook(request(body, { "x-telegram-bot-api-secret-token": "webhook-test-secret", cookie: "taxi_session=must-not-forward", authorization: "Bearer must-not-forward" }), env, fetcher);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls.length, 1); assert.equal(calls[0]!.url, "http://api.internal.test/api/telegram/product/webhook");
  assert.equal(calls[0]!.method, "POST"); assert.equal(calls[0]!.headers.get("content-type"), "application/json");
  assert.equal(calls[0]!.headers.get("x-telegram-bot-api-secret-token"), "webhook-test-secret");
  assert.equal(calls[0]!.headers.get("cookie"), null); assert.equal(calls[0]!.headers.get("authorization"), null);
  assert.equal(await calls[0]!.text(), body);
});

test("public Telegram ingress bounds oversized and wrong-content requests without forwarding", async () => {
  let calls = 0; const fetcher: typeof fetch = async () => { calls += 1; return Response.json({ ok: true }); };
  const headers = { "x-telegram-bot-api-secret-token": "webhook-test-secret" };
  assert.equal((await forwardTelegramWebhook(request("x".repeat(BFF_REQUEST_BODY_LIMIT_BYTES + 1), headers), env, fetcher)).status, 413);
  assert.equal((await forwardTelegramWebhook(request("{}", { ...headers, "content-type": "text/plain" }), env, fetcher)).status, 400);
  assert.equal(calls, 0);
});

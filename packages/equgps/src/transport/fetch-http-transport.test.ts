import assert from "node:assert/strict";
import test from "node:test";
import type { HttpRequest } from "../contracts/http";
import { EquGpsForbiddenError, EquGpsHttpError, EquGpsNetworkError, EquGpsRateLimitError, EquGpsResponseValidationError, EquGpsTimeoutError, EquGpsUnauthorizedError } from "../errors/equgps-errors";
import { FetchHttpTransport } from "./fetch-http-transport";

const request = (overrides: Partial<HttpRequest> = {}): HttpRequest => ({ operation: "getDevices", method: "GET", url: "https://example.test/devices", headers: { Accept: "application/json" }, timeoutMs: 1_000, ...overrides });

async function withFetch(stub: typeof fetch, action: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try { await action(); } finally { globalThis.fetch = original; }
}

test("GET sends no Content-Type and parses JSON once", async () => {
  let captured: RequestInit | undefined;
  await withFetch((async (_input, init) => { captured = init; return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } }); }) as typeof fetch, async () => {
    assert.deepEqual((await new FetchHttpTransport().execute(request())).body, { ok: true });
  });
  assert.equal(new Headers(captured?.headers).get("content-type"), null);
});

test("form POST serializes the form and sets Content-Type", async () => {
  let captured: RequestInit | undefined;
  await withFetch((async (_input, init) => { captured = init; return new Response("ok", { headers: { "Content-Type": "text/plain" } }); }) as typeof fetch, async () => {
    assert.equal((await new FetchHttpTransport().execute(request({ operation: "createSession", method: "POST", formBody: { email: "test@example.test", password: "secret" } }))).body, "ok");
  });
  assert.equal(new Headers(captured?.headers).get("content-type"), "application/x-www-form-urlencoded");
  assert.equal(captured?.body, "email=test%40example.test&password=secret");
});

test("text and empty response bodies are represented safely", async () => {
  await withFetch((async () => new Response("plain", { headers: { "Content-Type": "text/plain" } })) as typeof fetch, async () => {
    assert.equal((await new FetchHttpTransport().execute(request())).body, "plain");
  });
  await withFetch((async () => new Response(null, { status: 204 })) as typeof fetch, async () => {
    assert.equal((await new FetchHttpTransport().execute(request())).body, null);
  });
});

test("timeout covers a response body that has not finished reading", async () => {
  let signal: AbortSignal | undefined;
  const response = {
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": "application/json" }),
    text: () => new Promise<string>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted")))),
  } as unknown as Response;
  await withFetch((async (_input, init) => { signal = init?.signal ?? undefined; return response; }) as typeof fetch, async () => {
    await assert.rejects(() => new FetchHttpTransport().execute(request({ timeoutMs: 1 })), EquGpsTimeoutError);
  });
});

test("body read errors are normalized and successful reads clear the timer", async () => {
  const failingResponse = { ok: true, status: 200, headers: new Headers({ "Content-Type": "text/plain" }), text: async () => { throw new Error("body failed"); } } as unknown as Response;
  await withFetch((async () => failingResponse) as typeof fetch, async () => {
    await assert.rejects(() => new FetchHttpTransport().execute(request()), EquGpsNetworkError);
  });
  let signal: AbortSignal | undefined;
  await withFetch((async (_input, init) => { signal = init?.signal ?? undefined; return new Response("ok", { headers: { "Content-Type": "text/plain" } }); }) as typeof fetch, async () => {
    await new FetchHttpTransport().execute(request({ timeoutMs: 5 }));
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 15));
  assert.equal(signal?.aborted, false);
});

test("timeout, network, invalid JSON and HTTP statuses map to safe errors", async () => {
  const timeoutFetch = ((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  })) as typeof fetch;
  await withFetch(timeoutFetch, async () => {
    await assert.rejects(() => new FetchHttpTransport().execute(request({ timeoutMs: 1 })), EquGpsTimeoutError);
  });
  await withFetch((async () => { throw new Error("network"); }) as typeof fetch, async () => {
    await assert.rejects(() => new FetchHttpTransport().execute(request()), EquGpsNetworkError);
  });
  await withFetch((async () => new Response("{", { headers: { "Content-Type": "application/json" } })) as typeof fetch, async () => {
    await assert.rejects(() => new FetchHttpTransport().execute(request()), (error: Error) => error instanceof EquGpsResponseValidationError && error.diagnosticCode === "invalid_json");
  });
  for (const [status, ErrorType] of [[401, EquGpsUnauthorizedError], [403, EquGpsForbiddenError], [429, EquGpsRateLimitError], [500, EquGpsHttpError]] as const) {
    await withFetch((async () => new Response("ignored", { status })) as typeof fetch, async () => {
      await assert.rejects(() => new FetchHttpTransport().execute(request({ url: "https://example.test/?token=secret" })), ErrorType);
    });
  }
});

test("transport errors do not serialize URLs, forms, or credentials", async () => {
  await withFetch((async () => new Response("ignored", { status: 500 })) as typeof fetch, async () => {
    await assert.rejects(
      () => new FetchHttpTransport().execute(request({ url: "https://example.test/?token=secret", formBody: { password: "secret", email: "test@example.test" } })),
      (error: Error) => !JSON.stringify(error).includes("secret") && !error.message.includes("example.test"),
    );
  });
});

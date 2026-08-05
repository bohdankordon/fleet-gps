import assert from "node:assert/strict";
import test from "node:test";
import { FakeHttpTransport } from "./fake-transport";

test("fake transport captures requests for unit tests without network access", async () => {
  const transport = new FakeHttpTransport(async () => ({ status: 200, headers: {}, body: { ok: true } }));
  const response = await transport.execute({ method: "GET", url: "https://example.test/health", headers: {}, timeoutMs: 1_000 });
  assert.equal(response.status, 200);
  assert.equal(transport.requests.length, 1);
});

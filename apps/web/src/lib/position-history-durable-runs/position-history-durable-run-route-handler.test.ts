import assert from "node:assert/strict";
import test from "node:test";
import { createDurableRunReadRouteHandler, createDurableRunRouteHandler } from "./position-history-durable-run-route-handler";

const exact = "2026-08-11T02:00:00.000Z";
const run = { id: "00000000-0000-4000-8000-000000000123", status: "PENDING", initiatorType: "USER", to: exact, excludeProviderDisabled: true, windowBudget: 1000, committedWindows: 0, createdAt: exact, startedAt: null, finishedAt: null, failureCategory: null } as const;
function request(headers: Record<string, string> = { Origin: "http://app.test", "Sec-Fetch-Site": "same-origin" }, body: unknown = { to: exact, windowBudget: 1000, excludeProviderDisabled: true }): Request { return new Request("http://app.test/api/system/position-history/population-runs", { method: "POST", headers: { ...headers, "Content-Type": "application/json", Cookie: "preference=dark; taxi_session=secret-token; analytics=yes" }, body: JSON.stringify(body) }); }

test("same-origin create sends one strict upstream request and returns no-store", async () => {
  let calls = 0; let seen: unknown;
  const response = await createDurableRunRouteHandler(async (body) => { calls += 1; seen = body; return Response.json(run, { status: 201 }); })(request());
  assert.equal(response.status, 201); assert.equal(calls, 1); assert.deepEqual(seen, { to: exact, windowBudget: 1000, excludeProviderDisabled: true }); assert.equal(response.headers.get("cache-control"), "no-store");
});

test("cross-site, same-site, mismatched origin, and spoofed fields make zero upstream calls", async () => {
  let calls = 0; const handler = createDurableRunRouteHandler(async () => { calls += 1; return Response.json(run); });
  for (const headers of [{ Origin: "http://app.test", "Sec-Fetch-Site": "cross-site" }, { Origin: "http://app.test", "Sec-Fetch-Site": "same-site" }, { Origin: "https://evil.test", "Sec-Fetch-Site": "same-origin" }]) assert.equal((await handler(request(headers))).status, 403);
  for (const body of [{ to: exact, windowBudget: 24, excludeProviderDisabled: true }, { to: exact, windowBudget: 1000, excludeProviderDisabled: true, requestedByUserId: "other" }]) assert.equal((await handler(request(undefined, body))).status, 400);
  assert.equal(calls, 0);
});

test("409 and 5xx are stable and never expose upstream internals", async () => {
  for (const status of [409, 500] as const) {
    const response = await createDurableRunRouteHandler(async () => Response.json({ rawProviderBody: "token=secret", coordinates: [1, 2] }, { status }))(request());
    const body = await response.text(); assert.equal(response.status, status === 409 ? 409 : 503); assert.equal(body.includes("secret"), false); assert.equal(body.includes("coordinates"), false); assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("active and recent read handlers are no-store, safe, and do no hidden execution", async () => {
  let reads = 0;
  // Phase 0: active uses explicit { active: run | null } envelope, never empty body.
  const active = await createDurableRunReadRouteHandler(async () => { reads += 1; return Response.json({ active: run }); }, "active")();
  const recent = await createDurableRunReadRouteHandler(async () => { reads += 1; return Response.json([{ ...run, status: "SUCCEEDED", finishedAt: exact }]); }, "recent")();
  assert.equal(active.status, 200); assert.equal(recent.status, 200); assert.equal(reads, 2); assert.equal(active.headers.get("cache-control"), "no-store");
  assert.deepEqual(await active.json(), { active: run });
  const none = await createDurableRunReadRouteHandler(async () => Response.json({ active: null }), "active")();
  assert.equal(none.status, 200); assert.deepEqual(await none.json(), { active: null });
});

test("active/recent preserve safe authorization status and mask upstream failures", async () => {
  for (const status of [401, 403, 500] as const) {
    const response = await createDurableRunReadRouteHandler(async () => Response.json({ secret: "raw-token" }, { status }), "active")();
    const text = await response.text(); assert.equal(response.status, status === 500 ? 503 : status); assert.equal(text.includes("raw-token"), false);
  }
});

test("active envelope rejects empty body and raw run as contract failure, never successful none", async () => {
  const empty = await createDurableRunReadRouteHandler(async () => new Response(null, { status: 200 }), "active")();
  assert.equal(empty.status, 503);
  const raw = await createDurableRunReadRouteHandler(async () => Response.json(run), "active")();
  assert.equal(raw.status, 503);
});

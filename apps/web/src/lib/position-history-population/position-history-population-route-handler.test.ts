import assert from "node:assert/strict";
import test from "node:test";
import { createPositionHistoryPopulationRouteHandler } from "./position-history-population-route-handler";

const exact = "2026-08-11T02:00:00.000Z";
const result = { to: exact, maxWindows: 24, excludeProviderDisabled: true, committedWindows: 4, providerRequests: 5, rowsReceived: 7, candidates: 6, inserted: 4, duplicates: 2, invalid: 1, retries: 1, rateLimits: 1, slicesTotal: 13, slicesVisited: 1, slicesAlreadyComplete: 0, providerDisabledExcluded: 2, stoppedByBudget: false, horizonComplete: false };
function request(headers: Record<string, string> = { Origin: "http://app.test", "Sec-Fetch-Site": "same-origin" }, body: unknown = { to: exact, maxWindows: 24, excludeProviderDisabled: true }): Request { return new Request("http://app.test/api/system/position-history/horizon-populate", { method: "POST", headers: { ...headers, "Content-Type": "application/json", Cookie: "preference=dark; taxi_session=secret-token; analytics=yes" }, body: JSON.stringify(body) }); }

test("supported Chromium same-origin POST reaches upstream exactly once with only approved fields", async () => {
  let calls = 0; let seen: unknown;
  const response = await createPositionHistoryPopulationRouteHandler(async (body) => { calls += 1; seen = body; return Response.json(result); })(request());
  assert.equal(response.status, 200); assert.equal(calls, 1); assert.deepEqual(seen, { to: exact, maxWindows: 24, excludeProviderDisabled: true }); assert.equal(response.headers.get("cache-control"), "no-store");
});

test("cross-site, same-site, and mismatched Origin writes make zero upstream calls", async () => {
  let calls = 0; const handler = createPositionHistoryPopulationRouteHandler(async () => { calls += 1; return Response.json(result); });
  for (const headers of [{ Origin: "http://app.test", "Sec-Fetch-Site": "cross-site" }, { Origin: "http://app.test", "Sec-Fetch-Site": "same-site" }, { Origin: "https://evil.test", "Sec-Fetch-Site": "same-origin" }]) assert.equal((await handler(request(headers))).status, 403);
  assert.equal(calls, 0);
});

test("invalid and extended bodies are rejected before upstream execution", async () => {
  let calls = 0; const handler = createPositionHistoryPopulationRouteHandler(async () => { calls += 1; return Response.json(result); });
  for (const body of [{ to: exact, maxWindows: 1, excludeProviderDisabled: true }, { to: exact, maxWindows: 24 }, { to: exact, maxWindows: 24, excludeProviderDisabled: true, maxVehicles: 1 }]) assert.equal((await handler(request(undefined, body))).status, 400);
  assert.equal(calls, 0);
});

test("safe errors preserve 401/403/409/failure semantics without upstream bodies", async () => {
  for (const status of [401, 403, 409, 502] as const) {
    const response = await createPositionHistoryPopulationRouteHandler(async () => Response.json({ rawProviderError: "token=secret", latitude: 1 }, { status }))(request());
    const body = await response.text(); assert.equal(response.status, status); assert.equal(body.includes("secret"), false); assert.equal(body.includes("latitude"), false); assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

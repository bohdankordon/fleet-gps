import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { executeAndRefreshPositionHistory } from "./position-history-population-interaction";

const exact = "2026-08-11T02:00:00.000Z";
const request = { to: exact, maxWindows: 12 as const, excludeProviderDisabled: false };
const result = { ...request, committedWindows: 4, providerRequests: 5, rowsReceived: 7, candidates: 6, inserted: 4, duplicates: 2, invalid: 1, retries: 1, rateLimits: 1, slicesTotal: 13, slicesVisited: 1, slicesAlreadyComplete: 0, providerDisabledExcluded: 0, stoppedByBudget: false, horizonComplete: false };

test("one explicit execution POST is issued and never retried or followed by a status scan", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const outcome = await executeAndRefreshPositionHistory(request, async (input, init) => { calls.push({ url: String(input), init }); return Response.json(result); });
  assert.equal(outcome.kind, "SUCCESS");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "/api/system/position-history/horizon-populate");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), request);
});

test("409 and transport/executor failures are reported without any automatic second request", async () => {
  for (const mode of ["conflict", "failure", "transport"] as const) {
    const calls: string[] = [];
    const outcome = await executeAndRefreshPositionHistory(request, async (input) => { calls.push(String(input)); if (mode === "transport") throw new Error("network"); return Response.json({}, { status: mode === "conflict" ? 409 : 502 }); });
    assert.equal(outcome.kind, mode === "conflict" ? "ALREADY_RUNNING" : "FAILED");
    assert.deepEqual(calls, ["/api/system/position-history/horizon-populate"]);
  }
});

test("the browser never calls the removed horizon-status surface", () => {
  const source = readFileSync("src/lib/position-history-population/position-history-population-interaction.ts", "utf8");
  assert.doesNotMatch(source, /horizon-status/);
  assert.equal((source.match(/fetcher\(/g) ?? []).length, 1);
});

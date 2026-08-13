import assert from "node:assert/strict";
import test from "node:test";
import { executeAndRefreshPositionHistory } from "./position-history-population-interaction";

const exact = "2026-08-11T02:00:00.000Z";
const request = { to: exact, maxWindows: 12 as const, excludeProviderDisabled: false };
const result = { ...request, committedWindows: 4, providerRequests: 5, rowsReceived: 7, candidates: 6, inserted: 4, duplicates: 2, invalid: 1, retries: 1, rateLimits: 1, slicesTotal: 13, slicesVisited: 1, slicesAlreadyComplete: 0, providerDisabledExcluded: 0, stoppedByBudget: false, horizonComplete: false };

test("one explicit execution POST is followed by one same-anchor status refresh and no retry", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const outcome = await executeAndRefreshPositionHistory(request, async (input, init) => { calls.push({ url: String(input), init }); return calls.length === 1 ? Response.json(result) : Response.json({ ok: true }); });
  assert.equal(outcome.kind, "SUCCESS"); assert.equal(calls.length, 2); assert.equal(calls[0]?.url, "/api/system/position-history/horizon-populate"); assert.equal(calls[0]?.init?.method, "POST"); assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), request); assert.equal(calls[1]?.url, `/api/system/position-history/horizon-status?to=${encodeURIComponent(exact)}`);
});

test("409 and transport/executor failures are never retried and still refresh the same anchor", async () => {
  for (const mode of ["conflict", "failure", "transport"] as const) {
    const calls: string[] = [];
    const outcome = await executeAndRefreshPositionHistory(request, async (input) => { calls.push(String(input)); if (calls.length === 2) return Response.json({ ok: true }); if (mode === "transport") throw new Error("network"); return Response.json({}, { status: mode === "conflict" ? 409 : 502 }); });
    assert.equal(outcome.kind, mode === "conflict" ? "ALREADY_RUNNING" : "FAILED"); assert.equal(calls.filter((value) => value.endsWith("horizon-populate")).length, 1); assert.equal(calls.at(-1), `/api/system/position-history/horizon-status?to=${encodeURIComponent(exact)}`);
  }
});

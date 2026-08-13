import assert from "node:assert/strict";
import test from "node:test";
import { createPositionHistoryRetentionExecutionRouteHandler } from "./position-history-retention-execution-route-handler";

const body = { expectedCanonicalAnchor: "2026-08-11T02:00:00.000Z", expectedPolicyCutoff: "2026-05-13T02:00:00.000Z" };
const result = { canonicalAnchor: body.expectedCanonicalAnchor, policyCutoff: body.expectedPolicyCutoff, deletedCheckpoints: 1, deletedObservations: 2, remainingFullyObsoleteCheckpoints: 0, remainingExecutableObservationCandidates: 0, stoppedByBudget: false, noWork: false };
function request(headers: Record<string, string> = { Origin: "http://app.test", "Sec-Fetch-Site": "same-origin" }, payload: unknown = body): Request {
  return new Request("http://app.test/api/system/position-history/retention-execute", { method: "POST", headers: { ...headers, "Content-Type": "application/json", Cookie: "preference=dark; taxi_session=secret-token" }, body: JSON.stringify(payload) });
}

test("legitimate same-origin confirmation reaches upstream exactly once and returns no-store", async () => {
  let calls = 0;
  const response = await createPositionHistoryRetentionExecutionRouteHandler(async (parsed) => { calls += 1; assert.deepEqual(parsed, body); return Response.json(result); })(request());
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), result);
});

test("cross-site, same-site, and mismatched Origin confirmations make zero upstream calls", async () => {
  let calls = 0;
  const handler = createPositionHistoryRetentionExecutionRouteHandler(async () => { calls += 1; return Response.json(result); });
  for (const headers of [{ Origin: "http://app.test", "Sec-Fetch-Site": "cross-site" }, { Origin: "http://app.test", "Sec-Fetch-Site": "same-site" }, { Origin: "https://evil.test", "Sec-Fetch-Site": "same-origin" }]) assert.equal((await handler(request(headers))).status, 403);
  assert.equal(calls, 0);
});

test("strict BFF body rejects policy controls and arbitrary fields before Nest", async () => {
  let calls = 0;
  const handler = createPositionHistoryRetentionExecutionRouteHandler(async () => { calls += 1; return Response.json(result); });
  for (const field of ["days", "retentionDays", "cutoff", "to", "checkpointBudget", "observationBudget", "initiatorType", "requestedByUserId", "unknown"]) assert.equal((await handler(request(undefined, { ...body, [field]: 1 }))).status, 400);
  assert.equal(calls, 0);
});

test("409 conflict code is mapped safely and 5xx is never retried or exposed", async () => {
  for (const code of ["LOCK_UNAVAILABLE", "ACTIVE_DURABLE_RUN", "STALE_PLAN"]) {
    let calls = 0;
    const response = await createPositionHistoryRetentionExecutionRouteHandler(async () => { calls += 1; return Response.json({ error: code, sql: "secret" }, { status: 409 }); })(request());
    assert.equal(calls, 1);
    assert.equal(response.status, 409);
    const mapped = await response.json() as Record<string, unknown>;
    assert.equal(mapped.error, code);
    assert.equal(Object.hasOwn(mapped, "sql"), false);
  }
  let failures = 0;
  const failed = await createPositionHistoryRetentionExecutionRouteHandler(async () => { failures += 1; return Response.json({ error: "database details" }, { status: 500 }); })(request());
  assert.equal(failures, 1);
  assert.equal(failed.status, 500);
  assert.equal(JSON.stringify(await failed.json()).includes("database"), false);
});

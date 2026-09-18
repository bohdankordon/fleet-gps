import assert from "node:assert/strict";
import test from "node:test";
import { positionHistoryRetentionFixture } from "./position-history-retention-fixture";
import { loadPositionHistoryRetentionPlan } from "./position-history-retention-loader";

test("server loader accepts the real API plan shape with a strict no-store request", async () => {
  let calledUrl = "";
  let calledInit: RequestInit | undefined;
  const fixture = positionHistoryRetentionFixture();
  const result = await loadPositionHistoryRetentionPlan("http://api.test/api/system/position-history/retention-plan", async (input, init) => {
    calledUrl = String(input);
    calledInit = init;
    return Response.json(fixture);
  });
  assert.deepEqual(result, fixture);
  assert.equal(calledUrl, "http://api.test/api/system/position-history/retention-plan");
  assert.equal(calledInit?.cache, "no-store");
  assert.equal(new Headers(calledInit?.headers).get("accept"), "application/json");
});

test("server loader rejects upstream failure and stale or widened contracts", async () => {
  await assert.rejects(loadPositionHistoryRetentionPlan("http://api.test/plan", async () => Response.json({}, { status: 503 })));
  await assert.rejects(loadPositionHistoryRetentionPlan("http://api.test/plan", async () => Response.json({ ...positionHistoryRetentionFixture(), secret: "no" })));
});

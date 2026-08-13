import assert from "node:assert/strict";
import test from "node:test";
import { positionHistoryRetentionFixture } from "./position-history-retention-fixture";
import { createPositionHistoryRetentionRouteHandler } from "./position-history-retention-route-handler";

test("authenticated GET relays a valid plan with no-store and no policy query", async () => {
  let calls = 0;
  const handler = createPositionHistoryRetentionRouteHandler(async () => { calls += 1; return Response.json(positionHistoryRetentionFixture()); });
  const response = await handler(new Request("http://app.test/api/system/position-history/retention-plan"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(calls, 1);
  for (const query of ["?to=2026-01-01T00:00:00Z", "?cutoff=x", "?days=365", "?retentionDays=90"]) assert.equal((await handler(new Request(`http://app.test/api/system/position-history/retention-plan${query}`))).status, 400);
  assert.equal(calls, 1);
});

test("preserves safe auth status and masks upstream failures and malformed contracts", async () => {
  for (const status of [401, 403, 500] as const) {
    const response = await createPositionHistoryRetentionRouteHandler(async () => Response.json({ secret: "provider-token", coordinates: [1, 2] }, { status }))(new Request("http://app.test/api/system/position-history/retention-plan"));
    const body = await response.text();
    assert.equal(response.status, status === 500 ? 503 : status);
    assert.equal(body.includes("provider-token"), false);
    assert.equal(body.includes("coordinates"), false);
  }
  const malformed = await createPositionHistoryRetentionRouteHandler(async () => Response.json({ ...positionHistoryRetentionFixture(), token: "secret" }))(new Request("http://app.test/api/system/position-history/retention-plan"));
  assert.equal(malformed.status, 503);
  assert.equal((await malformed.text()).includes("secret"), false);
});

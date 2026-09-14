import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryIngestionStatusContractError } from "./position-history-ingestion-status-contract";
import { PositionHistoryIngestionStatusForbiddenError, PositionHistoryIngestionStatusUnauthorizedError, PositionHistoryIngestionStatusUnavailableError } from "./position-history-ingestion-status-errors";
import { positionHistoryIngestionStatusFixture } from "./position-history-ingestion-status-fixture";
import { createPositionHistoryIngestionStatusRouteHandler } from "./position-history-ingestion-status-route-handler";

const url = "http://web.test/api/system/position-history/ingestion-status";

test("authorized ingestion status is served with no-store and without sensitive fields", async () => {
  const response = await createPositionHistoryIngestionStatusRouteHandler(async () => positionHistoryIngestionStatusFixture())(new Request(url));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.retention.lastOutcome, "NOT_OBSERVED_THIS_PROCESS");
  assert.equal(JSON.stringify(body).includes("leaseOwner"), false);
});

test("rejects unexpected query strings without calling upstream", async () => {
  let calls = 0;
  const handler = createPositionHistoryIngestionStatusRouteHandler(async () => {
    calls += 1;
    return positionHistoryIngestionStatusFixture();
  });
  const response = await handler(new Request(`${url}?vehicleId=secret`));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(calls, 0);
});

test("preserves auth semantics and maps failures without leaking details", async () => {
  const cases = [
    [new PositionHistoryIngestionStatusUnauthorizedError(), 401],
    [new PositionHistoryIngestionStatusForbiddenError(), 403],
    [new PositionHistoryIngestionStatusContractError(), 502],
    [new PositionHistoryIngestionStatusUnavailableError(), 503],
    [new Error("provider secret URL"), 503],
  ] as const;
  for (const [error, status] of cases) {
    const response = await createPositionHistoryIngestionStatusRouteHandler(async () => { throw error; })(new Request(url));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.text()).includes("secret"), false);
  }
});

test("repeated responses reflect changing upstream telemetry instead of cached payloads", async () => {
  let calls = 0;
  const handler = createPositionHistoryIngestionStatusRouteHandler(async () => {
    calls += 1;
    const fixture = positionHistoryIngestionStatusFixture();
    return { ...fixture, providerTraffic: { ...fixture.providerTraffic, requestStartsSinceProcessStart: calls } };
  });
  const first = await (await handler(new Request(url))).json();
  const second = await (await handler(new Request(url))).json();
  assert.equal(first.providerTraffic.requestStartsSinceProcessStart, 1);
  assert.equal(second.providerTraffic.requestStartsSinceProcessStart, 2);
});

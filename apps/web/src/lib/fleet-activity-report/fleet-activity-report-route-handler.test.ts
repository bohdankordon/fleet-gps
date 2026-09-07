import assert from "node:assert/strict";
import test from "node:test";
import { FleetActivityReportContractError } from "./fleet-activity-report-contract";
import { FleetActivityReportBadRequestError } from "./fleet-activity-report-errors";
import { fleetActivityReportFixture } from "./fleet-activity-report-fixture";
import { createFleetActivityReportRouteHandler } from "./fleet-activity-report-route-handler";
const url = "http://web.test/api/reports/fleet-activity?from=2026-10-24T21%3A00%3A00Z&to=2026-10-25T22%3A00%3A00Z";
test("forwards exact normalized 25-hour range and returns no-store", async () => { let seen: unknown; const response = await createFleetActivityReportRouteHandler(async (range) => { seen = range; return { ...fleetActivityReportFixture(), from: range.from, to: range.to }; })(new Request(url)); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); assert.deepEqual(seen, { from: "2026-10-24T21:00:00.000Z", to: "2026-10-25T22:00:00.000Z" }); });
test("rejects malformed/extra/overlong input and maps backend errors safely", async () => { const ok = createFleetActivityReportRouteHandler(async () => fleetActivityReportFixture()); assert.equal((await ok(new Request(`${url}&sort=x`))).status, 400); assert.equal((await ok(new Request("http://web.test/api?from=x&to=y"))).status, 400); for (const [error, status] of [[new FleetActivityReportBadRequestError(), 400], [new FleetActivityReportContractError(), 502], [new Error("secret"), 503]] as const) assert.equal((await createFleetActivityReportRouteHandler(async () => { throw error; })(new Request(url))).status, status); });


test("BFF forwards zero length and rejects reversed and overlong ranges", async () => {
  let seen: unknown;
  const handler = createFleetActivityReportRouteHandler(async (range) => { seen = range; return fleetActivityReportFixture(); });
  const path = "http://web.test/api/reports/fleet-activity?";
  assert.equal((await handler(new Request(path + "from=2026-09-07T00:00:00Z&to=2026-09-07T00:00:00Z"))).status, 200);
  assert.deepEqual(seen, { from: "2026-09-07T00:00:00.000Z", to: "2026-09-07T00:00:00.000Z" });
  for (const to of ["2026-09-06T23:59:59Z", "2026-09-08T01:00:00.001Z"]) assert.equal((await handler(new Request(path + "from=2026-09-07T00:00:00Z&to=" + to))).status, 400);
});

import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryHorizonPlanContractError } from "./position-history-horizon-plan-contract";
import { PositionHistoryHorizonPlanBadRequestError, PositionHistoryHorizonPlanUnavailableError } from "./position-history-horizon-plan-errors";
import { positionHistoryHorizonPlanFixture } from "./position-history-horizon-plan-fixture";
import { createPositionHistoryHorizonPlanRouteHandler } from "./position-history-horizon-plan-route-handler";

const exact = "2026-08-11T05:00:00.000+03:00";
const url = `http://web.test/api/system/position-history/horizon-plan?${new URLSearchParams({ to: exact })}`;

test("allowlists and forwards the exact absolute anchor with downstream no-store", async () => { let seen = ""; const response = await createPositionHistoryHorizonPlanRouteHandler(async (to) => { seen = to; return positionHistoryHorizonPlanFixture(); })(new Request(url)); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(seen, exact); assert.deepEqual(await response.json(), positionHistoryHorizonPlanFixture()); });
test("rejects missing, malformed, repeated, or extra query parameters without fetching", async () => { let calls = 0; const handler = createPositionHistoryHorizonPlanRouteHandler(async () => { calls += 1; return positionHistoryHorizonPlanFixture(); }); for (const bad of ["http://web.test/api", "http://web.test/api?to=2026-08-11T02:00", `${url}&to=${encodeURIComponent(exact)}`, `${url}&vehicleId=secret`]) { const response = await handler(new Request(bad)); assert.equal(response.status, 400); assert.equal(response.headers.get("cache-control"), "no-store"); } assert.equal(calls, 0); });
test("maps backend and contract failures without leaking raw details", async () => { for (const [error, status] of [[new PositionHistoryHorizonPlanBadRequestError(), 400], [new PositionHistoryHorizonPlanContractError(), 502], [new PositionHistoryHorizonPlanUnavailableError(), 503], [new Error("provider secret URL"), 503]] as const) { const response = await createPositionHistoryHorizonPlanRouteHandler(async () => { throw error; })(new Request(url)); assert.equal(response.status, status); assert.equal((await response.text()).includes("secret"), false); } });

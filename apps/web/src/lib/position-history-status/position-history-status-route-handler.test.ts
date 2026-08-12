import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryStatusContractError } from "./position-history-status-contract";
import { PositionHistoryStatusBadRequestError, PositionHistoryStatusUnavailableError } from "./position-history-status-errors";
import { positionHistoryStatusFixture } from "./position-history-status-fixture";
import { createPositionHistoryStatusRouteHandler } from "./position-history-status-route-handler";

const exact = "2026-08-11T05:00:00.000+03:00";
const url = `http://web.test/api/system/position-history/horizon-status?${new URLSearchParams({ to: exact })}`;

test("allowlists and forwards the exact absolute anchor with downstream no-store", async () => { let seen = ""; const response = await createPositionHistoryStatusRouteHandler(async (to) => { seen = to; return positionHistoryStatusFixture(); })(new Request(url)); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(seen, exact); assert.deepEqual(await response.json(), positionHistoryStatusFixture()); });
test("rejects missing, malformed, repeated, or extra query parameters without fetching", async () => { let calls = 0; const handler = createPositionHistoryStatusRouteHandler(async () => { calls += 1; return positionHistoryStatusFixture(); }); for (const bad of ["http://web.test/api", "http://web.test/api?to=2026-08-11T02:00", `${url}&to=${encodeURIComponent(exact)}`, `${url}&vehicleId=secret`]) { const response = await handler(new Request(bad)); assert.equal(response.status, 400); assert.equal(response.headers.get("cache-control"), "no-store"); } assert.equal(calls, 0); });
test("maps backend and contract failures without leaking raw details", async () => { for (const [error, status] of [[new PositionHistoryStatusBadRequestError(), 400], [new PositionHistoryStatusContractError(), 502], [new PositionHistoryStatusUnavailableError(), 503], [new Error("provider secret URL"), 503]] as const) { const response = await createPositionHistoryStatusRouteHandler(async () => { throw error; })(new Request(url)); assert.equal(response.status, status); assert.equal((await response.text()).includes("secret"), false); } });

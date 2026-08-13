import assert from "node:assert/strict";
import test from "node:test";
import { positionHistoryPopulationRequestSchema, positionHistoryPopulationResultSchema } from "./position-history-population-contract";

const exact = "2026-08-11T02:00:00.000Z";
const safe = { to: exact, maxWindows: 24, excludeProviderDisabled: true, committedWindows: 4, providerRequests: 5, rowsReceived: 7, candidates: 6, inserted: 4, duplicates: 2, invalid: 1, retries: 1, rateLimits: 1, slicesTotal: 13, slicesVisited: 1, slicesAlreadyComplete: 0, providerDisabledExcluded: 2, stoppedByBudget: false, horizonComplete: false };

test("browser contract accepts only an exact absolute anchor, explicit boolean, and 6/12/24", () => {
  for (const maxWindows of [6, 12, 24]) assert.equal(positionHistoryPopulationRequestSchema.safeParse({ to: exact, maxWindows, excludeProviderDisabled: true }).success, true);
  assert.equal(positionHistoryPopulationRequestSchema.safeParse({ to: exact, maxWindows: 6, excludeProviderDisabled: false }).success, true);
  for (const value of [{ maxWindows: 24, excludeProviderDisabled: true }, { to: "2026-08-11T02:00:00", maxWindows: 24, excludeProviderDisabled: true }, { to: exact, maxWindows: 1, excludeProviderDisabled: true }, { to: exact, maxWindows: 25, excludeProviderDisabled: true }, { to: exact, maxWindows: 24 }, { ...safe, secret: "no" }]) assert.equal(positionHistoryPopulationRequestSchema.safeParse(value).success, false);
});

test("safe result rejects every unapproved or sensitive passthrough field", () => {
  assert.equal(positionHistoryPopulationResultSchema.safeParse(safe).success, true);
  for (const forbidden of ["providerUrl", "token", "rawProviderPayload", "rawProviderError", "externalDeviceId", "latitude", "longitude", "fingerprint", "nextFrom", "taxi_session"]) assert.equal(positionHistoryPopulationResultSchema.safeParse({ ...safe, [forbidden]: "secret" }).success, false);
});

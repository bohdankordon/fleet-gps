import assert from "node:assert/strict";
import test from "node:test";
import { parseCreatePositionHistoryPopulationRunRequest } from "./position-history-population-run-admin.validation";

const exact = "2026-08-11T05:00:00.000+03:00";

test("durable browser validation accepts only the exact public contract", () => {
  for (const windowBudget of [500, 1000, 5000]) for (const excludeProviderDisabled of [true, false]) {
    const parsed = parseCreatePositionHistoryPopulationRunRequest({ to: exact, windowBudget, excludeProviderDisabled });
    assert.equal(parsed?.to.toISOString(), "2026-08-11T02:00:00.000Z");
    assert.equal(parsed?.windowBudget, windowBudget);
    assert.equal(parsed?.excludeProviderDisabled, excludeProviderDisabled);
  }
  for (const windowBudget of [24, 499, 5001, 777]) assert.equal(parseCreatePositionHistoryPopulationRunRequest({ to: exact, windowBudget, excludeProviderDisabled: true }), null);
});

test("durable browser validation rejects malformed, missing, and spoofed fields", () => {
  for (const body of [
    {}, { to: "not-a-date", windowBudget: 1000, excludeProviderDisabled: true },
    { to: "2026-08-11T02:00:00", windowBudget: 1000, excludeProviderDisabled: true },
    { to: exact, windowBudget: 1000 }, { to: exact, windowBudget: 1000, excludeProviderDisabled: true, extra: true },
    { to: exact, windowBudget: 1000, excludeProviderDisabled: true, initiatorType: "SYSTEM" },
    { to: exact, windowBudget: 1000, excludeProviderDisabled: true, requestedByUserId: "other" },
  ]) assert.equal(parseCreatePositionHistoryPopulationRunRequest(body), null);
});


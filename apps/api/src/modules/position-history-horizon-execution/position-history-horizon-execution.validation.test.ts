import assert from "node:assert/strict";
import test from "node:test";
import { parsePositionHistoryHorizonExecutionRequest } from "./position-history-horizon-execution.validation";

const exact = "2026-08-11T02:00:00.000Z";
function request(overrides: Record<string, unknown> = {}): Record<string, unknown> { return { to: exact, maxWindows: 24, excludeProviderDisabled: true, ...overrides }; }

test("accepts only explicit strict execution identity and the exact browser budgets", () => {
  for (const maxWindows of [6, 12, 24]) assert.equal(parsePositionHistoryHorizonExecutionRequest(request({ maxWindows }))?.maxWindows, maxWindows);
  assert.equal(parsePositionHistoryHorizonExecutionRequest(request({ excludeProviderDisabled: false }))?.excludeProviderDisabled, false);
  for (const maxWindows of [1, 25, 100, 500, null, 6.5]) assert.equal(parsePositionHistoryHorizonExecutionRequest(request({ maxWindows })), null);
});

test("rejects missing, malformed, relative, incomplete, and extended bodies", () => {
  for (const body of [{ maxWindows: 24, excludeProviderDisabled: true }, request({ to: "2026-08-11T02:00:00" }), request({ to: "now" }), { to: exact, maxWindows: 24 }, request({ excludeProviderDisabled: "true" }), request({ maxVehicles: 1 }), null]) assert.equal(parsePositionHistoryHorizonExecutionRequest(body), null);
});

test("preserves the exact absolute anchor string while parsing its instant", () => {
  const offset = "2026-08-11T05:00:00.000+03:00";
  const parsed = parsePositionHistoryHorizonExecutionRequest(request({ to: offset }));
  assert.equal(parsed?.requestedTo, offset);
  assert.equal(parsed?.to.toISOString(), exact);
});

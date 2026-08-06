"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_BASE_URL, parseLocalBaseUrl, parseSchedulerStatus, parseDashboardResponse, evaluateObservation, safeErrorType, createRequest } = require("./scheduler-runtime-observer.cjs");

const timestamp = "2026-08-06T10:00:00.000Z";
const job = (overrides = {}) => ({ running: false, lastAttemptAt: timestamp, lastSuccessAt: timestamp, lastFailureAt: null, lastFailureCategory: null, consecutiveFailures: 0, successfulRuns: 1, failedRuns: 0, skippedOverlaps: 0, ...overrides });
const status = (overrides = {}) => ({ enabled: true, startedAt: timestamp, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, generatedAt: timestamp, fleet: job(), runs: job(), ...overrides });
const dashboard = (overrides = {}) => ({ timezone: "Europe/Kyiv", summary: { total: 58 }, vehicles: Array.from({ length: 58 }, () => ({})), ...overrides });

test("uses the fixed default observer URL", () => assert.equal(parseLocalBaseUrl(), DEFAULT_BASE_URL));
test("accepts localhost targets", () => { assert.equal(parseLocalBaseUrl("http://localhost:3100"), "http://localhost:3100"); assert.equal(parseLocalBaseUrl("http://127.0.0.1:3000"), "http://127.0.0.1:3000"); });
test("rejects non-local and HTTPS targets", () => { assert.equal(parseLocalBaseUrl("http://example.test"), null); assert.equal(parseLocalBaseUrl("https://localhost:3000"), null); });
test("rejects credentials and URL components", () => { assert.equal(parseLocalBaseUrl("http://user@localhost:3000"), null); assert.equal(parseLocalBaseUrl("http://localhost:3000/a"), null); assert.equal(parseLocalBaseUrl("http://localhost:3000/?a=1"), null); assert.equal(parseLocalBaseUrl("http://localhost:3000/#x"), null); });
test("rejects normalized path bypasses, empty delimiters, and invalid ports", () => { assert.equal(parseLocalBaseUrl("http://localhost:3000/a/.."), null); assert.equal(parseLocalBaseUrl("http://localhost:3000?"), null); assert.equal(parseLocalBaseUrl("http://localhost:3000#"), null); assert.equal(parseLocalBaseUrl("http://localhost:0"), null); assert.equal(parseLocalBaseUrl("http://localhost:65536"), null); });
test("accepts valid scheduler response", () => assert.ok(parseSchedulerStatus(status())));
test("rejects invalid failure enum", () => assert.equal(parseSchedulerStatus(status({ fleet: job({ lastFailureCategory: "secret" }) })), null));
test("rejects a negative counter", () => assert.equal(parseSchedulerStatus(status({ runs: job({ failedRuns: -1 }) })), null));
test("rejects invalid timestamp", () => assert.equal(parseSchedulerStatus(status({ generatedAt: "not-a-time" })), null));
test("success requires both job counters to advance", () => { const initial = status(); assert.equal(evaluateObservation(initial, status({ fleet: job({ successfulRuns: 2 }), runs: job({ successfulRuns: 2 }) })).state, "success"); assert.equal(evaluateObservation(initial, status({ fleet: job({ successfulRuns: 2 }) })).state, "pending"); });
test("historical initial failure metadata does not block later success", () => {
  const initial = status({ fleet: job({ lastFailureAt: timestamp, lastFailureCategory: "equgps" }), runs: job({ lastFailureAt: timestamp, lastFailureCategory: "database" }) });
  const current = status({ fleet: job({ successfulRuns: 2, lastFailureAt: timestamp, lastFailureCategory: "equgps" }), runs: job({ successfulRuns: 2, lastFailureAt: timestamp, lastFailureCategory: "database" }) });
  assert.equal(evaluateObservation(initial, current).state, "success");
});
test("a changed failure timestamp fails observation", () => assert.equal(evaluateObservation(status(), status({ fleet: job({ lastFailureAt: "2026-08-06T10:01:00.000Z", lastFailureCategory: "equgps" }) })).state, "failure"));
test("failed run increments fail observation", () => assert.equal(evaluateObservation(status(), status({ fleet: job({ failedRuns: 1 }) })).state, "failure"));
test("consecutive failures fail observation", () => assert.equal(evaluateObservation(status(), status({ runs: job({ consecutiveFailures: 1, lastFailureAt: timestamp, lastFailureCategory: "equgps" }) })).state, "failure"));
test("unchanged historical category after success does not block observation", () => {
  const initial = status({ fleet: job({ lastFailureAt: timestamp, lastFailureCategory: "equgps" }) });
  const current = status({ fleet: job({ successfulRuns: 2, lastFailureAt: timestamp, lastFailureCategory: "equgps" }), runs: job({ successfulRuns: 2 }) });
  assert.equal(evaluateObservation(initial, current).state, "success");
});
test("changed startedAt fails observation", () => assert.equal(evaluateObservation(status(), status({ startedAt: "2026-08-06T10:01:00.000Z" })).state, "failure"));
test("disabled scheduler fails observation", () => assert.equal(evaluateObservation(status(), status({ enabled: false })).state, "failure"));
test("accepts valid dashboard contract", () => assert.deepEqual(parseDashboardResponse(dashboard()), { totalVehicles: 58 }));
test("rejects wrong dashboard vehicle count", () => assert.equal(parseDashboardResponse(dashboard({ vehicles: [] })), null));
test("safe error category never exposes raw error", () => assert.equal(safeErrorType(new Error("token: secret")), "unknown"));
test("request timeout is classified without waiting", async () => {
  const request = createRequest({ baseUrl: DEFAULT_BASE_URL, setTimeoutFn: (callback) => { callback(); return 1; }, clearTimeoutFn: () => {}, onActiveController: () => {}, fetchImpl: async (_url, { signal }) => { if (signal.aborted) throw new Error("raw abort"); } });
  assert.deepEqual(await request("/"), { errorType: "timeout" });
});
test("network errors stay unknown", async () => {
  const request = createRequest({ baseUrl: DEFAULT_BASE_URL, setTimeoutFn: () => 1, clearTimeoutFn: () => {}, onActiveController: () => {}, fetchImpl: async () => { throw new Error("raw network error"); } });
  assert.deepEqual(await request("/"), { errorType: "unknown" });
});
test("cleanup abort is classified without exposing its raw error", async () => {
  const request = createRequest({ baseUrl: DEFAULT_BASE_URL, setTimeoutFn: () => 1, clearTimeoutFn: () => {}, onActiveController: (controller) => { if (controller) controller.abort(); }, isCancelled: () => true, fetchImpl: async (_url, { signal }) => { if (signal.aborted) throw new Error("raw abort error"); } });
  const result = await request("/");
  assert.equal(result.errorType, "cancelled");
  assert.equal(safeErrorType(result.errorType), "unknown");
});

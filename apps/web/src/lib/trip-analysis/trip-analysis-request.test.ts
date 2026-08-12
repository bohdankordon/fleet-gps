import assert from "node:assert/strict";
import test from "node:test";
import { tripAnalysisRequestInit, tripAnalysisRequestUrl } from "./trip-analysis-request";
test("backend trip-analysis requests are explicitly no-store and JSON-only", () => { const controller = new AbortController(); assert.deepEqual(tripAnalysisRequestInit(controller.signal), { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } }); });
test("a restored initial range produces the same explicit absolute analytics request", () => { const range = { from: "2026-03-22T10:00:00.000Z", to: "2026-03-29T09:00:00.000Z" }; const url = tripAnalysisRequestUrl("http://api.test", "00000000-0000-4000-8000-000000000001", range); assert.equal(url.searchParams.get("from"), range.from); assert.equal(url.searchParams.get("to"), range.to); });

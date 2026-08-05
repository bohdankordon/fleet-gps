import assert from "node:assert/strict";
import test from "node:test";
import { buildOfficialUrl, buildWebRunsUrl } from "./url-builder";

test("official URL builder encodes query values without logging them", () => {
  const url = new URL(buildOfficialUrl("https://trace.example.test/api", "positions", { deviceId: "1", from: "2026-01-01T00:00:00Z", to: "2026-01-01T01:00:00Z" }));
  assert.equal(url.pathname, "/api/positions");
  assert.equal(url.searchParams.get("deviceId"), "1");
  assert.equal(url.searchParams.get("from"), "2026-01-01T00:00:00Z");
});

test("official URL builder preserves repeated query parameters", () => {
  const url = new URL(buildOfficialUrl("https://trace.example.test", "positions", [["deviceId", "1"], ["deviceId", "2"]]));
  assert.deepEqual(url.searchParams.getAll("deviceId"), ["1", "2"]);
});

test("web runs builder keeps the token internal to the request URL", () => {
  const url = new URL(buildWebRunsUrl("https://web.example.test", "test-token"));
  assert.equal(url.pathname, "/api/devices/runs");
  assert.equal(url.searchParams.get("token"), "test-token");
});

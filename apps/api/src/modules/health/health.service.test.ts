import assert from "node:assert/strict";
import test from "node:test";
import { HealthService } from "./health.service";

test("HealthService returns the public health contract", () => {
  const response = new HealthService().getHealth();
  assert.equal(response.status, "ok");
  assert.equal(response.service, "taxi-gps-api");
  assert.match(response.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(Number.isNaN(Date.parse(response.timestamp)), false);
});

test("HealthService returns a fresh response object for every call", () => {
  const service = new HealthService();
  const first = service.getHealth();
  const second = service.getHealth();
  assert.notStrictEqual(first, second);
});

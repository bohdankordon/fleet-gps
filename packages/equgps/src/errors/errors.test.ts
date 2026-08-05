import assert from "node:assert/strict";
import test from "node:test";
import { EquGpsForbiddenError, EquGpsResponseValidationError } from "./equgps-errors";

test("safe errors serialize only safe metadata", () => {
  const error = new EquGpsForbiddenError("getRuns");
  const serialized = JSON.stringify(error);
  assert.match(serialized, /getRuns/);
  assert.doesNotMatch(serialized, /token=|password|@/);
});

test("safe error messages never retain a token query", () => {
  const error = new EquGpsResponseValidationError("getMode1");
  assert.doesNotMatch(error.message, /token=|\?/);
});

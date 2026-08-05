import assert from "node:assert/strict";
import test from "node:test";
import { DashboardQueryParamsError, parseDashboardQueryParams } from "./dashboard-query-params";

test("parses dashboard query defaults and normalizes search", () => {
  assert.deepEqual(parseDashboardQueryParams({}), { search: undefined, status: undefined, activity: undefined, includeDisabled: true });
  assert.deepEqual(parseDashboardQueryParams({ search: "  Taxi  ", status: "online", activity: "normal", includeDisabled: "false", ignored: "x" }), { search: "Taxi", status: "online", activity: "normal", includeDisabled: false });
  assert.equal(parseDashboardQueryParams({ search: "   " }).search, undefined);
});

test("rejects invalid known dashboard query values", () => {
  for (const query of [{ search: "x".repeat(101) }, { status: "busy" }, { activity: "other" }, { includeDisabled: "1" }, { includeDisabled: true }]) {
    assert.throws(() => parseDashboardQueryParams(query), DashboardQueryParamsError);
  }
});

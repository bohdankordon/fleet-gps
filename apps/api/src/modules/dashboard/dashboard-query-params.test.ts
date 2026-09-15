import assert from "node:assert/strict";
import test from "node:test";
import { DashboardQueryParamsError, parseDashboardQueryParams } from "./dashboard-query-params";

test("parses dashboard query defaults and normalizes search", () => {
  assert.deepEqual(parseDashboardQueryParams({}), { search: undefined, status: undefined, activity: undefined, includeDisabled: true, group: { kind: "ALL" } });
  assert.deepEqual(parseDashboardQueryParams({ search: "  Taxi  ", status: "online", activity: "normal", includeDisabled: "false", ignored: "x" }), { search: "Taxi", status: "online", activity: "normal", includeDisabled: false, group: { kind: "ALL" } });
  assert.deepEqual(parseDashboardQueryParams({ group: "ungrouped" }).group, { kind: "UNGROUPED" });
  assert.deepEqual(parseDashboardQueryParams({ group: "11111111-1111-4111-8111-111111111111" }).group, { kind: "GROUP", groupId: "11111111-1111-4111-8111-111111111111" });
  assert.equal(parseDashboardQueryParams({ search: "   " }).search, undefined);
});

test("rejects invalid known dashboard query values", () => {
  for (const query of [{ search: "x".repeat(101) }, { status: "busy" }, { activity: "other" }, { includeDisabled: "1" }, { includeDisabled: true }, { group: "Taxi" }, { group: 42 }]) {
    assert.throws(() => parseDashboardQueryParams(query), DashboardQueryParamsError);
  }
});

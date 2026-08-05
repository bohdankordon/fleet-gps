import assert from "node:assert/strict";
import test from "node:test";
import { dashboardHistoryPath, shouldUpdateDashboardHistory } from "./dashboard-navigation";
import { parseDashboardQuery } from "./dashboard-query";
test("only user filter changes may write dashboard history", () => { assert.equal(shouldUpdateDashboardHistory("user"), true); assert.equal(shouldUpdateDashboardHistory("popstate"), false); assert.equal(shouldUpdateDashboardHistory("refresh"), false); assert.equal(shouldUpdateDashboardHistory("retry"), false); });
test("restored queries serialize safely and unknown parameters remain ignored", () => { const restored = parseDashboardQuery(new URLSearchParams("status=online&includeDisabled=false&unknown=x")); assert.equal(dashboardHistoryPath(restored), "/?status=online&includeDisabled=false"); });

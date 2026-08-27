import assert from "node:assert/strict";
import test from "node:test";
import { TripStopAnalyticsModule } from "./trip-stop-analytics.module";
import { TripStopAnalyticsService } from "./trip-stop-analytics.service";
import { TripStopAnalyticsPolicyService } from "./trip-stop-analytics-policy.service";
import { TripStopAnalysisController } from "./trip-stop-analysis.controller";

test("analytics module is database-only with one read controller and no provider/scheduler imports", () => {
  assert.deepEqual((Reflect.getMetadata("imports", TripStopAnalyticsModule) as Array<{ name: string }>).map((value) => value.name), ["DatabaseModule"]);
  assert.deepEqual(Reflect.getMetadata("controllers", TripStopAnalyticsModule), [TripStopAnalysisController]);
  assert.deepEqual(Reflect.getMetadata("exports", TripStopAnalyticsModule), [TripStopAnalyticsService, TripStopAnalyticsPolicyService]);
});

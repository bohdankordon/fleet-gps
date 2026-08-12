import assert from "node:assert/strict";
import test from "node:test";
import { TripStopAnalyticsModule } from "./trip-stop-analytics.module";
import { TripStopAnalyticsService } from "./trip-stop-analytics.service";

test("analytics module is database-only and outside provider/runtime modules", () => {
  assert.deepEqual((Reflect.getMetadata("imports", TripStopAnalyticsModule) as Array<{ name: string }>).map((value) => value.name), ["DatabaseModule"]);
  assert.deepEqual(Reflect.getMetadata("exports", TripStopAnalyticsModule), [TripStopAnalyticsService]);
});


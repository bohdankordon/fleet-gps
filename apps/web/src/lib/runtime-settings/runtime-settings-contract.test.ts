import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseRuntimeSettings } from "./runtime-settings-contract";

test("runtime settings accepts exactly the authenticated non-secret timezone shape", () => {
  assert.deepEqual(parseRuntimeSettings({ timezone: "America/New_York" }), { timezone: "America/New_York" });
  for (const value of [{}, { timezone: "Not/AZone" }, { timezone: "Europe/Kyiv", revision: 7 }, { timezone: "Europe/Kyiv", telegramChatId: "secret" }]) assert.equal(parseRuntimeSettings(value), null);
});

test("runtime business date clients have no browser-timezone fallback on runtime settings failure", () => {
  const client = readFileSync("src/lib/runtime-settings/runtime-settings-client.ts", "utf8");
  const reports = readFileSync("src/app/reports/page.tsx", "utf8");
  const reportLoader = readFileSync("src/lib/fleet-activity-report/fleet-activity-report-page-loader.ts", "utf8");
  const trips = readFileSync("src/app/vehicles/[vehicleId]/trips/page.tsx", "utf8");
  const tripsLoader = readFileSync("src/lib/trip-analysis/vehicle-trips-page-loader.ts", "utf8");
  assert.match(client, /cache: "no-store"/); assert.match(client, /throw new Error\("Runtime settings unavailable\."\)/);
  assert.ok(reports.includes("runtime: fetchRuntimeSettings"));
  assert.ok(reportLoader.includes("(await deps.runtime()).timezone"));
  assert.match(trips, /fetchSettings: fetchRuntimeSettings/);
  assert.match(tripsLoader, /settings\?\.timezone/);
  assert.doesNotMatch(`${reports}\n${reportLoader}\n${trips}\n${tripsLoader}`, /Europe\/Kyiv/);
});

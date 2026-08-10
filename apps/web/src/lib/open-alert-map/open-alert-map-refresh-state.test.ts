import assert from "node:assert/strict";
import test from "node:test";
import type { FleetMapResponse } from "@/lib/fleet-map/fleet-map-contract";
import type { OpenAlertMapResponse } from "./open-alert-map-contract";
import { abortCoordinatedMapRefresh, beginCoordinatedMapRefresh, initialCoordinatedMapRefreshState, settleCoordinatedMapRefresh } from "./open-alert-map-refresh-state";

const fleet = (generatedAt: string): FleetMapResponse => ({ generatedAt, positionFreshnessSeconds: 300, summary: { totalVehicles: 0, withPosition: 0, withoutPosition: 0, invalidPosition: 0, fresh: 0, stale: 0 }, vehicles: [] });
const alerts = (generatedAt: string): OpenAlertMapResponse => ({ generatedAt, summary: { totalOpenAlerts: 0, vehiclesWithOpenAlerts: 0, speeding: 0, inactivity: 0 }, vehicles: [] });

test("one coordinated generation prevents overlap and applies both successful sources", () => {
  const initial = initialCoordinatedMapRefreshState(fleet("2026-08-10T10:00:00.000Z"), alerts("2026-08-10T10:00:00.000Z"), false);
  const begun = beginCoordinatedMapRefresh(initial);
  assert.equal(beginCoordinatedMapRefresh(begun), begun);
  const settled = settleCoordinatedMapRefresh(begun, 1, { ok: true, value: fleet("2026-08-10T11:00:00.000Z") }, { ok: true, value: alerts("2026-08-10T11:00:00.000Z") });
  assert.equal(settled.fleet.generatedAt, "2026-08-10T11:00:00.000Z");
  assert.equal(settled.alerts?.generatedAt, "2026-08-10T11:00:00.000Z");
  assert.equal(settled.fleetError || settled.alertError || settled.loading, false);
});

test("independent failures preserve only the failed source's last-good data", () => {
  const oldFleet = fleet("2026-08-10T10:00:00.000Z"); const oldAlerts = alerts("2026-08-10T10:00:00.000Z");
  const fleetOnly = settleCoordinatedMapRefresh(beginCoordinatedMapRefresh(initialCoordinatedMapRefreshState(oldFleet, oldAlerts, false)), 1, { ok: true, value: fleet("2026-08-10T11:00:00.000Z") }, { ok: false });
  assert.equal(fleetOnly.fleet.generatedAt.endsWith("11:00:00.000Z"), true); assert.equal(fleetOnly.alerts, oldAlerts); assert.equal(fleetOnly.alertError, true);
  const alertOnly = settleCoordinatedMapRefresh(beginCoordinatedMapRefresh(initialCoordinatedMapRefreshState(oldFleet, oldAlerts, false)), 1, { ok: false }, { ok: true, value: alerts("2026-08-10T11:00:00.000Z") });
  assert.equal(alertOnly.fleet, oldFleet); assert.equal(alertOnly.alerts?.generatedAt.endsWith("11:00:00.000Z"), true); assert.equal(alertOnly.fleetError, true);
  const neither = settleCoordinatedMapRefresh(beginCoordinatedMapRefresh(initialCoordinatedMapRefreshState(oldFleet, oldAlerts, false)), 1, { ok: false }, { ok: false });
  assert.equal(neither.fleet, oldFleet); assert.equal(neither.alerts, oldAlerts); assert.equal(neither.fleetError && neither.alertError, true);
});

test("stale generations cannot overwrite state and unmount abort clears active loading", () => {
  const begun = beginCoordinatedMapRefresh(initialCoordinatedMapRefreshState(fleet("2026-08-10T10:00:00.000Z"), null, true));
  assert.equal(settleCoordinatedMapRefresh(begun, 0, { ok: true, value: fleet("2026-08-10T11:00:00.000Z") }, { ok: true, value: alerts("2026-08-10T11:00:00.000Z") }), begun);
  assert.equal(abortCoordinatedMapRefresh(begun, 1).loading, false);
});

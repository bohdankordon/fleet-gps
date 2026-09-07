import assert from "node:assert/strict";
import test from "node:test";
import { alertEventActions, alertEventInvestigationRange } from "./alert-events-investigation";
import { alertEventsListFixture } from "./alert-events-fixture";
import type { AuthUser, AuthPermission } from "../auth/auth-contract";
const event = alertEventsListFixture.items[0];
const user = (permissions: AuthPermission[], role: "USER" | "ADMIN" = "USER"): AuthUser => ({ id: "x", login: "x", role, permissions, mustChangePassword: false });
test("investigation range is deterministic -30/+90 minutes and future end is clamped", () => {
  assert.deepEqual(alertEventInvestigationRange(event.openedAt, new Date("2026-08-08T14:00:00Z")), { from: "2026-08-08T11:30:00.000Z", to: "2026-08-08T13:30:00.000Z" });
  assert.equal(alertEventInvestigationRange(event.openedAt, new Date("2026-08-08T12:10:00Z"))?.to, "2026-08-08T12:10:00.000Z");
  assert.equal(alertEventInvestigationRange("bad", new Date()), null);
});
test("navigation honors each permission independently and preserves ADMIN behavior", () => {
  const now = new Date("2026-08-08T14:00:00Z");
  assert.deepEqual(alertEventActions(event, user(["events.view"]), now), []);
  assert.deepEqual(alertEventActions(event, null, now), []);
  assert.deepEqual(alertEventActions(event, user(["trips.view"]), now).map((a) => a.key), ["track", "trips"]);
  assert.deepEqual(alertEventActions(event, user(["map.view"]), now), [{ key: "position", href: `/map?vehicleId=${event.vehicle.id}` }]);
  assert.deepEqual(alertEventActions(event, user([], "ADMIN"), now).map((a) => a.key), ["vehicle", "track", "trips", "position"]);
  for (const action of alertEventActions(event, user(["trips.view"]), now)) { const url = new URL(action.href, "http://local"); assert.equal(url.searchParams.get("from"), "2026-08-08T11:30:00.000Z"); assert.equal(url.searchParams.get("to"), "2026-08-08T13:30:00.000Z"); }
});

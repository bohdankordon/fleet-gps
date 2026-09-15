import assert from "node:assert/strict";
import test from "node:test";
import { buildVehicleAccessPayload, draftFromVehicleAccess, effectiveVehicleIds, EMPTY_VEHICLE_ACCESS_DRAFT, isVehicleAccessDirty, toggleAccessGroup, toggleAccessVehicle } from "./vehicle-access-form-model";

test("draft round-trips persisted access while toggles stay idempotent", () => {
  assert.deepEqual(draftFromVehicleAccess({ mode: "ALL", groupIds: [], vehicleIds: [] }), { mode: "ALL", groupIds: [], vehicleIds: [] });
  assert.deepEqual(EMPTY_VEHICLE_ACCESS_DRAFT.mode, null);
  const draft = toggleAccessGroup(EMPTY_VEHICLE_ACCESS_DRAFT, "g", true);
  assert.deepEqual(toggleAccessGroup(draft, "g", true), draft);
  assert.deepEqual(toggleAccessGroup(draft, "g", false), EMPTY_VEHICLE_ACCESS_DRAFT);
  const withVehicle = toggleAccessVehicle(EMPTY_VEHICLE_ACCESS_DRAFT, "v", true);
  assert.deepEqual(toggleAccessVehicle(withVehicle, "v", true), withVehicle);
  assert.deepEqual(toggleAccessVehicle(withVehicle, "v", false), EMPTY_VEHICLE_ACCESS_DRAFT);
});

test("payloads never mix grants into ALL mode", () => {
  assert.deepEqual(buildVehicleAccessPayload({ mode: "ALL", groupIds: ["g"], vehicleIds: ["v"] }), { mode: "ALL", groupIds: [], vehicleIds: [] });
  assert.deepEqual(buildVehicleAccessPayload({ mode: "SELECTED", groupIds: ["g"], vehicleIds: [] }), { mode: "SELECTED", groupIds: ["g"], vehicleIds: [] });
});

test("effective access deduplicates group and direct overlap", () => {
  const members = { g1: ["a", "b"], g2: ["b", "c"] };
  assert.deepEqual([...effectiveVehicleIds(["g1", "g2"], members, ["b", "d"])].sort(), ["a", "b", "c", "d"]);
  assert.equal(effectiveVehicleIds([], {}, []).size, 0);
  assert.equal(effectiveVehicleIds(["missing"], {}, ["a"]).size, 1);
});

test("dirty detection compares modes and grant sets order-insensitively", () => {
  const persisted = { mode: "SELECTED" as const, groupIds: ["g"], vehicleIds: ["v"] };
  assert.equal(isVehicleAccessDirty(persisted, { mode: null, groupIds: [], vehicleIds: [] }), true);
  assert.equal(isVehicleAccessDirty(persisted, { mode: "ALL", groupIds: [], vehicleIds: [] }), true);
  assert.equal(isVehicleAccessDirty(persisted, { mode: "SELECTED", groupIds: ["g"], vehicleIds: ["v"] }), false);
  assert.equal(isVehicleAccessDirty(persisted, { mode: "SELECTED", groupIds: [], vehicleIds: ["v", "g2"] }), true);
  assert.equal(isVehicleAccessDirty({ mode: "ALL", groupIds: [], vehicleIds: [] }, { mode: "ALL", groupIds: [], vehicleIds: [] }), false);
});

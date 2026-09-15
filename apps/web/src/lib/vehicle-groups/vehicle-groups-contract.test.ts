import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_VEHICLE_GROUP_COLOR, VEHICLE_GROUP_COLORS, VEHICLE_GROUP_TAG_COLORS, isVehicleGroupColor, parseManagedVehicles, parseVehicleGroupDetail, parseVehicleGroupSummaries, ungroupedVehicles, validateGroupName } from "./vehicle-groups-contract";

const group = { id: "11111111-1111-4111-8111-111111111111", name: "Taxi", color: "BLUE", vehicleCount: 2, userGrantCount: 1, createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-02T10:00:00.000Z" };

test("group summaries, details, and managed vehicles parse only safe allow-listed fields", () => {
  assert.deepEqual(parseVehicleGroupSummaries([group]), [group]);
  assert.equal(parseVehicleGroupSummaries([{ ...group, id: "bad" }]), null);
  assert.equal(parseVehicleGroupSummaries([{ ...group, color: "RED" }]), null);
  assert.equal(parseVehicleGroupSummaries([{ ...group, color: "blue" }]), null);
  assert.equal(parseVehicleGroupSummaries(null), null);
  const detail = { ...group, vehicles: [{ id: "22222222-2222-4222-8222-222222222222", name: "Car", externalDeviceId: 7, disabled: false }] };
  assert.deepEqual(parseVehicleGroupDetail(detail)?.vehicles.length, 1);
  assert.equal(parseVehicleGroupDetail({ ...group, vehicles: [{ id: "bad" }] }), null);
  const managed = [{ id: "22222222-2222-4222-8222-222222222222", name: "Car", disabled: false, groupId: null }];
  assert.deepEqual(parseManagedVehicles(managed), managed);
  assert.equal(parseManagedVehicles([{ id: "22222222-2222-4222-8222-222222222222", name: "Car", disabled: false, groupId: "bad" }]), null);
});

test("ungrouped derivation never mutates the source list", () => {
  const vehicles = [
    { id: "22222222-2222-4222-8222-222222222222", name: "Car", disabled: false, groupId: null },
    { id: "33333333-3333-4333-8333-333333333333", name: "Van", disabled: true, groupId: group.id },
  ];
  assert.deepEqual(ungroupedVehicles(vehicles).map((vehicle) => vehicle.id), ["22222222-2222-4222-8222-222222222222"]);
  assert.equal(vehicles.length, 2);
});

test("group names reject empty input client-side while the backend stays authoritative", () => {
  assert.equal(validateGroupName("Taxi"), null);
  assert.equal(validateGroupName("   "), "empty");
  assert.equal(validateGroupName(""), "empty");
  assert.equal(validateGroupName("x".repeat(129)), "tooLong");
  assert.equal(validateGroupName("x".repeat(128)), null);
});
test("group color palette is finite, curated, and defaults to BLUE without red", () => {
  assert.deepEqual([...VEHICLE_GROUP_COLORS], ["BLUE", "CYAN", "GREEN", "GOLD", "ORANGE", "PURPLE", "MAGENTA", "GRAY"]);
  assert.equal(DEFAULT_VEHICLE_GROUP_COLOR, "BLUE");
  for (const color of VEHICLE_GROUP_COLORS) assert.equal(isVehicleGroupColor(color), true);
  for (const invalid of ["RED", "blue", "", null, undefined, "#0000FF", 7]) assert.equal(isVehicleGroupColor(invalid), false);
  assert.deepEqual(VEHICLE_GROUP_TAG_COLORS, { BLUE: "blue", CYAN: "cyan", GREEN: "green", GOLD: "gold", ORANGE: "orange", PURPLE: "purple", MAGENTA: "magenta", GRAY: "default" });
});

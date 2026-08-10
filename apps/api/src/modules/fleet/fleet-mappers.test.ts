import assert from "node:assert/strict";
import test from "node:test";
import type { EquGpsDevice, EquGpsPosition } from "@taxi-gps/equgps";
import { VehicleStatus } from "../../generated/prisma/client";
import { mapFleetSnapshot, selectLatestPositions } from "./fleet-mappers";

const fetchedAt = new Date("2026-08-05T10:00:00.000Z");
function device(overrides: Partial<EquGpsDevice> = {}): EquGpsDevice { return { id: 1, name: " Vehicle ", status: " online ", disabled: false, lastUpdate: "2026-08-05T10:00:00+0000", ...overrides }; }
function position(overrides: Partial<EquGpsPosition> = {}): EquGpsPosition { return { deviceId: 1, fixTime: "2026-08-05T10:01:00+0000", valid: true, outdated: false, speedKnots: 10, latitude: 49.23, longitude: 28.48, ...overrides }; }

test("maps statuses, trims names and preserves only the fleet snapshot fields", () => {
  const mapped = mapFleetSnapshot([device(), device({ id: 2, name: "  ", status: "OFFLINE" }), device({ id: 3, status: "unexpected" })], [position()], fetchedAt);
  assert.equal(mapped.vehicles[0]?.status, VehicleStatus.ONLINE);
  assert.equal(mapped.vehicles[0]?.name, "Vehicle");
  assert.equal(mapped.vehicles[1]?.status, VehicleStatus.OFFLINE);
  assert.equal(mapped.vehicles[1]?.name, "Device 2");
  assert.equal(mapped.vehicles[2]?.status, VehicleStatus.UNKNOWN);
  assert.equal(mapped.vehicles[0]?.position?.speedKph, 18.52);
  assert.deepEqual(Object.keys(mapped.vehicles[0] ?? {}).sort(), ["disabled", "externalDeviceId", "externalLastUpdateAt", "fetchedAt", "name", "position", "status"]);
});

test("maps null and invalid position values safely and counts invalid dates", () => {
  const mapped = mapFleetSnapshot([device({ lastUpdate: "not-a-date" })], [position({ fixTime: "not-a-date", speedKnots: -1, latitude: 49, longitude: null })], fetchedAt);
  const current = mapped.vehicles[0]?.position;
  assert.equal(mapped.invalidDeviceLastUpdateDates, 1);
  assert.equal(mapped.invalidPositionFixDates, 1);
  assert.equal(mapped.vehicles[0]?.externalLastUpdateAt, null);
  assert.equal(current?.fixTime, null);
  assert.equal(current?.speedKph, null);
  assert.equal(current?.latitude, null);
  assert.equal(current?.longitude, null);
});

test("accepts confirmed +0000 offsets and maps absent positions without erasing a position in the mapper", () => {
  const mapped = mapFleetSnapshot([device({ lastUpdate: null })], [], fetchedAt);
  assert.equal(mapped.devicesWithoutPosition, 1);
  assert.equal(mapped.vehicles[0]?.externalLastUpdateAt, null);
  assert.equal(mapped.vehicles[0]?.position, null);
});

test("selects the newest valid duplicate deterministically and counts unmatched positions", () => {
  const latest = position({ fixTime: "2026-08-05T11:00:00+0000" });
  const earlier = position({ fixTime: "2026-08-05T10:00:00+0000" });
  const invalid = position({ fixTime: "invalid" });
  const selected = selectLatestPositions([earlier, invalid, latest]);
  assert.equal(selected.duplicatePositions, 2);
  assert.equal(selected.invalidPositionFixDates, 1);
  assert.equal(selected.selected.get(1)?.position, latest);
  const tie = selectLatestPositions([earlier, position({ fixTime: "2026-08-05T10:00:00+0000", speedKnots: 20 })]);
  assert.equal(tie.selected.get(1)?.position.speedKnots, 10);
  const mapped = mapFleetSnapshot([device()], [latest, position({ deviceId: 99 })], fetchedAt);
  assert.equal(mapped.unmatchedPositions, 1);
});

test("counts every unmatched position row while retaining duplicate selection behavior", () => {
  const mapped = mapFleetSnapshot([device()], [position({ deviceId: 99 }), position({ deviceId: 99, fixTime: "2026-08-05T12:00:00+0000" })], fetchedAt);
  assert.equal(mapped.unmatchedPositions, 2);
  assert.equal(mapped.duplicatePositions, 1);
  assert.equal(mapped.vehicles.length, 1);
  assert.equal(mapped.vehicles[0]?.position, null);
});

test("preserves every matched provider row for history while current state keeps one deterministic latest fix", () => {
  const first = position({ fixTime: "2026-08-05T10:00:00+0000", latitude: 49.2, speedKnots: 10 });
  const sameTimeDistinct = position({ fixTime: "2026-08-05T10:00:00+0000", latitude: 49.3, speedKnots: 20, valid: false, outdated: true });
  const malformed = position({ fixTime: null, latitude: Number.NaN, longitude: 28.4, speedKnots: Number.POSITIVE_INFINITY });
  const unmatched = position({ deviceId: 99 });
  const mapped = mapFleetSnapshot([device()], [first, sameTimeDistinct, malformed, unmatched], fetchedAt);

  assert.equal(mapped.vehicles[0]?.position?.latitude, 49.2);
  assert.equal(mapped.positionObservations.length, 3);
  assert.deepEqual(mapped.positionObservations.map((value) => value.externalDeviceId), [1, 1, 1]);
  assert.equal(mapped.positionObservations[1]?.latitude, 49.3);
  assert.equal(mapped.positionObservations[1]?.valid, false);
  assert.equal(mapped.positionObservations[1]?.outdated, true);
  assert.equal(mapped.positionObservations[2]?.observedAt, null);
  assert.equal(mapped.positionObservations[2]?.latitude, null);
  assert.equal(mapped.positionObservations[2]?.longitude, null);
  assert.equal(mapped.positionObservations[2]?.speedKph, null);
  assert.equal(mapped.unmatchedPositions, 1);
});

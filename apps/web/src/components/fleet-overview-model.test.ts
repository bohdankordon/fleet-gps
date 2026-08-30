import assert from "node:assert/strict";
import test from "node:test";
import { sortFleetVehicles } from "./fleet-overview-model";

const vehicles = [
  { id: "a", name: "Bravo", positionFreshness: "fresh", speedKph: 24 },
  { id: "b", name: "Alpha", positionFreshness: "stale", speedKph: null },
  { id: "c", name: "Charlie", positionFreshness: "missing", speedKph: 48 },
] as any;

test("Fleet sorting keeps server-authorized rows and orders meaningful contract fields", () => {
  assert.deepEqual(sortFleetVehicles(vehicles, "name", "en").map((vehicle) => vehicle.id), ["b", "a", "c"]);
  assert.deepEqual(sortFleetVehicles(vehicles, "freshness", "en").map((vehicle) => vehicle.id), ["b", "c", "a"]);
  assert.deepEqual(sortFleetVehicles(vehicles, "speed", "en").map((vehicle) => vehicle.id), ["c", "a", "b"]);
});

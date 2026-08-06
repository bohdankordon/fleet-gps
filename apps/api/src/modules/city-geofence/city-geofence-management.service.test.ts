import assert from "node:assert/strict";
import test from "node:test";
import { AlertSettingsStateError } from "../alert-settings/alert-settings.types";
import type { GeoJsonPolygon } from "../alert-settings";
import { CityGeofenceManagementService } from "./city-geofence-management.service";
import type { CityGeofenceRepository } from "./city-geofence.repository";

const input = () => ({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] });

test("validates candidates without writes and writes only a copied validated polygon", async () => {
  const writes: Array<GeoJsonPolygon | null> = [];
  const service = new CityGeofenceManagementService({ replaceSingletonPolygon: async (value: GeoJsonPolygon | null) => { writes.push(value); } } as unknown as CityGeofenceRepository);
  const candidate = service.validateCandidate(input());
  assert.equal(writes.length, 0);
  assert.equal(Object.isFrozen(candidate), true);
  const source = input();
  await service.replaceCityGeofence(source);
  source.coordinates[0]![0]![0] = 99;
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.coordinates[0]?.[0]?.[0], 0);
  await service.clearCityGeofence();
  assert.deepEqual(writes, [writes[0]!, null]);
});

test("rejects invalid candidates safely and preserves repository safe failures", async () => {
  const service = new CityGeofenceManagementService({ replaceSingletonPolygon: async () => { throw new Error("must not write"); } } as unknown as CityGeofenceRepository);
  assert.throws(() => service.validateCandidate({ type: "Feature" }), (error: unknown) => error instanceof AlertSettingsStateError && !error.message.includes("Feature"));
  const missing = new CityGeofenceManagementService({ replaceSingletonPolygon: async () => { throw new AlertSettingsStateError("missing"); } } as unknown as CityGeofenceRepository);
  await assert.rejects(missing.clearCityGeofence(), (error: unknown) => error instanceof AlertSettingsStateError && error.kind === "missing");
});

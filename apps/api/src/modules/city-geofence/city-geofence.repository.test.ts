import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database/database.service";
import { AlertSettingsStateError } from "../alert-settings/alert-settings.types";
import { CityGeofenceRepository } from "./city-geofence.repository";

test("checks singleton then performs one targeted polygon-only update", async () => {
  const calls: unknown[] = [];
  const client = { applicationSettings: { findUnique: async (value: unknown) => { calls.push(value); return { id: 1 }; }, update: async (value: unknown) => { calls.push(value); return { id: 1 }; } } } as unknown as PrismaClient;
  await new CityGeofenceRepository({ getClient: () => client } as unknown as DatabaseService).replaceSingletonPolygon({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] });
  assert.deepEqual(calls[0], { where: { id: 1 }, select: { id: true } });
  assert.deepEqual(calls[1], { where: { id: 1 }, data: { cityGeofenceGeoJson: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } }, select: { id: true } });
});

test("maps missing and database failures to safe state errors", async () => {
  const missing = new CityGeofenceRepository({ getClient: () => ({ applicationSettings: { findUnique: async () => null } } as unknown as PrismaClient) } as unknown as DatabaseService);
  const failed = new CityGeofenceRepository({ getClient: () => ({ applicationSettings: { findUnique: async () => { throw new Error("postgres secret"); } } } as unknown as PrismaClient) } as unknown as DatabaseService);
  await assert.rejects(missing.replaceSingletonPolygon(null), (error: unknown) => error instanceof AlertSettingsStateError && error.kind === "missing");
  await assert.rejects(failed.replaceSingletonPolygon(null), (error: unknown) => error instanceof AlertSettingsStateError && error.kind === "database" && !error.message.includes("secret"));
});

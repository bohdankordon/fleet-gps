import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { CityGeofenceController } from "./city-geofence.controller";
import type { CityGeofenceService } from "./city-geofence.service";

test("returns only the diagnostic read contract", async () => {
  const response = { configured: false, classificationAvailable: false, boundaryPolicy: "CITY", updatedAt: "2026-08-06T10:00:00.000Z" } as const;
  const controller = new CityGeofenceController({ getDiagnostic: async () => response } as unknown as CityGeofenceService);
  assert.deepEqual(await controller.getDiagnostic(), response);
});

test("maps internal errors to a generic 500", async () => {
  const controller = new CityGeofenceController({ getDiagnostic: async () => { throw new Error("private coordinates"); } } as unknown as CityGeofenceService);
  await assert.rejects(controller.getDiagnostic(), (error: unknown) => error instanceof HttpException && error.getStatus() === 500 && JSON.stringify(error.getResponse()) === JSON.stringify({ statusCode: 500, error: "Internal Server Error" }));
});

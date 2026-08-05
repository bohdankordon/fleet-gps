import assert from "node:assert/strict";
import test from "node:test";
import { parseEquGpsConfig } from "../config/equgps-config";
import { FakeHttpTransport } from "../contracts/fake-transport";
import type { SessionToken } from "../contracts/client-contracts";
import { EquGpsResponseValidationError } from "../errors/equgps-errors";
import { createWebRouteClient, createWebSpeedEventsClient, createWebVehicleDetailsClient } from "../factories";

const config = parseEquGpsConfig({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "test@example.test", password: "password", requestTimeoutMs: 5_000 });
const token = "test-token" as SessionToken;
const params = { deviceId: 7, date: "2026-08-05" };
const response = (body: unknown) => ({ status: 200, headers: { "content-type": "application/json" }, body });
const mode1 = (overrides: Record<string, unknown> = {}) => [{ attributes: "opaque", infoReport: { mode1: { dataPositions: { distance: 1_000, goTime: 300, maxSpeed: "10", startC: ["1", "2"], endC: ["3", "4"] }, dataGo: [{ startTime: 1, endTime: 2, distance: 100, maxSpeed: "", stopLongSeconds: 3, startA: "sensitive address", endA: "sensitive address", runTime: "ignored" }] }, ...overrides } }];
const mode2 = (overrides: Record<string, unknown> = {}) => [{ infoReport: { mode2: { stateMaxSpeed: 50, maxRegSpeed: 64, dataSpeed: [{ id: 1, deviceid: 7, lat: "49.2", lon: "28.4", fixtime: "unconfirmed", speed: 64, overPercent: 5 }], ...overrides } } }];
const route = (overrides: Record<string, unknown> = {}) => ({ dataPositions: { distance: 1_000, goTime: 300 }, dataGo: [{ startTime: 1, endTime: 2, distance: 100, maxSpeed: "10", positions: [{ fixtime: "unconfirmed", latitude: "49.2", longitude: "28.4", speed: "99", attributes: {}, network: null }] }], tm_points: [{}], device: {}, geofences: [{}], ...overrides });

test("mode1 sends a form request and normalizes confirmed units", async () => {
  const fake = new FakeHttpTransport(async (request) => response(mode1()));
  const result = await createWebVehicleDetailsClient(config, fake).getVehicleDayDetails(token, params);
  assert.equal(fake.requests[0]?.method, "POST");
  assert.equal(new URL(fake.requests[0]?.url ?? "").pathname, "/api/devices/info");
  assert.equal(new URL(fake.requests[0]?.url ?? "").searchParams.get("token"), token);
  assert.deepEqual(fake.requests[0]?.formBody, { mode: "mode1", id: "7", date: "2026-08-05" });
  assert.equal(fake.requests[0]?.headers.Accept, "application/json");
  assert.equal(result.distanceMeters, 1_000);
  assert.equal(result.movementDurationSeconds, 300);
  assert.equal(result.maxSpeedKph, 18.52);
  assert.equal(result.trips[0]?.maxSpeedKph, null);
  assert.equal(result.trips[0]?.startedAt, "1970-01-01T00:00:01.000Z");
  assert.equal(result.trips[0]?.startLocation, null);
  assert.equal("attributes" in result, false);
  assert.equal("runTime" in (result.trips[0] ?? {}), false);
});

test("mode1 treats blank and invalid optional speeds as null but rejects negative values", async () => {
  for (const value of ["", "  ", "not-a-number", "NaN", "Infinity", "-Infinity"]) {
    const client = createWebVehicleDetailsClient(config, new FakeHttpTransport(async () => response(mode1({ mode1: { dataPositions: { distance: 1, goTime: 1, maxSpeed: value }, dataGo: [] } }))));
    assert.equal((await client.getVehicleDayDetails(token, params)).maxSpeedKph, null);
  }
  const client = createWebVehicleDetailsClient(config, new FakeHttpTransport(async () => response(mode1({ mode1: { dataPositions: { distance: 1, goTime: 1, maxSpeed: "-1" }, dataGo: [] } }))));
  await assert.rejects(() => client.getVehicleDayDetails(token, params), EquGpsResponseValidationError);
});

test("mode1 safely rejects invalid trips and no-data shapes", async () => {
  const badTripBodies = [
    mode1({ mode1: { dataPositions: {}, dataGo: [{ endTime: 2, distance: 1 }] } }),
    mode1({ mode1: { dataPositions: {}, dataGo: [{ startTime: 3, endTime: 2, distance: 1 }] } }),
    mode1({ mode1: { dataPositions: {}, dataGo: [{ startTime: 1, endTime: 2, distance: -1 }] } }),
    mode1({ mode1: { dataPositions: {}, dataGo: [{ startTime: 1, endTime: 9_999_999_999_999_999, distance: 1 }] } }),
    [],
    [{}],
    [{ infoReport: {} }],
  ];
  for (const body of badTripBodies) {
    const client = createWebVehicleDetailsClient(config, new FakeHttpTransport(async () => response(body)));
    await assert.rejects(() => client.getVehicleDayDetails(token, params), EquGpsResponseValidationError);
  }
});

test("mode2 keeps km/h, validates coordinates and hides raw timestamp", async () => {
  const fake = new FakeHttpTransport(async () => response(mode2()));
  const result = await createWebSpeedEventsClient(config, fake).getExternalSpeedReport(token, params);
  assert.deepEqual(fake.requests[0]?.formBody, { mode: "mode2", id: "7", date: "2026-08-05" });
  assert.equal(result.configuredLimitKph, 50);
  assert.equal(result.maxRecordedSpeedKph, 64);
  assert.equal(result.events[0]?.speedKph, 64);
  assert.equal(result.events[0]?.occurredAt, null);
  assert.equal(result.events[0]?.latitude, 49.2);
  for (const invalid of [mode2({ dataSpeed: [{ id: 1, deviceid: 7, lat: "91", lon: "28", speed: 1 }] }), mode2({ dataSpeed: [{ id: 1, deviceid: 7, lat: "49", lon: "28", speed: -1 }] }), mode2({ dataSpeed: [{ id: 1, deviceid: 7, lat: "49", lon: "28", speed: 1, overPercent: -1 }] })]) {
    const client = createWebSpeedEventsClient(config, new FakeHttpTransport(async () => response(invalid)));
    await assert.rejects(() => client.getExternalSpeedReport(token, params), EquGpsResponseValidationError);
  }
});

test("route uses the allowlisted form, maps only route points and ignores opaque fields", async () => {
  const fake = new FakeHttpTransport(async () => response(route()));
  const result = await createWebRouteClient(config, fake).getVehicleRoute(token, params);
  assert.equal(new URL(fake.requests[0]?.url ?? "").pathname, "/api/devices/routes-new");
  assert.deepEqual(fake.requests[0]?.formBody, { id: "7", date: "2026-08-05" });
  assert.equal(result.distanceMeters, 1_000);
  assert.equal(result.movementDurationSeconds, 300);
  assert.deepEqual(result.points, [{ occurredAt: null, latitude: 49.2, longitude: 28.4 }]);
  assert.equal("speed" in (result.points[0] ?? {}), false);
  assert.equal("tm_points" in result, false);
  const invalid = createWebRouteClient(config, new FakeHttpTransport(async () => response(route({ dataGo: [{ startTime: 1, endTime: 2, distance: 1, positions: [{ latitude: "49", longitude: "181" }] }] }))));
  await assert.rejects(() => invalid.getVehicleRoute(token, params), EquGpsResponseValidationError);
});

test("invalid parameters and validation errors remain safe", async () => {
  const fake = new FakeHttpTransport(async () => response(mode1()));
  const client = createWebVehicleDetailsClient(config, fake);
  for (const invalid of [{ deviceId: 0, date: params.date }, { deviceId: -1, date: params.date }, { deviceId: 1.5, date: params.date }, { deviceId: 1, date: "2026-08-05T00:00:00Z" }, { deviceId: 1, date: "2026-02-30" }]) {
    await assert.rejects(() => client.getVehicleDayDetails(token, invalid), EquGpsResponseValidationError);
  }
  const failing = createWebVehicleDetailsClient(config, new FakeHttpTransport(async () => response([])));
  await assert.rejects(async () => {
    try { await failing.getVehicleDayDetails(token, params); } catch (error) {
      const serialized = JSON.stringify(error);
      assert.equal(serialized.includes(token), false);
      assert.equal(serialized.includes("2026-08-05"), false);
      assert.equal(serialized.includes("sensitive address"), false);
      throw error;
    }
  }, EquGpsResponseValidationError);
});

test("factories accept injected transport and defaults expose their capability methods", () => {
  const fake = new FakeHttpTransport(async () => response(mode1()));
  assert.equal(typeof createWebVehicleDetailsClient(config, fake).getVehicleDayDetails, "function");
  assert.equal(typeof createWebSpeedEventsClient(config, fake).getExternalSpeedReport, "function");
  assert.equal(typeof createWebRouteClient(config, fake).getVehicleRoute, "function");
  assert.equal(typeof createWebVehicleDetailsClient(config).getVehicleDayDetails, "function");
  assert.equal(typeof createWebSpeedEventsClient(config).getExternalSpeedReport, "function");
  assert.equal(typeof createWebRouteClient(config).getVehicleRoute, "function");
});

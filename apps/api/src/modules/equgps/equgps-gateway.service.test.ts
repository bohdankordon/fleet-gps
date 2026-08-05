import assert from "node:assert/strict";
import test from "node:test";
import { EquGpsNetworkError, SessionTokenProvider, type OfficialEquGpsClient, type SessionToken, type WebRouteClient, type WebRunsClient, type WebSpeedEventsClient, type WebVehicleDetailsClient } from "@taxi-gps/equgps";
import { EquGpsGatewayService } from "./equgps-gateway.service";

const token = "session-token" as SessionToken;
function gateway(options: { createSession?: () => Promise<SessionToken>; onRuns?: () => Promise<readonly { deviceId: number; distanceMeters: number }[]> } = {}) {
  let devices = 0, positions = 0, historical: unknown;
  const official: OfficialEquGpsClient = { createSession: options.createSession ?? (async () => token), getDevices: async () => { devices += 1; return []; }, getLatestPositions: async () => { positions += 1; return []; }, getHistoricalPositions: async (params) => { historical = params; return []; } };
  const runs: WebRunsClient = { getRuns: async () => options.onRuns?.() ?? [] };
  const details: WebVehicleDetailsClient = { getVehicleDayDetails: async (_token, params) => ({ deviceId: params.deviceId, date: params.date, distanceMeters: null, movementDurationSeconds: null, maxSpeedKph: null, trips: [] }) };
  const speed: WebSpeedEventsClient = { getExternalSpeedReport: async (_token, params) => ({ deviceId: params.deviceId, date: params.date, configuredLimitKph: null, maxRecordedSpeedKph: null, events: [] }) };
  const route: WebRouteClient = { getVehicleRoute: async (_token, params) => ({ deviceId: params.deviceId, date: params.date, distanceMeters: null, movementDurationSeconds: null, trips: [], points: [] }) };
  return { service: new EquGpsGatewayService(official, runs, details, speed, route, new SessionTokenProvider(official.createSession)), calls: { get devices() { return devices; }, get positions() { return positions; }, get historical() { return historical; } } };
}

test("gateway calls official capabilities directly and preserves historical params", async () => {
  const item = gateway(); await item.service.getDevices(); await item.service.getLatestPositions(); const params = { deviceId: 3, from: "2026-01-01T00:00:00Z", to: "2026-01-01T01:00:00Z" }; await item.service.getHistoricalPositions(params);
  assert.equal(item.calls.devices, 1); assert.equal(item.calls.positions, 1); assert.equal(item.calls.historical, params);
});
test("gateway obtains and caches the session token internally for web calls", async () => {
  let sessions = 0, seenToken: SessionToken | undefined;
  const item = gateway({ createSession: async () => { sessions += 1; return token; }, onRuns: async () => { seenToken = token; return [{ deviceId: 1, distanceMeters: 1 }]; } });
  const first = await item.service.getRuns(); const second = await item.service.getRuns();
  assert.equal(sessions, 1); assert.deepEqual(first, second); assert.equal(JSON.stringify(first).includes(token), false); assert.equal(seenToken, token);
});
test("gateway delegates each web capability and propagates package errors unchanged", async () => {
  const item = gateway({ onRuns: async () => { throw new EquGpsNetworkError("getRuns"); } });
  await assert.rejects(() => item.service.getRuns(), EquGpsNetworkError);
  assert.deepEqual(await item.service.getVehicleDayDetails({ deviceId: 1, date: "2026-08-05" }), { deviceId: 1, date: "2026-08-05", distanceMeters: null, movementDurationSeconds: null, maxSpeedKph: null, trips: [] });
  assert.equal((await item.service.getExternalSpeedReport({ deviceId: 1, date: "2026-08-05" })).events.length, 0);
  assert.equal((await item.service.getVehicleRoute({ deviceId: 1, date: "2026-08-05" })).points.length, 0);
});
